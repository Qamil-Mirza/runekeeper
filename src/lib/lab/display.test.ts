import { test } from "node:test";
import assert from "node:assert/strict";
import {
  capMoney,
  clock,
  experimentLabel,
  showsBar,
  etaText,
  money,
  nextFigure,
  orderExperiments,
  spentFigure,
  staleText,
  untilText,
} from "./display";
import type { ExperimentRow, OverviewDTO, PodRow } from "./types";

// 2:30 PM Pacific on Nov 24.
const now = new Date("2026-11-24T22:30:00Z");
const sixTen = "2026-11-25T02:10:00.000Z"; // 6:10 PM PT, Nov 24

const pod = (over: Partial<PodRow> = {}): PodRow => ({
  kind: "run",
  runId: "r1",
  stage: "held-out",
  setupId: "fs-1",
  podId: "p1",
  capUsd: 15,
  cost: 7.12,
  status: "running",
  progressPct: 62,
  eta: null,
  staleMinutes: null,
  endedAt: null,
  ...over,
});

const exp = (id: string, pods: PodRow[] = []): ExperimentRow => ({
  id,
  title: null,
  summary: "",
  progressPct: null,
  eta: null,
  cost: null,
  expanded: false,
  pods,
});

const dto = (over: Partial<OverviewDTO> = {}): OverviewDTO => ({
  runpod: "ok",
  podsRunning: 0,
  podsRunningLabel: "",
  spent: { billed: 0, accruing: 0 },
  next: null,
  experiments: [],
  ...over,
});

test("money and caps", () => {
  assert.equal(money(14.8199), "$14.82");
  assert.equal(money(0), "$0.00");
  assert.equal(capMoney(12), "$12");
  assert.equal(capMoney(12.5), "$12.50");
});

test("clock adds the date only on another Pacific day", () => {
  assert.equal(clock(sixTen, now), "6:10 PM");
  assert.equal(clock("2026-11-25T17:45:00Z", now), "Nov 25, 9:45 AM");
});

test("past ETAs read overdue, never in 0m", () => {
  assert.deepEqual(etaText(sixTen, now), { text: "6:10 PM", overdue: false });
  assert.deepEqual(etaText("2026-11-24T22:00:00Z", now), { text: "overdue", overdue: true });
  assert.equal(untilText(sixTen, now), "in 3h 40m");
  assert.equal(untilText("2026-11-24T22:29:50Z", now), "overdue");
  assert.equal(untilText(now.toISOString(), now), "overdue");
  assert.equal(untilText("2026-11-24T22:30:10Z", now), "in 1m");
});

test("next pod figure: time with who, recomputed", () => {
  const f = nextFigure(dto({ next: { at: sixTen, label: "in 3h 50m · E9 held-out" }, podsRunning: 1 }), now);
  assert.deepEqual(f, { value: "6:10 PM", sub: "in 3h 40m · E9 held-out" });
  const late = nextFigure(
    dto({ next: { at: "2026-11-24T22:00:00Z", label: "in 0m · E9 held-out" }, podsRunning: 1 }),
    now,
  );
  assert.equal(late.sub, "overdue · E9 held-out");
});

test("next pod figure: running without an ETA, and nothing running", () => {
  assert.deepEqual(nextFigure(dto({ podsRunning: 2 }), now), { value: "—", sub: "no ETA reported" });
  // RunPod unknown, but an agent reports a running run.
  assert.deepEqual(
    nextFigure(dto({ podsRunning: null, experiments: [exp("E9", [pod()])] }), now),
    { value: "—", sub: "no ETA reported" },
  );
  assert.deepEqual(
    nextFigure(dto({ experiments: [exp("E9", [pod({ status: "done" })])] }), now),
    { value: "Nothing running", sub: "", quiet: true },
  );
});

test("spent figure mentions accruing money only when there is some", () => {
  assert.deepEqual(spentFigure({ billed: 14.82, accruing: 0 }), {
    value: "$14.82",
    sub: "since 12:00 AM PT",
  });
  assert.deepEqual(spentFigure({ billed: 10, accruing: 0.4 }), {
    value: "$10.40",
    sub: "since 12:00 AM PT · includes ~$0.40 still accruing",
  });
});

test("unassigned pods come first", () => {
  const ids = orderExperiments([exp("E9"), exp("—"), exp("A5")]).map((e) => e.id);
  assert.deepEqual(ids, ["—", "E9", "A5"]);
});

test("stale text", () => {
  assert.equal(staleText(42), "updated 42m ago");
  assert.equal(staleText(65), "updated 1h 5m ago");
});

test("experiment labels", () => {
  assert.equal(experimentLabel({ ...exp("E9"), title: "probe transfer" }), "E9 · probe transfer");
  assert.equal(experimentLabel(exp("A5")), "A5");
  assert.equal(experimentLabel({ ...exp("—"), title: "Unassigned pods" }), "Unassigned pods");
});

test("a bar only for a single stage that is running", () => {
  const one = { ...exp("A5", [pod()]), progressPct: 30 };
  assert.equal(showsBar(one), true);
  // The same stage re-run on a new pod is still one stage.
  assert.equal(showsBar({ ...one, pods: [pod({ status: "failed" }), pod()] }), true);
  assert.equal(showsBar({ ...one, pods: [pod({ stage: "dev-a", status: "done" }), pod()] }), false);
  assert.equal(showsBar({ ...one, progressPct: null }), false);
});
