// src/lib/scheduler/cross-midnight.ts
import type { TimeBlock } from "@/lib/types";
import { isoToLocalDate } from "@/lib/utils";

export interface DisplaySegment {
  block: TimeBlock;
  segmentId: string;
  displayStart: string;
  displayEnd: string;
  isContinuationFromPreviousDay: boolean;
  continuesToNextDay: boolean;
}

/**
 * Split cross-midnight blocks into day-scoped display segments.
 * Non-crossing blocks pass through as-is.
 */
export function splitCrossMidnightBlocks(
  blocks: TimeBlock[],
  dateStr: string
): DisplaySegment[] {
  const segments: DisplaySegment[] = [];

  for (const block of blocks) {
    const startDate = isoToLocalDate(block.start);
    const endDate = isoToLocalDate(block.end);

    // Same-day block on the target date
    if (startDate === endDate) {
      if (startDate === dateStr) {
        segments.push({
          block,
          segmentId: block.id,
          displayStart: block.start,
          displayEnd: block.end,
          isContinuationFromPreviousDay: false,
          continuesToNextDay: false,
        });
      }
      continue;
    }

    // Cross-midnight block: start day segment
    if (startDate === dateStr) {
      segments.push({
        block,
        segmentId: `${block.id}__start`,
        displayStart: block.start,
        displayEnd: `${dateStr}T23:59:59`,
        isContinuationFromPreviousDay: false,
        continuesToNextDay: true,
      });
    }

    // Cross-midnight block: end day segment
    if (endDate === dateStr) {
      // Skip zero-length segments (block ends exactly at midnight)
      const endTime = new Date(block.end);
      if (endTime.getHours() === 0 && endTime.getMinutes() === 0 && endTime.getSeconds() === 0) {
        continue;
      }
      segments.push({
        block,
        segmentId: `${block.id}__end`,
        displayStart: `${dateStr}T00:00:00`,
        displayEnd: block.end,
        isContinuationFromPreviousDay: true,
        continuesToNextDay: false,
      });
    }

    // Multi-day span: block covers the entire target date
    if (startDate < dateStr && endDate > dateStr) {
      segments.push({
        block,
        segmentId: `${block.id}__mid`,
        displayStart: `${dateStr}T00:00:00`,
        displayEnd: `${dateStr}T23:59:59`,
        isContinuationFromPreviousDay: true,
        continuesToNextDay: true,
      });
    }
  }

  return segments.sort((a, b) => a.displayStart.localeCompare(b.displayStart));
}

/**
 * Convert display segments to pseudo-TimeBlocks for use with assignOverlapColumns().
 * Uses segmentId as the block ID to avoid duplicates.
 */
export function segmentsToTimeBlocks(segments: DisplaySegment[]): TimeBlock[] {
  return segments.map((seg) => ({
    ...seg.block,
    id: seg.segmentId,
    start: seg.displayStart,
    end: seg.displayEnd,
  }));
}

/**
 * Check if a block spans midnight.
 */
export function isCrossMidnight(block: TimeBlock): boolean {
  return isoToLocalDate(block.start) !== isoToLocalDate(block.end);
}
