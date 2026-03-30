"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  onVoiceMode?: () => void;
}

export function ChatInput({ onSend, disabled, onVoiceMode }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }
  }, [value, disabled, onSend]);

  // Refocus when the input becomes enabled again (e.g. after streaming finishes)
  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled]);

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

  const showMicProminent = !value.trim();

  return (
    <div className="flex items-end gap-3 px-6 py-4 bg-surface/90 backdrop-blur-sm border-t border-[rgba(212,168,96,0.1)]">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="Tell the keeper your plans..."
        disabled={disabled}
        rows={1}
        className="flex-1 bg-surface-bright border-0 border-b-2 border-[rgba(212,168,96,0.3)] rounded-none resize-none px-4 py-3 font-body text-body-lg text-on-surface placeholder:text-[rgba(212,168,96,0.35)] focus:border-tertiary focus:outline-none transition-colors duration-200 overflow-hidden"
        aria-label="Message the planner"
      />
      {onVoiceMode && (
        <button
          onClick={onVoiceMode}
          disabled={disabled}
          className={`shrink-0 py-3 px-3 transition-all duration-200 ${
            showMicProminent
              ? "text-tertiary hover:text-on-surface"
              : "text-[rgba(212,168,96,0.35)] hover:text-tertiary"
          } disabled:opacity-40 disabled:pointer-events-none`}
          aria-label="Start voice mode"
          title="Speak with the Oracle"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="1" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0014 0" />
            <line x1="12" y1="17" x2="12" y2="21" />
            <line x1="8" y1="21" x2="16" y2="21" />
          </svg>
        </button>
      )}
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className="bg-tertiary text-[#1a1008] px-5 py-3 font-label text-label-md font-medium tracking-wide uppercase disabled:opacity-40 disabled:pointer-events-none hover:opacity-90 transition-opacity duration-200 shrink-0"
        aria-label="Send message"
      >
        Send
      </button>
    </div>
  );
}
