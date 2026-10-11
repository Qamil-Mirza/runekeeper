"use client";

import { useState } from "react";
import type { LabStatus, LabSummary } from "@/lib/lab/types";
import { LabButton, StatusLight, Strip, type LabTone } from "./lab-ui";
import type { LabFailure } from "./use-lab";

export const LAB_STATUS_TONE: Record<LabStatus, LabTone> = {
  stopped: "off",
  starting: "warn",
  running: "ok",
  paused: "warn",
  degraded: "bad",
};

function CreateLab({
  disabled,
  pending,
  failure,
  onCreate,
}: {
  disabled: boolean;
  pending: boolean;
  failure?: LabFailure;
  onCreate: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const trimmed = name.trim();

  if (!open) {
    return (
      <LabButton onClick={() => setOpen(true)} disabled={disabled} className="w-full">
        + New lab
      </LabButton>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!trimmed) return;
        void onCreate(trimmed).then(() => {
          setName("");
          setOpen(false);
        });
      }}
    >
      <label htmlFor="lab-name" className="lab-eyebrow">
        New lab
      </label>
      <input
        id="lab-name"
        className="lab-input"
        placeholder="Name of the research project"
        maxLength={120}
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={disabled || pending}
      />
      <div className="flex gap-2">
        <LabButton type="submit" variant="primary" disabled={disabled || pending || !trimmed} className="flex-1">
          {pending ? "Creating…" : "Create"}
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

export function LabRail({
  labs,
  selectedLabId,
  connected,
  labsFailure,
  createPending,
  createFailure,
  onSelect,
  onCreate,
}: {
  labs: LabSummary[] | null;
  selectedLabId: string | null;
  connected: boolean;
  labsFailure: LabFailure | null;
  createPending: boolean;
  createFailure?: LabFailure;
  onSelect: (labId: string) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  return (
    <aside
      className="shrink-0 lg:w-64 border-b lg:border-b-0 lg:border-r border-[var(--lab-line)] flex flex-col min-h-0"
      aria-label="Labs"
    >
      <p className="lab-eyebrow px-3 sm:px-5 lg:px-4 pt-3 pb-2">
        Labs{labs ? ` · ${labs.length}` : ""}
      </p>

      {labsFailure && connected && (
        <div className="px-3 sm:px-5 lg:px-4 pb-2">
          <Strip tone="bad" role="alert">
            Could not load labs: {labsFailure.message}
          </Strip>
        </div>
      )}

      {labs && labs.length > 0 && (
        <div
          className="lab-scroll flex lg:flex-col overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto lg:flex-1 min-h-0"
          role="tablist"
          aria-label="Select a lab"
          aria-orientation="vertical"
        >
          {labs.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={item.id === selectedLabId}
              onClick={() => onSelect(item.id)}
              className="lab-rail-item shrink-0 max-w-[14rem] lg:max-w-none"
            >
              <span className="flex items-center gap-2">
                <StatusLight tone={LAB_STATUS_TONE[item.status]} pulse={item.status === "starting"} />
                <span className="truncate text-[14.5px] font-medium">{item.name}</span>
              </span>
              <span className="lab-eyebrow !text-[11px] block mt-1 pl-4">
                {item.status}
                {item.pendingApprovalCount > 0 && (
                  <span className="text-[var(--lab-bad)]">
                    {" "}
                    · {item.pendingApprovalCount} approval{item.pendingApprovalCount === 1 ? "" : "s"}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {labs && labs.length === 0 && connected && (
        <p className="px-3 sm:px-5 lg:px-4 pb-2 text-[var(--lab-dim)]">
          No labs yet. Create one to provision its four agents.
        </p>
      )}

      <div className="p-3 sm:px-5 lg:p-4 lg:mt-auto lg:border-t border-[var(--lab-line)]">
        <CreateLab
          disabled={!connected}
          pending={createPending}
          failure={createFailure}
          onCreate={onCreate}
        />
      </div>
    </aside>
  );
}
