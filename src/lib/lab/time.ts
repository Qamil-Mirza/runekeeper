export const PACIFIC = "America/Los_Angeles";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

type Wall = { y: number; m: number; d: number; h: number; mi: number; s: number };

function wallOf(date: Date): Wall {
  const get: Record<string, number> = {};
  for (const p of partsFmt.formatToParts(date)) {
    if (p.type !== "literal") get[p.type] = Number(p.value);
  }
  return { y: get.year, m: get.month, d: get.day, h: get.hour, mi: get.minute, s: get.second };
}

// Pacific offset from UTC in ms at the given instant (negative in the US).
function offsetAt(ms: number): number {
  const w = wallOf(new Date(ms));
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

// The instant at which Pacific wall clocks read the given time.
function wallToInstant(y: number, m: number, d: number, h: number, mi: number): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offsetAt(guess);
  const off2 = offsetAt(t);
  if (guess - off2 !== t) t = guess - off2;
  return new Date(t);
}

export function startOfPacificDay(now: Date): Date {
  const w = wallOf(now);
  return wallToInstant(w.y, w.m, w.d, 0, 0);
}

const MAX_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function parseEta(input: string, now: Date): Date | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  let result: Date | null = null;
  const hm = HHMM.exec(s);
  if (hm) {
    const w = wallOf(now);
    const h = Number(hm[1]);
    const mi = Number(hm[2]);
    let c = wallToInstant(w.y, w.m, w.d, h, mi);
    if (c.getTime() < now.getTime()) {
      const next = new Date(Date.UTC(w.y, w.m - 1, w.d + 1));
      c = wallToInstant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), h, mi);
    }
    result = c;
  } else if (ISO_WITH_OFFSET.test(s)) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) result = new Date(t);
  }
  if (!result) return null;
  if (result.getTime() - now.getTime() > MAX_AHEAD_MS) return null;
  return result;
}

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC,
  month: "short",
  day: "numeric",
});

export function formatPacificTime(d: Date): string {
  return timeFmt.format(d).replace(/ /g, " ");
}

export function formatPacificDate(d: Date): string {
  return dateFmt.format(d);
}

export function formatIn(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
