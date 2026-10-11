import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { bindingHash, canonicalJsonValue, sha256Hex } from "./authz";
import {
  AUTHORIZATION_LIFETIME_MS,
  MAX_REVIEW_MS,
  MIN_REVIEW_MS,
  authorizeDecision,
  checkReviewTicket,
  isRecentAuthentication,
  issueReviewTicket,
  maxAuthAgeMs,
  reviewApproval,
  reviewBudgetChange,
  reviewJobRetry,
  type ApprovalRecord,
  type JobRecord,
  type Review,
} from "./decision";

const vectors = JSON.parse(
  readFileSync(join(process.cwd(), "docs/lab/contract/binding-vectors.json"), "utf8")
).vectors as Array<{ name: string; binding: Record<string, any>; bindingHash: string }>;
const vector = (name: string) => vectors.find((v) => v.name === name)!;

const NOW = Date.parse("2026-10-10T12:00:00.000Z");
const ACTOR = "02cdfbb6-0000-4000-8000-000000000001";
const HOUR = 3_600_000;

// Records as the Lab Manager would return them, shaped so that the binding
// this server rebuilds must equal the backend's published test vector.
const REQUEST = { toolName: "Bash", input: { command: "ls", timeout: 1.5 } };
function fixtures() {
  const v = vector("approval decision (permission request)");
  const binding = { ...v.binding, requestHash: sha256Hex(canonicalJsonValue(REQUEST)) };
  const job: JobRecord = {
    id: v.binding.jobId,
    labId: v.binding.labId,
    agentId: v.binding.agentId,
    kind: "task",
    title: "Run the baseline",
    experimentId: null,
    instructions: "do the thing",
    instructionsHash: sha256Hex("do the thing"),
    binding: null,
    bindingHash: "",
    needsReconciliation: false,
    limits: { costUsd: 2, wallClockMinutes: 30, maxTurns: 60 },
  };
  const approval: ApprovalRecord = {
    id: v.binding.approvalId,
    labId: v.binding.labId,
    kind: "permission",
    status: "pending",
    requestedBy: { agentId: v.binding.agentId, role: v.binding.role, jobId: v.binding.jobId },
    request: REQUEST,
    requestHash: binding.requestHash,
    requestTruncated: false,
    binding,
    bindingHash: bindingHash(binding),
    estimate: { costUsd: null, wallClockMinutes: null },
    expiresAt: v.binding.expiresAt,
    decision: null,
  };
  return { approval, job };
}

function okReview(): Review {
  const { approval, job } = fixtures();
  const r = reviewApproval(approval, job, NOW);
  assert.equal(r.ok, true);
  return (r as { ok: true; review: Review }).review;
}

describe("rebuilding bindings on the server", () => {
  it("reproduces the backend's approval vector from the vector's own fields", () => {
    const v = vector("approval decision (permission request)");
    const { job } = fixtures();
    const approval: ApprovalRecord = {
      ...fixtures().approval,
      request: null,
      requestHash: v.binding.requestHash,
      binding: v.binding,
      bindingHash: v.bindingHash,
    };
    // The vector's request is not published, so only the hash mismatch is reachable here...
    assert.equal((reviewApproval(approval, job, NOW) as any).code, "binding_mismatch");
    // ...and with a request we do hold, the rebuilt binding differs from the vector only in requestHash.
    const review = okReview();
    assert.deepEqual({ ...review.binding, requestHash: v.binding.requestHash }, v.binding);
  });

  it("reproduces the backend's job retry vector", () => {
    const v = vector("job retry");
    const job: JobRecord = {
      id: v.binding.jobId,
      labId: v.binding.labId,
      agentId: v.binding.agentId,
      kind: v.binding.kind,
      title: v.binding.title,
      experimentId: null,
      instructions: "x",
      instructionsHash: v.binding.instructionsHash,
      binding: v.binding,
      bindingHash: v.bindingHash,
      needsReconciliation: true,
      limits: { costUsd: 1.25, wallClockMinutes: 30, maxTurns: 60 },
    };
    // Instructions that do not hash to instructionsHash are refused.
    assert.equal((reviewJobRetry(job) as any).code, "request_incomplete");
    const full = { ...job, instructions: "abc", instructionsHash: sha256Hex("abc") };
    const binding = { ...v.binding, instructionsHash: full.instructionsHash };
    const r = reviewJobRetry({ ...full, binding, bindingHash: bindingHash(binding) });
    assert.equal(r.ok, true);
    assert.deepEqual({ ...(r as any).review.binding, instructionsHash: v.binding.instructionsHash }, v.binding);
  });

  it("reproduces the backend's budget vector exactly, hash included", () => {
    const v = vector("budget change");
    const r = reviewBudgetChange(v.binding.labId, { costUsd: 0, wallClockMinutes: 0 }, { costUsd: 0.1, wallClockMinutes: 600 });
    assert.equal(r.ok, true);
    assert.deepEqual((r as any).review.binding, v.binding);
    assert.equal((r as any).review.bindingHash, v.bindingHash);
  });
});

describe("reviewApproval refuses anything it cannot verify", () => {
  const refusal = (mutate: (a: ApprovalRecord, j: JobRecord) => void, job: "keep" | "drop" = "keep") => {
    const { approval, job: j } = fixtures();
    mutate(approval, j);
    const r = reviewApproval(approval, job === "keep" ? j : null, NOW);
    return r.ok ? "ok" : r.code;
  };

  it("accepts the untouched record", () => assert.equal(refusal(() => {}), "ok"));
  it("already decided", () => assert.equal(refusal((a) => (a.status = "approved")), "not_pending"));
  it("decision already present", () => assert.equal(refusal((a) => (a.decision = {})), "not_pending"));
  it("expired", () => assert.equal(refusal((a) => (a.expiresAt = "2026-10-10T11:59:59.000Z")), "expired"));
  it("truncated request", () => assert.equal(refusal((a) => (a.requestTruncated = true)), "request_incomplete"));
  it("request changed after hashing", () =>
    assert.equal(refusal((a) => (a.request = { toolName: "Bash", input: { command: "rm -rf /" } })), "binding_mismatch"));
  it("job missing", () => assert.equal(refusal(() => {}, "drop"), "binding_mismatch"));
  it("job belongs to another agent", () => assert.equal(refusal((_, j) => (j.agentId = "agt_other")), "binding_mismatch"));
  it("job limits differ from the binding's", () => assert.equal(refusal((_, j) => (j.limits.costUsd = 200)), "binding_mismatch"));
  it("estimate differs from the binding's", () => assert.equal(refusal((a) => (a.estimate.costUsd = 5)), "binding_mismatch"));
  it("published hash does not match the published binding", () =>
    assert.equal(refusal((a) => (a.bindingHash = "0".repeat(64))), "binding_mismatch"));
  it("binding names a different approval", () =>
    assert.equal(
      refusal((a) => {
        a.binding = { ...(a.binding as object), approvalId: "apr_other" };
        a.bindingHash = bindingHash(a.binding);
      }),
      "binding_mismatch"
    ));

  it("an experiment can be denied but not approved until its protocol text is verifiable", () => {
    const { approval, job } = fixtures();
    approval.kind = "experiment";
    approval.binding = { ...(approval.binding as object), kind: "experiment" };
    approval.bindingHash = bindingHash(approval.binding);
    const r = reviewApproval(approval, job, NOW);
    assert.equal(r.ok, true);
    assert.deepEqual((r as any).review.outcomes, ["denied"]);
  });
});

describe("budget changes", () => {
  const prev = { costUsd: 5, wallClockMinutes: 60 };
  const code = (requested: unknown, previous: unknown = prev) => {
    const r = reviewBudgetChange("lab_1", previous, requested);
    return r.ok ? "ok" : r.code;
  };
  it("accepts a change", () => assert.equal(code({ costUsd: 10, wallClockMinutes: 60 }), "ok"));
  it("refuses no change", () => assert.equal(code({ ...prev }), "no_change"));
  it("refuses negative, non-finite, huge and non-numeric limits", () => {
    for (const bad of [{ costUsd: -1, wallClockMinutes: 1 }, { costUsd: Infinity, wallClockMinutes: 1 }, { costUsd: 1e12, wallClockMinutes: 1 }, { costUsd: "10", wallClockMinutes: 1 }, null, { costUsd: 1 }]) {
      assert.equal(code(bad), "invalid_limits");
    }
  });
  it("refuses when the current limits could not be read", () =>
    assert.equal(code({ costUsd: 1, wallClockMinutes: 1 }, null), "binding_mismatch"));
});

describe("recent authentication", () => {
  const max = 30 * 60_000;
  it("accepts a sign-in inside the window", () => assert.equal(isRecentAuthentication(NOW / 1000 - 60, NOW, max), true));
  it("refuses one outside it", () => assert.equal(isRecentAuthentication(NOW / 1000 - 31 * 60, NOW, max), false));
  it("refuses a session that never recorded a sign-in time", () => {
    for (const v of [undefined, null, "1760097600", 0, NaN]) assert.equal(isRecentAuthentication(v, NOW, max), false);
  });
  it("refuses a sign-in time in the future", () => assert.equal(isRecentAuthentication(NOW / 1000 + HOUR, NOW, max), false));
  it("window defaults to 30 minutes and ignores bad settings", () => {
    assert.equal(maxAuthAgeMs({}), 30 * 60_000);
    assert.equal(maxAuthAgeMs({ LAB_APPROVAL_MAX_AUTH_AGE_MINUTES: "10" }), 10 * 60_000);
    for (const bad of ["0", "-5", "100000", "abc", "9999"]) {
      assert.equal(maxAuthAgeMs({ LAB_APPROVAL_MAX_AUTH_AGE_MINUTES: bad }), 30 * 60_000);
    }
  });
});

describe("review tickets", () => {
  const key = Buffer.alloc(32, 7);
  const review = okReview();
  const ticket = issueReviewTicket(ACTOR, review, NOW, key);
  const at = NOW + MIN_REVIEW_MS;

  it("accepts its own ticket after the minimum review time", () => assert.equal(checkReviewTicket(ticket, ACTOR, review, at, key), "ok"));
  it("refuses a decision made instantly", () => assert.equal(checkReviewTicket(ticket, ACTOR, review, NOW + 100, key), "too_soon"));
  it("refuses an old review", () => assert.equal(checkReviewTicket(ticket, ACTOR, review, NOW + MAX_REVIEW_MS + 1, key), "too_old"));
  it("refuses another user's ticket", () => assert.equal(checkReviewTicket(ticket, "someone-else", review, at, key), "invalid"));
  it("refuses a ticket for a different binding", () =>
    assert.equal(checkReviewTicket(ticket, ACTOR, { ...review, bindingHash: "0".repeat(64) }, at, key), "invalid"));
  it("refuses a ticket for a different target or action", () => {
    assert.equal(checkReviewTicket(ticket, ACTOR, { ...review, targetId: "apr_other" }, at, key), "invalid");
    assert.equal(checkReviewTicket(ticket, ACTOR, { ...review, action: "budget.set" }, at, key), "invalid");
  });
  it("refuses a ticket with its time altered, made with another key, or malformed", () => {
    const [, mac] = ticket.split(".");
    assert.equal(checkReviewTicket(`${NOW - 5000}.${mac}`, ACTOR, review, at, key), "invalid");
    assert.equal(checkReviewTicket(ticket, ACTOR, review, at, Buffer.alloc(32, 8)), "invalid");
    for (const bad of [undefined, "", "abc", review.bindingHash, 12345]) {
      assert.equal(checkReviewTicket(bad, ACTOR, review, at, key), "invalid");
    }
  });
});

describe("authorizeDecision: the last gate before the signer", () => {
  const review = okReview();
  const issued = NOW;
  const now = NOW + 5_000;
  const base = () => ({
    review,
    actorId: ACTOR,
    authTime: now / 1000 - 60,
    outcome: "approved" as unknown,
    note: null,
    confirmation: { targetId: review.targetId, outcome: "approved", bindingHash: review.bindingHash } as unknown,
    ticket: issueReviewTicket(ACTOR, review, issued) as unknown,
    now,
    maxAuthAgeMs: 30 * 60_000,
  });
  const code = (over: Partial<ReturnType<typeof base>>) => {
    const r = authorizeDecision({ ...base(), ...over });
    return r.ok ? "ok" : r.code;
  };

  it("produces fields built from the review and the session", () => {
    const r = authorizeDecision(base());
    assert.equal(r.ok, true);
    const f = (r as any).fields;
    assert.equal(f.action, "approval.decision");
    assert.equal(f.targetId, review.targetId);
    assert.equal(f.bindingHash, review.bindingHash);
    assert.equal(f.actorId, ACTOR);
    assert.equal(f.outcome, "approved");
    assert.equal(Date.parse(f.expiresAt) - Date.parse(f.signedAt), AUTHORIZATION_LIFETIME_MS);
    assert.match(f.nonce, /^[A-Za-z0-9_-]{22,128}$/);
  });

  it("uses a fresh nonce every time", () => {
    const a = authorizeDecision(base()) as any;
    const b = authorizeDecision(base()) as any;
    assert.notEqual(a.fields.nonce, b.fields.nonce);
  });

  it("never lets the authorization outlive the approval", () => {
    const soon = { ...review, notAfter: now + 30_000 };
    const r = authorizeDecision({ ...base(), review: soon, ticket: issueReviewTicket(ACTOR, soon, issued) }) as any;
    assert.equal(Date.parse(r.fields.expiresAt), now + 30_000);
    assert.equal(code({ review: { ...review, notAfter: now } }), "expired");
  });

  it("a correct hash from the browser is not enough without the server's ticket", () => {
    assert.equal(code({ ticket: undefined }), "review_required");
    assert.equal(code({ ticket: review.bindingHash }), "review_required");
    assert.equal(code({ ticket: issueReviewTicket("someone-else", review, issued) }), "review_required");
  });

  it("refuses a decision submitted the instant the review was served", () =>
    assert.equal(code({ ticket: issueReviewTicket(ACTOR, review, now - 200) }), "review_required"));

  it("requires an explicit confirmation naming this target and this outcome", () => {
    assert.equal(code({ confirmation: undefined }), "confirmation_required");
    assert.equal(code({ confirmation: true }), "confirmation_required");
    assert.equal(code({ confirmation: { targetId: "apr_other", outcome: "approved", bindingHash: review.bindingHash } }), "confirmation_required");
    assert.equal(code({ confirmation: { targetId: review.targetId, outcome: "denied", bindingHash: review.bindingHash } }), "confirmation_required");
  });

  it("refuses when what was displayed is no longer what would be signed", () =>
    assert.equal(code({ confirmation: { targetId: review.targetId, outcome: "approved", bindingHash: "0".repeat(64) } }), "stale_view"));

  it("requires a recent sign-in to approve, but not to deny", () => {
    assert.equal(code({ authTime: undefined }), "reauthentication_required");
    assert.equal(code({ authTime: now / 1000 - 2 * 3600 }), "reauthentication_required");
    assert.equal(
      code({ authTime: undefined, outcome: "denied", confirmation: { targetId: review.targetId, outcome: "denied", bindingHash: review.bindingHash } }),
      "ok"
    );
  });

  it("refuses outcomes the review does not offer", () => {
    assert.equal(code({ outcome: "set" }), "unsupported_kind");
    assert.equal(code({ outcome: "yes" }), "confirmation_required");
    assert.equal(code({ outcome: ["approved"] }), "confirmation_required");
    const denyOnly = { ...review, outcomes: ["denied" as const] };
    assert.equal(code({ review: denyOnly }), "unsupported_kind");
  });
});
