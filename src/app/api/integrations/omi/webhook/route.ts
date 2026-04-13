import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";
import { createLogger } from "@/lib/logger";
import {
  getRegistry,
  pushEventToUser,
  pipeOmiAudio,
  setOmiActive,
} from "@/lib/voice/omi-bridge";

const log = createLogger("api:integrations:omi:webhook");

// Track last audio timestamp per user to detect OMI going silent
const lastAudioTimestamp = new Map<string, number>();
const OMI_SILENCE_TIMEOUT_MS = 5000;

function verifyWebhookToken(token: string | null): boolean {
  const secret = process.env.OMI_WEBHOOK_SECRET;
  if (!token || !secret) return false;
  if (token.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

async function lookupUserByOmiId(omiUserId: string): Promise<string | null> {
  const [integration] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.provider, "omi"),
        eq(integrations.enabled, true)
      )
    )
    .limit(1);

  if (!integration) return null;

  // Check if this integration's omiUserId matches
  const config = integration.config as { omiUserId?: string } | null;
  if (config?.omiUserId !== omiUserId) return null;

  return integration.userId;
}

export async function POST(request: NextRequest) {
  // Verify shared secret
  const token = request.nextUrl.searchParams.get("token");
  if (!verifyWebhookToken(token)) {
    return errorResponse("Forbidden", 403);
  }

  const registry = getRegistry();
  if (!registry) {
    log.error("OMI webhook called but registry not initialized");
    return errorResponse("Service unavailable", 503);
  }

  const contentType = request.headers.get("content-type") || "";

  // ─── Audio stream ──────────────────────────────────────────────────────
  if (contentType.includes("application/octet-stream")) {
    const omiUserId = request.nextUrl.searchParams.get("uid");
    if (!omiUserId) {
      return jsonResponse({ status: "ok" });
    }

    const userId = await lookupUserByOmiId(omiUserId);
    if (!userId) {
      log.warn({ omiUserId }, "audio received for unknown OMI user");
      return jsonResponse({ status: "ok" });
    }

    // Read raw audio bytes
    const arrayBuffer = await request.arrayBuffer();
    const pcmBuffer = Buffer.from(arrayBuffer);

    // Track timestamps for silence detection
    const now = Date.now();
    const hadPreviousAudio = lastAudioTimestamp.has(userId);
    lastAudioTimestamp.set(userId, now);

    // First audio chunk — notify browser to mute its mic
    if (!hadPreviousAudio) {
      setOmiActive(registry, userId, true);
    }

    // Pipe into active Gemini session
    pipeOmiAudio(registry, userId, pcmBuffer);

    // Schedule silence check
    setTimeout(() => {
      const lastTs = lastAudioTimestamp.get(userId);
      if (lastTs && Date.now() - lastTs >= OMI_SILENCE_TIMEOUT_MS) {
        lastAudioTimestamp.delete(userId);
        setOmiActive(registry, userId, false);
        log.info({ userId }, "OMI audio timed out, deactivating");
      }
    }, OMI_SILENCE_TIMEOUT_MS + 500);

    return jsonResponse({ status: "ok" });
  }

  // ─── Button / JSON events ─────────────────────────────────────────────
  try {
    const body = await request.json();
    const omiUserId = body.uid || body.userId;
    if (!omiUserId) {
      log.warn("button event with no uid");
      return jsonResponse({ status: "ok" });
    }

    const userId = await lookupUserByOmiId(omiUserId);
    if (!userId) {
      log.warn({ omiUserId }, "button event for unknown OMI user");
      return jsonResponse({ status: "ok" });
    }

    log.info({ userId, event: body.type || "button" }, "OMI button trigger received");
    pushEventToUser(registry, userId, { type: "omi_trigger" });
  } catch (err) {
    log.error({ err }, "failed to parse OMI webhook payload");
  }

  return jsonResponse({ status: "ok" });
}
