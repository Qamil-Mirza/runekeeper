"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** A failed Lab request. `status` is the HTTP status, or 0 when nothing answered. */
export class LabRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LabRequestError";
  }
}

function messageOf(body: unknown, status: number): string {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === "string" && message ? message : `Request failed (${status})`;
}

/**
 * Whether the Lab exists for the signed-in user: `undefined` while asking,
 * `false` for everyone who is not a configured owner.
 */
export function useLabAccess(): boolean | undefined {
  const [access, setAccess] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/lab/access", { cache: "no-store" })
      .then((res) => !cancelled && setAccess(res.ok))
      // Runekeeper itself did not answer: do not advertise the Lab.
      .catch(() => !cancelled && setAccess(false));
    return () => {
      cancelled = true;
    };
  }, []);
  return access;
}

/** A polled resource: the last good data, the last error, and a way to poll now. */
export interface Polled<T> {
  data: T | null;
  error: string | null;
  refresh(): void;
}

/**
 * GETs `url` now and every `ms`. Pauses while the browser tab is hidden and
 * refreshes as soon as it is visible again. A failed poll keeps the last data.
 */
export function usePolled<T>(url: string, ms: number): Polled<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only the newest request may write state; bumped on unmount too.
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const body: unknown = await res.json().catch(() => null);
      if (id !== seq.current) return;
      if (!res.ok) {
        setError(messageOf(body, res.status));
        return;
      }
      setData(body as T);
      setError(null);
    } catch {
      if (id === seq.current) setError("Runekeeper didn't answer");
    }
  }, [url]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      void load();
      timer = setInterval(() => void load(), ms);
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      seq.current++;
    };
  }, [load, ms]);

  const refresh = useCallback(() => void load(), [load]);
  return { data, error, refresh };
}

/** The current time, ticking every `ms` so relative times stay right between polls. */
export function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

/** GETs JSON once. Throws a `LabRequestError` carrying the API's message. */
export async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new LabRequestError("Runekeeper didn't answer", 0);
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new LabRequestError(messageOf(json, res.status), res.status);
  return json as T;
}

/** POSTs JSON. Throws a `LabRequestError` carrying the API's message. */
export async function postJson(url: string, body: object): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LabRequestError("Runekeeper didn't answer", 0);
  }
  if (res.ok) return;
  const json: unknown = await res.json().catch(() => null);
  throw new LabRequestError(messageOf(json, res.status), res.status);
}
