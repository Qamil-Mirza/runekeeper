"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AgentCard, formatAgo } from "./agent-card";
import { labFontClasses } from "./fonts";
import { LAB_STATUS_TONE, LabRail } from "./lab-rail";
import { LabTopBar } from "./lab-top-bar";
import { Chip, LabButton, Strip, toneClass } from "./lab-ui";
import { useLab } from "./use-lab";
import "./lab.css";

const ENTER_MS = 800;
const LEAVE_MS = 400;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The Lab takes over the whole window, with its own look. `onExit` returns to
 * Runekeeper; it is called after the leaving transition has played.
 */
export function LabView({ onExit }: { onExit: () => void }) {
  const lab = useLab();
  const [now, setNow] = useState(() => Date.now());
  const [confirmStop, setConfirmStop] = useState(false);
  const [warp, setWarp] = useState<"in" | "out" | null>("in");
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const done = setTimeout(() => setWarp((w) => (w === "in" ? null : w)), ENTER_MS);
    return () => {
      clearTimeout(done);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, []);

  const leave = useCallback(() => {
    if (exitTimer.current) return;
    if (prefersReducedMotion()) return onExit();
    setWarp("out");
    exitTimer.current = setTimeout(onExit, LEAVE_MS);
  }, [onExit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select");
      if (e.key === "Escape" && !e.defaultPrevented && !typing) leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave]);

  const { snapshot, status } = lab;
  // Shown data is stale when the manager is gone or the last refresh failed.
  const stale = !lab.connected || lab.snapshotFailure !== null;
  const controlsDisabled = stale;
  const labPending = lab.pending.lab;
  const labStatus = snapshot?.lab.status;

  useEffect(() => setConfirmStop(false), [labStatus, lab.selectedLabId]);

  const budget = snapshot?.budget;
  const spent = budget?.consumed.costUsd ?? 0;
  const limit = budget?.limits.costUsd ?? 0;
  const spentShare = limit > 0 ? Math.min(1, spent / limit) : 0;
  const budgetTone = spentShare >= 1 ? "bad" : spentShare >= 0.8 ? "warn" : "accent";

  return (
    <div
      className={cn("lab-root", labFontClasses)}
      data-leaving={warp === "out"}
      role="region"
      aria-label="The Lab"
    >
      {warp && <div className="lab-warp" data-direction={warp} aria-hidden="true" />}

      <div className="lab-stage">
        <LabTopBar
          status={status}
          failure={lab.statusFailure}
          now={now}
          onRetry={lab.retry}
          onExit={leave}
        />

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <LabRail
            labs={lab.labs}
            selectedLabId={lab.selectedLabId}
            connected={lab.connected}
            labsFailure={lab.labsFailure}
            createPending={lab.pending.create !== undefined}
            createFailure={lab.actionFailures.create}
            onSelect={lab.selectLab}
            onCreate={lab.createLab}
          />

          <main className="lab-scroll flex-1 min-w-0 min-h-0 overflow-y-auto px-3 sm:px-5 py-5">
            {lab.selectedLabId && !snapshot && lab.snapshotFailure && (
              <Strip tone="bad" role="alert">
                Could not load this lab: {lab.snapshotFailure.message}
              </Strip>
            )}

            {!snapshot && !lab.snapshotFailure && (
              <p className="lab-eyebrow py-10 text-center">
                {lab.connected
                  ? lab.selectedLabId
                    ? "Loading lab…"
                    : "Select or create a lab"
                  : "Waiting for the Lab Manager"}
              </p>
            )}

            {snapshot && (
              <section className="flex flex-col gap-4 max-w-[1400px]" aria-label={`Lab ${snapshot.lab.name}`}>
                <header className="lab-panel p-4 flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-[25px] font-semibold leading-tight tracking-tight truncate">
                          {snapshot.lab.name}
                        </h3>
                        <Chip tone={LAB_STATUS_TONE[snapshot.lab.status]}>{snapshot.lab.status}</Chip>
                      </div>
                      <p className="lab-eyebrow mt-2">
                        stage {snapshot.lab.cycleStage}
                        {lab.snapshotAt &&
                          ` · updated ${formatAgo(new Date(lab.snapshotAt).toISOString(), now)}`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <LabButton
                        variant="primary"
                        onClick={() => void lab.labAction("start")}
                        disabled={controlsDisabled || labPending !== undefined || labStatus === "starting"}
                      >
                        {labPending === "start"
                          ? "Starting…"
                          : labStatus === "stopped"
                            ? "Start lab"
                            : "Start missing agents"}
                      </LabButton>
                      <LabButton
                        variant={confirmStop ? "danger" : "default"}
                        onClick={() => {
                          if (!confirmStop) return setConfirmStop(true);
                          setConfirmStop(false);
                          void lab.labAction("stop");
                        }}
                        disabled={controlsDisabled || labPending !== undefined || labStatus === "stopped"}
                      >
                        {labPending === "stop" ? "Stopping…" : confirmStop ? "Confirm stop" : "Stop lab"}
                      </LabButton>
                      {confirmStop && (
                        <LabButton variant="quiet" onClick={() => setConfirmStop(false)}>
                          Cancel
                        </LabButton>
                      )}
                    </div>
                  </div>

                  <div className={toneClass(budgetTone)}>
                    <div className="flex items-baseline justify-between gap-3 mb-1.5">
                      <span className="lab-eyebrow">Budget</span>
                      <span className="lab-mono text-[13.5px]">
                        ${spent.toFixed(2)}
                        <span className="text-[var(--lab-dim)]"> / ${limit.toFixed(2)}</span>
                      </span>
                    </div>
                    <div
                      className="lab-meter"
                      role="progressbar"
                      aria-label="Budget used"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(spentShare * 100)}
                    >
                      <span style={{ width: `${spentShare * 100}%` }} />
                    </div>
                  </div>
                </header>

                {confirmStop && (
                  <Strip tone="warn">Stopping the lab cancels every running job and stops all agents.</Strip>
                )}

                {lab.actionFailures.lab && (
                  <Strip tone="bad" role="alert">
                    {lab.actionFailures.lab.message}
                  </Strip>
                )}

                {stale && (
                  <Strip tone="warn">
                    Showing the last known state
                    {lab.snapshotAt && ` from ${formatAgo(new Date(lab.snapshotAt).toISOString(), now)}`}.
                    Controls are disabled until the Lab Manager answers again
                    {lab.snapshotFailure && lab.connected ? ` (${lab.snapshotFailure.message})` : ""}.
                  </Strip>
                )}

                {snapshot.jobsNeedingReconciliation.length > 0 && (
                  <Strip tone="warn">
                    {snapshot.jobsNeedingReconciliation.length} interrupted job
                    {snapshot.jobsNeedingReconciliation.length === 1 ? "" : "s"} need your review
                    before those agents take new tasks.
                  </Strip>
                )}

                <div className="flex items-center justify-between">
                  <p className="lab-eyebrow">Agents · {snapshot.agents.length}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
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
          </main>
        </div>
      </div>
    </div>
  );
}
