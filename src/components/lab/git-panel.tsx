"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import * as labApi from "@/lib/lab/client";
import { LabApiError } from "@/lib/lab/client";
import type { LabAgent, LabGitOp } from "@/lib/lab/types";
import { agentName, formatAgo, leadName } from "./agent-card";
import { Strip, type LabTone } from "./lab-ui";

const POLL_MS = 10_000;
/** How many entries the timeline shows before scrolling. */
const SHOWN = 3;

const STATUS: Record<LabGitOp["status"], { label: string; tone: LabTone }> = {
  requested: { label: "In progress", tone: "accent" },
  done: { label: "Done", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
};

function describe(op: LabGitOp, lead: string): string {
  // Nothing reaches GitHub for a hand-in: the lead agent squashes it into the lab's branch.
  if (op.kind === "handIn") {
    return op.status === "done" ? `Handed in to ${lead}` : op.status === "failed" ? `Hand-in to ${lead}` : `Handing in to ${lead}`;
  }
  const number = op.number !== null ? ` #${op.number}` : "";
  if (op.kind === "push") {
    return op.status === "done" ? "Pushed a branch" : op.status === "failed" ? "Branch push" : "Pushing a branch";
  }
  if (op.status === "failed") return `Pull request${number}`;
  if (op.status === "requested") return `Opening or editing a pull request${number}`;
  return `${op.created === false ? "Edited" : "Opened"} pull request${number}`;
}

/** Only a GitHub page is ever made a link. */
function githubUrl(url: string | null): string | null {
  return url && /^https:\/\/github\.com\//.test(url) ? url : null;
}

/**
 * The lab's repository and what its agents did there: branches pushed and
 * pull requests opened or edited, under the owner's identity. There is no
 * merge here on purpose; the owner merges on GitHub.
 */
export function GitPanel({
  labId,
  repo,
  workBranch,
  agents,
  now,
  onOpenAgent,
}: {
  labId: string;
  repo: string;
  /** The one branch the lab publishes, kept by its lead agent; absent where agents publish their own. */
  workBranch?: string | null;
  agents: LabAgent[];
  now: number;
  onOpenAgent: (agentId: string) => void;
}) {
  const [ops, setOps] = useState<LabGitOp[] | null>(null);
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    setOps(null);
    setFailure(null);
  }, [labId]);

  const refresh = useCallback(async () => {
    try {
      const page = await labApi.fetchGitOps(labId);
      setOps(page.items);
      setDefaultBranch(page.defaultBranch ?? null);
      setFailure(null);
    } catch (err) {
      setFailure(err instanceof LabApiError ? err.message : "Unexpected error");
    }
  }, [labId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => document.visibilityState === "visible" && void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // The list is exactly as tall as its newest three entries.
  const list = useRef<HTMLOListElement>(null);
  const sizeKey = ops?.slice(0, SHOWN + 1).map((o) => `${o.id}:${o.status}`).join("|");
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const fit = () => {
      const next = el.children[SHOWN] as HTMLElement | undefined;
      // The list is positioned, so a child's offsetTop is measured from it.
      el.style.maxHeight = next ? `${next.offsetTop}px` : "";
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sizeKey]);

  const roleOf = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent ? agentName(agent) : "Agent";
  };

  return (
    <>
      <p className="text-[13.5px] break-all">
        <a
          className="lab-mono underline underline-offset-2"
          href={`https://github.com/${encodeURI(repo)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {repo}
        </a>
        {defaultBranch && <span className="text-[var(--lab-dim)]"> · default branch {defaultBranch}</span>}
      </p>
      {workBranch && (
        <p className="text-[13.5px] break-all">
          <span className="text-[var(--lab-dim)]">Lab branch </span>
          <span className="lab-mono">{workBranch}</span>
        </p>
      )}
      <p className="text-[12.5px] text-[var(--lab-dim)]">
        {workBranch
          ? `The other agents hand their branches in to ${leadName(agents)}, which squashes them into the lab branch and alone publishes it and its one pull request, under your identity. Only you merge, on GitHub.`
          : "Agents push branches and open pull requests under your identity. Only you merge, on GitHub."}
      </p>

      {ops === null && !failure && <p className="text-[13.5px] text-[var(--lab-dim)]">Loading…</p>}
      {ops?.length === 0 && <p className="text-[13.5px]">Nothing pushed yet.</p>}

      {ops && ops.length > 0 && (
        <>
          {/* Sized to show the newest three; older ones are reached by scrolling. */}
          <ol ref={list} className="lab-timeline lab-scroll" aria-label="What agents did in the repository, newest first">
            {ops.map((op) => {
              const status = STATUS[op.status];
              const link = githubUrl(op.url);
              return (
                <li key={op.id} className={cn("lab-timeline-item", `lab-tone-${status.tone}`)}>
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="lab-mono text-[11.5px] text-[var(--lab-faint)]">
                      {formatAgo(op.endedAt ?? op.requestedAt, now)}
                    </span>
                    <span className="lab-eyebrow !text-[10.5px] lab-tone-text">{status.label}</span>
                  </p>
                  <p className="text-[13.5px] font-medium break-words">
                    {describe(op, leadName(agents))}
                    {op.title && <span className="font-normal">: {op.title}</span>}
                  </p>
                  <p className="lab-mono text-[12px] text-[var(--lab-dim)] break-all">
                    {op.branch}
                    {op.commit && ` · ${op.commit.slice(0, 10)}`}
                  </p>
                  <p className="text-[12.5px] text-[var(--lab-dim)]">
                    <button type="button" className="underline underline-offset-2" onClick={() => onOpenAgent(op.agentId)}>
                      {roleOf(op.agentId)}
                    </button>
                    {link && (
                      <>
                        {" · "}
                        <a className="underline underline-offset-2" href={link} target="_blank" rel="noopener noreferrer">
                          Open on GitHub
                        </a>
                      </>
                    )}
                  </p>
                  {op.error && <p className="text-[12.5px] text-[var(--lab-bad)] break-words">{op.error}</p>}
                </li>
              );
            })}
          </ol>
          {ops.length > SHOWN && (
            <p className="lab-eyebrow !text-[10.5px] !text-[var(--lab-faint)]">
              Newest {SHOWN} of {ops.length} · scroll for earlier
            </p>
          )}
        </>
      )}

      {failure && (
        <Strip tone="bad" role="alert">
          {failure}
        </Strip>
      )}
    </>
  );
}
