import { db } from "@/db";
import { integrations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { encrypt } from "@/lib/crypto";
import { validateToken } from "@/lib/canvas/canvas-client";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:integrations:canvas");

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const [integration] = await db
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.userId, user.id), eq(integrations.provider, "canvas"))
    )
    .limit(1);

  if (!integration) {
    return jsonResponse({
      enabled: false,
      config: { canvasBaseUrl: null, hasToken: false },
      lastSyncAt: null,
      lastSyncError: null,
    });
  }

  return jsonResponse({
    enabled: integration.enabled,
    config: {
      canvasBaseUrl: integration.config?.canvasBaseUrl ?? null,
      hasToken: !!integration.config?.canvasApiToken,
    },
    lastSyncAt: integration.lastSyncAt,
    lastSyncError: integration.lastSyncError,
  });
}

export async function PUT(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const body = await req.json();
  const { enabled, canvasBaseUrl, canvasApiToken } = body as {
    enabled?: boolean;
    canvasBaseUrl?: string;
    canvasApiToken?: string;
  };

  // Normalize URL
  const normalizedUrl = canvasBaseUrl?.replace(/\/+$/, "");

  // Validate token if provided
  if (canvasApiToken && normalizedUrl) {
    const valid = await validateToken(normalizedUrl, canvasApiToken);
    if (!valid) {
      return errorResponse(
        "Invalid Canvas API token or unreachable Canvas URL. Please check your token and URL.",
        400
      );
    }
  }

  // Build config update
  const configUpdate: Record<string, unknown> = {};
  if (normalizedUrl !== undefined) configUpdate.canvasBaseUrl = normalizedUrl;
  if (canvasApiToken) configUpdate.canvasApiToken = encrypt(canvasApiToken);

  // Get existing config to merge
  const [existing] = await db
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.userId, user.id), eq(integrations.provider, "canvas"))
    )
    .limit(1);

  const mergedConfig = { ...(existing?.config ?? {}), ...configUpdate };

  // Upsert
  const [updated] = await db
    .insert(integrations)
    .values({
      userId: user.id,
      provider: "canvas",
      enabled: enabled ?? !!canvasApiToken,
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

  log.info({ userId: user.id, enabled: updated.enabled }, "canvas integration updated");

  return jsonResponse({
    enabled: updated.enabled,
    config: {
      canvasBaseUrl: updated.config?.canvasBaseUrl ?? null,
      hasToken: !!updated.config?.canvasApiToken,
    },
    lastSyncAt: updated.lastSyncAt,
    lastSyncError: updated.lastSyncError,
  });
}
