import { readSecretFile, type SecretReader } from "./secrets";

export type LabTransport =
  | { kind: "unix"; socketPath: string }
  | { kind: "tcp"; host: string; port: number };

export interface LabConfig {
  transport: LabTransport;
  token: string;
  /** Runekeeper user ids allowed to use the Lab. Never empty. */
  ownerUserIds: ReadonlySet<string>;
}

export type LabConfigResult =
  | { status: "disabled" }
  | { status: "invalid"; reason: string }
  | { status: "ok"; config: LabConfig };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * `unix:/abs/path/api.sock` (production) or `http://127.0.0.1:<port>` (native
 * dev). TCP is accepted for loopback only: the Lab Manager can start processes
 * on the host, so this client must never be pointed at a remote address.
 */
export function parseManagerUrl(raw: string): LabTransport | null {
  const value = raw.trim();

  if (value.startsWith("unix:")) {
    const socketPath = value.slice("unix:".length);
    if (!socketPath.startsWith("/") || socketPath.includes("\0")) return null;
    return { kind: "unix", socketPath };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:") return null;
  if (!LOOPBACK_HOSTS.has(url.hostname)) return null;
  if (url.pathname !== "/" || url.search || url.hash || url.username) return null;
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { kind: "tcp", host: url.hostname.replace(/^\[|\]$/g, ""), port };
}

/**
 * Parses the owner allowlist. Fails closed: an empty list, or a list with any
 * entry that is not a uuid (e.g. a leftover placeholder), yields null and the
 * Lab is denied to everyone.
 */
export function parseOwnerUserIds(raw: string | undefined): Set<string> | null {
  if (!raw) return null;
  const entries = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (entries.length === 0) return null;
  if (!entries.every((e) => UUID_RE.test(e))) return null;
  return new Set(entries.map((e) => e.toLowerCase()));
}

type Env = Record<string, string | undefined>;

/**
 * - `disabled`: LAB_MANAGER_URL is unset, the feature does not exist.
 * - `invalid`: something is set but unusable; the Lab is denied to everyone.
 */
export function loadLabConfig(
  env: Env = process.env,
  readSecret: SecretReader = readSecretFile
): LabConfigResult {
  const rawUrl = env.LAB_MANAGER_URL;
  if (!rawUrl || rawUrl.trim() === "") return { status: "disabled" };

  const transport = parseManagerUrl(rawUrl);
  if (!transport) {
    return {
      status: "invalid",
      reason:
        "LAB_MANAGER_URL must be unix:/absolute/path or http://127.0.0.1:<port>",
    };
  }

  // The token comes from a file only, never from an environment variable.
  const tokenFile = env.LAB_MANAGER_TOKEN_FILE?.trim();
  if (!tokenFile) {
    return { status: "invalid", reason: "LAB_MANAGER_TOKEN_FILE is not set" };
  }
  const read = readSecret(tokenFile);
  if (!read.ok) {
    return { status: "invalid", reason: `LAB_MANAGER_TOKEN_FILE: ${read.reason}` };
  }
  const token = read.value.trim();
  if (token.length < 32 || /\s/.test(token)) {
    return {
      status: "invalid",
      reason: "LAB_MANAGER_TOKEN_FILE must hold one token of at least 32 characters",
    };
  }

  const ownerUserIds = parseOwnerUserIds(env.LAB_OWNER_USER_IDS);
  if (!ownerUserIds) {
    return {
      status: "invalid",
      reason:
        "LAB_OWNER_USER_IDS must be a comma-separated list of Runekeeper user ids (uuids)",
    };
  }

  return { status: "ok", config: { transport, token, ownerUserIds } };
}

export function isLabOwner(
  userId: string | null | undefined,
  config: Pick<LabConfig, "ownerUserIds">
): boolean {
  if (!userId) return false;
  return config.ownerUserIds.has(userId.toLowerCase());
}
