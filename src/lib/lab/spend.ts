// Money from RunPod billing. "Billed" is only what RunPod has billed; the
// estimate for running pods since the last billed hour is kept apart as
// "accruing", so an estimate is never mixed silently into a billed figure.

import type { BillingBucket, RunpodPod } from "./runpod";
import { startOfPacificDay } from "./time";

const HOUR_MS = 60 * 60 * 1000;

export interface Spend {
  billed: number;
  accruing: number;
}

const isRunning = (p: RunpodPod | undefined): p is RunpodPod => p?.status === "RUNNING";

function lastEnd(hours: BillingBucket[]): number | null {
  let last: number | null = null;
  for (const b of hours) {
    const t = b.endTime.getTime();
    if (last === null || t > last) last = t;
  }
  return last;
}

function accrual(pod: RunpodPod, fromMs: number, now: Date): number {
  const from = Math.max(fromMs, pod.startedAt?.getTime() ?? -Infinity);
  if (!Number.isFinite(from)) return 0; // nothing to measure from
  const ms = Math.max(0, now.getTime() - from);
  return (pod.costPerHr * ms) / HOUR_MS;
}

function sum(hours: BillingBucket[]): number {
  let total = 0;
  for (const b of hours) total += b.totalAmount;
  return total;
}

// Today since 00:00 Pacific: account-wide billed hours plus running pods'
// cost since the end of the last billed hour (or day start if none yet).
export function spentToday(hours: BillingBucket[], pods: RunpodPod[], now: Date): Spend {
  const dayStart = startOfPacificDay(now).getTime();
  const from = Math.max(lastEnd(hours) ?? dayStart, dayStart);
  let accruing = 0;
  for (const p of pods) if (isRunning(p)) accruing += accrual(p, from, now);
  return { billed: sum(hours), accruing };
}

// One pod's cost: its billed hours plus, while it runs, its cost since its
// own last billed hour (or since it started, before its first bill).
export function podCost(
  podId: string,
  podHours: BillingBucket[],
  pod: RunpodPod | undefined,
  now: Date,
): Spend {
  const own = podHours.filter((b) => b.podId === podId);
  const billed = sum(own);
  if (!isRunning(pod)) return { billed, accruing: 0 };
  return { billed, accruing: accrual(pod, lastEnd(own) ?? -Infinity, now) };
}

export interface RunWindow {
  podId: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
}

// One run's cost on its pod: only the pod's billed hours that start at or
// after the run's start (floored to the hour) and, for an ended run, before
// its end. Several runs on one pod therefore split its cost. Accrual is
// added only while the run is running and the pod is RUNNING.
export function runCost(
  run: RunWindow,
  podHours: BillingBucket[],
  pod: RunpodPod | undefined,
  now: Date,
): Spend {
  const from = Math.floor(run.startedAt.getTime() / HOUR_MS) * HOUR_MS;
  const until = run.endedAt?.getTime() ?? Infinity;
  const own = podHours.filter((b) => {
    const t = b.startTime.getTime();
    return b.podId === run.podId && t >= from && t < until;
  });
  const billed = sum(own);
  if (run.status !== "running" || !isRunning(pod)) return { billed, accruing: 0 };
  return { billed, accruing: accrual(pod, Math.max(lastEnd(own) ?? from, from), now) };
}
