import type { TimeBlock, WeekRange } from "@/lib/types";

export interface FreeSlot {
  start: Date;
  end: Date;
  dayOfWeek: number; // 0=Mon, 1=Tue, ..., 6=Sun
}

export function buildFreeTimeMap(
  weekRange: WeekRange,
  busyWindows: TimeBlock[],
  preferences: {
    workingHoursStart: number;
    workingHoursEnd: number;
    lunchDurationMinutes: number;
    maxBlockMinutes: number;
    meetingBuffer: number;
  }
): FreeSlot[] {
  const freeSlots: FreeSlot[] = [];

  // Generate working hour slots for each weekday (Mon-Fri)
  const weekStart = new Date(weekRange.start + "T00:00:00");

  for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + dayOffset);

    const dayStart = new Date(day);
    dayStart.setHours(preferences.workingHoursStart, 0, 0, 0);

    const dayEnd = new Date(day);
    dayEnd.setHours(preferences.workingHoursEnd, 0, 0, 0);

    // Start with the full working day as free
    let intervals: { start: Date; end: Date }[] = [
      { start: new Date(dayStart), end: new Date(dayEnd) },
    ];

    // Subtract lunch break (centered in the working day)
    if (preferences.lunchDurationMinutes > 0) {
      const midpoint =
        preferences.workingHoursStart +
        (preferences.workingHoursEnd - preferences.workingHoursStart) / 2;
      const lunchStart = new Date(day);
      lunchStart.setHours(Math.floor(midpoint), (midpoint % 1) * 60, 0, 0);
      const lunchEnd = new Date(lunchStart);
      lunchEnd.setMinutes(
        lunchEnd.getMinutes() + preferences.lunchDurationMinutes
      );

      intervals = subtractInterval(intervals, lunchStart, lunchEnd);
    }

    // Subtract busy windows (with meeting buffer)
    const dayBusy = busyWindows.filter((b) => {
      const bStart = new Date(b.start);
      return (
        bStart.toISOString().split("T")[0] ===
        day.toISOString().split("T")[0]
      );
    });

    for (const busy of dayBusy) {
      const bStart = new Date(busy.start);
      const bEnd = new Date(busy.end);

      // Add meeting buffer
      if (
        preferences.meetingBuffer > 0 &&
        (busy.type === "meeting" || busy.type === "class")
      ) {
        bStart.setMinutes(bStart.getMinutes() - preferences.meetingBuffer);
        bEnd.setMinutes(bEnd.getMinutes() + preferences.meetingBuffer);
      }

      intervals = subtractInterval(intervals, bStart, bEnd);
    }

    // Add remaining intervals as free slots
    for (const interval of intervals) {
      const durationMinutes =
        (interval.end.getTime() - interval.start.getTime()) / 60000;
      if (durationMinutes >= 15) {
        // Minimum 15-minute slot
        freeSlots.push({
          start: interval.start,
          end: interval.end,
          dayOfWeek: dayOffset,
        });
      }
    }
  }

  return freeSlots;
}

function subtractInterval(
  intervals: { start: Date; end: Date }[],
  removeStart: Date,
  removeEnd: Date
): { start: Date; end: Date }[] {
  const result: { start: Date; end: Date }[] = [];

  for (const interval of intervals) {
    if (removeEnd <= interval.start || removeStart >= interval.end) {
      // No overlap
      result.push(interval);
    } else {
      // Before the removal
      if (removeStart > interval.start) {
        result.push({ start: interval.start, end: new Date(removeStart) });
      }
      // After the removal
      if (removeEnd < interval.end) {
        result.push({ start: new Date(removeEnd), end: interval.end });
      }
    }
  }

  return result;
}
