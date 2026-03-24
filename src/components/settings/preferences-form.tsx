"use client";

import { useState } from "react";
import type { User } from "@/lib/types";
import { updateUserPreferences } from "@/lib/api-client";

interface PreferencesFormProps {
  user: User;
  onSaved: () => void;
}

export function PreferencesForm({ user, onSaved }: PreferencesFormProps) {
  const [prefs, setPrefs] = useState(user.preferences);
  const [timezone, setTimezone] = useState(user.timezone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUserPreferences({ timezone, preferences: prefs });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch (err) {
      console.error("Failed to save preferences:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Working Hours */}
      <section>
        <h3 className="font-label text-label-lg font-medium uppercase tracking-wide text-on-surface mb-4">
          Working Hours
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="font-label text-label-sm text-on-surface-variant block mb-1">
              Start
            </label>
            <select
              value={prefs.workingHoursStart}
              onChange={(e) =>
                setPrefs({ ...prefs, workingHoursStart: Number(e.target.value) })
              }
              className="w-full bg-surface-bright text-on-surface border-b-2 border-outline-variant px-3 py-2 font-body text-body-md focus:border-tertiary outline-none transition-colors"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-label text-label-sm text-on-surface-variant block mb-1">
              End
            </label>
            <select
              value={prefs.workingHoursEnd}
              onChange={(e) =>
                setPrefs({ ...prefs, workingHoursEnd: Number(e.target.value) })
              }
              className="w-full bg-surface-bright text-on-surface border-b-2 border-outline-variant px-3 py-2 font-body text-body-md focus:border-tertiary outline-none transition-colors"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Break Rules */}
      <section>
        <h3 className="font-label text-label-lg font-medium uppercase tracking-wide text-on-surface mb-4">
          Break Rules
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="font-label text-label-sm text-on-surface-variant block mb-1">
              Lunch Duration (min)
            </label>
            <input
              type="number"
              value={prefs.lunchDurationMinutes}
              onChange={(e) =>
                setPrefs({
                  ...prefs,
                  lunchDurationMinutes: Number(e.target.value),
                })
              }
              min={0}
              max={120}
              className="w-full bg-surface-bright text-on-surface border-b-2 border-outline-variant px-3 py-2 font-body text-body-md focus:border-tertiary outline-none transition-colors"
            />
          </div>
          <div>
            <label className="font-label text-label-sm text-on-surface-variant block mb-1">
              Meeting Buffer (min)
            </label>
            <input
              type="number"
              value={prefs.meetingBuffer}
              onChange={(e) =>
                setPrefs({ ...prefs, meetingBuffer: Number(e.target.value) })
              }
              min={0}
              max={60}
              className="w-full bg-surface-bright text-on-surface border-b-2 border-outline-variant px-3 py-2 font-body text-body-md focus:border-tertiary outline-none transition-colors"
            />
          </div>
        </div>
      </section>

      {/* Block Settings */}
      <section>
        <h3 className="font-label text-label-lg font-medium uppercase tracking-wide text-on-surface mb-4">
          Block Settings
        </h3>
        <div>
          <label className="font-label text-label-sm text-on-surface-variant block mb-1">
            Max Block Duration (min)
          </label>
          <input
            type="number"
            value={prefs.maxBlockMinutes}
            onChange={(e) =>
              setPrefs({ ...prefs, maxBlockMinutes: Number(e.target.value) })
            }
            min={15}
            max={480}
            step={15}
            className="w-full bg-surface-bright text-on-surface border-b-2 border-outline-variant px-3 py-2 font-body text-body-md focus:border-tertiary outline-none transition-colors"
          />
        </div>
      </section>

      {/* Timezone */}
      <section>
        <h3 className="font-label text-label-lg font-medium uppercase tracking-wide text-on-surface mb-4">
          Timezone
        </h3>
        <input
          type="text"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="America/New_York"
          className="w-full bg-surface-bright text-on-surface border-b-2 border-outline-variant px-3 py-2 font-body text-body-md focus:border-tertiary outline-none transition-colors"
        />
        <p className="font-label text-label-sm text-outline mt-1">
          IANA timezone identifier (e.g., America/New_York, Europe/London)
        </p>
      </section>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-tertiary text-[#1a1008] px-6 py-2 font-label text-label-lg font-medium uppercase tracking-wide hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {saving ? "Saving..." : saved ? "Saved" : "Save Preferences"}
      </button>
    </div>
  );
}
