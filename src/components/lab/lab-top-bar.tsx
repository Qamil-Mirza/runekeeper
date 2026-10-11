"use client";

import type { LabConnectionStatus } from "@/lib/lab/types";
import { formatAgo } from "./agent-card";
import { LabButton, StatusLight, Strip, toneClass, type LabTone } from "./lab-ui";
import type { LabFailure } from "./use-lab";
import { cn } from "@/lib/utils";

const DEGRADED_REASONS: Record<string, string> = {
  claude_code_unavailable: "Claude Code is not available on the host",
  claude_code_logged_out: "Claude Code is logged out",
  tmux_unavailable: "tmux is not available",
  agent_isolation_missing: "Agent isolation is not configured",
  storage_error: "The Lab Manager cannot write its storage",
};

function describe(status: LabConnectionStatus | null): {
  tone: LabTone;
  headline: string;
  detail: string | null;
} {
  if (status?.reachable && !status.apiCompatible) {
    return {
      tone: "bad",
      headline: "Version not supported",
      detail: `The Lab Manager reports API ${status.health?.apiVersion}; this Runekeeper build supports 1.x. Controls are disabled.`,
    };
  }
  if (status?.reachable && status.health?.degraded) {
    return {
      tone: "warn",
      headline: "Online, degraded",
      detail: status.health.reasons.map((r) => DEGRADED_REASONS[r] ?? r).join(" · "),
    };
  }
  if (status?.reachable) return { tone: "ok", headline: "Online", detail: null };
  if (status) {
    return {
      tone: "bad",
      headline: "Unreachable",
      detail: `${status.error?.message ?? "No response"}. Anything shown below is the last known state and is read-only.`,
    };
  }
  return { tone: "off", headline: "Checking…", detail: null };
}

export function LabTopBar({
  status,
  failure,
  now,
  onRetry,
  onExit,
}: {
  status: LabConnectionStatus | null;
  failure: LabFailure | null;
  now: number;
  onRetry: () => void;
  onExit: () => void;
}) {
  const { tone, headline, detail } = describe(status);
  const health = status?.health;

  return (
    <header className="shrink-0 border-b border-[var(--lab-line)] bg-[color-mix(in_srgb,var(--lab-panel)_85%,transparent)]">
      <div className="flex items-center gap-3 px-3 sm:px-5 h-12">
        <LabButton variant="quiet" onClick={onExit} aria-label="Back to Runekeeper" className="!px-2">
          <span aria-hidden="true">←</span>
          <span className="hidden sm:inline">Runekeeper</span>
        </LabButton>

        <h2 className="lab-eyebrow !text-[13.5px] !tracking-[0.3em] !text-[var(--lab-text)]">The Lab</h2>

        <section
          className={cn("ml-auto flex items-center gap-3 min-w-0", toneClass(tone))}
          aria-label="Lab Manager connection"
        >
          <span className="hidden md:inline lab-mono text-[12px] text-[var(--lab-dim)] truncate">
            {health && `api ${health.apiVersion} · build ${health.serviceVersion.slice(0, 12)}`}
            {status && `${health ? " · " : ""}checked ${formatAgo(status.checkedAt, now)}`}
          </span>
          <span className="flex items-center gap-2 lab-tone-text lab-eyebrow !text-[12.5px]" role="status">
            <StatusLight tone={tone} pulse={tone === "off"} />
            <span>
              <span className="hidden sm:inline">Lab Manager </span>
              {headline}
            </span>
          </span>
          <LabButton onClick={onRetry} className="!min-h-[30px] !px-2">
            Retry
          </LabButton>
        </section>
      </div>

      {(detail || failure) && (
        <div className="px-3 sm:px-5 pb-3 flex flex-col gap-2">
          {detail && <Strip tone={tone}>{detail}</Strip>}
          {failure && (
            <Strip tone="bad" role="alert">
              Could not refresh the connection status: {failure.message}
            </Strip>
          )}
        </div>
      )}

    </header>
  );
}
