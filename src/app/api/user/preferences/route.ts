import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
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

  const updates = await req.json();
  if (!updates || typeof updates !== "object") {
    return errorResponse("Invalid request body", 400);
  }

  const [updated] = await db
    .update(users)
    .set({
      preferences: sql`COALESCE(${users.preferences}, '{}'::jsonb) || ${JSON.stringify(updates)}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();

  return jsonResponse({ preferences: updated.preferences });
}
