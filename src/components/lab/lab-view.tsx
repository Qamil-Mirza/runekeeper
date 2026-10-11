"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LabConnectionStatus, LabStatus } from "@/lib/lab/types";
import { AgentCard, formatAgo } from "./agent-card";
import { useLab, type LabFailure } from "./use-lab";

const DEGRADED_REASONS: Record<string, string> = {
  claude_code_unavailable: "Claude Code is not available on the host",
  claude_code_logged_out: "Claude Code is logged out",
  tmux_unavailable: "tmux is not available",
  agent_isolation_missing: "Agent isolation is not configured",
  storage_error: "The Lab Manager cannot write its storage",
};

const CAPABILITY_LABELS = {
  executorShell: "Executor shell",
  unattendedExecution: "Unattended execution",
  tmuxMode: "tmux mode",
} as const;

const LAB_STATUS_TEXT: Record<LabStatus, string> = {
  stopped: "text-on-surface-variant",
  starting: "text-tertiary",
  running: "text-[#6bcb6b]",
  paused: "text-tertiary",
  degraded: "text-[#ea4335]",
};

function ConnectionPanel({
  status,
  failure,
  now,
  onRetry,
}: {
  status: LabConnectionStatus | null;
  failure: LabFailure | null;
  now: number;
  onRetry: () => void;
}) {
  let tone = "text-on-surface-variant";
  let dot = "bg-outline";
  let headline = "Checking the Lab Manager…";
  let detail: string | null = null;

  if (status?.reachable && !status.apiCompatible) {
    tone = "text-[#ea4335]";
    dot = "bg-[#ea4335]";
    headline = "Lab Manager version not supported";
    detail = `It reports API ${status.health?.apiVersion}; this Runekeeper build supports 1.x. Controls are disabled.`;
  } else if (status?.reachable && status.health?.degraded) {
    tone = "text-tertiary";
    dot = "bg-tertiary";
    headline = "Lab Manager connected, degraded";
    detail = status.health.reasons.map((r) => DEGRADED_REASONS[r] ?? r).join(" · ");
  } else if (status?.reachable) {
    tone = "text-[#6bcb6b]";
    dot = "bg-[#6bcb6b]";
    headline = "Lab Manager connected";
  } else if (status) {
    tone = "text-[#ea4335]";
    dot = "bg-[#ea4335]";
    headline = "Lab Manager unreachable";
    detail = `${status.error?.message ?? "No response"}. Anything shown below is the last known state and is read-only.`;
  }

  const health = status?.health;

  return (
    <section className="bg-surface-dim/70 ghost-border px-4 py-3" aria-label="Lab Manager connection">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={cn("flex items-center gap-2 font-label text-label-lg", tone)} role="status">
          <span className={cn("w-2 h-2 rounded-full shrink-0", dot)} aria-hidden="true" />
          {headline}
        </div>
        <div className="flex items-center gap-3 font-label text-label-sm uppercase tracking-wide text-on-surface-variant">
          {health && (
            <span>
              API {health.apiVersion} · build {health.serviceVersion.slice(0, 12)}
            </span>
          )}
          {status && <span>checked {formatAgo(status.checkedAt, now)}</span>}
          <button onClick={onRetry} className="text-primary hover:text-on-surface transition-colors">
            Retry
          </button>
        </div>
      </div>

      {detail && <p className="mt-2 font-label text-label-md text-on-surface">{detail}</p>}

      {failure && (
        <p className="mt-2 font-label text-label-md text-[#ea4335]" role="alert">
          Could not refresh the connection status: {failure.message}
        </p>
      )}

      {health && status?.apiCompatible && (
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-label text-label-md">
          {(Object.keys(CAPABILITY_LABELS) as (keyof typeof CAPABILITY_LABELS)[]).map((key) => {
            const capability = health.capabilities[key];
            return (
              <li key={key} className="text-on-surface-variant">
                {CAPABILITY_LABELS[key]}:{" "}
                <span className={capability.allowed ? "text-[#6bcb6b]" : "text-on-surface"}>
                  {capability.allowed
                    ? "allowed"
                    : `off${capability.reason ? ` (${DEGRADED_REASONS[capability.reason] ?? capability.reason.replace(/_/g, " ")})` : ""}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CreateLabForm({
  disabled,
  pending,
  failure,
  onCreate,
}: {
  disabled: boolean;
  pending: boolean;
  failure?: LabFailure;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const trimmed = name.trim();

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!trimmed) return;
        void onCreate(trimmed).then(() => setName(""));
      }}
    >
      <div className="flex-1 min-w-48">
        <Input
          id="lab-name"
          label="New lab"
          placeholder="Name of the research project"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={disabled || pending}
          className="bg-[rgba(0,0,0,0.3)]"
        />
      </div>
      <Button type="submit" disabled={disabled || pending || !trimmed}>
        {pending ? "Creating…" : "Create lab"}
      </Button>
      {failure && (
        <p className="w-full font-label text-label-md text-[#ea4335]" role="alert">
          {failure.message}
        </p>
      )}
    </form>
  );
}

export function LabView() {
  const lab = useLab();
  const [now, setNow] = useState(() => Date.now());
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const { snapshot, status } = lab;
  // Shown data is stale when the manager is gone or the last refresh failed.
  const stale = !lab.connected || lab.snapshotFailure !== null;
  const controlsDisabled = stale;
  const labPending = lab.pending.lab;
  const labStatus = snapshot?.lab.status;

  useEffect(() => setConfirmStop(false), [labStatus, lab.selectedLabId]);

  return (
    <div className="overflow-y-auto archivist-scroll h-full px-5 pb-10 flex flex-col gap-5">
      <ConnectionPanel
        status={status}
        failure={lab.statusFailure}
        now={now}
        onRetry={lab.retry}
      />

      <section className="flex flex-col gap-3" aria-label="Labs">
        {lab.labsFailure && lab.connected && (
          <p className="font-label text-label-md text-[#ea4335]" role="alert">
            Could not load labs: {lab.labsFailure.message}
          </p>
        )}

        {lab.labs && lab.labs.length > 0 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Select a lab">
            {lab.labs.map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={item.id === lab.selectedLabId}
                onClick={() => lab.selectLab(item.id)}
                className={cn(
                  "px-3 py-2 text-left transition-colors",
                  item.id === lab.selectedLabId
                    ? "bg-[rgba(212,168,96,0.15)] text-[#d4a860]"
                    : "text-[rgba(212,168,96,0.5)] hover:bg-[rgba(212,168,96,0.08)]"
                )}
              >
                <span className="block font-label text-label-lg">{item.name}</span>
                <span className="block font-label text-label-sm uppercase tracking-wide">
                  {item.status}
                  {item.pendingApprovalCount > 0 &&
                    ` · ${item.pendingApprovalCount} approval${item.pendingApprovalCount === 1 ? "" : "s"}`}
                </span>
              </button>
            ))}
          </div>
        )}

        {lab.labs && lab.labs.length === 0 && lab.connected && (
          <p className="font-body text-body-md text-on-surface-variant italic">
            No labs yet. Create one to provision its four agents.
          </p>
        )}

        <CreateLabForm
          disabled={!lab.connected}
          pending={lab.pending.create !== undefined}
          failure={lab.actionFailures.create}
          onCreate={lab.createLab}
        />
      </section>

      {lab.selectedLabId && !snapshot && lab.snapshotFailure && (
        <p className="font-label text-label-md text-[#ea4335]" role="alert">
          Could not load this lab: {lab.snapshotFailure.message}
        </p>
      )}

      {snapshot && (
        <section className="flex flex-col gap-4" aria-label={`Lab ${snapshot.lab.name}`}>
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display text-headline-lg text-on-surface truncate">
                {snapshot.lab.name}
              </h3>
              <p className="font-label text-label-md text-on-surface-variant">
                <span className={cn("uppercase tracking-wide", LAB_STATUS_TEXT[snapshot.lab.status])}>
                  {snapshot.lab.status}
                </span>
                {" · "}stage {snapshot.lab.cycleStage}
                {" · "}budget ${snapshot.budget.consumed.costUsd.toFixed(2)} of $
                {snapshot.budget.limits.costUsd.toFixed(2)}
                {lab.snapshotAt && ` · updated ${formatAgo(new Date(lab.snapshotAt).toISOString(), now)}`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => void lab.labAction("start")}
                disabled={controlsDisabled || labPending !== undefined || labStatus === "starting"}
              >
                {labPending === "start"
                  ? "Starting…"
                  : labStatus === "stopped"
                    ? "Start lab"
                    : "Start missing agents"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (!confirmStop) return setConfirmStop(true);
                  setConfirmStop(false);
                  void lab.labAction("stop");
                }}
                disabled={controlsDisabled || labPending !== undefined || labStatus === "stopped"}
                className={confirmStop ? "text-[#ea4335]" : undefined}
              >
                {labPending === "stop" ? "Stopping…" : confirmStop ? "Confirm stop" : "Stop lab"}
              </Button>
              {confirmStop && (
                <Button variant="ghost" onClick={() => setConfirmStop(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </header>

          {confirmStop && (
            <p className="font-label text-label-md text-tertiary">
              Stopping the lab cancels every running job and stops all agents.
            </p>
          )}

          {lab.actionFailures.lab && (
            <p className="font-label text-label-md text-[#ea4335]" role="alert">
              {lab.actionFailures.lab.message}
            </p>
          )}

          {stale && (
            <p
              className="px-3 py-2 bg-[rgba(200,120,40,0.12)] border border-[rgba(200,120,40,0.3)] font-label text-label-md text-tertiary"
              role="status"
            >
              Showing the last known state
              {lab.snapshotAt && ` from ${formatAgo(new Date(lab.snapshotAt).toISOString(), now)}`}.
              Controls are disabled until the Lab Manager answers again
              {lab.snapshotFailure && lab.connected ? ` (${lab.snapshotFailure.message})` : ""}.
            </p>
          )}

          {snapshot.jobsNeedingReconciliation.length > 0 && (
            <p className="font-label text-label-md text-tertiary">
              {snapshot.jobsNeedingReconciliation.length} interrupted job
              {snapshot.jobsNeedingReconciliation.length === 1 ? "" : "s"} need your review
              before those agents take new tasks.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {snapshot.agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                now={now}
                disabled={controlsDisabled}
                pendingAction={lab.pending[agent.id]}
                failure={lab.actionFailures[agent.id]}
                systemNote={lab.systemNotes[agent.id]}
                onAction={(action) => void lab.agentAction(agent.id, action)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
