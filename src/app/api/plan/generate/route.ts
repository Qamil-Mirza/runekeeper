import { auth } from "@/lib/auth";
import { db } from "@/db";
import { tasks, timeBlocks, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { schedule } from "@/lib/scheduler";
import { generateDiff } from "@/lib/scheduler/diff";
import { dbTaskToTask, dbBlockToTimeBlock } from "@/lib/types";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("Unauthorized", 401);

  const body = await req.json();
  const { start, end } = body;

  if (!start || !end) {
    return errorResponse("start and end dates are required");
  }

  // Load user preferences
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) return errorResponse("User not found", 404);

  const preferences = (user.preferences as any) ?? {
    workingHoursStart: 9,
    workingHoursEnd: 18,
    lunchDurationMinutes: 30,
    maxBlockMinutes: 120,
    meetingBuffer: 10,
  };

  // Load unscheduled tasks
  const userTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, session.user.id));

  // Load existing blocks as busy windows
  const existingBlocks = await db
    .select()
    .from(timeBlocks)
    .where(eq(timeBlocks.userId, session.user.id));

  const mappedTasks = userTasks.map(dbTaskToTask);
  const mappedBlocks = existingBlocks.map(dbBlockToTimeBlock);

  // Run scheduler
  const result = schedule({
    tasks: mappedTasks,
    busyWindows: mappedBlocks.filter((b) => b.committed),
    preferences,
    weekRange: { start, end },
  });

  // Generate diff
  const diff = generateDiff(mappedBlocks, [
    ...mappedBlocks.filter((b) => b.committed),
    ...result.proposedBlocks,
  ]);

  // Persist proposed blocks to DB
  for (const block of result.proposedBlocks) {
    await db.insert(timeBlocks).values({
      userId: session.user.id,
      taskId: block.taskId || null,
      title: block.title,
      startTime: new Date(block.start),
      endTime: new Date(block.end),
      blockType: block.type,
      committed: false,
    });
  }

  // Update scheduled tasks' status
  for (const block of result.proposedBlocks) {
    if (block.taskId) {
      await db
        .update(tasks)
        .set({ status: "scheduled", updatedAt: new Date() })
        .where(eq(tasks.id, block.taskId));
    }
  }

  return jsonResponse({
    proposedBlocks: result.proposedBlocks,
    unschedulable: result.unschedulable,
    diff,
  });
}
