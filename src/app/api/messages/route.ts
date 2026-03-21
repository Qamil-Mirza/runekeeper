import { db } from "@/db";
import { chatMessages } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");

  const messages = sessionId
    ? await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.planSessionId, sessionId))
        .orderBy(asc(chatMessages.createdAt))
    : await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.userId, user.id))
        .orderBy(asc(chatMessages.createdAt));

  return jsonResponse(messages);
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const body = await req.json();
  if (!body.content || !body.role) {
    return errorResponse("content and role are required");
  }

  const [message] = await db
    .insert(chatMessages)
    .values({
      userId: user.id,
      planSessionId: body.planSessionId ?? null,
      role: body.role,
      content: body.content,
      metadata: body.metadata ?? null,
    })
    .returning();

  return jsonResponse(message, 201);
}
