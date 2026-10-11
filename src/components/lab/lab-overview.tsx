"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { LabHealth, LabJob, LabSnapshot } from "@/lib/lab/types";
import { ROLE_LABELS, formatAgo } from "./agent-card";
import { ComputePanel } from "./compute-panel";
import { Chip, LabButton, Strip, toneClass, type LabTone } from "./lab-ui";
import { NetworkHosts } from "./network-hosts";
import type { LabFailure } from "./use-lab";

const OPEN_STATUSES: ReadonlySet<LabJob["status"]> = new Set(["queued", "awaitingApproval", "running", "cancelling"]);

const OPEN_LABELS: Partial<Record<LabJob["status"], { label: string; tone: LabTone }>> = {
  queued: { label: "Queued", tone: "off" },
  awaitingApproval: { label: "Needs approval", tone: "bad" },
  running: { label: "Running", tone: "accent" },
  cancelling: { label: "Cancelling", tone: "warn" },
};

const WINDOW_LABELS: Record<string, string> = {
  five_hour: "5-hour window",
  seven_day: "7-day window",
  seven_day_opus: "7-day window · Opus",
  seven_day_sonnet: "7-day window · Sonnet",
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatUntil(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  if (!Number.isFinite(seconds)) return null;
  if (seconds <= 0) return "now";
  if (seconds < 3600) return `in ${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 48 * 3600) return `in ${Math.round(seconds / 3600)}h`;
  return `in ${Math.round(seconds / 86400)}d`;
}

function Tile({ title, note, className, children }: { title: string; note?: string; className?: string; children: ReactNode }) {
  return (
    <section className={cn("lab-panel p-4 flex flex-col gap-3 min-w-0", className)} aria-label={title}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="lab-eyebrow !text-[var(--lab-text)]">{title}</h4>
        {note && <span className="lab-eyebrow !text-[10.5px] !tracking-[0.1em] !text-[var(--lab-faint)]">{note}</span>}
      </header>
      {children}
    </section>
  );
}

function Goals({
  lab,
  disabled,
  pending,
  failure,
  onSave,
}: {
  lab: LabSnapshot["lab"];
  disabled: boolean;
  pending: boolean;
  failure?: LabFailure;
  onSave: (goals: { objective: string; priorities: string[] }) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [objective, setObjective] = useState("");
  const [priorities, setPriorities] = useState("");

  useEffect(() => setEditing(false), [lab.id]);

  const open = () => {
    setObjective(lab.objective ?? "");
    setPriorities(lab.priorities.join("\n"));
    setEditing(true);
  };
  const lines = priorities.split("\n").map((l) => l.trim()).filter(Boolean);
  const invalid = objective.length > 4000 || lines.length > 20 || lines.some((l) => l.length > 500);

  if (editing) {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (invalid || pending) return;
          void onSave({ objective: objective.trim(), priorities: lines }).then((saved) => saved && setEditing(false));
        }}
      >
        <label htmlFor="lab-objective" className="text-[12.5px] text-[var(--lab-dim)]">
          Objective
        </label>
        <textarea
          id="lab-objective"
          className="lab-input lab-textarea"
          rows={3}
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          disabled={disabled || pending}
        />
        <label htmlFor="lab-priorities" className="text-[12.5px] text-[var(--lab-dim)]">
          Current goals, one per line, most important first
        </label>
        <textarea
          id="lab-priorities"
          className="lab-input lab-textarea"
          rows={4}
          value={priorities}
          onChange={(e) => setPriorities(e.target.value)}
          disabled={disabled || pending}
        />
        {invalid && (
          <p className="text-[12.5px] text-[var(--lab-bad)]">
            Up to 20 goals of 500 characters each, and an objective of up to 4000 characters.
          </p>
        )}
        <div className="flex gap-2">
          <LabButton type="submit" variant="primary" disabled={disabled || pending || invalid}>
            {pending ? "Saving…" : "Save goals"}
          </LabButton>
          <LabButton variant="quiet" onClick={() => setEditing(false)}>
            Cancel
          </LabButton>
        </div>
        {failure && (
          <Strip tone="bad" role="alert">
            {failure.message}
          </Strip>
        )}
      </form>
    );
  }

  const empty = !lab.objective && lab.priorities.length === 0;
  return (
    <>
      {empty && <p className="text-[13.5px] text-[var(--lab-dim)]">No objective or goals set for this lab yet.</p>}
      {lab.objective && <p className="whitespace-pre-wrap break-words">{lab.objective}</p>}
      {lab.priorities.length > 0 && (
        <ol className="flex flex-col gap-1.5 text-[13.5px]">
          {lab.priorities.map((goal, i) => (
            <li key={`${i}-${goal}`} className="flex gap-2 min-w-0">
              <span className="lab-mono text-[12px] text-[var(--lab-accent)] pt-px">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 break-words">{goal}</span>
            </li>
          ))}
        </ol>
      )}
      <div>
        <LabButton onClick={open} disabled={disabled} className="!min-h-[28px] !px-2">
          {empty ? "Set goals" : "Edit goals"}
        </LabButton>
      </div>
    </>
  );
}

/**
 * The lab at a glance. Every figure is labelled with where it comes from:
 * token counts and usage limits are reported by Claude Code on the agent
 * side, not measured by the Lab Manager, and none of them is a charge.
 */
export function LabOverview({
  snapshot,
  health,
  jobs,
  now,
  disabled,
  goalsPending,
  goalsFailure,
  onSaveGoals,
  onOpenAgent,
}: {
  snapshot: LabSnapshot;
  health: LabHealth | null;
  /** The lab's newest tasks; null until loaded. */
  jobs: LabJob[] | null;
  now: number;
  disabled: boolean;
  goalsPending: boolean;
  goalsFailure?: LabFailure;
  onSaveGoals: (goals: { objective: string; priorities: string[] }) => Promise<boolean>;
  onOpenAgent: (agentId: string) => void;
}) {
  const estimates = snapshot.budget.estimates;
  const subscription = health?.subscription;
  const windows = Object.entries(subscription?.windows ?? {});
  const open = jobs?.filter((j) => OPEN_STATUSES.has(j.status)) ?? null;
  const roleOf = (agentId: string) => {
    const agent = snapshot.agents.find((a) => a.id === agentId);
    return agent ? ROLE_LABELS[agent.role] : "Agent";
  };
  const stage = snapshot.lab.cycleStage;
  // The compute tile takes a full row once rented compute is connected.
  const computeActive = health?.spend.metering === "active" && snapshot.budget.compute !== undefined;
  const capabilities = health?.capabilities;
  // Shown when the host has the shell switched on, even while it is withheld.
  const showNetwork =
    capabilities?.networkTofu !== undefined &&
    Object.values(capabilities.shell ?? {}).some((s) => s.allowed || s.reason !== "no_autonomy_policy");

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 order-last md:order-none">
      <Tile title="Tokens used" note="reported by Claude Code">
        <p className="lab-mono text-[30px] leading-none tracking-tight">
          {estimates ? formatTokens(estimates.tokens) : "—"}
        </p>
        <p className="text-[12.5px] text-[var(--lab-dim)]">
          All finished tasks in this lab, counting cached tokens in full, so it runs well above what your usage
          limits weigh. An estimate, not a charge.
        </p>
      </Tile>

      <Tile title="Usage limits" note={subscription ? (subscription.basis === "reported" ? "reported by Claude Code" : "inferred") : undefined}>
        {!subscription && <p className="text-[13.5px] text-[var(--lab-dim)]">Not available.</p>}
        {subscription?.state === "limited" && (
          <Strip tone="bad">
            The subscription's usage limit is reached; agents are paused
            {formatUntil(subscription.until, now) ? ` until ${formatUntil(subscription.until, now)}` : ""}.
          </Strip>
        )}
        {subscription && windows.length === 0 && (
          <p className="text-[13.5px] text-[var(--lab-dim)]">
            Nothing reported yet. Figures appear after an agent's next instruction.
          </p>
        )}
        {windows.map(([name, w]) => {
          const used = Math.min(1, Math.max(0, w.utilization));
          const tone: LabTone = used >= 0.95 ? "bad" : used >= 0.8 ? "warn" : "accent";
          const resets = formatUntil(w.resetsAt, now);
          return (
            <div key={name} className={toneClass(tone)}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-[13px]">{WINDOW_LABELS[name] ?? name.replace(/_/g, " ")}</span>
                <span className="lab-mono text-[12.5px]">
                  {Math.round(used * 100)}%
                  {resets && <span className="text-[var(--lab-dim)]"> · resets {resets}</span>}
                </span>
              </div>
              <div className="lab-meter" role="progressbar" aria-label={`${name} used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used * 100)}>
                <span style={{ width: `${used * 100}%` }} />
              </div>
            </div>
          );
        })}
        {subscription?.overage.inUse && <Strip tone="bad">Paid usage beyond the subscription was reported. Agents are stopped.</Strip>}
        {subscription?.reportedAt && (
          <p className="lab-mono text-[11.5px] text-[var(--lab-faint)]">as of {formatAgo(subscription.reportedAt, now)}</p>
        )}
      </Tile>

      <Tile
        title="GPU compute"
        note={health?.spend.provider === "runpod" || !health?.spend.provider ? "RunPod" : health.spend.provider}
        className={computeActive ? "md:col-span-2 xl:col-span-3" : undefined}
      >
        <ComputePanel
          labId={snapshot.lab.id}
          agents={snapshot.agents}
          jobs={jobs}
          spend={health?.spend}
          budget={snapshot.budget.compute}
          now={now}
          disabled={disabled}
          onOpenAgent={onOpenAgent}
        />
      </Tile>

      <Tile title="Lab objective" note="for you · not yet shown to agents" className="xl:col-span-2">
        <Goals lab={snapshot.lab} disabled={disabled} pending={goalsPending} failure={goalsFailure} onSave={onSaveGoals} />
      </Tile>

      <Tile title="Work queue" note={stage !== "idle" ? `phase · ${stage}` : undefined}>
        {open === null && <p className="text-[13.5px] text-[var(--lab-dim)]">Loading…</p>}
        {open?.length === 0 && <p className="text-[13.5px] text-[var(--lab-dim)]">Nothing queued or running.</p>}
        {open && open.length > 0 && (
          <ul className="flex flex-col gap-2">
            {open.map((job) => {
              const status = OPEN_LABELS[job.status]!;
              return (
                <li key={job.id}>
                  <button
                    type="button"
                    onClick={() => onOpenAgent(job.agentId)}
                    className="lab-queue-item"
                    aria-label={`Open the ${roleOf(job.agentId)}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="lab-eyebrow !text-[11px]">{roleOf(job.agentId)}</span>
                      <Chip tone={status.tone}>{status.label}</Chip>
                    </span>
                    <span className="mt-1 block text-[13.5px] line-clamp-2 break-words">
                      {job.kind === "task" ? job.title : job.instructions}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Tile>

      {showNetwork && (
        <Tile
          title="Sites reached by commands"
          note={capabilities?.networkTofu?.allowed ? "new sites allowed on first use" : "listed sites only"}
          className="md:col-span-2 xl:col-span-3"
        >
          <NetworkHosts now={now} disabled={disabled} />
        </Tile>
      )}
    </div>
  );
}
