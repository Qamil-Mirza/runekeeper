import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateRunStart,
  validateProgress,
  validateRunEnd,
  validateProtocolPost,
  validateReportPost,
  validateDecision,
  validateReply,
} from "./validate";

const now = new Date("2026-11-24T22:00:00Z");
const start = { experiment: "E9", stage: "held-out", setupId: "s1", podId: "p_1.a", capUsd: 5 };

function msg(r: { ok: boolean; message?: string }) {
  assert.equal(r.ok, false);
  return (r as { message: string }).message;
}

test("validateRunStart", () => {
  assert.deepEqual(validateRunStart(start), { ok: true, value: { ...start, experimentTitle: null } });
  assert.match(msg(validateRunStart({ ...start, stage: "Held Out" })), /stage/);
  assert.match(msg(validateRunStart({ ...start, experiment: "e9" })), /experiment/);
  assert.match(msg(validateRunStart({ ...start, capUsd: 0 })), /capUsd/);
  assert.match(msg(validateRunStart({ ...start, capUsd: 10001 })), /capUsd/);
  assert.match(msg(validateRunStart({ ...start, podId: "a b" })), /podId/);
  assert.match(msg(validateRunStart({ ...start, setupId: "x".repeat(101) })), /setupId/);
  assert.equal(validateRunStart(null).ok, false);
  assert.equal(validateRunStart("x").ok, false);
});

test("validateProgress", () => {
  assert.match(msg(validateProgress({ pct: 101 }, now)), /pct/);
  assert.match(msg(validateProgress({ pct: 1.5 }, now)), /pct/);
  const r = validateProgress({ pct: 40, eta: "18:10" }, now);
  assert.ok(r.ok && r.value.eta?.toISOString() === "2026-11-25T02:10:00.000Z");
  const n = validateProgress({ pct: 0 }, now);
  assert.ok(n.ok && n.value.eta === null);
  assert.match(msg(validateProgress({ pct: 5, eta: "soon" }, now)), /eta/);
  assert.equal(validateProgress(undefined, now).ok, false);
});

test("validateRunEnd", () => {
  assert.deepEqual(validateRunEnd({ status: "done" }), { ok: true, value: { status: "done", note: null } });
  assert.deepEqual(validateRunEnd({ status: "failed", note: "oom" }), { ok: true, value: { status: "failed", note: "oom" } });
  assert.match(msg(validateRunEnd({ status: "weird" })), /status/);
  assert.match(msg(validateRunEnd({ status: "done", note: "x".repeat(10001) })), /note/);
});

test("validateProtocolPost", () => {
  const ok = validateProtocolPost({ experiment: "E9", title: "T", bodyMd: "# hi" });
  assert.deepEqual(ok, {
    ok: true,
    value: { experiment: "E9", title: "T", bodyMd: "# hi", revisesId: null, experimentTitle: null },
  });
  assert.match(msg(validateProtocolPost({ experiment: "E9", title: "T", bodyMd: "x".repeat(512 * 1024 + 1) })), /512 KB/);
  assert.match(msg(validateProtocolPost({ experiment: "E9", title: "", bodyMd: "x" })), /title/);
  assert.match(msg(validateProtocolPost({ experiment: "E9", title: "x".repeat(201), bodyMd: "x" })), /title/);
});

test("an optional experiment title of at most 200 chars on run start and protocol post", () => {
  const r = validateRunStart({ ...start, experimentTitle: "probe transfer" });
  assert.ok(r.ok && r.value.experimentTitle === "probe transfer");
  assert.ok(validateRunStart({ ...start, experimentTitle: null }).ok);
  assert.ok(validateRunStart({ ...start, experimentTitle: "x".repeat(200) }).ok);
  assert.match(msg(validateRunStart({ ...start, experimentTitle: "x".repeat(201) })), /experimentTitle/);
  assert.match(msg(validateRunStart({ ...start, experimentTitle: 9 })), /experimentTitle/);
  assert.match(msg(validateRunStart({ ...start, experimentTitle: "  " })), /experimentTitle/);

  const proto = { experiment: "E9", title: "T", bodyMd: "# hi" };
  const p = validateProtocolPost({ ...proto, experimentTitle: "probe transfer" });
  assert.ok(p.ok && p.value.experimentTitle === "probe transfer");
  assert.match(msg(validateProtocolPost({ ...proto, experimentTitle: "x".repeat(201) })), /experimentTitle/);
});

test("validateReportPost", () => {
  const base = { title: "T", summary: "S", html: "<p>hi</p>" };
  const ok = validateReportPost(base);
  assert.deepEqual(ok, { ok: true, value: { experiment: null, ...base } });
  assert.match(msg(validateReportPost({ ...base, html: "a".repeat(4 * 1024 * 1024 + 1) })), /4 MB/);
  assert.equal(validateReportPost({ ...base, html: "a".repeat(4 * 1024 * 1024) }).ok, true);
  assert.match(msg(validateReportPost({ ...base, summary: "x".repeat(301) })), /summary/);
  assert.match(msg(validateReportPost({ ...base, experiment: "e9" })), /experiment/);
});

test("validateDecision and validateReply", () => {
  assert.match(msg(validateDecision({ verdict: "accepted", note: "   " })), /note/);
  assert.match(msg(validateDecision({ verdict: "maybe", note: "x" })), /verdict/);
  assert.deepEqual(validateDecision({ verdict: "rejected", note: "  no  " }), { ok: true, value: { verdict: "rejected", note: "no" } });
  assert.deepEqual(validateReply({ body: "hi" }), { ok: true, value: { body: "hi" } });
  assert.equal(validateReply({ body: " " }).ok, false);
  assert.equal(validateReply({ body: "x".repeat(10001) }).ok, false);
});
