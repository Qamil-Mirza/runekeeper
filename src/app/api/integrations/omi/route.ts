import { db } from "@/db";
import { integrations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:integrations:omi");

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const [integration] = await db
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.userId, user.id), eq(integrations.provider, "omi"))
    )
    .limit(1);

  if (!integration) {
    return jsonResponse({
      enabled: false,
      config: { omiUserId: null },
    });
  }

  return jsonResponse({
    enabled: integration.enabled,
    config: {
      omiUserId: integration.config?.omiUserId ?? null,
    },
  });
}

export async function PUT(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const body = await req.json();
  const { enabled, omiUserId } = body as {
    enabled?: boolean;
    omiUserId?: string;
  };

  // Build config update
  const configUpdate: Record<string, unknown> = {};
  if (omiUserId !== undefined) configUpdate.omiUserId = omiUserId;

  // Get existing config to merge
  const [existing] = await db
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.userId, user.id), eq(integrations.provider, "omi"))
    )
    .limit(1);

  const mergedConfig = { ...(existing?.config ?? {}), ...configUpdate };

  // Upsert
  const [updated] = await db
    .insert(integrations)
    .values({
      userId: user.id,
      provider: "omi",
      enabled: enabled ?? !!omiUserId,
      config: mergedConfig,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [integrations.userId, integrations.provider],
      set: {
        ...(enabled !== undefined && { enabled }),
        config: mergedConfig,
        updatedAt: new Date(),
      },
    })
    .returning();

  log.info({ userId: user.id, enabled: updated.enabled }, "omi integration updated");

  return jsonResponse({
    enabled: updated.enabled,
    config: {
      omiUserId: updated.config?.omiUserId ?? null,
    },
  });
}
