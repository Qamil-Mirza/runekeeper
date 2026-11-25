import { test } from "node:test";
import assert from "node:assert/strict";
import { excerptOf, protocolCard, protocolDetail, reportCard } from "./board";

const T1 = new Date("2026-11-20T10:00:00Z");
const T2 = new Date("2026-11-21T11:30:00Z");

test("excerpt is the first non-empty paragraph, on one line", () => {
  assert.equal(excerptOf("\n\n  \nFirst line\nsecond line\n\nNext paragraph"), "First line second line");
  assert.equal(excerptOf("One\r\n\r\nTwo"), "One");
  assert.equal(excerptOf(""), "");
  assert.equal(excerptOf("   \n\n "), "");
});

test("excerpt skips heading lines and uses the first paragraph of text", () => {
  assert.equal(excerptOf("# Probe transfer\n\n## Goal\n\nMeasure *transfer*.\n\nMore"), "Measure transfer.");
  assert.equal(excerptOf("# Title\nFirst line under it\n\nNext"), "First line under it");
});

test("excerpt falls back to the first heading's text when there are only headings", () => {
  assert.equal(excerptOf("\n## **Goal** ##\n\n### Method"), "Goal");
});

test("excerpt strips emphasis markers", () => {
  assert.equal(excerptOf("Run **held-out** on *two* seeds, __not__ _three_."), "Run held-out on two seeds, not three.");
  assert.equal(excerptOf("Keep snake_case_names and 2 * 3 intact"), "Keep snake_case_names and 2 * 3 intact");
});

test("excerpt reads only the first 2000 chars of the body", () => {
  assert.equal(excerptOf("x".repeat(2000) + "\n\nSecond"), "x".repeat(199) + "…");
  assert.equal(excerptOf("# T\n" + " ".repeat(2000) + "Late text"), "T");
});

test("a heading needs 1-6 #s and a space; #hashtag is a paragraph", () => {
  assert.equal(excerptOf("#hashtag line\n\nNext"), "#hashtag line");
  assert.equal(excerptOf("####### seven\n\nNext"), "####### seven");
  assert.equal(excerptOf("###### Six\n\nBody"), "Body");
});

test("excerpt is at most 200 chars", () => {
  const long = "word ".repeat(100);
  const e = excerptOf(long);
  assert.ok([...e].length <= 200);
  assert.ok(e.endsWith("…"));
  assert.equal(excerptOf("x".repeat(200)), "x".repeat(200));
});

const board = {
  id: "p2",
  lineageId: "p1",
  version: 2,
  experimentId: "E9",
  title: "Probe transfer",
  bodyStart: "Measure transfer.\n\nDetails",
  status: "accepted" as const,
  decisionNote: "Go",
  decidedAt: T2,
  createdAt: T1,
  previous: { id: "p1", version: 1, status: "rejected" as const, note: "Too broad" },
};

test("protocol card", () => {
  assert.deepEqual(protocolCard(board), {
    id: "p2",
    experiment: "E9",
    title: "Probe transfer",
    version: 2,
    status: "accepted",
    excerpt: "Measure transfer.",
    note: "Go",
    previousNote: "Too broad",
    previousStatus: "rejected",
    createdAt: T1.toISOString(),
    decidedAt: T2.toISOString(),
  });
  const first = protocolCard({ ...board, previous: null, decisionNote: null, decidedAt: null });
  assert.equal(first.previousNote, null);
  assert.equal(first.previousStatus, null);
  assert.equal(first.note, null);
  assert.equal(first.decidedAt, null);
});

test("protocol detail carries the body and the revised version", () => {
  const { bodyStart, ...rest } = board;
  void bodyStart;
  const d = protocolDetail({
    ...rest,
    revisesId: "p1",
    bodyMd: "Measure transfer.\n\nDetails",
    seenByAdvisorAt: null,
  });
  assert.equal(d.bodyMd, "Measure transfer.\n\nDetails");
  assert.equal(d.excerpt, "Measure transfer.");
  assert.deepEqual(d.previous, { version: 1, status: "rejected", note: "Too broad" });
  assert.equal(d.previousNote, "Too broad");
  assert.equal(d.previousStatus, "rejected");
});

test("excerpt work is capped: 100 000 chars of `*a ` finish in under 200 ms", () => {
  const big = "*a ".repeat(100_000 / 3 + 1).slice(0, 100_000);
  const t0 = performance.now();
  excerptOf(big);
  const { bodyStart, ...rest } = board;
  void bodyStart;
  protocolDetail({ ...rest, revisesId: "p1", bodyMd: big, seenByAdvisorAt: null });
  const ms = performance.now() - t0;
  assert.ok(ms < 200, `took ${ms.toFixed(0)} ms`);
});

test("report card", () => {
  const card = reportCard({
    id: "r1",
    experimentId: null,
    title: "Results",
    summary: "Short",
    createdAt: T1,
    readAt: T2,
    read: true,
    replies: [{ id: "x", body: "Nice", createdAt: T2 }],
    latestReplyExcerpt: "Nice",
  });
  assert.deepEqual(card, {
    id: "r1",
    experiment: null,
    title: "Results",
    summary: "Short",
    createdAt: T1.toISOString(),
    read: true,
    replies: [{ body: "Nice", createdAt: T2.toISOString() }],
  });
});
