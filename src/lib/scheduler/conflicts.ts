import type { TimeBlock } from "@/lib/types";

export interface Conflict {
  proposed: TimeBlock;
  existing: TimeBlock;
  overlapMinutes: number;
}

export function detectConflicts(
  proposed: TimeBlock[],
  existing: TimeBlock[]
): Conflict[] {
  const conflicts: Conflict[] = [];

  for (const p of proposed) {
    const pStart = new Date(p.start);
    const pEnd = new Date(p.end);

    for (const e of existing) {
      const eStart = new Date(e.start);
      const eEnd = new Date(e.end);

      // Check overlap: A.start < B.end && B.start < A.end
      if (pStart < eEnd && eStart < pEnd) {
        const overlapStart = pStart > eStart ? pStart : eStart;
        const overlapEnd = pEnd < eEnd ? pEnd : eEnd;
        const overlapMinutes =
          (overlapEnd.getTime() - overlapStart.getTime()) / 60000;

        conflicts.push({
          proposed: p,
          existing: e,
          overlapMinutes,
        });
      }
    }
  }

  return conflicts;
}

export function findAlternativeSlot(
  conflicting: TimeBlock,
  existingBlocks: TimeBlock[]
): { start: string; end: string } | null {
  const blockDuration =
    new Date(conflicting.end).getTime() - new Date(conflicting.start).getTime();
  const day = new Date(conflicting.start).toISOString().split("T")[0];

  // Try slots after the conflicting block on the same day
  const dayBlocks = existingBlocks
    .filter((b) => b.start.startsWith(day))
    .sort((a, b) => a.start.localeCompare(b.start));

  const dayEnd = new Date(day + "T23:59:59");

  for (let i = 0; i < dayBlocks.length; i++) {
    const gapStart = new Date(dayBlocks[i].end);
    const gapEnd =
      i + 1 < dayBlocks.length
        ? new Date(dayBlocks[i + 1].start)
        : dayEnd;

    if (gapEnd.getTime() - gapStart.getTime() >= blockDuration) {
      return {
        start: gapStart.toISOString(),
        end: new Date(gapStart.getTime() + blockDuration).toISOString(),
      };
    }
  }

  return null;
}
