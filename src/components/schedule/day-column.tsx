"use client";

import { cn } from "@/lib/utils";
import type { TimeBlock } from "@/lib/types";
import { TimeBlockComponent } from "./time-block";

interface DayColumnProps {
  dayLabel: string;
  dateLabel: string;
  blocks: TimeBlock[];
  hours: number[];
  hourHeight: number;
  startHour: number;
  isToday?: boolean;
}

export function DayColumn({
  dayLabel,
  dateLabel,
  blocks,
  hours,
  hourHeight,
  startHour,
  isToday,
}: DayColumnProps) {
  return (
    <div className="flex-1 min-w-0 border-l border-[rgba(58,36,16,0.15)]">
      {/* Day header */}
      <div className={cn("text-center py-2.5 sticky top-0 z-10 border-b-2 border-[rgba(58,36,16,0.18)]", isToday ? "bg-[rgba(200,120,40,0.08)]" : "bg-[#e8d0a5]")}>
        <span className="font-label text-[11px] font-bold uppercase tracking-[1.5px] text-[#3a2410] block">
          {dayLabel}
        </span>
        <span className={cn("font-label text-label-md font-medium", isToday ? "text-[#c87828]" : "text-[#3a2410]")}>
          {dateLabel}
        </span>
      </div>

      {/* Hour slots */}
      <div className="relative" style={{ height: `${hours.length * hourHeight}px` }}>
        {/* Hour grid lines */}
        {hours.map((hour, i) => (
          <div
            key={hour}
            className={cn(
              "absolute left-0 right-0 border-b border-[rgba(58,36,16,0.08)]",
              hour >= 12 ? "bg-[rgba(58,36,16,0.04)]" : "bg-transparent"
            )}
            style={{ top: `${i * hourHeight}px`, height: `${hourHeight}px` }}
          />
        ))}

        {/* Time blocks */}
        {blocks.map((block) => (
          <TimeBlockComponent
            key={block.id}
            block={block}
            hourHeight={hourHeight}
            startHour={startHour}
          />
        ))}
      </div>
    </div>
  );
}
