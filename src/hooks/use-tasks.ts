"use client";

import { useState, useMemo, useCallback } from "react";
import type { Task, Priority, TaskStatus } from "@/lib/types";
import { mockTasks } from "@/lib/mock-tasks";

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(mockTasks);

  const grouped = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = {
      unscheduled: [],
      scheduled: [],
      done: [],
    };
    for (const t of tasks) {
      groups[t.status].push(t);
    }
    // Sort by priority within each group
    const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
    for (const key of Object.keys(groups) as TaskStatus[]) {
      groups[key].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    }
    return groups;
  }, [tasks]);

  const toggleDone = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: t.status === "done" ? "unscheduled" : "done" }
          : t
      )
    );
  }, []);

  const addTask = useCallback((title: string) => {
    const newTask: Task = {
      id: `task-${Date.now()}`,
      title,
      priority: "medium",
      estimateMinutes: 30,
      status: "unscheduled",
    };
    setTasks((prev) => [...prev, newTask]);
  }, []);

  return { tasks, grouped, toggleDone, addTask };
}
