import { readFileSync, statSync } from "fs";

export type SecretRead =
  | { ok: true; value: string }
  | { ok: false; reason: string };

export type SecretReader = (path: string) => SecretRead;

const MAX_SECRET_BYTES = 16 * 1024;

/**
 * Reads a secret from a file. Lab secrets are never taken from environment
 * variables: a process's environment is readable through /proc by a matching
 * identity and through `docker inspect` by the docker group.
 *
 * Refuses a file that group or other can read, like ssh does for private
 * keys, so a mis-provisioned secret fails closed instead of working quietly.
 * The file is read on every call: replacing it rotates the secret without a
 * restart.
 */
export const readSecretFile: SecretReader = (path) => {
  if (!path.startsWith("/")) return { ok: false, reason: "path must be absolute" };
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return { ok: false, reason: "not a regular file" };
    if ((stat.mode & 0o077) !== 0) {
      return {
        ok: false,
        reason: `mode ${(stat.mode & 0o777).toString(8)} is readable by group or other; expected 400 or 600`,
      };
    }
    if (stat.size > MAX_SECRET_BYTES) return { ok: false, reason: "file is too large" };
    return { ok: true, value: readFileSync(path, "utf8") };
  } catch (err) {
    return { ok: false, reason: (err as NodeJS.ErrnoException).code ?? "unreadable" };
  }
};
