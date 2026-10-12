"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as labApi from "@/lib/lab/client";
import { LabApiError } from "@/lib/lab/client";
import { MAX_ESCALATION_NOTE_LENGTH } from "@/lib/lab/types";
import type { LabSnapshot, LabSummary, LabComputeApproval } from "@/lib/lab/types";
import { AgentAvatar } from "./agent-avatar";
import { ComputeApprovals } from "./compute-approvals";
import { LabMarkdown } from "./lab-markdown";
import { agentName, formatAgo, leadName } from "./agent-card";
import { Chip, LabButton, Strip } from "./lab-ui";

const POLL_MS = 10_000;

const ESCALATION_REASONS: Record<string, string> = {
  unauthorized_charge: "A charge nobody authorized",
  security_boundary: "A security boundary was reached",
  runtime_exhausted: "The lab ran out of runtime",
  no_open_questions: "No open questions are left",
  repeated_failures: "Repeated failures",
  no_progress: "No progress",
  disk_low: "The host is low on disk space",
  human_decision: "An agent asks for your decision",
};

/** What the agent wrote in an escalation, which the record holds only by hash. */
function EscalationBody({ labId, hash }: { labId: string; hash: string | undefined }) {
  const [text, setText] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    if (!hash) return;
    let live = true;
    setText(null);
    setFailure(null);
    labApi.fetchArtifact(labId, hash).then(
      (a) => live && setText(a.content),
      (err) => live && setFailure(err instanceof LabApiError ? err.message : "Unexpected error")
    );
    return () => {
      live = false;
    };
  }, [labId, hash]);

  if (!hash) return null;
  if (failure) return <p className="text-[12.5px] text-[var(--lab-warn)]">Could not load what the agent wrote: {failure}</p>;
  if (text === null) return <p className="text-[12.5px] text-[var(--lab-faint)]">Loading what the agent wrote…</p>;
  if (!text.trim()) return null;
  return (
    <div className="lab-scroll max-h-72 overflow-y-auto border-l-2 border-[var(--lab-line-strong)] pl-3">
      <p className="lab-eyebrow !text-[10.5px] mb-1">Written by the agent</p>
      <LabMarkdown text={text} className="text-[13.5px]" />
    </div>
  );
}

/** Labs whose summary says something waits for the owner. */
export function needsYouCount(labs: LabSummary[] | null): number {
  return labs?.reduce((n, l) => n + l.pendingApprovalCount + l.openEscalationCount, 0) ?? 0;
}

function shown(value: unknown, max = 1200): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > max ? `${text.slice(0, max)}\n… (shortened)` : text;
}

/**
 * Everything, in every lab, that waits for the owner: tool requests,
 * escalations and tasks interrupted by a restart. Read-only: a decision is
 * made where the agent is, so each entry opens that agent.
 */
export function NeedsYou({
  labs,
  current,
  now,
  onOpen,
  computeApprovals,
  provider,
  disabled,
  onComputeDecided,
}: {
  /** Rentals of compute waiting for approval; these can be decided here. */
  computeApprovals: LabComputeApproval[];
  provider: string;
  disabled: boolean;
  onComputeDecided: () => void;
  labs: LabSummary[] | null;
  /** The selected lab's snapshot, which is fresher than a refetch. */
  current: LabSnapshot | null;
  now: number;
  /** `draft` is put in that agent's composer for the owner to read and send. */
  onOpen: (labId: string, agentId?: string, draft?: string) => void;
}) {
  // Escalations the owner resolved here, hidden at once; the next snapshot no longer lists them.
  const [resolved, setResolved] = useState<Record<string, true>>({});
  const [resolving, setResolving] = useState<{ id: string; note: string } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resolveFailure, setResolveFailure] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const resolve = async (ids: string[], note?: string) => {
    if (busy || ids.length === 0) return;
    setBusy(true);
    setResolveFailure(null);
    const done: Record<string, true> = {};
    let failed: string | null = null;
    for (const id of ids) {
      try {
        await labApi.resolveEscalation(id, note);
        done[id] = true;
      } catch (err) {
        // Already resolved elsewhere is the outcome that was wanted.
        if (err instanceof LabApiError && err.code === "conflict") done[id] = true;
        else {
          failed = err instanceof LabApiError ? err.message : "Unexpected error";
          break;
        }
      }
    }
    setResolved((r) => ({ ...r, ...done }));
    setResolveFailure(failed);
    setBusy(false);
    if (!failed) {
      setResolving(null);
      setConfirmAll(false);
    }
    setReload((n) => n + 1);
  };
  const [snapshots, setSnapshots] = useState<Record<string, LabSnapshot>>({});
  const [failed, setFailed] = useState(0);
  const waiting = useMemo(
    () => labs?.filter((l) => l.pendingApprovalCount + l.openEscalationCount > 0).map((l) => l.id) ?? [],
    [labs]
  );
  const key = waiting.join(",");
  const idsRef = useRef(waiting);
  idsRef.current = waiting;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const ids = idsRef.current;
      const results = await Promise.allSettled(ids.map((id) => labApi.fetchLabSnapshot(id)));
      if (cancelled) return;
      const next: Record<string, LabSnapshot> = {};
      results.forEach((r, i) => r.status === "fulfilled" && (next[ids[i]] = r.value));
      setSnapshots(next);
      setFailed(results.filter((r) => r.status === "rejected").length);
    };
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [key, reload]);

  const all = { ...snapshots, ...(current ? { [current.lab.id]: current } : {}) };
  const entries = Object.values(all).flatMap((snap) => {
    const agentOf = (agentId: string | undefined) => snap.agents.find((a) => a.id === agentId);
    const jobAgent = (jobId: string | null | undefined) =>
      snap.jobsNeedingReconciliation.find((j) => j.id === jobId)?.agentId;
    return [
      ...snap.pendingApprovals.map((a) => ({ kind: "approval" as const, snap, at: a.createdAt, approval: a, agent: agentOf(a.requestedBy.agentId) })),
      ...snap.openEscalations.map((e) => ({
        kind: "escalation" as const,
        snap,
        at: (e as { createdAt?: string }).createdAt ?? "",
        escalation: e,
        // Several agents can share a role, so the task says which one it was.
        agent: agentOf(jobAgent(e.jobId)) ?? snap.agents.find((a) => a.role === e.role),
      })),
      ...snap.jobsNeedingReconciliation.map((j) => ({ kind: "interrupted" as const, snap, at: j.createdAt, job: j, agent: agentOf(j.agentId) })),
    ];
  });
  const shownEntries = entries.filter((e) => e.kind !== "escalation" || !resolved[e.escalation.id]);
  shownEntries.sort((a, b) => (a.at < b.at ? 1 : -1));
  const openEscalationIds = shownEntries.flatMap((e) => (e.kind === "escalation" ? [e.escalation.id] : []));
  const loading = waiting.some((id) => !all[id]) && failed === 0;

  return (
    <section className="flex flex-col gap-4 w-full max-w-[1000px]" aria-label="Needs you">
      <header className="lab-panel p-4">
        <h3 className="text-[25px] font-semibold leading-tight tracking-tight">Needs you</h3>
        <p className="mt-2 text-[13.5px] text-[var(--lab-dim)]">
          What agents in any lab are waiting on you for. A GPU rental is approved or denied here, and an escalation is resolved
          here once you have seen it. Runekeeper cannot
          approve a tool request; open the agent to cancel the task or answer it. On a tool request, a cost figure is
          the agent's own estimate, never a charge.
        </p>
      </header>

      {failed > 0 && (
        <Strip tone="bad" role="alert">
          Could not load {failed} lab{failed === 1 ? "" : "s"}; this list may be incomplete.
        </Strip>
      )}
      {/* Agents are blocked on these, so they come first. */}
      <ComputeApprovals
        items={computeApprovals}
        now={now}
        disabled={disabled}
        provider={provider}
        onDecided={onComputeDecided}
        onOpen={onOpen}
      />
      {loading && <p className="lab-eyebrow py-6 text-center">Loading…</p>}
      {!loading && shownEntries.length === 0 && computeApprovals.length === 0 && <p className="lab-eyebrow py-10 text-center">Nothing is waiting on you</p>}

      {resolveFailure && (
        <Strip tone="bad" role="alert">
          Not resolved: {resolveFailure}
        </Strip>
      )}
      {openEscalationIds.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          {confirmAll ? (
            <>
              <span className="text-[var(--lab-dim)]">
                Clear all {openEscalationIds.length} escalations from this list? Nothing is sent to any agent.
              </span>
              <LabButton variant="danger" disabled={disabled || busy} onClick={() => void resolve(openEscalationIds)}>
                {busy ? "Resolving…" : `Yes, resolve all ${openEscalationIds.length}`}
              </LabButton>
              <LabButton variant="quiet" disabled={busy} onClick={() => setConfirmAll(false)}>
                Cancel
              </LabButton>
            </>
          ) : (
            <LabButton disabled={disabled} onClick={() => setConfirmAll(true)}>
              Resolve all {openEscalationIds.length} escalations…
            </LabButton>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {shownEntries.map((entry) => {
          const { snap, agent } = entry;
          const role = agent ? agentName(agent) : "Agent";
          const id = entry.kind === "approval" ? entry.approval.id : entry.kind === "escalation" ? entry.escalation.id : entry.job.id;
          return (
            <li key={`${entry.kind}-${id}`} className="lab-card lab-tone-bad p-4 flex gap-3 min-w-0">
              {agent && <AgentAvatar role={agent.role} state={agent.state} size={48} />}
              <div className="min-w-0 flex-1 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="lab-eyebrow !text-[var(--lab-text)]">
                    {role} · {snap.lab.name}
                  </p>
                  <Chip tone={entry.kind === "interrupted" ? "warn" : "bad"}>
                    {entry.kind === "approval"
                      ? entry.approval.kind === "permission"
                        ? "Tool request"
                        : `${entry.approval.kind} request`
                      : entry.kind === "escalation"
                        ? "Escalation"
                        : "Interrupted task"}
                  </Chip>
                </div>

                {entry.kind === "approval" && (
                  <>
                    <p className="text-[14.5px] font-medium break-words">{entry.approval.title}</p>
                    {entry.approval.requestedBy.jobTitle && (
                      <p className="text-[12.5px] text-[var(--lab-dim)] break-words">
                        While working on “{entry.approval.requestedBy.jobTitle}”
                      </p>
                    )}
                    {"toolName" in entry.approval.request &&
                      typeof entry.approval.request.input?.description === "string" && (
                        <p className="text-[13.5px] break-words">
                          <span className="text-[var(--lab-dim)]">Why, in the agent's words: </span>
                          {entry.approval.request.input.description}
                        </p>
                      )}
                    {"toolName" in entry.approval.request && (
                      <>
                        <p className="text-[12.5px] text-[var(--lab-dim)]">
                          Wants to use <span className="lab-mono text-[var(--lab-text)]">{entry.approval.request.toolName}</span>{" "}
                          with this input (written by the agent{entry.approval.requestTruncated ? ", shortened" : ""}):
                        </p>
                        <pre className="lab-pre max-h-48 overflow-auto">{shown(entry.approval.request.input)}</pre>
                      </>
                    )}
                    {!("toolName" in entry.approval.request) && (
                      <pre className="lab-pre max-h-48 overflow-auto">{shown(entry.approval.request)}</pre>
                    )}
                    <p className="text-[12.5px] text-[var(--lab-dim)]">
                      {[
                        entry.approval.estimate?.notionalModelCostUsd != null &&
                          `$${entry.approval.estimate.notionalModelCostUsd.toFixed(2)} of model use at API prices (not a charge)`,
                        entry.approval.estimate?.wallClockMinutes != null && `${entry.approval.estimate.wallClockMinutes} min`,
                        entry.approval.estimate?.notes,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                        .replace(/^(.+)$/, "Estimated by the agent: $1") ||
                        "Cost: none stated. A tool request carries no cost estimate."}
                    </p>
                  </>
                )}

                {entry.kind === "escalation" && (
                  <>
                    <p className="text-[14.5px] font-medium break-words">
                      {ESCALATION_REASONS[entry.escalation.reason] ?? entry.escalation.reason}
                      {entry.escalation.source === "manager" ? " · raised by the Lab Manager" : ""}
                    </p>
                    {(entry.escalation as { title?: string }).title && (
                      <p className="text-[13.5px] break-words">{(entry.escalation as { title?: string }).title}</p>
                    )}
                    <EscalationBody
                      labId={snap.lab.id}
                      hash={(entry.escalation as { artifact?: { hash?: string } | null }).artifact?.hash}
                    />
                  </>
                )}

                {entry.kind === "interrupted" && (
                  <p className="text-[14.5px] font-medium break-words line-clamp-3">
                    {entry.job.kind === "task" ? entry.job.title : entry.job.instructions}
                  </p>
                )}

                <p className="lab-mono text-[11.5px] text-[var(--lab-faint)] break-all">
                  {entry.at && `${formatAgo(entry.at, now)} · `}
                  session {(entry.kind === "approval" && entry.approval.requestedBy.sessionId) || agent?.sessionId || "none"}
                  {entry.kind === "approval" && ` · lapses ${new Date(entry.approval.expiresAt).toLocaleString()}`}
                </p>

                <div className="flex flex-wrap gap-2">
                  <LabButton variant="primary" onClick={() => onOpen(snap.lab.id, agent?.id)}>
                    {agent ? `Open the ${role}` : "Open the lab"}
                  </LabButton>
                  {entry.kind === "escalation" &&
                    (() => {
                      const lead = snap.agents.find((a) => a.role === "orchestrator");
                      const record = entry.escalation as { title?: string };
                      const subject = record.title || ESCALATION_REASONS[entry.escalation.reason] || entry.escalation.reason;
                      return (
                        <>
                          {lead && (
                            <LabButton
                              onClick={() => onOpen(snap.lab.id, lead.id, `About the escalation "${subject}":\n\n`)}
                            >
                              Reply to {leadName(snap.agents)}
                            </LabButton>
                          )}
                          <LabButton
                            disabled={disabled}
                            onClick={() => {
                              setResolveFailure(null);
                              setResolving({ id: entry.escalation.id, note: "" });
                            }}
                          >
                            Resolve…
                          </LabButton>
                        </>
                      );
                    })()}
                </div>

                {entry.kind === "escalation" && resolving?.id === entry.escalation.id && (
                  <div className="flex flex-col gap-2 border-t border-[var(--lab-line)] pt-3">
                    <p className="text-[13px] text-[var(--lab-dim)]">
                      Resolving only clears this from the list. It approves nothing and tells no agent anything; to
                      answer it, reply to {leadName(snap.agents)} instead.
                    </p>
                    <label htmlFor={`lab-resolve-${entry.escalation.id}`} className="lab-eyebrow !text-[10.5px]">
                      Note for the record (optional, not sent to any agent)
                    </label>
                    <textarea
                      id={`lab-resolve-${entry.escalation.id}`}
                      className="lab-input lab-textarea"
                      rows={2}
                      maxLength={MAX_ESCALATION_NOTE_LENGTH}
                      value={resolving.note}
                      disabled={busy}
                      onChange={(e) => setResolving({ id: entry.escalation.id, note: e.target.value })}
                    />
                    <div className="flex flex-wrap gap-2">
                      <LabButton
                        variant="primary"
                        disabled={disabled || busy}
                        onClick={() => void resolve([entry.escalation.id], resolving.note)}
                      >
                        {busy ? "Resolving…" : "Mark as resolved"}
                      </LabButton>
                      <LabButton variant="quiet" disabled={busy} onClick={() => setResolving(null)}>
                        Cancel
                      </LabButton>
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
