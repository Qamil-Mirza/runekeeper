/**
 * Shared time helpers for the notification schedulers (digest email + Goggins
 * call). Both run a per-minute tick that fires user-configured "HH:MM" slots in
 * the user's local timezone, so the slot-parsing and local-clock logic lives
 * here to avoid duplication.
 */

/** Current local date ("YYYY-MM-DD") and minutes-since-midnight in the given timezone. */
export function localNow(timezone: string): { date: string; minutes: number } {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA", { timeZone: timezone });
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const hh = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) % 24;
  const mm = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return { date, minutes: hh * 60 + mm };
}

/** Parse "HH:MM" to minutes-since-midnight, or null if malformed/out of range. */
export function parseSlot(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Resolve a list of configured "HH:MM" times into valid slots, falling back to
 * `defaults` when the list is empty/undefined. Malformed entries are dropped.
 */
export function resolveSlots(
  times: string[] | undefined,
  defaults: string[]
): { raw: string; mins: number }[] {
  const source = times && times.length > 0 ? times : defaults;
  return source
    .map((raw) => ({ raw, mins: parseSlot(raw) }))
    .filter((s): s is { raw: string; mins: number } => s.mins !== null);
}
