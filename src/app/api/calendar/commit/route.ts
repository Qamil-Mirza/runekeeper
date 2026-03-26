import { auth } from "@/lib/auth";
import { db } from "@/db";
import { timeBlocks, planSessions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";

const commitLimiter = rateLimit({ key: "calendar-commit", limit: 10, windowMs: 60_000 });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("Unauthorized", 401);

  const { success: withinLimit } = commitLimiter.check(session.user.id);
  if (!withinLimit) {
    return errorResponse("Rate limit exceeded. Try again shortly.", 429);
  }

  const body = await req.json();
  const sessionId = body.sessionId;

  // Get all uncommitted Runekeeper-sourced blocks for this user
  const uncommittedBlocks = await db
    .select()
    .from(timeBlocks)
    .where(
      and(
        eq(timeBlocks.userId, session.user.id),
        eq(timeBlocks.committed, false)
      )
    );

  // Only commit blocks created within Runekeeper (skip Google Calendar imports)
  const runekeeperBlocks = uncommittedBlocks.filter(
    (b) => b.source === "runekeeper"
  );

  // Mark as committed internally — no Google Calendar writes
  for (const block of runekeeperBlocks) {
    await db
      .update(timeBlocks)
      .set({
        committed: true,
        updatedAt: new Date(),
      })
      .where(eq(timeBlocks.id, block.id));
  }

  // Update plan session if provided
  if (sessionId && sessionId !== "current") {
    await db
      .update(planSessions)
      .set({
        status: "committed",
        diffSnapshot: runekeeperBlocks.map((b) => ({
          type: "add",
          blockId: b.id,
        })),
        undoDeadline: new Date(Date.now() + 30 * 60 * 1000),
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
    committed: runekeeperBlocks.length,
  });
}
