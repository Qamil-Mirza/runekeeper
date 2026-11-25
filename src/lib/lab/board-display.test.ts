import { test } from "node:test";
import assert from "node:assert/strict";
import { cardDate, fullDate, protocolColumns, reportColumn, revisesLine, titleOf } from "./board-display";
import type { ProtocolCard, ReportCard } from "./types";

// 2:30 PM Pacific on Nov 24.
const now = new Date("2026-11-24T22:30:00Z");

function protocol(over: Partial<ProtocolCard>): ProtocolCard {
  return {
    id: "p",
    experiment: "E10",
    title: "cross-family steering",
    version: 1,
    status: "waiting",
    excerpt: "",
    note: null,
    previousNote: null,
    createdAt: "2026-11-24T20:00:00.000Z",
    decidedAt: null,
    ...over,
  };
}

function report(over: Partial<ReportCard>): ReportCard {
  return {
    id: "r",
    experiment: "E9",
    title: "dev A and B results",
    summary: "",
    createdAt: "2026-11-24T19:40:00.000Z",
    read: false,
    replies: [],
    ...over,
  };
}

test("cardDate: a time today, a date on any other Pacific day", () => {
  assert.equal(cardDate("2026-11-24T23:12:00.000Z", now), "3:12 PM");
  assert.equal(cardDate("2026-11-23T20:00:00.000Z", now), "Nov 23");
  // 11:30 PM on Nov 23 in Pacific is Nov 24 in UTC.
  assert.equal(cardDate("2026-11-24T07:30:00.000Z", now), "Nov 23");
});

test("fullDate: date and time in Pacific", () => {
  assert.equal(fullDate("2026-11-24T23:12:00.000Z"), "Nov 24, 3:12 PM");
});

test("titleOf prefixes the experiment code when there is one", () => {
  assert.equal(titleOf("E10", "cross-family steering"), "E10 · cross-family steering");
  assert.equal(titleOf(null, "loose notes"), "loose notes");
});

test("protocolColumns splits by status and leaves superseded out", () => {
  const cards = [
    protocol({ id: "w", status: "waiting" }),
    protocol({ id: "a", status: "accepted" }),
    protocol({ id: "r", status: "rejected" }),
    protocol({ id: "s", status: "superseded" }),
  ];
  const cols = protocolColumns(cards);
  assert.deepEqual(cols.waiting.map((c) => c.id), ["w"]);
  assert.deepEqual(cols.accepted.map((c) => c.id), ["a"]);
  assert.deepEqual(cols.rejected.map((c) => c.id), ["r"]);
});

test("reportColumn: replied beats read beats unread", () => {
  assert.equal(reportColumn(report({ read: false })), "unread");
  assert.equal(reportColumn(report({ read: true })), "read");
  const replies = [{ body: "ok", createdAt: "2026-11-24T21:00:00.000Z" }];
  assert.equal(reportColumn(report({ read: true, replies })), "replied");
  assert.equal(reportColumn(report({ read: false, replies })), "replied");
});

test("revisesLine names the verdict on the version revised", () => {
  assert.equal(revisesLine(null), null);
  assert.equal(
    revisesLine({ version: 1, status: "rejected", note: "No held-out split." }),
    'revises v1, which you rejected: "No held-out split."',
  );
  assert.equal(
    revisesLine({ version: 2, status: "accepted", note: "Go." }),
    'revises v2, which you accepted: "Go."',
  );
  // Replaced before anyone decided it: nothing to quote.
  assert.equal(revisesLine({ version: 1, status: "superseded", note: null }), "revises v1");
});
