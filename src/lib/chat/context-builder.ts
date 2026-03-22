import type { Task, TimeBlock, WeekRange } from "@/lib/types";
import { toLocalDateStr } from "@/lib/utils";

function todayInTimezone(timezone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

// ── Today's Schedule ────────────────────────────────────────────────────────

export function buildTodaySchedule(
  blocks: TimeBlock[],
  timezone: string
): string {
  const todayStr = todayInTimezone(timezone);

  const todayBlocks = blocks
    .filter((b) => {
      const blockDate = new Date(b.start).toLocaleDateString("en-CA", {
        timeZone: timezone,
      });
      return blockDate === todayStr;
    })
    .sort((a, b) => a.start.localeCompare(b.start));

  if (todayBlocks.length === 0) {
    return "No events scheduled for today.";
  }

  return todayBlocks
    .map((b) => {
      const start = formatTimeCompact(b.start, timezone);
      const end = formatTimeCompact(b.end, timezone);
      const source = b.source === "google_calendar" ? " (via Google Calendar)" : "";
      const status = !b.committed ? " [proposed]" : "";
      return `- ${start} – ${end}: ${b.title} (${b.type}${source}${status})`;
    })
    .join("\n");
}

// ── Quest Summary ───────────────────────────────────────────────────────────

export function buildQuestSummary(
  tasks: Task[],
  blocks?: TimeBlock[],
  timezone?: string
): string {
  const unscheduled = tasks.filter((t) => t.status === "unscheduled");
  const scheduled = tasks.filter((t) => t.status === "scheduled");
  const done = tasks.filter((t) => t.status === "done");

  const lines: string[] = [];

  if (unscheduled.length > 0) {
    lines.push(
      `${unscheduled.length} unscheduled:`,
      ...unscheduled.map(
        (t) =>
          `  - ${t.title} (${t.priority}, ${t.estimateMinutes}min${t.dueDate ? `, due ${t.dueDate}` : ""}${t.notes ? ` — ${t.notes}` : ""})`
      )
    );
  }

  if (scheduled.length > 0) {
    lines.push(
      `${scheduled.length} scheduled:`,
      ...scheduled.map((t) => {
        const block = blocks?.find((b) => b.taskId === t.id);
        const timeStr = block && timezone
          ? ` @ ${formatTimeCompact(block.start, timezone)}–${formatTimeCompact(block.end, timezone)} on ${new Date(block.start).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: timezone })}`
          : "";
        return `  - ${t.title} (${t.priority}, ${t.estimateMinutes}min${timeStr}${t.notes ? ` — ${t.notes}` : ""})`;
      })
    );
  }

  if (done.length > 0) {
    lines.push(
      `${done.length} completed: ${done
        .slice(0, 3)
        .map((t) => t.title)
        .join(", ")}${done.length > 3 ? ` and ${done.length - 3} more` : ""}`
    );
  }

  if (lines.length === 0) {
    return "No quests in the log yet.";
  }

  return lines.join("\n");
}

// ── Week Overview ───────────────────────────────────────────────────────────

export function buildWeekOverview(
  blocks: TimeBlock[],
  weekRange: WeekRange,
  timezone?: string
): string {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const start = new Date(weekRange.start + "T00:00:00");
  const lines: string[] = [];

  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const dayStr = toLocalDateStr(day);
    const dayName = dayNames[day.getDay()];

    const dayBlocks = blocks.filter((b) => {
      const bDate = timezone
        ? new Date(b.start).toLocaleDateString("en-CA", { timeZone: timezone })
        : toLocalDateStr(new Date(b.start));
      return bDate === dayStr;
    });

    if (dayBlocks.length === 0) {
      lines.push(`${dayName}: free`);
    } else {
      const sorted = [...dayBlocks].sort((a, b) => a.start.localeCompare(b.start));
      const tz = timezone || "UTC";
      lines.push(`${dayName}: ${dayBlocks.length} blocks`);
      for (const b of sorted) {
        const start = formatTimeCompact(b.start, tz);
        const end = formatTimeCompact(b.end, tz);
        const status = !b.committed ? " [proposed]" : "";
        lines.push(`  - ${start}–${end}: ${b.title} (${b.type}${status})`);
      }
    }
  }

  return lines.join("\n");
}

// ── Tiered Context Orchestrator ─────────────────────────────────────────────

export function buildTieredContext(params: {
  blocks: TimeBlock[];
  tasks: Task[];
  weekRange: WeekRange;
  timezone: string;
  tokenBudget?: number;
}): {
  todaySchedule: string;
  questSummary: string;
  weekOverview: string;
} {
  const { blocks, tasks, weekRange, timezone, tokenBudget = 3000 } = params;

  const todaySchedule = buildTodaySchedule(blocks, timezone);
  const questSummary = buildQuestSummary(tasks, blocks, timezone);
  const weekOverview = buildWeekOverview(blocks, weekRange, timezone);

  // Estimate tokens
  const usedTokens =
    estimateTokens(todaySchedule) + estimateTokens(questSummary);

  // Include week overview only if within budget
  const finalWeekOverview =
    usedTokens + estimateTokens(weekOverview) <= tokenBudget
      ? weekOverview
      : `${blocks.length} blocks across the week`;

  return {
    todaySchedule,
    questSummary,
    weekOverview: finalWeekOverview,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTimeCompact(iso: string, timezone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  });
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
