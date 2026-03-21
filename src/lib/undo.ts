import { db } from "@/db";
import { planSessions, timeBlocks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { deleteEvent } from "@/lib/google/calendar";

export async function canUndo(sessionId: string, userId: string): Promise<boolean> {
  const [session] = await db
    .select()
    .from(planSessions)
    .where(
      and(
        eq(planSessions.id, sessionId),
        eq(planSessions.userId, userId)
      )
    )
    .limit(1);

  if (!session || session.status !== "committed" || !session.undoDeadline) {
    return false;
  }

  return new Date(session.undoDeadline) > new Date();
}

export async function performUndo(
  sessionId: string,
  userId: string,
  accessToken?: string
): Promise<{ undone: number; errors: string[] }> {
  const undoable = await canUndo(sessionId, userId);
  if (!undoable) {
    throw new Error("Cannot undo: session not found or undo window expired");
  }

  const [session] = await db
    .select()
    .from(planSessions)
    .where(eq(planSessions.id, sessionId))
    .limit(1);

  const diffSnapshot = (session.diffSnapshot as any[]) || [];
  const errors: string[] = [];
  let undone = 0;

  for (const change of diffSnapshot) {
    try {
      if (change.type === "add" && change.blockId) {
        // Delete the block and its Google Calendar event
        const [block] = await db
          .select()
          .from(timeBlocks)
          .where(eq(timeBlocks.id, change.blockId))
          .limit(1);

        if (block) {
          // Try to delete from Google Calendar
          if (block.googleEventId && accessToken) {
            try {
              await deleteEvent(
                accessToken,
                block.googleCalendarId || "primary",
                block.googleEventId
              );
            } catch (err) {
              errors.push(
                `Failed to delete calendar event for ${block.title}: ${err}`
              );
            }
          }

          // Delete from our database
          await db.delete(timeBlocks).where(eq(timeBlocks.id, block.id));
          undone++;
        }
      }
    } catch (err) {
      errors.push(`Failed to undo change: ${err}`);
    }
  }

  // Update session status
  await db
    .update(planSessions)
    .set({
      status: "drafting",
      undoDeadline: null,
      updatedAt: new Date(),
    })
    .where(eq(planSessions.id, sessionId));

  return { undone, errors };
}

export async function undoLastCommit(
  userId: string,
  accessToken?: string
): Promise<{ undone: number; errors: string[] }> {
  // Find the most recent committed session with an active undo window
  const recentSessions = await db
    .select()
    .from(planSessions)
    .where(
      and(
        eq(planSessions.userId, userId),
        eq(planSessions.status, "committed")
      )
    )
    .limit(1);

  if (recentSessions.length === 0) {
    // If no plan sessions, just delete all uncommitted blocks
    const uncommitted = await db
      .select()
      .from(timeBlocks)
      .where(
        and(
          eq(timeBlocks.userId, userId),
          eq(timeBlocks.committed, true)
        )
      );

    // Delete recently committed blocks (best-effort undo)
    let undone = 0;
    const errors: string[] = [];

    // Get blocks committed in the last 30 minutes
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    for (const block of uncommitted) {
      if (new Date(block.updatedAt) > thirtyMinAgo) {
        if (block.googleEventId && accessToken) {
          try {
            await deleteEvent(
              accessToken,
              block.googleCalendarId || "primary",
              block.googleEventId
            );
          } catch (err) {
            errors.push(`Failed to delete event: ${err}`);
          }
        }
        await db.delete(timeBlocks).where(eq(timeBlocks.id, block.id));
        undone++;
      }
    }

    return { undone, errors };
  }

  return performUndo(recentSessions[0].id, userId, accessToken);
}
