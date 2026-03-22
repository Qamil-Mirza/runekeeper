"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { inkSpread } from "@/lib/animations";
import type { Task } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface TaskItemProps {
  task: Task;
  onToggleDone: (id: string) => void;
  onEdit?: (task: Task) => void;
  even?: boolean;
}

const priorityVariant = {
  P0: "gold" as const,
  P1: "default" as const,
  P2: "dim" as const,
};

export function TaskItem({ task, onToggleDone, onEdit, even }: TaskItemProps) {
  const isDone = task.status === "done";
  const [completing, setCompleting] = useState(false);

  const handleToggle = useCallback(() => {
    if (isDone) {
      // Uncompleting — instant
      onToggleDone(task.id);
      return;
    }
    if (completing) return;
    setCompleting(true);
    setTimeout(() => onToggleDone(task.id), 700);
  }, [isDone, completing, onToggleDone, task.id]);

  const showDone = isDone || completing;

  return (
    <motion.div
      variants={completing ? undefined : inkSpread}
      initial={completing ? undefined : "hidden"}
      animate={
        completing
          ? { opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }
          : "visible"
      }
      transition={
        completing
          ? {
              opacity: { delay: 0.35, duration: 0.3 },
              height: { delay: 0.55, duration: 0.2 },
              paddingTop: { delay: 0.55, duration: 0.2 },
              paddingBottom: { delay: 0.55, duration: 0.2 },
            }
          : undefined
      }
      className={cn(
        "flex items-start gap-3 px-4 py-3 overflow-hidden",
        even ? "bg-surface-container-low" : "bg-surface"
      )}
    >
      {/* Checkbox */}
      <button
        onClick={handleToggle}
        disabled={completing}
        className={cn(
          "mt-0.5 w-4 h-4 shrink-0 border border-outline-variant flex items-center justify-center transition-all duration-300",
          showDone && "bg-tertiary/20 border-tertiary scale-110"
        )}
        aria-label={isDone ? `Mark "${task.title}" as incomplete` : `Mark "${task.title}" as complete`}
        role="checkbox"
        aria-checked={showDone}
      >
        {showDone && (
          <motion.svg
            className="w-2.5 h-2.5 text-tertiary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.polyline
              points="20 6 9 17 4 12"
              initial={completing ? { pathLength: 0 } : {}}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </motion.svg>
        )}
      </button>

      {/* Content */}
      <div
        className={cn("flex-1 min-w-0", onEdit && "cursor-pointer")}
        onClick={() => onEdit?.(task)}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-body text-body-lg leading-tight truncate transition-all duration-300",
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
          <Badge variant={priorityVariant[task.priority]}>
            {task.priority}
          </Badge>
        </div>

        {task.notes && (
          <p className={cn(
            "font-body text-body-md text-on-surface-variant mt-0.5 truncate transition-opacity duration-300",
            showDone && "line-through opacity-50"
          )}>
            {task.notes}
          </p>
        )}

        <div className="flex items-center gap-3 mt-1">
          <span className="font-label text-label-sm text-outline-variant">
            {task.estimateMinutes}m
          </span>
          {task.dueDate && (
            <span className="font-label text-label-sm text-outline-variant">
              Due {new Date(task.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
          {task.status === "scheduled" && !completing && (
            <span className="font-label text-label-sm text-tertiary">
              Scheduled
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
