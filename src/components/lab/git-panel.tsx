"use client";

import { useCallback, useEffect, useState } from "react";
import * as labApi from "@/lib/lab/client";
import { LabApiError } from "@/lib/lab/client";
import type { LabAgent, LabGitOp } from "@/lib/lab/types";
import { ROLE_LABELS, formatAgo } from "./agent-card";
import { Chip, Strip, type LabTone } from "./lab-ui";

const POLL_MS = 10_000;

const STATUS: Record<LabGitOp["status"], { label: string; tone: LabTone }> = {
  requested: { label: "In progress", tone: "accent" },
  done: { label: "Done", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
};

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
  agents,
  now,
  onOpenAgent,
}: {
  labId: string;
  repo: string;
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

  const roleOf = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent ? ROLE_LABELS[agent.role] : "Agent";
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
      <p className="text-[12.5px] text-[var(--lab-dim)]">
        Agents push branches and open pull requests under your identity. Only you merge, on GitHub.
      </p>

      {ops === null && !failure && <p className="text-[13.5px] text-[var(--lab-dim)]">Loading…</p>}
      {ops?.length === 0 && <p className="text-[13.5px]">Nothing pushed yet.</p>}

      {ops && ops.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--lab-line)]">
          {ops.map((op) => {
            const status = STATUS[op.status];
            const link = githubUrl(op.url);
            return (
              <li key={op.id} className="py-2 flex flex-col gap-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 text-[13.5px] font-medium break-words">
                    {op.kind === "push"
                      ? op.status === "failed" ? "Branch push" : "Pushed a branch"
                      : `${op.created === false ? "Edited" : "Opened"} pull request${op.number !== null ? ` #${op.number}` : ""}`}
                    {op.title && <span className="font-normal">: {op.title}</span>}
                  </p>
                  <Chip tone={status.tone}>{status.label}</Chip>
                </div>
                <p className="lab-mono text-[12px] text-[var(--lab-dim)] break-all">
                  {op.branch}
                  {op.commit && ` · ${op.commit.slice(0, 10)}`}
                </p>
                <p className="text-[12.5px] text-[var(--lab-dim)]">
                  <button type="button" className="underline underline-offset-2" onClick={() => onOpenAgent(op.agentId)}>
                    {roleOf(op.agentId)}
                  </button>
                  {" · "}
                  {formatAgo(op.endedAt ?? op.requestedAt, now)}
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
