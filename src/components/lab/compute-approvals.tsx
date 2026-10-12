"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import * as labApi from "@/lib/lab/client";
import { LabApiError } from "@/lib/lab/client";
import type { LabComputeApproval } from "@/lib/lab/types";
import { ROLE_LABELS, formatAgo } from "./agent-card";
import { Chip, LabButton, Strip } from "./lab-ui";

const usd = (n: number) => `$${n.toFixed(2)}`;
/** An hourly price exactly as quoted: $0.608 is not rounded to $0.61 on a request to spend. */
const price = (n: number) => `$${n.toFixed(4).replace(/0{1,2}$/, "")}`;

function gpuOf(run: LabComputeApproval): string {
  return `${run.request.gpuCount > 1 ? `${run.request.gpuCount} × ` : ""}${run.request.gpuType}`;
}

/** Every figure and field of the request, as the Lab Manager recorded it. */
function Request({ run, provider }: { run: LabComputeApproval; provider: string }) {
  const worst = run.approval?.worstCaseUsd;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13.5px]">
      <dt className="text-[var(--lab-dim)]">Most it could cost</dt>
      <dd className="lab-mono text-[15px] text-[var(--lab-warn)]">
        {worst !== undefined ? `up to ${usd(worst)}` : "not stated"} <span className="text-[12.5px]">of {provider} credits</span>
      </dd>
      <dt className="text-[var(--lab-dim)]">Price</dt>
      <dd className="lab-mono">
        {run.usdPerHour !== null ? `${price(run.usdPerHour)}/hour` : "price not read"} · at most {run.request.maxMinutes} min
      </dd>
      <dt className="text-[var(--lab-dim)]">GPU</dt>
      <dd className="lab-mono break-words">
        {gpuOf(run)} · {run.request.cloud} cloud · disk {run.request.diskGb} GB
      </dd>
      <dt className="text-[var(--lab-dim)]">Asked by</dt>
      <dd className="break-words">
        {run.requestedBy.agentName}
        {run.requestedBy.agentName !== ROLE_LABELS[run.requestedBy.role] && ` (${ROLE_LABELS[run.requestedBy.role]})`} ·{" "}
        {run.requestedBy.labName}
      </dd>
      <dt className="text-[var(--lab-dim)]">Image</dt>
      <dd className="lab-mono break-all text-[12.5px]">
        {run.request.image} · port {run.request.port}
      </dd>
      <dt className="text-[var(--lab-dim)]">Runs</dt>
      <dd>
        <pre className="lab-pre max-h-40">
          {run.request.args.length > 0 ? run.request.args.join(" ") : "(the image's own start command)"}
        </pre>
      </dd>
    </dl>
  );
}

/**
 * Rentals of compute that wait for the owner. Approving one lets the Lab
 * Manager rent a machine on the owner's provider account, so the whole
 * request is shown first and the decision is confirmed in a dialog; the
 * server checks the figures shown against its own record.
 */
export function ComputeApprovals({
  items,
  now,
  disabled,
  provider,
  onDecided,
  onOpen,
}: {
  items: LabComputeApproval[];
  now: number;
  disabled: boolean;
  /** The provider's name, for saying whose credits are spent. */
  provider: string;
  onDecided: () => void;
  onOpen: (labId: string, agentId: string) => void;
}) {
  const [asking, setAsking] = useState<{ run: LabComputeApproval; decision: "approve" | "deny" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; reauth: boolean } | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  const decide = async () => {
    if (!asking || busy || !asking.run.approval || asking.run.usdPerHour === null) return;
    setBusy(true);
    setFailure(null);
    try {
      const run = await labApi.decideComputeRun({
        runId: asking.run.id,
        decision: asking.decision,
        worstCaseUsd: asking.run.approval.worstCaseUsd,
        usdPerHour: asking.run.usdPerHour,
      });
      setOutcome(
        asking.decision === "deny"
          ? `Denied "${asking.run.title}". Nothing was rented; the agent is told at its next turn.`
          : run.status === "awaitingApproval"
            ? `"${asking.run.title}" is waiting again: its price changed, so it needs a new approval.`
            : run.status === "refused"
              ? `"${asking.run.title}" was approved but then refused by the Lab Manager: it no longer fits the limit or the balance.`
              : `Approved "${asking.run.title}". The Lab Manager checks the limit and the price once more before renting; follow it under the lab's GPU compute.`
      );
      setAsking(null);
      onDecided();
    } catch (err) {
      const reauth = err instanceof LabApiError && err.code === "reauthentication_required";
      setFailure({ message: err instanceof LabApiError ? err.message : "Unexpected error", reauth });
      if (err instanceof LabApiError && (err.code === "stale_view" || err.code === "conflict")) onDecided();
    } finally {
      setBusy(false);
    }
  };

  if (items.length === 0 && !outcome) return null;

  return (
    <section className="flex flex-col gap-3" aria-label="GPU rentals waiting for your approval">
      {outcome && (
        <Strip tone="ok" role="status">
          {outcome}
        </Strip>
      )}
      {items.length > 0 && (
        <p className="lab-eyebrow">
          GPU rentals waiting for your approval · {items.length} · nothing is rented until you approve
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {items.map((run) => (
          <li key={run.id} className="lab-card lab-tone-warn p-4 flex flex-col gap-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Chip tone="warn">GPU rental</Chip>
              <span className="lab-mono text-[11.5px] text-[var(--lab-faint)]">asked {formatAgo(run.requestedAt, now)}</span>
            </div>
            <p className="text-[15px] font-medium break-words">{run.title}</p>
            <Request run={run} provider={provider} />
            <div className="flex flex-wrap gap-2">
              <LabButton
                variant="primary"
                disabled={disabled || !run.approval || run.usdPerHour === null}
                onClick={() => {
                  setFailure(null);
                  setAsking({ run, decision: "approve" });
                }}
              >
                Approve…
              </LabButton>
              <LabButton
                variant="danger"
                disabled={disabled || !run.approval || run.usdPerHour === null}
                onClick={() => {
                  setFailure(null);
                  setAsking({ run, decision: "deny" });
                }}
              >
                Deny…
              </LabButton>
              <LabButton onClick={() => onOpen(run.labId, run.agentId)}>Open {run.requestedBy.agentName}</LabButton>
            </div>
          </li>
        ))}
      </ul>

      {asking && (
        <div
          className="lab-modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && !busy && setAsking(null)}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            // Close only this dialog, not the Lab behind it.
            e.preventDefault();
            if (!busy) setAsking(null);
          }}
        >
          <div
            className="lab-modal lab-danger-zone p-5 flex flex-col gap-3"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="lab-compute-decide-title"
            aria-describedby="lab-compute-decide-text"
          >
            <h4 id="lab-compute-decide-title" className="text-[19px] font-semibold leading-tight break-words">
              {asking.decision === "approve" ? "Approve this GPU rental?" : "Deny this GPU rental?"}
            </h4>
            <p className="text-[14px] font-medium break-words">{asking.run.title}</p>
            <Request run={asking.run} provider={provider} />
            <p id="lab-compute-decide-text" className="text-[13.5px]">
              {asking.decision === "approve"
                ? `Approving lets the Lab Manager rent this machine on your ${provider} account. It is real spending, up to the figure above; the machine is removed when the agent's turn ends or the time runs out.`
                : "Nothing is rented. The agent is told at its next turn that you denied it."}
            </p>
            {failure && (
              <Strip tone="bad" role="alert">
                Not {asking.decision === "approve" ? "approved" : "denied"}: {failure.message}
              </Strip>
            )}
            {failure?.reauth && (
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-[var(--lab-dim)]">Approving spending needs a recent sign-in.</span>
                <LabButton onClick={() => void signIn("google", { callbackUrl: "/planner" })}>Sign in again</LabButton>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <LabButton autoFocus onClick={() => setAsking(null)} disabled={busy}>
                Cancel
              </LabButton>
              <LabButton
                variant={asking.decision === "approve" ? "primary" : "danger"}
                onClick={() => void decide()}
                disabled={disabled || busy}
              >
                {busy
                  ? "Sending…"
                  : asking.decision === "approve"
                    ? `Yes, approve up to ${usd(asking.run.approval?.worstCaseUsd ?? 0)}`
                    : "Yes, deny it"}
              </LabButton>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
