import { db } from "@/db";
import { users, tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { dbTaskToTask } from "@/lib/types";
import { buildDigest } from "@/lib/notifications/digest";
import { sendEmail } from "@/lib/notifications/email";
import { createLogger } from "@/lib/logger";

const log = createLogger("digest-scheduler");

const TICK_INTERVAL_MS = 5 * 60_000; // 5 minutes
const DEFAULT_DIGEST_TIMES = ["08:00"];

let started = false;

export interface DigestResult {
  sent: boolean;
  reason?: "no_outstanding_quests" | "email_disabled";
}

/** Whether email notifications are globally enabled (kill-switch). */
function notificationsEnabled(): boolean {
  const v = process.env.EMAIL_NOTIFICATIONS_ENABLED;
  return v !== "false" && v !== "0";
}

/** Current local date ("YYYY-MM-DD") and minutes-since-midnight in the given timezone. */
function localNow(timezone: string): { date: string; minutes: number } {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA", { timeZone: timezone });
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const hh = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) % 24;
  const mm = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return { date, minutes: hh * 60 + mm };
}

/** Parse "HH:MM" to minutes-since-midnight, or null if malformed/out of range. */
function parseSlot(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Resolve a user's configured digest times (valid "HH:MM" slots), defaulting to 08:00. */
function resolveSlots(times: string[] | undefined): { raw: string; mins: number }[] {
  const source = times && times.length > 0 ? times : DEFAULT_DIGEST_TIMES;
  return source
    .map((raw) => ({ raw, mins: parseSlot(raw) }))
    .filter((s): s is { raw: string; mins: number } => s.mins !== null);
}

/**
 * Builds and sends the quest digest for a single user, ignoring the time gate.
 * Shared by the scheduler tick and the manual test endpoint.
 */
export async function buildAndSendDigest(user: {
  id: string;
  email: string;
  timezone: string;
}): Promise<DigestResult> {
  const rows = await db.select().from(tasks).where(eq(tasks.userId, user.id));
  const digest = buildDigest(rows.map(dbTaskToTask), user.timezone);

  if (!digest) return { sent: false, reason: "no_outstanding_quests" };

  const sent = await sendEmail({
    to: user.email,
    subject: digest.subject,
    html: digest.html,
  });

  return sent ? { sent: true } : { sent: false, reason: "email_disabled" };
}

/**
 * One scheduler pass: send the digest to every user whose local clock has
 * reached their digest hour and who hasn't already received today's digest.
 */
async function tick(): Promise<void> {
  if (!notificationsEnabled()) return;

  const allUsers = await db.select().from(users);

  for (const u of allUsers) {
    try {
      const prefs = u.preferences;
      if (prefs?.digestEnabled === false) continue;

      const slots = resolveSlots(prefs?.digestTimes);
      if (slots.length === 0) continue;

      const { date, minutes } = localNow(u.timezone);
      const sentLog = u.digestSentLog ?? {};

      // Slots whose time has arrived today but haven't been sent yet today.
      const reached = slots
        .filter((s) => minutes >= s.mins && sentLog[s.raw] !== date)
        .sort((a, b) => a.mins - b.mins);
      if (reached.length === 0) continue;

      // The digest content is "current outstanding quests" regardless of slot,
      // so send a single email per tick. A thrown send error skips the log
      // update below, so the next tick retries.
      const result = await buildAndSendDigest({
        id: u.id,
        email: u.email,
        timezone: u.timezone,
      });

      // Persist the dedup log, pruned to currently-configured slots so it can't
      // grow unbounded as the user edits their times. Mark every reached slot as
      // sent today (covers catch-up after downtime without a burst of emails).
      const newLog: Record<string, string> = {};
      for (const s of slots) if (sentLog[s.raw]) newLog[s.raw] = sentLog[s.raw];
      for (const s of reached) newLog[s.raw] = date;
      await db
        .update(users)
        .set({ digestSentLog: newLog })
        .where(eq(users.id, u.id));

      if (result.sent) {
        log.info(
          { userId: u.id, email: u.email, slots: reached.map((s) => s.raw) },
          "[digest] sent"
        );
      } else {
        log.debug({ userId: u.id, reason: result.reason }, "[digest] skipped");
      }
    } catch (err) {
      log.error({ userId: u.id, err }, "[digest] failed for user");
    }
  }
}

/**
 * Starts the daily quest-digest scheduler. Safe to call once at server boot;
 * repeated calls are ignored.
 */
export function startDigestScheduler(): void {
  if (started) return;
  started = true;

  log.info(
    { intervalMs: TICK_INTERVAL_MS, enabled: notificationsEnabled() },
    "digest scheduler started"
  );

  // Run an initial pass shortly after boot, then on the interval.
  void tick().catch((err) => log.error({ err }, "[digest] initial tick failed"));
  setInterval(() => {
    void tick().catch((err) => log.error({ err }, "[digest] tick failed"));
  }, TICK_INTERVAL_MS).unref?.();
}
