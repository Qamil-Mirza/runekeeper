import { createLogger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { agentRoleFor, cameThroughProxy } from "./agent-auth";
import { isLabOwner, loadLabSettings, type AgentRole, type LabSettings } from "./settings";

const log = createLogger("lab");

type Env = Record<string, string | undefined>;

export interface OwnerDeps {
  getUser?: () => Promise<{ id: string } | null>;
  env?: Env;
}

export interface AgentDeps {
  env?: Env;
}

const ownerLimiter = rateLimit({ key: "lab-owner", limit: 30, windowMs: 60_000 });
const agentLimiter = rateLimit({ key: "lab-agent", limit: 120, windowMs: 60_000 });

export function labError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

const notFound = () => labError(404, "not_found", "Not found");

async function defaultGetUser(): Promise<{ id: string } | null> {
  // Lazy so importing this module does not load the database.
  const { getAuthenticatedUser } = await import("@/lib/api-helpers");
  return getAuthenticatedUser();
}

function hostOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function isSameOrigin(req: Request, env: Env): boolean {
  const origin = hostOf(req.headers.get("origin"));
  if (!origin) return false;
  return origin === req.headers.get("host") || origin === hostOf(env.NEXTAUTH_URL);
}

async function run(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    log.error({ err }, "lab route failed");
    return labError(500, "internal", "Something went wrong");
  }
}

/**
 * Owner-only route. Anyone not in LAB_OWNER_USER_IDS gets 404. Writes also
 * need a same-origin request and are rate limited per user.
 */
export async function withOwner(
  req: Request,
  handler: (ctx: { userId: string; settings: LabSettings }) => Promise<Response>,
  deps: OwnerDeps = {},
): Promise<Response> {
  const env = deps.env ?? process.env;
  const settings = loadLabSettings(env);
  if (!settings.ownerIds) return notFound();

  const user = await (deps.getUser ?? defaultGetUser)();
  if (!user || !isLabOwner(user.id, settings)) return notFound();

  if (req.method !== "GET" && req.method !== "HEAD") {
    if (!isSameOrigin(req, env)) return labError(403, "bad_origin", "Cross-origin request refused");
    if (!ownerLimiter.check(user.id).success) {
      return labError(429, "rate_limited", "Too many requests");
    }
  }

  return run(() => handler({ userId: user.id, settings }));
}

/**
 * Agent route, authenticated by a role's bearer token. Only for callers on
 * the host itself: requests that came through a proxy are refused.
 */
export async function withAgent(
  req: Request,
  roles: AgentRole[],
  handler: (ctx: { role: AgentRole; settings: LabSettings }) => Promise<Response>,
  deps: AgentDeps = {},
): Promise<Response> {
  const settings = loadLabSettings(deps.env ?? process.env);
  if (Object.keys(settings.tokenHashes).length === 0) return notFound();

  if (cameThroughProxy(req.headers)) {
    return labError(403, "proxied", "Agent routes are only reachable from the host");
  }

  const role = agentRoleFor(req.headers, settings);
  if (!role) return labError(401, "unauthorized", "Missing or invalid token");
  if (!roles.includes(role)) return labError(403, "wrong_role", `Not allowed for ${role}`);

  if (!agentLimiter.check(role).success) return labError(429, "rate_limited", "Too many requests");

  return run(() => handler({ role, settings }));
}
