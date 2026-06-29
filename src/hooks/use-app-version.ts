"use client";

import { useCallback, useState } from "react";
import { useEventSocket } from "@/hooks/use-event-socket";

/**
 * Detects when a newer deployment is live.
 *
 * The server sends an `app_version` frame on every `/api/events` connection.
 * We treat the first version we see as the baseline (the build this tab loaded
 * with). A deploy restarts the server, so the socket reconnects and reports a
 * different version — at which point `updateAvailable` becomes true.
 *
 * `dismiss()` advances the baseline to the version currently advertised, hiding
 * the banner until a *further*, different version arrives.
 */
export function useAppVersion(): { updateAvailable: boolean; dismiss: () => void } {
  const [baseline, setBaseline] = useState<string | null>(null);
  const [latest, setLatest] = useState<string | null>(null);

  const handleEvent = useCallback((event: Record<string, unknown>) => {
    if (event.type !== "app_version" || typeof event.version !== "string") return;
    const version = event.version;
    setBaseline((current) => current ?? version); // set once, on first frame
    setLatest(version);
  }, []);

  useEventSocket(handleEvent);

  const dismiss = useCallback(() => {
    setBaseline((current) => latest ?? current);
  }, [latest]);

  const updateAvailable = baseline !== null && latest !== null && latest !== baseline;

  return { updateAvailable, dismiss };
}
