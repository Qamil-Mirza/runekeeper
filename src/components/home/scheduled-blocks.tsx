"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { staggerChildren, slideUp } from "@/lib/animations";
import { cn, toLocalDateStr, isoToLocalDate } from "@/lib/utils";
import { usePlanner } from "@/context/planner-context";
import type { BlockType } from "@/lib/types";

const blockIcons: Record<BlockType, string> = {
  focus: "📖",
  meeting: "🤝",
  class: "🏛",
  personal: "🌿",
  admin: "📋",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d
    .toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    .toUpperCase();
}

function blockSubtitle(type: BlockType): string {
  const labels: Record<BlockType, string> = {
    focus: "Deep Work",
    meeting: "Planning Session",
    class: "Lecture Hall",
    personal: "Personal Time",
    admin: "Administration",
  };
  return labels[type];
}

export function ScheduledBlocks() {
  const { blocks, tasks } = usePlanner();

  const todayBlocks = useMemo(() => {
    const today = toLocalDateStr(new Date());
    return blocks
      .filter((b) => isoToLocalDate(b.start) === today)
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [blocks]);

  return (
    <section className="mt-10">
      <h3 className="px-6 mb-4 font-display text-headline-md text-on-surface">
        Scheduled Blocks
      </h3>

      {todayBlocks.length === 0 ? (
        <div className="px-6">
          <p className="font-body text-body-lg text-on-surface-variant/60 italic">
            No quests mapped for today. Open the Chronicle to plan your day.
          </p>
        </div>
      ) : (
      <motion.div
        variants={staggerChildren}
        initial="hidden"
        animate="visible"
        className="px-6"
      >
        {todayBlocks.map((block, i) => {
          const linkedTask = block.taskId ? tasks.find((t) => t.id === block.taskId) : undefined;
          const isDone = linkedTask?.status === "done";
          const isPast = new Date(block.end) < new Date();

          return (
            <motion.div
              key={block.id}
              variants={slideUp}
              className={cn("flex gap-4 relative", isDone && "opacity-50")}
            >
              {/* Time label */}
              <div className="w-[68px] shrink-0 pt-3 text-right">
                <span className={cn(
                  "font-label text-label-sm font-medium tracking-wide",
                  isDone ? "text-outline-variant line-through" : "text-on-surface-variant"
                )}>
                  {formatTime(block.start)}
                </span>
              </div>

              {/* Timeline connector */}
              <div className="flex flex-col items-center shrink-0 pt-1">
                {isDone ? (
                  <div className="w-4 h-4 rounded-full bg-tertiary/20 flex items-center justify-center mt-2 shrink-0">
                    <svg className="w-2.5 h-2.5 text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                ) : (
                  <div className={cn(
                    "w-2 h-2 rounded-full mt-3 shrink-0",
                    isPast ? "bg-outline-variant/40" : "bg-outline-variant/60"
                  )} />
                )}
                {i < todayBlocks.length - 1 && (
                  <div className="w-px flex-1 bg-outline-variant/30 mt-1" />
                )}
              </div>

              {/* Block card */}
              <div
                className={cn(
                  "flex-1 min-w-0 flex items-start justify-between gap-3 py-3 mb-2",
                  i < todayBlocks.length - 1 && "border-b border-outline-variant/15"
                )}
              >
                <div className="min-w-0">
                  <span className={cn(
                    "font-display text-body-lg font-semibold block truncate leading-snug",
                    isDone ? "line-through text-on-surface/50" : "text-on-surface"
                  )}>
                    {block.title}
                  </span>
                  <span className="font-label text-label-sm text-on-surface-variant mt-0.5 block">
                    {isDone ? "Completed" : blockSubtitle(block.type)}
                  </span>
                </div>
                {isDone ? (
                  <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-tertiary/15 flex items-center justify-center">
                    <svg className="w-3 h-3 text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                ) : (
                  <span className="text-base shrink-0 mt-0.5" aria-hidden="true">
                    {blockIcons[block.type]}
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
      )}
    </section>
  );
}
