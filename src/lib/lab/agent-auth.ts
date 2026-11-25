import { createHash, timingSafeEqual } from "node:crypto";
import { AGENT_ROLES, type AgentRole, type LabSettings } from "./settings";

/**
 * The role whose token the request carries, or null. The bearer token is
 * hashed and compared in constant time against every configured hash; a
 * token that matches more than one role is refused as ambiguous.
 */
export function agentRoleFor(headers: Headers, s: LabSettings): AgentRole | null {
  const match = /^Bearer\s+(\S+)$/i.exec(headers.get("authorization")?.trim() ?? "");
  if (!match) return null;
  const digest = createHash("sha256").update(match[1], "utf8").digest();

  // Compare against every role (no early exit) so timing does not reveal which matched.
  const matches = AGENT_ROLES.filter((role) => {
    const hash = s.tokenHashes[role];
    return hash !== undefined && timingSafeEqual(digest, Buffer.from(hash, "hex"));
  });
  return matches.length === 1 ? matches[0] : null;
}

const FORWARDING_HEADERS = new Set([
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "forwarded",
]);

/** True when the request carries headers a reverse proxy adds. */
export function cameThroughProxy(headers: Headers): boolean {
  for (const name of headers.keys()) {
    const lower = name.toLowerCase();
    if (FORWARDING_HEADERS.has(lower) || lower.startsWith("tailscale-")) return true;
  }
  return false;
}
