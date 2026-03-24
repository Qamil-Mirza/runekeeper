import { db } from "@/db";
import { timeBlocks } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("blocks");

const blocksLimiter = rateLimit({ key: "blocks", limit: 30, windowMs: 60_000 });

export async function GET(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const url = new URL(req.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  let query = db
    .select()
    .from(timeBlocks)
    .where(
      start && end
        ? and(
            eq(timeBlocks.userId, user.id),
            gte(timeBlocks.startTime, new Date(start)),
            lte(timeBlocks.endTime, new Date(end))
          )
        : eq(timeBlocks.userId, user.id)
    );

  const blocks = await query;
  return jsonResponse(blocks);
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const { success: withinLimit } = blocksLimiter.check(user.id);
  if (!withinLimit) {
    return errorResponse("Rate limit exceeded. Try again shortly.", 429);
  }

  const body = await req.json();
  if (!body.title || !body.startTime || !body.endTime) {
    return errorResponse("title, startTime, and endTime are required");
  }

  const startTime = new Date(body.startTime);
  const endTime = new Date(body.endTime);

  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    return errorResponse("startTime and endTime must be valid date strings", 400);
  }

  if (endTime <= startTime) {
    return errorResponse("endTime must be after startTime", 400);
  }

  const [block] = await db
    .insert(timeBlocks)
    .values({
      userId: user.id,
      taskId: body.taskId ?? null,
      title: body.title,
      startTime,
      endTime,
      blockType: body.blockType ?? "focus",
      committed: body.committed ?? false,
    })
    .returning();

  log.info({ userId: user.id, title: body.title }, "block created");
  return jsonResponse(block, 201);
}
