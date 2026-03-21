"use client";

import { PlannerProvider, usePlanner } from "@/context/planner-context";
import { Sidebar } from "@/components/layout/sidebar";
import { ScheduleDrawer } from "@/components/layout/schedule-drawer";
import { AppHeader } from "@/components/layout/app-header";
import { WeekGrid } from "@/components/schedule/week-grid";
import { InventoryPanel } from "@/components/inventory/inventory-panel";
import { ChatContainer } from "@/components/chat/chat-container";
import SettingsPage from "./settings/page";

const viewTitles: Record<string, string> = {
  chat: "Chronicle",
  inventory: "Inventory",
  map: "Map",
  settings: "Settings",
};

function PlannerShell() {
  const { currentView, setCurrentView, drawerOpen, toggleDrawer } = usePlanner();

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Sidebar — desktop */}
      <div className="hidden md:flex">
        <Sidebar
          currentView={currentView}
          onNavigate={setCurrentView}
          collapsed={false}
        />
      </div>

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0 paper-grain bg-surface pb-14 md:pb-0">
        <AppHeader
          title={viewTitles[currentView]}
          onToggleDrawer={toggleDrawer}
        />
        <div className="flex-1 overflow-hidden">
          {currentView === "chat" && <ChatContainer />}
          {currentView === "inventory" && <InventoryPanel />}
          {currentView === "map" && (
            <div className="p-6 overflow-y-auto archivist-scroll h-full">
              <WeekGrid />
            </div>
          )}
          {currentView === "settings" && (
            <div className="overflow-y-auto archivist-scroll h-full">
              <SettingsPage />
            </div>
          )}
        </div>
      </main>

      {/* Schedule drawer */}
      <ScheduleDrawer open={drawerOpen} onToggle={toggleDrawer}>
        <WeekGrid />
      </ScheduleDrawer>

      {/* Mobile bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-surface-dim flex justify-around py-2"
        role="navigation"
        aria-label="Main navigation"
      >
        {(["chat", "inventory", "map"] as const).map((view) => (
          <button
            key={view}
            onClick={() => setCurrentView(view)}
            className={`flex flex-col items-center gap-0.5 px-4 py-1.5 font-label text-label-sm uppercase tracking-wide transition-colors duration-200 ${
              currentView === view ? "text-on-surface" : "text-on-surface-variant"
            }`}
            aria-current={currentView === view ? "page" : undefined}
          >
            <span className="text-xs">
              {view === "chat" ? "✦" : view === "inventory" ? "☰" : "▦"}
            </span>
            <span>{viewTitles[view]}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function PlannerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PlannerProvider>
      <PlannerShell />
    </PlannerProvider>
  );
}
