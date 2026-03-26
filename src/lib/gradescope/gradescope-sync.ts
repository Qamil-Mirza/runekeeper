import { db } from "@/db";
import { integrations, tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  authenticate,
  fetchCourses,
  fetchAssignments,
  GradescopeAuthError,
  GradescopeRateLimitError,
} from "./gradescope-client";
import type { GradescopeAssignment, GradescopeCourse } from "./gradescope-client";
import { createLogger } from "@/lib/logger";

const log = createLogger("gradescope-sync");

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GradescopeSyncResult {
  processed: number;
  tasksCreated: number;
  errors: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function computePriority(dueAt: string): "high" | "medium" | "low" {
  const now = Date.now();
  const due = new Date(dueAt).getTime();
  const daysUntilDue = (due - now) / (1000 * 60 * 60 * 24);

  if (daysUntilDue <= 2) return "high";
  if (daysUntilDue <= 7) return "medium";
  return "low";
}

function toDueDate(dueAt: string, timezone: string): string {
  const date = new Date(dueAt);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDueTime(dueAt: string, timezone: string): string {
  const date = new Date(dueAt);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function isSubmitted(status: string): boolean {
  const lower = status.toLowerCase();
  return (
    lower.includes("submitted") ||
    lower.includes("graded") ||
    lower.includes("regrade")
  );
}

function filterToCurrentTerm(courses: GradescopeCourse[]): GradescopeCourse[] {
  if (courses.length === 0) return courses;

  // Group by term
  const termGroups = new Map<string, GradescopeCourse[]>();
  for (const course of courses) {
    const term = course.term || "Unknown";
    if (!termGroups.has(term)) termGroups.set(term, []);
    termGroups.get(term)!.push(course);
  }

  // If only one term, return all
  if (termGroups.size <= 1) return courses;

  // Try to find the most recent term by parsing term names
  // Common formats: "Spring 2026", "Fall 2025", "Summer 2025"
  const termOrder = ["winter", "spring", "summer", "fall"];
  let bestTerm = courses[0].term;
  let bestScore = -1;

  for (const term of termGroups.keys()) {
    const lower = term.toLowerCase();
    const yearMatch = lower.match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1]) : 0;
    const seasonIdx = termOrder.findIndex((s) => lower.includes(s));
    const season = seasonIdx >= 0 ? seasonIdx : 0;
    const score = year * 10 + season;

    if (score > bestScore) {
      bestScore = score;
      bestTerm = term;
    }
  }

  const filtered = termGroups.get(bestTerm) ?? courses;
  log.info(
    { term: bestTerm, courseCount: filtered.length },
    "filtered to most recent term"
  );
  return filtered;
}

const POLITE_DELAY_MS = 500;

// ─── Main Sync Function ────────────────────────────────────────────────────

export async function syncGradescopeForUser(
  userId: string,
  email: string,
  password: string,
  integrationId: string,
  timezone: string = "America/Los_Angeles"
): Promise<GradescopeSyncResult> {
  const result: GradescopeSyncResult = {
    processed: 0,
    tasksCreated: 0,
    errors: [],
  };

  try {
    // 1. Authenticate
    const sessionCookie = await authenticate(email, password);

    // 2. Fetch and filter courses
    const allCourses = await fetchCourses(sessionCookie);
    const courses = filterToCurrentTerm(allCourses);
    log.info(
      {
        userId,
        totalCourses: allCourses.length,
        filteredCourses: courses.length,
      },
      "fetched and filtered gradescope courses"
    );

    // 3. Process each course
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      try {
        // Polite delay between requests
        if (i > 0) {
          await new Promise((r) => setTimeout(r, POLITE_DELAY_MS));
        }
        await processCourse(
          userId,
          sessionCookie,
          course,
          result,
          timezone
        );
      } catch (error) {
        if (error instanceof GradescopeRateLimitError) {
          result.errors.push(
            "Gradescope rate limit reached — partial sync completed"
          );
          break;
        }
        if (error instanceof GradescopeAuthError) {
          throw error;
        }
        const errMsg =
          error instanceof Error ? error.message : "Unknown error";
        log.error(
          { courseId: course.id, err: error },
          "failed to sync gradescope course"
        );
        result.errors.push(`${course.shortName}: ${errMsg}`);
      }
    }

    // 4. Update integration status
    await db
      .update(integrations)
      .set({
        lastSyncAt: new Date(),
        lastSyncError:
          result.errors.length > 0 ? result.errors.join("; ") : null,
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, integrationId));
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    log.error({ userId, err: error }, "gradescope sync failed");

    const isAuthError = error instanceof GradescopeAuthError;
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
    "gradescope sync complete"
  );

  return result;
}

async function processCourse(
  userId: string,
  sessionCookie: string,
  course: GradescopeCourse,
  result: GradescopeSyncResult,
  timezone: string
): Promise<void> {
  const assignments = await fetchAssignments(
    sessionCookie,
    course.id,
    course.name,
    course.shortName
  );

  const now = new Date();

  for (const assignment of assignments) {
    // Skip if no due date or due date is in the past
    if (!assignment.dueAt || new Date(assignment.dueAt) <= now) continue;

    // Skip if already submitted
    if (isSubmitted(assignment.status)) continue;

    result.processed++;

    // Dedup check
    const [existing] = await db
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.gradescopeAssignmentId, assignment.id)
        )
      )
      .limit(1);

    if (existing) {
      log.debug(
        { assignmentId: assignment.id, taskId: existing.id },
        "gradescope assignment already imported, skipping"
      );
      continue;
    }

    // Create task
    const dueTime = formatDueTime(assignment.dueAt, timezone);
    const notes = [
      `Course: ${assignment.courseName}`,
      `\nDue: ${toDueDate(assignment.dueAt, timezone)} at ${dueTime}`,
      `\nGradescope: ${assignment.htmlUrl}`,
    ].join("");

    await db.insert(tasks).values({
      userId,
      title: `[${assignment.courseShortName}] ${assignment.name}`,
      notes,
      priority: computePriority(assignment.dueAt),
      estimateMinutes: 60,
      dueDate: toDueDate(assignment.dueAt, timezone),
      status: "unscheduled",
      gradescopeAssignmentId: assignment.id,
    });

    result.tasksCreated++;
    log.debug(
      { assignmentId: assignment.id, title: assignment.name },
      "created task from gradescope assignment"
    );
  }
}
