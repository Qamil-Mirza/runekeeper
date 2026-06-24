import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { buildAndSendDigest } from "@/lib/notifications/scheduler";
import { createLogger } from "@/lib/logger";

const log = createLogger("digest-test");

/**
 * Sends the current user's quest digest immediately, ignoring the daily time
 * gate. Used to verify the email pipeline end-to-end without waiting for 8 AM.
 */
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  try {
    const result = await buildAndSendDigest({
      id: user.id,
      email: user.email,
      timezone: user.timezone,
    });

    if (!result.sent && result.reason === "no_outstanding_quests") {
      return jsonResponse({ sent: false, message: "No outstanding quests — nothing to send." });
    }
    if (!result.sent) {
      return jsonResponse({
        sent: false,
        message: "Email not sent (RESEND_API_KEY not configured).",
      });
    }

    log.info({ userId: user.id }, "test digest sent");
    return jsonResponse({ sent: true, message: `Digest sent to ${user.email}.` });
  } catch (err) {
    log.error({ userId: user.id, err }, "test digest failed");
    return errorResponse("Failed to send digest", 500);
  }
}
