// How the Protocols and Reports boards sort and label their cards. Pure (the
// caller passes `now`) and free of server imports: the client uses it.

import type { ProtocolCard, ProtocolDetail, ReportCard } from "./types";
import { formatPacificDate, formatPacificTime } from "./time";

/** A card's date: "3:12 PM" today, "Nov 23" on any other Pacific day. */
export function cardDate(iso: string, now: Date): string {
  const d = new Date(iso);
  const day = formatPacificDate(d);
  return day === formatPacificDate(now) ? formatPacificTime(d) : day;
}

/** "Nov 24, 3:12 PM". */
export function fullDate(iso: string): string {
  const d = new Date(iso);
  return `${formatPacificDate(d)}, ${formatPacificTime(d)}`;
}

/** "E10 · cross-family steering", or just the title without an experiment. */
export function titleOf(experiment: string | null, title: string): string {
  return experiment ? `${experiment} · ${title}` : title;
}

/** The protocol board's columns, in the server's order. Superseded ones are never shown. */
export function protocolColumns(cards: ProtocolCard[]): Record<"waiting" | "accepted" | "rejected", ProtocolCard[]> {
  return {
    waiting: cards.filter((c) => c.status === "waiting"),
    accepted: cards.filter((c) => c.status === "accepted"),
    rejected: cards.filter((c) => c.status === "rejected"),
  };
}

export type ReportColumn = "unread" | "read" | "replied";

export function reportColumn(c: Pick<ReportCard, "read" | "replies">): ReportColumn {
  if (c.replies.length > 0) return "replied";
  return c.read ? "read" : "unread";
}

/** 'revises v1, which you rejected: "…"'; just "revises v1" if v1 was replaced undecided. */
export function revisesLine(previous: ProtocolDetail["previous"]): string | null {
  if (!previous) return null;
  const base = `revises v${previous.version}`;
  if (previous.status !== "accepted" && previous.status !== "rejected") return base;
  const verdict = `${base}, which you ${previous.status}`;
  return previous.note ? `${verdict}: "${previous.note}"` : verdict;
}
