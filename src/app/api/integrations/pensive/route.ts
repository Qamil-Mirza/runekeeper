// src/app/api/integrations/pensive/route.ts
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUser, jsonResponse, errorResponse } from "@/lib/api-helpers";
import { encrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { parseAuthRecord, InvalidAuthRecordError } from "@/lib/pensive/pensive-logic";
import { refreshIdToken, fetchClasses } from "@/lib/pensive/pensive-client";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:integrations:pensive");

const putLimiter = rateLimit({ key: "pensive-put", limit: 5, windowMs: 60_000 });

type IntegrationRow = typeof integrations.$inferSelect;

function toResponse(row: IntegrationRow | undefined) {
  return {
    enabled: row?.enabled ?? false,
    config: { connected: !!row?.config?.pensiveRefreshToken },
    lastSyncAt: row?.lastSyncAt ?? null,
    lastSyncError: row?.lastSyncError ?? null,
  };
}

async function findIntegration(userId: string) {
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, "pensive")))
    .limit(1);
  return row;
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);
  return jsonResponse(toResponse(await findIntegration(user.id)));
}

export async function PUT(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const { success: withinLimit } = putLimiter.check(user.id);
  if (!withinLimit) return errorResponse("Rate limit exceeded. Try again shortly.", 429);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body", 400);
  }

  const existing = await findIntegration(user.id);

  // Disconnect: clear stored credentials
  if (body.enabled === false) {
    if (!existing) return jsonResponse(toResponse(undefined));
    const { pensiveUid: _u, pensiveApiKey: _k, pensiveRefreshToken: _r, ...rest } = existing.config ?? {};
    const [updated] = await db
      .update(integrations)
      .set({ enabled: false, config: rest, lastSyncError: null, updatedAt: new Date() })
      .where(eq(integrations.id, existing.id))
      .returning();
    log.info({ userId: user.id }, "pensive integration disconnected");
    return jsonResponse(toResponse(updated));
  }

  // Connect: parse + validate the pasted auth record
  if (typeof body.authRecord !== "string" || body.authRecord.length === 0 || body.authRecord.length > 20_000) {
    return errorResponse("Paste your Pensive auth record", 400);
  }

  let auth;
  try {
    auth = parseAuthRecord(body.authRecord);
  } catch (err) {
    if (err instanceof InvalidAuthRecordError) return errorResponse(err.message, 400);
    throw err;
  }

  let refreshToken: string;
  try {
    const tokens = await refreshIdToken(auth.apiKey, auth.refreshToken);
    await fetchClasses(tokens.idToken, auth.uid);
    refreshToken = tokens.refreshToken;
  } catch (err) {
    log.warn({ userId: user.id, err }, "pensive connection validation failed");
    return errorResponse("Couldn't connect to Pensive — copy a fresh record and try again", 400);
  }

  const mergedConfig = {
    ...(existing?.config ?? {}),
    pensiveUid: auth.uid,
    pensiveApiKey: auth.apiKey,
    pensiveRefreshToken: encrypt(refreshToken),
  };

  const [updated] = await db
    .insert(integrations)
    .values({
      userId: user.id,
      provider: "pensive",
      enabled: true,
      config: mergedConfig,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [integrations.userId, integrations.provider],
      set: { enabled: true, config: mergedConfig, lastSyncError: null, updatedAt: new Date() },
    })
    .returning();

  log.info({ userId: user.id }, "pensive integration connected");
  return jsonResponse(toResponse(updated));
}
