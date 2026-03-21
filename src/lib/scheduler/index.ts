import type {
  Task,
  TimeBlock,
  SchedulerInput,
  SchedulerOutput,
  BlockType,
} from "@/lib/types";
import { buildFreeTimeMap, type FreeSlot } from "./free-time";

export function schedule(input: SchedulerInput): SchedulerOutput {
  const { tasks, busyWindows, preferences, weekRange } = input;

  // Build free time map
  const freeSlots = buildFreeTimeMap(weekRange, busyWindows, preferences);

  // Sort tasks by priority (P0 first), then by due date (earliest first)
  const sortedTasks = [...tasks]
    .filter((t) => t.status === "unscheduled")
    .sort((a, b) => {
      const priorityOrder = { P0: 0, P1: 1, P2: 2 };
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;

      // Earlier due dates first
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

  const proposedBlocks: TimeBlock[] = [];
  const unschedulable: { task: Task; reason: string }[] = [];

  // Track used time ranges to avoid double-booking
  const usedRanges: { start: Date; end: Date }[] = [];

  for (const task of sortedTasks) {
    let remainingMinutes = task.estimateMinutes;
    let blockIndex = 0;

    while (remainingMinutes > 0) {
      const blockMinutes = Math.min(
        remainingMinutes,
        preferences.maxBlockMinutes
      );

      const slot = findSlot(freeSlots, usedRanges, blockMinutes);

      if (!slot) {
        if (blockIndex === 0) {
          unschedulable.push({
            task,
            reason: `No available ${blockMinutes}-minute slot in working hours`,
          });
        } else {
          unschedulable.push({
            task,
            reason: `Could only schedule ${task.estimateMinutes - remainingMinutes} of ${task.estimateMinutes} minutes`,
          });
        }
        break;
      }

      const blockStart = new Date(slot.start);
      const blockEnd = new Date(blockStart);
      blockEnd.setMinutes(blockEnd.getMinutes() + blockMinutes);

      const block: TimeBlock = {
        id: `proposed-${task.id}-${blockIndex}`,
        taskId: task.id,
        title:
          blockIndex > 0
            ? `${task.title} (${blockIndex + 1})`
            : task.title,
        start: blockStart.toISOString(),
        end: blockEnd.toISOString(),
        type: inferBlockType(task),
        committed: false,
      };

      proposedBlocks.push(block);
      usedRanges.push({ start: blockStart, end: blockEnd });

      remainingMinutes -= blockMinutes;
      blockIndex++;
    }
  }

  return { proposedBlocks, unschedulable };
}

function findSlot(
  freeSlots: FreeSlot[],
  usedRanges: { start: Date; end: Date }[],
  durationMinutes: number
): { start: Date; end: Date } | null {
  for (const slot of freeSlots) {
    // Try to find a gap within this free slot
    let candidateStart = new Date(slot.start);

    while (candidateStart.getTime() + durationMinutes * 60000 <= slot.end.getTime()) {
      const candidateEnd = new Date(candidateStart);
      candidateEnd.setMinutes(candidateEnd.getMinutes() + durationMinutes);

      // Check if this candidate overlaps with any used range
      const conflict = usedRanges.some(
        (used) =>
          candidateStart < used.end && candidateEnd > used.start
      );

      if (!conflict) {
        return { start: candidateStart, end: candidateEnd };
      }

      // Move past the conflicting range
      const overlapping = usedRanges.find(
        (used) =>
          candidateStart < used.end && candidateEnd > used.start
      );
      if (overlapping) {
        candidateStart = new Date(overlapping.end);
      } else {
        break;
      }
    }
  }

  return null;
}

function inferBlockType(task: Task): BlockType {
  const lower = task.title.toLowerCase();
  if (lower.includes("meeting") || lower.includes("call")) return "meeting";
  if (lower.includes("gym") || lower.includes("lunch") || lower.includes("break"))
    return "personal";
  if (lower.includes("admin") || lower.includes("email")) return "admin";
  if (lower.includes("class") || lower.includes("lecture")) return "class";
  return "focus";
}
