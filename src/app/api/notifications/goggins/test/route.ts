import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { placeGogginsCall } from "@/lib/notifications/goggins-scheduler";
import { createLogger } from "@/lib/logger";

const log = createLogger("goggins-test");

const REASON_MESSAGE: Record<string, string> = {
  no_overdue_quests: "No overdue quests — nothing to call about.",
  not_configured: "No phone number set. Add one in notification settings first.",
  no_base_url: "NEXTAUTH_URL is not set — Twilio can't fetch the audio.",
  tts_unavailable: "Voice not generated (ELEVENLABS_API_KEY/VOICE_ID not configured).",
  phone_unavailable: "Call not placed (Twilio not configured).",
};

/**
 * Places the current user's Goggins overdue-quest call immediately, ignoring
 * the daily time gate. Mirrors the digest test endpoint — used to verify the
 * call pipeline end-to-end without waiting for the configured call time.
 */
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  try {
    const result = await placeGogginsCall({
      id: user.id,
      timezone: user.timezone,
      phoneNumber: user.preferences?.gogginsPhoneNumber,
    });

    if (result.called) {
      log.info({ userId: user.id }, "test goggins call placed");
      return jsonResponse({
        called: true,
        message: `Calling ${user.preferences?.gogginsPhoneNumber}…`,
      });
    }

    return jsonResponse({
      called: false,
      reason: result.reason,
      message: REASON_MESSAGE[result.reason ?? ""] ?? "Call not placed.",
    });
  } catch (err) {
    log.error({ userId: user.id, err }, "test goggins call failed");
    return errorResponse("Failed to place call", 500);
  }
}
