import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRunpodClient, getRunpodSnapshot, RunpodError, _resetRunpodCache } from "./runpod";

type Call = { url: URL; init: RequestInit | undefined };

function fakeFetch(handler: (url: URL) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push({ url, init });
    const { status = 200, body } = handler(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { impl, calls };
}

const authOf = (c: Call) => new Headers(c.init?.headers).get("authorization");
const methodOf = (c: Call) => (c.init?.method ?? "GET").toUpperCase();

beforeEach(() => _resetRunpodCache());

test("pods(): sends the bearer key, parses cost into costPerHr, follows the cursor", async () => {
  const { impl, calls } = fakeFetch((url) => {
    if (url.searchParams.get("cursor") === "c2") {
      return {
        body: {
          pagination: { hasNextPage: false, nextCursor: null },
          pods: [{ id: "p2", name: "two", status: "EXITED", cost: 0.02, startedAt: null }],
        },
      };
    }
    return {
      body: {
        pagination: { hasNextPage: true, nextCursor: "c2" },
        pods: [
          { id: "p1", name: "one", status: "RUNNING", cost: 0.69, startedAt: "2026-11-24T09:00:00Z" },
        ],
      },
    };
  });
  const client = createRunpodClient("k", impl);
  const pods = await client.pods();
  assert.deepEqual(pods, [
    { id: "p1", name: "one", status: "RUNNING", costPerHr: 0.69, startedAt: new Date("2026-11-24T09:00:00Z") },
    { id: "p2", name: "two", status: "EXITED", costPerHr: 0.02, startedAt: null },
  ]);
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.equal(c.url.origin + c.url.pathname, "https://api.runpod.io/v2/pods");
    assert.equal(authOf(c), "Bearer k");
    assert.equal(methodOf(c), "GET");
  }
});

test("accountHours() and podHours(): hourly buckets with both startTime and endTime", async () => {
  const { impl, calls } = fakeFetch((url) => {
    if (url.pathname.endsWith("/billing/pods")) {
      return {
        body: {
          metadata: {},
          records: [
            {
              podId: "p1",
              startTime: "2026-11-24T08:00:00Z",
              endTime: "2026-11-24T09:00:00Z",
              totalAmount: 0.7,
              gpuAmount: 0.69,
              diskAmount: 0.01,
              cpuAmount: 0,
            },
          ],
        },
      };
    }
    return {
      body: {
        metadata: {},
        records: [
          { startTime: "2026-11-24T08:00:00Z", endTime: "2026-11-24T09:00:00Z", totalAmount: 1.25, podGpuAmount: 1.2 },
        ],
      },
    };
  });
  const client = createRunpodClient("k", impl);
  const start = new Date("2026-11-24T08:00:00Z");
  const end = new Date("2026-11-24T10:30:00Z");
  const account = await client.accountHours(start, end);
  const perPod = await client.podHours(start, end);
  assert.deepEqual(account, [
    { startTime: new Date("2026-11-24T08:00:00Z"), endTime: new Date("2026-11-24T09:00:00Z"), totalAmount: 1.25 },
  ]);
  assert.deepEqual(perPod, [
    {
      startTime: new Date("2026-11-24T08:00:00Z"),
      endTime: new Date("2026-11-24T09:00:00Z"),
      totalAmount: 0.7,
      podId: "p1",
    },
  ]);
  assert.deepEqual(
    calls.map((c) => c.url.pathname),
    ["/v2/billing", "/v2/billing/pods"],
  );
  for (const c of calls) {
    assert.equal(authOf(c), "Bearer k");
    assert.equal(methodOf(c), "GET");
    assert.equal(c.url.searchParams.get("bucketSize"), "hour");
    assert.equal(c.url.searchParams.get("startTime"), start.toISOString());
    assert.equal(c.url.searchParams.get("endTime"), end.toISOString());
  }
});

test("non-2xx answers throw RunpodError with the status", async () => {
  const { impl } = fakeFetch(() => ({ status: 401, body: { error: "nope" } }));
  const client = createRunpodClient("k", impl);
  await assert.rejects(client.pods(), (e: unknown) => e instanceof RunpodError && e.status === 401);
  await assert.rejects(
    client.accountHours(new Date(0), new Date(1)),
    (e: unknown) => e instanceof RunpodError && e.status === 401,
  );
});

test("the client exposes only the three reads", () => {
  const { impl } = fakeFetch(() => ({ body: {} }));
  const client = createRunpodClient("k", impl);
  assert.deepEqual(Object.keys(client).sort(), ["accountHours", "podHours", "pods"]);
});

function snapshotFetch() {
  return fakeFetch((url) => {
    if (url.pathname === "/v2/pods") {
      return { body: { pagination: { hasNextPage: false }, pods: [{ id: "p1", name: "one", status: "RUNNING", cost: 1 }] } };
    }
    return { body: { metadata: {}, records: [] } };
  });
}

test("getRunpodSnapshot: account hours from Pacific day start, pod hours from since floored to the hour", async () => {
  const { impl, calls } = snapshotFetch();
  const now = new Date("2026-11-24T10:30:00Z");
  const since = new Date("2026-11-22T05:17:42Z");
  const snap = await getRunpodSnapshot("k", now, since, impl);
  assert.ok(!("error" in snap));
  assert.equal(snap.pods.length, 1);
  const account = calls.find((c) => c.url.pathname === "/v2/billing")!;
  const perPod = calls.find((c) => c.url.pathname === "/v2/billing/pods")!;
  assert.equal(account.url.searchParams.get("startTime"), "2026-11-24T08:00:00.000Z");
  assert.equal(account.url.searchParams.get("endTime"), now.toISOString());
  assert.equal(perPod.url.searchParams.get("startTime"), "2026-11-22T05:00:00.000Z");
  assert.equal(perPod.url.searchParams.get("endTime"), now.toISOString());
});

test("getRunpodSnapshot: cached for 30 s, failures are not cached", async () => {
  const ok = snapshotFetch();
  const t0 = new Date("2026-11-24T10:30:00Z");
  const since = new Date("2026-11-24T05:10:00Z");
  await getRunpodSnapshot("k", t0, since, ok.impl);
  const n = ok.calls.length;
  await getRunpodSnapshot("k", new Date(t0.getTime() + 29_000), new Date("2026-11-24T05:40:00Z"), ok.impl);
  assert.equal(ok.calls.length, n, "same hour within 30 s is served from cache");
  await getRunpodSnapshot("k", new Date(t0.getTime() + 31_000), since, ok.impl);
  assert.equal(ok.calls.length, 2 * n, "refetched after 30 s");

  _resetRunpodCache();
  const bad = fakeFetch(() => ({ status: 500, body: {} }));
  const r = await getRunpodSnapshot("sekret", t0, since, bad.impl);
  assert.ok("error" in r);
  assert.ok(r.error.length > 0 && !r.error.includes("sekret"), "error text never carries the key");
  const good = snapshotFetch();
  const r2 = await getRunpodSnapshot("k", new Date(t0.getTime() + 1_000), since, good.impl);
  assert.ok(!("error" in r2), "an error is not served from cache");
  assert.ok(good.calls.length > 0);
});
