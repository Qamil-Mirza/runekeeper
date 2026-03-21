"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { inkSpread } from "@/lib/animations";
import type { Task } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface TaskItemProps {
  task: Task;
  onToggleDone: (id: string) => void;
  even?: boolean;
}

const priorityVariant = {
  P0: "gold" as const,
  P1: "default" as const,
  P2: "dim" as const,
};

export function TaskItem({ task, onToggleDone, even }: TaskItemProps) {
  const isDone = task.status === "done";

  return (
    <motion.div
      variants={inkSpread}
      initial="hidden"
      animate="visible"
      className={cn(
        "flex items-start gap-3 px-4 py-3",
        even ? "bg-surface-container-low" : "bg-surface"
      )}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggleDone(task.id)}
        className={cn(
          "mt-0.5 w-4 h-4 shrink-0 border border-outline-variant flex items-center justify-center transition-all duration-300",
          isDone && "bg-tertiary/20 border-tertiary"
        )}
        aria-label={isDone ? `Mark "${task.title}" as incomplete` : `Mark "${task.title}" as complete`}
        role="checkbox"
        aria-checked={isDone}
      >
        {isDone && (
          <svg className="w-2.5 h-2.5 text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-body text-body-lg leading-tight truncate",
              isDone && "line-through text-outline-variant"
            )}
          >
            {task.title}
          </span>
          <Badge variant={priorityVariant[task.priority]}>
            {task.priority}
          </Badge>
        </div>

        {task.notes && (
          <p className={cn(
            "font-body text-body-md text-on-surface-variant mt-0.5 truncate",
            isDone && "line-through opacity-50"
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
          {task.status === "scheduled" && (
            <span className="font-label text-label-sm text-tertiary">
              Scheduled
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
