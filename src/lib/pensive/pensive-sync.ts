import { db } from "@/db";
import { integrations, tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  refreshIdToken,
  fetchClasses,
  fetchCourseName,
  fetchAssignments,
  fetchSubmittedIds,
  PensiveAuthError,
  PensiveRateLimitError,
} from "./pensive-client";
import type { PensiveClass } from "./pensive-client";
import { pickCurrentTerm, selectImportable, computePriority, toDueDate, formatDueTime } from "./pensive-logic";
import { encrypt, decrypt } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";

const log = createLogger("pensive-sync");

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PensiveSyncResult {
  processed: number;
  tasksCreated: number;
  errors: string[];
}

const POLITE_DELAY_MS = 500;

// ─── Main Sync Function ────────────────────────────────────────────────────

export async function syncPensiveForUser(
  userId: string,
  integrationId: string,
  timezone: string = "America/Los_Angeles"
): Promise<PensiveSyncResult> {
  const result: PensiveSyncResult = { processed: 0, tasksCreated: 0, errors: [] };

  try {
    const [integration] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.id, integrationId))
      .limit(1);

    const config = integration?.config ?? {};
    if (!config.pensiveUid || !config.pensiveApiKey || !config.pensiveRefreshToken) {
      throw new PensiveAuthError("Pensive is not connected");
    }

    // 1. Exchange refresh token for an ID token; persist rotation
    const storedRefresh = decrypt(config.pensiveRefreshToken);
    const { idToken, refreshToken } = await refreshIdToken(config.pensiveApiKey, storedRefresh);
    if (refreshToken !== storedRefresh) {
      await db
        .update(integrations)
        .set({
          config: { ...config, pensiveRefreshToken: encrypt(refreshToken) },
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, integrationId));
      log.info({ userId }, "pensive refresh token rotated");
    }

    // 2. Classes for the current term
    const allClasses = await fetchClasses(idToken, config.pensiveUid);
    const classes = pickCurrentTerm(allClasses);
    log.info({ userId, total: allClasses.length, current: classes.length }, "fetched pensive classes");

    // 3. Process each class
    for (let i = 0; i < classes.length; i++) {
      const clazz = classes[i];
      try {
        if (i > 0) await new Promise((r) => setTimeout(r, POLITE_DELAY_MS));
        await processClass(userId, idToken, config.pensiveUid, clazz, result, timezone);
      } catch (error) {
        if (error instanceof PensiveRateLimitError) {
          result.errors.push("Pensive rate limit reached — partial sync completed");
          break;
        }
        if (error instanceof PensiveAuthError) throw error;
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        log.error({ clazzId: clazz.clazzId, err: error }, "failed to sync pensive class");
        result.errors.push(`${clazz.clazzId}: ${errMsg}`);
      }
    }

    // 4. Update integration status
    await db
      .update(integrations)
      .set({
        lastSyncAt: new Date(),
        lastSyncError: result.errors.length > 0 ? result.errors.join("; ") : null,
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, integrationId));
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    log.error({ userId, err: error }, "pensive sync failed");

    const isAuthError = error instanceof PensiveAuthError;
    await db
      .update(integrations)
      .set({
        lastSyncError: errMsg,
        ...(isAuthError ? { enabled: false } : {}),
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, integrationId));

    result.errors.push(errMsg);
  }

  log.info(
    { userId, processed: result.processed, tasksCreated: result.tasksCreated, errors: result.errors.length },
    "pensive sync complete"
  );
  return result;
}

async function processClass(
  userId: string,
  idToken: string,
  uid: string,
  clazz: PensiveClass,
  result: PensiveSyncResult,
  timezone: string
): Promise<void> {
  const [courseName, assignments, submittedIds] = await Promise.all([
    fetchCourseName(idToken, clazz.schoolId, clazz.courseId),
    fetchAssignments(idToken, clazz.clazzId),
    fetchSubmittedIds(idToken, uid, clazz.clazzId),
  ]);

  for (const assignment of selectImportable(assignments, submittedIds, new Date())) {
    const dueAt = assignment.dueAt!; // selectImportable guarantees a due date
    result.processed++;

    const [existing] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.pensiveAssignmentId, assignment.id)))
      .limit(1);
    if (existing) continue;

    const dueDate = toDueDate(dueAt, timezone);
    await db.insert(tasks).values({
      userId,
      title: `${courseName}: ${assignment.name}`,
      notes: `Course: ${courseName}\nDue: ${dueDate} at ${formatDueTime(dueAt, timezone)}\nPensive: https://www.pensive.com/student/classes/${clazz.clazzId}/my-assignments`,
      priority: computePriority(dueAt),
      estimateMinutes: 60,
      dueDate,
      status: "unscheduled",
      pensiveAssignmentId: assignment.id,
    });

    result.tasksCreated++;
    log.debug({ assignmentId: assignment.id }, "created task from pensive assignment");
  }
}
