"use client";

import { cn } from "@/lib/utils";
import type {
  AgentAction,
  LabAgent,
  LabAgentState,
  LabJob,
} from "@/lib/lab/types";
import type { LabTone } from "./lab-ui";

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

/** Who took a retired agent out of the team, and why, in one line. */
export function retiredLine(agent: LabAgent, lead: string): string | null {
  const retired = agent.retired;
  if (!retired) return null;
  const by = (retired.by as { type?: string } | null)?.type;
  const who = by === "orchestrator" ? `Retired by ${lead}` : by === "human" ? "Retired by you" : "Retired";
  return retired.reason ? `${who}: ${retired.reason}` : who;
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

/** One line for what an agent is doing now, as the Lab Manager reports it. */
export function doingNow(agent: LabAgent): string {
  if (agent.currentActivity?.text) return firstLine(agent.currentActivity.text, 80);
  return RESTING[agent.state] ?? (agent.state === "working" ? "Working" : "");
}
