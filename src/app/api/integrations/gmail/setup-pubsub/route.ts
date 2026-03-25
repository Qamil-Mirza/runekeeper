import { db } from "@/db";
import { integrations, accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { createLogger } from "@/lib/logger";
import { decrypt } from "@/lib/crypto";
import { setupWatch } from "@/lib/google/gmail";

const log = createLogger("api:integrations:gmail:setup-pubsub");

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  // Get access token
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, user.id))
    .limit(1);

  if (!account?.access_token) {
    return errorResponse(
      "No access token found. Please reconnect your Google account.",
      401
    );
  }

  const accessToken = decrypt(account.access_token);

  const topicName = `projects/${process.env.GCP_PROJECT_ID}/topics/${process.env.GMAIL_PUBSUB_TOPIC || "runekeeper-gmail"}`;

  try {
    const { historyId, expiration } = await setupWatch(accessToken, topicName);

    // Update integration row
    await db
      .update(integrations)
      .set({
        gmailHistoryId: historyId,
        watchExpiration: new Date(parseInt(expiration)),
        config: {
          pubsubSubscriptionActive: true,
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(integrations.userId, user.id),
          eq(integrations.provider, "gmail")
        )
      );

    log.info(
      { userId: user.id, historyId, expiration },
      "gmail pub/sub watch set up"
    );

    return jsonResponse({ historyId, expiration });
  } catch (err) {
    log.error({ err, userId: user.id }, "failed to set up gmail pub/sub watch");
    return errorResponse("Failed to set up Gmail push notifications", 500);
  }
}
