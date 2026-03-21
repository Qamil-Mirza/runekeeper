import { db } from "@/db";
import { timeBlocks } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";

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

  const body = await req.json();
  if (!body.title || !body.startTime || !body.endTime) {
    return errorResponse("title, startTime, and endTime are required");
  }

  const [block] = await db
    .insert(timeBlocks)
    .values({
      userId: user.id,
      taskId: body.taskId ?? null,
      title: body.title,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      blockType: body.blockType ?? "focus",
      committed: body.committed ?? false,
    })
    .returning();

  return jsonResponse(block, 201);
}
