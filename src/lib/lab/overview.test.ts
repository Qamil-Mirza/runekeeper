import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOverview } from "./overview";
import type { OverviewRun } from "./types";
import type { BillingBucket, RunpodPod, RunpodSnapshot } from "./runpod";

const at = (s: string) => new Date(s);
const NOW = at("2026-11-24T22:00:00Z"); // 2:00 PM Pacific
const HELD_OUT_ETA = at("2026-11-24T23:40:00Z"); // in 1h 40m

let seq = 0;
function run(p: Partial<OverviewRun> & Pick<OverviewRun, "experimentId" | "stage" | "status" | "podId">): OverviewRun {
  seq += 1;
  return {
    id: `run-${seq}`,
    experimentTitle: null,
    setupId: `fs-${p.stage}`,
    capUsd: 10,
    progressPct: null,
    eta: null,
    progressAt: null,
    startedAt: at("2026-11-24T10:00:00Z"),
    endedAt: p.status === "running" ? null : at("2026-11-24T12:00:00Z"),
    endNote: null,
    ...p,
  };
}
const pod = (id: string, name: string, status: string, costPerHr: number, startedAt: string | null): RunpodPod => ({
  id,
  name,
  status,
  costPerHr,
  startedAt: startedAt ? at(startedAt) : null,
});
const bucket = (podId: string, start: string, end: string, totalAmount: number): BillingBucket => ({
  podId,
  startTime: at(start),
  endTime: at(end),
  totalAmount,
});
const close = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-9;

function e9Runs(): OverviewRun[] {
  return [
    run({ experimentId: "E9", experimentTitle: "probe transfer", stage: "dev-a", status: "done", podId: "pa",
      startedAt: at("2026-11-24T10:00:00Z"), endedAt: at("2026-11-24T12:00:00Z") }),
    run({ experimentId: "E9", experimentTitle: "probe transfer", stage: "dev-b", status: "done", podId: "pb",
      startedAt: at("2026-11-24T12:00:00Z"), endedAt: at("2026-11-24T14:00:00Z") }),
    run({ experimentId: "E9", experimentTitle: "probe transfer", stage: "held-out", status: "running", podId: "ph",
      capUsd: 15, progressPct: 62, eta: HELD_OUT_ETA, progressAt: at("2026-11-24T21:50:00Z"),
      startedAt: at("2026-11-24T19:00:00Z") }),
    run({ experimentId: "E9", experimentTitle: "probe transfer", stage: "llama-gemma", status: "failed", podId: "pl",
      startedAt: at("2026-11-24T14:00:00Z"), endedAt: at("2026-11-24T16:00:00Z"), endNote: "OOM at step 1200" }),
  ];
}

function snapshot(): RunpodSnapshot {
  return {
    pods: [
      pod("ph", "e9-held-out", "RUNNING", 0.6, "2026-11-24T19:00:00Z"),
      pod("pb", "e9-dev-b", "EXITED", 0.02, null), // finished run, pod still listed
      pod("px", "stray", "RUNNING", 1.0, "2026-11-24T20:00:00Z"),
      pod("pt", "old", "TERMINATED", 0.5, null),
    ],
    accountHours: [
      { startTime: at("2026-11-24T08:00:00Z"), endTime: at("2026-11-24T09:00:00Z"), totalAmount: 1.0 },
      { startTime: at("2026-11-24T20:00:00Z"), endTime: at("2026-11-24T21:00:00Z"), totalAmount: 2.0 },
    ],
    podHours: [
      bucket("pa", "2026-11-24T10:00:00Z", "2026-11-24T11:00:00Z", 3.0),
      bucket("pb", "2026-11-24T12:00:00Z", "2026-11-24T13:00:00Z", 4.0),
      bucket("ph", "2026-11-24T19:00:00Z", "2026-11-24T20:00:00Z", 0.6),
      bucket("ph", "2026-11-24T20:00:00Z", "2026-11-24T21:00:00Z", 0.6),
      bucket("px", "2026-11-24T20:00:00Z", "2026-11-24T21:00:00Z", 1.0),
    ],
  };
}

test("E9: stage summary, ETA, progress and per-run cost", () => {
  const dto = buildOverview({ runs: e9Runs(), snapshot: snapshot(), runpodState: "ok", now: NOW });
  const e9 = dto.experiments.find((e) => e.id === "E9")!;
  assert.equal(e9.title, "probe transfer");
  assert.equal(e9.summary, "2 done · 1 running · 1 failed");
  assert.equal(e9.eta, HELD_OUT_ETA.toISOString());
  assert.equal(e9.progressPct, 62);
  assert.equal(e9.expanded, true);
  assert.equal(e9.pods.length, 4);

  const heldOut = e9.pods.find((p) => p.stage === "held-out")!;
  assert.equal(heldOut.kind, "run");
  assert.equal(heldOut.status, "running");
  assert.equal(heldOut.capUsd, 15);
  assert.equal(heldOut.staleMinutes, null);
  // 1.20 billed + 1 h at $0.60 since the last billed hour.
  assert.ok(close(heldOut.cost, 1.8), `held-out cost ${heldOut.cost}`);

  // A finished run whose pod still exists keeps its cost on its own row.
  const devB = e9.pods.find((p) => p.stage === "dev-b")!;
  assert.equal(devB.status, "done");
  assert.ok(close(devB.cost, 4.0));
  assert.equal(devB.endedAt, "2026-11-24T14:00:00.000Z");
  // A finished run whose pod is gone still shows its billed cost, and is not "pod_gone".
  const devA = e9.pods.find((p) => p.stage === "dev-a")!;
  assert.equal(devA.status, "done");
  assert.ok(close(devA.cost, 3.0));
  assert.equal(devA.endNote, null);
  // Why a run ended reaches its row.
  const failed = e9.pods.find((p) => p.stage === "llama-gemma")!;
  assert.equal(failed.status, "failed");
  assert.equal(failed.endNote, "OOM at step 1200");

  assert.ok(close(e9.cost, 3.0 + 4.0 + 1.8 + 0), `E9 cost ${e9.cost}`);
});

test("top figures: pods running, spent today and next finish", () => {
  const dto = buildOverview({ runs: e9Runs(), snapshot: snapshot(), runpodState: "ok", now: NOW });
  assert.equal(dto.runpod, "ok");
  assert.equal(dto.podsRunning, 2);
  assert.equal(dto.podsRunningLabel, "E9 held-out, stray");
  assert.ok(dto.spent);
  assert.equal(dto.spent.billed, 3.0);
  // Last billed hour ends 21:00Z: ph $0.60 + px $1.00 for one hour.
  assert.ok(close(dto.spent.accruing, 1.6), `accruing ${dto.spent.accruing}`);
  assert.deepEqual(dto.next, { at: HELD_OUT_ETA.toISOString(), label: "in 1h 40m · E9 held-out" });
});

test("a pod no run claims appears first under Unassigned pods with its cost", () => {
  const dto = buildOverview({ runs: e9Runs(), snapshot: snapshot(), runpodState: "ok", now: NOW });
  const first = dto.experiments[0];
  assert.equal(first.id, "—");
  assert.equal(first.title, "Unassigned pods");
  assert.equal(first.pods.length, 1, "claimed pods (even of finished runs) and terminated pods are not unassigned");
  const stray = first.pods[0];
  assert.equal(stray.kind, "unassigned");
  assert.equal(stray.status, "unassigned");
  assert.equal(stray.podId, "px");
  assert.equal(stray.stage, "stray");
  assert.equal(stray.runId, null);
  assert.equal(stray.capUsd, null);
  assert.equal(stray.endNote, null);
  assert.ok(close(stray.cost, 2.0), `stray cost ${stray.cost}`); // $1 billed + 1 h accruing
  assert.ok(close(first.cost, 2.0));
});

test("an EXITED pod still listed and unclaimed is unassigned too", () => {
  const snap = snapshot();
  snap.pods.push(pod("pz", "parked", "EXITED", 0.01, null));
  const dto = buildOverview({ runs: e9Runs(), snapshot: snap, runpodState: "ok", now: NOW });
  assert.deepEqual(
    dto.experiments[0].pods.map((p) => p.podId),
    ["px", "pz"],
  );
  assert.equal(dto.podsRunning, 2, "EXITED pods are not counted as running");
});

test("a stage re-run counts once, by its latest run", () => {
  const runs = [
    run({ experimentId: "A5", stage: "side", status: "failed", podId: "q1",
      startedAt: at("2026-11-24T15:00:00Z"), endedAt: at("2026-11-24T16:00:00Z") }),
    run({ experimentId: "A5", stage: "side", status: "running", podId: "q2",
      startedAt: at("2026-11-24T16:30:00Z"), progressPct: 30, progressAt: at("2026-11-24T21:55:00Z") }),
  ];
  const dto = buildOverview({ runs, snapshot: null, runpodState: "not_connected", now: NOW });
  const a5 = dto.experiments.find((e) => e.id === "A5")!;
  assert.equal(a5.summary, "1 running");
  assert.equal(a5.progressPct, 30);
  assert.equal(a5.pods.length, 2, "both pods are still listed");
});

test("a running run whose pod RunPod no longer lists is pod_gone", () => {
  const runs = e9Runs();
  const snap = snapshot();
  snap.pods = snap.pods.filter((p) => p.id !== "ph");
  const dto = buildOverview({ runs, snapshot: snap, runpodState: "ok", now: NOW });
  const heldOut = dto.experiments.find((e) => e.id === "E9")!.pods.find((p) => p.stage === "held-out")!;
  assert.equal(heldOut.status, "pod_gone");
  assert.ok(close(heldOut.cost, 1.2), "billed hours still count, nothing accrues");
});

test("RunPod not connected: no figures, no pod_gone, no unassigned row", () => {
  const dto = buildOverview({ runs: e9Runs(), snapshot: null, runpodState: "not_connected", now: NOW });
  assert.equal(dto.runpod, "not_connected");
  assert.equal(dto.podsRunning, null);
  assert.equal(dto.spent, null);
  assert.ok(dto.experiments.every((e) => e.id !== "—"));
  const e9 = dto.experiments.find((e) => e.id === "E9")!;
  assert.ok(e9.pods.every((p) => p.status !== "pod_gone"));
  assert.equal(e9.pods.find((p) => p.stage === "held-out")!.status, "running");
  // The next finish comes from agent-reported ETAs, so it still shows.
  assert.deepEqual(dto.next, { at: HELD_OUT_ETA.toISOString(), label: "in 1h 40m · E9 held-out" });
});

test("progress 42 minutes old is stale", () => {
  const runs = [
    run({ experimentId: "E9", stage: "held-out", status: "running", podId: "ph",
      progressPct: 10, progressAt: at("2026-11-24T21:18:00Z"), startedAt: at("2026-11-24T20:00:00Z") }),
  ];
  const dto = buildOverview({ runs, snapshot: null, runpodState: "not_connected", now: NOW });
  assert.equal(dto.experiments[0].pods[0].staleMinutes, 42);
});

test("no running runs: next is null; experiments are collapsed and ordered by recent activity", () => {
  const runs = [
    run({ experimentId: "E7", stage: "a", status: "done", podId: "o1",
      startedAt: at("2026-11-20T10:00:00Z"), endedAt: at("2026-11-20T12:00:00Z") }),
    run({ experimentId: "E8", stage: "a", status: "stopped", podId: "o2",
      startedAt: at("2026-11-23T10:00:00Z"), endedAt: at("2026-11-23T12:00:00Z") }),
  ];
  const dto = buildOverview({ runs, snapshot: null, runpodState: "error", now: NOW });
  assert.equal(dto.next, null);
  assert.equal(dto.podsRunning, null);
  assert.deepEqual(dto.experiments.map((e) => e.id), ["E8", "E7"]);
  assert.ok(dto.experiments.every((e) => !e.expanded));
  assert.equal(dto.experiments[0].summary, "1 stopped");
  assert.equal(dto.experiments[0].eta, null);
});

test("experiments with a running run come first", () => {
  const runs = [
    ...e9Runs(),
    run({ experimentId: "E10", stage: "a", status: "done", podId: "n1",
      startedAt: at("2026-11-24T20:00:00Z"), endedAt: at("2026-11-24T21:59:00Z") }),
  ];
  const dto = buildOverview({ runs, snapshot: null, runpodState: "not_connected", now: NOW });
  assert.deepEqual(dto.experiments.map((e) => e.id), ["E9", "E10"]);
});

test("two runs on one pod split its cost by their own time; the experiment is not double-counted", () => {
  const now = at("2026-11-24T11:30:00Z");
  const runs = [
    run({ experimentId: "E9", stage: "dev-a", status: "done", podId: "pp",
      startedAt: at("2026-11-24T08:00:00Z"), endedAt: at("2026-11-24T10:00:00Z") }),
    run({ experimentId: "E9", stage: "dev-b", status: "running", podId: "pp",
      startedAt: at("2026-11-24T10:00:00Z") }),
  ];
  const snap: RunpodSnapshot = {
    pods: [pod("pp", "shared", "RUNNING", 0.5, "2026-11-24T08:00:00Z")],
    accountHours: [],
    podHours: [
      bucket("pp", "2026-11-24T08:00:00Z", "2026-11-24T09:00:00Z", 1.0),
      bucket("pp", "2026-11-24T09:00:00Z", "2026-11-24T10:00:00Z", 1.0),
      bucket("pp", "2026-11-24T10:00:00Z", "2026-11-24T11:00:00Z", 0.5),
    ],
  };
  const dto = buildOverview({ runs, snapshot: snap, runpodState: "ok", now });
  const e9 = dto.experiments.find((e) => e.id === "E9")!;
  const a = e9.pods.find((p) => p.stage === "dev-a")!;
  const b = e9.pods.find((p) => p.stage === "dev-b")!;
  assert.ok(close(a.cost, 2.0), `A ${a.cost}`);
  // $0.50 billed + 30 min at $0.50/h since the last billed hour.
  assert.ok(close(b.cost, 0.75), `B ${b.cost}`);
  assert.ok(close(e9.cost, 2.75), `E9 ${e9.cost}`);
  assert.ok(dto.experiments.every((e) => e.id !== "—"), "the shared pod is claimed, not unassigned");
});

test("without RunPod, money is unknown: costs are null, not zero", () => {
  for (const runpodState of ["not_connected", "error"] as const) {
    const dto = buildOverview({ runs: e9Runs(), snapshot: snapshot(), runpodState, now: NOW });
    for (const e of dto.experiments) {
      assert.equal(e.cost, null, `${runpodState}: experiment ${e.id}`);
      for (const p of e.pods) assert.equal(p.cost, null, `${runpodState}: pod row ${p.stage}`);
    }
  }
});
