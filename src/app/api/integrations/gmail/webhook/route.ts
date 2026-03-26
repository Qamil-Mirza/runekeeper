import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/db";
import { users, integrations, accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";
import { createLogger } from "@/lib/logger";
import { decrypt } from "@/lib/crypto";
import { syncGmailForUser } from "@/lib/google/gmail-sync";

const log = createLogger("api:integrations:gmail:webhook");

function verifyWebhookToken(token: string | null): boolean {
  const secret = process.env.GMAIL_WEBHOOK_SECRET;
  if (!token || !secret) return false;
  if (token.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

export async function POST(request: NextRequest) {
  // Verify shared secret (timing-safe comparison)
  const token = request.nextUrl.searchParams.get("token");
  if (!verifyWebhookToken(token)) {
    return errorResponse("Forbidden", 403);
  }

  let emailAddress: string;
  let historyId: string;

  try {
    const body = await request.json();
    const data = JSON.parse(
      Buffer.from(body.message.data, "base64").toString()
    );
    emailAddress = data.emailAddress;
    historyId = data.historyId;
  } catch (err) {
    log.error({ err }, "failed to parse webhook payload");
    return jsonResponse({ status: "ok" });
  }

  try {
    // Look up user by email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, emailAddress))
      .limit(1);

    if (!user) {
      log.warn("webhook received for unknown user");
      return jsonResponse({ status: "ok" });
    }

    // Look up enabled Gmail integration
    const [integration] = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.userId, user.id),
          eq(integrations.provider, "gmail"),
          eq(integrations.enabled, true)
        )
      )
      .limit(1);

    if (!integration) {
      log.warn({ userId: user.id }, "webhook received but gmail integration not enabled");
      return jsonResponse({ status: "ok" });
    }

    // Get access token
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, user.id))
      .limit(1);

    if (!account?.access_token) {
      log.error({ userId: user.id }, "no access token for webhook sync");
      return jsonResponse({ status: "ok" });
    }

    const accessToken = decrypt(account.access_token);

    const result = await syncGmailForUser(
      user.id,
      accessToken,
      integration.id,
      "incremental",
      historyId
    );

    log.info(
      { userId: user.id, historyId, processed: result.processed },
      "webhook gmail sync completed"
    );
  } catch (err) {
    log.error({ err }, "webhook processing error");
  }

  // Always return 200 to acknowledge receipt
  return jsonResponse({ status: "ok" });
}
