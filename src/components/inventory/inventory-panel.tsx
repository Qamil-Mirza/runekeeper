"use client";

import { useMemo, useState } from "react";
import { usePlanner } from "@/context/planner-context";
import type { Task, TaskStatus, Priority } from "@/lib/types";
import { TaskGroup } from "./task-group";
import { AddTaskInput } from "./add-task-input";
import { QuestEditModal } from "./quest-edit-modal";

export function InventoryPanel() {
  const { tasks, blocks, toggleTaskDone, addTask, updateTask, deleteTask, updateBlockType } = usePlanner();
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const editingBlock = editingTask
    ? blocks.find((b) => b.taskId === editingTask.id) ?? null
    : null;

  const grouped = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = {
      unscheduled: [],
      scheduled: [],
      done: [],
    };
    for (const t of tasks) {
      groups[t.status].push(t);
    }
    const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
    for (const key of Object.keys(groups) as TaskStatus[]) {
      groups[key].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    }
    return groups;
  }, [tasks]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-2 pb-4">
        <p className="font-body text-body-md text-on-surface-variant italic">
          Your quests and tasks, sorted by urgency.
        </p>
      </div>
      <AddTaskInput onAdd={addTask} />
      <div className="flex-1 overflow-y-auto archivist-scroll">
        <TaskGroup title="Active Quests" tasks={grouped.scheduled} onToggleDone={toggleTaskDone} onEdit={setEditingTask} />
        <TaskGroup title="Unscheduled" tasks={grouped.unscheduled} onToggleDone={toggleTaskDone} onEdit={setEditingTask} />
        <TaskGroup title="Completed" tasks={grouped.done} onToggleDone={toggleTaskDone} onEdit={setEditingTask} defaultOpen={false} />
      </div>

      <QuestEditModal
        task={editingTask}
        timeBlock={editingBlock}
        onClose={() => setEditingTask(null)}
        onSave={updateTask}
        onDelete={deleteTask}
        onBlockTypeChange={updateBlockType}
      />
    </div>
  );
}
