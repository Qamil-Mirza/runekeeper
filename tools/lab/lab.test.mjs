import test from "node:test";
import assert from "node:assert/strict";
import { parseCommand, formatResult } from "./lab.mjs";

test("run start builds the POST", () => {
  const c = parseCommand(["run", "start", "--experiment", "E9", "--stage", "held-out", "--setup", "fs-e9h-a02", "--pod", "abc", "--cap", "15"]);
  assert.equal(c.method, "POST");
  assert.equal(c.path, "/api/lab/agent/runs");
  assert.deepEqual(c.body, { experiment: "E9", stage: "held-out", setupId: "fs-e9h-a02", podId: "abc", capUsd: 15 });
});

test("run start names a missing flag", () => {
  const c = parseCommand(["run", "start", "--experiment", "E9", "--stage", "s", "--setup", "x", "--cap", "15"]);
  assert.match(c.error, /--pod/);
});

test("run progress with eta", () => {
  const c = parseCommand(["run", "progress", "r1", "62", "--eta", "18:10"]);
  assert.equal(c.path, "/api/lab/agent/runs/r1/progress");
  assert.deepEqual(c.body, { pct: 62, eta: "18:10" });
});

test("run progress rejects a non-number", () => {
  assert.ok(parseCommand(["run", "progress", "r1", "abc"]).error);
});

test("run end and list", () => {
  const e = parseCommand(["run", "end", "r1", "--status", "done", "--note", "ok"]);
  assert.equal(e.path, "/api/lab/agent/runs/r1/end");
  assert.deepEqual(e.body, { status: "done", note: "ok" });
  assert.ok(parseCommand(["run", "end", "r1", "--status", "bogus"]).error);
  const l = parseCommand(["run", "list"]);
  assert.equal(l.method, "GET");
  assert.equal(l.path, "/api/lab/agent/runs");
});

test("protocol post", () => {
  const c = parseCommand(["protocol", "post", "p.md", "--experiment", "E10", "--title", "T", "--revises", "x"]);
  assert.equal(c.file, "p.md");
  assert.equal(c.path, "/api/lab/agent/protocols");
  assert.equal(c.body.revisesId, "x");
  assert.equal(c.body.experiment, "E10");
  assert.equal(c.body.title, "T");
});

test("report post and inbox", () => {
  const r = parseCommand(["report", "post", "r.html", "--experiment", "E9", "--title", "T", "--summary", "S"]);
  assert.equal(r.file, "r.html");
  assert.equal(r.body.summary, "S");
  assert.deepEqual(parseCommand(["inbox"]).body, {});
  assert.deepEqual(parseCommand(["inbox", "--all"]).body, { all: true });
});

test("unknown command and help", () => {
  assert.ok(parseCommand(["nope"]).error);
  assert.ok(parseCommand([]).help);
  assert.ok(parseCommand(["--help"]).help);
});

test("formatResult inbox", () => {
  assert.deepEqual(formatResult("inbox", 200, { items: [] }), { text: "nothing new", exitCode: 0 });
  const r = formatResult("inbox", 200, {
    items: [
      { kind: "decision", protocolId: "3f2a9c1e-0b7d-4e8a-9c55-2d1e6f7a8b90", experiment: "E10", title: "Title", version: 2, verdict: "rejected", note: "go", decidedAt: "2026-11-25T02:10:00.000Z" },
      { kind: "reply", reportId: "r", reportTitle: "Report title", body: "thanks", createdAt: "2026-11-25T02:10:00.000Z" },
    ],
  });
  assert.equal(r.exitCode, 0);
  assert.equal(
    r.text,
    'E10 v2 "Title" — REJECTED (Nov 24, 6:10 PM PT)  id 3f2a9c1e-0b7d-4e8a-9c55-2d1e6f7a8b90\n  note: go\n\nreply on "Report title" (Nov 24, 6:10 PM PT)\n  thanks',
  );
});

test("formatResult errors", () => {
  assert.deepEqual(formatResult("run end", 409, { error: { message: "m" } }), { text: "lab: m", exitCode: 1 });
  assert.equal(formatResult("run end", 500, "garbage").exitCode, 1);
});

test("formatResult successes", () => {
  assert.match(formatResult("protocol post", 201, { id: "abc", version: 2 }).text, /^protocol posted: abc \(v2, waiting for the owner\)$/);
  assert.match(formatResult("report post", 201, { id: "abc" }).text, /^report posted: abc/);
  assert.match(formatResult("run start", 201, { id: "r9" }).text, /r9/);
  assert.equal(formatResult("run list", 200, { runs: [] }).text, "no running runs");
});

test("--experiment-title is sent as experimentTitle on run start and protocol post", () => {
  const r = parseCommand(["run", "start", "--experiment", "E9", "--experiment-title", "probe transfer", "--stage", "a",
    "--setup", "s", "--pod", "p", "--cap", "5"]);
  assert.equal(r.body.experimentTitle, "probe transfer");
  const p = parseCommand(["protocol", "post", "p.md", "--experiment", "E9", "--title", "T", "--experiment-title", "probe transfer"]);
  assert.equal(p.body.experimentTitle, "probe transfer");
  assert.equal("experimentTitle" in parseCommand(["protocol", "post", "p.md", "--experiment", "E9", "--title", "T"]).body, false);
});

test("unknown options are rejected", () => {
  assert.equal(parseCommand(["protocol", "post", "p.md", "--experiment", "E9", "--title", "T", "--revise", "x"]).error,
    "unknown option --revise");
  assert.equal(parseCommand(["inbox", "--x"]).error, "unknown option --x");
  assert.equal(parseCommand(["run", "list", "--all"]).error, "unknown option --all");
  assert.equal(parseCommand(["report", "post", "r.html", "--experiment", "E9", "--title", "T", "--summary", "S",
    "--experiment-title", "x"]).error, "unknown option --experiment-title");
});

test("main exits 1 on an unknown option", async () => {
  const { main } = await import("./lab.mjs");
  const errors = [];
  const orig = console.error;
  console.error = (m) => errors.push(m);
  try {
    assert.equal(await main(["run", "list", "--x", "1"]), 1);
  } finally {
    console.error = orig;
  }
  assert.deepEqual(errors, ["lab: unknown option --x"]);
});
