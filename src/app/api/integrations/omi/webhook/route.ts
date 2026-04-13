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
import { detectDoubleClap } from "@/lib/voice/clap-detector";

const log = createLogger("api:integrations:omi:webhook");

// Track last audio timestamp and silence timer per user
const lastAudioTimestamp = new Map<string, number>();
const silenceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const OMI_SILENCE_TIMEOUT_MS = 5000;

function verifyWebhookToken(token: string | null): boolean {
  const secret = process.env.OMI_WEBHOOK_SECRET;
  if (!token || !secret) return false;
  if (token.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

async function lookupUserByOmiId(omiUserId: string): Promise<string | null> {
  const results = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.provider, "omi"),
        eq(integrations.enabled, true)
      )
    );

  for (const integration of results) {
    const config = integration.config as { omiUserId?: string } | null;
    if (config?.omiUserId === omiUserId) {
      return integration.userId;
    }
  }

  return null;
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
    const sampleRate = parseInt(request.nextUrl.searchParams.get("sample_rate") || "16000", 10);

    // Detect double-clap to trigger voice modal (runs even without active session)
    if (detectDoubleClap(userId, pcmBuffer, sampleRate)) {
      pushEventToUser(registry, userId, { type: "omi_trigger" });
      return jsonResponse({ status: "ok" });
    }

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

    // Reset silence timer (single timer per user instead of one per chunk)
    const existingTimer = silenceTimers.get(userId);
    if (existingTimer) clearTimeout(existingTimer);
    silenceTimers.set(userId, setTimeout(() => {
      lastAudioTimestamp.delete(userId);
      silenceTimers.delete(userId);
      setOmiActive(registry, userId, false);
      log.info({ userId }, "OMI audio timed out, deactivating");
    }, OMI_SILENCE_TIMEOUT_MS));

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
