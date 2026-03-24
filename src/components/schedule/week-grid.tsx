"use client";

import { useMemo } from "react";
import type { TimeBlock } from "@/lib/types";
import { usePlanner } from "@/context/planner-context";
import { ScheduleHeader } from "./schedule-header";
import { DayColumn } from "./day-column";

const START_HOUR = 8;
const END_HOUR = 20;
const HOUR_HEIGHT = 48;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function WeekGrid() {
  const { blocks, weekRange, navigateWeek } = usePlanner();

  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i),
    []
  );

  const dayDates = useMemo(() => {
    const start = new Date(weekRange.start + "T00:00:00");
    return DAYS.map((label, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return {
        label,
        date: d.getDate().toString(),
        fullDate: d.toISOString().split("T")[0],
      };
    });
  }, [weekRange]);

  const weekBlocks = useMemo(() => {
    const start = new Date(weekRange.start);
    const end = new Date(weekRange.end);
    end.setDate(end.getDate() + 1);
    return blocks.filter((b) => {
      const bs = new Date(b.start);
      return bs >= start && bs < end;
    });
  }, [blocks, weekRange]);

  const blocksByDay = useMemo(() => {
    const map: Record<string, TimeBlock[]> = {};
    for (const dd of dayDates) {
      map[dd.fullDate] = [];
    }
    for (const block of weekBlocks) {
      const day = block.start.split("T")[0];
      if (map[day]) {
        map[day].push(block);
      }
    }
    return map;
  }, [weekBlocks, dayDates]);

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="flex flex-col paper-grain bg-surface-container parchment-context">
      <ScheduleHeader weekRange={weekRange} onNavigate={navigateWeek} />
      <div className="overflow-x-auto archivist-scroll">
        <div className="flex min-w-[560px]">
          <div className="w-10 shrink-0 pt-[52px] border-r border-[rgba(58,36,16,0.15)]">
            {hours.map((hour) => (
              <div
                key={hour}
                className="font-label text-[10px] text-[#6b5030] text-right pr-1.5 leading-none border-b border-[rgba(58,36,16,0.08)]"
                style={{ height: `${HOUR_HEIGHT}px` }}
              >
                {hour === 12 ? "12p" : hour > 12 ? `${hour - 12}p` : `${hour}a`}
              </div>
            ))}
          </div>
          {dayDates.map((dd) => (
            <DayColumn
              key={dd.fullDate}
              dayLabel={dd.label}
              dateLabel={dd.date}
              blocks={blocksByDay[dd.fullDate] || []}
              hours={hours}
              hourHeight={HOUR_HEIGHT}
              startHour={START_HOUR}
              isToday={dd.fullDate === today}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
