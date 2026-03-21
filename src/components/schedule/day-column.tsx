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
    <div className="flex-1 min-w-0">
      {/* Day header */}
      <div className={cn("text-center py-2 sticky top-0 z-10", isToday ? "bg-tertiary/8" : "bg-surface-container-low")}>
        <span className="font-label text-label-sm uppercase tracking-wide text-on-surface-variant block">
          {dayLabel}
        </span>
        <span className={cn("font-label text-label-md font-medium", isToday ? "text-tertiary" : "text-on-surface")}>
          {dateLabel}
        </span>
      </div>

      {/* Hour slots */}
      <div className="relative" style={{ height: `${hours.length * hourHeight}px` }}>
        {/* AM/PM tonal shift */}
        {hours.map((hour, i) => (
          <div
            key={hour}
            className={cn(
              "absolute left-0 right-0",
              hour < 12 ? "bg-transparent" : "bg-surface-container/30"
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
