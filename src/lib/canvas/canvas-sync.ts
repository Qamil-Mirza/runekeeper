import { db } from "@/db";
import { integrations, tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  fetchActiveCourses,
  fetchCourseAssignments,
  CanvasAuthError,
  CanvasRateLimitError,
} from "./canvas-client";
import type { CanvasAssignment, CanvasCourse } from "./canvas-client";
import { createLogger } from "@/lib/logger";

const log = createLogger("canvas-sync");

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CanvasSyncResult {
  processed: number;
  tasksCreated: number;
  errors: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripHtml(html: string | null): string {
  if (!html) return "";
  const stripped = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > 500 ? stripped.slice(0, 497) + "..." : stripped;
}

function computePriority(dueAt: string): "high" | "medium" | "low" {
  const now = Date.now();
  const due = new Date(dueAt).getTime();
  const daysUntilDue = (due - now) / (1000 * 60 * 60 * 24);

  if (daysUntilDue <= 2) return "high";
  if (daysUntilDue <= 7) return "medium";
  return "low";
}

function isUnsubmitted(assignment: CanvasAssignment): boolean {
  if (!assignment.submission) return true;
  const state = assignment.submission.workflow_state;
  return state === "unsubmitted" || !assignment.submission.submitted_at;
}

function toDueDate(dueAt: string): string {
  // Extract date portion (YYYY-MM-DD) from ISO datetime
  return dueAt.split("T")[0];
}

// ─── Main Sync Function ────────────────────────────────────────────────────

export async function syncCanvasForUser(
  userId: string,
  apiToken: string,
  baseUrl: string,
  integrationId: string
): Promise<CanvasSyncResult> {
  const result: CanvasSyncResult = { processed: 0, tasksCreated: 0, errors: [] };

  try {
    // 1. Fetch active courses
    const courses = await fetchActiveCourses(baseUrl, apiToken);
    log.info({ userId, courseCount: courses.length }, "fetched active courses");

    // 2. Process each course
    for (const course of courses) {
      try {
        await processCourse(userId, apiToken, baseUrl, course, result);
      } catch (error) {
        if (error instanceof CanvasRateLimitError) {
          result.errors.push("Canvas rate limit reached — partial sync completed");
          break;
        }
        if (error instanceof CanvasAuthError) {
          throw error; // bubble up auth errors
        }
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        log.error({ courseId: course.id, err: error }, "failed to sync course");
        result.errors.push(`${course.course_code}: ${errMsg}`);
      }
    }

    // 3. Update integration status
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
    log.error({ userId, err: error }, "canvas sync failed");

    // On auth error, disable integration
    const isAuthError = error instanceof CanvasAuthError;
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
    {
      userId,
      processed: result.processed,
      tasksCreated: result.tasksCreated,
      errors: result.errors.length,
    },
    "canvas sync complete"
  );

  return result;
}

async function processCourse(
  userId: string,
  apiToken: string,
  baseUrl: string,
  course: CanvasCourse,
  result: CanvasSyncResult
): Promise<void> {
  const assignments = await fetchCourseAssignments(
    baseUrl,
    apiToken,
    course.id
  );

  const now = new Date();

  for (const assignment of assignments) {
    // Skip if no due date or due date is in the past
    if (!assignment.due_at || new Date(assignment.due_at) <= now) continue;

    // Skip if already submitted
    if (!isUnsubmitted(assignment)) continue;

    result.processed++;

    // Dedup check
    const [existing] = await db
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.canvasAssignmentId, String(assignment.id))
        )
      )
      .limit(1);

    if (existing) {
      log.debug(
        { assignmentId: assignment.id, taskId: existing.id },
        "assignment already imported, skipping"
      );
      continue;
    }

    // Create task
    const description = stripHtml(assignment.description);
    const notes = [
      `Course: ${course.name}`,
      description ? `\n${description}` : "",
      `\nCanvas: ${assignment.html_url}`,
    ].join("");

    await db.insert(tasks).values({
      userId,
      title: `[${course.course_code}] ${assignment.name}`,
      notes,
      priority: computePriority(assignment.due_at),
      estimateMinutes: 60,
      dueDate: toDueDate(assignment.due_at),
      status: "unscheduled",
      canvasAssignmentId: String(assignment.id),
    });

    result.tasksCreated++;
    log.debug(
      { assignmentId: assignment.id, title: assignment.name },
      "created task from canvas assignment"
    );
  }
}
