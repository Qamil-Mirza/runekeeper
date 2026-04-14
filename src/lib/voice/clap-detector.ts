import { createLogger } from "@/lib/logger";

const log = createLogger("clap-detector");

// ─── Tuning constants ──────────────────────────────────────────────────────

/** Amplitude threshold (0-32768 for 16-bit PCM). Claps are loud impulses. */
const AMPLITUDE_THRESHOLD = 20000;

/** Minimum quiet gap between two claps (ms). Filters out reverb from a single clap. */
const MIN_QUIET_GAP_MS = 100;

/** Max time between two claps, across chunks (ms). */
const MAX_GAP_MS = 3000;

/** Cooldown after a double-clap is detected before another can fire (ms). */
const COOLDOWN_MS = 3000;

// ─── Per-user state ────────────────────────────────────────────────────────

interface ClapState {
  /** Wall-clock time of the first clap (for cross-chunk tracking) */
  firstClapAt: number | null;
  /** Last time a double-clap was detected (cooldown) */
  lastTriggerAt: number;
}

const userStates = new Map<string, ClapState>();

function getState(userId: string): ClapState {
  let state = userStates.get(userId);
  if (!state) {
    state = { firstClapAt: null, lastTriggerAt: 0 };
    userStates.set(userId, state);
  }
  return state;
}

/**
 * Count distinct claps in a PCM16 chunk.
 * A clap = samples crossing AMPLITUDE_THRESHOLD after at least MIN_QUIET_GAP_MS
 * of samples below QUIET_THRESHOLD.
 *
 * Returns array of clap positions as offsets in ms from chunk start.
 */
function findClaps(pcmBuffer: Buffer, sampleRate: number): number[] {
  const numSamples = pcmBuffer.length / 2;
  const samplesPerMs = sampleRate / 1000;
  const minQuietSamples = Math.floor(MIN_QUIET_GAP_MS * samplesPerMs);

  const claps: number[] = [];
  let belowCount = minQuietSamples; // samples below threshold — start high
  let inClap = false;

  for (let i = 0; i < numSamples; i++) {
    const amp = Math.abs(pcmBuffer.readInt16LE(i * 2));

    if (amp >= AMPLITUDE_THRESHOLD) {
      if (!inClap && belowCount >= minQuietSamples) {
        // New clap after sufficient non-loud samples
        claps.push(i / samplesPerMs);
        inClap = true;
      }
      belowCount = 0;
    } else {
      belowCount++;
      inClap = false;
    }
  }

  return claps;
}

/**
 * Analyze a PCM16 buffer for double-clap patterns.
 * Returns true if a double-clap was detected.
 *
 * Detects two distinct loud spikes separated by a quiet gap, either within
 * the same chunk (quick successive claps) or across chunks.
 */
export function detectDoubleClap(
  userId: string,
  pcmBuffer: Buffer,
  sampleRate: number = 16000
): boolean {
  const state = getState(userId);
  const now = Date.now();

  if (now - state.lastTriggerAt < COOLDOWN_MS) {
    return false;
  }

  const claps = findClaps(pcmBuffer, sampleRate);

  // Two claps in the same chunk — immediate trigger
  if (claps.length >= 2) {
    log.info({ userId, gap: Math.round(claps[1] - claps[0]), source: "same-chunk" }, "double-clap detected");
    state.firstClapAt = null;
    state.lastTriggerAt = now;
    return true;
  }

  if (claps.length === 0) {
    // Expire stale first clap
    if (state.firstClapAt !== null && now - state.firstClapAt > MAX_GAP_MS) {
      state.firstClapAt = null;
    }
    return false;
  }

  // Exactly one clap in this chunk
  if (state.firstClapAt === null) {
    state.firstClapAt = now;
    return false;
  }

  // Second clap in a different chunk
  const gapMs = now - state.firstClapAt;
  if (gapMs <= MAX_GAP_MS) {
    log.info({ userId, gap: gapMs, source: "cross-chunk" }, "double-clap detected");
    state.firstClapAt = null;
    state.lastTriggerAt = now;
    return true;
  }

  state.firstClapAt = now;
  return false;
}
