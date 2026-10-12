"use client";

import { cn } from "@/lib/utils";
import type { LabAgent, LabJob } from "@/lib/lab/types";
import { AgentAvatar } from "./agent-avatar";
import { ROLE_LABELS, STATE_PRESENTATION, agentName, jobSummary, modelLine } from "./agent-card";
import { StatusLight } from "./lab-ui";

const GROUPS: { role: LabAgent["role"]; label: string }[] = [
  { role: "advisor", label: "Advisors" },
  { role: "executor", label: "Executors" },
  { role: "reviewer", label: "Reviewers" },
];

const RUNNING: ReadonlySet<LabJob["status"]> = new Set(["running", "awaitingApproval", "cancelling"]);

function Node({
  agent,
  task,
  root,
  onOpen,
}: {
  agent: LabAgent;
  /** A task the lead agent handed to this one that is under way. */
  task?: LabJob;
  root?: boolean;
  onOpen: (agentId: string) => void;
}) {
  const state = STATE_PRESENTATION[agent.state];
  const model = modelLine(agent.model);
  const name = agentName(agent);
  return (
    <button
      type="button"
      className={cn("lab-tree-node", root && "lab-tree-root", agent.retired && "lab-retired", task && "lab-tree-busy")}
      onClick={() => onOpen(agent.id)}
      aria-label={`Open ${name}`}
    >
      <AgentAvatar role={agent.role} state={agent.retired ? "stopped" : agent.state} size={root ? 44 : 34} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[14px] font-medium text-[var(--lab-text)]">{name}</span>
        {model && (
          <span className={cn("lab-mono block truncate text-[11.5px]", model.mismatch ? "text-[var(--lab-warn)]" : "text-[var(--lab-dim)]")}>
            {model.text}
          </span>
        )}
        <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--lab-dim)]">
          {agent.retired ? (
            "Retired"
          ) : (
            <>
              <StatusLight tone={state.tone} pulse={state.pulse} />
              {state.label}
            </>
          )}
        </span>
        {task && <span className="mt-0.5 block truncate text-[12px] text-[var(--lab-accent)]">↳ {jobSummary(task, 60)}</span>}
      </span>
    </button>
  );
}

/**
 * The lab's team as a tree: the lead agent on top, the others under it by
 * role. An agent only ever reports to the lead, so the tree has two levels.
 * A task the lead handed out that is still running is named on its agent.
 */
export function TeamTree({
  agents,
  jobs,
  onOpenAgent,
}: {
  agents: LabAgent[];
  jobs: LabJob[] | null;
  onOpenAgent: (agentId: string) => void;
}) {
  const lead = agents.find((a) => a.role === "orchestrator" && !a.retired);
  if (!lead) return null;
  const team = agents.filter((a) => a.id !== lead.id && !a.retired);
  const retired = agents.filter((a) => a.retired);
  const inFlight = (agentId: string) =>
    jobs?.find((j) => j.agentId === agentId && j.origin === "delegated" && RUNNING.has(j.status));

  const branches = [
    ...GROUPS.map((g) => ({ key: g.role as string, label: g.label, members: team.filter((a) => a.role === g.role), retired: false })),
    // A second lead cannot exist, but an agent of an unknown role must not vanish.
    {
      key: "other",
      label: "Others",
      members: team.filter((a) => !GROUPS.some((g) => g.role === a.role)),
      retired: false,
    },
    { key: "retired", label: "Retired", members: retired, retired: true },
  ].filter((b) => b.members.length > 0);

  return (
    <div className="lab-tree" role="tree" aria-label="Team hierarchy">
      <div role="treeitem" aria-expanded={branches.length > 0} aria-selected={false} className="lab-tree-top">
        <Node agent={lead} root onOpen={onOpenAgent} />
      </div>
      {branches.length === 0 ? (
        <p className="mt-3 text-[13px] text-[var(--lab-dim)]">
          {agentName(lead)} has no one under it yet. It adds agents when it starts on your description.
        </p>
      ) : (
        <div className="lab-tree-branches" role="group">
          {branches.map((branch) => (
            <div key={branch.key} className={cn("lab-tree-branch", branch.retired && "lab-tree-branch-retired")}>
              <p className="lab-eyebrow !text-[10.5px]">
                {branch.label} · {branch.members.length}
              </p>
              {branch.members.map((agent) => (
                <div key={agent.id} role="treeitem" aria-selected={false} title={agent.directive ?? ROLE_LABELS[agent.role]}>
                  <Node agent={agent} task={inFlight(agent.id)} onOpen={onOpenAgent} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
