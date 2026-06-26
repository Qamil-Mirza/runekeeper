"use client";

import { cn } from "@/lib/utils";

const PRESETS: { label: string; time: string }[] = [
  { label: "Morning", time: "08:00" },
  { label: "Midday", time: "12:00" },
  { label: "Evening", time: "18:00" },
  { label: "Night", time: "21:00" },
];

/** Pick a starting time for a new row that isn't already in the list. */
function nextDefaultTime(existing: string[]): string {
  const candidates = ["09:00", "08:00", "12:00", "18:00", "21:00", "15:00", "07:00", "22:00"];
  return candidates.find((c) => !existing.includes(c)) ?? "09:00";
}

/** Turn an IANA zone id into something readable, e.g. America/New_York → America/New York. */
function prettyZone(tz: string): string {
  return tz.replace(/_/g, " ");
}

export interface TimeSlotEditorProps {
  /** Heading for the section, e.g. "Sending times" / "Call times". */
  label: string;
  /** Configured "HH:MM" times. */
  times: string[];
  /** Whether prefs are still loading (shows a loading line). */
  loading: boolean;
  /** User timezone, shown next to the heading. */
  timezone: string;
  /** Message shown when there are no times yet. */
  emptyHint: string;
  /** Prefix for per-row aria-labels, e.g. "Send time" / "Call time". */
  ariaPrefix: string;
  onUpdate: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  onAdd: (value: string) => void;
}

/**
 * Editable list of "HH:MM" times with add/remove + quick-add presets. Shared by
 * the quest-digest email schedule and the Goggins-call schedule so the two stay
 * visually and behaviourally identical.
 */
export function TimeSlotEditor({
  label,
  times,
  loading,
  timezone,
  emptyHint,
  ariaPrefix,
  onUpdate,
  onRemove,
  onAdd,
}: TimeSlotEditorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-label text-label-sm font-medium tracking-wide uppercase text-on-surface-variant">
          {label}
        </span>
        <span className="font-label text-label-sm text-on-surface-variant truncate">
          Shown in {prettyZone(timezone)}
        </span>
      </div>

      {loading ? (
        <p className="font-body text-body-md text-on-surface-variant">Loading…</p>
      ) : times.length === 0 ? (
        <p className="font-body text-body-md text-on-surface-variant">{emptyHint}</p>
      ) : (
        <ul className="space-y-px">
          {times.map((t, i) => (
            <li
              key={i}
              className="flex items-center gap-4 bg-surface-container-low px-4 py-3"
            >
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-tertiary" />
              <input
                type="time"
                value={t}
                onChange={(e) => onUpdate(i, e.target.value)}
                aria-label={`${ariaPrefix} ${i + 1}`}
                className={cn(
                  "flex-1 min-w-0 bg-transparent border-0 p-0 rounded-none",
                  "font-display text-headline-md leading-none text-[#3a2410] [color-scheme:light]",
                  "focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a05a10]",
                  "[&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                )}
              />
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${ariaPrefix.toLowerCase()} ${i + 1}`}
                className="font-label text-label-sm font-medium tracking-wide uppercase text-[#6b5030] hover:text-error focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-error transition-colors"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add — exact custom time is the primary action */}
      {!loading && (
        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            onClick={() => onAdd(nextDefaultTime(times))}
            className={cn(
              "w-full border border-[rgba(212,168,96,0.4)] py-2.5",
              "font-label text-label-sm font-medium tracking-wide uppercase text-on-surface",
              "hover:border-tertiary hover:text-tertiary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-tertiary transition-colors"
            )}
          >
            + Add a time
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-label text-label-sm tracking-wide uppercase text-on-surface-variant">
              Quick add
            </span>
            {PRESETS.map((p) => (
              <button
                key={p.time}
                type="button"
                onClick={() => onAdd(p.time)}
                disabled={times.includes(p.time)}
                className={cn(
                  "font-label text-label-sm tracking-wide uppercase px-2.5 py-1",
                  "border border-[rgba(212,168,96,0.25)] text-on-surface-variant",
                  "hover:text-on-surface hover:border-[rgba(212,168,96,0.5)]",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-tertiary",
                  "disabled:opacity-40 disabled:pointer-events-none transition-colors"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
