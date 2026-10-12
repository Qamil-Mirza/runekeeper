"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import * as labApi from "@/lib/lab/client";
import { LabApiError } from "@/lib/lab/client";
import type { LabAgentState, LabFileUsage, LabStorage } from "@/lib/lab/types";
import { ROLE_LABELS, STATE_PRESENTATION, formatAgo } from "./agent-card";
import { Chip, LabButton, Strip } from "./lab-ui";

type StorageAgent = LabStorage["labs"][number]["agents"][number];

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "not measured";
  let n = bytes;
  let unit = 0;
  while (n >= 1024 && unit < UNITS.length - 1) {
    n /= 1024;
    unit++;
  }
  return `${unit === 0 || n >= 100 ? Math.round(n) : n.toFixed(1)} ${UNITS[unit]}`;
}

const message = (err: unknown) => (err instanceof LabApiError ? err.message : "Unexpected error");

const roleLabel = (role: string) => (ROLE_LABELS as Record<string, string>)[role] ?? role;

/** The Lab Manager refuses to delete while an agent could be using its files. */
const BUSY: ReadonlySet<LabAgentState> = new Set(["starting", "working", "waitingOnHuman"]);

/** What the owner is being asked to confirm. Nothing is deleted before they do. */
interface Pending {
  agentId: string;
  role: string;
  labName: string;
  /** Null for the agent's temp folders. */
  path: string | null;
  directory: boolean;
  bytes: number | null;
  /** Reloads the listing the entry was in. */
  onDone: () => void;
}

function Directory({
  agentId,
  path,
  depth,
  canDelete,
  reloadKey,
  onAsk,
}: {
  agentId: string;
  path: string;
  depth: number;
  canDelete: boolean;
  /** Changes when something under this agent was deleted elsewhere. */
  reloadKey: number;
  onAsk: (entry: { path: string; directory: boolean; bytes: number; onDone: () => void }) => void;
}) {
  const [usage, setUsage] = useState<LabFileUsage | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, true>>({});
  const [own, setOwn] = useState(0);

  const load = useCallback(() => setOwn((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    labApi.fetchFileUsage(agentId, path).then(
      (u) => {
        if (!live) return;
        setUsage(u);
        setFailure(null);
      },
      (err) => live && setFailure(message(err))
    );
    return () => {
      live = false;
    };
  }, [agentId, path, own, reloadKey]);

  if (failure) {
    return (
      <Strip tone="bad" role="alert">
        Could not read {path || "the working directory"}: {failure}
      </Strip>
    );
  }
  if (!usage) return <p className="lab-eyebrow py-2" style={{ paddingLeft: depth * 18 }}>Measuring…</p>;
  if (usage.entries.length === 0) {
    return <p className="py-1 text-[13px] text-[var(--lab-faint)]" style={{ paddingLeft: depth * 18 + 22 }}>Empty.</p>;
  }

  return (
    <ul className="flex flex-col" role={depth === 0 ? "tree" : "group"} aria-label={depth === 0 ? "Files" : undefined}>
      {usage.entries.map((entry) => {
        const full = path ? `${path}/${entry.name}` : entry.name;
        const directory = entry.type === "directory";
        const expanded = open[entry.name] === true;
        const share = usage.totalBytes > 0 ? Math.max(0, Math.min(1, entry.bytes / usage.totalBytes)) : 0;
        return (
          <li key={entry.name} role="treeitem" aria-expanded={directory ? expanded : undefined} aria-selected={false}>
            <div className="lab-file-row" style={{ paddingLeft: depth * 18 }}>
              {directory ? (
                <button
                  type="button"
                  className="lab-file-toggle"
                  aria-label={`${expanded ? "Close" : "Open"} ${full}`}
                  onClick={() =>
                    setOpen(({ [entry.name]: was, ...rest }) => (was ? rest : { ...rest, [entry.name]: true }))
                  }
                >
                  {expanded ? "▾" : "▸"}
                </button>
              ) : (
                <span className="lab-file-toggle" aria-hidden="true" />
              )}
              <span className={cn("lab-mono min-w-0 flex-1 break-all text-[13px]", directory && "text-[var(--lab-text)]")}>
                {entry.name}
                {directory ? "/" : ""}
                {entry.type === "other" && <span className="text-[var(--lab-faint)]"> · link or special file</span>}
              </span>
              <span className="lab-file-bar" aria-hidden="true">
                <span style={{ width: `${share * 100}%` }} />
              </span>
              <span className="lab-mono w-[5.5rem] shrink-0 text-right text-[12.5px] text-[var(--lab-dim)]">
                {formatBytes(entry.bytes)}
              </span>
              <LabButton
                variant="danger"
                className="!min-h-[26px] !px-2 !text-[11.5px]"
                disabled={!canDelete}
                aria-label={`Delete ${full}`}
                onClick={() => onAsk({ path: full, directory, bytes: entry.bytes, onDone: load })}
              >
                Delete
              </LabButton>
            </div>
            {directory && expanded && (
              <Directory
                agentId={agentId}
                path={full}
                depth={depth + 1}
                canDelete={canDelete}
                reloadKey={reloadKey}
                onAsk={onAsk}
              />
            )}
          </li>
        );
      })}
      {usage.truncated && (
        <li className="py-1 text-[12.5px] text-[var(--lab-warn)]" style={{ paddingLeft: depth * 18 + 22 }}>
          Only the 500 largest entries are listed.
        </li>
      )}
    </ul>
  );
}

function AgentStorage({
  agent,
  labName,
  disabled,
  reloadKey,
  onAsk,
}: {
  agent: StorageAgent;
  labName: string;
  disabled: boolean;
  reloadKey: number;
  onAsk: (pending: Pending) => void;
}) {
  const [browsing, setBrowsing] = useState(false);
  const state = STATE_PRESENTATION[agent.state];
  const role = roleLabel(agent.role);
  const busy = BUSY.has(agent.state);
  const canDelete = !disabled && !busy;

  return (
    <li className="border-t border-[var(--lab-line)] py-3 flex flex-col gap-2 min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[14.5px] font-medium">{role}</span>
        <Chip tone={state.tone}>{state.label}</Chip>
        <span className="lab-mono text-[12.5px] text-[var(--lab-dim)]">
          working directory {formatBytes(agent.workspaceBytes)} · temp {formatBytes(agent.tempBytes)}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          <LabButton
            className="!min-h-[28px] !px-2"
            aria-expanded={browsing}
            onClick={() => setBrowsing((b) => !b)}
            disabled={disabled || agent.workspaceBytes === null}
          >
            {browsing ? "Hide files" : "Browse files"}
          </LabButton>
          <LabButton
            variant="danger"
            className="!min-h-[28px] !px-2"
            disabled={!canDelete || !agent.tempBytes}
            onClick={() =>
              onAsk({
                agentId: agent.agentId,
                role,
                labName,
                path: null,
                directory: true,
                bytes: agent.tempBytes,
                onDone: () => {},
              })
            }
          >
            Empty temp
          </LabButton>
        </span>
      </div>
      {busy && (
        <p className="text-[12.5px] text-[var(--lab-warn)]">
          The {role} is {state.label.toLowerCase()}, so nothing of its files can be deleted now. Stop it or wait until
          it is idle.
        </p>
      )}
      {browsing && (
        <div className="lab-file-tree">
          <Directory
            agentId={agent.agentId}
            path=""
            depth={0}
            canDelete={canDelete}
            reloadKey={reloadKey}
            onAsk={(entry) => onAsk({ agentId: agent.agentId, role, labName, ...entry })}
          />
        </div>
      )}
    </li>
  );
}

/** Where the disk space went, by lab and agent, with a way to delete what is no longer needed. */
export function StoragePage({ now, disabled }: { now: number; disabled: boolean }) {
  const [storage, setStorage] = useState<LabStorage | null>(null);
  const [failure, setFailure] = useState<{ message: string; missing: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailure, setDeleteFailure] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const live = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await labApi.fetchStorage();
      if (!live.current) return;
      setStorage(next);
      setFailure(null);
    } catch (err) {
      if (!live.current) return;
      setFailure({ message: message(err), missing: err instanceof LabApiError && err.status === 404 });
    } finally {
      if (live.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
    };
  }, [load]);

  const confirm = async () => {
    if (!pending || deleting) return;
    setDeleting(true);
    setDeleteFailure(null);
    try {
      const freed =
        pending.path === null
          ? (await labApi.clearAgentTemp(pending.agentId)).freedBytes
          : (await labApi.deleteAgentFile(pending.agentId, pending.path)).freedBytes;
      setReceipt(
        `${pending.path === null ? `Emptied the ${pending.role}'s temp folders` : `Deleted ${pending.path}`} in ${pending.labName}: ${formatBytes(freed)} freed.`
      );
      pending.onDone();
      setReloadKey((n) => n + 1);
      setPending(null);
      void load();
    } catch (err) {
      setDeleteFailure(message(err));
    } finally {
      setDeleting(false);
    }
  };

  const labs = storage ? [...storage.labs].sort((a, b) => b.totalBytes - a.totalBytes) : [];
  const free = storage ? Object.entries(storage.freeBytes) : [];

  return (
    <section className="flex flex-col gap-4 w-full max-w-[1000px]" aria-label="Storage">
      <header className="lab-panel p-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[25px] font-semibold leading-tight tracking-tight">Storage</h3>
          <p className="lab-eyebrow mt-2">
            the agents' working directories · every lab
            {storage && ` · measured ${formatAgo(storage.measuredAt, now)}`}
          </p>
        </div>
        <LabButton onClick={() => void load()} disabled={loading || disabled}>
          {loading ? "Measuring…" : "Measure again"}
        </LabButton>
      </header>

      {failure && (
        <Strip tone={failure.missing ? "warn" : "bad"} role="alert">
          {failure.missing
            ? "This Lab Manager does not report storage yet; it needs to be updated first."
            : `Could not measure storage: ${failure.message}`}
        </Strip>
      )}
      {receipt && (
        <Strip tone="ok" role="status">
          {receipt} Sizes here are refreshed about every 20 seconds.
        </Strip>
      )}
      {!storage && !failure && <p className="lab-eyebrow py-10 text-center">Measuring… this can take some seconds.</p>}

      {storage && (
        <div className="lab-panel p-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="lab-eyebrow !text-[10.5px]">Free space</p>
            {free.length === 0 && <p className="text-[13.5px] text-[var(--lab-dim)]">Not reported.</p>}
            {free.map(([area, bytes]) => (
              <p key={area} className="text-[13.5px]">
                <span className="lab-mono text-[15px] text-[var(--lab-text)]">{formatBytes(bytes)}</span>{" "}
                <span className="text-[var(--lab-dim)]">{area}</span>
              </p>
            ))}
          </div>
          <div>
            <p className="lab-eyebrow !text-[10.5px]">Lab Manager database</p>
            <p className="lab-mono text-[15px]">{formatBytes(storage.manager.databaseBytes)}</p>
          </div>
          <div>
            <p className="lab-eyebrow !text-[10.5px]">Database copies from deployments</p>
            {storage.manager.backups ? (
              <>
                <p className="lab-mono text-[15px]">
                  {formatBytes(storage.manager.backups.bytes)} · {storage.manager.backups.count}
                </p>
                <p className="text-[12.5px] text-[var(--lab-dim)]">Removed on the host, not from here.</p>
              </>
            ) : (
              <p className="text-[13.5px] text-[var(--lab-dim)]">Could not be read.</p>
            )}
          </div>
        </div>
      )}

      {storage && labs.length === 0 && <p className="lab-eyebrow py-6 text-center">No labs.</p>}
      {labs.map((lab) => (
        <article key={lab.labId} className="lab-panel p-4 flex flex-col min-w-0" aria-label={`Storage of ${lab.name}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3">
            <h4 className="min-w-0 flex flex-wrap items-center gap-2 text-[17px] font-semibold">
              <span className="break-words">{lab.name}</span>
              {lab.archived && <Chip tone="off">Archived</Chip>}
            </h4>
            <span className="lab-mono text-[15px]">{formatBytes(lab.totalBytes)}</span>
          </div>
          <ul className="flex flex-col">
            {lab.agents.map((agent) => (
              <AgentStorage
                key={agent.agentId}
                agent={agent}
                labName={lab.name}
                disabled={disabled}
                reloadKey={reloadKey}
                onAsk={(next) => {
                  setDeleteFailure(null);
                  setPending(next);
                }}
              />
            ))}
          </ul>
        </article>
      ))}

      {pending && (
        <div
          className="lab-modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && !deleting && setPending(null)}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            // Close only this dialog, not the Lab behind it.
            e.preventDefault();
            if (!deleting) setPending(null);
          }}
        >
          <div
            className="lab-modal lab-danger-zone p-5 flex flex-col gap-3"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="lab-file-delete-title"
            aria-describedby="lab-file-delete-text"
          >
            <h4 id="lab-file-delete-title" className="text-[19px] font-semibold leading-tight">
              {pending.path === null
                ? "Empty these temp folders?"
                : `Delete this ${pending.directory ? "directory and everything in it" : "file"}?`}
            </h4>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13.5px]">
              <dt className="text-[var(--lab-dim)]">{pending.path === null ? "What" : "Path"}</dt>
              <dd className="lab-mono break-all">
                {pending.path === null ? "temp folders of its commands" : `${pending.path}${pending.directory ? "/" : ""}`}
              </dd>
              <dt className="text-[var(--lab-dim)]">Size</dt>
              <dd className="lab-mono">{formatBytes(pending.bytes)}</dd>
              <dt className="text-[var(--lab-dim)]">Agent</dt>
              <dd>
                {pending.role} · {pending.labName}
              </dd>
            </dl>
            <p id="lab-file-delete-text" className="text-[13.5px]">
              It is gone for good: there is no trash and no undo. The {pending.role} is not told; if it relied on
              this, say so in a message.
            </p>
            {deleteFailure && (
              <Strip tone="bad" role="alert">
                Not deleted: {deleteFailure}
              </Strip>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <LabButton autoFocus onClick={() => setPending(null)} disabled={deleting}>
                Cancel
              </LabButton>
              <LabButton variant="danger" onClick={() => void confirm()} disabled={disabled || deleting}>
                {deleting ? "Deleting…" : pending.path === null ? "Yes, empty them" : "Yes, delete it"}
              </LabButton>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
