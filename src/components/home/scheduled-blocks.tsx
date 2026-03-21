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
  const { blocks } = usePlanner();

  const todayBlocks = useMemo(() => {
    const today = toLocalDateStr(new Date());
    return blocks
      .filter((b) => isoToLocalDate(b.start) === today)
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [blocks]);

  if (todayBlocks.length === 0) return null;

  return (
    <section className="mt-10">
      <h3 className="px-6 mb-4 font-display text-headline-md text-on-surface">
        Scheduled Blocks
      </h3>

      <motion.div
        variants={staggerChildren}
        initial="hidden"
        animate="visible"
        className="px-6"
      >
        {todayBlocks.map((block, i) => (
          <motion.div
            key={block.id}
            variants={slideUp}
            className="flex gap-4 relative"
          >
            {/* Time label */}
            <div className="w-[68px] shrink-0 pt-3 text-right">
              <span className="font-label text-label-sm font-medium text-on-surface-variant tracking-wide">
                {formatTime(block.start)}
              </span>
            </div>

            {/* Timeline connector */}
            <div className="flex flex-col items-center shrink-0 pt-1">
              <div className="w-2 h-2 rounded-full bg-outline-variant/60 mt-3 shrink-0" />
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
                <span className="font-display text-body-lg font-semibold text-on-surface block truncate leading-snug">
                  {block.title}
                </span>
                <span className="font-label text-label-sm text-on-surface-variant mt-0.5 block">
                  {blockSubtitle(block.type)}
                </span>
              </div>
              <span className="text-base shrink-0 mt-0.5" aria-hidden="true">
                {blockIcons[block.type]}
              </span>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
