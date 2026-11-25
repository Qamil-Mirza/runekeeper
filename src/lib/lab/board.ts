// Store rows → board DTOs for the owner API. Pure: no I/O.

import type { BoardProtocol, BoardReport, LabProtocol } from "./store";
import type { ProtocolCard, ProtocolDetail, ReportCard } from "./types";

const EXCERPT_CHARS = 200;
// The excerpt reads only the body's opening, so its work is bounded (the
// board's `bodyStart` is the same 2000 chars).
const EXCERPT_INPUT_CHARS = 2000;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// An ATX heading (CommonMark): 1-6 #s, then a space or the end of the line.
const isHeading = (line: string) => /^\s*#{1,6}(?:\s|$)/.test(line);

/**
 * The first paragraph of text in the first 2000 chars of some markdown as one
 * plain line, at most 200 chars. Heading lines are skipped; a document of only
 * headings gives its first heading's text. Emphasis markers are removed.
 */
export function excerptOf(md: string): string {
  const lines = md.slice(0, EXCERPT_INPUT_CHARS).replace(/\r\n?/g, "\n").split("\n");
  const firstText = lines.findIndex((l) => l.trim() !== "" && !isHeading(l));
  let raw: string;
  if (firstText >= 0) {
    const para: string[] = [];
    for (const l of lines.slice(firstText)) {
      if (l.trim() === "" || isHeading(l)) break;
      para.push(l);
    }
    raw = para.join(" ");
  } else {
    const heading = lines.find(isHeading);
    if (!heading) return "";
    raw = heading.replace(/^\s*#+\s*/, "").replace(/\s+#+\s*$/, "");
  }
  const text = raw
    .replace(/(\*\*|__|~~)(\S(?:.*?\S)?)\1/g, "$2")
    .replace(/\*(\S(?:.*?\S)?)\*/g, "$1")
    .replace(/(^|[^\w])_(\S(?:.*?\S)?)_(?![\w])/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
  const chars = [...text];
  if (chars.length <= EXCERPT_CHARS) return text;
  return chars.slice(0, EXCERPT_CHARS - 1).join("").trimEnd() + "…";
}

export function protocolCard(p: BoardProtocol): ProtocolCard {
  return {
    id: p.id,
    experiment: p.experimentId,
    title: p.title,
    version: p.version,
    status: p.status,
    excerpt: excerptOf(p.bodyStart),
    note: p.decisionNote,
    previousNote: p.previous?.note ?? null,
    previousStatus: p.previous?.status ?? null,
    createdAt: p.createdAt.toISOString(),
    decidedAt: iso(p.decidedAt),
  };
}

export function protocolDetail(p: LabProtocol): ProtocolDetail {
  return {
    ...protocolCard({ ...p, bodyStart: p.bodyMd }),
    bodyMd: p.bodyMd,
    previous: p.previous
      ? { version: p.previous.version, status: p.previous.status, note: p.previous.note }
      : null,
  };
}

export function reportCard(r: BoardReport): ReportCard {
  return {
    id: r.id,
    experiment: r.experimentId,
    title: r.title,
    summary: r.summary,
    createdAt: r.createdAt.toISOString(),
    read: r.read,
    replies: r.replies.map((x) => ({ body: x.body, createdAt: x.createdAt.toISOString() })),
  };
}
