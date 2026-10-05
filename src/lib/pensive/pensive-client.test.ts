import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeClasses,
  normalizeAssignmentHeads,
  normalizeSubmittedIds,
  errorForStatus,
  PensiveAuthError,
  PensiveRateLimitError,
} from "./pensive-client";

test("normalizeClasses maps the clazz_id-keyed dashboard map", () => {
  const json = {
    cs189_fa26: { year: 2026, season: "fall", clazz_id: "cs189_fa26", course_id: "c1", school_id: "s1", create_time: 1 },
  };
  assert.deepEqual(normalizeClasses(json), [
    { clazzId: "cs189_fa26", courseId: "c1", schoolId: "s1", year: 2026, season: "fall" },
  ]);
});

test("normalizeClasses skips malformed entries", () => {
  assert.deepEqual(normalizeClasses({ bad: { year: "x" } }), []);
});

test("normalizeClasses throws on non-object", () => {
  assert.throws(() => normalizeClasses(null), /Pensive classes returned an unexpected shape/);
  assert.throws(() => normalizeClasses([]), /unexpected shape/);
});

test("normalizeAssignmentHeads throws on non-object", () => {
  assert.throws(() => normalizeAssignmentHeads("x"), /Pensive assignment heads returned an unexpected shape/);
});

test("normalizeSubmittedIds throws on non-object", () => {
  assert.throws(() => normalizeSubmittedIds(null), /Pensive submissions returned an unexpected shape/);
});

test("normalizeSubmittedIds throws on a value that is neither array nor null", () => {
  assert.throws(() => normalizeSubmittedIds({ a: "oops" }), /Pensive submissions returned an unexpected shape/);
});

test("normalizeAssignmentHeads converts epoch ms to ISO and treats 0/missing as null", () => {
  const json = {
    "uuid-1": { name: "HW 1", release_time: 1790000000000, due_time: 1791000000000, late_due_time: 1, format: "paper" },
    "uuid-2": { name: "Quiz", due_time: 0 },
    "uuid-3": { release_time: 1 }, // no name → skipped
  };
  assert.deepEqual(normalizeAssignmentHeads(json), [
    { id: "uuid-1", name: "HW 1", releaseAt: new Date(1790000000000).toISOString(), dueAt: new Date(1791000000000).toISOString() },
    { id: "uuid-2", name: "Quiz", releaseAt: null, dueAt: null },
  ]);
});

test("normalizeSubmittedIds keeps ids with at least one submission", () => {
  const json = { a: [{ submission_id: "s" }], b: [], c: null };
  assert.deepEqual([...normalizeSubmittedIds(json)], ["a"]);
});

test("errorForStatus maps 401 to auth, 403 to generic, and 429 to rate limit", () => {
  assert.ok(errorForStatus(401, "x") instanceof PensiveAuthError);
  const forbidden = errorForStatus(403, "classes");
  assert.ok(!(forbidden instanceof PensiveAuthError));
  assert.equal(forbidden.message, "Pensive classes request failed (403)");
  assert.ok(errorForStatus(429, "x") instanceof PensiveRateLimitError);
  const other = errorForStatus(500, "assignment heads");
  assert.ok(!(other instanceof PensiveAuthError));
  assert.match(other.message, /assignment heads.*500/);
});
