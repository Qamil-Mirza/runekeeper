import { db } from "@/db";
import { integrations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { decrypt } from "@/lib/crypto";
import { syncCanvasForUser } from "@/lib/canvas/canvas-sync";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:integrations:canvas:sync");

const syncLimiter = rateLimit({ key: "canvas-sync", limit: 2, windowMs: 60_000 });

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const { success: withinLimit } = syncLimiter.check(user.id);
  if (!withinLimit) {
    return errorResponse("Rate limit exceeded. Try again shortly.", 429);
  }

  const [integration] = await db
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.userId, user.id), eq(integrations.provider, "canvas"))
    )
    .limit(1);

  if (!integration || !integration.enabled) {
    return errorResponse("Canvas integration is not enabled", 400);
  }

  const token = integration.config?.canvasApiToken;
  const baseUrl = integration.config?.canvasBaseUrl;

  if (!token || !baseUrl) {
    return errorResponse("Canvas API token or URL not configured", 400);
  }

  try {
    const decryptedToken = decrypt(token);
    const result = await syncCanvasForUser(
      user.id,
      decryptedToken,
      baseUrl,
      integration.id,
      user.timezone
    );

    log.info(
      { userId: user.id, processed: result.processed, tasksCreated: result.tasksCreated },
      "canvas sync completed"
    );

    return jsonResponse(result);
  } catch (err) {
    log.error({ err, userId: user.id }, "canvas sync failed");
    return errorResponse("Canvas sync failed", 500);
  }
}
