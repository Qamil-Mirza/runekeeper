"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PlannerProvider, usePlanner } from "@/context/planner-context";
import type { ViewId } from "@/context/planner-context";
import { Sidebar } from "@/components/layout/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { CalendarView } from "@/components/schedule/calendar-view";
import { InventoryPanel } from "@/components/inventory/inventory-panel";
import { ChatContainer } from "@/components/chat/chat-container";
import { HomeDashboard } from "@/components/home/home-dashboard";
import SettingsPage from "./settings/page";

const viewTitles: Record<ViewId, string> = {
  home: "Hearth",
  chat: "Chronicle",
  "quest-log": "Quest Log",
  calendar: "Calendar",
  settings: "Settings",
};

const bottomNavItems: { id: ViewId; label: string; icon: (active: boolean) => React.ReactNode }[] = [
  {
    id: "home",
    label: "Home",
    icon: (active) => (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22c-4-3-8-7-8-12a5 5 0 018-4 5 5 0 018 4c0 5-4 9-8 12z" />
      </svg>
    ),
  },
  {
    id: "chat",
    label: "Chat",
    icon: () => (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 2L4 22" />
        <path d="M20 2c-2 2-6 3-9 3s-5 2-5 5c0 2 1 4 3 5l7-9" />
      </svg>
    ),
  },
  {
    id: "quest-log",
    label: "Quest Log",
    icon: () => (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 21h12a2 2 0 002-2V5a2 2 0 00-2-2H8" />
        <path d="M8 3H6a2 2 0 00-2 2v14a2 2 0 002 2h2" />
        <line x1="12" y1="8" x2="18" y2="8" />
        <line x1="12" y1="12" x2="18" y2="12" />
        <line x1="12" y1="16" x2="16" y2="16" />
      </svg>
    ),
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: () => (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="0" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
];

function PlannerShell() {
  const { currentView, setCurrentView } = usePlanner();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleNavigate = (view: ViewId) => {
    setCurrentView(view);
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Sidebar — desktop */}
      <div className="hidden lg:flex">
        <Sidebar
          currentView={currentView}
          onNavigate={handleNavigate}
          collapsed={false}
        />
      </div>

      {/* Sidebar — mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 vellum-overlay lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="fixed left-0 top-0 bottom-0 z-50 lg:hidden"
            >
              <Sidebar
                currentView={currentView}
                onNavigate={handleNavigate}
                collapsed={false}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0 wood-grain bg-surface pb-16 lg:pb-0">
        <AppHeader
          title={viewTitles[currentView]}
          onOpenMenu={() => setSidebarOpen(true)}
        />
        <div className="flex-1 overflow-hidden min-h-0">
          {currentView === "home" && <HomeDashboard />}
          {currentView === "chat" && <ChatContainer />}
          {currentView === "quest-log" && <InventoryPanel />}
          {currentView === "calendar" && <CalendarView />}
          {currentView === "settings" && (
            <div className="overflow-y-auto archivist-scroll h-full">
              <SettingsPage />
            </div>
          )}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-surface-dim flex py-1.5 border-t border-[rgba(212,168,96,0.12)]"
        role="navigation"
        aria-label="Main navigation"
      >
        {bottomNavItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentView(item.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 font-label text-[10px] uppercase tracking-wide transition-colors duration-200 ${
              currentView === item.id ? "text-on-surface" : "text-on-surface-variant"
            }`}
            aria-current={currentView === item.id ? "page" : undefined}
          >
            {item.icon(currentView === item.id)}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function PlannerClientLayout() {
  return (
    <PlannerProvider>
      <PlannerShell />
    </PlannerProvider>
  );
}
