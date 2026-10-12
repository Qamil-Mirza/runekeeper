"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AgentCard, formatAgo } from "./agent-card";
import { AgentConsole } from "./agent-console";
import { DeleteLab } from "./delete-lab";
import { labFontClasses } from "./fonts";
import { LabOverview } from "./lab-overview";
import { NeedsYou, needsYouCount } from "./needs-you";
import { SitesPage } from "./sites-page";
import { LAB_STATUS_TONE, LabRail } from "./lab-rail";
import { LabTopBar } from "./lab-top-bar";
import { Chip, LabButton, Strip } from "./lab-ui";
import { RuntimeMeter } from "./runtime-meter";
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
  const [openAgentId, setOpenAgentId] = useState<string | null>(null);
  // Instructions put in an agent's composer for the owner to read and send.
  const [prefill, setPrefill] = useState<string | undefined>(undefined);
  const openAgentWith = useCallback((agentId: string, draft?: string) => {
    setPrefill(draft);
    setOpenAgentId(agentId);
  }, []);
  // null until the owner picks: the central chat when the host allows delegation.
  const [viewChoice, setViewChoice] = useState<"chat" | "agents" | null>(null);
  // A page about every lab, shown instead of the selected lab.
  const [page, setPage] = useState<"lab" | "needsYou" | "sites">("lab");
  // An agent to open once its lab has loaded, when coming from another page.
  const [wanted, setWanted] = useState<{ labId: string; agentId: string } | null>(null);
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
      if (e.key !== "Escape" || e.defaultPrevented || typing) return;
      // Escape steps back one level: out of an agent first, then out of the Lab.
      if (openAgentId) setOpenAgentId(null);
      else if (page !== "lab") setPage("lab");
      else leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave, openAgentId, page]);

  const { snapshot, status } = lab;
  // Shown data is stale when the manager is gone or the last refresh failed.
  const stale = !lab.connected || lab.snapshotFailure !== null;
  const controlsDisabled = stale;
  const labPending = lab.pending.lab;
  const labStatus = snapshot?.lab.status;

  useEffect(() => setConfirmStop(false), [labStatus, lab.selectedLabId]);
  useEffect(() => {
    setOpenAgentId(null);
    setViewChoice(null);
  }, [lab.selectedLabId]);

  // The runtime limit is shown only when Runekeeper is set to leave it to the owner.
  const runtime = status?.features?.runtimeLimit ? snapshot?.budget.runtime : undefined;
  const runtimeLeft = runtime ? runtime.limitWallClockMinutes - runtime.usedWallClockMinutes : null;
  useEffect(() => {
    if (!wanted || snapshot?.lab.id !== wanted.labId) return;
    setOpenAgentId(wanted.agentId);
    setWanted(null);
  }, [wanted, snapshot?.lab.id]);

  const capabilities = status?.health?.capabilities;
  // Offered when the host has the shell switched on, even while it is withheld.
  const showSites =
    capabilities?.networkTofu !== undefined &&
    Object.values(capabilities.shell ?? {}).some((s) => s.allowed || s.reason !== "no_autonomy_policy");

  const openAgent = snapshot?.agents.find((a) => a.id === openAgentId) ?? null;
  const orchestrator = snapshot?.agents.find((a) => a.role === "orchestrator") ?? null;
  const centralChat = status?.health?.capabilities.delegation?.allowed === true && orchestrator !== null;
  const view = centralChat ? (viewChoice ?? "chat") : "agents";

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
            onSelect={(labId) => {
              setPage("lab");
              if (labId !== lab.selectedLabId) lab.selectLab(labId);
            }}
            onCreate={(name, brief, repo) => {
              setPage("lab");
              return lab.createLab(name, brief, repo);
            }}
            codeHost={status?.health?.codeHost}
            page={page}
            onPage={setPage}
            needsYou={needsYouCount(lab.labs)}
            showSites={showSites}
          />

          <main className="lab-scroll flex-1 min-w-0 min-h-0 overflow-y-auto px-3 sm:px-5 py-5 flex flex-col">
            {page === "needsYou" && (
              <NeedsYou
                labs={lab.labs}
                current={snapshot}
                now={now}
                onOpen={(labId, agentId) => {
                  setPage("lab");
                  if (labId !== lab.selectedLabId) lab.selectLab(labId);
                  if (agentId) setWanted({ labId, agentId });
                }}
              />
            )}
            {page === "sites" && (
              <SitesPage now={now} disabled={controlsDisabled} firstUse={capabilities?.networkTofu?.allowed === true} />
            )}

            {page === "lab" && lab.selectedLabId && !snapshot && lab.snapshotFailure && (
              <Strip tone="bad" role="alert">
                Could not load this lab: {lab.snapshotFailure.message}
              </Strip>
            )}

            {page === "lab" && !snapshot && !lab.snapshotFailure && (
              <p className="lab-eyebrow py-10 text-center">
                {lab.connected
                  ? lab.selectedLabId
                    ? "Loading lab…"
                    : "Select or create a lab"
                  : "Waiting for the Lab Manager"}
              </p>
            )}

            {page === "lab" && snapshot && (
              <section
                className={cn("flex flex-col gap-4 w-full max-w-[1400px]", (openAgent || view === "chat") && "flex-1 min-h-[34rem]")}
                aria-label={`Lab ${snapshot.lab.name}`}
              >
                <header className="lab-panel p-4 flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-[25px] font-semibold leading-tight tracking-tight truncate">
                          {snapshot.lab.name}
                        </h3>
                        <Chip tone={LAB_STATUS_TONE[snapshot.lab.status]}>{snapshot.lab.status}</Chip>
                        <DeleteLab
                          labId={snapshot.lab.id}
                          name={snapshot.lab.name}
                          stopped={snapshot.lab.status === "stopped"}
                          disabled={controlsDisabled}
                          pending={lab.pending.delete !== undefined}
                          failure={lab.actionFailures.delete}
                          onDelete={lab.deleteLab}
                        />
                      </div>
                      <p className="lab-eyebrow mt-2">
                        {snapshot.lab.repo && `${snapshot.lab.repo} · `}
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

                  {runtime && (
                    <RuntimeMeter
                      runtime={runtime}
                      capMinutes={status?.health?.policy?.runtimeCapMinutes ?? null}
                      disabled={controlsDisabled}
                      pending={lab.pending.runtime !== undefined}
                      failure={lab.actionFailures.runtime}
                      onSet={lab.setRuntimeLimit}
                    />
                  )}
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

                {centralChat && !openAgent && (
                  <div className="flex border-b border-[var(--lab-line)]" role="tablist" aria-label="Lab views">
                    {(["chat", "agents"] as const).map((name) => (
                      <button
                        key={name}
                        role="tab"
                        aria-selected={view === name}
                        onClick={() => setViewChoice(name)}
                        className="lab-tab"
                      >
                        {name === "chat" ? "Central chat" : "Agents and overview"}
                      </button>
                    ))}
                  </div>
                )}

                {!openAgent && view === "chat" && orchestrator ? (
                  <AgentConsole
                    central
                    labId={snapshot.lab.id}
                    agent={orchestrator}
                    agents={snapshot.agents}
                    now={now}
                    disabled={controlsDisabled}
                    runtimeLeftMinutes={runtimeLeft}
                    pendingAction={lab.pending[orchestrator.id]}
                    actionFailure={lab.actionFailures[orchestrator.id]}
                    onAction={(action) => void lab.agentAction(orchestrator.id, action)}
                    onClose={() => setViewChoice("agents")}
                    onOpenAgent={openAgentWith}
                  />
                ) : openAgent ? (
                  <AgentConsole
                    labId={snapshot.lab.id}
                    agent={openAgent}
                    agents={snapshot.agents}
                    onOpenAgent={openAgentWith}
                    initialDraft={prefill}
                    now={now}
                    disabled={controlsDisabled}
                    runtimeLeftMinutes={runtimeLeft}
                    pendingAction={lab.pending[openAgent.id]}
                    actionFailure={lab.actionFailures[openAgent.id]}
                    onAction={(action) => void lab.agentAction(openAgent.id, action)}
                    onClose={() => setOpenAgentId(null)}
                  />
                ) : (
                  <>
                    <LabOverview
                      snapshot={snapshot}
                      health={status?.health ?? null}
                      jobs={lab.labJobs}
                      now={now}
                      disabled={controlsDisabled}
                      goalsPending={lab.pending.goals !== undefined}
                      goalsFailure={lab.actionFailures.goals}
                      onSaveGoals={lab.saveGoals}
                      onSaveBrief={lab.saveBrief}
                      onOpenAgent={openAgentWith}
                    />
                    <p className="lab-eyebrow">Agents · {snapshot.agents.length}</p>
                    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                      {snapshot.agents.map((agent) => (
                        <AgentCard
                          key={agent.id}
                          agent={agent}
                          job={lab.labJobs?.find((j) => j.agentId === agent.id && (j.status === "running" || j.status === "awaitingApproval" || j.status === "cancelling"))}
                          lastItem={lab.activity[agent.id]}
                          now={now}
                          disabled={controlsDisabled}
                          pendingAction={lab.pending[agent.id]}
                          failure={lab.actionFailures[agent.id]}
                          systemNote={lab.systemNotes[agent.id]}
                          onAction={(action) => void lab.agentAction(agent.id, action)}
                          onOpen={() => openAgentWith(agent.id)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
