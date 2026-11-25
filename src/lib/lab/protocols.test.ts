import { test } from "node:test";
import assert from "node:assert/strict";
import { planRevision, checkDecision, ProtocolRuleError, type ProtocolRow, type ProtocolStatus } from "./protocols";

function row(status: ProtocolStatus, version = 2): ProtocolRow {
  return { id: "p2", lineageId: "p1", version, status, experimentId: "e1" };
}

test("planRevision: first protocol starts a new lineage", () => {
  assert.deepEqual(planRevision(null), { version: 1, lineageId: null, supersedeId: null });
});

test("planRevision: revising a waiting protocol supersedes it", () => {
  assert.deepEqual(planRevision(row("waiting")), { version: 3, lineageId: "p1", supersedeId: "p2" });
});

test("planRevision: revising a decided protocol keeps it", () => {
  for (const s of ["accepted", "rejected"] as const) {
    assert.deepEqual(planRevision(row(s)), { version: 3, lineageId: "p1", supersedeId: null });
  }
});

test("planRevision: superseded cannot be revised", () => {
  assert.throws(
    () => planRevision(row("superseded")),
    (e) => e instanceof ProtocolRuleError && e.code === "revise_superseded" && e.name === "ProtocolRuleError",
  );
});

test("checkDecision: waiting passes", () => {
  assert.doesNotThrow(() => checkDecision(row("waiting")));
});

test("checkDecision: non-waiting is already_decided", () => {
  for (const s of ["accepted", "rejected", "superseded"] as const) {
    assert.throws(
      () => checkDecision(row(s)),
      (e) => e instanceof ProtocolRuleError && e.code === "already_decided",
    );
  }
});
