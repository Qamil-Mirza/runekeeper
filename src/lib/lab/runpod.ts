// Read-only RunPod client. The Lab never calls a RunPod write endpoint: this
// module only issues GET requests, and the client exposes only three reads.

import { startOfPacificDay } from "./time";

const BASE = "https://api.runpod.io/v2";
const TIMEOUT_MS = 10_000;
const MAX_POD_PAGES = 50;
const CACHE_TTL_MS = 30_000;
const HOUR_MS = 60 * 60 * 1000;

export interface RunpodPod {
  id: string;
  name: string;
  status: string;
  costPerHr: number;
  startedAt: Date | null;
}

export interface BillingBucket {
  startTime: Date;
  endTime: Date;
  totalAmount: number;
  podId?: string;
}

export interface RunpodSnapshot {
  pods: RunpodPod[];
  // Hourly buckets across every resource type, from 00:00 Pacific today.
  accountHours: BillingBucket[];
  // Hourly buckets per pod, from `since` floored to the hour.
  podHours: BillingBucket[];
}

export interface RunpodClient {
  pods(): Promise<RunpodPod[]>;
  accountHours(start: Date, end: Date): Promise<BillingBucket[]>;
  podHours(start: Date, end: Date): Promise<BillingBucket[]>;
}

export class RunpodError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`RunPod answered ${status} on ${path}`);
    this.name = "RunpodError";
  }
}

type Json = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const date = (v: unknown): Date | null => {
  if (typeof v !== "string" || v === "") return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
};
const records = (body: Json, field: string): Json[] => {
  const v = body[field];
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Json[]) : [];
};

function toPod(p: Json): RunpodPod {
  return {
    id: str(p.id),
    name: str(p.name),
    status: str(p.status),
    costPerHr: num(p.cost),
    startedAt: date(p.startedAt),
  };
}

function toBucket(r: Json, withPod: boolean): BillingBucket | null {
  const startTime = date(r.startTime);
  const endTime = date(r.endTime);
  if (!startTime || !endTime) return null;
  const b: BillingBucket = { startTime, endTime, totalAmount: num(r.totalAmount) };
  if (withPod) b.podId = str(r.podId);
  return b;
}

export function createRunpodClient(key: string, fetchImpl: typeof fetch = fetch): RunpodClient {
  async function get(path: string, params: Record<string, string>): Promise<Json> {
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new RunpodError(res.status, path);
    const body: unknown = await res.json();
    return body && typeof body === "object" ? (body as Json) : {};
  }

  // Both times always travel together: /billing rejects one without the other.
  async function hours(path: string, start: Date, end: Date, withPod: boolean) {
    const body = await get(path, {
      bucketSize: "hour",
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });
    return records(body, "records")
      .map((r) => toBucket(r, withPod))
      .filter((b): b is BillingBucket => b !== null);
  }

  return Object.freeze({
    async pods() {
      const out: RunpodPod[] = [];
      const seen = new Set<string>();
      let cursor: string | null = null;
      for (let page = 0; page < MAX_POD_PAGES; page++) {
        const body = await get("/pods", cursor ? { cursor } : {});
        out.push(...records(body, "pods").map(toPod));
        const pg = (body.pagination ?? {}) as Json;
        const next = typeof pg.nextCursor === "string" && pg.nextCursor !== "" ? pg.nextCursor : null;
        if (!pg.hasNextPage || !next || seen.has(next)) break;
        seen.add(next);
        cursor = next;
      }
      return out;
    },
    accountHours: (start: Date, end: Date) => hours("/billing", start, end, false),
    podHours: (start: Date, end: Date) => hours("/billing/pods", start, end, true),
  });
}

// ─── Snapshot with a short server-side cache ─────────────────────────────────
// Several open tabs refresh every 30 s; one RunPod read serves them all.
// Keyed by `since` floored to the hour. Failures are never cached.

type CacheEntry = { at: number; value: Promise<RunpodSnapshot> };
const cache = new Map<string, CacheEntry>();

export function _resetRunpodCache(): void {
  cache.clear();
}

export async function getRunpodSnapshot(
  key: string,
  now: Date,
  since: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<RunpodSnapshot | { error: string }> {
  const sinceHour = new Date(Math.floor(since.getTime() / HOUR_MS) * HOUR_MS);
  const cacheKey = sinceHour.toISOString();
  const t = now.getTime();

  for (const [k, e] of cache) if (t - e.at >= CACHE_TTL_MS || t < e.at) cache.delete(k);
  let entry = cache.get(cacheKey);
  if (!entry) {
    const client = createRunpodClient(key, fetchImpl);
    const value = Promise.all([
      client.pods(),
      client.accountHours(startOfPacificDay(now), now),
      client.podHours(sinceHour, now),
    ]).then(([pods, accountHours, podHours]) => ({ pods, accountHours, podHours }));
    entry = { at: t, value };
    cache.set(cacheKey, entry);
  }
  try {
    return await entry.value;
  } catch (e) {
    if (cache.get(cacheKey) === entry) cache.delete(cacheKey);
    if (e instanceof RunpodError) return { error: e.message };
    return { error: "RunPod could not be reached" };
  }
}
