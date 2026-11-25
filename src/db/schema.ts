import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  numeric,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  googleId: text("google_id").unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  emailVerified: timestamp("email_verified"),
  image: text("image"),
  timezone: text("timezone").default("America/New_York").notNull(),
  preferences: jsonb("preferences").$type<{
    workingHoursStart: number;
    workingHoursEnd: number;
    lunchDurationMinutes: number;
    maxBlockMinutes: number;
    meetingBuffer: number;
    onboardingCompleted?: boolean;
    // Quest-digest email reminders
    digestEnabled?: boolean; // master on/off; default on when undefined
    digestTimes?: string[]; // local send times as "HH:MM" (24h), e.g. ["08:00","12:00","21:00"]
    // Goggins overdue-quest phone calls (opt-in; off unless explicitly true)
    gogginsCallEnabled?: boolean; // master on/off; default OFF
    gogginsCallTimes?: string[]; // local call times as "HH:MM" (24h), default ["18:00"]
    gogginsPhoneNumber?: string | null; // E.164-ish number to call, e.g. "+15551234567"
  }>().default({
    workingHoursStart: 9,
    workingHoursEnd: 18,
    lunchDurationMinutes: 30,
    maxBlockMinutes: 120,
    meetingBuffer: 10,
  }),
  // Per-slot digest dedup: maps "HH:MM" send time -> local date ("YYYY-MM-DD") last sent.
  // Restart-safe; one entry per configured time.
  digestSentLog: jsonb("digest_sent_log").$type<Record<string, string>>().default({}),
  // Per-slot Goggins-call dedup: maps "HH:MM" call time -> local date ("YYYY-MM-DD") last called.
  gogginsCallSentLog: jsonb("goggins_call_sent_log").$type<Record<string, string>>().default({}),
  syncToken: text("sync_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── NextAuth Adapter Tables ─────────────────────────────────────────────────

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
});

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires").notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires").notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })]
);

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  notes: text("notes"),
  priority: text("priority").notNull().default("medium"),
  estimateMinutes: integer("estimate_minutes").notNull().default(30),
  dueDate: text("due_date"),
  recurrenceRule: text("recurrence_rule"),
  status: text("status").notNull().default("unscheduled"),
  googleTaskId: text("google_task_id"),
  googleTasklistId: text("google_tasklist_id"),
  canvasAssignmentId: text("canvas_assignment_id"),
  gradescopeAssignmentId: text("gradescope_assignment_id"),
  pensiveAssignmentId: text("pensive_assignment_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Time Blocks ─────────────────────────────────────────────────────────────

export const timeBlocks = pgTable("time_blocks", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  blockType: text("block_type").notNull().default("focus"),
  committed: boolean("committed").default(false).notNull(),
  source: text("source").notNull().default("runekeeper"),
  googleEventId: text("google_event_id"),
  googleCalendarId: text("google_calendar_id"),
  googleEtag: text("google_etag"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Plan Sessions ───────────────────────────────────────────────────────────

export const planSessions = pgTable("plan_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weekStart: text("week_start").notNull(),
  weekEnd: text("week_end").notNull(),
  status: text("status").notNull().default("drafting"),
  diffSnapshot: jsonb("diff_snapshot"),
  undoDeadline: timestamp("undo_deadline"),
  chatState: jsonb("chat_state"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Chat Memories ──────────────────────────────────────────────────────────

export const chatMemories = pgTable("chat_memories", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  category: text("category").notNull(), // "identity" | "person" | "routine"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
});

// ─── Chat Messages ───────────────────────────────────────────────────────────

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  planSessionId: uuid("plan_session_id").references(() => planSessions.id, {
    onDelete: "cascade",
  }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Integrations ───────────────────────────────────────────────────────────

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "gmail" | "canvas" | "gradescope" | "slack" | "pensive"
    enabled: boolean("enabled").default(false).notNull(),
    config: jsonb("config").$type<{
      monitoredSenders?: string[];
      monitoredDomains?: string[];
      blockedSenders?: string[];
      blockedDomains?: string[];
      unmatchedBehavior?: "analyze" | "skip";
      autoCreateTasks?: boolean;
      pubsubSubscriptionActive?: boolean;
      canvasApiToken?: string;
      canvasBaseUrl?: string;
      gradescopeEmail?: string;
      gradescopePassword?: string; // encrypted
      pensiveUid?: string;
      pensiveApiKey?: string; // Pensive's public Firebase web key
      pensiveRefreshToken?: string; // encrypted
    }>().default({}),
    gmailHistoryId: text("gmail_history_id"),
    watchExpiration: timestamp("watch_expiration"),
    lastSyncAt: timestamp("last_sync_at"),
    lastSyncError: text("last_sync_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("integrations_user_provider_idx").on(
      table.userId,
      table.provider
    ),
  ]
);

// ─── Processed Emails ───────────────────────────────────────────────────────

export const processedEmails = pgTable(
  "processed_emails",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    gmailMessageId: text("gmail_message_id").notNull(),
    gmailThreadId: text("gmail_thread_id"),
    senderEmail: text("sender_email").notNull(),
    subject: text("subject"),
    processedAt: timestamp("processed_at").defaultNow().notNull(),
    actionTaken: text("action_taken").notNull(), // "task_created" | "skipped" | "no_action" | "error"
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("processed_emails_user_msg_idx").on(
      table.userId,
      table.gmailMessageId
    ),
  ]
);

// ─── Lab ─────────────────────────────────────────────────────────────────────

export const labExperiments = pgTable("lab_experiments", {
  id: text("id").primaryKey(), // the agents' own code, e.g. "E9"
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const labRuns = pgTable(
  "lab_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    experimentId: text("experiment_id")
      .notNull()
      .references(() => labExperiments.id),
    stage: text("stage").notNull(),
    setupId: text("setup_id").notNull(),
    podId: text("pod_id").notNull(),
    capUsd: numeric("cap_usd", { precision: 10, scale: 2 }).notNull(),
    status: text("status").$type<"running" | "done" | "failed" | "stopped">().notNull(),
    progressPct: integer("progress_pct"),
    eta: timestamp("eta", { withTimezone: true }),
    progressAt: timestamp("progress_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endNote: text("end_note"),
    createdBy: text("created_by").notNull(), // agent role
  },
  (table) => [
    index("lab_runs_status_idx").on(table.status),
    // One running run per pod.
    uniqueIndex("lab_runs_pod_id_running_idx")
      .on(table.podId)
      .where(sql`${table.status} = 'running'`),
  ]
);

export const labProtocols = pgTable(
  "lab_protocols",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lineageId: uuid("lineage_id").notNull(), // id of the lineage's v1
    version: integer("version").notNull(),
    revisesId: uuid("revises_id"),
    experimentId: text("experiment_id")
      .notNull()
      .references(() => labExperiments.id),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    status: text("status").$type<"waiting" | "accepted" | "rejected" | "superseded">().notNull(),
    decisionNote: text("decision_note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    seenByAdvisorAt: timestamp("seen_by_advisor_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("lab_protocols_lineage_version_idx").on(table.lineageId, table.version),
  ]
);

export const labReports = pgTable("lab_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  experimentId: text("experiment_id").references(() => labExperiments.id),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  html: text("html").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
});

export const labReportReplies = pgTable("lab_report_replies", {
  id: uuid("id").defaultRandom().primaryKey(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => labReports.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  seenByAdvisorAt: timestamp("seen_by_advisor_at", { withTimezone: true }),
});
