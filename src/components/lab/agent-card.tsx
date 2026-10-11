"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  AgentAction,
  LabAgent,
  LabAgentState,
  LabTranscriptItem,
} from "@/lib/lab/types";
import { LabButton, StatusLight, toneClass, type LabTone } from "./lab-ui";
import type { LabFailure } from "./use-lab";

const ROLE_LABELS: Record<LabAgent["role"], string> = {
  advisor: "Advisor",
  executor: "Executor",
  reviewer: "Reviewer",
  orchestrator: "Orchestrator",
};

const STATE_PRESENTATION: Record<LabAgentState, { label: string; tone: LabTone; pulse?: boolean }> = {
  notProvisioned: { label: "Not provisioned", tone: "off" },
  starting: { label: "Starting", tone: "warn", pulse: true },
  idle: { label: "Idle", tone: "ok" },
  working: { label: "Working", tone: "accent", pulse: true },
  waitingOnHuman: { label: "Needs you", tone: "bad", pulse: true },
  stopped: { label: "Stopped", tone: "off" },
  crashed: { label: "Crashed", tone: "bad" },
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
      className={cn("lab-card p-4 flex flex-col gap-3 min-w-0", toneClass(presentation.tone))}
      aria-label={`${ROLE_LABELS[agent.role]} agent`}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h4 className="lab-eyebrow !text-[var(--lab-text)]">{ROLE_LABELS[agent.role]}</h4>
          <p className="lab-eyebrow mt-1 !text-[11px] !text-[var(--lab-faint)]">
            {agent.mode === "tmux" ? "tmux · driven at a terminal" : "managed"}
          </p>
        </div>
        <div className="flex items-center gap-2 lab-tone-text text-[13.5px] font-medium" role="status">
          <StatusLight tone={presentation.tone} pulse={presentation.pulse} />
          {presentation.label}
        </div>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13.5px] border-t border-[var(--lab-line)] pt-3">
        <dt className="text-[var(--lab-dim)]">Session</dt>
        <dd className="lab-mono text-[12.5px] truncate" title={agent.sessionId ?? undefined}>
          {agent.sessionId ?? "—"}
        </dd>
        <dt className="text-[var(--lab-dim)]">Job</dt>
        <dd className="truncate">{agent.currentJob?.title ?? "—"}</dd>
        <dt className="text-[var(--lab-dim)]">Activity</dt>
        <dd className="lab-mono text-[12.5px]">{formatAgo(agent.lastActivityAt, now)}</dd>
        {agent.pendingApprovalCount > 0 && (
          <>
            <dt className="text-[var(--lab-dim)]">Approvals</dt>
            <dd className="text-[var(--lab-bad)]">{agent.pendingApprovalCount} waiting</dd>
          </>
        )}
        {agent.mode === "tmux" && agent.tmuxAttachHint && (
          <>
            <dt className="text-[var(--lab-dim)]">Attach</dt>
            <dd className="lab-mono text-[12.5px] break-all">{agent.tmuxAttachHint}</dd>
          </>
        )}
      </dl>

      {systemNote?.text && (
        <p className="text-[13.5px] break-words text-[var(--lab-dim)]">
          <span className="lab-eyebrow !text-[11px]">
            Manager · {formatAgo(systemNote.createdAt, now)}
          </span>
          <span className="block mt-0.5 text-[var(--lab-text)]">{systemNote.text}</span>
        </p>
      )}

      {agent.blockedBy && (
        <p className="lab-strip lab-tone-warn text-[13.5px]">
          {BLOCKED_REASONS[agent.blockedBy.reason] ?? "Held"}
        </p>
      )}

      {agent.lastError && (
        <p className="lab-strip lab-tone-bad text-[13.5px]">
          Last error ({formatAgo(agent.lastError.at, now)}): {agent.lastError.message}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-auto pt-1">
        {ALLOWED[agent.state].map((action) => (
          <LabButton
            key={action}
            onClick={() => handleClick(action)}
            disabled={disabled || busy}
            variant={confirming === action ? "danger" : action === "start" || action === "resume" ? "primary" : "default"}
          >
            {pendingAction === action
              ? `${ACTION_LABELS[action]}…`
              : confirming === action
                ? `Confirm ${ACTION_LABELS[action].toLowerCase()}`
                : ACTION_LABELS[action]}
          </LabButton>
        ))}
        {confirming && (
          <LabButton variant="quiet" onClick={() => setConfirming(null)}>
            Cancel
          </LabButton>
        )}
      </div>

      {failure && (
        <p className="lab-strip lab-tone-bad text-[13.5px]" role="alert">
          {failure.message}
        </p>
      )}
    </article>
  );
}
