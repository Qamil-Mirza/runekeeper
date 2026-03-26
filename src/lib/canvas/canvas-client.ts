import { createLogger } from "@/lib/logger";

const log = createLogger("canvas-client");

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CanvasTerm {
  id: number;
  name: string;
  start_at: string | null; // ISO datetime
  end_at: string | null; // ISO datetime
}

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  enrollment_term_id: number;
  term?: CanvasTerm;
}

export interface CanvasSubmission {
  submitted_at: string | null;
  workflow_state: string; // "unsubmitted" | "submitted" | "graded" | etc.
}

export interface CanvasAssignment {
  id: number;
  name: string;
  description: string | null; // HTML
  due_at: string | null; // ISO datetime
  points_possible: number | null;
  html_url: string;
  course_id: number;
  submission?: CanvasSubmission;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class CanvasAuthError extends Error {
  constructor(message = "Invalid or expired Canvas API token") {
    super(message);
    this.name = "CanvasAuthError";
  }
}

export class CanvasRateLimitError extends Error {
  constructor(message = "Canvas API rate limit exceeded") {
    super(message);
    this.name = "CanvasRateLimitError";
  }
}

// ─── Core Fetch Helper ──────────────────────────────────────────────────────

function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

async function canvasFetch<T>(
  baseUrl: string,
  token: string,
  path: string,
  params?: Record<string, string>
): Promise<T[]> {
  const results: T[] = [];
  const url = new URL(`/api/v1${path}`, baseUrl);
  url.searchParams.set("per_page", "100");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      throw new CanvasAuthError();
    }
    if (response.status === 403) {
      const remaining = response.headers.get("X-Rate-Limit-Remaining");
      if (remaining === "0") {
        throw new CanvasRateLimitError();
      }
      throw new Error(`Canvas API forbidden: ${response.statusText}`);
    }
    if (!response.ok) {
      throw new Error(
        `Canvas API error ${response.status}: ${response.statusText}`
      );
    }

    const data = (await response.json()) as T[];
    results.push(...data);

    nextUrl = parseNextLink(response.headers.get("Link"));
  }

  return results;
}

// ─── Exported Functions ─────────────────────────────────────────────────────

export async function validateToken(
  baseUrl: string,
  token: string
): Promise<boolean> {
  try {
    const response = await fetch(new URL("/api/v1/users/self", baseUrl), {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch (error) {
    log.error({ err: error }, "failed to validate Canvas token");
    return false;
  }
}

export async function fetchActiveCourses(
  baseUrl: string,
  token: string
): Promise<CanvasCourse[]> {
  return canvasFetch<CanvasCourse>(baseUrl, token, "/courses", {
    enrollment_state: "active",
    "include[]": "term",
  });
}

export async function fetchCourseAssignments(
  baseUrl: string,
  token: string,
  courseId: number
): Promise<CanvasAssignment[]> {
  return canvasFetch<CanvasAssignment>(
    baseUrl,
    token,
    `/courses/${courseId}/assignments`,
    {
      bucket: "upcoming",
      "include[]": "submission",
    }
  );
}
