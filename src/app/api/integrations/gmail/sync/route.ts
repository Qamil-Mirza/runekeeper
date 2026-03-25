import { db } from "@/db";
import { integrations, accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { decrypt } from "@/lib/crypto";
import { syncGmailForUser } from "@/lib/google/gmail-sync";
import { setupWatch } from "@/lib/google/gmail";

const log = createLogger("api:integrations:gmail:sync");

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const syncLimiter = rateLimit({ key: "gmail-sync", limit: 2, windowMs: 60_000 });

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const { success: withinLimit } = syncLimiter.check(user.id);
  if (!withinLimit) {
    return errorResponse("Rate limit exceeded. Try again shortly.", 429);
  }

  // Get user's Gmail integration
  const [integration] = await db
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.userId, user.id), eq(integrations.provider, "gmail"))
    )
    .limit(1);

  if (!integration || !integration.enabled) {
    return errorResponse("Gmail integration is not enabled", 400);
  }

  // Get access token
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, user.id))
    .limit(1);

  if (!account?.access_token) {
    return errorResponse("No access token found. Please reconnect your Google account.", 401);
  }

  const accessToken = decrypt(account.access_token);

  try {
    // Renew Pub/Sub watch if expiring within 1 day
    if (integration.watchExpiration) {
      const expiresAt = new Date(integration.watchExpiration).getTime();
      if (expiresAt - Date.now() < ONE_DAY_MS) {
        const topicName = `projects/${process.env.GCP_PROJECT_ID}/topics/${process.env.GMAIL_PUBSUB_TOPIC || "runekeeper-gmail"}`;
        try {
          const watch = await setupWatch(accessToken, topicName);
          await db
            .update(integrations)
            .set({
              gmailHistoryId: watch.historyId,
              watchExpiration: new Date(Number(watch.expiration)),
              updatedAt: new Date(),
            })
            .where(eq(integrations.id, integration.id));
          log.info({ userId: user.id }, "renewed gmail watch");
        } catch (watchErr) {
          log.warn({ err: watchErr }, "failed to renew gmail watch");
        }
      }
    }

    const result = await syncGmailForUser(
      user.id,
      accessToken,
      integration.id,
      "full"
    );

    log.info(
      { userId: user.id, processed: result.processed, tasksCreated: result.tasksCreated },
      "manual gmail sync completed"
    );

    return jsonResponse(result);
  } catch (err) {
    log.error({ err, userId: user.id }, "gmail sync failed");
    return errorResponse("Gmail sync failed", 500);
  }
}
