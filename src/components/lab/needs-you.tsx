"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as labApi from "@/lib/lab/client";
import type { LabSnapshot, LabSummary, LabComputeApproval } from "@/lib/lab/types";
import { AgentAvatar } from "./agent-avatar";
import { ComputeApprovals } from "./compute-approvals";
import { agentName, formatAgo } from "./agent-card";
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
  onOpen: (labId: string, agentId?: string) => void;
}) {
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
  }, [key]);

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
  entries.sort((a, b) => (a.at < b.at ? 1 : -1));
  const loading = waiting.some((id) => !all[id]) && failed === 0;

  return (
    <section className="flex flex-col gap-4 w-full max-w-[1000px]" aria-label="Needs you">
      <header className="lab-panel p-4">
        <h3 className="text-[25px] font-semibold leading-tight tracking-tight">Needs you</h3>
        <p className="mt-2 text-[13.5px] text-[var(--lab-dim)]">
          What agents in any lab are waiting on you for. A GPU rental is approved or denied here. Runekeeper cannot
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
      {!loading && entries.length === 0 && computeApprovals.length === 0 && <p className="lab-eyebrow py-10 text-center">Nothing is waiting on you</p>}

      <ul className="flex flex-col gap-3">
        {entries.map((entry) => {
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
                    {(() => {
                      const record = entry.escalation as { title?: string; body?: string };
                      const text = [record.title, record.body].filter(Boolean).join("\n");
                      return text ? <p className="text-[13.5px] whitespace-pre-wrap break-words line-clamp-6">{text}</p> : null;
                    })()}
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

                <div>
                  <LabButton variant="primary" onClick={() => onOpen(snap.lab.id, agent?.id)}>
                    {agent ? `Open the ${role}` : "Open the lab"}
                  </LabButton>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
