"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  AgentAction,
  LabAgent,
  LabAgentState,
  LabJob,
  LabTranscriptItem,
} from "@/lib/lab/types";
import { AgentAvatar } from "./agent-avatar";
import { LabButton, StatusLight, toneClass, type LabTone } from "./lab-ui";
import type { LabFailure } from "./use-lab";

export const ROLE_LABELS: Record<LabAgent["role"], string> = {
  advisor: "Advisor",
  executor: "Executor",
  reviewer: "Reviewer",
  orchestrator: "Orchestrator",
};

/** What an agent is called. A Lab Manager older than draft.27 gives no name, so the role stands in. */
export function agentName(agent: Pick<LabAgent, "role"> & { name?: string }): string {
  return agent.name || ROLE_LABELS[agent.role];
}

/** The name of the lab's lead agent, which the others' work comes from. */
export function leadName(agents: readonly LabAgent[] | undefined): string {
  const lead = agents?.find((a) => a.role === "orchestrator");
  return lead ? agentName(lead) : ROLE_LABELS.orchestrator;
}

// "claude-sonnet-5-5" and a dated "claude-sonnet-5-5-20260101" are the same model.
const sameModel = (a: string, b: string) => a === b || a.startsWith(b) || b.startsWith(a);

/**
 * What an agent runs on. `actual` is what Claude Code reported for its last
 * task; before that only what its tasks will ask for is known.
 */
export function modelLine(model: LabAgent["model"] | undefined): { text: string; note?: string; mismatch?: boolean } | null {
  if (!model) return null;
  const { requested, actual } = model;
  if (actual) {
    return requested && !sameModel(requested, actual)
      ? { text: actual, note: `asked for ${requested}`, mismatch: true }
      : { text: actual };
  }
  return requested
    ? { text: requested, note: "asked for; not confirmed until it runs a task" }
    : { text: "Claude Code's default", note: "not confirmed until it runs a task" };
}

export function ModelTag({ model }: { model: LabAgent["model"] | undefined }) {
  const line = modelLine(model);
  if (!line) return null;
  return (
    <span className="min-w-0 break-words">
      <span className={cn("lab-mono text-[12.5px]", line.mismatch && "text-[var(--lab-warn)]")}>{line.text}</span>
      {line.note && (
        <span className={cn("text-[12.5px]", line.mismatch ? "text-[var(--lab-warn)]" : "text-[var(--lab-faint)]")}>
          {" "}
          · {line.note}
        </span>
      )}
    </span>
  );
}

export const STATE_PRESENTATION: Record<LabAgentState, { label: string; tone: LabTone; pulse?: boolean }> = {
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
export const ALLOWED: Record<LabAgentState, AgentAction[]> = {
  notProvisioned: ["start"],
  starting: ["stop"],
  idle: ["stop", "restart"],
  working: ["stop", "restart"],
  waitingOnHuman: ["stop", "restart"],
  stopped: ["start", "resume"],
  crashed: ["resume"],
};

export const ACTION_LABELS: Record<AgentAction, string> = {
  start: "Start",
  stop: "Stop",
  restart: "Restart",
  resume: "Resume",
};

export const BLOCKED_REASONS: Record<string, string> = {
  reconciliation: "Held: an interrupted job needs your review",
  labPaused: "Held: the lab is paused",
  isolationRequired: "Held: agent isolation is not configured",
};

// Interrupting work in progress asks for a second click.
export function needsConfirm(action: AgentAction, state: LabAgentState) {
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

const RESTING: Partial<Record<LabAgentState, string>> = {
  notProvisioned: "Does not exist yet. Start it to create it.",
  starting: "Starting up",
  idle: "Nothing; waiting for work",
  waitingOnHuman: "Waiting for your decision on a tool request",
  stopped: "Stopped",
  crashed: "Its session ended unexpectedly",
};

function firstLine(text: string, max = 140): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/**
 * One line saying what a task is about: its title, which the Lab Manager
 * gives every task, or failing that the first line of its instructions.
 * Never the whole prompt.
 */
export function jobSummary(job: Pick<LabJob, "title" | "instructions">, max = 110): string {
  const source = job.title?.trim() || job.instructions;
  const line = source.split("\n").find((l) => l.trim()) ?? "";
  return firstLine(line.replace(/^\s*#{1,6}\s+/, ""), max) || "Untitled task";
}

/** One line for what a working agent last did, from its transcript. */
function doingNow(agent: LabAgent, last: LabTranscriptItem | undefined): string {
  // A Lab Manager from draft.20 on says it itself; older ones leave it to the transcript.
  if (agent.currentActivity?.text) return firstLine(agent.currentActivity.text);
  if (agent.state !== "working") return RESTING[agent.state] ?? "—";
  if (last?.kind === "toolCall" && last.tool) {
    return firstLine(`${last.tool.name}${last.tool.summary ? `: ${last.tool.summary}` : ""}`);
  }
  if (last?.kind === "assistantText" && last.text) return `Writing: ${firstLine(last.text, 110)}`;
  return "Working";
}

interface AgentCardProps {
  /** The task this agent is on, from the lab's task list. */
  job?: LabJob;
  /** The latest thing it did, from its transcript. */
  lastItem?: LabTranscriptItem;
  agent: LabAgent;
  now: number;
  disabled: boolean;
  pendingAction?: string;
  failure?: LabFailure;
  /** Latest system note from the manager's transcript for this agent. */
  systemNote?: LabTranscriptItem;
  onAction: (action: AgentAction) => void;
  /** Opens this agent's conversation and tasks. */
  onOpen: () => void;
}

export function AgentCard({
  job,
  lastItem,
  agent,
  now,
  disabled,
  pendingAction,
  failure,
  systemNote,
  onAction,
  onOpen,
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
      aria-label={`${agentName(agent)} agent`}
    >
      <header className="flex items-center gap-3">
        <AgentAvatar role={agent.role} state={agent.state} size={56} />
        <div className="min-w-0 mr-auto">
          <h4 className="lab-eyebrow !text-[var(--lab-text)] break-words">{agentName(agent)}</h4>
          <p className="lab-eyebrow mt-1 !text-[11px] !text-[var(--lab-faint)]">
            {agentName(agent) !== ROLE_LABELS[agent.role] && `${ROLE_LABELS[agent.role]} · `}
            {agent.mode === "tmux" ? "tmux · driven at a terminal" : "managed"}
          </p>
        </div>
        <div className="flex items-center gap-2 lab-tone-text text-[13.5px] font-medium" role="status">
          <StatusLight tone={presentation.tone} pulse={presentation.pulse} />
          {presentation.label}
        </div>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13.5px] border-t border-[var(--lab-line)] pt-3">
        {agent.model && (
          <>
            <dt className="text-[var(--lab-dim)]">Model</dt>
            <dd>
              <ModelTag model={agent.model} />
            </dd>
          </>
        )}
        {agent.directive && (
          <>
            <dt className="text-[var(--lab-dim)]">Role</dt>
            <dd className="line-clamp-3 break-words" title={agent.directive}>
              {agent.directive}
            </dd>
          </>
        )}
        <dt className="text-[var(--lab-dim)]">Goal</dt>
        <dd className="line-clamp-2 break-words">
          {job ? jobSummary(job) : (agent.currentJob?.title ?? "—")}
        </dd>
        <dt className="text-[var(--lab-dim)]">Doing</dt>
        <dd className="line-clamp-2 break-words">{doingNow(agent, lastItem)}</dd>
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
        <LabButton variant="primary" onClick={onOpen}>
          Open
        </LabButton>
        {ALLOWED[agent.state].map((action) => (
          <LabButton
            key={action}
            onClick={() => handleClick(action)}
            disabled={disabled || busy}
            variant={confirming === action ? "danger" : "default"}
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
