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

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/** Hostname of a Host-style value: strips the port, unwraps `[::1]`. */
function hostnameOf(value: string): string {
  const v = value.trim().toLowerCase();
  if (v.startsWith("[")) {
    const end = v.indexOf("]");
    return end === -1 ? v : v.slice(1, end);
  }
  // One colon means host:port; more means a bare IPv6 address.
  const parts = v.split(":");
  return parts.length === 2 ? parts[0] : v;
}

/**
 * True when the request came through a reverse proxy (the public HTTPS
 * origin). Next.js itself fills in x-forwarded-for/-host/-proto on every
 * request (local: proto "http", host = the Host header), so only signals it
 * never adds count: a `forwarded` header, any `tailscale-*` header, a proto
 * other than plain http, or a forwarded host that is not loopback.
 * x-forwarded-for is ignored: Next sets it and Docker makes local traffic
 * non-loopback anyway.
 */
export function cameThroughProxy(headers: Headers): boolean {
  for (const name of headers.keys()) {
    const lower = name.toLowerCase();
    if (lower === "forwarded" || lower.startsWith("tailscale-")) return true;
  }

  const proto = headers.get("x-forwarded-proto");
  if (proto !== null && proto !== "http") return true;

  const host = headers.get("x-forwarded-host");
  if (host !== null && host.split(",").some((h) => !LOOPBACK_HOSTS.has(hostnameOf(h)))) {
    return true;
  }
  return false;
}
