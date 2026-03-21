import { db } from "@/db";
import { users, timeBlocks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  listEvents,
  mapGoogleEventToTimeBlock,
  SyncTokenExpiredError,
} from "./calendar";

export async function syncCalendarEvents(
  userId: string,
  accessToken: string,
  calendarId = "primary",
  timeMin?: string,
  timeMax?: string
) {
  // Get user's current sync token
  const [user] = await db
    .select({ syncToken: users.syncToken })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  let syncToken = user?.syncToken ?? undefined;

  try {
    // If no time range specified and no sync token, sync current month
    if (!timeMin && !syncToken) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      timeMin = start.toISOString();
      timeMax = end.toISOString();
    }

    const result = await listEvents(
      accessToken,
      calendarId,
      timeMin || new Date().toISOString(),
      timeMax || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      syncToken
    );

    // Upsert time blocks based on returned events
    for (const event of result.events) {
      if (!event.id) continue;

      // Skip cancelled events
      if (event.status === "cancelled") {
        await db
          .delete(timeBlocks)
          .where(
            and(
              eq(timeBlocks.googleEventId, event.id),
              eq(timeBlocks.userId, userId)
            )
          );
        continue;
      }

      const blockData = mapGoogleEventToTimeBlock(event);

      // Check if block already exists
      const [existing] = await db
        .select()
        .from(timeBlocks)
        .where(
          and(
            eq(timeBlocks.googleEventId, event.id!),
            eq(timeBlocks.userId, userId)
          )
        )
        .limit(1);

      if (existing) {
        await db
          .update(timeBlocks)
          .set({
            title: blockData.title,
            startTime: new Date(blockData.startTime),
            endTime: new Date(blockData.endTime),
            blockType: blockData.blockType,
            googleEtag: blockData.googleEtag,
            updatedAt: new Date(),
          })
          .where(eq(timeBlocks.id, existing.id));
      } else {
        // Skip events that originated from Runekeeper (re-import prevention)
        const extProps = (event as any).extendedProperties?.private;
        if (extProps?.runekeeperId) continue;

        await db.insert(timeBlocks).values({
          userId,
          title: blockData.title,
          startTime: new Date(blockData.startTime),
          endTime: new Date(blockData.endTime),
          blockType: blockData.blockType,
          committed: true,
          source: "google_calendar",
          googleEventId: event.id,
          googleCalendarId: calendarId,
          googleEtag: blockData.googleEtag,
          taskId: blockData.taskId,
        });
      }
    }

    // Save new sync token
    if (result.nextSyncToken) {
      await db
        .update(users)
        .set({ syncToken: result.nextSyncToken })
        .where(eq(users.id, userId));
    }

    return { synced: result.events.length };
  } catch (error) {
    if (error instanceof SyncTokenExpiredError) {
      // Clear sync token and do full resync
      await db
        .update(users)
        .set({ syncToken: null })
        .where(eq(users.id, userId));

      // Retry without sync token
      return syncCalendarEvents(userId, accessToken, calendarId, timeMin, timeMax);
    }
    throw error;
  }
}
