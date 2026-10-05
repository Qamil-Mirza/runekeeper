// src/app/api/integrations/pensive/sync/route.ts
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUser, jsonResponse, errorResponse } from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { syncPensiveForUser } from "@/lib/pensive/pensive-sync";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:integrations:pensive:sync");

const syncLimiter = rateLimit({ key: "pensive-sync", limit: 2, windowMs: 60_000 });

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const { success: withinLimit } = syncLimiter.check(user.id);
  if (!withinLimit) return errorResponse("Rate limit exceeded. Try again shortly.", 429);

  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, user.id), eq(integrations.provider, "pensive")))
    .limit(1);

  if (!integration || !integration.enabled || !integration.config?.pensiveRefreshToken) {
    return errorResponse("Pensive integration is not connected", 400);
  }

  try {
    const result = await syncPensiveForUser(user.id, integration.id, user.timezone);
    log.info({ userId: user.id, processed: result.processed, tasksCreated: result.tasksCreated }, "pensive sync completed");
    return jsonResponse(result);
  } catch (err) {
    log.error({ err, userId: user.id }, "pensive sync failed");
    return errorResponse("Pensive sync failed", 500);
  }
}
