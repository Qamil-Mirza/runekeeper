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

  // Sort tasks by priority (high first), then by due date (earliest first)
  const sortedTasks = [...tasks]
    .filter((t) => t.status === "unscheduled")
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;

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

    // Determine the deadline for slot search
    const deadline = task.dueDate
      ? new Date(task.dueDate + "T23:59:59")
      : null;

    while (remainingMinutes > 0) {
      const blockMinutes = Math.min(
        remainingMinutes,
        preferences.maxBlockMinutes
      );

      const slot = findSlot(freeSlots, usedRanges, blockMinutes, deadline);

      if (!slot) {
        if (blockIndex === 0) {
          const reason = deadline
            ? `No available ${blockMinutes}-minute slot before ${task.dueDate}`
            : `No available ${blockMinutes}-minute slot this week`;
          unschedulable.push({ task, reason });
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
          blockIndex > 0 ? `${task.title} (${blockIndex + 1})` : task.title,
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
  durationMinutes: number,
  deadline: Date | null
): { start: Date; end: Date } | null {
  for (const slot of freeSlots) {
    // Skip slots that start after the deadline
    if (deadline && slot.start > deadline) continue;

    let candidateStart = new Date(slot.start);
    const slotEnd = deadline
      ? new Date(Math.min(slot.end.getTime(), deadline.getTime()))
      : slot.end;

    while (
      candidateStart.getTime() + durationMinutes * 60000 <=
      slotEnd.getTime()
    ) {
      const candidateEnd = new Date(candidateStart);
      candidateEnd.setMinutes(candidateEnd.getMinutes() + durationMinutes);

      const conflict = usedRanges.some(
        (used) => candidateStart < used.end && candidateEnd > used.start
      );

      if (!conflict) {
        return { start: candidateStart, end: candidateEnd };
      }

      const overlapping = usedRanges.find(
        (used) => candidateStart < used.end && candidateEnd > used.start
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
  if (
    lower.includes("gym") ||
    lower.includes("run") ||
    lower.includes("workout") ||
    lower.includes("exercise")
  )
    return "personal";
  if (
    lower.includes("lunch") ||
    lower.includes("dinner") ||
    lower.includes("breakfast") ||
    lower.includes("coffee") ||
    lower.includes("movie") ||
    lower.includes("break")
  )
    return "personal";
  if (lower.includes("admin") || lower.includes("email")) return "admin";
  if (lower.includes("class") || lower.includes("lecture")) return "class";
  return "focus";
}
