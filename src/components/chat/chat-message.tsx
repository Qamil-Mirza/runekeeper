"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { inkSpread } from "@/lib/animations";
import type { ChatMessage as ChatMessageType } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { DiffPreview } from "./diff-preview";
import { QuickActionChips } from "./quick-action-chips";

interface ChatMessageProps {
  message: ChatMessageType;
  onQuickAction?: (action: string) => void;
  isLast?: boolean;
}

export function ChatMessage({ message, onQuickAction, isLast }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <motion.article
      variants={inkSpread}
      initial="hidden"
      animate="visible"
      className={cn(
        "flex gap-3 max-w-3xl",
        isUser ? "ml-auto flex-row-reverse" : "mr-auto"
      )}
      aria-label={`${isUser ? "You" : "Runekeeper"} at ${formatTime(message.timestamp)}`}
    >
      {/* Avatar */}
      {!isUser && (
        <Avatar initials="RK" size="sm" className="mt-1 shrink-0 bg-tertiary/20 text-tertiary" />
      )}

      <div className={cn("flex flex-col gap-2 min-w-0", isUser ? "items-end" : "items-start")}>
        {/* Message bubble */}
        <div
          className={cn(
            "px-4 py-3 max-w-prose",
            "rounded-lg",
            isUser
              ? "bg-[rgba(212,140,40,0.18)] border border-[rgba(212,140,40,0.25)] text-on-surface"
              : "bg-surface-container-lowest shadow-ambient text-[#3a2410]"
          )}
        >
          <div className="font-body text-body-lg leading-[1.6] whitespace-pre-wrap">
            {renderContent(message.content)}
          </div>
        </div>

        {/* Timestamp */}
        <span className="font-label text-label-sm text-on-surface-variant px-1">
          {formatTime(message.timestamp)}
        </span>

        {/* Action summary */}
        {message.actionSummary && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-tertiary/8 border-l-2 border-tertiary/30 max-w-prose">
            <svg className="w-3.5 h-3.5 text-tertiary/60 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <span className="font-label text-label-sm text-on-surface-variant">
              {message.actionSummary}
            </span>
          </div>
        )}

        {/* Diff preview */}
        {message.diffPreview && (
          <DiffPreview diff={message.diffPreview} />
        )}

        {/* Quick actions */}
        {isLast && message.quickActions && onQuickAction && (
          <QuickActionChips actions={message.quickActions} onAction={onQuickAction} />
        )}
      </div>
    </motion.article>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function renderContent(content: string): React.ReactNode {
  // Simple bold markdown handling
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
