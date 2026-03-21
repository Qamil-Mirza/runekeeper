"use client";

import { useState, useCallback, useRef } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
  }, []);

  return (
    <div className="flex items-end gap-3 px-6 py-4 bg-surface-container-low/50 backdrop-blur-sm">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="Tell the Archivist your plans..."
        disabled={disabled}
        rows={1}
        className="flex-1 bg-surface-container-high border-0 border-b-2 border-primary/20 rounded-none resize-none px-4 py-3 font-body text-body-lg text-on-surface placeholder:text-outline-variant focus:border-tertiary focus:outline-none transition-colors duration-200 overflow-hidden"
        aria-label="Message the planner"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className="bg-tertiary text-on-tertiary px-5 py-3 font-label text-label-md font-medium tracking-wide uppercase disabled:opacity-40 disabled:pointer-events-none hover:opacity-90 transition-opacity duration-200 shrink-0"
        aria-label="Send message"
      >
        Send
      </button>
    </div>
  );
}
