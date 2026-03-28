"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { staggerChildren } from "@/lib/animations";
import { usePlanner } from "@/context/planner-context";
import { QuestCard } from "./quest-card";

export function TodayQuests() {
  const { tasks, toggleTaskDone } = usePlanner();

  // Top 3 most important quests by due date (soonest first, no-date last)
  const topQuests = useMemo(() => {
    const notDone = tasks.filter((t) => t.status !== "done");
    return notDone
      .sort((a, b) => {
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate && !b.dueDate) return -1;
        if (!a.dueDate && b.dueDate) return 1;
        return 0;
      })
      .slice(0, 3);
  }, [tasks]);

  const doneCount = tasks.filter((t) => t.status === "done").length;
  const allCompleted = tasks.length > 0 && topQuests.length === 0;

  return (
    <section className="mt-6">
      {/* Header */}
      <div className="flex items-center justify-between px-6 mb-3">
        <h3 className="font-display text-headline-md text-on-surface">
          Today&apos;s Quests
        </h3>
        {tasks.length > 0 && (
          <span className="font-label text-label-sm uppercase tracking-wide text-on-surface-variant">
            {doneCount}/{tasks.length} completed
          </span>
        )}
      </div>

      {/* Quest cards */}
      <motion.div
        variants={staggerChildren}
        initial="hidden"
        animate="visible"
      >
        {topQuests.length > 0 ? (
          topQuests.map((task, i) => (
            <QuestCard
              key={task.id}
              task={task}
              onToggleDone={toggleTaskDone}
              even={i % 2 === 0}
            />
          ))
        ) : allCompleted ? (
          <p className="px-6 py-4 font-body text-body-md text-tertiary italic">
            All quests completed! The Keeper is proud.
          </p>
        ) : (
          <p className="px-6 py-4 font-body text-body-md text-on-surface-variant italic">
            No quests yet. Use the Chronicle to plan your week.
          </p>
        )}
      </motion.div>
    </section>
  );
}
