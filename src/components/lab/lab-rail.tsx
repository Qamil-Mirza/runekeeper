"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { MAX_BRIEF_LENGTH, type LabStatus, type LabSummary } from "@/lib/lab/types";
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
  onCreate: (name: string, brief?: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const trimmed = name.trim();
  const tooLong = brief.length > MAX_BRIEF_LENGTH;

  return (
    <>
      <LabButton onClick={() => setOpen(true)} disabled={disabled} className="w-full">
        + New lab
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
          <form
            className="lab-modal lab-modal-plain lab-panel p-5 flex flex-col gap-3"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lab-create-title"
            onSubmit={(e) => {
              e.preventDefault();
              if (!trimmed || tooLong || pending) return;
              void onCreate(trimmed, brief.trim() || undefined).then((created) => {
                if (!created) return;
                setName("");
                setBrief("");
                setOpen(false);
              });
            }}
          >
            <h4 id="lab-create-title" className="text-[19px] font-semibold leading-tight">
              New lab
            </h4>
            <label htmlFor="lab-name" className="lab-eyebrow">
              Title
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
            <label htmlFor="lab-brief" className="lab-eyebrow">
              Description for the agents
            </label>
            <textarea
              id="lab-brief"
              className="lab-input lab-textarea"
              rows={9}
              placeholder={"What you want investigated.\nMethods you want used.\nLinks to papers and other sources, one per line."}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              disabled={disabled || pending}
            />
            <p className={cn("text-[12.5px]", tooLong ? "text-[var(--lab-bad)]" : "text-[var(--lab-dim)]")}>
              {tooLong
                ? `Too long by ${brief.length - MAX_BRIEF_LENGTH} characters.`
                : "Every agent in the lab is given this as your words. The Orchestrator decides the lab's objective and goals from it. You can change it later."}
            </p>
            {failure && (
              <Strip tone="bad" role="alert">
                {failure.message}
              </Strip>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <LabButton onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </LabButton>
              <LabButton type="submit" variant="primary" disabled={disabled || pending || !trimmed || tooLong}>
                {pending ? "Creating…" : "Create lab"}
              </LabButton>
            </div>
          </form>
        </div>
      )}
    </>
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
  page,
  onPage,
  needsYou,
  showSites,
}: {
  /** Which host-wide page is open instead of a lab, if any. */
  page: "lab" | "needsYou" | "sites";
  onPage: (page: "needsYou" | "sites") => void;
  /** How many things, in every lab, wait for the owner. */
  needsYou: number;
  showSites: boolean;
  labs: LabSummary[] | null;
  selectedLabId: string | null;
  connected: boolean;
  labsFailure: LabFailure | null;
  createPending: boolean;
  createFailure?: LabFailure;
  onSelect: (labId: string) => void;
  onCreate: (name: string, brief?: string) => Promise<boolean>;
}) {
  return (
    <aside
      className="shrink-0 lg:w-64 border-b lg:border-b-0 lg:border-r border-[var(--lab-line)] flex flex-col min-h-0"
      aria-label="Labs"
    >
      <div className="flex lg:flex-col border-b border-[var(--lab-line)]" role="tablist" aria-label="Across all labs">
        <button
          role="tab"
          aria-selected={page === "needsYou"}
          onClick={() => onPage("needsYou")}
          className="lab-rail-item flex-1 lg:flex-none"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-[14.5px] font-medium">Needs you</span>
            {needsYou > 0 && <span className="lab-count">{needsYou}</span>}
          </span>
        </button>
        {showSites && (
          <button
            role="tab"
            aria-selected={page === "sites"}
            onClick={() => onPage("sites")}
            className="lab-rail-item flex-1 lg:flex-none"
          >
            <span className="text-[14.5px] font-medium">Sites reached</span>
          </button>
        )}
      </div>

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
              aria-selected={page === "lab" && item.id === selectedLabId}
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
