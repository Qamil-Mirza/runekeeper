"use client";

import { usePlanner } from "@/context/planner-context";
import { WelcomeSection } from "./welcome-section";
import { TodayQuests } from "./today-quests";
import { ScheduledBlocks } from "./scheduled-blocks";
import { PlanCTA } from "./plan-cta";

export function HomeDashboard() {
  const { user, setCurrentView, setTransitionMode } = usePlanner();

  const handlePlanCTA = () => {
    setTransitionMode("ink-spread");
    setCurrentView("chat");
  };

  return (
    <div className="overflow-y-auto archivist-scroll h-full pb-8">
      <WelcomeSection userName={user.name} />
      <TodayQuests />
      <ScheduledBlocks />
      <PlanCTA onNavigateToChat={handlePlanCTA} />
    </div>
  );
}
