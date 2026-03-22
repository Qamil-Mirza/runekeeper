import { db } from "@/db";
import { timeBlocks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const { id } = await params;
  const body = await req.json();

  // Allowlist: only permit safe fields to be updated
  const allowed: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) allowed.title = body.title;
  if (body.startTime !== undefined) allowed.startTime = new Date(body.startTime);
  if (body.endTime !== undefined) allowed.endTime = new Date(body.endTime);
  if (body.blockType !== undefined) allowed.blockType = body.blockType;

  const [updated] = await db
    .update(timeBlocks)
    .set(allowed)
    .where(and(eq(timeBlocks.id, id), eq(timeBlocks.userId, user.id)))
    .returning();

  if (!updated) return errorResponse("Block not found", 404);
  return jsonResponse(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const { id } = await params;

  const [deleted] = await db
    .delete(timeBlocks)
    .where(and(eq(timeBlocks.id, id), eq(timeBlocks.userId, user.id)))
    .returning();

  if (!deleted) return errorResponse("Block not found", 404);
  return jsonResponse({ success: true });
}
