import { createLogger } from "@/lib/logger";

const log = createLogger("pensive-client");

const API_BASE = "https://api.pensieve.co/api/b2s/v1";
const TOKEN_URL = "https://securetoken.googleapis.com/v1/token";
const REQUEST_TIMEOUT_MS = 15_000;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PensiveClass {
  clazzId: string;
  courseId: string;
  schoolId: string;
  year: number;
  season: string;
}

export interface PensiveAssignment {
  id: string;
  name: string;
  releaseAt: string | null; // ISO datetime
  dueAt: string | null; // ISO datetime
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class PensiveAuthError extends Error {
  constructor(message = "Pensive session expired — reconnect in the Nexus") {
    super(message);
    this.name = "PensiveAuthError";
  }
}

export class PensiveRateLimitError extends Error {
  constructor(message = "Pensive rate limit exceeded") {
    super(message);
    this.name = "PensiveRateLimitError";
  }
}

export function errorForStatus(status: number, context: string): Error {
  if (status === 401) return new PensiveAuthError();
  if (status === 429) return new PensiveRateLimitError();
  return new Error(`Pensive ${context} request failed (${status})`);
}

// ─── Normalisers ────────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function unexpectedShape(context: string): Error {
  log.warn({ context }, "pensive api returned unexpected shape");
  return new Error(`Pensive ${context} returned an unexpected shape`);
}

function epochToIso(v: unknown): string | null {
  return typeof v === "number" && v > 0 ? new Date(v).toISOString() : null;
}

export function normalizeClasses(json: unknown): PensiveClass[] {
  if (!isObject(json)) throw unexpectedShape("classes");
  const result: PensiveClass[] = [];
  for (const [key, raw] of Object.entries(json)) {
    if (!isObject(raw)) continue;
    const { year, season, course_id, school_id, clazz_id } = raw;
    if (typeof year !== "number" || typeof season !== "string") continue;
    if (typeof course_id !== "string" || typeof school_id !== "string") continue;
    result.push({
      clazzId: typeof clazz_id === "string" ? clazz_id : key,
      courseId: course_id,
      schoolId: school_id,
      year,
      season,
    });
  }
  return result;
}

export function normalizeAssignmentHeads(json: unknown): PensiveAssignment[] {
  if (!isObject(json)) throw unexpectedShape("assignment heads");
  const result: PensiveAssignment[] = [];
  for (const [id, raw] of Object.entries(json)) {
    if (!isObject(raw) || typeof raw.name !== "string") continue;
    result.push({
      id,
      name: raw.name,
      releaseAt: epochToIso(raw.release_time),
      dueAt: epochToIso(raw.due_time),
    });
  }
  return result;
}

export function normalizeSubmittedIds(json: unknown): Set<string> {
  const ids = new Set<string>();
  if (!isObject(json)) throw unexpectedShape("submissions");
  for (const [id, subs] of Object.entries(json)) {
    if (subs !== null && !Array.isArray(subs)) throw unexpectedShape("submissions");
    if (Array.isArray(subs) && subs.length > 0) ids.add(id);
  }
  return ids;
}

// ─── HTTP ───────────────────────────────────────────────────────────────────

export async function refreshIdToken(
  apiKey: string,
  refreshToken: string
): Promise<{ idToken: string; refreshToken: string }> {
  const res = await fetch(`${TOKEN_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    let reason = "";
    try {
      reason = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      // ignore
    }
    log.warn({ status: res.status, reason }, "pensive token refresh failed");
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new PensiveAuthError();
    }
    throw errorForStatus(res.status, "token refresh");
  }

  const data = (await res.json()) as { id_token?: string; refresh_token?: string };
  if (!data.id_token) throw new PensiveAuthError();
  return { idToken: data.id_token, refreshToken: data.refresh_token ?? refreshToken };
}

async function apiGet(idToken: string, path: string, params: Record<string, string>, context: string): Promise<unknown> {
  const url = `${API_BASE}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    log.warn({ path, status: res.status }, "pensive api request failed");
    throw errorForStatus(res.status, context);
  }
  return res.json();
}

export async function fetchClasses(idToken: string, uid: string): Promise<PensiveClass[]> {
  return normalizeClasses(await apiGet(idToken, "/dashboard-content", { target_uid: uid }, "classes"));
}

export async function fetchCourseName(idToken: string, schoolId: string, courseId: string): Promise<string> {
  const json = await apiGet(idToken, "/course", { school_id: schoolId, course_id: courseId }, "course");
  return isObject(json) && typeof json.name === "string" ? json.name : courseId;
}

export async function fetchAssignments(idToken: string, clazzId: string): Promise<PensiveAssignment[]> {
  return normalizeAssignmentHeads(await apiGet(idToken, "/assignment/heads", { clazz_id: clazzId }, "assignment heads"));
}

export async function fetchSubmittedIds(idToken: string, uid: string, clazzId: string): Promise<Set<string>> {
  return normalizeSubmittedIds(
    await apiGet(idToken, "/assignment-submission/user-class", { target_uid: uid, clazz_id: clazzId }, "submissions")
  );
}
