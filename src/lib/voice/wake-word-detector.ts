import { GoogleGenerativeAI } from "@google/generative-ai";
import { createLogger } from "@/lib/logger";

const log = createLogger("wake-word");

// ─── Tuning constants ──────────────────────────────────────────────────────

/** How many seconds of audio to buffer before sending for transcription. */
const BUFFER_WINDOW_S = 3;

/** Overlap kept from previous window to catch phrases at boundaries (seconds). */
const OVERLAP_S = 0.5;

/** Cooldown after a wake word is detected before another can fire (ms). */
const COOLDOWN_MS = 3000;

/** Wake phrase components (case-insensitive). */
const WAKE_WORDS = ["hey", "oracle"];

// ─── Per-user state ────────────────────────────────────────────────────────

interface WakeWordState {
  chunks: Buffer[];
  /** Total bytes buffered (used to compute duration). */
  bufferedBytes: number;
  /** Sample rate for this user's audio stream. */
  sampleRate: number;
  /** Last time a wake word was detected (cooldown). */
  lastTriggerAt: number;
  /** Prevents overlapping transcription requests. */
  transcribing: boolean;
}

const userStates = new Map<string, WakeWordState>();

function getState(userId: string, sampleRate: number): WakeWordState {
  let state = userStates.get(userId);
  if (!state) {
    state = {
      chunks: [],
      bufferedBytes: 0,
      sampleRate,
      lastTriggerAt: 0,
      transcribing: false,
    };
    userStates.set(userId, state);
  }
  return state;
}

/** Duration of buffered PCM16 audio in seconds. */
function bufferDuration(state: WakeWordState): number {
  // PCM16 = 2 bytes per sample, mono
  return state.bufferedBytes / (2 * state.sampleRate);
}

/**
 * Build a WAV header for PCM16 mono audio.
 */
function makeWavHeader(dataLength: number, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2; // 16-bit mono

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // subchunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  return header;
}

/**
 * Check if transcript contains the wake phrase "Oracle, wake" (fuzzy).
 */
function containsWakePhrase(transcript: string): boolean {
  const lower = transcript.toLowerCase();
  return WAKE_WORDS.every((word) => lower.includes(word));
}

// ─── Gemini client (lazy singleton) ────────────────────────────────────────

let _genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }
  return _genAI;
}

/**
 * Send buffered audio to Gemini Flash for transcription and check for wake phrase.
 */
async function transcribeAndCheck(
  userId: string,
  wavBase64: string,
  onWakeWord: () => void
): Promise<void> {
  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "audio/wav",
          data: wavBase64,
        },
      },
      "Transcribe the audio exactly. Output only the spoken words, nothing else. If there is silence or no speech, output SILENCE.",
    ]);

    const transcript = result.response.text().trim();
    log.debug({ userId, transcript }, "wake word transcription result");

    if (containsWakePhrase(transcript)) {
      const state = userStates.get(userId);
      if (state) {
        const now = Date.now();
        if (now - state.lastTriggerAt >= COOLDOWN_MS) {
          state.lastTriggerAt = now;
          log.info({ userId, transcript }, "wake word detected");
          onWakeWord();
        }
      }
    }
  } catch (err) {
    log.error({ userId, err }, "wake word transcription failed");
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Feed an audio chunk into the wake word detector for a user.
 * When enough audio is buffered (~3s), it sends it to Gemini Flash for
 * transcription and checks for "Oracle, wake".
 *
 * The onWakeWord callback fires asynchronously — this function returns immediately.
 */
export function feedAudio(
  userId: string,
  pcmBuffer: Buffer,
  sampleRate: number,
  onWakeWord: () => void
): void {
  const state = getState(userId, sampleRate);

  state.chunks.push(pcmBuffer);
  state.bufferedBytes += pcmBuffer.length;

  if (bufferDuration(state) < BUFFER_WINDOW_S) {
    return;
  }

  if (state.transcribing) {
    return;
  }

  // Concatenate all buffered chunks into a single PCM blob
  const pcmData = Buffer.concat(state.chunks);

  // Keep overlap for next window (last OVERLAP_S of audio)
  const overlapBytes = Math.floor(OVERLAP_S * sampleRate * 2);
  if (overlapBytes > 0 && pcmData.length > overlapBytes) {
    const overlapChunk = pcmData.subarray(pcmData.length - overlapBytes);
    state.chunks = [Buffer.from(overlapChunk)];
    state.bufferedBytes = overlapChunk.length;
  } else {
    state.chunks = [];
    state.bufferedBytes = 0;
  }

  // Build WAV and send for transcription
  const wavHeader = makeWavHeader(pcmData.length, sampleRate);
  const wav = Buffer.concat([wavHeader, pcmData]);
  const wavBase64 = wav.toString("base64");

  state.transcribing = true;
  transcribeAndCheck(userId, wavBase64, onWakeWord).finally(() => {
    state.transcribing = false;
  });
}

/**
 * Clean up wake word state for a user (called on silence timeout).
 */
export function destroyWakeWordState(userId: string): void {
  userStates.delete(userId);
  log.debug({ userId }, "wake word state destroyed");
}
