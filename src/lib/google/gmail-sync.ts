import { db } from "@/db";
import { integrations, processedEmails, tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  listMessages,
  getMessage,
  listHistory,
  extractHeader,
  extractPlainTextBody,
  GmailHistoryExpiredError,
} from "./gmail";
import { analyzeEmail } from "./gmail-analyzer";
import { createLogger } from "@/lib/logger";

const log = createLogger("gmail-sync");

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GmailSyncResult {
  processed: number;
  tasksCreated: number;
  errors: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseSenderEmail(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  return fromHeader.trim().toLowerCase();
}

// ─── Main Sync Function ────────────────────────────────────────────────────

export async function syncGmailForUser(
  userId: string,
  accessToken: string,
  integrationId: string,
  mode: "full" | "incremental",
  historyId?: string
): Promise<GmailSyncResult> {
  const result: GmailSyncResult = { processed: 0, tasksCreated: 0, errors: [] };

  // 1. Get integration config
  const [integration] = await db
    .select()
    .from(integrations)
    .where(eq(integrations.id, integrationId))
    .limit(1);

  if (!integration) {
    log.error({ integrationId }, "integration not found");
    result.errors.push("Integration not found");
    return result;
  }

  const monitoredSenders = integration.config?.monitoredSenders ?? [];
  if (monitoredSenders.length === 0) {
    log.info({ userId }, "no monitored senders configured, skipping sync");
    return result;
  }

  // 2. Fetch message IDs
  let messageIds: string[] = [];
  let newHistoryId: string | undefined;
  let effectiveMode = mode;

  if (mode === "incremental" && historyId) {
    try {
      const historyResult = await listHistory(accessToken, historyId, "INBOX");
      newHistoryId = historyResult.historyId;

      messageIds = historyResult.history.flatMap(
        (record) =>
          record.messagesAdded?.map((added) => added.message.id) ?? []
      );

      log.info(
        { userId, messageCount: messageIds.length, newHistoryId },
        "incremental sync fetched history"
      );
    } catch (error) {
      if (error instanceof GmailHistoryExpiredError) {
        log.warn({ userId }, "history ID expired, falling back to full sync");
        effectiveMode = "full";
      } else {
        throw error;
      }
    }
  }

  if (effectiveMode === "full") {
    const listResult = await listMessages(
      accessToken,
      "is:unread newer_than:1d",
      50
    );
    messageIds = listResult.messages.map((m) => m.id);

    log.info(
      { userId, messageCount: messageIds.length },
      "full sync fetched messages"
    );
  }

  // 3. Process each message
  for (const messageId of messageIds) {
    try {
      // Dedup check
      const [existing] = await db
        .select({ id: processedEmails.id })
        .from(processedEmails)
        .where(
          and(
            eq(processedEmails.userId, userId),
            eq(processedEmails.gmailMessageId, messageId)
          )
        )
        .limit(1);

      if (existing) {
        log.debug({ messageId }, "message already processed, skipping");
        continue;
      }

      // Fetch full message
      const message = await getMessage(accessToken, messageId, "full");
      const fromHeader = extractHeader(message, "From") ?? "";
      const senderEmail = parseSenderEmail(fromHeader);

      // Check if sender is monitored
      const isMonitored = monitoredSenders.some(
        (s) => s.toLowerCase() === senderEmail
      );

      if (!isMonitored) {
        await db.insert(processedEmails).values({
          userId,
          integrationId,
          gmailMessageId: messageId,
          gmailThreadId: message.threadId,
          senderEmail,
          subject: extractHeader(message, "Subject"),
          actionTaken: "skipped",
        });
        result.processed++;
        continue;
      }

      // Extract email content
      const subject = extractHeader(message, "Subject") ?? "(no subject)";
      const date = extractHeader(message, "Date") ?? new Date().toISOString();
      const body = extractPlainTextBody(message);

      // Analyze email
      const analysis = await analyzeEmail({
        from: fromHeader,
        subject,
        body,
        date,
      });

      if (analysis.hasActionableContent && analysis.tasks.length > 0) {
        let firstTaskId: string | undefined;

        for (const task of analysis.tasks) {
          const [created] = await db
            .insert(tasks)
            .values({
              userId,
              title: task.title,
              notes: `[Email] From: ${senderEmail} — ${subject}\n${task.notes}`,
              priority: task.priority,
              estimateMinutes: task.estimateMinutes,
              dueDate: task.dueDate,
              status: "unscheduled",
            })
            .returning({ id: tasks.id });

          if (!firstTaskId) firstTaskId = created.id;
          result.tasksCreated++;
        }

        await db.insert(processedEmails).values({
          userId,
          integrationId,
          gmailMessageId: messageId,
          gmailThreadId: message.threadId,
          senderEmail,
          subject,
          actionTaken: "task_created",
          taskId: firstTaskId,
        });
      } else {
        await db.insert(processedEmails).values({
          userId,
          integrationId,
          gmailMessageId: messageId,
          gmailThreadId: message.threadId,
          senderEmail,
          subject,
          actionTaken: "no_action",
        });
      }

      result.processed++;
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : "Unknown error";
      log.error({ messageId, err: error }, "failed to process message");
      result.errors.push(`Message ${messageId}: ${errMsg}`);

      // Record the error in processed_emails to avoid retrying
      try {
        await db.insert(processedEmails).values({
          userId,
          integrationId,
          gmailMessageId: messageId,
          senderEmail: "",
          actionTaken: "error",
        });
      } catch {
        // Ignore insert errors (e.g. duplicate)
      }

      result.processed++;
    }
  }

  // 4. Update integration
  await db
    .update(integrations)
    .set({
      lastSyncAt: new Date(),
      lastSyncError: null,
      ...(newHistoryId ? { gmailHistoryId: newHistoryId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(integrations.id, integrationId));

  log.info(
    {
      userId,
      processed: result.processed,
      tasksCreated: result.tasksCreated,
      errors: result.errors.length,
    },
    "gmail sync complete"
  );

  return result;
}
