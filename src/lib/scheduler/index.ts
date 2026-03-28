import type {
  Task,
  TimeBlock,
  SchedulerInput,
  SchedulerOutput,
  BlockType,
} from "@/lib/types";
import { buildFreeTimeMap, type FreeSlot } from "./free-time";

export function schedule(input: SchedulerInput): SchedulerOutput {
  const { tasks, busyWindows, preferences, weekRange, startAfter } = input;

  // Build free time map
  const freeSlots = buildFreeTimeMap(weekRange, busyWindows, preferences);

  // If startAfter is set, clamp all free slots so nothing starts before that time
  const startAfterDate = startAfter ? new Date(startAfter) : null;
  if (startAfterDate) {
    for (const slot of freeSlots) {
      if (slot.start < startAfterDate) {
        slot.start = new Date(Math.max(slot.start.getTime(), startAfterDate.getTime()));
      }
    }
    // Remove slots that are now empty (start >= end)
    freeSlots.splice(0, freeSlots.length, ...freeSlots.filter(s => s.start < s.end));
  }

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

export function inferBlockType(task: Pick<Task, "title">): BlockType {
  const lower = task.title.toLowerCase();
  if (lower.includes("meeting") || lower.includes("call") || lower.includes("standup") || lower.includes("sync"))
    return "meeting";
  if (lower.includes("class") || lower.includes("lecture") || lower.includes("seminar"))
    return "class";
  if (lower.includes("admin") || lower.includes("email") || lower.includes("invoice") || lower.includes("paperwork"))
    return "admin";
  // Personal: exercise, leisure, errands, social, food
  if (
    lower.includes("gym") ||
    lower.includes("run") ||
    lower.includes("workout") ||
    lower.includes("exercise") ||
    lower.includes("lunch") ||
    lower.includes("dinner") ||
    lower.includes("breakfast") ||
    lower.includes("coffee") ||
    lower.includes("movie") ||
    lower.includes("break") ||
    lower.includes("gaming") ||
    lower.includes("game") ||
    lower.includes("play") ||
    lower.includes("cook") ||
    lower.includes("recipe") ||
    lower.includes("clean") ||
    lower.includes("laundry") ||
    lower.includes("grocery") ||
    lower.includes("shop") ||
    lower.includes("errand") ||
    lower.includes("walk") ||
    lower.includes("hike") ||
    lower.includes("yoga") ||
    lower.includes("meditat") ||
    lower.includes("nap") ||
    lower.includes("read for fun") ||
    lower.includes("hangout") ||
    lower.includes("party") ||
    lower.includes("date")
  )
    return "personal";
  return "focus";
}
