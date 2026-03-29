import type { TimeBlock, WeekRange } from "@/lib/types";
import { toDateStrInTimezone } from "@/lib/utils";

export interface FreeSlot {
  start: Date;
  end: Date;
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat (JS convention)
}

export function buildFreeTimeMap(
  weekRange: WeekRange,
  busyWindows: TimeBlock[],
  preferences: {
    maxBlockMinutes: number;
    meetingBuffer: number;
  },
  timezone?: string
): FreeSlot[] {
  const freeSlots: FreeSlot[] = [];
  const now = new Date();

  // Generate slots for all 7 days of the week (Mon–Sun)
  const weekStart = new Date(weekRange.start + "T00:00:00");

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + dayOffset);

    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);

    // Skip if the entire day is in the past
    if (dayEnd <= now) continue;

    // Start with the full day as free
    let intervals: { start: Date; end: Date }[] = [
      { start: new Date(dayStart), end: new Date(dayEnd) },
    ];

    // Clip today's slots to start from now (don't schedule in the past)
    if (day.toDateString() === now.toDateString()) {
      intervals = intervals
        .map((interval) => ({
          start: interval.start < now ? new Date(now) : interval.start,
          end: interval.end,
        }))
        .filter((interval) => interval.start < interval.end);
    }

    // Subtract busy windows (with meeting buffer)
    const dayStr = timezone
      ? toDateStrInTimezone(day, timezone)
      : day.toISOString().split("T")[0];
    const dayBusy = busyWindows.filter((b) => {
      const bStart = new Date(b.start);
      const bEnd = new Date(b.end);
      const bStartDay = timezone
        ? toDateStrInTimezone(bStart, timezone)
        : bStart.toISOString().split("T")[0];
      const bEndDay = timezone
        ? toDateStrInTimezone(bEnd, timezone)
        : bEnd.toISOString().split("T")[0];
      return bStartDay === dayStr || bEndDay === dayStr;
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
        freeSlots.push({
          start: interval.start,
          end: interval.end,
          dayOfWeek: day.getDay(),
        });
      }
    }
  }

  return freeSlots;
}

/**
 * Merge free slots that are adjacent across midnight boundaries.
 * If day N's last slot ends at 23:59:59.999 and day N+1's first slot
 * starts at 00:00:00.000, merge them into one continuous slot.
 */
export function mergeCrossDaySlots(slots: FreeSlot[]): FreeSlot[] {
  if (slots.length <= 1) return slots;

  const sorted = [...slots].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );

  const merged: FreeSlot[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];

    // Check if slots are adjacent (within 1 second gap at midnight boundary)
    const gap = curr.start.getTime() - prev.end.getTime();
    if (gap <= 1000) {
      // Merge: extend the previous slot's end
      prev.end = curr.end;
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}

function subtractInterval(
  intervals: { start: Date; end: Date }[],
  removeStart: Date,
  removeEnd: Date
): { start: Date; end: Date }[] {
  const result: { start: Date; end: Date }[] = [];

  for (const interval of intervals) {
    if (removeEnd <= interval.start || removeStart >= interval.end) {
      result.push(interval);
    } else {
      if (removeStart > interval.start) {
        result.push({ start: interval.start, end: new Date(removeStart) });
      }
      if (removeEnd < interval.end) {
        result.push({ start: new Date(removeEnd), end: interval.end });
      }
    }
  }

  return result;
}
