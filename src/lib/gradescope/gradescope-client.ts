import * as cheerio from "cheerio";
import { createLogger } from "@/lib/logger";

const log = createLogger("gradescope-client");

const GRADESCOPE_BASE = "https://www.gradescope.com";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GradescopeCourse {
  id: string;
  name: string;
  shortName: string;
  term: string;
}

export interface GradescopeAssignment {
  id: string;
  name: string;
  courseId: string;
  courseName: string;
  courseShortName: string;
  dueAt: string | null; // ISO datetime
  status: string;
  htmlUrl: string;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class GradescopeAuthError extends Error {
  constructor(message = "Invalid Gradescope credentials") {
    super(message);
    this.name = "GradescopeAuthError";
  }
}

export class GradescopeRateLimitError extends Error {
  constructor(message = "Gradescope rate limit exceeded") {
    super(message);
    this.name = "GradescopeRateLimitError";
  }
}

// ─── Cookie Helpers ─────────────────────────────────────────────────────────

function extractCookies(headers: Headers): string {
  const setCookies = headers.getSetCookie?.() ?? [];
  const cookies: Record<string, string> = {};
  for (const sc of setCookies) {
    const match = sc.match(/^([^=]+)=([^;]*)/);
    if (match) cookies[match[1]] = match[2];
  }
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// ─── Authentication ─────────────────────────────────────────────────────────

export async function authenticate(
  email: string,
  password: string
): Promise<string> {
  // Step 1: GET /login to obtain CSRF authenticity_token
  const loginPageRes = await fetch(`${GRADESCOPE_BASE}/login`, {
    redirect: "manual",
  });
  const loginHtml = await loginPageRes.text();
  const $login = cheerio.load(loginHtml);
  const authenticityToken = $login(
    'input[name="authenticity_token"]'
  ).val() as string;

  if (!authenticityToken) {
    log.error("could not find authenticity_token on login page");
    throw new GradescopeAuthError(
      "Failed to load Gradescope login page"
    );
  }

  // Carry cookies from the login page (session init)
  const initCookies = extractCookies(loginPageRes.headers);

  // Step 2: POST /login with credentials
  const formBody = new URLSearchParams({
    utf8: "✓",
    authenticity_token: authenticityToken,
    "session[email]": email,
    "session[password]": password,
    "session[remember_me]": "0",
    commit: "Log In",
    "session[remember_me_sso]": "0",
  });

  const loginRes = await fetch(`${GRADESCOPE_BASE}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: initCookies,
    },
    body: formBody.toString(),
    redirect: "manual",
  });

  if (loginRes.status === 429) {
    throw new GradescopeRateLimitError();
  }

  // Check for successful login (302 redirect to /)
  const location = loginRes.headers.get("location") ?? "";
  if (
    loginRes.status !== 302 ||
    location.includes("/login")
  ) {
    throw new GradescopeAuthError(
      "Invalid email or password for Gradescope"
    );
  }

  const sessionCookies = extractCookies(loginRes.headers);
  // Merge init cookies with session cookies (session cookie overwrites)
  const merged = `${initCookies}; ${sessionCookies}`;

  log.info("gradescope authentication successful");
  return merged;
}

// ─── Fetch Courses ──────────────────────────────────────────────────────────

export async function fetchCourses(
  sessionCookie: string
): Promise<GradescopeCourse[]> {
  const res = await fetch(`${GRADESCOPE_BASE}/`, {
    headers: { Cookie: sessionCookie },
  });

  if (res.status === 429) throw new GradescopeRateLimitError();
  if (!res.ok) {
    throw new Error(`Failed to fetch Gradescope dashboard: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const courses: GradescopeCourse[] = [];

  // Student courses section
  $(".courseList--coursesForTerm").each((_, termSection) => {
    const termName = $(termSection)
      .find(".courseList--term")
      .text()
      .trim();

    $(termSection)
      .find(".courseBox")
      .each((__, courseEl) => {
        const link = $(courseEl).find("a[href^='/courses/']");
        const href = link.attr("href") ?? "";
        const courseId = href.match(/\/courses\/(\d+)/)?.[1];
        if (!courseId) return;

        const name = $(courseEl)
          .find(".courseBox--shortname")
          .text()
          .trim();
        const fullName = $(courseEl)
          .find(".courseBox--name")
          .text()
          .trim();

        courses.push({
          id: courseId,
          name: fullName || name,
          shortName: name || fullName,
          term: termName,
        });
      });
  });

  log.info({ count: courses.length }, "fetched gradescope courses");
  return courses;
}

// ─── Fetch Assignments ──────────────────────────────────────────────────────

export async function fetchAssignments(
  sessionCookie: string,
  courseId: string,
  courseName: string,
  courseShortName: string
): Promise<GradescopeAssignment[]> {
  const res = await fetch(`${GRADESCOPE_BASE}/courses/${courseId}`, {
    headers: { Cookie: sessionCookie },
  });

  if (res.status === 429) throw new GradescopeRateLimitError();
  if (!res.ok) {
    throw new Error(
      `Failed to fetch Gradescope course ${courseId}: ${res.status}`
    );
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const assignments: GradescopeAssignment[] = [];

  // Assignment table rows
  $("table.table--assignments tbody tr, .assignmentTable--body .assignmentBox").each((_, row) => {
    const $row = $(row);

    // Try table row format first
    const nameLink = $row.find("a[href*='/assignments/']");
    const href = nameLink.attr("href") ?? "";
    const assignmentId = href.match(/\/assignments\/(\d+)/)?.[1];
    if (!assignmentId) return;

    const name = nameLink.text().trim();

    // Due date — look in the due date column or time element
    const dueDateText =
      $row.find(".submissionTimeChart--dueDate").text().trim() ||
      $row.find("time").attr("datetime") ||
      $row.find(".table--primaryLink + .table--secondaryLink, td:nth-child(2)").text().trim();

    // Submission status
    const status =
      $row.find(".submissionStatus").text().trim() ||
      $row.find(".submissionStatus--text").text().trim() ||
      "No Submission";

    let dueAt: string | null = null;
    if (dueDateText) {
      // Try parsing as ISO first (from datetime attr), then as human-readable
      const parsed = new Date(dueDateText);
      if (!isNaN(parsed.getTime())) {
        dueAt = parsed.toISOString();
      }
    }

    assignments.push({
      id: assignmentId,
      name,
      courseId,
      courseName,
      courseShortName,
      dueAt,
      status,
      htmlUrl: `${GRADESCOPE_BASE}/courses/${courseId}/assignments/${assignmentId}`,
    });
  });

  log.info(
    { courseId, count: assignments.length },
    "fetched gradescope assignments"
  );
  return assignments;
}

// ─── Validate Credentials ───────────────────────────────────────────────────

export async function validateCredentials(
  email: string,
  password: string
): Promise<boolean> {
  try {
    await authenticate(email, password);
    return true;
  } catch (error) {
    if (error instanceof GradescopeAuthError) return false;
    log.error({ err: error }, "failed to validate Gradescope credentials");
    return false;
  }
}
