import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  return jsonResponse({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    timezone: user.timezone,
    preferences: user.preferences,
  });
}

export async function PATCH(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const body = await req.json();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.timezone) updates.timezone = body.timezone;
  if (body.preferences) {
    updates.preferences = {
      ...(user.preferences as object),
      ...body.preferences,
    };
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, user.id))
    .returning();

  return jsonResponse({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    image: updated.image,
    timezone: updated.timezone,
    preferences: updated.preferences,
  });
}
