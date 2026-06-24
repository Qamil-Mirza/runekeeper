"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  fetchUserPreferences,
  updateUserPreferences,
} from "@/lib/api-client";

const PRESETS: { label: string; time: string }[] = [
  { label: "Morning", time: "08:00" },
  { label: "Midday", time: "12:00" },
  { label: "Evening", time: "18:00" },
  { label: "Night", time: "21:00" },
];

function sortUnique(times: string[]): string[] {
  return [...new Set(times.filter(Boolean))].sort();
}

/** Pick a starting time for a new row that isn't already in the list. */
function nextDefaultTime(existing: string[]): string {
  const candidates = ["09:00", "08:00", "12:00", "18:00", "21:00", "15:00", "07:00", "22:00"];
  return candidates.find((c) => !existing.includes(c)) ?? "09:00";
}

/** Turn an IANA zone id into something readable, e.g. America/New_York → America/New York. */
function prettyZone(tz: string): string {
  return tz.replace(/_/g, " ");
}

export function NotificationSettings({ timezone }: { timezone: string }) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [times, setTimes] = useState<string[]>(["08:00"]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUserPreferences()
      .then((data) => {
        if (cancelled) return;
        const prefs = data?.preferences ?? {};
        setEnabled(prefs.digestEnabled !== false);
        setTimes(
          Array.isArray(prefs.digestTimes) && prefs.digestTimes.length > 0
            ? sortUnique(prefs.digestTimes)
            : ["08:00"]
        );
      })
      .catch(() => setFeedback("Couldn't load your settings. Reload to try again."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const markDirty = () => {
    setDirty(true);
    setFeedback(null);
  };

  const updateTime = (index: number, value: string) => {
    setTimes((prev) => prev.map((t, i) => (i === index ? value : t)));
    markDirty();
  };

  const removeTime = (index: number) => {
    setTimes((prev) => prev.filter((_, i) => i !== index));
    markDirty();
  };

  const addTime = (value: string) => {
    setTimes((prev) => (prev.includes(value) ? prev : [...prev, value]));
    markDirty();
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    const cleaned = sortUnique(times);
    try {
      const res = await updateUserPreferences({
        digestEnabled: enabled,
        digestTimes: cleaned,
      });
      const saved = res?.preferences ?? {};
      setTimes(
        Array.isArray(saved.digestTimes) && saved.digestTimes.length > 0
          ? sortUnique(saved.digestTimes)
          : cleaned
      );
      setDirty(false);
      setFeedback("Saved.");
    } catch {
      setFeedback("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="font-label text-label-lg font-medium tracking-wide uppercase text-on-surface-variant">
        Notifications
      </h2>

      <div className="border border-[rgba(212,168,96,0.25)] bg-surface-bright shadow-ambient p-5 space-y-5">
        {/* Heading + master toggle */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-display text-headline-md text-on-surface leading-tight">
              Quest digest
            </p>
            <p className="font-body text-body-md text-on-surface-variant mt-1">
              A summary of your open quests, emailed at the times you choose.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Email the quest digest"
            onClick={() => {
              setEnabled((v) => !v);
              markDirty();
            }}
            disabled={loading}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-0 p-0.5 transition-colors duration-200 disabled:opacity-50",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-tertiary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bright",
              enabled ? "bg-tertiary" : "bg-[rgba(212,168,96,0.25)]"
            )}
          >
            <span
              className={cn(
                "h-5 w-5 rounded-full bg-on-surface transition-transform duration-200",
                enabled ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>

        <div className="h-px bg-[rgba(212,168,96,0.15)]" />

        {/* Sending times */}
        <div
          className={cn(
            "space-y-3 transition-opacity duration-200",
            enabled ? "opacity-100" : "opacity-40 pointer-events-none"
          )}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-label text-label-sm font-medium tracking-wide uppercase text-on-surface-variant">
              Sending times
            </span>
            <span className="font-label text-label-sm text-on-surface-variant truncate">
              Shown in {prettyZone(timezone)}
            </span>
          </div>

          {loading ? (
            <p className="font-body text-body-md text-on-surface-variant">Loading…</p>
          ) : times.length === 0 ? (
            <p className="font-body text-body-md text-on-surface-variant">
              No times yet. Add one below to start sending your digest.
            </p>
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
                    onChange={(e) => updateTime(i, e.target.value)}
                    aria-label={`Send time ${i + 1}`}
                    className={cn(
                      "flex-1 min-w-0 bg-transparent border-0 p-0 rounded-none",
                      "font-display text-headline-md leading-none text-[#3a2410] [color-scheme:light]",
                      "focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a05a10]",
                      "[&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => removeTime(i)}
                    aria-label={`Remove send time ${i + 1}`}
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
                onClick={() => addTime(nextDefaultTime(times))}
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
                    onClick={() => addTime(p.time)}
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

        {/* Save */}
        <div className="flex items-center gap-3 pt-1">
          <Button onClick={handleSave} disabled={saving || loading || !dirty}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {feedback && (
            <p className="font-body text-body-md text-on-surface-variant">{feedback}</p>
          )}
        </div>
      </div>
    </div>
  );
}
