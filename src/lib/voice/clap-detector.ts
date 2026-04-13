import { createLogger } from "@/lib/logger";

const log = createLogger("clap-detector");

// ─── Tuning constants ──────────────────────────────────────────────────────

/** Amplitude threshold (0-32768 for 16-bit PCM). Claps are loud impulses. */
const AMPLITUDE_THRESHOLD = 12000;

/** A clap must not last longer than this (ms). Distinguishes from speech. */
const MAX_CLAP_DURATION_MS = 80;

/** Minimum silence between two claps (ms). */
const MIN_GAP_MS = 150;

/** Maximum gap between two claps to count as a double-clap (ms). */
const MAX_GAP_MS = 800;

/** Cooldown after a double-clap is detected before another can fire (ms). */
const COOLDOWN_MS = 2000;

// ─── Per-user state ────────────────────────────────────────────────────────

interface ClapState {
  /** Timestamp of the first clap in a potential double-clap */
  firstClapAt: number | null;
  /** Whether we're currently inside a loud spike */
  inSpike: boolean;
  /** When the current spike started */
  spikeStartAt: number | null;
  /** Last time a double-clap was detected (cooldown) */
  lastTriggerAt: number;
}

const userStates = new Map<string, ClapState>();

function getState(userId: string): ClapState {
  let state = userStates.get(userId);
  if (!state) {
    state = { firstClapAt: null, inSpike: false, spikeStartAt: null, lastTriggerAt: 0 };
    userStates.set(userId, state);
  }
  return state;
}

/**
 * Analyze a PCM16 buffer for double-clap patterns.
 * Returns true if a double-clap was detected.
 *
 * @param userId - User ID for per-user state tracking
 * @param pcmBuffer - Raw PCM16 little-endian audio buffer
 * @param sampleRate - Sample rate in Hz (default 16000)
 */
export function detectDoubleClap(
  userId: string,
  pcmBuffer: Buffer,
  sampleRate: number = 16000
): boolean {
  const state = getState(userId);
  const now = Date.now();

  // In cooldown — skip detection
  if (now - state.lastTriggerAt < COOLDOWN_MS) {
    return false;
  }

  const samplesPerMs = sampleRate / 1000;
  const numSamples = pcmBuffer.length / 2; // 16-bit = 2 bytes per sample
  const chunkDurationMs = numSamples / samplesPerMs;

  // Scan samples for amplitude spikes
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.abs(pcmBuffer.readInt16LE(i * 2));
    const sampleTimeMs = now - chunkDurationMs + (i / samplesPerMs);

    if (sample >= AMPLITUDE_THRESHOLD) {
      if (!state.inSpike) {
        // Start of a new spike
        state.inSpike = true;
        state.spikeStartAt = sampleTimeMs;
      }
    } else if (state.inSpike) {
      // End of spike — check if it was short enough to be a clap
      const spikeDuration = sampleTimeMs - (state.spikeStartAt ?? sampleTimeMs);
      state.inSpike = false;

      if (spikeDuration <= MAX_CLAP_DURATION_MS) {
        // This is a clap!
        if (state.firstClapAt === null) {
          // First clap
          state.firstClapAt = sampleTimeMs;
        } else {
          // Potential second clap — check gap
          const gap = sampleTimeMs - state.firstClapAt;

          if (gap >= MIN_GAP_MS && gap <= MAX_GAP_MS) {
            // Double clap detected!
            log.info({ userId, gap: Math.round(gap) }, "double-clap detected");
            state.firstClapAt = null;
            state.lastTriggerAt = now;
            return true;
          } else if (gap > MAX_GAP_MS) {
            // Too slow — treat this as a new first clap
            state.firstClapAt = sampleTimeMs;
          }
          // If gap < MIN_GAP_MS, ignore (probably same clap reverb)
        }
      } else {
        // Spike too long — not a clap, reset
        state.firstClapAt = null;
      }

      state.spikeStartAt = null;
    }
  }

  // Expire stale first clap
  if (state.firstClapAt !== null && now - state.firstClapAt > MAX_GAP_MS) {
    state.firstClapAt = null;
  }

  return false;
}
