// How the Overview shows its figures. Pure (the caller passes `now`) and free
// of server imports: the client uses it.

import type { ExperimentRow, OverviewDTO } from "./types";
import { UNASSIGNED_ID } from "./overview";
import { formatIn, formatPacificDate, formatPacificTime } from "./time";

export function money(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/** Caps are usually whole dollars: "$12", but "$12.50" when they are not. */
export function capMoney(usd: number): string {
  return Number.isInteger(usd) ? `$${usd}` : money(usd);
}

/** "6:10 PM" today, "Nov 25, 6:10 PM" on any other Pacific day. */
export function clock(iso: string, now: Date): string {
  const d = new Date(iso);
  const time = formatPacificTime(d);
  return formatPacificDate(d) === formatPacificDate(now) ? time : `${formatPacificDate(d)}, ${time}`;
}

export function isOverdue(iso: string, now: Date): boolean {
  return new Date(iso).getTime() <= now.getTime();
}

/** An ETA cell: the time, or "overdue" once it has passed. */
export function etaText(iso: string, now: Date): { text: string; overdue: boolean } {
  if (isOverdue(iso, now)) return { text: "overdue", overdue: true };
  return { text: clock(iso, now), overdue: false };
}

/** "in 1h 40m", or "overdue" once the time has passed (never "in 0m"). */
export function untilText(iso: string, now: Date): string {
  const ms = new Date(iso).getTime() - now.getTime();
  // Under a minute left still reads "in 1m", not "in 0m".
  return ms <= 0 ? "overdue" : `in ${formatIn(Math.max(ms, 60_000))}`;
}

export function anyPodRunning(dto: OverviewDTO): boolean {
  if ((dto.podsRunning ?? 0) > 0) return true;
  return dto.experiments.some((e) => e.pods.some((p) => p.status === "running"));
}

export interface Figure {
  value: string;
  sub: string;
  /** The value is a word, not a number: shown smaller and dim. */
  quiet?: boolean;
}

/** "Next pod finishes": the earliest ETA, recomputed against `now`. */
export function nextFigure(dto: OverviewDTO, now: Date): Figure {
  if (dto.next) {
    // The server's label is "in 1h 40m · E9 held-out"; keep only who, and
    // recompute when, so it stays right between polls.
    const m = /^in [^·]*· (.*)$/.exec(dto.next.label);
    const who = m ? m[1] : dto.next.label;
    const when = untilText(dto.next.at, now);
    return { value: clock(dto.next.at, now), sub: who ? `${when} · ${who}` : when };
  }
  if (anyPodRunning(dto)) return { value: "—", sub: "no ETA reported" };
  return { value: "Nothing running", sub: "", quiet: true };
}

export function spentFigure(spent: { billed: number; accruing: number }): Figure {
  const base = "since 12:00 AM PT";
  return {
    value: money(spent.billed + spent.accruing),
    sub: spent.accruing > 0 ? `${base} · includes ~${money(spent.accruing)} still accruing` : base,
  };
}

/** The "Unassigned pods" row first, the rest in the server's order. */
export function orderExperiments(rows: ExperimentRow[]): ExperimentRow[] {
  return [...rows.filter((r) => r.id === UNASSIGNED_ID), ...rows.filter((r) => r.id !== UNASSIGNED_ID)];
}

/** "E9 · probe transfer"; the synthetic unassigned row is just its title. */
export function experimentLabel(e: ExperimentRow): string {
  if (e.id === UNASSIGNED_ID) return e.title ?? "Unassigned pods";
  return e.title ? `${e.id} · ${e.title}` : e.id;
}

/**
 * An experiment row shows a progress bar only when it is one stage with one
 * running run; otherwise its stage summary ("2 done · 1 running").
 */
export function showsBar(e: ExperimentRow): boolean {
  return e.progressPct !== null && new Set(e.pods.map((p) => p.stage)).size === 1;
}

export function staleText(minutes: number): string {
  return `updated ${formatIn(minutes * 60_000)} ago`;
}
