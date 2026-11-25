/**
 * Lab store: the agent-posted runs, protocols and reports, and the owner's
 * decisions and replies. Inputs are validated by the routes; this module only
 * reads and writes (always through Drizzle, never string-built SQL).
 */
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "@/db";
import {
  labExperiments,
  labProtocols,
  labReportReplies,
  labReports,
  labRuns,
} from "@/db/schema";
import type { planRevision, ProtocolStatus } from "./protocols";
import type { AgentRole } from "./settings";
import type { OverviewRun, RunStatus } from "./types";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Tx;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids arrive from URLs; anything that is not a uuid cannot name a row (and would make Postgres throw). */
const isUuid = (id: string) => UUID_RE.test(id);

const BODY_START_CHARS = 2000;
const REPLY_EXCERPT_CHARS = 200;

// ─── Experiments ─────────────────────────────────────────────────────────────

/** Insert the experiment if missing; set its title when one is given. */
export async function ensureExperiment(db: Database, code: string, title?: string | null): Promise<void> {
  if (title != null) {
    await db
      .insert(labExperiments)
      .values({ id: code, title })
      .onConflictDoUpdate({ target: labExperiments.id, set: { title } });
  } else {
    await insertExperimentIfMissing(db, code);
  }
}

async function insertExperimentIfMissing(db: Executor, code: string): Promise<void> {
  await db.insert(labExperiments).values({ id: code }).onConflictDoNothing({ target: labExperiments.id });
}

// ─── Runs ────────────────────────────────────────────────────────────────────

export interface StartRunInput {
  experiment: string;
  stage: string;
  setupId: string;
  podId: string;
  capUsd: number;
}

export type LabRun = typeof labRuns.$inferSelect;

export async function startRun(db: Database, input: StartRunInput, role: AgentRole): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    await insertExperimentIfMissing(tx, input.experiment);
    const [row] = await tx
      .insert(labRuns)
      .values({
        experimentId: input.experiment,
        stage: input.stage,
        setupId: input.setupId,
        podId: input.podId,
        capUsd: input.capUsd.toFixed(2),
        status: "running",
        createdBy: role,
      })
      .returning({ id: labRuns.id });
    return row;
  });
}

export async function listRunningRuns(db: Database): Promise<LabRun[]> {
  return db.select().from(labRuns).where(eq(labRuns.status, "running")).orderBy(asc(labRuns.startedAt));
}

/** Record progress on a running run. False when no running run has that id. */
export async function updateProgress(
  db: Database,
  id: string,
  pct: number,
  eta: Date | null,
  now: Date,
): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db
    .update(labRuns)
    .set({ progressPct: pct, eta, progressAt: now })
    .where(and(eq(labRuns.id, id), eq(labRuns.status, "running")))
    .returning({ id: labRuns.id });
  return rows.length > 0;
}

/** End a running run. False when no running run has that id. */
export async function endRun(
  db: Database,
  id: string,
  status: Exclude<RunStatus, "running">,
  note: string | null,
  now: Date,
): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db
    .update(labRuns)
    .set({ status, endNote: note, endedAt: now })
    .where(and(eq(labRuns.id, id), eq(labRuns.status, "running")))
    .returning({ id: labRuns.id });
  return rows.length > 0;
}

/**
 * Every run of each experiment that has a running run or a run that ended
 * after `since` (so an experiment's older stages still count), oldest first.
 */
export async function listRunsForOverview(db: Database, since: Date): Promise<OverviewRun[]> {
  const active = db
    .selectDistinct({ id: labRuns.experimentId })
    .from(labRuns)
    .where(or(eq(labRuns.status, "running"), gt(labRuns.endedAt, since)));
  const rows = await db
    .select({
      id: labRuns.id,
      experimentId: labRuns.experimentId,
      experimentTitle: labExperiments.title,
      stage: labRuns.stage,
      setupId: labRuns.setupId,
      podId: labRuns.podId,
      capUsd: labRuns.capUsd,
      status: labRuns.status,
      progressPct: labRuns.progressPct,
      eta: labRuns.eta,
      progressAt: labRuns.progressAt,
      startedAt: labRuns.startedAt,
      endedAt: labRuns.endedAt,
      endNote: labRuns.endNote,
    })
    .from(labRuns)
    .leftJoin(labExperiments, eq(labExperiments.id, labRuns.experimentId))
    .where(inArray(labRuns.experimentId, active))
    .orderBy(asc(labRuns.startedAt), asc(labRuns.id));
  return rows.map((r) => ({ ...r, capUsd: Number(r.capUsd) }));
}

// ─── Protocols ───────────────────────────────────────────────────────────────

export interface CreateProtocolInput {
  experiment: string;
  title: string;
  bodyMd: string;
  revisesId: string | null;
}

export interface PreviousVersion {
  id: string;
  version: number;
  status: ProtocolStatus;
  note: string | null;
}

export type LabProtocol = typeof labProtocols.$inferSelect & { previous: PreviousVersion | null };

/** A board card: the protocol without its full body (`bodyStart` is its opening). */
export interface BoardProtocol {
  id: string;
  lineageId: string;
  version: number;
  experimentId: string;
  title: string;
  bodyStart: string;
  status: ProtocolStatus;
  decisionNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  previous: PreviousVersion | null;
}

/**
 * Insert a protocol. Its version is one above the highest in its lineage, and
 * every waiting version of that lineage becomes superseded, so only the new
 * one is waiting. A first post (plan.lineageId null) starts a lineage named
 * by its own id.
 */
export async function createProtocol(
  db: Database,
  input: CreateProtocolInput,
  plan: ReturnType<typeof planRevision>,
): Promise<{ id: string; version: number }> {
  const id = randomUUID();
  return db.transaction(async (tx) => {
    await insertExperimentIfMissing(tx, input.experiment);
    let lineageId: string = id;
    let version = 1;
    if (plan.lineageId !== null) {
      lineageId = plan.lineageId;
      // Lock the lineage so concurrent revisions queue instead of colliding on (lineage, version).
      await tx
        .select({ id: labProtocols.id })
        .from(labProtocols)
        .where(eq(labProtocols.lineageId, lineageId))
        .for("update");
      const [{ max }] = await tx
        .select({ max: sql<number | null>`max(${labProtocols.version})` })
        .from(labProtocols)
        .where(eq(labProtocols.lineageId, lineageId));
      version = (max ?? 0) + 1;
      await tx
        .update(labProtocols)
        .set({ status: "superseded" })
        .where(and(eq(labProtocols.lineageId, lineageId), eq(labProtocols.status, "waiting")));
    }
    await tx.insert(labProtocols).values({
      id,
      lineageId,
      version,
      revisesId: input.revisesId,
      experimentId: input.experiment,
      title: input.title,
      bodyMd: input.bodyMd,
      status: "waiting",
    });
    return { id, version };
  });
}

const prev = alias(labProtocols, "prev");

const previousColumns = {
  previousId: prev.id,
  previousVersion: prev.version,
  previousStatus: prev.status,
  previousNote: prev.decisionNote,
};

function previousOf(r: {
  previousId: string | null;
  previousVersion: number | null;
  previousStatus: ProtocolStatus | null;
  previousNote: string | null;
}): PreviousVersion | null {
  if (r.previousId === null || r.previousVersion === null || r.previousStatus === null) return null;
  return { id: r.previousId, version: r.previousVersion, status: r.previousStatus, note: r.previousNote };
}

/** One protocol with the version it revises, or null if there is none with that id. */
export async function getProtocol(db: Database, id: string): Promise<LabProtocol | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({ p: labProtocols, ...previousColumns })
    .from(labProtocols)
    .leftJoin(prev, eq(prev.id, labProtocols.revisesId))
    .where(eq(labProtocols.id, id))
    .limit(1);
  if (!row) return null;
  return { ...row.p, previous: previousOf(row) };
}

/** Every waiting protocol (newest first), then the newest 20 accepted and the newest 20 rejected. */
export async function listProtocolsForBoard(db: Database): Promise<BoardProtocol[]> {
  const base = () =>
    db
      .select({
        id: labProtocols.id,
        lineageId: labProtocols.lineageId,
        version: labProtocols.version,
        experimentId: labProtocols.experimentId,
        title: labProtocols.title,
        bodyStart: sql<string>`left(${labProtocols.bodyMd}, ${BODY_START_CHARS})`,
        status: labProtocols.status,
        decisionNote: labProtocols.decisionNote,
        decidedAt: labProtocols.decidedAt,
        createdAt: labProtocols.createdAt,
        ...previousColumns,
      })
      .from(labProtocols)
      .leftJoin(prev, eq(prev.id, labProtocols.revisesId));

  const [waiting, accepted, rejected] = await Promise.all([
    base().where(eq(labProtocols.status, "waiting")).orderBy(desc(labProtocols.createdAt)),
    base().where(eq(labProtocols.status, "accepted")).orderBy(desc(labProtocols.decidedAt)).limit(20),
    base().where(eq(labProtocols.status, "rejected")).orderBy(desc(labProtocols.decidedAt)).limit(20),
  ]);
  return [...waiting, ...accepted, ...rejected].map(
    ({ previousId, previousVersion, previousStatus, previousNote, ...card }) => ({
      ...card,
      previous: previousOf({ previousId, previousVersion, previousStatus, previousNote }),
    }),
  );
}

/** Decide a waiting protocol. False when it is unknown or no longer waiting (race-safe: one conditional UPDATE). */
export async function decideProtocol(
  db: Database,
  id: string,
  verdict: "accepted" | "rejected",
  note: string,
  now: Date,
): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db
    .update(labProtocols)
    .set({ status: verdict, decisionNote: note, decidedAt: now })
    .where(and(eq(labProtocols.id, id), eq(labProtocols.status, "waiting")))
    .returning({ id: labProtocols.id });
  return rows.length > 0;
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export interface CreateReportInput {
  experiment: string | null;
  title: string;
  summary: string;
  html: string;
}

export interface BoardReport {
  id: string;
  experimentId: string | null;
  title: string;
  summary: string;
  createdAt: Date;
  readAt: Date | null;
  read: boolean;
  /** Oldest first. */
  replies: { id: string; body: string; createdAt: Date }[];
  latestReplyExcerpt: string | null;
}

export async function createReport(db: Database, input: CreateReportInput): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    if (input.experiment !== null) await insertExperimentIfMissing(tx, input.experiment);
    const [row] = await tx
      .insert(labReports)
      .values({
        experimentId: input.experiment,
        title: input.title,
        summary: input.summary,
        html: input.html,
      })
      .returning({ id: labReports.id });
    return row;
  });
}

/** Every report (newest first, without its HTML) with its replies and read state. */
export async function listReportsForBoard(db: Database): Promise<BoardReport[]> {
  const reports = await db
    .select({
      id: labReports.id,
      experimentId: labReports.experimentId,
      title: labReports.title,
      summary: labReports.summary,
      createdAt: labReports.createdAt,
      readAt: labReports.readAt,
    })
    .from(labReports)
    .orderBy(desc(labReports.createdAt));
  if (reports.length === 0) return [];

  const replies = await db
    .select({
      id: labReportReplies.id,
      reportId: labReportReplies.reportId,
      body: labReportReplies.body,
      createdAt: labReportReplies.createdAt,
    })
    .from(labReportReplies)
    .where(
      inArray(
        labReportReplies.reportId,
        reports.map((r) => r.id),
      ),
    )
    .orderBy(asc(labReportReplies.createdAt), asc(labReportReplies.id));

  const byReport = new Map<string, BoardReport["replies"]>();
  for (const { reportId, ...reply } of replies) {
    const list = byReport.get(reportId) ?? [];
    list.push(reply);
    byReport.set(reportId, list);
  }
  return reports.map((r) => {
    const list = byReport.get(r.id) ?? [];
    const latest = list.at(-1);
    return {
      ...r,
      read: r.readAt !== null,
      replies: list,
      latestReplyExcerpt: latest ? latest.body.slice(0, REPLY_EXCERPT_CHARS) : null,
    };
  });
}

export async function getReportHtml(db: Database, id: string): Promise<string | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({ html: labReports.html })
    .from(labReports)
    .where(eq(labReports.id, id))
    .limit(1);
  return row?.html ?? null;
}

/** Mark a report read (keeps the first read time). False when there is no such report. */
export async function markReportRead(db: Database, id: string, now: Date): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db
    .update(labReports)
    .set({ readAt: sql`coalesce(${labReports.readAt}, ${now})` })
    .where(eq(labReports.id, id))
    .returning({ id: labReports.id });
  return rows.length > 0;
}

/** Add the owner's reply to a report. Null when there is no such report. */
export async function addReply(db: Database, id: string, body: string): Promise<{ id: string } | null> {
  if (!isUuid(id)) return null;
  return db.transaction(async (tx) => {
    const [report] = await tx
      .select({ id: labReports.id })
      .from(labReports)
      .where(eq(labReports.id, id))
      .limit(1);
    if (!report) return null;
    const [row] = await tx
      .insert(labReportReplies)
      .values({ reportId: id, body })
      .returning({ id: labReportReplies.id });
    return row;
  });
}

// ─── Advisor inbox ───────────────────────────────────────────────────────────

export type InboxEntry =
  | {
      kind: "decision";
      protocolId: string;
      experiment: string;
      title: string;
      version: number;
      verdict: "accepted" | "rejected";
      note: string;
      decidedAt: Date;
    }
  | { kind: "reply"; reportId: string; reportTitle: string; body: string; createdAt: Date };

/**
 * Decided protocols and report replies the advisor has not seen (or all of
 * them when `all`), oldest first. Exactly the returned rows are marked seen at
 * `now`, in the same transaction; the rows are locked so two concurrent takes
 * cannot both deliver the same unseen item.
 */
export async function takeInbox(db: Database, all: boolean, now: Date): Promise<InboxEntry[]> {
  return db.transaction(async (tx) => {
    const decisions = await tx
      .select({
        id: labProtocols.id,
        experimentId: labProtocols.experimentId,
        title: labProtocols.title,
        version: labProtocols.version,
        status: labProtocols.status,
        decisionNote: labProtocols.decisionNote,
        decidedAt: labProtocols.decidedAt,
      })
      .from(labProtocols)
      .where(
        and(
          inArray(labProtocols.status, ["accepted", "rejected"]),
          all ? undefined : isNull(labProtocols.seenByAdvisorAt),
        ),
      )
      .for("update");

    const replies = await tx
      .select({
        id: labReportReplies.id,
        reportId: labReportReplies.reportId,
        reportTitle: labReports.title,
        body: labReportReplies.body,
        createdAt: labReportReplies.createdAt,
      })
      .from(labReportReplies)
      .innerJoin(labReports, eq(labReports.id, labReportReplies.reportId))
      .where(all ? undefined : isNull(labReportReplies.seenByAdvisorAt))
      .for("update", { of: labReportReplies });

    if (decisions.length > 0) {
      await tx
        .update(labProtocols)
        .set({ seenByAdvisorAt: now })
        .where(
          inArray(
            labProtocols.id,
            decisions.map((d) => d.id),
          ),
        );
    }
    if (replies.length > 0) {
      await tx
        .update(labReportReplies)
        .set({ seenByAdvisorAt: now })
        .where(
          inArray(
            labReportReplies.id,
            replies.map((r) => r.id),
          ),
        );
    }

    const entries: { at: Date; key: string; entry: InboxEntry }[] = [];
    for (const d of decisions) {
      // A decided protocol always has decidedAt and a note (decideProtocol sets both).
      const decidedAt = d.decidedAt ?? now;
      entries.push({
        at: decidedAt,
        key: d.id,
        entry: {
          kind: "decision",
          protocolId: d.id,
          experiment: d.experimentId,
          title: d.title,
          version: d.version,
          verdict: d.status as "accepted" | "rejected",
          note: d.decisionNote ?? "",
          decidedAt,
        },
      });
    }
    for (const r of replies) {
      entries.push({
        at: r.createdAt,
        key: r.id,
        entry: { kind: "reply", reportId: r.reportId, reportTitle: r.reportTitle, body: r.body, createdAt: r.createdAt },
      });
    }
    entries.sort((a, b) => a.at.getTime() - b.at.getTime() || a.key.localeCompare(b.key));
    return entries.map((e) => e.entry);
  });
}
