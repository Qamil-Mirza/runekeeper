import { db } from "@/db";
import { integrations, accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:integrations:gmail");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const [integration] = await db
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.userId, user.id), eq(integrations.provider, "gmail"))
    )
    .limit(1);

  if (!integration) {
    return jsonResponse({
      enabled: false,
      config: {
        monitoredSenders: [],
        autoCreateTasks: true,
        pubsubSubscriptionActive: false,
      },
      lastSyncAt: null,
    });
  }

  return jsonResponse(integration);
}

export async function PUT(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const body = await req.json();
  const { enabled, config } = body as {
    enabled?: boolean;
    config?: {
      monitoredSenders?: string[];
      autoCreateTasks?: boolean;
    };
  };

  // Validate monitored sender emails
  if (config?.monitoredSenders) {
    for (const email of config.monitoredSenders) {
      if (!EMAIL_REGEX.test(email)) {
        return errorResponse(`Invalid email address: ${email}`);
      }
    }
  }

  // If enabling, check that Gmail scope is authorized
  if (enabled) {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, user.id))
      .limit(1);

    if (!account?.scope || !account.scope.includes("gmail.readonly")) {
      return jsonResponse({
        requiresReauth: true,
        message:
          "Gmail scope not authorized. Please reconnect your Google account.",
      });
    }
  }

  // Upsert into integrations table
  const [updated] = await db
    .insert(integrations)
    .values({
      userId: user.id,
      provider: "gmail",
      enabled: enabled ?? false,
      config: config ?? {},
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [integrations.userId, integrations.provider],
      set: {
        ...(enabled !== undefined && { enabled }),
        ...(config && { config }),
        updatedAt: new Date(),
      },
    })
    .returning();

  log.info({ userId: user.id, enabled }, "gmail integration updated");
  return jsonResponse(updated);
}
