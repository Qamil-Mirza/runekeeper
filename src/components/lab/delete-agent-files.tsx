"use client";

import { useEffect, useState } from "react";
import * as labApi from "@/lib/lab/client";
import { LabApiError } from "@/lib/lab/client";
import type { LabAgent } from "@/lib/lab/types";
import { agentName } from "./agent-card";
import { LabButton, Strip } from "./lab-ui";
import { formatBytes } from "./storage-page";

/**
 * Confirms the permanent deletion of everything a retired agent left on
 * disk. The size is measured when the dialog opens, so the owner sees what
 * goes; the server checks the name and that the agent is retired.
 */
export function DeleteAgentFiles({
  agent,
  labName,
  disabled,
  onClose,
  onDeleted,
}: {
  agent: LabAgent;
  labName: string;
  disabled: boolean;
  onClose: () => void;
  onDeleted: (freedBytes: number) => void;
}) {
  const name = agentName(agent);
  // undefined while measuring; null when it could not be measured.
  const [bytes, setBytes] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    labApi.fetchStorage().then(
      (storage) => {
        if (!live) return;
        const found = storage.labs.flatMap((l) => l.agents).find((a) => a.agentId === agent.id);
        setBytes(found ? (found.workspaceBytes ?? 0) + (found.tempBytes ?? 0) : null);
      },
      () => live && setBytes(null)
    );
    return () => {
      live = false;
    };
  }, [agent.id]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const { freedBytes } = await labApi.deleteRetiredAgentFiles(agent.id, name);
      onDeleted(freedBytes);
    } catch (err) {
      setFailure(err instanceof LabApiError ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="lab-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        // Close only this dialog, not the Lab behind it.
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div
        className="lab-modal lab-danger-zone p-5 flex flex-col gap-3"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="lab-agent-files-title"
        aria-describedby="lab-agent-files-text"
      >
        <h4 id="lab-agent-files-title" className="text-[19px] font-semibold leading-tight break-words">
          Delete everything {name} left on disk?
        </h4>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13.5px]">
          <dt className="text-[var(--lab-dim)]">Agent</dt>
          <dd className="break-words">
            {name} · {labName}
          </dd>
          <dt className="text-[var(--lab-dim)]">Size</dt>
          <dd className="lab-mono">
            {bytes === undefined
              ? "measuring…"
              : bytes === null
                ? "could not be measured"
                : bytes === 0
                  ? "No files on disk"
                  : formatBytes(bytes)}
          </dd>
        </dl>
        <p id="lab-agent-files-text" className="text-[13.5px]">
          Its working directory, temp folders and saved conversations are deleted for good: there is no trash and no
          undo. Its tasks, the conversation shown here and its research records stay. If you restore it later it
          starts afresh.
        </p>
        {failure && (
          <Strip tone="bad" role="alert">
            Not deleted: {failure}
          </Strip>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <LabButton autoFocus onClick={onClose} disabled={busy}>
            Cancel
          </LabButton>
          <LabButton variant="danger" onClick={() => void confirm()} disabled={disabled || busy || bytes === undefined}>
            {busy ? "Deleting…" : "Yes, delete its files"}
          </LabButton>
        </div>
      </div>
    </div>
  );
}
