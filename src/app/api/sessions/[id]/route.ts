import { db } from "@/db";
import { planSessions } from "@/db/schema";
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
  if (body.weekStart !== undefined) allowed.weekStart = body.weekStart;
  if (body.weekEnd !== undefined) allowed.weekEnd = body.weekEnd;

  const [updated] = await db
    .update(planSessions)
    .set(allowed)
    .where(and(eq(planSessions.id, id), eq(planSessions.userId, user.id)))
    .returning();

  if (!updated) return errorResponse("Session not found", 404);
  return jsonResponse(updated);
}
