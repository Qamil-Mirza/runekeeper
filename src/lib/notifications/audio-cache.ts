import { randomBytes } from "crypto";

/**
 * Tiny in-memory store for freshly-synthesized call audio. A Goggins call works
 * by handing Twilio a public URL it fetches a few seconds later; rather than
 * persist the MP3 to disk or DB, we hold it here under an unguessable token with
 * a short TTL. Single server process + low personal volume make this sufficient
 * (audio is lost on restart, which only matters mid-call — acceptable).
 */

const TTL_MS = 10 * 60_000; // 10 minutes — ample for Twilio to fetch the audio

interface Entry {
  buffer: Buffer;
  expiresAt: number;
}

const store = new Map<string, Entry>();

/** Drop expired entries so the map can't grow unbounded. */
function evictExpired(now: number): void {
  for (const [token, entry] of store) {
    if (entry.expiresAt <= now) store.delete(token);
  }
}

/** Stores audio and returns an unguessable token to retrieve it. */
export function putAudio(buffer: Buffer): string {
  const now = Date.now();
  evictExpired(now);
  const token = randomBytes(24).toString("hex");
  store.set(token, { buffer, expiresAt: now + TTL_MS });
  return token;
}

/** Returns the audio for a token, or `null` if missing/expired. */
export function getAudio(token: string): Buffer | null {
  const entry = store.get(token);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(token);
    return null;
  }
  return entry.buffer;
}
