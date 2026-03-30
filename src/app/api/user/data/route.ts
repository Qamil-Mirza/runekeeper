import { db } from "@/db";
import { tasks, timeBlocks } from "@/db/schema";
import { eq, and, isNull, ne } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";

export async function DELETE() {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  // Delete Runekeeper-created tasks (not synced from Google Tasks)
  const deletedTasks = await db
    .delete(tasks)
    .where(and(eq(tasks.userId, user.id), isNull(tasks.googleTaskId)))
    .returning();

  // Delete Runekeeper-created time blocks (not synced from Google Calendar)
  const deletedBlocks = await db
    .delete(timeBlocks)
    .where(and(eq(timeBlocks.userId, user.id), ne(timeBlocks.source, "google_calendar")))
    .returning();

  return jsonResponse({
    deletedTasks: deletedTasks.length,
    deletedBlocks: deletedBlocks.length,
  });
}
