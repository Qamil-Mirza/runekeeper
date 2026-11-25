/**
 * Lab settings, read from env. Everything fails closed: a missing or
 * malformed value means that part of the Lab is off.
 */

export type AgentRole = "advisor" | "executor";

export const AGENT_ROLES: readonly AgentRole[] = ["advisor", "executor"];

export interface LabSettings {
  /** Users who may see the Lab. null = nobody (unset or malformed). */
  ownerIds: ReadonlySet<string> | null;
  /** SHA-256 hex of each agent role's bearer token. A missing role is off. */
  tokenHashes: Partial<Record<AgentRole, string>>;
  runpodKey: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

const HASH_ENV: Record<AgentRole, string> = {
  advisor: "LAB_ADVISOR_TOKEN_SHA256",
  executor: "LAB_EXECUTOR_TOKEN_SHA256",
};

function parseOwnerIds(raw: string | undefined): ReadonlySet<string> | null {
  if (!raw || !raw.trim()) return null;
  const ids = raw.split(",").map((id) => id.trim().toLowerCase());
  if (!ids.every((id) => UUID_RE.test(id))) return null;
  return new Set(ids);
}

export function loadLabSettings(env: Record<string, string | undefined>): LabSettings {
  const tokenHashes: Partial<Record<AgentRole, string>> = {};
  for (const role of AGENT_ROLES) {
    const value = env[HASH_ENV[role]]?.trim();
    if (value && SHA256_HEX_RE.test(value)) tokenHashes[role] = value;
  }
  return {
    ownerIds: parseOwnerIds(env.LAB_OWNER_USER_IDS),
    tokenHashes,
    runpodKey: env.RUNPOD_API_KEY?.trim() || null,
  };
}

export function isLabOwner(userId: string | null | undefined, s: LabSettings): boolean {
  if (!userId || !s.ownerIds) return false;
  return s.ownerIds.has(userId.toLowerCase());
}
