import type { Task, Priority } from "@/lib/types";

export interface Digest {
  subject: string;
  html: string;
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const PRIORITY_COLOR: Record<Priority, string> = {
  high: "#dc2626",
  medium: "#d97706",
  low: "#6b7280",
};

/** Today's calendar date ("YYYY-MM-DD") in the given IANA timezone. */
function todayInTimezone(timezone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

/** Add `n` days to a "YYYY-MM-DD" date string (DST-safe — pure calendar math). */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sortByPriority(a: Task, b: Task): number {
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

function renderTask(t: Task): string {
  const color = PRIORITY_COLOR[t.priority];
  const due = t.dueDate ? ` · due ${escapeHtml(t.dueDate)}` : "";
  return `
    <li style="margin:0 0 8px 0;line-height:1.4;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;vertical-align:middle;"></span>
      <strong>${escapeHtml(t.title)}</strong>
      <span style="color:#6b7280;font-size:13px;">(${t.priority} · ${t.estimateMinutes}min${due})</span>
    </li>`;
}

function renderSection(heading: string, tasks: Task[], accent: string): string {
  if (tasks.length === 0) return "";
  const items = [...tasks].sort(sortByPriority).map(renderTask).join("");
  return `
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:${accent};margin:24px 0 8px 0;">
      ${escapeHtml(heading)} (${tasks.length})
    </h2>
    <ul style="list-style:none;padding:0;margin:0;">${items}</ul>`;
}

/**
 * Builds the daily digest email for a user's outstanding quests.
 * Returns `null` when there is nothing still to do (we don't send empty digests).
 */
export function buildDigest(tasks: Task[], timezone: string): Digest | null {
  const outstanding = tasks.filter((t) => t.status !== "done");
  if (outstanding.length === 0) return null;

  const today = todayInTimezone(timezone);
  const weekEnd = addDays(today, 7);

  const overdue: Task[] = [];
  const dueToday: Task[] = [];
  const dueThisWeek: Task[] = [];
  const upcoming: Task[] = [];
  const noDue: Task[] = [];

  for (const t of outstanding) {
    if (!t.dueDate) noDue.push(t);
    else if (t.dueDate < today) overdue.push(t);
    else if (t.dueDate === today) dueToday.push(t);
    else if (t.dueDate <= weekEnd) dueThisWeek.push(t);
    else upcoming.push(t);
  }

  const subject =
    overdue.length > 0
      ? `⚔️ ${outstanding.length} open quest${outstanding.length === 1 ? "" : "s"} — ${overdue.length} overdue`
      : `⚔️ ${outstanding.length} open quest${outstanding.length === 1 ? "" : "s"} on your log`;

  const sections = [
    renderSection("Overdue", overdue, "#dc2626"),
    renderSection("Due today", dueToday, "#d97706"),
    renderSection("Due this week", dueThisWeek, "#2563eb"),
    renderSection("Upcoming", upcoming, "#6b7280"),
    renderSection("No due date", noDue, "#6b7280"),
  ].join("");

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
    <h1 style="font-size:20px;margin:0 0 4px 0;">Your quest log</h1>
    <p style="color:#6b7280;font-size:14px;margin:0 0 8px 0;">
      ${outstanding.length} quest${outstanding.length === 1 ? "" : "s"} still to do as of ${escapeHtml(today)}.
    </p>
    ${sections}
    <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:12px;">
      Sent by Runekeeper · daily quest digest
    </p>
  </div>`;

  return { subject, html };
}
