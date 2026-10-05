// Pure helpers for the Pensive integration (no I/O, no app imports).

// ─── Auth record ────────────────────────────────────────────────────────────

export interface PensiveAuth {
  uid: string;
  apiKey: string;
  refreshToken: string;
}

export class InvalidAuthRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAuthRecordError";
  }
}

/**
 * Parse the Firebase auth record copied from Pensive's IndexedDB
 * (firebaseLocalStorageDb → firebaseLocalStorage → firebase:authUser:… value).
 * Accepts either the value object or the whole row ({ fbase_key, value }).
 */
export function parseAuthRecord(raw: string): PensiveAuth {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new InvalidAuthRecordError(
      "That doesn't look like JSON — copy the whole value of the firebase:authUser entry"
    );
  }

  let obj = parsed as Record<string, unknown> | null;
  if (obj && typeof obj === "object" && obj.value && typeof obj.value === "object") {
    obj = obj.value as Record<string, unknown>;
  }
  if (!obj || typeof obj !== "object") {
    throw new InvalidAuthRecordError("Expected a JSON object");
  }

  const sts = obj.stsTokenManager as Record<string, unknown> | undefined;
  const uid = obj.uid;
  const apiKey = obj.apiKey;
  const refreshToken = sts?.refreshToken;

  const missing = [
    typeof uid === "string" && uid ? null : "uid",
    typeof apiKey === "string" && apiKey ? null : "apiKey",
    typeof refreshToken === "string" && refreshToken ? null : "stsTokenManager.refreshToken",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new InvalidAuthRecordError(`Auth record is missing: ${missing.join(", ")}`);
  }

  return { uid: uid as string, apiKey: apiKey as string, refreshToken: refreshToken as string };
}

// ─── Term filtering ─────────────────────────────────────────────────────────

export interface TermTagged {
  year: number;
  season: string;
}

const SEASON_ORDER = ["winter", "spring", "summer", "fall"];

function termScore(t: TermTagged): number {
  const idx = SEASON_ORDER.indexOf(t.season.toLowerCase());
  return t.year * 10 + (idx >= 0 ? idx : 0);
}

export function pickCurrentTerm<T extends TermTagged>(classes: T[]): T[] {
  if (classes.length === 0) return classes;
  const best = Math.max(...classes.map(termScore));
  return classes.filter((c) => termScore(c) === best);
}

// ─── Assignment selection ───────────────────────────────────────────────────

export interface AssignmentLike {
  id: string;
  releaseAt: string | null;
  dueAt: string | null;
}

export function selectImportable<T extends AssignmentLike>(
  assignments: T[],
  submittedIds: Set<string>,
  now: Date
): T[] {
  const nowMs = now.getTime();
  return assignments.filter((a) => {
    if (!a.dueAt || new Date(a.dueAt).getTime() <= nowMs) return false;
    if (a.releaseAt && new Date(a.releaseAt).getTime() > nowMs) return false;
    if (submittedIds.has(a.id)) return false;
    return true;
  });
}

// ─── Task formatting ────────────────────────────────────────────────────────

export function computePriority(dueAt: string, now: Date = new Date()): "high" | "medium" | "low" {
  const daysUntilDue = (new Date(dueAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntilDue <= 2) return "high";
  if (daysUntilDue <= 7) return "medium";
  return "low";
}

export function toDueDate(dueAt: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dueAt));
}

export function formatDueTime(dueAt: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(dueAt));
}
