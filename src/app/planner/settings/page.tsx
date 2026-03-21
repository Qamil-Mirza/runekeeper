"use client";

import { usePlanner } from "@/context/planner-context";
import { PreferencesForm } from "@/components/settings/preferences-form";

export default function SettingsPage() {
  const { user, refreshData } = usePlanner();

  return (
    <div className="max-w-xl mx-auto p-6">
      <h2 className="font-display text-headline-lg text-on-surface mb-2">
        Settings
      </h2>
      <p className="font-body text-body-md text-on-surface-variant mb-8">
        Configure your planning preferences. These settings affect how the
        scheduler places time blocks in your week.
      </p>
      <PreferencesForm user={user} onSaved={refreshData} />
    </div>
  );
}
