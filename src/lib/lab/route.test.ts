import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextResponse } from "next/server";
import { isSameOrigin, withLabOwner, type LabRouteContext, type LabRouteDeps } from "./route";
import { LabManagerError } from "./manager";

const OWNER = { id: "3f2b8c1e-6a4d-4e0b-9c57-0d1e2f3a4b5c", email: "owner@example.test" };
const STRANGER = { id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", email: "other@example.test" };
const TOKEN = "t".repeat(48);
const ORIGIN = "https://keeper.example.test";

const ENV = {
  LAB_MANAGER_URL: "unix:/run/lab-manager/api.sock",
  LAB_MANAGER_TOKEN_FILE: "/run/secrets/service-token",
  LAB_OWNER_USER_IDS: OWNER.id,
  NEXTAUTH_URL: ORIGIN,
};

function deps(overrides: {
  user?: { id: string; email: string } | null;
  env?: Record<string, string | undefined>;
  secret?: LabRouteDeps["readSecret"];
} = {}): LabRouteDeps {
  return {
    getUser: async () => (overrides.user === undefined ? OWNER : overrides.user),
    env: { ...ENV, ...overrides.env },
    readSecret: overrides.secret ?? (() => ({ ok: true, value: `${TOKEN}\n` })),
  };
}

function get() {
  return new Request(`${ORIGIN}/api/lab/status`);
}

function post(headers: Record<string, string | null> = {}) {
  const merged: Record<string, string | null> = {
    origin: ORIGIN,
    host: "keeper.example.test",
    "idempotency-key": "idem-key-0001",
    "content-type": "application/json",
    ...headers,
  };
  const h = new Headers();
  for (const [k, v] of Object.entries(merged)) if (v !== null) h.set(k, v);
  return new Request(`${ORIGIN}/api/lab/labs/lab_1/start`, { method: "POST", headers: h, body: "{}" });
}

function recorder() {
  const calls: LabRouteContext[] = [];
  const handler = async (ctx: LabRouteContext) => {
    calls.push(ctx);
    return NextResponse.json({ ok: true });
  };
  return { calls, handler };
}

describe("withLabOwner: who gets in", () => {
  it("lets a listed owner through with their identity as the actor", async () => {
    const { calls, handler } = recorder();
    const res = await withLabOwner(get(), handler, deps());
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].actor, OWNER);
  });

  const denied: [string, Parameters<typeof deps>[0]][] = [
    ["a signed-out visitor", { user: null }],
    ["a signed-in non-owner", { user: STRANGER }],
    ["everyone when the feature is off", { env: { LAB_MANAGER_URL: undefined } }],
    ["the owner when the allowlist is missing", { env: { LAB_OWNER_USER_IDS: undefined } }],
    ["the owner when the allowlist is a placeholder", { env: { LAB_OWNER_USER_IDS: "<runekeeper-user-uuid>" } }],
    ["the owner when one allowlist entry is malformed", { env: { LAB_OWNER_USER_IDS: `${OWNER.id},oops` } }],
    ["the owner when no token file is configured", { env: { LAB_MANAGER_TOKEN_FILE: undefined } }],
    ["the owner when the token file is unreadable", { secret: () => ({ ok: false, reason: "EACCES" }) }],
    ["the owner when the token file is group-readable", { secret: () => ({ ok: false, reason: "mode 640" }) }],
    ["the owner when the manager url is not local", { env: { LAB_MANAGER_URL: "http://10.0.0.5:7717" } }],
  ];
  for (const [name, overrides] of denied) {
    it(`answers 404 to ${name}`, async () => {
      const { calls, handler } = recorder();
      for (const req of [get(), post()]) {
        const res = await withLabOwner(req, handler, deps(overrides));
        assert.equal(res.status, 404);
      }
      assert.equal(calls.length, 0);
    });
  }
});

describe("withLabOwner: mutations", () => {
  it("accepts a same-origin POST with an idempotency key", async () => {
    const { calls, handler } = recorder();
    const res = await withLabOwner(post(), handler, deps());
    assert.equal(res.status, 200);
    assert.equal(calls[0].idempotencyKey, "idem-key-0001");
  });

  const badOrigins: [string, Record<string, string | null>][] = [
    ["a foreign origin", { origin: "https://evil.example" }],
    ["a malformed origin", { origin: "null" }],
    ["no Origin header", { origin: null }],
  ];
  for (const [name, headers] of badOrigins) {
    it(`refuses a POST with ${name}`, async () => {
      const { calls, handler } = recorder();
      const res = await withLabOwner(post(headers), handler, deps());
      assert.equal(res.status, 403);
      assert.equal((await res.json()).error.code, "forbidden_origin");
      assert.equal(calls.length, 0);
    });
  }

  it("refuses a POST without a valid idempotency key", async () => {
    const { calls, handler } = recorder();
    const res = await withLabOwner(post({ "idempotency-key": "short" }), handler, deps());
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  });
});

describe("withLabOwner: failures", () => {
  it("passes a manager error through with its status and code", async () => {
    const res = await withLabOwner(
      get(),
      async () => {
        throw new LabManagerError(409, "agent_busy", "Agent is busy", false);
      },
      deps()
    );
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), {
      error: { code: "agent_busy", message: "Agent is busy", retryable: false },
    });
  });

  it("reports an unreachable manager as 503 and retryable", async () => {
    const res = await withLabOwner(
      get(),
      async () => {
        throw new LabManagerError(503, "manager_unreachable", "Lab Manager unreachable (ENOENT)", true);
      },
      deps()
    );
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error.retryable, true);
  });

  it("hides unexpected errors and never leaks the token", async () => {
    const res = await withLabOwner(
      get(),
      async () => {
        throw new Error(`boom ${TOKEN}`);
      },
      deps()
    );
    const text = await res.text();
    assert.equal(res.status, 500);
    assert.ok(!text.includes(TOKEN));
  });
});

describe("isSameOrigin", () => {
  const env = { NEXTAUTH_URL: ORIGIN };

  it("accepts the configured public origin and the request host", () => {
    assert.equal(isSameOrigin(new Headers({ origin: ORIGIN }), env), true);
    assert.equal(
      isSameOrigin(new Headers({ origin: "http://localhost:3000", host: "localhost:3000" }), {}),
      true
    );
  });

  it("rejects other origins and a missing header", () => {
    assert.equal(
      isSameOrigin(new Headers({ origin: "https://evil.example", host: "keeper.example.test" }), env),
      false
    );
    assert.equal(isSameOrigin(new Headers({ host: "keeper.example.test" }), env), false);
  });
});
