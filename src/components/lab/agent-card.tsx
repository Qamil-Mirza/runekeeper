"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  AgentAction,
  LabAgent,
  LabAgentState,
  LabTranscriptItem,
} from "@/lib/lab/types";
import type { LabFailure } from "./use-lab";

const ROLE_LABELS: Record<LabAgent["role"], string> = {
  advisor: "Advisor",
  executor: "Executor",
  reviewer: "Reviewer",
  orchestrator: "Orchestrator",
};

const STATE_PRESENTATION: Record<
  LabAgentState,
  { label: string; dot: string; text: string; pulse?: boolean }
> = {
  notProvisioned: { label: "Not provisioned", dot: "bg-outline", text: "text-on-surface-variant" },
  starting: { label: "Starting", dot: "bg-tertiary", text: "text-tertiary", pulse: true },
  idle: { label: "Idle", dot: "bg-[#6bcb6b]", text: "text-[#6bcb6b]" },
  working: { label: "Working", dot: "bg-primary", text: "text-primary", pulse: true },
  waitingOnHuman: { label: "Needs you", dot: "bg-[#ea4335]", text: "text-[#ea4335]", pulse: true },
  stopped: { label: "Stopped", dot: "bg-outline", text: "text-on-surface-variant" },
  crashed: { label: "Crashed", dot: "bg-[#ea4335]", text: "text-[#ea4335]" },
};

// Which controls make sense in each state. The Lab Manager is the authority
// and still answers 409 if the state changed underneath us.
const ALLOWED: Record<LabAgentState, AgentAction[]> = {
  notProvisioned: ["start"],
  starting: ["stop"],
  idle: ["stop", "restart"],
  working: ["stop", "restart"],
  waitingOnHuman: ["stop", "restart"],
  stopped: ["start", "resume"],
  crashed: ["resume"],
};

const ACTION_LABELS: Record<AgentAction, string> = {
  start: "Start",
  stop: "Stop",
  restart: "Restart",
  resume: "Resume",
};

const BLOCKED_REASONS: Record<string, string> = {
  reconciliation: "Held: an interrupted job needs your review",
  labPaused: "Held: the lab is paused",
  isolationRequired: "Held: agent isolation is not configured",
};

// Interrupting work in progress asks for a second click.
function needsConfirm(action: AgentAction, state: LabAgentState) {
  return (
    (action === "stop" || action === "restart") &&
    (state === "working" || state === "waitingOnHuman")
  );
}

export function formatAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

interface AgentCardProps {
  agent: LabAgent;
  now: number;
  disabled: boolean;
  pendingAction?: string;
  failure?: LabFailure;
  /** Latest system note from the manager's transcript for this agent. */
  systemNote?: LabTranscriptItem;
  onAction: (action: AgentAction) => void;
}

export function AgentCard({
  agent,
  now,
  disabled,
  pendingAction,
  failure,
  systemNote,
  onAction,
}: AgentCardProps) {
  const [confirming, setConfirming] = useState<AgentAction | null>(null);
  const presentation = STATE_PRESENTATION[agent.state];
  const busy = pendingAction !== undefined;

  // A confirmation is for the state it was asked in.
  useEffect(() => setConfirming(null), [agent.state]);

  const handleClick = (action: AgentAction) => {
    if (needsConfirm(action, agent.state) && confirming !== action) {
      setConfirming(action);
      return;
    }
    setConfirming(null);
    onAction(action);
  };

  return (
    <article
      className="bg-surface-dim/70 ghost-border p-4 flex flex-col gap-3"
      aria-label={`${ROLE_LABELS[agent.role]} agent`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-headline-md text-on-surface leading-tight">
            {ROLE_LABELS[agent.role]}
          </h4>
          <p className="font-label text-label-sm uppercase tracking-wide text-on-surface-variant mt-0.5">
            {agent.mode === "tmux" ? "tmux (driven at a terminal)" : "Managed"}
          </p>
        </div>
        <div
          className={cn("flex items-center gap-2 font-label text-label-md", presentation.text)}
          role="status"
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full shrink-0",
              presentation.dot,
              presentation.pulse && "animate-pulse"
            )}
            aria-hidden="true"
          />
          {presentation.label}
        </div>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-label text-label-md">
        <dt className="text-on-surface-variant">Session</dt>
        <dd className="text-on-surface font-mono text-[11px] truncate" title={agent.sessionId ?? undefined}>
          {agent.sessionId ?? "none yet"}
        </dd>
        <dt className="text-on-surface-variant">Current job</dt>
        <dd className="text-on-surface truncate">{agent.currentJob?.title ?? "none"}</dd>
        <dt className="text-on-surface-variant">Last activity</dt>
        <dd className="text-on-surface">{formatAgo(agent.lastActivityAt, now)}</dd>
        {agent.pendingApprovalCount > 0 && (
          <>
            <dt className="text-on-surface-variant">Approvals</dt>
            <dd className="text-[#ea4335]">{agent.pendingApprovalCount} waiting</dd>
          </>
        )}
        {agent.mode === "tmux" && agent.tmuxAttachHint && (
          <>
            <dt className="text-on-surface-variant">Attach</dt>
            <dd className="text-on-surface font-mono text-[11px] break-all">
              {agent.tmuxAttachHint}
            </dd>
          </>
        )}
      </dl>

      {systemNote?.text && (
        <p className="font-label text-label-md text-on-surface-variant break-words">
          <span className="uppercase tracking-wide text-label-sm">
            Manager note, {formatAgo(systemNote.createdAt, now)}:
          </span>{" "}
          <span className="text-on-surface">{systemNote.text}</span>
        </p>
      )}

      {agent.blockedBy && (
        <p className="font-label text-label-md text-tertiary">
          {BLOCKED_REASONS[agent.blockedBy.reason] ?? "Held"}
        </p>
      )}

      {agent.lastError && (
        <p className="px-2 py-1.5 bg-[rgba(234,67,53,0.1)] border border-[rgba(234,67,53,0.2)] font-label text-label-md text-[#ea4335] break-words">
          Last error ({formatAgo(agent.lastError.at, now)}): {agent.lastError.message}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-auto pt-1">
        {ALLOWED[agent.state].map((action) => (
          <button
            key={action}
            onClick={() => handleClick(action)}
            disabled={disabled || busy}
            className={cn(
              "py-1.5 px-3 font-label text-label-md transition-colors disabled:opacity-40 disabled:pointer-events-none",
              confirming === action
                ? "bg-[rgba(234,67,53,0.2)] text-[#ea4335]"
                : "bg-[rgba(212,168,96,0.15)] text-[#d4a860] hover:bg-[rgba(212,168,96,0.25)]"
            )}
          >
            {pendingAction === action
              ? `${ACTION_LABELS[action]}…`
              : confirming === action
                ? `Confirm ${ACTION_LABELS[action].toLowerCase()}`
                : ACTION_LABELS[action]}
          </button>
        ))}
        {confirming && (
          <button
            onClick={() => setConfirming(null)}
            className="py-1.5 px-3 font-label text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {failure && (
        <p className="font-label text-label-md text-[#ea4335] break-words" role="alert">
          {failure.message}
        </p>
      )}
    </article>
  );
}
