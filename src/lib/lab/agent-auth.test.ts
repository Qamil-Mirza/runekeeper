import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadLabSettings } from "./settings";
import { agentRoleFor, cameThroughProxy } from "./agent-auth";
import { withAgent, withOwner } from "./route";

const OWNER = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const OTHER = "11111111-2222-4333-8444-555555555555";
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

const env = {
  LAB_OWNER_USER_IDS: OWNER,
  LAB_ADVISOR_TOKEN_SHA256: hash("t1"),
  LAB_EXECUTOR_TOKEN_SHA256: hash("t2"),
  NEXTAUTH_URL: "https://app.example.test",
};
const settings = loadLabSettings(env);
const ok = async () => Response.json({ ok: true });

test("agentRoleFor maps a bearer token to its role", () => {
  assert.equal(agentRoleFor(new Headers({ authorization: "Bearer t1" }), settings), "advisor");
  assert.equal(agentRoleFor(new Headers({ authorization: "Bearer t2" }), settings), "executor");
});

test("agentRoleFor is null for a wrong, missing or non-bearer token", () => {
  assert.equal(agentRoleFor(new Headers({ authorization: "Bearer nope" }), settings), null);
  assert.equal(agentRoleFor(new Headers(), settings), null);
  assert.equal(agentRoleFor(new Headers({ authorization: "Basic dDE=" }), settings), null);
  assert.equal(agentRoleFor(new Headers({ authorization: "Bearer " }), settings), null);
  assert.equal(agentRoleFor(new Headers({ authorization: "t1" }), settings), null);
});

test("agentRoleFor refuses a token configured for both roles", () => {
  const both = loadLabSettings({
    LAB_ADVISOR_TOKEN_SHA256: hash("t1"),
    LAB_EXECUTOR_TOKEN_SHA256: hash("t1"),
  });
  assert.equal(agentRoleFor(new Headers({ authorization: "Bearer t1" }), both), null);
});

test("cameThroughProxy spots forwarding headers, any case", () => {
  for (const name of [
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "forwarded",
    "tailscale-user-login",
    "tailscale-funnel-request",
  ]) {
    assert.equal(cameThroughProxy(new Headers({ [name]: "1" })), true, name);
    assert.equal(cameThroughProxy(new Headers({ [name.toUpperCase()]: "1" })), true, name.toUpperCase());
  }
  assert.equal(cameThroughProxy(new Headers({ "Tailscale-Anything": "x" })), true);
  assert.equal(cameThroughProxy(new Headers()), false);
  assert.equal(cameThroughProxy(new Headers({ host: "127.0.0.1:3000", authorization: "Bearer t1" })), false);
});

function agentReq(token: string | null, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("http://127.0.0.1:3000/api/lab/agent/x", { method: "POST", headers });
}

async function errorCode(res: Response) {
  const body = (await res.json()) as { error: { code: string; message: string } };
  assert.equal(typeof body.error.message, "string");
  return body.error.code;
}

test("withAgent lets the right role through", async () => {
  let seen: string | null = null;
  const res = await withAgent(agentReq("t1"), ["advisor"], async ({ role }) => {
    seen = role;
    return ok();
  }, { env });
  assert.equal(res.status, 200);
  assert.equal(seen, "advisor");
});

test("withAgent is 404 when no token hash is configured", async () => {
  const res = await withAgent(agentReq("t1"), ["advisor"], ok, { env: { LAB_OWNER_USER_IDS: OWNER } });
  assert.equal(res.status, 404);
});

test("withAgent refuses a valid token that came through a proxy", async () => {
  const res = await withAgent(agentReq("t1", { "x-forwarded-for": "203.0.113.7" }), ["advisor"], ok, { env });
  assert.equal(res.status, 403);
  assert.equal(await errorCode(res), "proxied");
});

test("withAgent is 401 on a bad or missing token", async () => {
  assert.equal((await withAgent(agentReq("bad"), ["advisor"], ok, { env })).status, 401);
  assert.equal((await withAgent(agentReq(null), ["advisor"], ok, { env })).status, 401);
});

test("withAgent is 403 wrong_role for the other role's token", async () => {
  const res = await withAgent(agentReq("t2"), ["advisor"], ok, { env });
  assert.equal(res.status, 403);
  assert.equal(await errorCode(res), "wrong_role");
});

function ownerReq(method: string, headers: Record<string, string> = {}) {
  return new Request("https://app.example.test/api/lab/x", { method, headers });
}
const asUser = (id: string | null) => ({ env, getUser: async () => (id ? { id } : null) });

test("withOwner is 404 for a non-owner, no user, or no owner list", async () => {
  assert.equal((await withOwner(ownerReq("GET"), ok, asUser(OTHER))).status, 404);
  assert.equal((await withOwner(ownerReq("GET"), ok, asUser(null))).status, 404);
  const noList = { env: { NEXTAUTH_URL: env.NEXTAUTH_URL }, getUser: async () => ({ id: OWNER }) };
  assert.equal((await withOwner(ownerReq("GET"), ok, noList)).status, 404);
});

test("withOwner lets the owner GET through", async () => {
  let seen: string | null = null;
  const res = await withOwner(ownerReq("GET"), async ({ userId }) => {
    seen = userId;
    return ok();
  }, asUser(OWNER));
  assert.equal(res.status, 200);
  assert.equal(seen, OWNER);
});

test("withOwner refuses an owner POST without a matching Origin", async () => {
  const missing = await withOwner(ownerReq("POST", { host: "app.example.test" }), ok, asUser(OWNER));
  assert.equal(missing.status, 403);
  const foreign = await withOwner(
    ownerReq("POST", { host: "app.example.test", origin: "https://evil.example" }),
    ok,
    asUser(OWNER),
  );
  assert.equal(foreign.status, 403);
  const opaque = await withOwner(ownerReq("POST", { origin: "null" }), ok, asUser(OWNER));
  assert.equal(opaque.status, 403);
});

test("withOwner accepts an owner POST whose Origin matches Host or NEXTAUTH_URL", async () => {
  const byHost = await withOwner(
    ownerReq("POST", { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }),
    ok,
    asUser(OWNER),
  );
  assert.equal(byHost.status, 200);
  const byAuthUrl = await withOwner(
    ownerReq("POST", { host: "127.0.0.1:3000", origin: "https://app.example.test" }),
    ok,
    asUser(OWNER),
  );
  assert.equal(byAuthUrl.status, 200);
});
