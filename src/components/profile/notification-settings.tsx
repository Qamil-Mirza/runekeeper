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
  { label: "Noon", time: "12:00" },
  { label: "Night", time: "21:00" },
];

function sortUnique(times: string[]): string[] {
  return [...new Set(times.filter(Boolean))].sort();
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
      .catch(() => setFeedback("Couldn't load notification settings."))
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

  const addTime = (value = "09:00") => {
    setTimes((prev) => (prev.includes(value) ? prev : [...prev, value]));
    markDirty();
  };

  const toggleEnabled = () => {
    setEnabled((v) => !v);
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
      setFeedback("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="font-label text-label-lg font-medium tracking-wide uppercase text-on-surface-variant">
        Notifications
      </h2>

      <div className="border border-[rgba(212,168,96,0.25)] p-4 space-y-4">
        {/* Master toggle */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-body text-body-md text-on-surface">
              Email digest reminders
            </p>
            <p className="font-label text-label-sm text-on-surface-variant mt-0.5">
              A summary of your open quests, emailed at the times you choose.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Toggle email digest reminders"
            onClick={toggleEnabled}
            disabled={loading}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50",
              enabled ? "bg-tertiary" : "bg-[rgba(212,168,96,0.25)]"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-on-surface transition-transform duration-200",
                enabled ? "translate-x-[22px]" : "translate-x-0.5"
              )}
            />
          </button>
        </div>

        {/* Times — only meaningful when enabled */}
        <div
          className={cn(
            "space-y-3 transition-opacity",
            enabled ? "opacity-100" : "opacity-40 pointer-events-none"
          )}
        >
          <p className="font-label text-label-sm text-on-surface-variant">
            Send times — in your timezone ({timezone})
          </p>

          {loading ? (
            <p className="font-label text-label-sm text-on-surface-variant">
              Loading…
            </p>
          ) : (
            <>
              {times.length === 0 && (
                <p className="font-label text-label-sm text-on-surface-variant">
                  No times set — add one below.
                </p>
              )}

              <div className="space-y-2">
                {times.map((t, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <input
                      type="time"
                      value={t}
                      onChange={(e) => updateTime(i, e.target.value)}
                      className={cn(
                        "rounded-none border border-[rgba(212,168,96,0.3)] bg-[rgba(26,16,8,0.4)]",
                        "px-3 py-2 font-body text-body-md text-on-surface [color-scheme:dark]",
                        "focus:border-tertiary focus:outline-none transition-colors duration-200",
                        "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => removeTime(i)}
                      aria-label={`Remove ${t}`}
                      className="font-label text-label-sm text-on-surface-variant hover:text-error transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              {/* Quick-add presets + custom */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.time}
                    type="button"
                    onClick={() => addTime(p.time)}
                    disabled={times.includes(p.time)}
                    className={cn(
                      "font-label text-label-sm tracking-wide px-3 py-1.5 border border-[rgba(212,168,96,0.25)]",
                      "text-on-surface-variant hover:border-on-surface hover:text-on-surface transition-colors",
                      "disabled:opacity-40 disabled:pointer-events-none"
                    )}
                  >
                    + {p.label} ({p.time})
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => addTime()}
                  className="font-label text-label-sm tracking-wide px-3 py-1.5 border border-[rgba(212,168,96,0.25)] text-on-surface-variant hover:border-on-surface hover:text-on-surface transition-colors"
                >
                  + Custom time
                </button>
              </div>
            </>
          )}
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-1">
          <Button onClick={handleSave} disabled={saving || loading || !dirty}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {feedback && (
            <p className="font-label text-label-sm text-on-surface-variant">
              {feedback}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
