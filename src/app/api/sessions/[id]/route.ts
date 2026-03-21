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

  const [updated] = await db
    .update(planSessions)
    .set({
      ...body,
      updatedAt: new Date(),
    })
    .where(and(eq(planSessions.id, id), eq(planSessions.userId, user.id)))
    .returning();

  if (!updated) return errorResponse("Session not found", 404);
  return jsonResponse(updated);
}
