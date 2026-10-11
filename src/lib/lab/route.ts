import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { isLabOwner, loadLabConfig, type LabConfig } from "./config";
import {
  LabManagerError,
  isValidIdempotencyKey,
  type LabActor,
} from "./manager";
import type { SecretReader } from "./secrets";
import type { LabClientErrorCode, LabErrorBody } from "./types";

const log = createLogger("lab");

const mutationLimiter = rateLimit({ key: "lab-mutation", limit: 30, windowMs: 60_000 });

export interface LabRouteContext {
  config: LabConfig;
  actor: LabActor;
  /** Present on mutating requests. */
  idempotencyKey: string;
}

export function labError(
  status: number,
  code: LabClientErrorCode,
  message: string,
  retryable = false,
  details?: Record<string, unknown>
) {
  const body: LabErrorBody = {
    error: { code, message, retryable, ...(details ? { details } : {}) },
  };
  return NextResponse.json(body, { status });
}

// The same answer for "feature off", "misconfigured", "signed out" and "not an
// owner", so nothing about the Lab is visible to anyone else.
function notFound() {
  return labError(404, "not_found", "Not found");
}

/**
 * A browser always sends Origin on a cross-site POST, and on same-origin
 * fetch POSTs too. Requiring it to match our own host blocks cross-site
 * requests that would otherwise ride the session cookie.
 */
export function isSameOrigin(
  headers: Headers,
  env: Record<string, string | undefined> = process.env
): boolean {
  const origin = headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  const allowed = new Set<string>();
  const host = headers.get("host");
  if (host) allowed.add(host);
  if (env.NEXTAUTH_URL) {
    try {
      allowed.add(new URL(env.NEXTAUTH_URL).host);
    } catch {
      // ignore a malformed NEXTAUTH_URL; the Host header still applies
    }
  }
  return allowed.has(originHost);
}

export interface LabRouteDeps {
  getUser: () => Promise<{ id: string; email: string } | null>;
  env: Record<string, string | undefined>;
  /** Overridden in tests; defaults to reading the real file. */
  readSecret?: SecretReader;
}

// Loaded on first use so this module can be imported without the database.
const defaultDeps: LabRouteDeps = {
  getUser: async () => (await import("@/lib/api-helpers")).getAuthenticatedUser(),
  env: process.env,
};

/**
 * Wraps every /api/lab route: feature switch, session, owner allowlist, and
 * for mutations the origin check, idempotency key and rate limit.
 */
export async function withLabOwner(
  req: Request,
  handler: (ctx: LabRouteContext) => Promise<Response>,
  deps: LabRouteDeps = defaultDeps
): Promise<Response> {
  const loaded = loadLabConfig(deps.env, deps.readSecret);
  if (loaded.status === "disabled") return notFound();
  if (loaded.status === "invalid") {
    log.error({ reason: loaded.reason }, "lab config invalid; denying all access");
    return notFound();
  }
  const { config } = loaded;

  const user = await deps.getUser();
  if (!user || !isLabOwner(user.id, config)) return notFound();

  let idempotencyKey = "";
  if (req.method !== "GET") {
    if (!isSameOrigin(req.headers, deps.env)) {
      log.warn({ userId: user.id }, "lab mutation rejected: origin mismatch");
      return labError(403, "forbidden_origin", "Cross-origin request refused");
    }
    const key = req.headers.get("idempotency-key");
    if (!isValidIdempotencyKey(key)) {
      return labError(400, "validation_failed", "Missing or invalid Idempotency-Key");
    }
    idempotencyKey = key;
    if (!mutationLimiter.check(user.id).success) {
      return labError(429, "rate_limited", "Too many Lab actions; try again shortly", true);
    }
  }

  try {
    return await handler({
      config,
      actor: { id: user.id, email: user.email },
      idempotencyKey,
    });
  } catch (err) {
    if (err instanceof LabManagerError) {
      if (err.code === "manager_unreachable" || err.status >= 500) {
        log.warn({ code: err.code, status: err.status }, err.message);
      }
      return labError(err.status, err.code, err.message, err.retryable, err.details);
    }
    log.error({ err }, "unexpected lab route failure");
    return labError(500, "internal_error", "Unexpected error");
  }
}

/** Parses a JSON object body; returns null when it is not one. */
export async function readJsonObject(
  req: Request
): Promise<Record<string, unknown> | null> {
  if (!req.headers.get("content-type")?.includes("application/json")) return null;
  try {
    const body: unknown = await req.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}
