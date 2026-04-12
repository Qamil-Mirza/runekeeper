import { db } from "@/db";
import { tasks, timeBlocks, planSessions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { schedule } from "@/lib/scheduler";
import { generateDiff } from "@/lib/scheduler/diff";
import { dbTaskToTask, dbBlockToTimeBlock, type Task, type TimeBlock, type BlockType } from "@/lib/types";
import { inferBlockType } from "@/lib/scheduler";
import { createLogger } from "@/lib/logger";

const log = createLogger("action-handler");

const VALID_PRIORITIES = ["high", "medium", "low"];
const VALID_BLOCK_TYPES: BlockType[] = ["focus", "admin", "personal", "meeting", "class"];

function sanitizeTaskDef(def: any): {
  title: string;
  notes: string | null;
  priority: string;
  estimateMinutes: number;
  dueDate: string | null;
  startTime: string | null;
  blockType: BlockType;
} | null {
  if (!def || typeof def.title !== "string" || def.title.trim().length === 0) return null;
  const title = def.title.trim().slice(0, 500);
  return {
    title,
    notes: typeof def.notes === "string" ? def.notes.slice(0, 500) : null,
    priority: VALID_PRIORITIES.includes(def.priority) ? def.priority : "medium",
    estimateMinutes:
      typeof def.estimateMinutes === "number" && def.estimateMinutes > 0
        ? Math.min(Math.round(def.estimateMinutes), 1440)
        : 30,
    dueDate: typeof def.dueDate === "string" ? def.dueDate : null,
    startTime: typeof def.startTime === "string" ? def.startTime : null,
    blockType: VALID_BLOCK_TYPES.includes(def.blockType) ? def.blockType : inferBlockType({ title }),
  };
}

/**
 * Parse a naive ISO datetime string (e.g. "2026-03-22T09:00:00") as local time
 * in the given IANA timezone. Without this, new Date() treats it as UTC.
 */
function parseNaiveDateTime(isoString: string, timezone?: string): Date {
  // If already has timezone info (Z or +/-offset), parse directly
  if (/[Zz]$/.test(isoString) || /[+-]\d{2}:\d{2}$/.test(isoString)) {
    return new Date(isoString);
  }

  if (!timezone) {
    // No timezone available — fall back to treating as UTC (legacy behavior)
    return new Date(isoString);
  }

  // Use Intl to find the UTC offset for this timezone at the given date/time.
  // Parse the naive string parts, construct a date in the target timezone.
  const [datePart, timePart] = isoString.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = (timePart || "00:00:00").split(":").map(Number);

  // Create a rough UTC date to find the timezone offset
  const roughUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));

  // Get the offset by formatting in the target timezone and comparing
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(roughUtc);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);

  const tzYear = get("year");
  const tzMonth = get("month");
  const tzDay = get("day");
  const tzHour = get("hour") === 24 ? 0 : get("hour");
  const tzMinute = get("minute");
  const tzSecond = get("second");

  // The offset (in ms) is: what UTC time produces these local values?
  const localAsUtc = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond);
  const offsetMs = localAsUtc - roughUtc.getTime();

  // The desired UTC time = naive local time - offset
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0) - offsetMs);
}

export interface ActionResult {
  tasksCreated?: Task[];
  proposedBlocks?: TimeBlock[];
  unschedulable?: { task: Task; reason: string }[];
  diff?: any;
  committed?: boolean;
  error?: string;
}

export async function handleAction(
  action: any,
  userId: string,
  weekStart: string,
  weekEnd: string,
  pinnedBlockIds?: Set<string>,
  timezone?: string
): Promise<ActionResult> {
  log.info({ actionType: action.type, userId }, "executing action");

  switch (action.type) {
    case "create_tasks":
      return handleCreateTasks(action.tasks, userId, timezone);
    case "generate_schedule":
      return handleGenerateSchedule(userId, weekStart, weekEnd, pinnedBlockIds, action.startAfter, timezone);
    case "confirm_plan":
      return handleConfirmPlan(userId);
    case "adjust_block":
      return handleAdjustBlock(action, userId, weekStart, weekEnd, timezone);
    default:
      log.warn({ actionType: action.type }, "unknown action type");
      return { error: `Unknown action type: ${action.type}` };
  }
}

async function handleCreateTasks(
  taskDefs: any[],
  userId: string,
  timezone?: string
): Promise<ActionResult> {
  if (!Array.isArray(taskDefs)) return { error: "No valid tasks provided" };

  const validDefs = taskDefs.map(sanitizeTaskDef).filter(Boolean) as NonNullable<
    ReturnType<typeof sanitizeTaskDef>
  >[];
  if (validDefs.length === 0) return { error: "No valid tasks provided" };

  const created: Task[] = [];
  const proposedBlocks: TimeBlock[] = [];

  // Load existing tasks to prevent duplicates (LLM may re-create a task it already made)
  const existingTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId));

  for (const def of validDefs) {
    // Check if a task with the same title already exists (case-insensitive)
    const duplicate = existingTasks.find(
      (t) => t.title.toLowerCase() === (def.title || "").toLowerCase()
    );

    if (duplicate) {
      log.info({ taskTitle: duplicate.title }, "duplicate task found, reusing existing");

      // Update task fields if the new def differs (e.g. LLM changed estimate)
      const taskUpdates: Record<string, any> = {};
      if (def.estimateMinutes !== duplicate.estimateMinutes) {
        taskUpdates.estimateMinutes = def.estimateMinutes;
      }
      if (def.priority !== duplicate.priority) {
        taskUpdates.priority = def.priority;
      }
      if (def.dueDate && def.dueDate !== duplicate.dueDate) {
        taskUpdates.dueDate = def.dueDate;
      }
      if (Object.keys(taskUpdates).length > 0) {
        await db
          .update(tasks)
          .set({ ...taskUpdates, updatedAt: new Date() })
          .where(eq(tasks.id, duplicate.id));
      }

      const existingTask = dbTaskToTask({
        ...duplicate,
        ...taskUpdates,
      });

      // Still create a time block if the request has a specific time and
      // the existing task doesn't already have one at that time
      if (def.startTime) {
        const existingBlocksForTask = await db
          .select()
          .from(timeBlocks)
          .where(and(eq(timeBlocks.userId, userId), eq(timeBlocks.taskId, existingTask.id)));

        const startTime = parseNaiveDateTime(def.startTime, timezone);
        const alreadyHasBlock = existingBlocksForTask.some(
          (b) => Math.abs(new Date(b.startTime).getTime() - startTime.getTime()) < 60_000
        );

        if (!alreadyHasBlock) {
          const endTime = new Date(
            startTime.getTime() + (def.estimateMinutes ?? duplicate.estimateMinutes ?? 30) * 60_000
          );

          const [blockRow] = await db
            .insert(timeBlocks)
            .values({
              userId,
              taskId: existingTask.id,
              title: existingTask.title,
              startTime,
              endTime,
              blockType: def.blockType,
              committed: false,
            })
            .returning();

          // Update task status to scheduled
          await db
            .update(tasks)
            .set({ status: "scheduled", updatedAt: new Date() })
            .where(eq(tasks.id, existingTask.id));

          proposedBlocks.push(dbBlockToTimeBlock(blockRow));
        }
      }

      // Include the existing task in the result so the UI reflects it
      created.push(existingTask);
      continue;
    }

    const hasSpecificTime = !!def.startTime;

    const [row] = await db
      .insert(tasks)
      .values({
        userId,
        title: def.title,
        notes: def.notes ? def.notes.slice(0, 500) : null,
        priority: def.priority ?? "medium",
        estimateMinutes: def.estimateMinutes ?? 30,
        dueDate: def.dueDate ?? null,
        status: hasSpecificTime ? "scheduled" : "unscheduled",
      })
      .returning();

    const task = dbTaskToTask(row);
    created.push(task);

    // If a specific start time was provided, create a time block at that time
    if (hasSpecificTime && def.startTime) {
      // The LLM sends naive ISO strings like "2026-03-22T09:00:00" (no timezone).
      // new Date() would parse this as UTC, but it's meant as the user's local time.
      // Append the timezone offset so the Date is constructed correctly.
      const startTime = parseNaiveDateTime(def.startTime, timezone);
      const endTime = new Date(startTime.getTime() + (def.estimateMinutes ?? 30) * 60_000);

      const [blockRow] = await db
        .insert(timeBlocks)
        .values({
          userId,
          taskId: task.id,
          title: task.title,
          startTime,
          endTime,
          blockType: def.blockType,
          committed: false,
        })
        .returning();

      proposedBlocks.push(dbBlockToTimeBlock(blockRow));
    }
  }

  return {
    tasksCreated: created,
    ...(proposedBlocks.length > 0 ? { proposedBlocks } : {}),
  };
}

async function handleGenerateSchedule(
  userId: string,
  weekStart: string,
  weekEnd: string,
  pinnedBlockIds?: Set<string>,
  startAfter?: string,
  timezone?: string
): Promise<ActionResult> {
  const preferences = { maxBlockMinutes: 120, meetingBuffer: 10 };

  // Load tasks and existing blocks
  const userTasks = (
    await db.select().from(tasks).where(eq(tasks.userId, userId))
  ).map(dbTaskToTask);

  const existingBlocks = (
    await db.select().from(timeBlocks).where(eq(timeBlocks.userId, userId))
  ).map(dbBlockToTimeBlock);

  // Find uncommitted Runekeeper blocks to delete (but preserve pinned blocks
  // created by create_tasks in the same action batch)
  const uncommittedBlocks = existingBlocks.filter(
    (b) =>
      !b.committed &&
      b.source !== "google_calendar" &&
      !(pinnedBlockIds && pinnedBlockIds.has(b.id))
  );

  // Only reset tasks that DON'T already have a committed block —
  // tasks with committed blocks should stay "scheduled", not be re-proposed
  for (const block of uncommittedBlocks) {
    if (block.taskId) {
      const hasCommittedBlock = existingBlocks.some(
        (b) => b.taskId === block.taskId && b.committed
      );
      if (!hasCommittedBlock) {
        await db
          .update(tasks)
          .set({ status: "unscheduled", updatedAt: new Date() })
          .where(eq(tasks.id, block.taskId));
      }
    }
  }

  // Delete existing uncommitted Runekeeper blocks (preserve Google Calendar imports + pinned)
  for (const block of uncommittedBlocks) {
    await db.delete(timeBlocks).where(eq(timeBlocks.id, block.id));
  }

  // Reload tasks after status reset so the scheduler sees them as unscheduled
  const refreshedTasks = (
    await db.select().from(tasks).where(eq(tasks.userId, userId))
  ).map(dbTaskToTask);

  // Pinned blocks (from create_tasks with specific times) act as busy windows too
  const pinnedBlocks = existingBlocks.filter(
    (b) => pinnedBlockIds && pinnedBlockIds.has(b.id)
  );
  const busyWindows = [
    ...existingBlocks.filter((b) => b.committed),
    ...pinnedBlocks,
  ];

  // Run scheduler
  const result = schedule({
    tasks: refreshedTasks,
    busyWindows,
    preferences,
    weekRange: { start: weekStart, end: weekEnd },
    ...(startAfter ? { startAfter } : {}),
    timezone,
  });

  // Combine pinned blocks + scheduler output for the full proposal
  const allProposed = [...pinnedBlocks, ...result.proposedBlocks];

  // Persist proposed blocks (only scheduler-generated ones; pinned already exist)
  for (const block of result.proposedBlocks) {
    await db.insert(timeBlocks).values({
      userId,
      taskId: block.taskId || null,
      title: block.title,
      startTime: new Date(block.start),
      endTime: new Date(block.end),
      blockType: block.type,
      committed: false,
    });
  }

  // Update task statuses
  for (const block of result.proposedBlocks) {
    if (block.taskId) {
      await db
        .update(tasks)
        .set({ status: "scheduled", updatedAt: new Date() })
        .where(eq(tasks.id, block.taskId));
    }
  }

  // Diff: compare only genuinely new proposed blocks against committed state
  const diff = generateDiff(
    existingBlocks.filter((b) => b.committed),
    allProposed
  );

  return {
    proposedBlocks: allProposed,
    unschedulable: result.unschedulable,
    diff,
  };
}

async function handleConfirmPlan(userId: string): Promise<ActionResult> {
  // Mark all uncommitted Runekeeper-sourced blocks as committed
  // Google Calendar blocks are already committed on import, but guard anyway
  await db
    .update(timeBlocks)
    .set({ committed: true, updatedAt: new Date() })
    .where(
      and(
        eq(timeBlocks.userId, userId),
        eq(timeBlocks.committed, false),
        eq(timeBlocks.source, "runekeeper")
      )
    );

  return { committed: true };
}

async function handleAdjustBlock(
  action: any,
  userId: string,
  weekStart: string,
  weekEnd: string,
  timezone?: string
): Promise<ActionResult> {
  const blockTitle =
    typeof action.blockTitle === "string" ? action.blockTitle.trim() : null;
  const newEstimateMinutes =
    typeof action.newEstimateMinutes === "number" && action.newEstimateMinutes > 0
      ? Math.min(Math.round(action.newEstimateMinutes), 480)
      : undefined;
  const newStartTime =
    typeof action.newStartTime === "string" && !isNaN(Date.parse(action.newStartTime))
      ? action.newStartTime
      : undefined;

  if (!blockTitle) {
    return handleGenerateSchedule(userId, weekStart, weekEnd, undefined, undefined, timezone);
  }

  // Find the block to adjust
  const allBlocks = await db
    .select()
    .from(timeBlocks)
    .where(eq(timeBlocks.userId, userId));

  const targetBlock = allBlocks.find(
    (b) => b.title.toLowerCase().includes(blockTitle.toLowerCase())
  );

  if (!targetBlock) {
    // No existing block found — but if a specific time was requested, find
    // the task by title and create a block directly instead of falling back
    // to the generic scheduler (which is constrained to working hours).
    if (newStartTime) {
      const allTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.userId, userId));

      const matchedTask = allTasks.find(
        (t) => t.title.toLowerCase().includes(blockTitle!.toLowerCase())
      );

      if (matchedTask) {
        const startTime = parseNaiveDateTime(newStartTime, timezone);
        const durationMinutes = newEstimateMinutes ?? matchedTask.estimateMinutes ?? 30;
        const endTime = new Date(startTime.getTime() + durationMinutes * 60_000);

        await db
          .update(tasks)
          .set({ status: "scheduled", updatedAt: new Date() })
          .where(eq(tasks.id, matchedTask.id));

        const [blockRow] = await db
          .insert(timeBlocks)
          .values({
            userId,
            taskId: matchedTask.id,
            title: matchedTask.title,
            startTime,
            endTime,
            blockType: inferBlockType(matchedTask),
            committed: false,
          })
          .returning();

        const pinnedBlockIds = new Set<string>([blockRow.id]);
        const result = await handleGenerateSchedule(userId, weekStart, weekEnd, pinnedBlockIds, undefined, timezone);
        return {
          ...result,
          proposedBlocks: [
            dbBlockToTimeBlock(blockRow),
            ...(result.proposedBlocks ?? []),
          ],
        };
      }
    }

    return handleGenerateSchedule(userId, weekStart, weekEnd, undefined, undefined, timezone);
  }

  // Update the task's estimateMinutes if a new duration was provided
  if (targetBlock.taskId && newEstimateMinutes) {
    await db
      .update(tasks)
      .set({ estimateMinutes: newEstimateMinutes, updatedAt: new Date() })
      .where(eq(tasks.id, targetBlock.taskId));
  }

  // Delete the old block
  await db.delete(timeBlocks).where(eq(timeBlocks.id, targetBlock.id));

  // If a new start time was specified, place the block directly instead of regenerating
  if (newStartTime) {
    const startTime = parseNaiveDateTime(newStartTime, timezone);
    const durationMinutes = newEstimateMinutes
      ?? (targetBlock.taskId
        ? (await db.select().from(tasks).where(eq(tasks.id, targetBlock.taskId)))[0]?.estimateMinutes
        : null)
      ?? 30;
    const endTime = new Date(startTime.getTime() + durationMinutes * 60_000);

    // Mark task as scheduled
    if (targetBlock.taskId) {
      await db
        .update(tasks)
        .set({ status: "scheduled", updatedAt: new Date() })
        .where(eq(tasks.id, targetBlock.taskId));
    }

    const wasCommitted = targetBlock.committed;
    const [blockRow] = await db
      .insert(timeBlocks)
      .values({
        userId,
        taskId: targetBlock.taskId,
        title: targetBlock.title,
        startTime,
        endTime,
        blockType: inferBlockType({ title: targetBlock.title }),
        committed: wasCommitted,
      })
      .returning();

    const pinnedBlockIds = new Set<string>([blockRow.id]);

    // Regenerate remaining unscheduled tasks around this pinned block
    const result = await handleGenerateSchedule(userId, weekStart, weekEnd, pinnedBlockIds, undefined, timezone);
    return {
      ...result,
      proposedBlocks: [
        dbBlockToTimeBlock(blockRow),
        ...(result.proposedBlocks ?? []),
      ],
    };
  }

  // No specific time — reset task and regenerate the full schedule
  if (targetBlock.taskId) {
    await db
      .update(tasks)
      .set({ status: "unscheduled", updatedAt: new Date() })
      .where(eq(tasks.id, targetBlock.taskId));
  }

  return handleGenerateSchedule(userId, weekStart, weekEnd, undefined, undefined, timezone);
}
