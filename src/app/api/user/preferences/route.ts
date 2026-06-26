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

  // Validate digest-notification fields when present.
  if ("digestEnabled" in updates && typeof updates.digestEnabled !== "boolean") {
    return errorResponse("digestEnabled must be a boolean", 400);
  }
  if ("digestTimes" in updates) {
    const times = updates.digestTimes;
    const isValid =
      Array.isArray(times) &&
      times.length <= 12 &&
      times.every((t: unknown) => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
    if (!isValid) {
      return errorResponse(
        'digestTimes must be an array (max 12) of "HH:MM" 24-hour strings',
        400
      );
    }
    // Normalize: dedupe and sort ascending.
    updates.digestTimes = [...new Set(times as string[])].sort();
  }

  // Validate Goggins overdue-call fields when present.
  if ("gogginsCallEnabled" in updates && typeof updates.gogginsCallEnabled !== "boolean") {
    return errorResponse("gogginsCallEnabled must be a boolean", 400);
  }
  if ("gogginsCallTimes" in updates) {
    const times = updates.gogginsCallTimes;
    const isValid =
      Array.isArray(times) &&
      times.length <= 12 &&
      times.every((t: unknown) => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
    if (!isValid) {
      return errorResponse(
        'gogginsCallTimes must be an array (max 12) of "HH:MM" 24-hour strings',
        400
      );
    }
    updates.gogginsCallTimes = [...new Set(times as string[])].sort();
  }
  if ("gogginsPhoneNumber" in updates) {
    const phone = updates.gogginsPhoneNumber;
    const isValid =
      phone === null ||
      phone === "" ||
      (typeof phone === "string" && /^\+?[1-9]\d{6,14}$/.test(phone.replace(/[\s-()]/g, "")));
    if (!isValid) {
      return errorResponse("gogginsPhoneNumber must be a valid phone number", 400);
    }
    // Normalize to a digits-and-leading-plus form for Twilio (E.164-ish).
    if (typeof phone === "string" && phone !== "") {
      updates.gogginsPhoneNumber = phone.replace(/[\s-()]/g, "");
    }
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
