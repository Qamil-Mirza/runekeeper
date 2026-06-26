import { randomBytes } from "crypto";
import { mkdir, readFile, writeFile, readdir, stat, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createLogger } from "@/lib/logger";

const log = createLogger("audio-cache");

/**
 * Short-lived store for freshly-synthesized Goggins call audio. A call works by
 * handing Twilio a public URL it fetches a few seconds later; we stash the MP3
 * here under an unguessable token with a short TTL, then serve it from the audio
 * route. Security is the unguessable token + short TTL.
 *
 * This MUST be backed by the filesystem, not an in-memory Map. The audio is
 * written either by the scheduler (bundled into server.ts via esbuild) or by the
 * test API route (Next.js bundle), but it is always *read* by the audio route
 * (Next.js bundle). Those are separate module instances even though they share a
 * single process, so a module-level Map populated on one side is invisible on
 * the other — Twilio then fetches an empty cache, gets a 404/non-audio response,
 * and plays "an application error has occurred" (Twilio errors 11200 / 12300). A
 * file on the shared container filesystem is visible to every bundle, so put and
 * get agree. (For a multi-instance deployment this should move to Postgres/Redis.)
 */

const TTL_MS = 10 * 60_000; // 10 minutes — ample for Twilio to fetch the audio
const DIR = join(tmpdir(), "runekeeper-goggins-audio");
const TOKEN_RE = /^[a-f0-9]{48}$/; // 24 random bytes as hex; also blocks path traversal

/** Delete cached files past their TTL so the directory can't grow unbounded. */
async function evictExpired(): Promise<void> {
  let names: string[];
  try {
    names = await readdir(DIR);
  } catch {
    return; // directory not created yet — nothing to evict
  }
  const cutoff = Date.now() - TTL_MS;
  await Promise.all(
    names.map(async (name) => {
      try {
        const path = join(DIR, name);
        const s = await stat(path);
        if (s.mtimeMs < cutoff) await unlink(path);
      } catch {
        // racing another evict/read — ignore
      }
    })
  );
}

/** Stores audio and returns an unguessable token to retrieve it. */
export async function putAudio(buffer: Buffer): Promise<string> {
  await mkdir(DIR, { recursive: true });
  await evictExpired();
  const token = randomBytes(24).toString("hex");
  await writeFile(join(DIR, `${token}.mp3`), buffer);
  log.debug({ token: token.slice(0, 8), bytes: buffer.length, dir: DIR }, "audio stored");
  return token;
}

/** Returns the audio for a token, or `null` if missing/expired/malformed. */
export async function getAudio(token: string): Promise<Buffer | null> {
  if (!TOKEN_RE.test(token)) {
    log.warn({ token: token.slice(0, 8) }, "audio fetch with malformed token");
    return null;
  }
  const path = join(DIR, `${token}.mp3`);
  try {
    const s = await stat(path);
    if (s.mtimeMs < Date.now() - TTL_MS) {
      await unlink(path).catch(() => {});
      log.debug({ token: token.slice(0, 8) }, "audio expired");
      return null;
    }
    const buf = await readFile(path);
    log.debug({ token: token.slice(0, 8), bytes: buf.length }, "audio served");
    return buf;
  } catch {
    log.warn({ token: token.slice(0, 8), dir: DIR }, "audio not found");
    return null;
  }
}
