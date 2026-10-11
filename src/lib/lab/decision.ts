import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import {
  MAX_AUTHORIZATION_LIFETIME_MS,
  bindingHash,
  canonicalJsonValue,
  newNonce,
  sha256Hex,
  toBindingDecimal,
  type AuthzAction,
  type AuthzFields,
  type AuthzOutcome,
} from "./authz";

/**
 * What Runekeeper's server requires before it signs a human decision.
 * Server-side only.
 *
 * Nothing here trusts the browser for WHAT is being approved. The server
 * fetches the record from the Lab Manager, rebuilds the binding from that
 * record's own fields, and signs only that. The browser contributes three
 * things: which target, which outcome, and an explicit confirmation that
 * echoes the server's own hash back (so a view that went stale is refused).
 * A hash from the browser is never evidence of approval by itself.
 */

/** How long a signed authorization stays usable. The manager's cap is five minutes. */
export const AUTHORIZATION_LIFETIME_MS = 2 * 60_000;
/** A decision submitted sooner than this after the review was served is refused. */
export const MIN_REVIEW_MS = 1_500;
/** A review older than this must be fetched again. */
export const MAX_REVIEW_MS = 15 * 60_000;
const DEFAULT_MAX_AUTH_AGE_MINUTES = 30;
const CLOCK_SKEW_MS = 60_000;

export type RefusalCode =
  | "confirmation_required"
  | "reauthentication_required"
  | "review_required"
  | "stale_view"
  | "not_pending"
  | "expired"
  | "request_incomplete"
  | "binding_mismatch"
  | "unsupported_kind"
  | "not_reconcilable"
  | "invalid_limits"
  | "no_change";

export type Refusal = { ok: false; code: RefusalCode; message: string };
const refuse = (code: RefusalCode, message: string): Refusal => ({ ok: false, code, message });

export interface Limits {
  costUsd?: number | null;
  wallClockMinutes?: number | null;
  maxTurns?: number | null;
}

export interface BindingLimits {
  costUsd: string | null;
  wallClockMinutes: string | null;
  maxTurns?: number | null;
}

/** The fields of a Lab Manager approval this module relies on. */
export interface ApprovalRecord {
  id: string;
  labId: string;
  kind: string;
  status: string;
  requestedBy: { agentId: string; role: string; jobId: string | null };
  request: unknown;
  requestHash: string;
  requestTruncated: boolean;
  binding: unknown;
  bindingHash: string;
  estimate: Limits;
  expiresAt: string;
  decision: unknown;
}

/** The fields of a Lab Manager job this module relies on. */
export interface JobRecord {
  id: string;
  labId: string;
  agentId: string;
  kind: string;
  title: string;
  experimentId?: string | null;
  instructions: string;
  instructionsHash: string;
  binding: unknown;
  bindingHash: string;
  needsReconciliation: boolean;
  limits: Limits;
}

/** A verified description of exactly one thing a human may now decide. */
export interface Review {
  action: AuthzAction;
  targetId: string;
  /** Built by this server from the record, never taken from the browser. */
  binding: Record<string, unknown>;
  bindingHash: string;
  /** Outcomes this review can be signed for. */
  outcomes: AuthzOutcome[];
  /** The authorization may not outlive this moment (epoch ms), when set. */
  notAfter: number | null;
}

export type ReviewResult = { ok: true; review: Review } | Refusal;

const CONTRACT_VERSION = "1.0";

function bindingLimits(l: Limits): BindingLimits {
  const d = (v: number | null | undefined) => (typeof v === "number" ? toBindingDecimal(v) : null);
  return {
    costUsd: d(l.costUsd),
    wallClockMinutes: d(l.wallClockMinutes),
    ...(l.maxTurns !== undefined ? { maxTurns: l.maxTurns === null ? null : Math.trunc(l.maxTurns) } : {}),
  };
}

function sameBinding(ours: unknown, published: unknown, publishedHash: string): boolean {
  const hash = bindingHash(ours);
  return hash === publishedHash && hash === bindingHash(published);
}

/**
 * Verifies an approval fetched by id from the Lab Manager and rebuilds its
 * binding. `job` is the job the approval belongs to, fetched separately, so
 * the limits in the binding are checked against the job's own record.
 */
export function reviewApproval(approval: ApprovalRecord, job: JobRecord | null, now: number): ReviewResult {
  if (approval.status !== "pending" || approval.decision != null) {
    return refuse("not_pending", "This request has already been decided or withdrawn.");
  }
  const expiresAt = Date.parse(approval.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return refuse("expired", "This request has expired.");
  }
  if (approval.requestTruncated !== false) {
    return refuse("request_incomplete", "The complete request is not available, so it cannot be decided.");
  }

  let requestHash: string;
  try {
    requestHash = sha256Hex(canonicalJsonValue(approval.request));
  } catch {
    return refuse("request_incomplete", "The request could not be read.");
  }
  if (requestHash !== approval.requestHash) {
    return refuse("binding_mismatch", "The request does not match its recorded hash.");
  }

  const jobId = approval.requestedBy.jobId;
  if (jobId !== null) {
    if (!job || job.id !== jobId || job.labId !== approval.labId || job.agentId !== approval.requestedBy.agentId) {
      return refuse("binding_mismatch", "The request does not match the job it claims to belong to.");
    }
  }

  let binding: Record<string, unknown>;
  try {
    binding = {
      contractVersion: CONTRACT_VERSION,
      approvalId: approval.id,
      kind: approval.kind,
      labId: approval.labId,
      agentId: approval.requestedBy.agentId,
      role: approval.requestedBy.role,
      jobId,
      experimentId: job?.experimentId ?? null,
      requestHash,
      limits: bindingLimits(job?.limits ?? {}),
      estimate: bindingLimits({
        costUsd: approval.estimate?.costUsd ?? null,
        wallClockMinutes: approval.estimate?.wallClockMinutes ?? null,
      }),
      expiresAt: approval.expiresAt,
    };
  } catch {
    return refuse("binding_mismatch", "The request carries limits that cannot be represented.");
  }
  if (!sameBinding(binding, approval.binding, approval.bindingHash)) {
    return refuse("binding_mismatch", "The request does not match what the Lab Manager recorded for it.");
  }

  // Approving anything but a tool permission needs contract work first: an
  // experiment must come with protocol text that hashes to its protocolHash,
  // so a human never approves a bare hash. Denying is always possible.
  const outcomes: AuthzOutcome[] = approval.kind === "permission" ? ["approved", "denied"] : ["denied"];

  return {
    ok: true,
    review: {
      action: "approval.decision",
      targetId: approval.id,
      binding,
      bindingHash: approval.bindingHash,
      outcomes,
      notAfter: expiresAt,
    },
  };
}

/** Verifies an interrupted job fetched by id and rebuilds its retry binding. */
export function reviewJobRetry(job: JobRecord): ReviewResult {
  if (job.needsReconciliation !== true) {
    return refuse("not_reconcilable", "This job is not waiting to be reconciled.");
  }
  if (sha256Hex(job.instructions) !== job.instructionsHash) {
    return refuse("request_incomplete", "The job's complete instructions are not available.");
  }
  let binding: Record<string, unknown>;
  try {
    binding = {
      contractVersion: CONTRACT_VERSION,
      jobId: job.id,
      labId: job.labId,
      agentId: job.agentId,
      kind: job.kind,
      title: job.title,
      experimentId: job.experimentId ?? null,
      instructionsHash: job.instructionsHash,
      limits: bindingLimits(job.limits),
    };
  } catch {
    return refuse("binding_mismatch", "The job carries limits that cannot be represented.");
  }
  if (!sameBinding(binding, job.binding, job.bindingHash)) {
    return refuse("binding_mismatch", "The job does not match what the Lab Manager recorded for it.");
  }
  return {
    ok: true,
    review: { action: "job.retry", targetId: job.id, binding, bindingHash: job.bindingHash, outcomes: ["retry"], notAfter: null },
  };
}

const MAX_BUDGET_COST_USD = 1_000_000;
const MAX_BUDGET_MINUTES = 60 * 24 * 365;

function validBudget(l: unknown): l is { costUsd: number; wallClockMinutes: number } {
  if (!l || typeof l !== "object") return false;
  const { costUsd, wallClockMinutes } = l as Record<string, unknown>;
  const ok = (v: unknown, max: number) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
  return ok(costUsd, MAX_BUDGET_COST_USD) && ok(wallClockMinutes, MAX_BUDGET_MINUTES);
}

/**
 * Builds the binding for a budget change. `previous` is the lab's limits as
 * just fetched from the Lab Manager by the server; `requested` is what the
 * human typed. Only the two numbers are taken from the request.
 */
export function reviewBudgetChange(labId: string, previous: unknown, requested: unknown): ReviewResult {
  if (!validBudget(requested)) return refuse("invalid_limits", "Budget limits must be numbers of zero or more.");
  if (!validBudget(previous)) return refuse("binding_mismatch", "The lab's current limits could not be read.");
  if (previous.costUsd === requested.costUsd && previous.wallClockMinutes === requested.wallClockMinutes) {
    return refuse("no_change", "These are already the lab's limits.");
  }
  const binding = {
    contractVersion: CONTRACT_VERSION,
    labId,
    previousLimits: bindingLimits({ costUsd: previous.costUsd, wallClockMinutes: previous.wallClockMinutes }),
    limits: bindingLimits({ costUsd: requested.costUsd, wallClockMinutes: requested.wallClockMinutes }),
  };
  return {
    ok: true,
    review: { action: "budget.set", targetId: labId, binding, bindingHash: bindingHash(binding), outcomes: ["set"], notAfter: null },
  };
}

// ---------------------------------------------------------------------------
// Review tickets: the server's own record that it served this exact review to
// this user. They replace "the browser says it showed hash X" with something
// the browser cannot make up. The key lives in memory only; a restart simply
// means the review is fetched again.

const TICKET_KEY = Symbol.for("runekeeper.lab.reviewTicketKey");
function ticketKey(): Buffer {
  const g = globalThis as unknown as Record<symbol, Buffer | undefined>;
  return (g[TICKET_KEY] ??= randomBytes(32));
}

function ticketMac(actorId: string, review: Review, issuedAt: number, key: Buffer): Buffer {
  const text = ["lab-review-v1", review.action, review.targetId, review.bindingHash, actorId, String(issuedAt)].join("\n");
  return createHmac("sha256", key).update(text, "utf8").digest();
}

export function issueReviewTicket(actorId: string, review: Review, now: number, key: Buffer = ticketKey()): string {
  return `${now}.${ticketMac(actorId, review, now, key).toString("base64url")}`;
}

type TicketCheck = "ok" | "invalid" | "too_soon" | "too_old";

export function checkReviewTicket(
  ticket: unknown,
  actorId: string,
  review: Review,
  now: number,
  key: Buffer = ticketKey()
): TicketCheck {
  if (typeof ticket !== "string") return "invalid";
  const match = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(ticket);
  if (!match) return "invalid";
  const issuedAt = Number(match[1]);
  const presented = Buffer.from(match[2], "base64url");
  const expected = ticketMac(actorId, review, issuedAt, key);
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) return "invalid";
  if (now - issuedAt < MIN_REVIEW_MS) return "too_soon";
  if (now - issuedAt > MAX_REVIEW_MS) return "too_old";
  return "ok";
}

// ---------------------------------------------------------------------------

/** Outcomes that let work or spending proceed. Refusing something is not one. */
export function isConsequential(outcome: AuthzOutcome): boolean {
  return outcome !== "denied";
}

export function maxAuthAgeMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env.LAB_APPROVAL_MAX_AUTH_AGE_MINUTES?.trim();
  const minutes = raw && /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
  return (minutes >= 1 && minutes <= 720 ? minutes : DEFAULT_MAX_AUTH_AGE_MINUTES) * 60_000;
}

/**
 * Whether the session was established by a sign-in recent enough to act on.
 * `authTime` is seconds since the epoch, set by the sign-in callback inside
 * the signed session token. A session without it is never recent.
 */
export function isRecentAuthentication(authTime: unknown, now: number, maxAgeMs: number): boolean {
  if (typeof authTime !== "number" || !Number.isFinite(authTime) || authTime <= 0) return false;
  const at = authTime * 1000;
  return at <= now + CLOCK_SKEW_MS && now - at <= maxAgeMs;
}

export interface DecisionInput {
  review: Review;
  /** From the authenticated session. Never from the request body. */
  actorId: string;
  /** From the session token. */
  authTime: unknown;
  outcome: unknown;
  note?: string | null;
  /** The human's explicit confirmation of this one decision, from the request body. */
  confirmation: unknown;
  ticket: unknown;
  now: number;
  maxAuthAgeMs: number;
}

export type DecisionResult = { ok: true; fields: AuthzFields } | Refusal;

/**
 * The last gate before the signer. Returns the exact fields to sign, built
 * from the server's review and the session; or the reason it will not.
 */
export function authorizeDecision(input: DecisionInput): DecisionResult {
  const { review, now } = input;
  const outcome = review.outcomes.find((o) => o === input.outcome);
  if (!outcome) {
    return typeof input.outcome === "string" && ["approved", "denied", "retry", "set"].includes(input.outcome)
      ? refuse("unsupported_kind", "This kind of request cannot be given that outcome yet.")
      : refuse("confirmation_required", "State the decision explicitly.");
  }

  // One explicit confirmation per decision, naming the target and the outcome.
  const c = input.confirmation as Record<string, unknown> | null;
  if (!c || typeof c !== "object" || c.targetId !== review.targetId || c.outcome !== outcome) {
    return refuse("confirmation_required", "Confirm this decision explicitly.");
  }
  // The hash is a freshness check on what was displayed, nothing more.
  if (c.bindingHash !== review.bindingHash) {
    return refuse("stale_view", "The request changed since it was displayed. Review it again.");
  }

  const ticket = checkReviewTicket(input.ticket, input.actorId, review, now);
  if (ticket === "too_old") return refuse("stale_view", "The review is too old. Review the request again.");
  if (ticket !== "ok") return refuse("review_required", "Open and review the complete request before deciding.");

  if (isConsequential(outcome) && !isRecentAuthentication(input.authTime, now, input.maxAuthAgeMs)) {
    return refuse("reauthentication_required", "Sign in again to confirm this decision.");
  }

  const lifetime = Math.min(AUTHORIZATION_LIFETIME_MS, MAX_AUTHORIZATION_LIFETIME_MS);
  const expires = review.notAfter === null ? now + lifetime : Math.min(now + lifetime, review.notAfter);
  if (expires <= now) return refuse("expired", "This request has expired.");

  return {
    ok: true,
    fields: {
      action: review.action,
      targetId: review.targetId,
      bindingHash: review.bindingHash,
      outcome,
      actorId: input.actorId,
      signedAt: new Date(now).toISOString(),
      expiresAt: new Date(expires).toISOString(),
      nonce: newNonce(),
      note: input.note ?? null,
    },
  };
}
