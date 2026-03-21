"use client";

import type { WeekRange } from "@/lib/types";

interface ScheduleHeaderProps {
  weekRange: WeekRange;
  onNavigate: (direction: -1 | 1) => void;
}

export function ScheduleHeader({ weekRange, onNavigate }: ScheduleHeaderProps) {
  const start = new Date(weekRange.start + "T00:00:00");
  const end = new Date(weekRange.end + "T00:00:00");

  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="flex items-center justify-between px-5 pb-3">
      <button
        onClick={() => onNavigate(-1)}
        className="p-1.5 text-on-surface-variant hover:text-on-surface transition-colors duration-200"
        aria-label="Previous week"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <span className="font-label text-label-md font-medium text-on-surface tracking-wide">
        {formatDate(start)} — {formatDate(end)}
      </span>

      <button
        onClick={() => onNavigate(1)}
        className="p-1.5 text-on-surface-variant hover:text-on-surface transition-colors duration-200"
        aria-label="Next week"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}
