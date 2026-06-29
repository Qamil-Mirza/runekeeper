"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useAppVersion } from "@/hooks/use-app-version";

/**
 * Passive, dismissible banner shown when a newer build is deployed.
 * Bottom-center, above the mobile bottom nav (z-40) and sidebar overlay (z-50).
 */
export function UpdateBanner() {
  const { updateAvailable, dismiss } = useAppVersion();

  return (
    <AnimatePresence>
      {updateAvailable && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-[60] mb-16 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 border border-[rgba(212,168,96,0.35)] bg-surface-dim px-4 py-3 shadow-lg lg:mb-0"
        >
          <svg
            className="h-4 w-4 shrink-0 text-primary"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2l2.4 6.9L21 9.3l-5.2 4.2L17.6 21 12 16.9 6.4 21l1.8-7.5L3 9.3l6.6-.4z" />
          </svg>
          <span className="font-body text-body-md text-on-surface">
            A new version of Runekeeper is available.
          </span>
          <Button
            variant="primary"
            onClick={() => window.location.reload()}
            className="px-4 py-1.5"
          >
            Refresh
          </Button>
          <button
            onClick={dismiss}
            aria-label="Dismiss update notification"
            className="shrink-0 text-on-surface-variant transition-colors duration-200 hover:text-on-surface"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
