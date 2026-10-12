import type {
  AgentAction,
  Lab,
  LabAction,
  LabAgent,
  LabBudget,
  LabConnectionStatus,
  LabErrorBody,
  LabJob,
  LabAsideReceipt,
  LabEscalation,
  ComputeDecisionConfirmation,
  LabComputeApprovals,
  LabFileDeletion,
  LabFileUsage,
  LabStorage,
  LabTempCleared,
  LabGitOps,
  LabJobPage,
  LabMessageReceipt,
  LabSnapshot,
  LabComputeRun,
  LabComputeRuns,
  LabDeletionReceipt,
  LabNetworkHost,
  LabNetworkHosts,
  NetworkHostAction,
  LabSummary,
  LabTranscriptItem,
  LabTranscriptPage,
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

function mutate<T>(url: string, body?: unknown, method: "POST" | "PATCH" | "DELETE" = "POST"): Promise<T> {
  return labFetch<T>(url, {
    method,
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

export function createLab(input: { name: string; brief?: string; repo?: string }) {
  return mutate<LabSnapshot>("/api/lab/labs", input);
}

export function fetchLabSnapshot(labId: string) {
  return labFetch<LabSnapshot>(`/api/lab/labs/${encodeURIComponent(labId)}`);
}

export function fetchGitOps(labId: string) {
  return labFetch<LabGitOps>(`/api/lab/labs/${encodeURIComponent(labId)}/git/ops`);
}

export function fetchComputeRuns(labId: string) {
  return labFetch<LabComputeRuns>(`/api/lab/labs/${encodeURIComponent(labId)}/compute/runs`);
}

/** Rentals waiting for the owner. Empty from a Lab Manager that has no such step. */
export async function fetchComputeApprovals(): Promise<LabComputeApprovals> {
  try {
    return await labFetch<LabComputeApprovals>("/api/lab/compute/approvals");
  } catch (err) {
    if (err instanceof LabApiError && err.status === 404) return { items: [] };
    throw err;
  }
}

/** Sends the owner's decision on one rental, with what they were shown. */
export function decideComputeRun(confirmation: ComputeDecisionConfirmation) {
  return mutate<LabComputeRun>(
    `/api/lab/compute/runs/${encodeURIComponent(confirmation.runId)}/${confirmation.decision}`,
    { confirmation }
  );
}

/** Clears an escalation from what waits for the owner. The note is kept on the record only. */
export function resolveEscalation(escalationId: string, note?: string) {
  return mutate<LabEscalation>(
    `/api/lab/escalations/${encodeURIComponent(escalationId)}/resolve`,
    note?.trim() ? { note } : {}
  );
}

export function cancelComputeRun(runId: string) {
  return mutate<LabComputeRun>(`/api/lab/compute/runs/${encodeURIComponent(runId)}/cancel`);
}

export function fetchStorage() {
  return labFetch<LabStorage>("/api/lab/storage");
}

export function fetchFileUsage(agentId: string, path: string) {
  return labFetch<LabFileUsage>(
    `/api/lab/agents/${encodeURIComponent(agentId)}/files/usage?path=${encodeURIComponent(path)}`
  );
}

/** Permanently deletes one file or directory of an agent's working directory. */
export function deleteAgentFile(agentId: string, path: string) {
  return mutate<LabFileDeletion>(`/api/lab/agents/${encodeURIComponent(agentId)}/files`, { path }, "DELETE");
}

export function clearAgentTemp(agentId: string) {
  return mutate<LabTempCleared>(`/api/lab/agents/${encodeURIComponent(agentId)}/files/clear-temp`);
}

export function fetchNetworkHosts() {
  return labFetch<LabNetworkHosts>("/api/lab/network/hosts");
}

export function setNetworkHost(host: string, action: NetworkHostAction) {
  return mutate<LabNetworkHost>(`/api/lab/network/hosts/${encodeURIComponent(host)}/${action}`);
}

/** Permanently deletes a lab; `confirmName` must be the lab's exact name. */
export function deleteLab(labId: string, confirmName: string) {
  return mutate<LabDeletionReceipt>(`/api/lab/labs/${encodeURIComponent(labId)}`, { confirmName }, "DELETE");
}

export function runLabAction(labId: string, action: LabAction) {
  return mutate<Lab>(`/api/lab/labs/${encodeURIComponent(labId)}/${action}`);
}

export function runAgentAction(agentId: string, action: AgentAction) {
  return mutate<LabAgent>(`/api/lab/agents/${encodeURIComponent(agentId)}/${action}`);
}

/** Newest items without a cursor; `before` pages back, `after` returns what is new. */
export function fetchAgentTranscript(
  agentId: string,
  q: { before?: string; after?: string; limit?: number } = {}
): Promise<LabTranscriptPage> {
  const params = new URLSearchParams();
  if (q.before) params.set("before", q.before);
  if (q.after) params.set("after", q.after);
  if (q.limit) params.set("limit", String(q.limit));
  const query = params.toString();
  return labFetch<LabTranscriptPage>(
    `/api/lab/agents/${encodeURIComponent(agentId)}/transcript${query ? `?${query}` : ""}`
  );
}

export function sendAgentMessage(agentId: string, text: string) {
  return mutate<LabMessageReceipt>(
    `/api/lab/agents/${encodeURIComponent(agentId)}/messages`,
    { text }
  );
}

/** A side question: answered by a copy of the agent's conversation, never seen by the agent. */
export function askAgentAside(agentId: string, text: string) {
  return mutate<LabAsideReceipt>(`/api/lab/agents/${encodeURIComponent(agentId)}/asides`, { text });
}

export function fetchAgentJobs(labId: string, agentId: string) {
  return labFetch<LabJobPage>(
    `/api/lab/labs/${encodeURIComponent(labId)}/jobs?agentId=${encodeURIComponent(agentId)}`
  );
}

export function cancelJob(jobId: string) {
  return mutate<LabJob>(`/api/lab/jobs/${encodeURIComponent(jobId)}/cancel`);
}

export function setRuntimeLimit(labId: string, wallClockMinutes: number) {
  return mutate<LabBudget>(`/api/lab/labs/${encodeURIComponent(labId)}/runtime-limit`, {
    wallClockMinutes,
  });
}

export function updateLabGoals(labId: string, goals: { objective: string; priorities: string[] }) {
  return mutate<Lab>(`/api/lab/labs/${encodeURIComponent(labId)}`, goals, "PATCH");
}

export function updateLabBrief(labId: string, brief: string) {
  return mutate<Lab>(`/api/lab/labs/${encodeURIComponent(labId)}`, { brief }, "PATCH");
}

/** The lab's newest tasks across all agents, newest first. */
export function fetchLabJobs(labId: string) {
  return labFetch<LabJobPage>(`/api/lab/labs/${encodeURIComponent(labId)}/jobs`);
}

export function reconcileJob(jobId: string, resolution: "acknowledge" | "retry") {
  return mutate<{ job: LabJob; retryJob?: LabJob }>(
    `/api/lab/jobs/${encodeURIComponent(jobId)}/reconcile`,
    { resolution }
  );
}
