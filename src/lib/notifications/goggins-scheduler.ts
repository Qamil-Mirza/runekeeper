import { db } from "@/db";
import { users, tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { dbTaskToTask } from "@/lib/types";
import { buildGogginsRant } from "@/lib/notifications/goggins";
import { synthesizeSpeech } from "@/lib/notifications/tts";
import { putAudio } from "@/lib/notifications/audio-cache";
import { placeCall } from "@/lib/notifications/phone";
import { localNow, resolveSlots } from "@/lib/notifications/time";
import { createLogger } from "@/lib/logger";

const log = createLogger("goggins-scheduler");

const TICK_INTERVAL_MS = 60_000; // 1 minute — fire configured times within ~60s
const DEFAULT_GOGGINS_TIMES = ["18:00"]; // evening, after you've had all day

let started = false;

export interface GogginsCallResult {
  called: boolean;
  reason?:
    | "no_overdue_quests"
    | "not_configured" // no phone number set
    | "no_base_url" // NEXTAUTH_URL unset — Twilio can't fetch the audio
    | "tts_unavailable" // ElevenLabs not configured / failed
    | "phone_unavailable"; // Twilio not configured
}

/** Global kill-switch — phone calls are opt-in, so default OFF. */
function phoneNotificationsEnabled(): boolean {
  const v = process.env.PHONE_NOTIFICATIONS_ENABLED;
  return v === "true" || v === "1";
}

/** Public origin Twilio fetches the audio from; trailing slash trimmed. */
function publicBaseUrl(): string | null {
  const raw = process.env.NEXTAUTH_URL;
  return raw ? raw.replace(/\/+$/, "") : null;
}

/**
 * Builds and places the Goggins overdue-quest call for a single user, ignoring
 * the time gate. Shared by the scheduler tick and the manual test endpoint
 * (mirrors `buildAndSendDigest`). `placeCall` may throw on a Twilio API error;
 * callers wrap accordingly so the slot retries on the next tick.
 */
export async function placeGogginsCall(user: {
  id: string;
  timezone: string;
  phoneNumber: string | null | undefined;
}): Promise<GogginsCallResult> {
  if (!user.phoneNumber) return { called: false, reason: "not_configured" };

  const base = publicBaseUrl();
  if (!base) return { called: false, reason: "no_base_url" };

  const today = localNow(user.timezone).date;
  const rows = await db.select().from(tasks).where(eq(tasks.userId, user.id));
  const overdue = rows
    .map(dbTaskToTask)
    .filter((t) => t.status !== "done" && !!t.dueDate && t.dueDate < today);

  const rant = buildGogginsRant(overdue, today);
  if (!rant) return { called: false, reason: "no_overdue_quests" };

  const audio = await synthesizeSpeech(rant);
  if (!audio) return { called: false, reason: "tts_unavailable" };

  const token = putAudio(audio);
  const audioUrl = `${base}/api/notifications/goggins/audio?token=${token}`;
  const ok = await placeCall({ to: user.phoneNumber, audioUrl });

  return ok ? { called: true } : { called: false, reason: "phone_unavailable" };
}

/**
 * One scheduler pass: call every user whose local clock has reached a configured
 * call slot, who has the feature enabled and a number set, and who has at least
 * one overdue quest. Dedupes per slot per day via `gogginsCallSentLog`.
 */
async function tick(): Promise<void> {
  if (!phoneNotificationsEnabled()) return;

  const allUsers = await db.select().from(users);

  for (const u of allUsers) {
    try {
      const prefs = u.preferences;
      if (prefs?.gogginsCallEnabled !== true) continue; // opt-in only
      const phone = prefs?.gogginsPhoneNumber;
      if (!phone) continue;

      const slots = resolveSlots(prefs?.gogginsCallTimes, DEFAULT_GOGGINS_TIMES);
      if (slots.length === 0) continue;

      const { date, minutes } = localNow(u.timezone);
      const sentLog = u.gogginsCallSentLog ?? {};

      // Slots whose time has arrived today but haven't fired yet today.
      const reached = slots
        .filter((s) => minutes >= s.mins && sentLog[s.raw] !== date)
        .sort((a, b) => a.mins - b.mins);
      if (reached.length === 0) continue;

      // One call per tick — the rant covers all overdue quests regardless of slot.
      const result = await placeGogginsCall({
        id: u.id,
        timezone: u.timezone,
        phoneNumber: phone,
      });

      // Persist the dedup log, pruned to currently-configured slots so it can't
      // grow unbounded. Mark every reached slot as handled today (covers
      // catch-up after downtime without a burst of calls). A thrown call error
      // skips this update via the catch below, so the next tick retries.
      const newLog: Record<string, string> = {};
      for (const s of slots) if (sentLog[s.raw]) newLog[s.raw] = sentLog[s.raw];
      for (const s of reached) newLog[s.raw] = date;
      await db
        .update(users)
        .set({ gogginsCallSentLog: newLog })
        .where(eq(users.id, u.id));

      if (result.called) {
        log.info(
          { userId: u.id, slots: reached.map((s) => s.raw) },
          "[goggins] call placed"
        );
      } else {
        log.debug({ userId: u.id, reason: result.reason }, "[goggins] skipped");
      }
    } catch (err) {
      log.error({ userId: u.id, err }, "[goggins] failed for user");
    }
  }
}

/**
 * Starts the Goggins overdue-quest call scheduler. Safe to call once at server
 * boot; repeated calls are ignored.
 */
export function startGogginsScheduler(): void {
  if (started) return;
  started = true;

  log.info(
    { intervalMs: TICK_INTERVAL_MS, enabled: phoneNotificationsEnabled() },
    "goggins scheduler started"
  );

  void tick().catch((err) => log.error({ err }, "[goggins] initial tick failed"));
  setInterval(() => {
    void tick().catch((err) => log.error({ err }, "[goggins] tick failed"));
  }, TICK_INTERVAL_MS).unref?.();
}
