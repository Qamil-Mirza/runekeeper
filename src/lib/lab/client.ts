import type {
  AgentAction,
  Lab,
  LabAction,
  LabAgent,
  LabConnectionStatus,
  LabErrorBody,
  LabSnapshot,
  LabSummary,
  LabTranscriptItem,
} from "./types";

// Browser-side calls to Runekeeper's own /api/lab routes. The Lab Manager's
// address and credentials never reach this file.

export class LabApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "LabApiError";
  }

  get unreachable() {
    return this.code === "manager_unreachable" || this.code === "network_error";
  }
}

async function labFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new LabApiError(0, "network_error", "Could not reach Runekeeper", true);
  }
  const body = (await res.json().catch(() => null)) as unknown;
  if (res.ok) return body as T;
  const error = (body as Partial<LabErrorBody> | null)?.error;
  throw new LabApiError(
    res.status,
    typeof error?.code === "string" ? error.code : "internal_error",
    typeof error?.message === "string" ? error.message : res.statusText,
    error?.retryable === true
  );
}

function mutate<T>(url: string, body?: unknown): Promise<T> {
  return labFetch<T>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // One key per user action, so a retried click cannot act twice.
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body ?? {}),
  });
}

/** Resolves to null when the Lab does not exist for this user (404). */
export async function fetchLabStatus(): Promise<LabConnectionStatus | null> {
  try {
    return await labFetch<LabConnectionStatus>("/api/lab/status");
  } catch (err) {
    if (err instanceof LabApiError && (err.status === 404 || err.status === 401)) {
      return null;
    }
    throw err;
  }
}

export async function fetchLabs(): Promise<LabSummary[]> {
  return (await labFetch<{ items: LabSummary[] }>("/api/lab/labs")).items;
}

export function createLab(input: { name: string; objective?: string }) {
  return mutate<LabSnapshot>("/api/lab/labs", input);
}

export function fetchLabSnapshot(labId: string) {
  return labFetch<LabSnapshot>(`/api/lab/labs/${encodeURIComponent(labId)}`);
}

export function runLabAction(labId: string, action: LabAction) {
  return mutate<Lab>(`/api/lab/labs/${encodeURIComponent(labId)}/${action}`);
}

export function runAgentAction(agentId: string, action: AgentAction) {
  return mutate<LabAgent>(`/api/lab/agents/${encodeURIComponent(agentId)}/${action}`);
}

export async function fetchAgentTranscript(agentId: string): Promise<LabTranscriptItem[]> {
  return (
    await labFetch<{ items: LabTranscriptItem[] }>(
      `/api/lab/agents/${encodeURIComponent(agentId)}/transcript`
    )
  ).items;
}
