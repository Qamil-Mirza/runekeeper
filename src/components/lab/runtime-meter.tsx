"use client";

import { useEffect, useState } from "react";
import type { LabBudget } from "@/lib/lab/types";
import { LabButton, Strip, toneClass } from "./lab-ui";
import type { LabFailure } from "./use-lab";

const formatMinutes = (minutes: number) =>
  minutes >= 120 ? `${(minutes / 60).toFixed(1)} h` : `${minutes.toFixed(minutes < 10 ? 1 : 0)} min`;

/**
 * Agent runtime used against the lab's limit, as measured by the Lab Manager.
 * This is time, not money. Raising the limit lets agents run longer, so it
 * asks for a second, explicit click.
 */
export function RuntimeMeter({
  runtime,
  capMinutes,
  disabled,
  pending,
  failure,
  onSet,
}: {
  runtime: LabBudget["runtime"];
  /** The most the host allows; null when unknown. */
  capMinutes: number | null;
  disabled: boolean;
  pending: boolean;
  failure?: LabFailure;
  onSet: (wallClockMinutes: number) => Promise<void>;
}) {
  const { limitWallClockMinutes: limit, usedWallClockMinutes: used } = runtime;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [confirmed, setConfirmed] = useState<number | null>(null);

  const share = limit > 0 ? Math.min(1, used / limit) : used > 0 ? 1 : 0;
  const tone = limit <= 0 || share >= 1 ? "bad" : share >= 0.8 ? "warn" : "accent";

  const minutes = /^\d{1,6}$/.test(value.trim()) ? Number(value.trim()) : null;
  const overCap = minutes !== null && capMinutes !== null && minutes > capMinutes;
  const raising = minutes !== null && minutes > limit;
  const needsConfirm = raising && confirmed !== minutes;

  useEffect(() => setConfirmed(null), [value]);

  const close = () => {
    setEditing(false);
    setValue("");
  };

  return (
    <div className={toneClass(tone)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1.5">
        <span className="lab-eyebrow">Agent runtime · measured by the Lab Manager</span>
        <span className="flex items-center gap-3">
          <span className="lab-mono text-[13.5px]">
            {formatMinutes(used)}
            <span className="text-[var(--lab-dim)]"> / {formatMinutes(limit)}</span>
          </span>
          {!editing && (
            <LabButton onClick={() => setEditing(true)} disabled={disabled} className="!min-h-[28px] !px-2">
              Set limit
            </LabButton>
          )}
        </span>
      </div>
      <div
        className="lab-meter"
        role="progressbar"
        aria-label="Agent runtime used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
      >
        <span style={{ width: `${share * 100}%` }} />
      </div>

      {limit <= 0 && !editing && (
        <p className="mt-2 text-[13px] text-[var(--lab-warn)]">
          This lab has no runtime yet, so agents cannot take instructions. Set a limit to begin.
        </p>
      )}

      {editing && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (minutes === null || overCap || pending) return;
            if (needsConfirm) return setConfirmed(minutes);
            void onSet(minutes).then(close);
          }}
        >
          <label htmlFor="lab-runtime-limit" className="text-[13px] text-[var(--lab-dim)]">
            Total minutes agents may run in this lab
          </label>
          <input
            id="lab-runtime-limit"
            className="lab-input !w-28 lab-mono"
            inputMode="numeric"
            autoFocus
            placeholder={String(Math.round(limit))}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={disabled || pending}
          />
          <LabButton
            type="submit"
            variant={needsConfirm ? "default" : "primary"}
            disabled={disabled || pending || minutes === null || overCap || minutes === limit}
          >
            {pending ? "Saving…" : raising && !needsConfirm ? `Confirm ${minutes} min` : "Save"}
          </LabButton>
          <LabButton variant="quiet" onClick={close}>
            Cancel
          </LabButton>
          <p className="basis-full text-[12.5px] text-[var(--lab-dim)]">
            {overCap
              ? `The host allows at most ${capMinutes} minutes.`
              : raising && !needsConfirm
                ? "Raising the limit lets agents run for longer. Click again to confirm."
                : "Time only. No money is involved and nothing is charged."}
          </p>
        </form>
      )}

      {failure && (
        <div className="mt-2">
          <Strip tone="bad" role="alert">
            {failure.message}
          </Strip>
        </div>
      )}
    </div>
  );
}
