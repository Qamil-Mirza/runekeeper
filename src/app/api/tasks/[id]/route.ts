import { db } from "@/db";
import { tasks } from "@/db/schema";
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

  // Allowlist editable fields to prevent overwriting userId, id, etc.
  const allowed: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) allowed.title = body.title;
  if (body.notes !== undefined) allowed.notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : body.notes;
  if (body.priority !== undefined) allowed.priority = body.priority;
  if (body.estimateMinutes !== undefined) allowed.estimateMinutes = body.estimateMinutes;
  if (body.dueDate !== undefined) allowed.dueDate = body.dueDate;
  if (body.status !== undefined) allowed.status = body.status;
  if (body.recurrenceRule !== undefined) allowed.recurrenceRule = body.recurrenceRule;

  const [updated] = await db
    .update(tasks)
    .set(allowed)
    .where(and(eq(tasks.id, id), eq(tasks.userId, user.id)))
    .returning();

  if (!updated) return errorResponse("Task not found", 404);
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
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, user.id)))
    .returning();

  if (!deleted) return errorResponse("Task not found", 404);
  return jsonResponse({ success: true });
}
