"use client";

import { cn } from "@/lib/utils";
import type { TimeBlock } from "@/lib/types";
import { TimeBlockComponent } from "./time-block";
import { assignOverlapColumns } from "@/lib/scheduler/overlap-layout";
import {
  type DisplaySegment,
  segmentsToTimeBlocks,
} from "@/lib/scheduler/cross-midnight";

interface DayColumnProps {
  dayLabel: string;
  dateLabel: string;
  segments: DisplaySegment[];
  hours: number[];
  hourHeight: number;
  startHour: number;
  isToday?: boolean;
}

export function DayColumn({
  dayLabel,
  dateLabel,
  segments,
  hours,
  hourHeight,
  startHour,
  isToday,
}: DayColumnProps) {
  // Convert segments to pseudo-TimeBlocks for overlap layout
  const pseudoBlocks = segmentsToTimeBlocks(segments);
  const layouts = assignOverlapColumns(pseudoBlocks);

  // Build a map from segmentId to segment for continuation flags
  const segmentMap = new Map(segments.map((s) => [s.segmentId, s]));

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
        {layouts.map(({ block: pseudoBlock, column, totalColumns }) => {
          const seg = segmentMap.get(pseudoBlock.id);
          return (
            <TimeBlockComponent
              key={pseudoBlock.id}
              block={seg?.block ?? pseudoBlock}
              hourHeight={hourHeight}
              startHour={startHour}
              column={column}
              totalColumns={totalColumns}
              displayStart={seg?.displayStart}
              displayEnd={seg?.displayEnd}
              isContinuationFromPreviousDay={seg?.isContinuationFromPreviousDay}
              continuesToNextDay={seg?.continuesToNextDay}
            />
          );
        })}
      </div>
    </div>
  );
}
