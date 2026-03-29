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
  displayStart?: string;
  displayEnd?: string;
  isContinuationFromPreviousDay?: boolean;
  continuesToNextDay?: boolean;
}

const typeColors: Record<string, string> = {
  focus: "bg-surface-container-lowest border-l-3 border-[#c87828] text-[#3a2410] shadow-[0_2px_8px_rgba(58,36,16,0.08)]",
  meeting: "bg-surface-container-lowest border-l-3 border-[#d4a860] text-[#3a2410] shadow-[0_2px_8px_rgba(58,36,16,0.08)]",
  class: "bg-surface-container-lowest border-l-3 border-[#6b5030] text-[#3a2410] shadow-[0_2px_8px_rgba(58,36,16,0.08)]",
  personal: "bg-surface-container-lowest border-l-3 border-[#ccb488] text-[#3a2410] shadow-[0_2px_8px_rgba(58,36,16,0.08)]",
  admin: "bg-surface-container-lowest border-l-3 border-[#6b5030] text-[#3a2410] shadow-[0_2px_8px_rgba(58,36,16,0.08)]",
};

export function TimeBlockComponent({
  block,
  hourHeight,
  startHour,
  column = 0,
  totalColumns = 1,
  displayStart,
  displayEnd,
  isContinuationFromPreviousDay = false,
  continuesToNextDay = false,
}: TimeBlockProps) {
  const effectiveStart = displayStart ? new Date(displayStart) : new Date(block.start);
  const effectiveEnd = displayEnd ? new Date(displayEnd) : new Date(block.end);

  const startMinutes = effectiveStart.getHours() * 60 + effectiveStart.getMinutes();
  // For continuesToNextDay, end is 23:59:59 — treat as full 24h (1440 min)
  const endMinutes = continuesToNextDay
    ? 24 * 60
    : effectiveEnd.getHours() * 60 + effectiveEnd.getMinutes();
  const durationMinutes = endMinutes - startMinutes;

  const top = ((startMinutes - startHour * 60) / 60) * hourHeight;
  const height = (durationMinutes / 60) * hourHeight;

  // Show original full time range in tooltip
  const origStart = new Date(block.start);
  const origEnd = new Date(block.end);
  const timeStr = `${origStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${origEnd.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

  return (
    <Tooltip content={`${block.title} · ${timeStr}`}>
      <div
        className={cn(
          "absolute px-1.5 py-1 overflow-hidden cursor-default",
          typeColors[block.type] || typeColors.focus,
          !block.committed && "opacity-60 border-dashed",
          // Continuation indicators
          isContinuationFromPreviousDay && "border-t-2 border-dashed border-t-[rgba(200,120,40,0.4)]",
          continuesToNextDay && "border-b-2 border-dashed border-b-[rgba(200,120,40,0.4)]",
          // Normal bottom separator only when not continuing
          !continuesToNextDay && "border-b border-b-[rgba(58,36,16,0.12)]"
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
          {isContinuationFromPreviousDay ? `↓ ${block.title}` : block.title}
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
