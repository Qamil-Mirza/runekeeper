"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  MAX_INSTRUCTION_LENGTH,
  type AgentAction,
  type LabAgent,
  type LabJob,
  type LabJobStatus,
  type LabTranscriptItem,
  type MessageDelivery,
} from "@/lib/lab/types";
import {
  ACTION_LABELS,
  ALLOWED,
  BLOCKED_REASONS,
  ROLE_LABELS,
  STATE_PRESENTATION,
  formatAgo,
  needsConfirm,
} from "./agent-card";
import { Chip, LabButton, StatusLight, Strip, toneClass, type LabTone } from "./lab-ui";
import { CANCELLABLE, useAgentConsole } from "./use-agent-console";
import type { LabFailure } from "./use-lab";

const JOB_STATUS: Record<LabJobStatus, { label: string; tone: LabTone }> = {
  queued: { label: "Queued", tone: "off" },
  awaitingApproval: { label: "Needs approval", tone: "bad" },
  running: { label: "Running", tone: "accent" },
  cancelling: { label: "Cancelling", tone: "warn" },
  succeeded: { label: "Done", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "off" },
  timedOut: { label: "Timed out", tone: "bad" },
  interrupted: { label: "Interrupted", tone: "warn" },
};

const TOOL_STATUS: Record<string, { label: string; tone: LabTone }> = {
  running: { label: "running", tone: "accent" },
  succeeded: { label: "ok", tone: "ok" },
  failed: { label: "failed", tone: "bad" },
  denied: { label: "denied", tone: "bad" },
};

const STANDING_RULES: Record<string, string> = {
  recordWrites: "record files",
  workspaceWrites: "files in its own workspace",
  webSearch: "web search",
  webFetch: "fetching web pages",
  shell: "commands inside its sandbox",
};

type DecidedBy = NonNullable<NonNullable<LabTranscriptItem["tool"]>["decidedBy"]>;

/** Who let a tool call run. Never worded as approval unless a person decided. */
function decidedByLabel(decidedBy: DecidedBy | undefined): string {
  if (!decidedBy) return "decision not recorded";
  switch (decidedBy.type) {
    case "builtin":
      return "allowed by Claude Code's own rules";
    case "human":
      return decidedBy.outcome === "allow" ? "approved by you" : "denied by you";
    case "policy":
      return `${decidedBy.outcome === "allow" ? "allowed" : "denied"} by host policy (${decidedBy.rule})`;
    case "standingRule":
      if (decidedBy.outcome === "deny" && decidedBy.rule === "shell") {
        return "refused: the command asked to run outside its sandbox";
      }
      return decidedBy.outcome === "deny"
        ? "refused at once: no standing permission covers it, and you chose not to be asked"
        : `allowed by a standing permission (${STANDING_RULES[decidedBy.rule] ?? decidedBy.rule})`;
  }
}

const REFUSAL_REASONS: Record<string, string> = {
  over_cap: "more handoffs than one message may start",
  self: "an agent cannot delegate to itself",
  agent_busy: "that agent was busy",
  agent_start_failed: "that agent could not be started",
  budget_exceeded: "the lab has no runtime left",
  host_busy: "the host was running as many tasks as it allows",
  disk_low: "the host is low on disk space",
  reconciliation_required: "that agent has an interrupted task to settle",
};

type Delegation = NonNullable<LabJob["delegations"]>[number];

/** What became of one piece of work the Orchestrator handed on. */
function DelegationCard({
  delegation,
  onOpen,
  onResend,
}: {
  delegation: Delegation;
  onOpen?: () => void;
  /** Opens the target agent with these instructions ready to read and send. */
  onResend?: (body: string) => void;
}) {
  const role = ROLE_LABELS[delegation.toRole];
  const status =
    delegation.status === "refused"
      ? { label: "Not started", tone: "warn" as LabTone }
      : delegation.jobStatus
        ? JOB_STATUS[delegation.jobStatus]
        : { label: "Starting", tone: "accent" as LabTone };
  return (
    <li className={cn("lab-card p-3 flex flex-col gap-2 min-w-0", toneClass(status.tone))}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="lab-eyebrow !text-[11px]">Handed to the {role}</span>
        <Chip tone={status.tone}>{status.label}</Chip>
      </div>
      <p className="break-words text-[13.5px] font-medium">{delegation.title}</p>
      {delegation.status === "refused" && (
        <p className="text-[13px] text-[var(--lab-warn)]">
          Not started: {REFUSAL_REASONS[delegation.reason ?? ""] ?? delegation.reason ?? "refused"}. You can give it
          to the {role} yourself.
        </p>
      )}
      {delegation.status === "refused" && typeof delegation.body === "string" && (
        <details>
          <summary className="lab-eyebrow !text-[11px] cursor-pointer">What the Orchestrator wanted to ask</summary>
          <AgentWritten label="Written by the Orchestrator" text={delegation.body} truncated={delegation.body.length >= 8000} />
        </details>
      )}
      {typeof delegation.result === "string" && delegation.result.length > 0 && (
        <AgentWritten label={`Result · written by the ${role}`} text={delegation.result} truncated={delegation.result.length >= 2000} />
      )}
      {(onOpen || onResend) && (
        <div className="flex flex-wrap gap-2">
          {onResend && delegation.status === "refused" && typeof delegation.body === "string" && (
            <LabButton variant="primary" onClick={() => onResend(delegation.body!)} className="!min-h-[28px] !px-2">
              Review and send to the {role}
            </LabButton>
          )}
          {onOpen && (
            <LabButton onClick={onOpen} className="!min-h-[28px] !px-2">
              Open the {role}
            </LabButton>
          )}
        </div>
      )}
    </li>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds - minutes * 60)}s`;
}

function AgentWritten({ label, text, truncated }: { label: string; text: string; truncated?: boolean }) {
  return (
    <div className="mt-2">
      <p className="lab-eyebrow !text-[11px]">
        {label}
        {truncated && " · shortened"}
      </p>
      <pre className="lab-pre mt-1">{text}</pre>
    </div>
  );
}

function TranscriptEntry({ item, role, now }: { item: LabTranscriptItem; role: string; now: number }) {
  const when = <span className="lab-mono text-[11.5px] text-[var(--lab-faint)]">{formatAgo(item.createdAt, now)}</span>;

  if (item.kind === "toolCall" && item.tool) {
    const tool = item.tool;
    const status = TOOL_STATUS[tool.status] ?? { label: tool.status, tone: "off" as LabTone };
    return (
      <li className="lab-entry lab-entry-tool">
        <details>
          <summary className="flex flex-wrap items-center gap-x-2 gap-y-1 cursor-pointer">
            <span className="lab-mono text-[13px] text-[var(--lab-text)]">{tool.name}</span>
            <Chip tone={status.tone}>{status.label}</Chip>
            <span className="min-w-0 flex-1 basis-40 truncate text-[13.5px] text-[var(--lab-dim)]">{tool.summary}</span>
            {when}
          </summary>
          <p className="mt-2 text-[12.5px] text-[var(--lab-dim)]">{decidedByLabel(tool.decidedBy)}</p>
          {tool.input !== undefined && (
            <AgentWritten label="Input · written by the agent" text={tool.input} truncated={tool.inputTruncated} />
          )}
          {typeof tool.result === "string" && (
            <AgentWritten label="Output · returned to the agent" text={tool.result} truncated={tool.resultTruncated} />
          )}
          {tool.input === undefined && tool.result == null && (
            <p className="mt-2 text-[12.5px] text-[var(--lab-faint)]">No input or output was recorded for this call.</p>
          )}
        </details>
      </li>
    );
  }

  if (item.kind === "delegatedInstruction") {
    return (
      <li className="lab-entry lab-entry-delegated">
        <p className="flex items-baseline justify-between gap-3">
          <span className="lab-eyebrow !text-[11px]">Delegated by the Orchestrator · not written by you</span>
          {when}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words">{item.text}</p>
      </li>
    );
  }

  if (item.kind === "systemNote" || item.kind === "managerInstruction") {
    return (
      <li className="lab-entry lab-entry-note">
        <p className="flex items-baseline justify-between gap-3">
          <span className="lab-eyebrow !text-[11px]">
            {item.kind === "systemNote" ? "Lab Manager" : "Lab Manager instruction"}
          </span>
          {when}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px] text-[var(--lab-dim)]">{item.text}</p>
      </li>
    );
  }

  const mine = item.kind === "humanMessage";
  return (
    <li className={cn("lab-entry", mine ? "lab-entry-human" : "lab-entry-agent")}>
      <p className="flex items-baseline justify-between gap-3">
        <span className="lab-eyebrow !text-[11px]">
          {mine ? "You" : role}
          {mine && item.queued && <span className="text-[var(--lab-warn)]"> · waiting for the {role} to be free</span>}
        </span>
        {when}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words">{item.text}</p>
      {item.truncated && <p className="mt-1 text-[12.5px] text-[var(--lab-warn)]">Shortened by the Lab Manager (32 KB limit).</p>}
    </li>
  );
}

function TaskRow({
  job,
  now,
  disabled,
  cancelling,
  failure,
  onCancel,
  onReconcile,
}: {
  job: LabJob;
  now: number;
  disabled: boolean;
  cancelling: boolean;
  failure?: LabFailure;
  onCancel: () => void;
  onReconcile: (resolution: "acknowledge" | "retry") => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const status = JOB_STATUS[job.status];
  useEffect(() => setConfirm(false), [job.status]);

  return (
    <li className={cn("lab-card p-3 flex flex-col gap-2 min-w-0", toneClass(status.tone))}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words text-[13.5px] line-clamp-3">
          {job.kind === "task" ? job.title : job.instructions}
        </p>
        <Chip tone={status.tone}>{status.label}</Chip>
      </div>
      <p className="lab-mono text-[11.5px] text-[var(--lab-faint)]">
        {formatAgo(job.createdAt, now)}
        {job.usage.wallClockSeconds > 0 && ` · ${formatDuration(job.usage.wallClockSeconds)}`}
        {job.usage.turns > 0 && ` · ${job.usage.turns} turn${job.usage.turns === 1 ? "" : "s"}`}
        {job.origin === "delegated" && " · delegated by the Orchestrator"}
        {job.origin === "policy" && " · started by host policy"}
      </p>
      {job.error && (
        <p className="lab-strip lab-tone-bad text-[13px]">
          {job.error.message} <span className="lab-mono text-[11.5px]">({job.error.code})</span>
        </p>
      )}
      {job.needsReconciliation && (
        <>
          <p className="lab-strip lab-tone-warn text-[13px]">
            Interrupted by a restart, so it did not finish. Nothing was run again automatically.
          </p>
          <div className="flex flex-wrap gap-2">
            <LabButton variant="primary" disabled={disabled || cancelling} onClick={() => onReconcile("retry")}>
              {cancelling ? "Working…" : "Run again"}
            </LabButton>
            <LabButton disabled={disabled || cancelling} onClick={() => onReconcile("acknowledge")}>
              Dismiss
            </LabButton>
          </div>
        </>
      )}
      {CANCELLABLE.has(job.status) && (
        <div className="flex flex-wrap gap-2">
          <LabButton
            variant={confirm ? "danger" : "default"}
            disabled={disabled || cancelling}
            onClick={() => {
              if (!confirm) return setConfirm(true);
              setConfirm(false);
              onCancel();
            }}
          >
            {cancelling ? "Cancelling…" : confirm ? "Confirm cancel" : "Cancel"}
          </LabButton>
          {confirm && (
            <LabButton variant="quiet" onClick={() => setConfirm(false)}>
              Keep running
            </LabButton>
          )}
        </div>
      )}
      {failure && (
        <p className="lab-strip lab-tone-bad text-[13px]" role="alert">
          {failure.message}
        </p>
      )}
    </li>
  );
}

/** Why the composer cannot take an instruction right now, or null when it can. */
function composerBlock(agent: LabAgent, disabled: boolean, runtimeLeft: number | null): string | null {
  if (disabled) return "The Lab Manager is not answering.";
  if (agent.mode === "tmux") return "This agent is being driven at a terminal on the host.";
  switch (agent.state) {
    case "crashed":
      return "The agent's session ended unexpectedly. Resume it to continue.";
    case "starting":
      return "The agent is starting.";
  }
  if (agent.blockedBy?.reason === "reconciliation") {
    return "A task was interrupted by a restart. Choose Run again or Dismiss under Tasks first.";
  }
  if (agent.blockedBy?.reason === "labPaused") return "The lab is paused.";
  if (runtimeLeft !== null && runtimeLeft <= 0) {
    return "This lab has no runtime left. Raise its runtime limit to continue.";
  }
  return null;
}

export function AgentConsole({
  labId,
  agent,
  now,
  disabled,
  runtimeLeftMinutes,
  pendingAction,
  actionFailure,
  onAction,
  onClose,
  central = false,
  agents = [],
  onOpenAgent,
  initialDraft,
}: {
  /** The Orchestrator's conversation presented as the lab's one chat. */
  central?: boolean;
  /** The lab's agents, to link a delegation to the agent it went to. */
  agents?: LabAgent[];
  /** `draft` puts text in that agent's composer for the owner to read and send. */
  onOpenAgent?: (agentId: string, draft?: string) => void;
  /** Text to start the composer with, shown for review and never sent by itself. */
  initialDraft?: string;
  labId: string;
  agent: LabAgent;
  now: number;
  /** True when the Lab Manager is unreachable or the snapshot is stale. */
  disabled: boolean;
  /** Minutes of runtime the lab has left; null when the manager does not report it. */
  runtimeLeftMinutes: number | null;
  pendingAction?: string;
  actionFailure?: LabFailure;
  onAction: (action: AgentAction) => void;
  onClose: () => void;
}) {
  const con = useAgentConsole(labId, agent, !disabled);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<AgentAction | null>(null);
  const [tab, setTab] = useState<"conversation" | "tasks">("conversation");
  const presentation = STATE_PRESENTATION[agent.state];
  const role = ROLE_LABELS[agent.role];
  const blocked = composerBlock(agent, disabled, runtimeLeftMinutes);

  // What became of the last message sent, said once under the composer.
  const [delivered, setDelivered] = useState<MessageDelivery | null>(null);

  useEffect(() => setConfirming(null), [agent.state]);
  useEffect(() => {
    setDelivered(null);
    setDraft(initialDraft ?? "");
    setTab("conversation");
  }, [agent.id, initialDraft]);

  // Follow new output only while the reader is already at the bottom.
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const lastSeq = con.items.at(-1)?.seq;
  // Delegation cards arrive and fill in after the last message.
  const cardsKey = con.jobs
    ?.flatMap((j) => j.delegations ?? [])
    .map((d) => `${d.handoffId}:${d.jobStatus ?? d.status}:${d.result?.length ?? 0}`)
    .join("|");
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lastSeq, con.loaded, tab, cardsKey]);

  const text = draft.trim();
  const tooLong = draft.length > MAX_INSTRUCTION_LENGTH;
  const asleep = agent.state === "notProvisioned" || agent.state === "stopped";
  // An instruction for a stopped agent starts it first, then goes out once it is ready.
  const [queued, setQueued] = useState<string | null>(null);
  const { send } = con;
  useEffect(() => {
    if (queued === null) return;
    if (agent.state === "idle") {
      setQueued(null);
      void send(queued).then((sent) => sent && setDraft(""));
    } else if (agent.state === "crashed" || (asleep && pendingAction === undefined && actionFailure)) {
      setQueued(null);
    }
  }, [queued, agent.state, asleep, pendingAction, actionFailure, send]);
  useEffect(() => setQueued(null), [agent.id]);

  const submit = async () => {
    if (!text || tooLong || blocked || con.sending || queued !== null) return;
    pinned.current = true;
    if (asleep) {
      setQueued(draft);
      onAction("start");
      return;
    }
    const delivery = await con.send(draft);
    if (delivery) setDraft("");
    setDelivered(delivery);
  };
  const busy = con.sending || queued !== null;

  // Delegation cards go after the last entry of the task that recorded them.
  const cardsAfter = new Map<string, LabJob>();
  if (con.jobs) {
    const lastOfJob = new Map<string, string>();
    for (const item of con.items) if (item.jobId) lastOfJob.set(item.jobId, item.id);
    for (const job of con.jobs) {
      const last = lastOfJob.get(job.id);
      if (last && job.delegations?.length) cardsAfter.set(last, job);
    }
  }
  const agentFor = (r: LabAgent["role"]) => agents.find((a) => a.role === r);
  const delegatingJobs = new Set([...cardsAfter.values()].map((j) => j.id));
  const cards = (job: LabJob) => (
    <li>
      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Work handed to other agents">
        {(job.delegations ?? []).map((d) => {
          const target = agentFor(d.toRole);
          return (
            <DelegationCard
              key={d.handoffId}
              delegation={d}
              onOpen={target && onOpenAgent ? () => onOpenAgent(target.id) : undefined}
              onResend={target && onOpenAgent ? (body) => onOpenAgent(target.id, body) : undefined}
            />
          );
        })}
      </ul>
    </li>
  );

  const clickAction = (action: AgentAction) => {
    if (needsConfirm(action, agent.state) && confirming !== action) return setConfirming(action);
    setConfirming(null);
    onAction(action);
  };

  const openJobs = con.jobs?.filter((j) => CANCELLABLE.has(j.status)).length ?? 0;

  return (
    <section className="lab-panel flex flex-col min-h-0 flex-1" aria-label={`${role} agent console`}>
      <header className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 p-3 border-b border-[var(--lab-line)]", toneClass(presentation.tone))}>
        <LabButton variant="quiet" onClick={onClose} aria-label="Back to all agents" className="!px-2">
          <span aria-hidden="true">←</span>
          <span className="hidden sm:inline">Agents</span>
        </LabButton>
        <h4 className="text-[18px] font-semibold tracking-tight">{central ? "Central chat" : role}</h4>
        {central && <span className="lab-eyebrow !text-[11px] hidden md:inline">the Orchestrator hands work to the right agent</span>}
        <span className="flex items-center gap-2 lab-tone-text text-[13.5px] font-medium" role="status">
          <StatusLight tone={presentation.tone} pulse={presentation.pulse} />
          {presentation.label}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {ALLOWED[agent.state].map((action) => (
            <LabButton
              key={action}
              onClick={() => clickAction(action)}
              disabled={disabled || pendingAction !== undefined}
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
      </header>

      {(actionFailure || agent.blockedBy || agent.lastError) && (
        <div className="flex flex-col gap-2 p-3 border-b border-[var(--lab-line)]">
          {actionFailure && (
            <Strip tone="bad" role="alert">
              {actionFailure.message}
            </Strip>
          )}
          {agent.blockedBy && <Strip tone="warn">{BLOCKED_REASONS[agent.blockedBy.reason] ?? "Held"}</Strip>}
          {agent.lastError && (
            <Strip tone="bad">
              Last error ({formatAgo(agent.lastError.at, now)}): {agent.lastError.message}
            </Strip>
          )}
        </div>
      )}

      <div className="flex border-b border-[var(--lab-line)] xl:hidden" role="tablist" aria-label="Console sections">
        {(["conversation", "tasks"] as const).map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className="lab-tab"
          >
            {name === "conversation" ? "Conversation" : `Tasks${openJobs > 0 ? ` · ${openJobs} open` : ""}`}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className={cn("flex-1 min-w-0 min-h-0 flex-col", tab === "conversation" ? "flex" : "hidden xl:flex")}>
          <div
            ref={scroller}
            className="lab-scroll flex-1 min-h-0 overflow-y-auto p-3 sm:p-4"
            onScroll={(e) => {
              const el = e.currentTarget;
              pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
            }}
          >
            {con.hasEarlier && (
              <div className="flex justify-center pb-3">
                <LabButton variant="quiet" onClick={() => void con.loadEarlier()} disabled={con.loadingEarlier}>
                  {con.loadingEarlier ? "Loading…" : "Load earlier"}
                </LabButton>
              </div>
            )}
            {con.transcriptFailure && (
              <Strip tone="bad" role="alert">
                Could not load the conversation: {con.transcriptFailure.message}
              </Strip>
            )}
            {con.loaded && con.items.length === 0 && (
              <p className="lab-eyebrow py-10 text-center">
                {central ? "Nothing yet. Say what you want done." : "Nothing yet. Give it an instruction."}
              </p>
            )}
            {!con.loaded && !con.transcriptFailure && <p className="lab-eyebrow py-10 text-center">Loading conversation…</p>}
            <ol className="flex flex-col gap-3" aria-label="Conversation" aria-live="polite">
              {con.items.map((item) => {
                const job = cardsAfter.get(item.id);
                if (
                  central &&
                  item.kind === "systemNote" &&
                  item.jobId &&
                  delegatingJobs.has(item.jobId) &&
                  /^(Recorded handoff|Delegated to|Not delegated to) /.test(item.text ?? "")
                ) {
                  return job ? <Fragment key={item.id}>{cards(job)}</Fragment> : null;
                }
                return (
                  <Fragment key={item.id}>
                    <TranscriptEntry item={item} role={role} now={now} />
                    {job && cards(job)}
                  </Fragment>
                );
              })}
            </ol>
            {agent.state === "working" && (
              <p className="lab-eyebrow mt-3 flex items-center gap-2 lab-tone-accent">
                <StatusLight tone="accent" pulse />
                {role} is working. Output appears as each message completes.
              </p>
            )}
            {agent.state === "waitingOnHuman" && (
              <Strip tone="warn">
                {role} asked to use a tool that needs your approval, which Runekeeper cannot give. Cancel the task
                under Tasks to release the agent. Standing permissions set on the host remove these requests.
              </Strip>
            )}
          </div>

          <form
            className="shrink-0 border-t border-[var(--lab-line)] p-3 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label htmlFor="lab-instruction" className="sr-only">
              Instruction for the {role}
            </label>
            <textarea
              id="lab-instruction"
              className="lab-input lab-textarea"
              rows={3}
              placeholder={
                blocked ?? (central ? "Say what you want done. The Orchestrator hands it to the right agent." : `Tell the ${role} what to do`)
              }
              value={draft}
              disabled={blocked !== null || busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter makes a new line. On a touch keyboard
                // Enter stays a new line and the Send button sends.
                if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
                const touch = window.matchMedia("(pointer: coarse)").matches;
                if (touch && !(e.metaKey || e.ctrlKey)) return;
                e.preventDefault();
                void submit();
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={cn("text-[12.5px]", tooLong ? "text-[var(--lab-bad)]" : "text-[var(--lab-dim)]")}>
                {tooLong
                  ? `Too long by ${draft.length - MAX_INSTRUCTION_LENGTH} characters.`
                  : (blocked ??
                    (queued !== null
                      ? `Starting the ${role}; your instruction goes out as soon as it is ready.`
                      : asleep
                        ? `The ${role} is stopped. Sending starts it.`
                        : delivered === "duringTask"
                          ? `Sent. The ${role} will see it at its next step, which can take a few minutes.`
                          : delivered === "queued"
                            ? `Sent. It waits until the ${role} is free.`
                            : agent.state === "waitingOnHuman"
                              ? `You can write to the ${role}, but a message does not answer its tool request.`
                              : agent.state === "working"
                                ? `The ${role} is working; it reads a message at its next step.`
                                : "Enter to send · Shift+Enter for a new line."))}
              </p>
              <LabButton type="submit" variant="primary" disabled={!text || tooLong || blocked !== null || busy}>
                {queued !== null ? "Starting…" : con.sending ? "Sending…" : "Send"}
              </LabButton>
            </div>
            {con.sendFailure && (
              <Strip tone="bad" role="alert">
                Not sent: {con.sendFailure.message}
              </Strip>
            )}
          </form>
        </div>

        <aside
          className={cn(
            "lab-scroll min-h-0 overflow-y-auto p-3 flex-col gap-3 w-full xl:w-[22rem] xl:shrink-0 xl:border-l border-[var(--lab-line)]",
            tab === "tasks" ? "flex" : "hidden xl:flex"
          )}
          aria-label="Tasks"
        >
          <p className="lab-eyebrow hidden xl:block">Tasks{con.jobs ? ` · ${con.jobs.length}` : ""}</p>
          {con.jobsFailure && (
            <Strip tone="bad" role="alert">
              Could not load tasks: {con.jobsFailure.message}
            </Strip>
          )}
          {con.jobs?.length === 0 && <p className="text-[13.5px] text-[var(--lab-dim)]">No tasks yet.</p>}
          <ul className="flex flex-col gap-2">
            {con.jobs?.map((job) => (
              <TaskRow
                key={job.id}
                job={job}
                now={now}
                disabled={disabled}
                cancelling={con.cancelling[job.id] === true}
                failure={con.cancelFailures[job.id]}
                onCancel={() => void con.cancel(job.id)}
                onReconcile={(resolution) => void con.reconcile(job.id, resolution)}
              />
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
