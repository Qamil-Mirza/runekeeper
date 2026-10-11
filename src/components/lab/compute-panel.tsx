"use client";

import { useCallback, useEffect, useState } from "react";
import * as labApi from "@/lib/lab/client";
import { LabApiError } from "@/lib/lab/client";
import type { LabAgent, LabComputeBudget, LabComputeRun, LabHealth, LabJob } from "@/lib/lab/types";
import { ROLE_LABELS, formatAgo } from "./agent-card";
import { cn } from "@/lib/utils";
import { Chip, LabButton, Strip, type LabTone } from "./lab-ui";

const ACTIVE_POLL_MS = 4_000;
const QUIET_POLL_MS = 15_000;

const STATUS: Record<LabComputeRun["status"], { label: string; tone: LabTone }> = {
  requested: { label: "Requested", tone: "off" },
  refused: { label: "Refused", tone: "bad" },
  starting: { label: "Starting up", tone: "warn" },
  running: { label: "Up", tone: "accent" },
  removing: { label: "Removing the GPU", tone: "warn" },
  finished: { label: "Finished", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
  timedOut: { label: "Timed out", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "off" },
};

/** States in which something is, or may still be, rented. */
const LIVE: ReadonlySet<LabComputeRun["status"]> = new Set(["requested", "starting", "running", "removing"]);
const CANCELLABLE: ReadonlySet<LabComputeRun["status"]> = new Set(["requested", "starting", "running"]);

const REASONS: Record<string, string> = {
  no_limit_set: "no compute limit is set for this lab",
  limit_expired: "this lab's compute limit has expired",
  over_limit: "it would go over this lab's compute limit",
  over_balance: "it would go over the provider account's balance",
  gpu_unavailable: "that GPU was not available",
  compute_unavailable: "rented compute is not available right now",
  lab_archived: "the lab is archived",
  manager_restarted: "the Lab Manager restarted",
  start: "the machine could not be started",
  price_changed: "the provider's price was higher than the one quoted",
};

const UNAVAILABLE: Record<string, string> = {
  no_broker_configured: "Rented compute is not connected to the Lab, so agents cannot rent GPUs and nothing here can be charged.",
  broker_unavailable: "The compute broker is not answering, so no run can start.",
  balance_unknown: "The provider account's balance is unknown, so no run can start.",
};

const PROVIDERS: Record<string, string> = { runpod: "RunPod" };

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function reasonText(reason: string): string {
  const code = Object.keys(REASONS).find((c) => reason === c || reason.startsWith(`${c}:`) || reason.startsWith(`${c} `));
  if (!code) return reason;
  const rest = reason.slice(code.length).replace(/^[:\s]+/, "");
  return rest ? `${REASONS[code]} (${rest})` : REASONS[code];
}

function minutesBetween(from: string, to: number): number {
  return Math.max(0, Math.round((to - new Date(from).getTime()) / 60_000));
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <p className="lab-eyebrow !text-[10.5px]">{label}</p>
      <p className="lab-mono text-[18px] leading-tight mt-1">{value}</p>
      {note && <p className="text-[11.5px] text-[var(--lab-faint)] mt-0.5">{note}</p>}
    </div>
  );
}

/**
 * Rented GPU compute for one lab. Money is labelled by who counted it: the
 * Lab Manager's own count (price × time, by its clock) is what the limit is
 * held against; the provider's figures are shown beside it and never as the
 * same thing. A rented machine is a server the agent calls for one turn; it is
 * removed when that turn ends. Titles and requests are written by agents.
 */
export function ComputePanel({
  labId,
  agents,
  jobs,
  spend,
  budget,
  now,
  disabled,
  onOpenAgent,
}: {
  labId: string;
  agents: LabAgent[];
  jobs: LabJob[] | null;
  spend: LabHealth["spend"] | undefined;
  /** From the lab snapshot; replaced by the fresher one that comes with the runs. */
  budget: LabComputeBudget | undefined;
  now: number;
  disabled: boolean;
  onOpenAgent: (agentId: string) => void;
}) {
  const [runs, setRuns] = useState<LabComputeRun[] | null>(null);
  const [liveBudget, setLiveBudget] = useState<LabComputeBudget | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const supported = budget !== undefined;

  useEffect(() => {
    setRuns(null);
    setLiveBudget(null);
    setFailure(null);
    setConfirm(null);
    setExpanded(null);
  }, [labId]);

  const refresh = useCallback(async () => {
    try {
      const page = await labApi.fetchComputeRuns(labId);
      setRuns(page.items);
      setLiveBudget(page.budget);
      setFailure(null);
    } catch (err) {
      setFailure(err instanceof LabApiError ? err.message : "Unexpected error");
    }
  }, [labId]);

  const anyLive = runs?.some((r) => LIVE.has(r.status)) ?? false;
  useEffect(() => {
    if (!supported) return;
    void refresh();
    const timer = setInterval(
      () => document.visibilityState === "visible" && void refresh(),
      anyLive ? ACTIVE_POLL_MS : QUIET_POLL_MS
    );
    return () => clearInterval(timer);
  }, [supported, anyLive, refresh]);

  const cancel = async (runId: string) => {
    setPending(runId);
    setConfirm(null);
    try {
      await labApi.cancelComputeRun(runId);
      setFailure(null);
    } catch (err) {
      setFailure(err instanceof LabApiError ? err.message : "Unexpected error");
    } finally {
      setPending(null);
      void refresh();
    }
  };

  const provider = spend?.provider ? (PROVIDERS[spend.provider] ?? spend.provider) : "the provider";

  if (!supported || spend?.metering !== "active") {
    const why = spend?.reason ? UNAVAILABLE[spend.reason] : undefined;
    const b = liveBudget ?? budget;
    return (
      <>
        <p className="text-[13.5px]">No GPU rented.</p>
        <p className="text-[12.5px] text-[var(--lab-dim)]">
          {why ?? UNAVAILABLE.no_broker_configured} When it is connected, each rented GPU shows here with its hourly
          price, what it is running and for which task.
        </p>
        {b && b.chargedUsd > 0 && (
          <p className="text-[12.5px] text-[var(--lab-dim)]">
            Earlier runs in this lab cost {usd(b.chargedUsd)} by the Lab Manager's count.
          </p>
        )}
      </>
    );
  }

  const b = liveBudget ?? budget;
  const roleOf = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent ? ROLE_LABELS[agent.role] : "Agent";
  };
  const taskOf = (jobId: string | null) => {
    const job = jobId ? jobs?.find((j) => j.id === jobId) : undefined;
    if (!job) return null;
    return job.kind === "task" ? job.title : job.instructions;
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
        <Figure
          label="Lab limit"
          value={b.limitUsd === null ? "None" : usd(b.limitUsd)}
          note={
            b.limitUsd === null
              ? "not set on the host"
              : b.expired
                ? "expired"
                : b.validUntil
                  ? `set on the host · until ${new Date(b.validUntil).toLocaleDateString()}`
                  : "set on the host"
          }
        />
        <Figure label="Left to spend" value={usd(b.remainingUsd)} note="limit less spent and held" />
        <Figure
          label="Spent"
          value={usd(b.chargedUsd)}
          note={b.providerBilledUsd !== null ? `${provider} billed ${usd(b.providerBilledUsd)}` : "Lab Manager's count"}
        />
        <Figure
          label="Held by running work"
          value={usd(b.reservedUsd)}
          note={b.reservedUsd > 0 ? `${usd(b.accruingUsd)} used so far` : undefined}
        />
      </div>

      <p className="text-[12px] text-[var(--lab-faint)]">
        Spent and held are the Lab Manager's own count (hourly price × time by its clock), not {provider}'s bill.
        {spend.balanceUsd !== null &&
          ` ${provider} reports ${usd(spend.balanceUsd)} of prepaid credit left on the account${
            spend.balanceAt ? `, as of ${formatAgo(spend.balanceAt, now)}` : ""
          }.`}
      </p>

      {b.limitUsd === null && (
        <Strip tone="warn">No compute limit is set for this lab on the host, so no run can start.</Strip>
      )}
      {b.limitUsd !== null && b.expired && (
        <Strip tone="warn">This lab's compute limit has expired, so no run can start.</Strip>
      )}

      {runs === null && !failure && <p className="text-[13.5px] text-[var(--lab-dim)]">Loading runs…</p>}
      {runs?.length === 0 && <p className="text-[13.5px]">No GPU rented, and no runs yet in this lab.</p>}

      {runs && runs.length > 0 && (
        <ul className="lab-carousel lab-scroll" aria-label="Rented machines, newest first">
          {runs.map((run) => {
            const status = STATUS[run.status];
            const open = expanded === run.id;
            const live = LIVE.has(run.status);
            const using = taskOf(run.usedByJobId);
            const gpu = `${run.request.gpuCount > 1 ? `${run.request.gpuCount} × ` : ""}${run.request.gpuType}`;
            return (
              <li key={run.id} className={cn("lab-run-card", `lab-tone-${status.tone}`)}>
                <div className="flex items-center justify-between gap-2">
                  <Chip tone={status.tone}>{status.label}</Chip>
                  <span className="lab-mono text-[11.5px] text-[var(--lab-faint)]">
                    {run.endedAt ? `ended ${formatAgo(run.endedAt, now)}` : formatAgo(run.requestedAt, now)}
                  </span>
                </div>

                <p className="text-[14px] font-medium break-words line-clamp-2" title={run.title}>
                  {run.title}
                </p>

                <div>
                  <p className="lab-mono text-[15px] leading-tight break-words">{gpu}</p>
                  <p className="lab-mono text-[12.5px] text-[var(--lab-dim)]">
                    {run.usdPerHour !== null ? `${usd(run.usdPerHour)}/hour` : "price not read"}
                    {run.status !== "refused" && ` · ${live ? `${usd(run.costUsd)} so far` : `cost ${usd(run.costUsd)}`}`}
                  </p>
                </div>

                <p className="text-[12.5px] text-[var(--lab-dim)] break-words">
                  Rented by the{" "}
                  <button type="button" className="underline underline-offset-2" onClick={() => onOpenAgent(run.agentId)}>
                    {roleOf(run.agentId)}
                  </button>
                  {run.status === "running" && run.upAt && <> · up {minutesBetween(run.upAt, now)} min</>}
                  {run.status === "starting" && run.startedAt && (
                    <> · starting, charged for {minutesBetween(run.startedAt, now)} min</>
                  )}
                  {live && <> of at most {run.request.maxMinutes}</>}
                </p>

                {run.reason && (
                  <p className="text-[12.5px] text-[var(--lab-bad)] break-words line-clamp-3" title={reasonText(run.reason)}>
                    {reasonText(run.reason)}
                  </p>
                )}

                {open && (
                  <div className="flex flex-col gap-1.5 border-t border-[var(--lab-line)] pt-2">
                    <p className="text-[11.5px] text-[var(--lab-faint)]">What was rented, written by the agent.</p>
                    <pre className="lab-pre">
                      {run.request.args.length > 0 ? run.request.args.join(" ") : "(the image's own start command)"}
                    </pre>
                    <p className="lab-mono text-[12px] text-[var(--lab-dim)] break-all">
                      image {run.request.image} · port {run.request.port} · disk {run.request.diskGb} GB ·{" "}
                      {run.request.cloud} cloud
                    </p>
                    {run.providerBilledUsd !== null && (
                      <p className="text-[12px] text-[var(--lab-dim)]">
                        {provider} billed {usd(run.providerBilledUsd)} for it.
                      </p>
                    )}
                    {run.status === "running" && (
                      <p className="text-[12px] text-[var(--lab-dim)] break-words">
                        The agent has one turn to use it{using && <> (“{using.length > 90 ? `${using.slice(0, 90)}…` : using}”)</>}
                        ; the GPU is removed when that turn ends.
                      </p>
                    )}
                    {live && run.deadline && (
                      <p className="text-[12px] text-[var(--lab-dim)]">
                        Removed by{" "}
                        {new Date(run.deadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} whatever
                        happens.
                      </p>
                    )}
                    {run.url && (
                      <p className="text-[12px] text-[var(--lab-dim)] break-all">
                        Address while it is up: <span className="lab-mono select-all">{run.url}</span>. Anyone with the
                        address can reach it; the password for the server behind it is given only to the agent.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 mt-auto pt-1">
                  <LabButton
                    variant="quiet"
                    className="!min-h-[28px] !px-2"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : run.id)}
                  >
                    {open ? "Less" : "Details"}
                  </LabButton>
                  {CANCELLABLE.has(run.status) && (
                    <>
                      <LabButton
                        variant={confirm === run.id ? "danger" : "default"}
                        className="!min-h-[28px] !px-2"
                        disabled={disabled || pending !== null}
                        onClick={() => (confirm === run.id ? void cancel(run.id) : setConfirm(run.id))}
                      >
                        {pending === run.id ? "Cancelling…" : confirm === run.id ? "Confirm cancel" : "Cancel run"}
                      </LabButton>
                      {confirm === run.id && (
                        <LabButton variant="quiet" className="!min-h-[28px] !px-2" onClick={() => setConfirm(null)}>
                          Keep
                        </LabButton>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {failure && (
        <Strip tone="bad" role="alert">
          {failure}
        </Strip>
      )}
    </>
  );
}
