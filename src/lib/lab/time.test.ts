import { test } from "node:test";
import assert from "node:assert/strict";
import {
  startOfPacificDay,
  parseEta,
  formatPacificTime,
  formatPacificDate,
  formatIn,
} from "./time";

const iso = (d: Date | null) => d?.toISOString() ?? null;

test("startOfPacificDay", () => {
  assert.equal(iso(startOfPacificDay(new Date("2026-11-25T05:55:00Z"))), "2026-11-24T08:00:00.000Z");
  assert.equal(iso(startOfPacificDay(new Date("2026-07-01T12:00:00Z"))), "2026-07-01T07:00:00.000Z");
  assert.equal(iso(startOfPacificDay(new Date("2026-03-08T12:00:00Z"))), "2026-03-08T08:00:00.000Z");
  assert.equal(iso(startOfPacificDay(new Date("2026-11-01T12:00:00Z"))), "2026-11-01T07:00:00.000Z");
});

test("parseEta HH:MM is the next Pacific occurrence", () => {
  assert.equal(iso(parseEta("18:10", new Date("2026-11-24T22:00:00Z"))), "2026-11-25T02:10:00.000Z");
  assert.equal(iso(parseEta("18:10", new Date("2026-11-25T07:50:00Z"))), "2026-11-26T02:10:00.000Z");
});

test("parseEta ISO with offset, and rejects", () => {
  const now = new Date("2026-11-24T22:00:00Z");
  assert.equal(iso(parseEta("2026-11-25T02:10:00-08:00", now)), "2026-11-25T10:10:00.000Z");
  assert.equal(parseEta("soon", now), null);
  assert.equal(parseEta("25:00", now), null);
  assert.equal(parseEta("2026-11-25T02:10:00", now), null);
  assert.equal(parseEta("2027-03-01T00:00:00Z", now), null);
});

test("formatters", () => {
  assert.equal(formatPacificTime(new Date("2026-11-25T02:10:00Z")), "6:10 PM");
  assert.equal(formatPacificDate(new Date("2026-11-25T02:10:00Z")), "Nov 24");
  assert.equal(formatIn(100 * 60_000), "1h 40m");
  assert.equal(formatIn(12 * 60_000), "12m");
});
