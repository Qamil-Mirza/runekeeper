import { auth } from "@/lib/auth";
import { syncCalendarEvents } from "@/lib/google/sync";
import { db } from "@/db";
import { timeBlocks } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("Unauthorized", 401);

  const accessToken = (session as any).accessToken;
  const url = new URL(req.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  // Sync calendar events if we have an access token
  if (accessToken) {
    try {
      await syncCalendarEvents(
        session.user.id,
        accessToken,
        "primary",
        start ? new Date(start).toISOString() : undefined,
        end ? new Date(end).toISOString() : undefined
      );
    } catch (err) {
      console.error("Calendar sync failed:", err);
      // Continue — return whatever we have cached
    }
  }

  // Return blocks from DB
  const blocks = start && end
    ? await db
        .select()
        .from(timeBlocks)
        .where(
          and(
            eq(timeBlocks.userId, session.user.id),
            gte(timeBlocks.startTime, new Date(start)),
            lte(timeBlocks.endTime, new Date(end))
          )
        )
    : await db
        .select()
        .from(timeBlocks)
        .where(eq(timeBlocks.userId, session.user.id));

  return jsonResponse(blocks);
}
