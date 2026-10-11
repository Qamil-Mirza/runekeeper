import { request as httpRequest, type RequestOptions } from "http";
import type { LabConfig } from "./config";
import {
  SUPPORTED_API_MAJOR,
  type AgentAction,
  type Lab,
  type LabAction,
  type LabAgent,
  type LabBudget,
  type LabClientErrorCode,
  type LabConnectionStatus,
  type LabDeletionReceipt,
  type LabNetworkHost,
  type LabNetworkHosts,
  type NetworkHostAction,
  type LabHealth,
  type LabJob,
  type LabJobPage,
  type LabSnapshot,
  type LabSummary,
  type LabTranscriptItem,
  type LabTranscriptPage,
} from "./types";

/**
 * Server-side client for the Lab Manager. Never import this from a client
 * component: it carries the service token.
 */

export interface LabActor {
  id: string;
  email: string;
}

export class LabManagerError extends Error {
  constructor(
    readonly status: number,
    readonly code: LabClientErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "LabManagerError";
  }
}

const DEFAULT_TIMEOUT_MS = 5_000;
const HEALTH_TIMEOUT_MS = 1_500;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

// Ids are opaque in the contract; this only keeps them from changing the path.
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

export function isValidLabId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

export function isValidIdempotencyKey(key: unknown): key is string {
  return typeof key === "string" && IDEMPOTENCY_KEY_RE.test(key);
}

interface CallOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  /** Omitted only for the unauthenticated health call. */
  actor?: LabActor;
  idempotencyKey?: string;
  body?: unknown;
  timeoutMs?: number;
}

const UNREACHABLE_CODES = new Set([
  "ENOENT", // socket file absent: manager not started
  "ECONNREFUSED", // stale socket or nothing listening
  "EACCES", // socket group not granted to this process
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
]);

function unreachable(reason: string): LabManagerError {
  return new LabManagerError(
    503,
    "manager_unreachable",
    `Lab Manager unreachable (${reason})`,
    true
  );
}

async function call<T>(config: LabConfig, opts: CallOptions): Promise<T> {
  const payload =
    opts.body === undefined ? undefined : Buffer.from(JSON.stringify(opts.body));

  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.actor) {
    headers.Authorization = `Bearer ${config.token}`;
    headers["X-Lab-Actor-Id"] = opts.actor.id;
    headers["X-Lab-Actor-Email"] = opts.actor.email;
  }
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  if (payload) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = String(payload.length);
  }

  const requestOptions: RequestOptions = {
    method: opts.method,
    path: opts.path,
    headers,
    ...(config.transport.kind === "unix"
      ? { socketPath: config.transport.socketPath }
      : { host: config.transport.host, port: config.transport.port }),
  };

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const { status, text } = await new Promise<{ status: number; text: string }>(
    (resolve, reject) => {
      const req = httpRequest(requestOptions, (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            req.destroy();
            reject(
              new LabManagerError(
                502,
                "manager_bad_response",
                "Lab Manager response exceeded the size limit",
                false
              )
            );
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf8"),
          })
        );
        res.on("error", () => reject(unreachable("connection lost")));
      });

      // Covers connect, send and the wait for a response.
      const timer = setTimeout(() => {
        req.destroy();
        reject(unreachable("timeout"));
      }, timeoutMs);
      req.on("close", () => clearTimeout(timer));

      req.on("error", (err: NodeJS.ErrnoException) => {
        if (err instanceof LabManagerError) return reject(err);
        reject(
          unreachable(
            err.code && UNREACHABLE_CODES.has(err.code) ? err.code : "error"
          )
        );
      });

      if (payload) req.write(payload);
      req.end();
    }
  );

  let json: unknown = undefined;
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new LabManagerError(
        502,
        "manager_bad_response",
        "Lab Manager returned a non-JSON response",
        false
      );
    }
  }

  if (status >= 200 && status < 300) return json as T;

  const envelope = (json as { error?: Record<string, unknown> } | undefined)
    ?.error;
  if (envelope && typeof envelope.code === "string") {
    throw new LabManagerError(
      status,
      envelope.code as LabClientErrorCode,
      typeof envelope.message === "string" ? envelope.message : "Lab Manager error",
      envelope.retryable === true,
      typeof envelope.details === "object" && envelope.details !== null
        ? (envelope.details as Record<string, unknown>)
        : undefined
    );
  }
  throw new LabManagerError(
    502,
    "manager_bad_response",
    `Lab Manager returned HTTP ${status} without an error envelope`,
    false
  );
}

function assertId(id: string): string {
  if (!isValidLabId(id)) {
    throw new LabManagerError(400, "validation_failed", "Invalid id", false);
  }
  return encodeURIComponent(id);
}

// ─── Health ──────────────────────────────────────────────────────────────────

export function getHealth(config: LabConfig): Promise<LabHealth> {
  return call<LabHealth>(config, {
    method: "GET",
    path: "/v1/health",
    timeoutMs: HEALTH_TIMEOUT_MS,
  });
}

export function isApiCompatible(health: Pick<LabHealth, "apiVersion">): boolean {
  return health.apiVersion.split(".")[0] === SUPPORTED_API_MAJOR;
}

/** Never throws: an unreachable manager is a state to render, not an error. */
export async function getConnectionStatus(
  config: LabConfig
): Promise<LabConnectionStatus> {
  const checkedAt = new Date().toISOString();
  try {
    const health = await getHealth(config);
    return {
      reachable: true,
      apiCompatible: isApiCompatible(health),
      health,
      error: null,
      checkedAt,
    };
  } catch (err) {
    const e =
      err instanceof LabManagerError
        ? err
        : new LabManagerError(502, "manager_bad_response", "Unexpected error", false);
    return {
      reachable: false,
      apiCompatible: false,
      health: null,
      error: { code: e.code, message: e.message, retryable: e.retryable },
      checkedAt,
    };
  }
}

// ─── Labs ────────────────────────────────────────────────────────────────────

export async function listLabs(
  config: LabConfig,
  actor: LabActor
): Promise<LabSummary[]> {
  const res = await call<{ items: LabSummary[] }>(config, {
    method: "GET",
    path: "/v1/labs",
    actor,
  });
  return res.items;
}

export function createLab(
  config: LabConfig,
  actor: LabActor,
  idempotencyKey: string,
  input: { name: string; objective?: string }
): Promise<LabSnapshot> {
  return call<LabSnapshot>(config, {
    method: "POST",
    path: "/v1/labs",
    actor,
    idempotencyKey,
    body: input,
  });
}

export async function getLabSnapshot(
  config: LabConfig,
  actor: LabActor,
  labId: string
): Promise<LabSnapshot> {
  return call<LabSnapshot>(config, {
    method: "GET",
    path: `/v1/labs/${assertId(labId)}`,
    actor,
  });
}

export async function runLabAction(
  config: LabConfig,
  actor: LabActor,
  idempotencyKey: string,
  labId: string,
  action: LabAction
): Promise<Lab> {
  return call<Lab>(config, {
    method: "POST",
    path: `/v1/labs/${assertId(labId)}/${action}`,
    actor,
    idempotencyKey,
  });
}

/** Changes the lab's goals. Only the fields given are changed. */
export async function updateLab(
  config: LabConfig,
  actor: LabActor,
  idempotencyKey: string,
  labId: string,
  input: { objective?: string; priorities?: string[] }
): Promise<Lab> {
  return call<Lab>(config, {
    method: "PATCH",
    path: `/v1/labs/${assertId(labId)}`,
    actor,
    idempotencyKey,
    body: input,
  });
}

/**
 * Permanently deletes a lab with its agents, tasks, conversations, records
 * and workspace files. Refused while any agent is up or a task is running.
 */
export async function deleteLab(
  config: LabConfig,
  actor: LabActor,
  idempotencyKey: string,
  labId: string
): Promise<LabDeletionReceipt> {
  return call<LabDeletionReceipt>(config, {
    method: "DELETE",
    path: `/v1/labs/${assertId(labId)}`,
    actor,
    idempotencyKey,
  });
}

// ─── Network hosts ───────────────────────────────────────────────────────────

const HOST_NAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

/** A plain host name, so it cannot change the request path. */
export function isValidHostName(host: unknown): host is string {
  return typeof host === "string" && HOST_NAME.test(host);
}

/** The internet hosts sandboxed shell commands have reached or been forbidden. Host-wide. */
export async function listNetworkHosts(config: LabConfig, actor: LabActor): Promise<LabNetworkHosts> {
  return call<LabNetworkHosts>(config, { method: "GET", path: "/v1/network/hosts", actor });
}

/** Blocks a host for every command from now on, or allows it again. */
export async function setNetworkHost(
  config: LabConfig,
  actor: LabActor,
  idempotencyKey: string,
  host: string,
  action: NetworkHostAction
): Promise<LabNetworkHost> {
  if (!isValidHostName(host)) {
    throw new LabManagerError(400, "validation_failed", "Invalid host", false);
  }
  return call<LabNetworkHost>(config, {
    method: "POST",
    path: `/v1/network/hosts/${encodeURIComponent(host.toLowerCase())}/${action}`,
    actor,
    idempotencyKey,
  });
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export async function getAgent(config: LabConfig, actor: LabActor, agentId: string): Promise<LabAgent> {
  return call<LabAgent>(config, { method: "GET", path: `/v1/agents/${assertId(agentId)}`, actor });
}

export async function runAgentAction(
  config: LabConfig,
  actor: LabActor,
  idempotencyKey: string,
  agentId: string,
  action: AgentAction
): Promise<LabAgent> {
  return call<LabAgent>(config, {
    method: "POST",
    path: `/v1/agents/${assertId(agentId)}/${action}`,
    actor,
    idempotencyKey,
    // The contract requires a body only for resume; keep the same session.
    ...(action === "resume" ? { body: { newSession: false } } : {}),
  });
}

/** Cursors are opaque to Runekeeper but must not be able to alter the path. */
export function isValidCursor(cursor: unknown): cursor is string {
  return typeof cursor === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(cursor);
}

function pageQuery(q: { before?: string; after?: string; limit?: number }, extra: Record<string, string> = {}) {
  const params = new URLSearchParams(extra);
  for (const name of ["before", "after"] as const) {
    const cursor = q[name];
    if (cursor === undefined) continue;
    if (!isValidCursor(cursor)) {
      throw new LabManagerError(400, "validation_failed", "Invalid cursor", false);
    }
    params.set(name, cursor);
  }
  params.set("limit", String(Math.min(Math.max(1, Math.trunc(q.limit ?? 50)), 200)));
  return params.toString();
}

/**
 * A page of transcript items in ascending order. Without a cursor, the
 * newest; `before` pages back, `after` returns what was added since.
 */
export async function getAgentTranscriptPage(
  config: LabConfig,
  actor: LabActor,
  agentId: string,
  q: { before?: string; after?: string; limit?: number } = {}
): Promise<LabTranscriptPage> {
  return call<LabTranscriptPage>(config, {
    method: "GET",
    path: `/v1/agents/${assertId(agentId)}/transcript?${pageQuery(q)}`,
    actor,
  });
}

/** Gives the agent one instruction. Refused with 409 while it is busy. */
export async function sendAgentMessage(
  config: LabConfig,
  actor: LabActor,
  idempotencyKey: string,
  agentId: string,
  text: string
): Promise<{ job: LabJob; transcriptItem: LabTranscriptItem }> {
  return call(config, {
    method: "POST",
    path: `/v1/agents/${assertId(agentId)}/messages`,
    actor,
    idempotencyKey,
    body: { text },
  });
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

/** Instructions and titled tasks alike, newest first. */
export async function listJobs(
  config: LabConfig,
  actor: LabActor,
  labId: string,
  q: { agentId?: string; before?: string; limit?: number } = {}
): Promise<LabJobPage> {
  const extra: Record<string, string> = { kind: "all" };
  if (q.agentId !== undefined) extra.agentId = assertId(q.agentId);
  return call<LabJobPage>(config, {
    method: "GET",
    path: `/v1/labs/${assertId(labId)}/jobs?${pageQuery({ before: q.before, limit: q.limit }, extra)}`,
    actor,
  });
}

export async function getJob(config: LabConfig, actor: LabActor, jobId: string): Promise<LabJob> {
  return call<LabJob>(config, { method: "GET", path: `/v1/jobs/${assertId(jobId)}`, actor });
}

export async function cancelJob(
  config: LabConfig,
  actor: LabActor,
  idempotencyKey: string,
  jobId: string
): Promise<LabJob> {
  return call<LabJob>(config, {
    method: "POST",
    path: `/v1/jobs/${assertId(jobId)}/cancel`,
    actor,
    idempotencyKey,
  });
}

/**
 * Resolves a job interrupted by a restart. `retry` starts a new job with the
 * same instructions; `acknowledge` only clears the hold. Neither is signed.
 */
export async function reconcileJob(
  config: LabConfig,
  actor: LabActor,
  idempotencyKey: string,
  jobId: string,
  resolution: "acknowledge" | "retry"
): Promise<{ job: LabJob; retryJob?: LabJob }> {
  return call(config, {
    method: "POST",
    path: `/v1/jobs/${assertId(jobId)}/reconcile`,
    actor,
    idempotencyKey,
    body: { resolution },
  });
}

/** Total minutes agents may run in this lab. Not money, so not signed. */
export async function setRuntimeLimit(
  config: LabConfig,
  actor: LabActor,
  idempotencyKey: string,
  labId: string,
  wallClockMinutes: number
): Promise<LabBudget> {
  return call<LabBudget>(config, {
    method: "POST",
    path: `/v1/labs/${assertId(labId)}/runtime-limit`,
    actor,
    idempotencyKey,
    body: { wallClockMinutes },
  });
}
