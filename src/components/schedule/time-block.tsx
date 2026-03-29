"use client";

import { cn } from "@/lib/utils";
import type { TimeBlock as TimeBlockType } from "@/lib/types";
import { Tooltip } from "@/components/ui/tooltip";

interface TimeBlockProps {
  block: TimeBlockType;
  hourHeight: number;
  startHour: number;
  column?: number;
  totalColumns?: number;
}

const typeColors: Record<string, string> = {
  focus: "bg-surface-container-lowest border-l-3 border-[#c87828] text-[#3a2410] shadow-[0_2px_8px_rgba(58,36,16,0.08)]",
  meeting: "bg-surface-container-lowest border-l-3 border-[#d4a860] text-[#3a2410] shadow-[0_2px_8px_rgba(58,36,16,0.08)]",
  class: "bg-surface-container-lowest border-l-3 border-[#6b5030] text-[#3a2410] shadow-[0_2px_8px_rgba(58,36,16,0.08)]",
  personal: "bg-surface-container-lowest border-l-3 border-[#ccb488] text-[#3a2410] shadow-[0_2px_8px_rgba(58,36,16,0.08)]",
  admin: "bg-surface-container-lowest border-l-3 border-[#6b5030] text-[#3a2410] shadow-[0_2px_8px_rgba(58,36,16,0.08)]",
};

export function TimeBlockComponent({ block, hourHeight, startHour, column = 0, totalColumns = 1 }: TimeBlockProps) {
  const start = new Date(block.start);
  const end = new Date(block.end);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const durationMinutes = endMinutes - startMinutes;

  const top = ((startMinutes - startHour * 60) / 60) * hourHeight;
  const height = (durationMinutes / 60) * hourHeight;

  const timeStr = `${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

  return (
    <Tooltip content={`${block.title} · ${timeStr}`}>
      <div
        className={cn(
          "absolute px-1.5 py-1 overflow-hidden cursor-default border-b border-b-[rgba(58,36,16,0.12)]",
          typeColors[block.type] || typeColors.focus,
          !block.committed && "opacity-60 border-dashed"
        )}
        style={{
          top: `${top}px`,
          height: `${height}px`,
          minHeight: "18px",
          left: totalColumns > 1
            ? `calc(${(column / totalColumns) * 100}% + 2px)`
            : "2px",
          width: totalColumns > 1
            ? `calc(${(1 / totalColumns) * 100}% - ${column > 0 ? 3 : 4}px)`
            : "calc(100% - 4px)",
        }}
      >
        <span className="font-label text-label-sm font-medium leading-tight block truncate">
          {block.title}
        </span>
        {height > 36 && (
          <span className="font-label text-[10px] text-[#6b5030] block truncate">
            {timeStr}
          </span>
        )}
      </div>
    </Tooltip>
  );
}
