"use client";

import { useState } from "react";
import { usePlanner } from "@/context/planner-context";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function ProfileView() {
  const { user, clearRunekeeperData } = usePlanner();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }

    setClearing(true);
    setConfirmingClear(false);
    try {
      const result = await clearRunekeeperData();
      setFeedback(
        `Cleared ${result.deletedTasks} task${result.deletedTasks !== 1 ? "s" : ""} and ${result.deletedBlocks} event${result.deletedBlocks !== 1 ? "s" : ""}`
      );
    } catch {
      setFeedback("Failed to clear data. Please try again.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto px-5 py-8 space-y-10">
        {/* User info */}
        <div className="flex flex-col items-center gap-3">
          <Avatar
            src={user.image}
            initials={user.initials}
            size="lg"
          />
          <div className="text-center">
            <p className="font-display text-headline-sm text-on-surface">
              {user.name}
            </p>
            {user.email && (
              <p className="font-label text-label-md text-on-surface-variant mt-1">
                {user.email}
              </p>
            )}
          </div>
        </div>

        {/* Danger zone */}
        <div className="space-y-3">
          <h2 className="font-label text-label-lg font-medium tracking-wide uppercase text-on-surface-variant">
            Danger Zone
          </h2>
          <div className="border border-[rgba(186,26,26,0.3)] p-4 space-y-3">
            <p className="font-body text-body-md text-on-surface-variant">
              Remove all Runekeeper-created tasks and events. Items synced from Google Calendar and Google Tasks will not be affected.
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={handleClear}
                disabled={clearing}
                className={
                  confirmingClear
                    ? "text-error border-error hover:bg-[rgba(186,26,26,0.08)]"
                    : ""
                }
              >
                {clearing
                  ? "Clearing..."
                  : confirmingClear
                    ? "Confirm Clear"
                    : "Clear All Tasks & Events"}
              </Button>
              {confirmingClear && (
                <button
                  onClick={() => setConfirmingClear(false)}
                  className="font-label text-label-sm text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
            {feedback && (
              <p className="font-label text-label-sm text-on-surface-variant">
                {feedback}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
