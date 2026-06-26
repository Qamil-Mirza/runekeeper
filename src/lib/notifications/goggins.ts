import type { Task } from "@/lib/types";

const MAX_NAMED = 3; // read out at most this many quests by name before summarizing

/** Whole days between two "YYYY-MM-DD" dates (b - a), DST-safe (pure UTC math). */
function daysBetween(a: string, b: string): number {
  const da = Date.parse(a + "T00:00:00Z");
  const db = Date.parse(b + "T00:00:00Z");
  return Math.round((db - da) / 86_400_000);
}

/** "1 day" / "N days" — for natural read-aloud. */
function dayPhrase(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

/**
 * Builds the spoken accountability script for a user's overdue quests, in a
 * generic intense drill-sergeant register (deliberately NOT impersonating any
 * real person). Returns `null` when there is nothing overdue, mirroring
 * `buildDigest` — the caller skips the call entirely in that case.
 *
 * `today` is the user's local date ("YYYY-MM-DD"); pass it in so this stays a
 * pure, testable function. `overdue` is expected to already be filtered to
 * not-done tasks with a `dueDate` strictly before today.
 */
export function buildGogginsRant(overdue: Task[], today: string): string | null {
  if (overdue.length === 0) return null;

  // Most overdue first — the worst offender leads.
  const sorted = [...overdue].sort((a, b) =>
    (a.dueDate ?? "").localeCompare(b.dueDate ?? "")
  );

  const named = sorted.slice(0, MAX_NAMED);
  const remaining = sorted.length - named.length;

  const callouts = named
    .map((t) => {
      const days = t.dueDate ? daysBetween(t.dueDate, today) : 0;
      return `"${t.title}" was due ${dayPhrase(days)} ago, and it is STILL not done.`;
    })
    .join(" ");

  const count = sorted.length === 1 ? "one quest" : `${sorted.length} quests`;
  const moreClause =
    remaining > 0
      ? `And that is not even all of it — you have ${remaining} more sitting there too.`
      : "";

  return [
    "Wake up. This is your accountability call.",
    `You have ${count} past due on your quest log right now.`,
    callouts,
    moreClause,
    "You set these deadlines. Nobody else did.",
    "Nobody is coming to save you. Stop negotiating with yourself, stop making excuses, and get it DONE.",
    "No more zero days. Go knock it out. Now.",
  ]
    .filter(Boolean)
    .join(" ");
}
