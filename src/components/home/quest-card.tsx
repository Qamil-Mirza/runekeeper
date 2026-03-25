"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { inkSpread } from "@/lib/animations";
import type { Task } from "@/lib/types";
import { QuestProgressDots } from "./quest-progress-dots";

interface QuestCardProps {
  task: Task;
  onToggleDone: (id: string) => void;
  even?: boolean;
}

export function QuestCard({ task, onToggleDone, even }: QuestCardProps) {
  const isDone = task.status === "done";
  const [completing, setCompleting] = useState(false);

  const handleComplete = useCallback(() => {
    if (completing || isDone) return;
    setCompleting(true);
    // Let the animation play, then actually toggle
    setTimeout(() => onToggleDone(task.id), 700);
  }, [completing, isDone, onToggleDone, task.id]);

  const showDone = isDone || completing;
  const progressTotal = 4;
  const progressCompleted = showDone ? 4 : task.status === "scheduled" ? 2 : 0;

  return (
    <motion.div
      variants={inkSpread}
      animate={completing ? { opacity: 0, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 } : {}}
      transition={completing ? { opacity: { delay: 0.35, duration: 0.3 }, height: { delay: 0.55, duration: 0.2 }, paddingTop: { delay: 0.55, duration: 0.2 }, paddingBottom: { delay: 0.55, duration: 0.2 } } : {}}
      className={cn(
        "flex items-center gap-3 px-4 py-3.5 overflow-hidden",
        even ? "bg-surface-container-low" : "bg-surface"
      )}
    >
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            "font-body text-body-lg leading-tight block transition-all duration-300",
            even ? "text-[#3a2410]" : "text-on-surface",
            showDone && "text-outline-variant"
          )}
          style={{
            textDecorationLine: showDone ? "line-through" : "none",
            textDecorationColor: showDone ? "var(--color-outline-variant)" : "transparent",
            textDecorationThickness: "1.5px",
          }}
        >
          {task.title}
        </span>
        {task.notes && (
          <p className={cn(
            "font-body text-body-md mt-0.5 truncate transition-opacity duration-300",
            even ? "text-[#3a2410]/70" : "text-on-surface/70",
            showDone && "opacity-50"
          )}>
            {task.notes}
          </p>
        )}
        <div className="mt-1.5">
          <QuestProgressDots total={progressTotal} completed={progressCompleted} />
        </div>
      </div>

      {/* Circular icon */}
      <button
        onClick={handleComplete}
        disabled={completing}
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 border-2",
          showDone
            ? "bg-tertiary/20 text-tertiary border-tertiary/40 scale-110"
            : even
              ? "border-[#3a2410]/30 text-[#3a2410]/50 hover:border-[#3a2410]/50 hover:text-[#3a2410]/70 hover:bg-[#3a2410]/10"
              : "border-on-surface/30 text-on-surface/50 hover:border-on-surface/50 hover:text-on-surface/70 hover:bg-surface-container-high"
        )}
        aria-label={isDone ? `Mark "${task.title}" incomplete` : `Complete "${task.title}"`}
      >
        {showDone ? (
          <motion.svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={completing ? { pathLength: 0, opacity: 0 } : {}}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <motion.polyline
              points="20 6 9 17 4 12"
              initial={completing ? { pathLength: 0 } : {}}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </motion.svg>
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
    </motion.div>
  );
}
