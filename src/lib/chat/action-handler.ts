import { db } from "@/db";
import { tasks, timeBlocks, planSessions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { schedule } from "@/lib/scheduler";
import { generateDiff } from "@/lib/scheduler/diff";
import { dbTaskToTask, dbBlockToTimeBlock, type Task, type TimeBlock } from "@/lib/types";

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
  pinnedBlockIds?: Set<string>
): Promise<ActionResult> {
  switch (action.type) {
    case "create_tasks":
      return handleCreateTasks(action.tasks, userId);
    case "generate_schedule":
      return handleGenerateSchedule(userId, weekStart, weekEnd, pinnedBlockIds);
    case "confirm_plan":
      return handleConfirmPlan(userId);
    case "adjust_block":
      return handleAdjustBlock(action, userId, weekStart, weekEnd);
    default:
      return { error: `Unknown action type: ${action.type}` };
  }
}

async function handleCreateTasks(
  taskDefs: any[],
  userId: string
): Promise<ActionResult> {
  const created: Task[] = [];
  const proposedBlocks: TimeBlock[] = [];

  // Load existing tasks to prevent duplicates (LLM may re-create a task it already made)
  const existingTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId));

  for (const def of taskDefs) {
    // Skip if a task with the same title already exists (case-insensitive)
    const duplicate = existingTasks.find(
      (t) => t.title.toLowerCase() === (def.title || "").toLowerCase()
    );
    if (duplicate) continue;

    const hasSpecificTime = !!def.startTime;

    const [row] = await db
      .insert(tasks)
      .values({
        userId,
        title: def.title,
        notes: def.notes ?? null,
        priority: def.priority ?? "P1",
        estimateMinutes: def.estimateMinutes ?? 30,
        dueDate: def.dueDate ?? null,
        status: hasSpecificTime ? "scheduled" : "unscheduled",
      })
      .returning();

    const task = dbTaskToTask(row);
    created.push(task);

    // If a specific start time was provided, create a time block at that time
    if (hasSpecificTime) {
      const startTime = new Date(def.startTime);
      const endTime = new Date(startTime.getTime() + (def.estimateMinutes ?? 30) * 60_000);

      const [blockRow] = await db
        .insert(timeBlocks)
        .values({
          userId,
          taskId: task.id,
          title: task.title,
          startTime,
          endTime,
          blockType: "focus",
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
  pinnedBlockIds?: Set<string>
): Promise<ActionResult> {
  // Load user preferences
  const { users } = await import("@/db/schema");
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const preferences = (user?.preferences as any) ?? {
    workingHoursStart: 9,
    workingHoursEnd: 18,
    lunchDurationMinutes: 30,
    maxBlockMinutes: 120,
    meetingBuffer: 10,
  };

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
  weekEnd: string
): Promise<ActionResult> {
  // Simple adjustment: delete the matching block and regenerate
  const { blockTitle } = action;

  if (blockTitle) {
    // Remove the block to be adjusted
    const allBlocks = await db
      .select()
      .from(timeBlocks)
      .where(eq(timeBlocks.userId, userId));

    const targetBlock = allBlocks.find(
      (b) =>
        b.title.toLowerCase().includes(blockTitle.toLowerCase()) &&
        !b.committed
    );

    if (targetBlock) {
      await db.delete(timeBlocks).where(eq(timeBlocks.id, targetBlock.id));

      // Also reset the task status
      if (targetBlock.taskId) {
        await db
          .update(tasks)
          .set({ status: "unscheduled", updatedAt: new Date() })
          .where(eq(tasks.id, targetBlock.taskId));
      }
    }
  }

  // Regenerate schedule with remaining tasks
  return handleGenerateSchedule(userId, weekStart, weekEnd);
}
