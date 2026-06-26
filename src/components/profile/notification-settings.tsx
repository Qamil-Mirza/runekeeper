"use client";

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeSlotEditor } from "@/components/profile/time-slot-editor";
import {
  fetchUserPreferences,
  updateUserPreferences,
  sendGogginsTestCall,
} from "@/lib/api-client";

// Build-time flag: hide the entire Goggins section unless explicitly enabled.
const SHOW_GOGGINS = process.env.NEXT_PUBLIC_GOGGINS_CALLS_ENABLED === "true";

function sortUnique(times: string[]): string[] {
  return [...new Set(times.filter(Boolean))].sort();
}

/** Shared toggle switch — same markup for every on/off control here. */
function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-0 p-0.5 transition-colors duration-200 disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-tertiary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bright",
        checked ? "bg-tertiary" : "bg-[rgba(212,168,96,0.25)]"
      )}
    >
      <span
        className={cn(
          "h-5 w-5 rounded-full bg-on-surface transition-transform duration-200",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

/** Build add/update/remove handlers for a "HH:MM" list bound to a state setter. */
function timeHandlers(
  setTimes: Dispatch<SetStateAction<string[]>>,
  markDirty: () => void
) {
  return {
    onUpdate: (index: number, value: string) => {
      setTimes((prev) => prev.map((t, i) => (i === index ? value : t)));
      markDirty();
    },
    onRemove: (index: number) => {
      setTimes((prev) => prev.filter((_, i) => i !== index));
      markDirty();
    },
    onAdd: (value: string) => {
      setTimes((prev) => (prev.includes(value) ? prev : [...prev, value]));
      markDirty();
    },
  };
}

export function NotificationSettings({ timezone }: { timezone: string }) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [times, setTimes] = useState<string[]>(["08:00"]);

  // Goggins overdue-quest calls
  const [gogginsEnabled, setGogginsEnabled] = useState(false);
  const [gogginsPhone, setGogginsPhone] = useState("");
  const [gogginsTimes, setGogginsTimes] = useState<string[]>(["18:00"]);

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);

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
        setGogginsEnabled(prefs.gogginsCallEnabled === true);
        setGogginsPhone(prefs.gogginsPhoneNumber ?? "");
        setGogginsTimes(
          Array.isArray(prefs.gogginsCallTimes) && prefs.gogginsCallTimes.length > 0
            ? sortUnique(prefs.gogginsCallTimes)
            : ["18:00"]
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

  const digestTimeHandlers = timeHandlers(setTimes, markDirty);
  const gogginsTimeHandlers = timeHandlers(setGogginsTimes, markDirty);

  const handleTestCall = async () => {
    setTesting(true);
    setTestFeedback(null);
    try {
      const res = await sendGogginsTestCall();
      setTestFeedback(res?.message ?? (res?.called ? "Calling…" : "No call placed."));
    } catch {
      setTestFeedback("Test failed. Check the server logs and your config.");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    const cleaned = sortUnique(times);
    const cleanedGoggins = sortUnique(gogginsTimes);
    try {
      const res = await updateUserPreferences({
        digestEnabled: enabled,
        digestTimes: cleaned,
        ...(SHOW_GOGGINS
          ? {
              gogginsCallEnabled: gogginsEnabled,
              gogginsPhoneNumber: gogginsPhone.trim() || null,
              gogginsCallTimes: cleanedGoggins,
            }
          : {}),
      });
      const saved = res?.preferences ?? {};
      setTimes(
        Array.isArray(saved.digestTimes) && saved.digestTimes.length > 0
          ? sortUnique(saved.digestTimes)
          : cleaned
      );
      if (SHOW_GOGGINS) {
        setGogginsTimes(
          Array.isArray(saved.gogginsCallTimes) && saved.gogginsCallTimes.length > 0
            ? sortUnique(saved.gogginsCallTimes)
            : cleanedGoggins
        );
        if (typeof saved.gogginsPhoneNumber === "string") {
          setGogginsPhone(saved.gogginsPhoneNumber);
        }
      }
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
          <Toggle
            checked={enabled}
            onChange={() => {
              setEnabled((v) => !v);
              markDirty();
            }}
            label="Email the quest digest"
            disabled={loading}
          />
        </div>

        <div className="h-px bg-[rgba(212,168,96,0.15)]" />

        {/* Sending times */}
        <div
          className={cn(
            "transition-opacity duration-200",
            enabled ? "opacity-100" : "opacity-40 pointer-events-none"
          )}
        >
          <TimeSlotEditor
            label="Sending times"
            times={times}
            loading={loading}
            timezone={timezone}
            emptyHint="No times yet. Add one below to start sending your digest."
            ariaPrefix="Send time"
            {...digestTimeHandlers}
          />
        </div>

        {/* Goggins overdue-quest calls (build-flag gated) */}
        {SHOW_GOGGINS && (
          <>
            <div className="h-px bg-[rgba(212,168,96,0.15)]" />

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-display text-headline-md text-on-surface leading-tight">
                  Goggins call
                </p>
                <p className="font-body text-body-md text-on-surface-variant mt-1">
                  When a quest is past due and still not done, get a phone call asking
                  why. Calls the number below at the times you choose.
                </p>
              </div>
              <Toggle
                checked={gogginsEnabled}
                onChange={() => {
                  setGogginsEnabled((v) => !v);
                  markDirty();
                }}
                label="Enable Goggins overdue-quest calls"
                disabled={loading}
              />
            </div>

            <div
              className={cn(
                "space-y-5 transition-opacity duration-200",
                gogginsEnabled ? "opacity-100" : "opacity-40 pointer-events-none"
              )}
            >
              <Input
                id="goggins-phone"
                type="tel"
                label="Phone number"
                value={gogginsPhone}
                onChange={(e) => {
                  setGogginsPhone(e.target.value);
                  markDirty();
                }}
                placeholder="+1 555 123 4567"
                aria-label="Goggins call phone number"
                disabled={loading}
              />
              <TimeSlotEditor
                label="Call times"
                times={gogginsTimes}
                loading={loading}
                timezone={timezone}
                emptyHint="No times yet. Add one below to schedule your calls."
                ariaPrefix="Call time"
                {...gogginsTimeHandlers}
              />

              {/* Test call — exercises the live pipeline against your saved settings */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleTestCall}
                  disabled={loading || testing || dirty}
                  className={cn(
                    "border border-[rgba(212,168,96,0.4)] px-4 py-2",
                    "font-label text-label-sm font-medium tracking-wide uppercase text-on-surface",
                    "hover:border-tertiary hover:text-tertiary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-tertiary",
                    "disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  )}
                >
                  {testing ? "Calling…" : "Send a test call now"}
                </button>
                <div role="status" aria-live="polite">
                  {dirty ? (
                    <span className="font-body text-body-md text-on-surface-variant">
                      Save your changes first to test them.
                    </span>
                  ) : testFeedback ? (
                    <span className="font-body text-body-md text-on-surface-variant">
                      {testFeedback}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Save */}
        <div className="flex items-center gap-3 pt-1">
          <Button onClick={handleSave} disabled={saving || loading || !dirty}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <div role="status" aria-live="polite" className="flex items-center gap-2">
            {feedback ? (
              <span className="font-body text-body-md text-on-surface-variant">
                {feedback}
              </span>
            ) : dirty && !saving ? (
              <>
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-tertiary" />
                <span className="font-label text-label-sm font-medium tracking-wide uppercase text-[#d4a860]">
                  Unsaved changes
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
