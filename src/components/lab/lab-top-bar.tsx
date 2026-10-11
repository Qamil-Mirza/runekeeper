"use client";

import type { LabConnectionStatus } from "@/lib/lab/types";
import { formatAgo } from "./agent-card";
import { Chip, LabButton, StatusLight, Strip, toneClass, type LabTone } from "./lab-ui";
import type { LabFailure } from "./use-lab";
import { cn } from "@/lib/utils";

const DEGRADED_REASONS: Record<string, string> = {
  claude_code_unavailable: "Claude Code is not available on the host",
  claude_code_logged_out: "Claude Code is logged out",
  tmux_unavailable: "tmux is not available",
  agent_isolation_missing: "Agent isolation is not configured",
  storage_error: "The Lab Manager cannot write its storage",
};

type Capabilities = NonNullable<LabConnectionStatus["health"]>["capabilities"];

/** How much the agents may do without asking, as set on the host. */
function permissionChips(capabilities: Capabilities): { key: string; text: string; tone: LabTone; title?: string }[] {
  const chips: { key: string; text: string; tone: LabTone; title?: string }[] = [];
  const rule = (key: "workspaceWrites" | "webSearch", label: string) => {
    const capability = capabilities[key];
    // Absent on a Lab Manager older than these rules.
    if (!capability) return;
    chips.push({
      key,
      text: `${label} · ${capability.allowed ? "no approval needed" : "asks first"}`,
      tone: capability.allowed ? "ok" : "off",
      title: capability.reason ? DEGRADED_REASONS[capability.reason] ?? capability.reason.replace(/_/g, " ") : undefined,
    });
  };
  rule("workspaceWrites", "File writes");
  rule("webSearch", "Web search");
  const uncovered = capabilities.uncoveredRequests;
  if (uncovered) {
    chips.push({
      key: "uncovered",
      text: `Anything else · ${uncovered === "deny" ? "refused" : uncovered === "ask" ? "asks first" : "host policy"}`,
      tone: uncovered === "ask" ? "warn" : "off",
    });
  }
  return chips;
}

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
  const chips = health && status?.apiCompatible ? permissionChips(health.capabilities) : [];

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

      {chips.length > 0 && (
        <ul className="px-3 sm:px-5 pb-2.5 flex flex-wrap gap-2" aria-label="What agents may do without asking">
          {chips.map((chip) => (
            <li key={chip.key} title={chip.title} className="max-w-full">
              <Chip tone={chip.tone}>{chip.text}</Chip>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
