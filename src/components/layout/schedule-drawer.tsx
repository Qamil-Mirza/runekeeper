"use client";

import { cn } from "@/lib/utils";

interface ScheduleDrawerProps {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function ScheduleDrawer({ open, onToggle, children }: ScheduleDrawerProps) {
  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 vellum-overlay xl:hidden"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}

      {/* Drawer panel */}
      <aside
        className={cn(
          "bg-surface-container-low h-full overflow-y-auto archivist-scroll",
          // Desktop: fixed side panel
          "hidden xl:block xl:w-80 2xl:w-96",
          // Mobile/tablet: overlay
          open && "!fixed right-0 top-0 z-40 block w-[85vw] max-w-md shadow-float xl:!relative xl:!w-80 2xl:!w-96 xl:!shadow-none"
        )}
        role="complementary"
        aria-label="Schedule preview"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 pt-6 pb-4">
          <h2 className="font-display text-headline-md text-on-surface">
            Map
          </h2>
          <button
            onClick={onToggle}
            className="xl:hidden p-1 text-on-surface-variant hover:text-on-surface transition-colors duration-200"
            aria-label="Close schedule drawer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {children}
      </aside>
    </>
  );
}
