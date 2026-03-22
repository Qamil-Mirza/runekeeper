"use client";

import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { signOut } from "next-auth/react";
import type { ViewId } from "@/context/planner-context";
import { usePlanner } from "@/context/planner-context";

interface SidebarProps {
  currentView: ViewId;
  onNavigate: (view: ViewId) => void;
  collapsed?: boolean;
}

const navItems: { id: ViewId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Hearth", icon: HearthIcon },
  { id: "chat", label: "Chronicle", icon: QuillIcon },
  { id: "quest-log", label: "Quest Log", icon: ScrollIcon },
  { id: "calendar", label: "Calendar", icon: CalendarIcon },
  { id: "settings", label: "Settings", icon: GearIcon },
];

export function Sidebar({ currentView, onNavigate, collapsed }: SidebarProps) {
  const { user } = usePlanner();

  return (
    <aside
      className={cn(
        "flex flex-col bg-surface-dim h-full",
        collapsed ? "w-16 items-center" : "w-56"
      )}
    >
      {/* Title */}
      <div className={cn("pt-8 pb-6", collapsed ? "px-2" : "px-5")}>
        {collapsed ? (
          <span className="font-display text-headline-md text-on-surface">R</span>
        ) : (
          <h1 className="font-display text-headline-lg font-light tracking-tight text-on-surface">
            Runekeeper
          </h1>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 px-2" role="navigation" aria-label="Main navigation">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={cn(
              "flex items-center gap-3 rounded-none px-3 py-2.5 w-full text-left transition-colors duration-200",
              currentView === item.id
                ? "bg-surface-container-highest/60 text-on-surface"
                : "text-on-surface-variant hover:bg-surface-container-highest/30"
            )}
            aria-current={currentView === item.id ? "page" : undefined}
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {!collapsed && (
              <span className="font-label text-label-lg font-medium tracking-wide">
                {item.label}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* User */}
      <div className={cn("pb-6", collapsed ? "px-2" : "px-5")}>
        <div className="flex items-center gap-3">
          <Avatar initials={user.initials} size="sm" />
          {!collapsed && (
            <>
              <span className="font-label text-label-md text-on-surface-variant flex-1">
                {user.name.split(" ")[0]}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="text-on-surface-variant hover:text-on-surface transition-colors p-1"
                title="Sign out"
                aria-label="Sign out"
              >
                <SignOutIcon className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ── Inline SVG icons (minimal, thematic) ── */

function HearthIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22c-4-3-8-7-8-12a5 5 0 018-4 5 5 0 018 4c0 5-4 9-8 12z" />
      <path d="M12 13v5" />
      <path d="M9 18h6" />
    </svg>
  );
}

function QuillIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 2L4 22" />
      <path d="M20 2c-2 2-6 3-9 3s-5 2-5 5c0 2 1 4 3 5l7-9" />
      <path d="M6 18l2-2" />
    </svg>
  );
}

function ScrollIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h12a2 2 0 002-2V5a2 2 0 00-2-2H8" />
      <path d="M8 3H6a2 2 0 00-2 2v14a2 2 0 002 2h2" />
      <line x1="12" y1="8" x2="18" y2="8" />
      <line x1="12" y1="12" x2="18" y2="12" />
      <line x1="12" y1="16" x2="16" y2="16" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="0" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function SignOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
