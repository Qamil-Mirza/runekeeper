import { test } from "node:test";
import assert from "node:assert/strict";
import { spentToday, podCost, runCost } from "./spend";
import type { BillingBucket, RunpodPod } from "./runpod";

const at = (s: string) => new Date(s);
const bucket = (start: string, end: string, totalAmount: number, podId?: string): BillingBucket => ({
  startTime: at(start),
  endTime: at(end),
  totalAmount,
  ...(podId ? { podId } : {}),
});
const pod = (id: string, status: string, costPerHr: number, startedAt: string | null): RunpodPod => ({
  id,
  name: `pod-${id}`,
  status,
  costPerHr,
  startedAt: startedAt ? at(startedAt) : null,
});

test("spentToday: billed buckets plus accrual since the last billed hour", () => {
  const hours = [
    bucket("2026-11-24T08:00:00Z", "2026-11-24T09:00:00Z", 1.0),
    bucket("2026-11-24T09:00:00Z", "2026-11-24T10:00:00Z", 0.5),
  ];
  const pods = [pod("a", "RUNNING", 0.6, "2026-11-24T07:00:00Z")];
  const r = spentToday(hours, pods, at("2026-11-24T10:30:00Z"));
  assert.equal(r.billed, 1.5);
  assert.ok(Math.abs(r.accruing - 0.3) < 1e-9, `accruing ${r.accruing}`);
});

test("spentToday: no buckets yet, accrual starts at the later of pod start and day start", () => {
  // Day start (00:00 Pacific) is 08:00Z on 2026-11-24.
  const pods = [pod("a", "RUNNING", 0.6, "2026-11-24T09:00:00Z")];
  const r = spentToday([], pods, at("2026-11-24T09:30:00Z"));
  assert.equal(r.billed, 0);
  assert.ok(Math.abs(r.accruing - 0.3) < 1e-9, `accruing ${r.accruing}`);

  // A pod started yesterday accrues only from day start.
  const old = [pod("b", "RUNNING", 1.0, "2026-11-23T20:00:00Z")];
  const r2 = spentToday([], old, at("2026-11-24T09:00:00Z"));
  assert.ok(Math.abs(r2.accruing - 1.0) < 1e-9, `accruing ${r2.accruing}`);
});

test("spentToday: a stopped pod contributes no accrual", () => {
  const pods = [
    pod("a", "EXITED", 0.6, "2026-11-24T09:00:00Z"),
    pod("b", "EXITED", 2.0, null),
  ];
  const r = spentToday([], pods, at("2026-11-24T10:30:00Z"));
  assert.deepEqual(r, { billed: 0, accruing: 0 });
});

test("podCost: sums that pod's buckets and accrues since its last billed hour", () => {
  const hours = [
    bucket("2026-11-24T08:00:00Z", "2026-11-24T09:00:00Z", 0.6, "a"),
    bucket("2026-11-24T09:00:00Z", "2026-11-24T10:00:00Z", 0.6, "a"),
    bucket("2026-11-24T09:00:00Z", "2026-11-24T10:00:00Z", 5.0, "other"),
  ];
  const p = pod("a", "RUNNING", 0.6, "2026-11-24T07:30:00Z");
  const r = podCost("a", hours, p, at("2026-11-24T10:30:00Z"));
  assert.ok(Math.abs(r.billed - 1.2) < 1e-9, `billed ${r.billed}`);
  assert.ok(Math.abs(r.accruing - 0.3) < 1e-9, `accruing ${r.accruing}`);
});

test("podCost: pod not billed yet accrues from its start; a gone or stopped pod only bills", () => {
  const p = pod("a", "RUNNING", 0.6, "2026-11-24T10:00:00Z");
  const r = podCost("a", [], p, at("2026-11-24T10:30:00Z"));
  assert.equal(r.billed, 0);
  assert.ok(Math.abs(r.accruing - 0.3) < 1e-9);

  const hours = [bucket("2026-11-24T08:00:00Z", "2026-11-24T09:00:00Z", 2.5, "gone")];
  assert.deepEqual(podCost("gone", hours, undefined, at("2026-11-24T10:30:00Z")), {
    billed: 2.5,
    accruing: 0,
  });
  const stopped = pod("gone", "EXITED", 0.6, "2026-11-24T07:00:00Z");
  assert.deepEqual(podCost("gone", hours, stopped, at("2026-11-24T10:30:00Z")), {
    billed: 2.5,
    accruing: 0,
  });
});

test("podCost: a running pod with no start time and no bills accrues nothing (not infinity)", () => {
  const p = pod("a", "RUNNING", 0.6, null);
  assert.deepEqual(podCost("a", [], p, at("2026-11-24T10:30:00Z")), { billed: 0, accruing: 0 });
});

test("runCost: only the pod's buckets inside the run's window; accrual only while the run runs", () => {
  const hours = [
    bucket("2026-11-24T08:00:00Z", "2026-11-24T09:00:00Z", 1.0, "p"),
    bucket("2026-11-24T09:00:00Z", "2026-11-24T10:00:00Z", 1.0, "p"),
    bucket("2026-11-24T10:00:00Z", "2026-11-24T11:00:00Z", 0.5, "p"),
    bucket("2026-11-24T10:00:00Z", "2026-11-24T11:00:00Z", 9.0, "other"),
  ];
  const p = pod("p", "RUNNING", 0.5, "2026-11-24T08:00:00Z");
  const now = at("2026-11-24T11:30:00Z");
  const a = runCost(
    { podId: "p", status: "done", startedAt: at("2026-11-24T08:20:00Z"), endedAt: at("2026-11-24T10:00:00Z") },
    hours, p, now,
  );
  assert.deepEqual(a, { billed: 2.0, accruing: 0 }, "start floored to the hour; ended run never accrues");
  const b = runCost(
    { podId: "p", status: "running", startedAt: at("2026-11-24T10:00:00Z"), endedAt: null },
    hours, p, now,
  );
  assert.equal(b.billed, 0.5);
  assert.ok(Math.abs(b.accruing - 0.25) < 1e-9, `accruing ${b.accruing}`);
  // Run started on a pod that was already running, nothing billed in its window yet:
  // accrual counts from the run's start hour, not the pod's start.
  const c = runCost(
    { podId: "p", status: "running", startedAt: at("2026-11-24T11:10:00Z"), endedAt: null },
    hours, p, now,
  );
  assert.equal(c.billed, 0);
  assert.ok(Math.abs(c.accruing - 0.25) < 1e-9, `accruing ${c.accruing}`);
});
