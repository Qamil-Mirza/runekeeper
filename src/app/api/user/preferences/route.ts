import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { isValidTimezone } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";

const prefsLimiter = rateLimit({ key: "prefs", limit: 10, windowMs: 60_000 });

const ALLOWED_PREFS: Record<string, (v: unknown) => boolean> = {
  workingHoursStart: (v) => typeof v === "number" && v >= 0 && v <= 23,
  workingHoursEnd: (v) => typeof v === "number" && v >= 0 && v <= 23,
  lunchDurationMinutes: (v) => typeof v === "number" && v >= 0 && v <= 120,
  maxBlockMinutes: (v) => typeof v === "number" && v >= 15 && v <= 480,
  meetingBuffer: (v) => typeof v === "number" && v >= 0 && v <= 60,
};

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

  const { success: withinLimit } = prefsLimiter.check(user.id);
  if (!withinLimit) {
    return errorResponse("Rate limit exceeded. Try again shortly.", 429);
  }

  const body = await req.json();

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.timezone) {
    if (typeof body.timezone !== "string" || !isValidTimezone(body.timezone)) {
      return errorResponse("Invalid timezone", 400);
    }
    updates.timezone = body.timezone;
  }

  if (body.preferences && typeof body.preferences === "object") {
    const sanitized: Record<string, number> = {};
    for (const [key, value] of Object.entries(body.preferences)) {
      if (key in ALLOWED_PREFS && ALLOWED_PREFS[key](value)) {
        sanitized[key] = value as number;
      }
    }
    if (Object.keys(sanitized).length > 0) {
      updates.preferences = {
        ...(user.preferences as object),
        ...sanitized,
      };
    }
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
