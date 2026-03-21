"use client";

import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className={cn(
            "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50",
            "bg-inverse-surface text-inverse-on-surface",
            "px-3 py-1.5 rounded-none whitespace-nowrap",
            "font-label text-label-sm font-medium",
            "animate-[fadeIn_200ms_ease-in-out]",
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
