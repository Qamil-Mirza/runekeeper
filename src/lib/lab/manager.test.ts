import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { AddressInfo } from "net";
import type { LabConfig } from "./config";
import {
  LabManagerError,
  createLab,
  cancelJob,
  getAgent,
  getAgentTranscriptPage,
  getJob,
  listJobs,
  sendAgentMessage,
  getArtifact,
  resolveEscalation,
  listComputeApprovals,
  getComputeRun,
  decideComputeRun,
  getStorage,
  getAgentFileUsage,
  deleteAgentFile,
  clearAgentTemp,
  askAgentAside,
  setRuntimeLimit,
  cancelComputeRun,
  deleteLab,
  listComputeRuns,
  listGitOps,
  listNetworkHosts,
  setNetworkHost,
  updateLab,
  getConnectionStatus,
  getLabSnapshot,
  isApiCompatible,
  listLabs,
  runAgentAction,
  runLabAction,
} from "./manager";

// These tests run the client against a local HTTP server standing in for the
// Lab Manager. They verify the client's wire behaviour, not the manager.

const TOKEN = "t".repeat(48);
const ACTOR = { id: "3f2b8c1e-6a4d-4e0b-9c57-0d1e2f3a4b5c", email: "owner@example.test" };
const KEY = "idem-key-0001";

interface Seen {
  method?: string;
  url?: string;
  headers: IncomingMessage["headers"];
  body: string;
}

type Handler = (seen: Seen, res: ServerResponse) => void;

let server: Server | undefined;
let dir: string | undefined;

afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
  server = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function startServer(handler: Handler, listen: (s: Server) => void): Promise<Seen[]> {
  const seen: Seen[] = [];
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const entry: Seen = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      seen.push(entry);
      handler(entry, res);
    });
  });
  return new Promise((resolve) => {
    server!.once("listening", () => resolve(seen));
    listen(server!);
  });
}

function configFor(transport: LabConfig["transport"]): LabConfig {
  return { transport, token: TOKEN, ownerUserIds: new Set([ACTOR.id]) };
}

async function onUnixSocket(handler: Handler): Promise<{ config: LabConfig; seen: Seen[] }> {
  dir = mkdtempSync(join(tmpdir(), "lab-"));
  const socketPath = join(dir, "api.sock");
  const seen = await startServer(handler, (s) => s.listen(socketPath));
  return { config: configFor({ kind: "unix", socketPath }), seen };
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function rejection(promise: Promise<unknown>): Promise<LabManagerError> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof LabManagerError, `expected LabManagerError, got ${err}`);
    return err;
  }
  assert.fail("expected the call to reject");
}

const HEALTH = {
  status: "ok",
  apiVersion: "1.0",
  serviceVersion: "abc123",
  degraded: false,
  reasons: [],
  capabilities: {
    executorShell: { allowed: false, reason: "agent_isolation_missing" },
    unattendedExecution: { allowed: false, reason: "not_approved_by_owner" },
    tmuxMode: { allowed: false, reason: "agent_isolation_missing" },
  },
};

describe("over a unix socket", () => {
  it("reads health without credentials", async () => {
    const { config, seen } = await onUnixSocket((_s, res) => json(res, 200, HEALTH));
    const status = await getConnectionStatus(config);

    assert.equal(status.reachable, true);
    assert.equal(status.apiCompatible, true);
    assert.equal(status.health?.serviceVersion, "abc123");
    assert.equal(seen[0].url, "/v1/health");
    assert.equal(seen[0].headers.authorization, undefined);
    assert.equal(seen[0].headers["x-lab-actor-id"], undefined);
  });

  it("sends the token and actor on reads", async () => {
    const { config, seen } = await onUnixSocket((_s, res) => json(res, 200, { items: [] }));
    assert.deepEqual(await listLabs(config, ACTOR), []);

    assert.equal(seen[0].method, "GET");
    assert.equal(seen[0].url, "/v1/labs");
    assert.equal(seen[0].headers.authorization, `Bearer ${TOKEN}`);
    assert.equal(seen[0].headers["x-lab-actor-id"], ACTOR.id);
    assert.equal(seen[0].headers["x-lab-actor-email"], ACTOR.email);
  });

  it("sends the idempotency key and body on mutations", async () => {
    const { config, seen } = await onUnixSocket((_s, res) =>
      json(res, 201, { lab: { id: "lab_1" } })
    );
    await createLab(config, ACTOR, KEY, { name: "Sparse probes" });

    assert.equal(seen[0].method, "POST");
    assert.equal(seen[0].url, "/v1/labs");
    assert.equal(seen[0].headers["idempotency-key"], KEY);
    assert.deepEqual(JSON.parse(seen[0].body), { name: "Sparse probes" });
  });

  it("maps lifecycle actions to the contract's paths", async () => {
    const { config, seen } = await onUnixSocket((_s, res) => json(res, 202, { items: [] }));
    await runLabAction(config, ACTOR, KEY, "lab_1", "start");
    await runLabAction(config, ACTOR, KEY, "lab_1", "stop");
    await runAgentAction(config, ACTOR, KEY, "agt_1", "start");
    await runAgentAction(config, ACTOR, KEY, "agt_1", "stop");
    await runAgentAction(config, ACTOR, KEY, "agt_1", "restart");
    await runAgentAction(config, ACTOR, KEY, "agt_1", "resume");
    await getLabSnapshot(config, ACTOR, "lab_1");
    await getAgentTranscriptPage(config, ACTOR, "agt_1", { limit: 5 });

    assert.deepEqual(
      seen.map((s) => `${s.method} ${s.url}`),
      [
        "POST /v1/labs/lab_1/start",
        "POST /v1/labs/lab_1/stop",
        "POST /v1/agents/agt_1/start",
        "POST /v1/agents/agt_1/stop",
        "POST /v1/agents/agt_1/restart",
        "POST /v1/agents/agt_1/resume",
        "GET /v1/labs/lab_1",
        "GET /v1/agents/agt_1/transcript?limit=5",
      ]
    );
    assert.deepEqual(JSON.parse(seen[5].body), { newSession: false });
  });

  it("sends a side question to the agent's asides and nowhere else", async () => {
    const { config, seen } = await onUnixSocket((_s, res) => json(res, 202, { question: { id: "ti_1" } }));
    await askAgentAside(config, ACTOR, KEY, "agt_1", "What are you doing?");
    assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`), ["POST /v1/agents/agt_1/asides"]);
    assert.deepEqual(JSON.parse(seen[0].body), { text: "What are you doing?" });
    assert.equal(seen[0].headers["idempotency-key"], KEY);
  });

  it("maps rental approvals to the contract's paths, with no body", async () => {
    const { config, seen } = await onUnixSocket((_s, res) => json(res, 200, { items: [] }));
    await listComputeApprovals(config, ACTOR);
    await getComputeRun(config, ACTOR, "run_1");
    await decideComputeRun(config, ACTOR, KEY, "run_1", "approve");
    await decideComputeRun(config, ACTOR, KEY, "run_1", "deny");
    assert.deepEqual(
      seen.map((s) => `${s.method} ${s.url}`),
      ["GET /v1/compute/approvals", "GET /v1/compute/runs/run_1", "POST /v1/compute/runs/run_1/approve", "POST /v1/compute/runs/run_1/deny"]
    );
    assert.equal(seen[2].body, "");
    assert.equal(seen[2].headers["idempotency-key"], KEY);
  });

  it("reads a stored document by hash and refuses anything that is not a hash", async () => {
    const { config, seen } = await onUnixSocket((_s, res) => json(res, 200, {}));
    const hash = "ab".repeat(32);
    await getArtifact(config, ACTOR, "lab_1", hash);
    assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`), [`GET /v1/labs/lab_1/artifacts/${hash}`]);
    for (const bad of ["", "abc", "../jobs", `${hash}/x`, hash.toUpperCase()]) {
      await assert.rejects(getArtifact(config, ACTOR, "lab_1", bad), /Invalid hash/);
    }
    assert.equal(seen.length, 1);
  });

  it("resolves an escalation with a note, or with an empty body", async () => {
    const { config, seen } = await onUnixSocket((_s, res) => json(res, 200, {}));
    await resolveEscalation(config, ACTOR, KEY, "esc_1", "Seen, thanks");
    await resolveEscalation(config, ACTOR, KEY, "esc_1");
    assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`), [
      "POST /v1/escalations/esc_1/resolve",
      "POST /v1/escalations/esc_1/resolve",
    ]);
    assert.deepEqual(JSON.parse(seen[0].body), { note: "Seen, thanks" });
    assert.deepEqual(JSON.parse(seen[1].body), {});
  });

  it("maps storage and file cleanup to the contract's paths, with the path encoded", async () => {
    const { config, seen } = await onUnixSocket((_s, res) => json(res, 200, {}));
    await getStorage(config, ACTOR);
    await getAgentFileUsage(config, ACTOR, "agt_1", "");
    await getAgentFileUsage(config, ACTOR, "agt_1", "runs/a b&c=d");
    await deleteAgentFile(config, ACTOR, KEY, "agt_1", "runs/old #1");
    await clearAgentTemp(config, ACTOR, KEY, "agt_1");
    assert.deepEqual(
      seen.map((s) => `${s.method} ${s.url}`),
      [
        "GET /v1/storage",
        "GET /v1/agents/agt_1/files/usage?path=",
        "GET /v1/agents/agt_1/files/usage?path=runs%2Fa%20b%26c%3Dd",
        "DELETE /v1/agents/agt_1/files?path=runs%2Fold%20%231",
        "POST /v1/agents/agt_1/files/clear-temp",
      ]
    );
    assert.equal(seen[3].headers["idempotency-key"], KEY);
    assert.equal(seen[3].body, "");
  });

  it("refuses a path that leaves the working directory before anything is sent", async () => {
    const { config, seen } = await onUnixSocket((_s, res) => json(res, 200, {}));
    for (const bad of ["", "/etc", "..", "a/../b", "a//b", "./a", "a/", "a\0b", "x".repeat(1025)]) {
      await assert.rejects(deleteAgentFile(config, ACTOR, KEY, "agt_1", bad), /Invalid path/, JSON.stringify(bad));
    }
    await assert.rejects(getAgentFileUsage(config, ACTOR, "agt_1", "../x"), /Invalid path/);
    assert.equal(seen.length, 0);
  });

  it("maps instructions, tasks and the runtime limit to the contract's paths", async () => {
    const { config, seen } = await onUnixSocket((_s, res) => json(res, 200, { items: [], nextCursor: null }));
    await sendAgentMessage(config, ACTOR, KEY, "agt_1", "Summarise the notes.");
    await getAgentTranscriptPage(config, ACTOR, "agt_1", { after: "41" });
    await getAgentTranscriptPage(config, ACTOR, "agt_1", { before: "12", limit: 1000 });
    await listJobs(config, ACTOR, "lab_1", { agentId: "agt_1", limit: 30 });
    await getJob(config, ACTOR, "job_1");
    await cancelJob(config, ACTOR, KEY, "job_1");
    await setRuntimeLimit(config, ACTOR, KEY, "lab_1", 120);
    await updateLab(config, ACTOR, KEY, "lab_1", { objective: "Find it", priorities: ["a", "b"] });
    await getAgent(config, ACTOR, "agt_1");

    assert.deepEqual(
      seen.map((s) => `${s.method} ${s.url}`),
      [
        "POST /v1/agents/agt_1/messages",
        "GET /v1/agents/agt_1/transcript?after=41&limit=50",
        "GET /v1/agents/agt_1/transcript?before=12&limit=200",
        "GET /v1/labs/lab_1/jobs?kind=all&agentId=agt_1&limit=30",
        "GET /v1/jobs/job_1",
        "POST /v1/jobs/job_1/cancel",
        "POST /v1/labs/lab_1/runtime-limit",
        "PATCH /v1/labs/lab_1",
        "GET /v1/agents/agt_1",
      ]
    );
    assert.deepEqual(JSON.parse(seen[0].body), { text: "Summarise the notes." });
    assert.equal(seen[0].headers["idempotency-key"], KEY);
    assert.deepEqual(JSON.parse(seen[6].body), { wallClockMinutes: 120 });
    assert.deepEqual(JSON.parse(seen[7].body), { objective: "Find it", priorities: ["a", "b"] });
  });

  it("deletes a lab with DELETE and the idempotency key", async () => {
    const { config, seen } = await onUnixSocket((_s, res) => json(res, 200, { labId: "lab_1" }));
    await deleteLab(config, ACTOR, KEY, "lab_1");
    await assert.rejects(deleteLab(config, ACTOR, KEY, "../labs"), { code: "validation_failed" });

    assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`), ["DELETE /v1/labs/lab_1"]);
    assert.equal(seen[0].headers["idempotency-key"], KEY);
  });

  it("lists network hosts and blocks or trusts one by a plain host name", async () => {
    const { config, seen } = await onUnixSocket((_s, res) => json(res, 200, { items: [], mode: "listOnly", listed: [] }));
    await listNetworkHosts(config, ACTOR);
    await setNetworkHost(config, ACTOR, KEY, "PyPI.org", "block");
    await setNetworkHost(config, ACTOR, KEY, "files.pythonhosted.org", "trust");
    for (const bad of ["a/../b", "example.com/block", "", "a b", "-x.com", "x".repeat(254)]) {
      await assert.rejects(setNetworkHost(config, ACTOR, KEY, bad, "block"), { code: "validation_failed" });
    }

    assert.deepEqual(
      seen.map((s) => `${s.method} ${s.url}`),
      ["GET /v1/network/hosts", "POST /v1/network/hosts/pypi.org/block", "POST /v1/network/hosts/files.pythonhosted.org/trust"]
    );
    assert.equal(seen[1].headers["idempotency-key"], KEY);
  });

  it("lists what a lab's agents pushed", async () => {
    const { config, seen } = await onUnixSocket((_s, res) => json(res, 200, { repo: "o/n", defaultBranch: "main", items: [] }));
    const page = await listGitOps(config, ACTOR, "lab_1");
    assert.equal(page.repo, "o/n");
    await assert.rejects(listGitOps(config, ACTOR, "lab_1/../x"), { code: "validation_failed" });
    assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`), ["GET /v1/labs/lab_1/git/ops"]);
  });

  it("lists a lab's compute runs and cancels one", async () => {
    const { config, seen } = await onUnixSocket((_s, res) => json(res, 200, { items: [] }));
    await listComputeRuns(config, ACTOR, "lab_1");
    await cancelComputeRun(config, ACTOR, KEY, "run_1");
    await assert.rejects(cancelComputeRun(config, ACTOR, KEY, "run_1/../x"), { code: "validation_failed" });

    assert.deepEqual(
      seen.map((s) => `${s.method} ${s.url}`),
      ["GET /v1/labs/lab_1/compute/runs", "POST /v1/compute/runs/run_1/cancel"]
    );
    assert.equal(seen[1].headers["idempotency-key"], KEY);
  });

  it("refuses cursors that would change the request", async () => {
    const { config, seen } = await onUnixSocket((_s, res) => json(res, 200, { items: [], nextCursor: null }));
    for (const bad of ["1&limit=9999", "../x", "", "a b", "x".repeat(65)]) {
      await assert.rejects(getAgentTranscriptPage(config, ACTOR, "agt_1", { after: bad }), /Invalid cursor/);
      await assert.rejects(listJobs(config, ACTOR, "lab_1", { before: bad }), /Invalid cursor/);
    }
    assert.equal(seen.length, 0);
  });

  it("surfaces the manager's error envelope", async () => {
    const { config } = await onUnixSocket((_s, res) =>
      json(res, 412, {
        error: {
          code: "isolation_required",
          message: "Agent isolation is not configured",
          retryable: false,
          details: { capability: "executorShell" },
        },
      })
    );
    const err = await rejection(runAgentAction(config, ACTOR, KEY, "agt_1", "start"));

    assert.equal(err.status, 412);
    assert.equal(err.code, "isolation_required");
    assert.equal(err.retryable, false);
    assert.deepEqual(err.details, { capability: "executorShell" });
  });

  const badResponses: [string, (res: ServerResponse) => void][] = [
    ["a non-JSON body", (res) => res.end("<html>oops</html>")],
    ["an error without an envelope", (res) => json(res, 500, { nope: true })],
  ];
  for (const [name, respond] of badResponses) {
    it(`reports ${name} as a bad response`, async () => {
      const { config } = await onUnixSocket((_s, res) => respond(res));
      const err = await rejection(listLabs(config, ACTOR));
      assert.equal(err.code, "manager_bad_response");
      assert.equal(err.status, 502);
    });
  }

  it("times out when the manager accepts but never answers", async () => {
    const { config } = await onUnixSocket(() => {
      // never respond
    });
    const started = Date.now();
    const status = await getConnectionStatus(config);

    assert.equal(status.reachable, false);
    assert.equal(status.error?.code, "manager_unreachable");
    assert.equal(status.error?.retryable, true);
    assert.ok(Date.now() - started < 4_000);
  });

  it("refuses ids that would change the request path", async () => {
    const { config, seen } = await onUnixSocket((_s, res) => json(res, 200, {}));
    for (const id of ["../health", "lab_1/stop", "lab 1", "", "a?b=c"]) {
      const err = await rejection(getLabSnapshot(config, ACTOR, id));
      assert.equal(err.code, "validation_failed");
    }
    assert.equal(seen.length, 0);
  });
});

describe("when the manager is not there", () => {
  it("reports a missing socket as unreachable", async () => {
    dir = mkdtempSync(join(tmpdir(), "lab-"));
    const config = configFor({ kind: "unix", socketPath: join(dir, "absent.sock") });

    const status = await getConnectionStatus(config);
    assert.equal(status.reachable, false);
    assert.equal(status.error?.code, "manager_unreachable");
    assert.match(status.error?.message ?? "", /ENOENT/);

    const err = await rejection(listLabs(config, ACTOR));
    assert.equal(err.status, 503);
    assert.equal(err.retryable, true);
  });

  it("reports a refused loopback port as unreachable", async () => {
    // Bind then release a port so nothing is listening on it.
    const probe = createServer();
    await new Promise<void>((r) => probe.listen(0, "127.0.0.1", () => r()));
    const { port } = probe.address() as AddressInfo;
    await new Promise<void>((r) => probe.close(() => r()));

    const status = await getConnectionStatus(configFor({ kind: "tcp", host: "127.0.0.1", port }));
    assert.equal(status.reachable, false);
    assert.match(status.error?.message ?? "", /ECONNREFUSED/);
  });
});

describe("over loopback tcp", () => {
  it("reaches the manager", async () => {
    const seen = await startServer(
      (_s, res) => json(res, 200, HEALTH),
      (s) => s.listen(0, "127.0.0.1")
    );
    const { port } = server!.address() as AddressInfo;
    const status = await getConnectionStatus(configFor({ kind: "tcp", host: "127.0.0.1", port }));
    assert.equal(status.reachable, true);
    assert.equal(seen.length, 1);
  });
});

describe("isApiCompatible", () => {
  it("accepts the supported major version only", () => {
    assert.equal(isApiCompatible({ apiVersion: "1.0" }), true);
    assert.equal(isApiCompatible({ apiVersion: "1.7" }), true);
    assert.equal(isApiCompatible({ apiVersion: "2.0" }), false);
    assert.equal(isApiCompatible({ apiVersion: "0.9" }), false);
  });
});
