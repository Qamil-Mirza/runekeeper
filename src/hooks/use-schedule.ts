"use client";

import { useState, useMemo } from "react";
import type { TimeBlock, WeekRange } from "@/lib/types";
import { mockSchedule } from "@/lib/mock-schedule";

function getWeekRange(date: Date): WeekRange {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split("T")[0],
    end: sunday.toISOString().split("T")[0],
  };
}

export function useSchedule() {
  const [blocks, setBlocks] = useState<TimeBlock[]>(mockSchedule);
  const [weekRange, setWeekRange] = useState<WeekRange>(
    getWeekRange(new Date("2026-03-23"))
  );

  const weekBlocks = useMemo(() => {
    const start = new Date(weekRange.start);
    const end = new Date(weekRange.end);
    end.setDate(end.getDate() + 1); // include Sunday
    return blocks.filter((b) => {
      const bs = new Date(b.start);
      return bs >= start && bs < end;
    });
  }, [blocks, weekRange]);

  const navigateWeek = (direction: -1 | 1) => {
    const current = new Date(weekRange.start);
    current.setDate(current.getDate() + direction * 7);
    setWeekRange(getWeekRange(current));
  };

  return { blocks: weekBlocks, weekRange, navigateWeek, setBlocks };
}
