import { auth } from "@/lib/auth";
import { db } from "@/db";
import { timeBlocks, planSessions, users, tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  insertEvent,
  patchEvent,
  mapTimeBlockToGoogleEvent,
} from "@/lib/google/calendar";
import { insertTask, patchTask, mapToGoogleTask } from "@/lib/google/tasks";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("Unauthorized", 401);

  const accessToken = (session as any).accessToken;
  if (!accessToken) return errorResponse("No access token available", 401);

  const body = await req.json();
  const sessionId = body.sessionId;

  // Get user timezone
  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const timezone = user?.timezone || "America/New_York";

  // Get all uncommitted blocks for this user
  const uncommittedBlocks = await db
    .select()
    .from(timeBlocks)
    .where(
      and(
        eq(timeBlocks.userId, session.user.id),
        eq(timeBlocks.committed, false)
      )
    );

  const diffSnapshot: any[] = [];

  // Write each block to Google Calendar
  for (const block of uncommittedBlocks) {
    try {
      const googleEvent = mapTimeBlockToGoogleEvent(
        {
          id: block.id,
          title: block.title,
          startTime: block.startTime,
          endTime: block.endTime,
          blockType: block.blockType,
          taskId: block.taskId,
        },
        timezone
      );

      let resultEvent;
      if (block.googleEventId) {
        // Update existing event
        resultEvent = await patchEvent(
          accessToken,
          "primary",
          block.googleEventId,
          googleEvent
        );
        diffSnapshot.push({ type: "modify", blockId: block.id });
      } else {
        // Create new event
        resultEvent = await insertEvent(accessToken, "primary", googleEvent);
        diffSnapshot.push({ type: "add", blockId: block.id });
      }

      // Update block with Google IDs
      await db
        .update(timeBlocks)
        .set({
          committed: true,
          googleEventId: resultEvent.id,
          googleCalendarId: "primary",
          googleEtag: resultEvent.etag,
          updatedAt: new Date(),
        })
        .where(eq(timeBlocks.id, block.id));

      // Sync linked task to Google Tasks if it exists
      if (block.taskId) {
        try {
          const [task] = await db
            .select()
            .from(tasks)
            .where(eq(tasks.id, block.taskId))
            .limit(1);

          if (task) {
            const googleTask = mapToGoogleTask(task);
            if (task.googleTaskId && task.googleTasklistId) {
              await patchTask(
                accessToken,
                task.googleTasklistId,
                task.googleTaskId,
                googleTask
              );
            } else {
              const created = await insertTask(
                accessToken,
                "@default",
                googleTask
              );
              await db
                .update(tasks)
                .set({
                  googleTaskId: created.id,
                  googleTasklistId: "@default",
                  updatedAt: new Date(),
                })
                .where(eq(tasks.id, task.id));
            }
          }
        } catch (taskErr) {
          console.error("Task sync failed for block:", block.id, taskErr);
        }
      }
    } catch (err) {
      console.error("Failed to commit block:", block.id, err);
    }
  }

  // Update plan session if provided
  if (sessionId && sessionId !== "current") {
    await db
      .update(planSessions)
      .set({
        status: "committed",
        diffSnapshot,
        undoDeadline: new Date(Date.now() + 30 * 60 * 1000), // 30 min
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(planSessions.id, sessionId),
          eq(planSessions.userId, session.user.id)
        )
      );
  }

  return jsonResponse({
    success: true,
    committed: uncommittedBlocks.length,
  });
}
