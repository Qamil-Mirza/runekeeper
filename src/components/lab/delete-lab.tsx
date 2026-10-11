"use client";

import { useEffect, useState } from "react";
import { LabButton, Strip } from "./lab-ui";
import type { LabFailure } from "./use-lab";

/**
 * Permanent deletion of one lab. It cannot be undone, so the owner types the
 * lab's name; the server checks the same name again before deleting.
 */
export function DeleteLab({
  labId,
  name,
  stopped,
  disabled,
  pending,
  failure,
  onDelete,
}: {
  labId: string;
  name: string;
  /** The Lab Manager refuses to delete a lab whose agents are up. */
  stopped: boolean;
  disabled: boolean;
  pending: boolean;
  failure?: LabFailure;
  onDelete: (confirmName: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    setOpen(false);
    setTyped("");
  }, [labId]);

  if (!open) {
    return (
      <div>
        <LabButton variant="quiet" onClick={() => setOpen(true)} disabled={disabled} className="!min-h-[28px] !px-2">
          Delete lab…
        </LabButton>
      </div>
    );
  }

  const matches = typed === name;
  return (
    <form
      className="lab-panel p-4 flex flex-col gap-3 lab-tone-bad"
      aria-label={`Delete lab ${name}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!matches || !stopped || pending) return;
        void onDelete(typed);
      }}
    >
      <h4 className="lab-eyebrow !text-[var(--lab-bad)]">Delete this lab</h4>
      <p className="text-[13.5px]">
        Permanently deletes this lab's agents, tasks, conversations, research records and the agents' workspace
        files. A record that the lab existed and was deleted, and anything you signed for it, is kept. This cannot
        be undone.
      </p>
      {!stopped && <Strip tone="warn">Stop the lab first. A lab with agents still up cannot be deleted.</Strip>}
      <label htmlFor="lab-delete-name" className="text-[12.5px] text-[var(--lab-dim)]">
        Type <span className="lab-mono text-[var(--lab-text)]">{name}</span> to confirm
      </label>
      <input
        id="lab-delete-name"
        className="lab-input"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        disabled={disabled || pending}
      />
      <div className="flex flex-wrap gap-2">
        <LabButton type="submit" variant="danger" disabled={disabled || pending || !matches || !stopped}>
          {pending ? "Deleting…" : "Delete permanently"}
        </LabButton>
        <LabButton variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </LabButton>
      </div>
      {failure && (
        <Strip tone="bad" role="alert">
          {failure.message}
        </Strip>
      )}
    </form>
  );
}
