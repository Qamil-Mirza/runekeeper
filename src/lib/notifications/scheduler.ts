import { db } from "@/db";
import { users, tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { dbTaskToTask } from "@/lib/types";
import { buildDigest } from "@/lib/notifications/digest";
import { sendEmail } from "@/lib/notifications/email";
import { createLogger } from "@/lib/logger";

const log = createLogger("digest-scheduler");

const TICK_INTERVAL_MS = 5 * 60_000; // 5 minutes
const DEFAULT_DIGEST_HOUR = 8;

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

/** Current hour (0–23) in the given IANA timezone. */
function localHour(timezone: string): number {
  const h = parseInt(
    new Date().toLocaleString("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }),
    10
  );
  return h % 24; // some environments render midnight as "24"
}

/** Today's calendar date ("YYYY-MM-DD") in the given IANA timezone. */
function todayInTimezone(timezone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
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

      const digestHour = prefs?.digestHour ?? DEFAULT_DIGEST_HOUR;
      if (localHour(u.timezone) !== digestHour) continue;

      const localDate = todayInTimezone(u.timezone);
      if (u.lastDigestSentOn === localDate) continue;

      const result = await buildAndSendDigest({
        id: u.id,
        email: u.email,
        timezone: u.timezone,
      });

      // Record that today's digest was evaluated, so we don't re-check every
      // tick within the hour (and don't retry when there was nothing to send).
      // A thrown send error skips this update, so the next tick retries.
      await db
        .update(users)
        .set({ lastDigestSentOn: localDate })
        .where(eq(users.id, u.id));

      if (result.sent) {
        log.info({ userId: u.id, email: u.email }, "[digest] sent");
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
