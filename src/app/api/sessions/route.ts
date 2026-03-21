import { db } from "@/db";
import { planSessions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const userSessions = await db
    .select()
    .from(planSessions)
    .where(eq(planSessions.userId, user.id))
    .orderBy(desc(planSessions.createdAt));

  return jsonResponse(userSessions);
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const body = await req.json();
  if (!body.weekStart || !body.weekEnd) {
    return errorResponse("weekStart and weekEnd are required");
  }

  const [session] = await db
    .insert(planSessions)
    .values({
      userId: user.id,
      weekStart: body.weekStart,
      weekEnd: body.weekEnd,
      status: "drafting",
    })
    .returning();

  return jsonResponse(session, 201);
}
