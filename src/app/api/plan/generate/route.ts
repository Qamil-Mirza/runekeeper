import { auth } from "@/lib/auth";
import { db } from "@/db";
import { tasks, timeBlocks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { schedule } from "@/lib/scheduler";
import { generateDiff } from "@/lib/scheduler/diff";
import { dbTaskToTask, dbBlockToTimeBlock } from "@/lib/types";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("plan");
const generateLimiter = rateLimit({ key: "plan-generate", limit: 5, windowMs: 60_000 });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("Unauthorized", 401);

  const { success: withinLimit } = generateLimiter.check(session.user.id);
  if (!withinLimit) {
    return errorResponse("Rate limit exceeded. Try again shortly.", 429);
  }

  const body = await req.json();
  const { start, end } = body;

  if (!start || !end) {
    return errorResponse("start and end dates are required");
  }

  const preferences = { maxBlockMinutes: 120, meetingBuffer: 10 };

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

  log.info({
    userId: session.user.id,
    start,
    end,
    proposedCount: result.proposedBlocks.length,
    unschedulableCount: result.unschedulable.length,
  }, "schedule generated");

  return jsonResponse({
    proposedBlocks: result.proposedBlocks,
    unschedulable: result.unschedulable,
    diff,
  });
}
