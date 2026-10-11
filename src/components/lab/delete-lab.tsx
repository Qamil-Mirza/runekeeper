"use client";

import { useEffect, useState } from "react";
import { LabButton, Strip } from "./lab-ui";
import type { LabFailure } from "./use-lab";

/**
 * Permanent deletion of one lab: a small button beside the lab's name. It
 * cannot be undone, so the owner confirms in a dialog that names the lab;
 * the server checks that name again.
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

  useEffect(() => setOpen(false), [labId]);

  return (
    <>
      <LabButton
        variant="danger"
        className="!min-h-[26px] !px-2 !text-[11.5px]"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={`Delete the lab ${name}`}
      >
        Delete
      </LabButton>

      {open && (
        <div
          className="lab-modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && !pending && setOpen(false)}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            // Close only this dialog, not the Lab behind it.
            e.preventDefault();
            if (!pending) setOpen(false);
          }}
        >
          <div
            className="lab-modal lab-danger-zone p-5 flex flex-col gap-3"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="lab-delete-title"
            aria-describedby="lab-delete-text"
          >
            <h4 id="lab-delete-title" className="text-[19px] font-semibold leading-tight break-words">
              Delete {name}?
            </h4>
            <p id="lab-delete-text" className="text-[13.5px]">
              This permanently deletes the lab's agents, tasks, conversations, research records and the agents'
              workspace files. A record that the lab existed and was deleted, and anything you signed for it, is
              kept. This cannot be undone.
            </p>
            {!stopped && <Strip tone="warn">Stop the lab first. A lab with agents still up cannot be deleted.</Strip>}
            {failure && (
              <Strip tone="bad" role="alert">
                {failure.message}
              </Strip>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <LabButton autoFocus onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </LabButton>
              <LabButton variant="danger" onClick={() => void onDelete(name)} disabled={disabled || pending || !stopped}>
                {pending ? "Deleting…" : "Yes, delete it"}
              </LabButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
