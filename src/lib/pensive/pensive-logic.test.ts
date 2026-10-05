import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAuthRecord,
  InvalidAuthRecordError,
  pickCurrentTerm,
  selectImportable,
  computePriority,
  toDueDate,
  formatDueTime,
} from "./pensive-logic";

const record = {
  uid: "uid-123",
  email: "x@example.com",
  apiKey: "public-key",
  appName: "[DEFAULT]",
  stsTokenManager: { refreshToken: "refresh-abc", accessToken: "id-xyz", expirationTime: 1 },
};

test("parseAuthRecord extracts uid, apiKey, refreshToken only", () => {
  assert.deepEqual(parseAuthRecord(JSON.stringify(record)), {
    uid: "uid-123",
    apiKey: "public-key",
    refreshToken: "refresh-abc",
  });
});

test("parseAuthRecord accepts the IndexedDB row wrapper { fbase_key, value }", () => {
  const wrapped = { fbase_key: "firebase:authUser:public-key:[DEFAULT]", value: record };
  assert.equal(parseAuthRecord(JSON.stringify(wrapped)).uid, "uid-123");
});

test("parseAuthRecord trims surrounding whitespace", () => {
  assert.equal(parseAuthRecord(`\n  ${JSON.stringify(record)}  \n`).refreshToken, "refresh-abc");
});

test("parseAuthRecord rejects non-JSON with a helpful message", () => {
  assert.throws(() => parseAuthRecord("firebase:authUser:abc"), (e: unknown) =>
    e instanceof InvalidAuthRecordError && /JSON/.test((e as Error).message));
});

test("parseAuthRecord names the missing field", () => {
  const { stsTokenManager: _omit, ...noTokens } = record;
  assert.throws(() => parseAuthRecord(JSON.stringify(noTokens)), (e: unknown) =>
    e instanceof InvalidAuthRecordError && /refreshToken/.test((e as Error).message));
  const { apiKey: _k, ...noKey } = record;
  assert.throws(() => parseAuthRecord(JSON.stringify(noKey)), /apiKey/);
  const { uid: _u, ...noUid } = record;
  assert.throws(() => parseAuthRecord(JSON.stringify(noUid)), /uid/);
});

test("pickCurrentTerm keeps only the most recent year+season", () => {
  const classes = [
    { id: "a", year: 2025, season: "fall" },
    { id: "b", year: 2026, season: "Fall" },
    { id: "c", year: 2026, season: "spring" },
  ];
  assert.deepEqual(pickCurrentTerm(classes).map((c) => c.id), ["b"]);
});

test("pickCurrentTerm keeps all classes in the same term and handles empty", () => {
  assert.deepEqual(pickCurrentTerm([]), []);
  const same = [
    { id: "a", year: 2026, season: "fall" },
    { id: "b", year: 2026, season: "FALL" },
  ];
  assert.equal(pickCurrentTerm(same).length, 2);
});

test("selectImportable filters unreleased, past, missing-due, and submitted", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  const items = [
    { id: "ok", releaseAt: "2026-10-01T00:00:00Z", dueAt: "2026-10-10T06:59:00Z" },
    { id: "noRelease", releaseAt: null, dueAt: "2026-10-10T06:59:00Z" },
    { id: "unreleased", releaseAt: "2026-10-05T00:00:00Z", dueAt: "2026-10-20T00:00:00Z" },
    { id: "past", releaseAt: "2026-09-01T00:00:00Z", dueAt: "2026-10-01T00:00:00Z" },
    { id: "noDue", releaseAt: "2026-09-01T00:00:00Z", dueAt: null },
    { id: "submitted", releaseAt: "2026-09-01T00:00:00Z", dueAt: "2026-10-10T00:00:00Z" },
  ];
  const result = selectImportable(items, new Set(["submitted"]), now);
  assert.deepEqual(result.map((a) => a.id), ["ok", "noRelease"]);
});

test("computePriority buckets by days until due", () => {
  const now = new Date("2026-10-04T00:00:00Z");
  assert.equal(computePriority("2026-10-05T00:00:00Z", now), "high");
  assert.equal(computePriority("2026-10-10T00:00:00Z", now), "medium");
  assert.equal(computePriority("2026-10-20T00:00:00Z", now), "low");
});

test("toDueDate and formatDueTime use the user's timezone", () => {
  // 06:59 UTC on Oct 10 is 11:59 PM Oct 9 in Los Angeles
  assert.equal(toDueDate("2026-10-10T06:59:00Z", "America/Los_Angeles"), "2026-10-09");
  assert.equal(formatDueTime("2026-10-10T06:59:00Z", "America/Los_Angeles"), "11:59 PM");
});
