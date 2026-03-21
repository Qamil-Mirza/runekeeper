"use client";

import type { DiffPreview as DiffPreviewType } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DiffPreviewProps {
  diff: DiffPreviewType;
}

const typeStyles = {
  add: { label: "New", color: "text-tertiary", bg: "bg-tertiary/8", border: "border-l-2 border-tertiary" },
  modify: { label: "Changed", color: "text-primary", bg: "bg-primary/5", border: "border-l-2 border-primary" },
  remove: { label: "Removed", color: "text-secondary", bg: "bg-secondary/5", border: "border-l-2 border-secondary" },
};

export function DiffPreview({ diff }: DiffPreviewProps) {
  return (
    <div className="w-full max-w-prose">
      {/* Summary */}
      <p className="font-label text-label-sm text-on-surface-variant uppercase tracking-wide mb-2 px-1">
        {diff.summary}
      </p>

      {/* Changes */}
      <div className="flex flex-col gap-1.5">
        {diff.changes.map((change) => {
          const style = typeStyles[change.type];
          const block = change.block;
          const start = new Date(block.start);
          const end = new Date(block.end);
          const day = start.toLocaleDateString("en-US", { weekday: "short" });
          const timeRange = `${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

          return (
            <div
              key={block.id}
              className={cn("px-3 py-2", style.bg, style.border)}
            >
              <div className="flex items-center gap-2">
                <span className={cn("font-label text-label-sm font-medium uppercase", style.color)}>
                  {style.label}
                </span>
                <span className="font-body text-body-md text-on-surface font-medium">
                  {block.title}
                </span>
              </div>
              <span className="font-label text-label-sm text-on-surface-variant">
                {day} · {timeRange}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
