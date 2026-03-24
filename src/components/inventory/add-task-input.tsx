"use client";

import { useState, useCallback } from "react";

interface AddTaskInputProps {
  onAdd: (title: string) => void;
}

export function AddTaskInput({ onAdd }: AddTaskInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue("");
  }, [value, onAdd]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="px-4 py-3 flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a new quest..."
        className="flex-1 bg-surface-bright border-0 border-b-2 border-primary/20 rounded-none px-3 py-2 font-body text-body-lg text-on-surface placeholder:text-[rgba(212,168,96,0.35)] focus:border-tertiary focus:outline-none transition-colors duration-200"
        aria-label="Add new task"
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim()}
        className="font-label text-label-sm font-medium tracking-wide uppercase text-tertiary hover:opacity-70 disabled:opacity-30 transition-opacity duration-200 px-2 py-1"
      >
        Add
      </button>
    </div>
  );
}
