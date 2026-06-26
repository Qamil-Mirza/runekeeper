"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { collapseVariants } from "@/lib/animations";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Task, TimeBlock, Priority, BlockType } from "@/lib/types";
import * as api from "@/lib/api-client";

interface QuestEditModalProps {
  task: Task | null;
  timeBlock?: TimeBlock | null;
  isNew?: boolean;
  onClose: () => void;
  onSave: (taskId: string, updates: Partial<Task>, startTime?: string) => void;
  onDelete: (taskId: string) => void;
  onBlockTypeChange?: (blockId: string, blockType: BlockType) => void;
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

const blockTypes: { value: BlockType; label: string; emoji: string }[] = [
  { value: "focus", label: "Deep Work", emoji: "📖" },
  { value: "meeting", label: "Meeting", emoji: "🤝" },
  { value: "class", label: "Class", emoji: "🏛" },
  { value: "personal", label: "Personal", emoji: "🌿" },
  { value: "admin", label: "Admin", emoji: "📋" },
];

function formatTime(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function QuestEditModal({ task, timeBlock, isNew = false, onClose, onSave, onDelete, onBlockTypeChange }: QuestEditModalProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [estimate, setEstimate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [blockType, setBlockType] = useState<BlockType>("focus");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // Tracks whether a new quest was committed via Save, so closing afterward
  // doesn't discard it as a cancelled draft.
  const savedRef = useRef(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setNotes(task.notes ?? "");
      setPriority(task.priority);
      setDueDate(task.dueDate ?? "");
      setConfirmingDelete(false);
      savedRef.current = false;

      // New quests start with no estimate or start time — scheduling is opt-in.
      setEstimate(isNew ? "" : String(task.estimateMinutes));

      // Extract time and type from linked block
      if (timeBlock) {
        const d = new Date(timeBlock.start);
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        setStartTime(`${hh}:${mm}`);
        setBlockType(timeBlock.type);
      } else {
        setStartTime("");
      }

      // Reveal the Schedule section only when there's already something to see.
      setScheduleOpen(!!timeBlock);
    }
  }, [task, timeBlock, isNew]);

  // Lock body scroll when open
  useEffect(() => {
    if (task) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [task]);

  const canSave = title.trim().length > 0 && (!isNew || dueDate.trim().length > 0);

  const handleSave = useCallback(() => {
    if (!task || !canSave) return;
    const updates: Partial<Task> = {};
    if (title !== task.title) updates.title = title;
    if ((notes || undefined) !== task.notes) updates.notes = notes || undefined;
    if (priority !== task.priority) updates.priority = priority;
    if ((dueDate || undefined) !== task.dueDate) updates.dueDate = dueDate || undefined;

    // Estimate is optional in the UI — only persist a deliberate value.
    // Left blank, the quest keeps its stored default (used by the scheduler).
    const parsedEstimate = estimate.trim() === "" ? undefined : Math.max(5, Number(estimate) || 5);
    if (parsedEstimate !== undefined && parsedEstimate !== task.estimateMinutes) {
      updates.estimateMinutes = parsedEstimate;
    }

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

    // Update block type if changed
    if (timeBlock && blockType !== timeBlock.type) {
      api.updateBlock(timeBlock.id, { blockType } as any);
      onBlockTypeChange?.(timeBlock.id, blockType);
    }

    savedRef.current = true;
    onClose();
  }, [task, canSave, title, notes, priority, dueDate, estimate, startTime, timeBlock, blockType, onSave, onBlockTypeChange, onClose]);

  // Closing without saving a brand-new quest discards the draft, so the
  // mandatory due date can't be bypassed by dismissing the modal.
  const handleClose = useCallback(() => {
    if (isNew && !savedRef.current && task) {
      onDelete(task.id);
    }
    onClose();
  }, [isNew, task, onDelete, onClose]);

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
      if (e.key === "Escape") handleClose();
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
    [handleClose]
  );

  const scheduleSummary = startTime
    ? `${formatTime(startTime)}${estimate.trim() ? ` · ${estimate.trim()} min` : ""}`
    : "Not scheduled";

  return (
    <AnimatePresence>
      {task && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onKeyDown={handleKeyDown}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-scrim/40"
            onClick={handleClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={isNew ? "New quest" : "Edit quest"}
            className="relative w-full sm:max-w-md sm:max-h-[85vh] bg-surface-container-lowest sm:border-2 sm:border-primary/20 flex flex-col flex-1 sm:flex-initial min-h-0"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0 parchment-context">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="font-display text-headline-md text-on-surface uppercase tracking-wider">
                  {isNew ? "New Quest" : "Edit Quest"}
                </h2>
                <button
                  onClick={handleClose}
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

              {/* Due Date (required) */}
              <div className="flex flex-col gap-micro">
                <Input
                  id="quest-due-date"
                  label={isNew ? "Due Date *" : "Due Date"}
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="[color-scheme:light]"
                />
                {isNew && !dueDate.trim() && (
                  <p className="font-label text-label-sm text-tertiary">
                    Set a due date to create this quest.
                  </p>
                )}
              </div>

              {/* Schedule (collapsible) */}
              <div className="border-t border-outline-variant/20 pt-4">
                <button
                  type="button"
                  onClick={() => setScheduleOpen((o) => !o)}
                  aria-expanded={scheduleOpen}
                  aria-controls="quest-schedule-panel"
                  className="flex items-center gap-2 w-full text-left"
                >
                  <svg
                    className={cn(
                      "w-3 h-3 text-on-surface-variant transition-transform duration-200",
                      scheduleOpen && "rotate-90"
                    )}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span className="font-label text-label-sm font-medium tracking-wide uppercase text-on-surface-variant">
                    Schedule
                  </span>
                  {!scheduleOpen && (
                    <span className="ml-auto font-label text-label-sm text-outline-variant">
                      {scheduleSummary}
                    </span>
                  )}
                </button>

                <AnimatePresence initial={false}>
                  {scheduleOpen && (
                    <motion.div
                      id="quest-schedule-panel"
                      variants={collapseVariants}
                      initial="closed"
                      animate="open"
                      exit="closed"
                      className="overflow-hidden"
                    >
                      <div className="pt-4 space-y-4">
                        {/* Start Time */}
                        <Input
                          id="quest-start-time"
                          label="Start Time"
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="[color-scheme:light]"
                        />

                        {/* Block Type (only for scheduled quests) */}
                        {timeBlock && (
                          <div className="flex flex-col gap-micro">
                            <span className="font-label text-label-sm font-medium tracking-wide uppercase text-on-surface-variant">
                              Type
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {blockTypes.map((bt) => (
                                <button
                                  key={bt.value}
                                  onClick={() => setBlockType(bt.value)}
                                  className={cn(
                                    "px-3 py-1.5 font-label text-label-sm font-medium tracking-wide rounded-none transition-all duration-200 flex items-center gap-1.5",
                                    blockType === bt.value
                                      ? "bg-tertiary/15 text-tertiary border-b border-tertiary/30"
                                      : "text-on-surface-variant border-b border-transparent hover:opacity-80"
                                  )}
                                >
                                  <span>{bt.emoji}</span>
                                  {bt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Estimate */}
                        <div className="flex flex-col gap-micro">
                          <label
                            htmlFor="quest-estimate"
                            className="font-label text-label-sm font-medium tracking-wide uppercase text-on-surface-variant"
                          >
                            Estimate
                          </label>
                          <div className="relative w-32">
                            <input
                              id="quest-estimate"
                              type="number"
                              min={5}
                              step={5}
                              value={estimate}
                              onChange={(e) => setEstimate(e.target.value)}
                              placeholder="30"
                              className={cn(
                                "w-full bg-surface-container-high border-0 border-b-2 border-primary/30 rounded-none",
                                "px-3 py-2.5 pr-10 font-body text-body-lg text-on-surface",
                                "placeholder:text-outline-variant",
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between p-5 pt-3 border-t border-outline-variant/20 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-5">
                {isNew ? (
                  <Button variant="ghost" onClick={handleClose}>
                    Cancel
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={handleDelete} className="text-error">
                    {confirmingDelete ? "Confirm Delete" : "Delete"}
                  </Button>
                )}
                <Button variant="primary" onClick={handleSave} disabled={!canSave}>
                  {isNew ? "Create Quest" : "Save"}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
