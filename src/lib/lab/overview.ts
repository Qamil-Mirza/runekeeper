// Assembles the Overview DTO from agent-reported runs and a RunPod snapshot.
// Pure: no I/O, no clock reads (the caller passes `now`).

import type { ExperimentRow, OverviewDTO, OverviewRun, PodRow, RunStatus } from "./types";
import type { RunpodPod, RunpodSnapshot } from "./runpod";
import { podCost, runCost, spentToday, type Spend } from "./spend";
import { formatIn } from "./time";

const STALE_AFTER_MS = 20 * 60 * 1000;
const SUMMARY_ORDER: RunStatus[] = ["done", "running", "failed", "stopped"];
export const UNASSIGNED_ID = "—";

export interface BuildOverviewInput {
  runs: OverviewRun[];
  snapshot: RunpodSnapshot | null;
  runpodState: OverviewDTO["runpod"];
  now: Date;
}

const total = (c: Spend) => c.billed + c.accruing;
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const runLabel = (r: OverviewRun) => `${r.experimentId} ${r.stage}`;
// A pod that exists and may still bill: running, or stopped but keeping its disk.
const isListedBilling = (p: RunpodPod) => p.status === "RUNNING" || p.status === "EXITED";

function stageSummary(runs: OverviewRun[]): string {
  const latest = new Map<string, OverviewRun>();
  for (const r of runs) {
    const cur = latest.get(r.stage);
    if (!cur || r.startedAt.getTime() >= cur.startedAt.getTime()) latest.set(r.stage, r);
  }
  const counts = new Map<RunStatus, number>();
  for (const r of latest.values()) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  return SUMMARY_ORDER.filter((s) => counts.get(s))
    .map((s) => `${counts.get(s)} ${s}`)
    .join(" · ");
}

function lastActivity(runs: OverviewRun[]): number {
  let t = -Infinity;
  for (const r of runs) {
    for (const d of [r.startedAt, r.endedAt, r.progressAt]) if (d) t = Math.max(t, d.getTime());
  }
  return t;
}

export function buildOverview({ runs, snapshot, runpodState, now }: BuildOverviewInput): OverviewDTO {
  const snap = runpodState === "ok" ? snapshot : null;
  const podsById = new Map((snap?.pods ?? []).map((p) => [p.id, p]));
  const nowMs = now.getTime();

  // Money is unknown (null), not zero, without a RunPod snapshot.
  const runCostOf = (r: OverviewRun): number | null => {
    if (!snap) return null;
    return total(runCost(r, snap.podHours, podsById.get(r.podId), now));
  };
  const sumCosts = (pods: PodRow[]): number | null =>
    snap ? pods.reduce((s, p) => s + (p.cost ?? 0), 0) : null;

  const runRow = (r: OverviewRun): PodRow => {
    const running = r.status === "running";
    const sinceProgress = r.progressAt ? nowMs - r.progressAt.getTime() : null;
    return {
      kind: "run",
      runId: r.id,
      stage: r.stage,
      setupId: r.setupId,
      podId: r.podId,
      capUsd: r.capUsd,
      cost: runCostOf(r),
      status: running && snap && !podsById.has(r.podId) ? "pod_gone" : r.status,
      progressPct: r.progressPct,
      eta: iso(r.eta),
      staleMinutes:
        running && sinceProgress !== null && sinceProgress > STALE_AFTER_MS
          ? Math.floor(sinceProgress / 60_000)
          : null,
      endedAt: iso(r.endedAt),
    };
  };

  // Experiments, in first-seen order before sorting.
  const byExperiment = new Map<string, OverviewRun[]>();
  for (const r of runs) {
    const list = byExperiment.get(r.experimentId) ?? [];
    list.push(r);
    byExperiment.set(r.experimentId, list);
  }

  const experiments: (ExperimentRow & { _running: boolean; _activity: number })[] = [];
  for (const [id, list] of byExperiment) {
    const ordered = [...list].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    const pods = ordered.map(runRow);
    const running = ordered.filter((r) => r.status === "running");
    let eta: Date | null = null;
    for (const r of running) if (r.eta && (!eta || r.eta > eta)) eta = r.eta;
    experiments.push({
      id,
      title: ordered.find((r) => r.experimentTitle)?.experimentTitle ?? null,
      summary: stageSummary(ordered),
      progressPct: running.length === 1 ? running[0].progressPct : null,
      eta: iso(eta),
      cost: sumCosts(pods),
      expanded: running.length > 0,
      pods,
      _running: running.length > 0,
      _activity: lastActivity(ordered),
    });
  }
  experiments.sort(
    (a, b) =>
      Number(b._running) - Number(a._running) ||
      b._activity - a._activity ||
      a.id.localeCompare(b.id),
  );
  const rows: ExperimentRow[] = experiments.map(({ _running, _activity, ...row }) => row);

  // Pods RunPod lists that no run (running or finished) claims: no spend is hidden.
  if (snap) {
    const claimed = new Set(runs.map((r) => r.podId));
    const stray = snap.pods.filter((p) => isListedBilling(p) && !claimed.has(p.id));
    if (stray.length > 0) {
      const pods: PodRow[] = stray.map((p) => ({
        kind: "unassigned",
        runId: null,
        stage: p.name || p.id,
        setupId: null,
        podId: p.id,
        capUsd: null,
        cost: total(podCost(p.id, snap.podHours, p, now)),
        status: "unassigned",
        progressPct: null,
        eta: null,
        staleMinutes: null,
        endedAt: null,
      }));
      rows.unshift({
        id: UNASSIGNED_ID,
        title: "Unassigned pods",
        summary: stray.length === 1 ? "1 pod" : `${stray.length} pods`,
        progressPct: null,
        eta: null,
        cost: sumCosts(pods),
        expanded: true,
        pods,
      });
    }
  }

  // Top figures.
  let podsRunning: number | null = null;
  let podsRunningLabel = "";
  if (snap) {
    const live = snap.pods.filter((p) => p.status === "RUNNING");
    podsRunning = live.length;
    podsRunningLabel = live
      .map((p) => {
        const owners = runs.filter((r) => r.podId === p.id);
        const owner =
          owners.find((r) => r.status === "running") ??
          owners.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
        return owner ? runLabel(owner) : p.name || p.id;
      })
      .join(", ");
  }

  let nextRun: OverviewRun | null = null;
  for (const r of runs) {
    if (r.status === "running" && r.eta && (!nextRun || r.eta < nextRun.eta!)) nextRun = r;
  }
  const next = nextRun?.eta
    ? { at: nextRun.eta.toISOString(), label: `in ${formatIn(nextRun.eta.getTime() - nowMs)} · ${runLabel(nextRun)}` }
    : null;

  return {
    runpod: runpodState,
    podsRunning,
    podsRunningLabel,
    spent: snap ? spentToday(snap.accountHours, snap.pods, now) : null,
    next,
    experiments: rows,
  };
}
