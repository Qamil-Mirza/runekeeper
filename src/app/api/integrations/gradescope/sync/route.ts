import { db } from "@/db";
import { integrations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { syncGradescopeForUser } from "@/lib/gradescope/gradescope-sync";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:integrations:gradescope:sync");

const syncLimiter = rateLimit({
  key: "gradescope-sync",
  limit: 2,
  windowMs: 60_000,
});

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
      and(
        eq(integrations.userId, user.id),
        eq(integrations.provider, "gradescope")
      )
    )
    .limit(1);

  if (!integration || !integration.enabled) {
    return errorResponse("Gradescope integration is not enabled", 400);
  }

  const email = integration.config?.gradescopeEmail;
  const encryptedPassword = integration.config?.gradescopePassword;

  if (!email || !encryptedPassword) {
    return errorResponse("Gradescope credentials not configured", 400);
  }

  try {
    const result = await syncGradescopeForUser(
      user.id,
      email,
      encryptedPassword,
      integration.id,
      user.timezone
    );

    log.info(
      {
        userId: user.id,
        processed: result.processed,
        tasksCreated: result.tasksCreated,
      },
      "gradescope sync completed"
    );

    return jsonResponse(result);
  } catch (err) {
    log.error({ err, userId: user.id }, "gradescope sync failed");
    return errorResponse("Gradescope sync failed", 500);
  }
}
