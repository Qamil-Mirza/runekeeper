"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { collapseVariants } from "@/lib/animations";
import type { Task } from "@/lib/types";
import { TaskItem } from "./task-item";

interface TaskGroupProps {
  title: string;
  tasks: Task[];
  onToggleDone: (id: string) => void;
  onEdit?: (task: Task) => void;
  defaultOpen?: boolean;
}

export function TaskGroup({ title, tasks, onToggleDone, onEdit, defaultOpen = true }: TaskGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (tasks.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-4 py-2 text-left"
        aria-expanded={open}
      >
        <svg
          className={`w-3 h-3 text-on-surface-variant transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="font-label text-label-md font-medium uppercase tracking-wide text-on-surface-variant">
          {title}
        </span>
        <span className="font-label text-label-sm text-outline-variant">
          {tasks.length}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            variants={collapseVariants}
            initial="closed"
            animate="open"
            exit="closed"
            className="overflow-hidden"
          >
            {tasks.map((task, i) => (
              <TaskItem
                key={task.id}
                task={task}
                onToggleDone={onToggleDone}
                onEdit={onEdit}
                even={i % 2 === 0}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
