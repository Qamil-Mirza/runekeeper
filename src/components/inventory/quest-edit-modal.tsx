"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Task, TimeBlock, Priority } from "@/lib/types";

interface QuestEditModalProps {
  task: Task | null;
  timeBlock?: TimeBlock | null;
  onClose: () => void;
  onSave: (taskId: string, updates: Partial<Task>, startTime?: string) => void;
  onDelete: (taskId: string) => void;
}

const priorities: { value: Priority; label: string; style: string; activeStyle: string }[] = [
  {
    value: "high",
    label: "High",
    style: "text-tertiary border-b border-transparent",
    activeStyle: "bg-tertiary/15 text-tertiary border-b border-tertiary/30",
  },
  {
    value: "medium",
    label: "Medium",
    style: "text-on-surface-variant border-b border-transparent",
    activeStyle: "bg-surface-container-high text-on-surface-variant border-b border-on-surface-variant/30",
  },
  {
    value: "low",
    label: "Low",
    style: "text-outline border-b border-transparent",
    activeStyle: "bg-surface-container text-outline border-b border-outline/30",
  },
];

export function QuestEditModal({ task, timeBlock, onClose, onSave, onDelete }: QuestEditModalProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [estimateMinutes, setEstimateMinutes] = useState(30);
  const [startTime, setStartTime] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setNotes(task.notes ?? "");
      setPriority(task.priority);
      setDueDate(task.dueDate ?? "");
      setEstimateMinutes(task.estimateMinutes);
      setConfirmingDelete(false);

      // Extract time from linked block
      if (timeBlock) {
        const d = new Date(timeBlock.start);
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        setStartTime(`${hh}:${mm}`);
      } else {
        setStartTime("");
      }
    }
  }, [task, timeBlock]);

  // Lock body scroll when open
  useEffect(() => {
    if (task) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [task]);

  const handleSave = useCallback(() => {
    if (!task || !title.trim()) return;
    const updates: Partial<Task> = {};
    if (title !== task.title) updates.title = title;
    if ((notes || undefined) !== task.notes) updates.notes = notes || undefined;
    if (priority !== task.priority) updates.priority = priority;
    if ((dueDate || undefined) !== task.dueDate) updates.dueDate = dueDate || undefined;
    if (estimateMinutes !== task.estimateMinutes) updates.estimateMinutes = estimateMinutes;

    // Determine if start time changed
    const existingTime = timeBlock
      ? `${String(new Date(timeBlock.start).getHours()).padStart(2, "0")}:${String(new Date(timeBlock.start).getMinutes()).padStart(2, "0")}`
      : "";
    const startTimeChanged = startTime !== existingTime;

    // Build ISO start time if set
    let startTimeISO: string | undefined;
    if (startTimeChanged && startTime) {
      const dateStr = dueDate || new Date().toISOString().split("T")[0];
      startTimeISO = `${dateStr}T${startTime}:00`;
    } else if (startTimeChanged && !startTime && timeBlock) {
      // Clearing start time — pass empty string to signal removal
      startTimeISO = "";
    }

    if (Object.keys(updates).length > 0 || startTimeISO !== undefined) {
      onSave(task.id, updates, startTimeISO);
    }
    onClose();
  }, [task, title, notes, priority, dueDate, estimateMinutes, startTime, timeBlock, onSave, onClose]);

  const handleDelete = useCallback(() => {
    if (!task) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    onDelete(task.id);
    onClose();
  }, [task, confirmingDelete, onDelete, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // Trap focus within the modal
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'input, textarea, button, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose]
  );

  return (
    <AnimatePresence>
      {task && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onKeyDown={handleKeyDown}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-scrim/40"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Edit quest"
            className="relative w-full sm:max-w-md bg-surface-container-lowest border-t-2 border-primary/20 sm:border-2 sm:border-primary/20"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="font-display text-headline-md text-on-surface uppercase tracking-wider">
                  Edit Quest
                </h2>
                <button
                  onClick={onClose}
                  className="text-outline-variant hover:text-on-surface transition-colors p-1"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Title */}
              <Input
                id="quest-title"
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />

              {/* Description */}
              <Textarea
                id="quest-description"
                label="Description"
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                placeholder="Add a description..."
                rows={2}
                maxLength={500}
              />

              {/* Priority */}
              <div className="flex flex-col gap-micro">
                <span className="font-label text-label-sm font-medium tracking-wide uppercase text-on-surface-variant">
                  Priority
                </span>
                <div className="flex gap-2">
                  {priorities.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setPriority(p.value)}
                      className={cn(
                        "px-3 py-1.5 font-label text-label-sm font-medium tracking-wide uppercase rounded-none transition-all duration-200",
                        priority === p.value ? p.activeStyle : p.style,
                        "hover:opacity-80"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Due Date, Start Time & Estimate row */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input
                    id="quest-due-date"
                    label="Due Date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    id="quest-start-time"
                    label="Start Time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="w-28">
                  <div className="flex flex-col gap-micro">
                    <label
                      htmlFor="quest-estimate"
                      className="font-label text-label-sm font-medium tracking-wide uppercase text-on-surface-variant"
                    >
                      Estimate
                    </label>
                    <div className="relative">
                      <input
                        id="quest-estimate"
                        type="number"
                        min={5}
                        step={5}
                        value={estimateMinutes}
                        onChange={(e) => setEstimateMinutes(Number(e.target.value) || 5)}
                        className={cn(
                          "w-full bg-surface-container-high border-0 border-b-2 border-primary/30 rounded-none",
                          "px-3 py-2.5 pr-10 font-body text-body-lg text-on-surface",
                          "focus:border-tertiary focus:outline-none",
                          "transition-colors duration-200"
                        )}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 font-label text-label-sm text-outline-variant">
                        min
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="ghost"
                  onClick={handleDelete}
                  className="text-error"
                >
                  {confirmingDelete ? "Confirm Delete" : "Delete"}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  disabled={!title.trim()}
                >
                  Save
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
