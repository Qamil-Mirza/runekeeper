import type { StructuredResponse } from "./gemini";
import { createLogger } from "@/lib/logger";

const log = createLogger("safety-net");

export interface PendingTaskContext {
  title: string;
  estimateMinutes: number;
  priority: "high" | "medium" | "low";
  dueDate?: string;
  startTime?: string;
  notes?: string;
}

// Phrases in the assistant message that imply a task was created
const CREATION_PATTERNS = [
  /I've added/i,
  /added .+ to your (?:map|log|schedule|calendar)/i,
  /quest has been (?:added|created|logged)/i,
  /created (?:the|a|your) (?:quest|task)/i,
  /placed .+ on your map/i,
  /logged .+ to your/i,
  /I've (?:logged|placed|scheduled|created)/i,
];

// Duration patterns from user confirmation messages
const DURATION_PATTERNS: Array<{ pattern: RegExp; minutes: (match: RegExpMatchArray) => number }> = [
  { pattern: /(\d+)\s*(?:hr|hour)s?/i, minutes: (m) => parseInt(m[1], 10) * 60 },
  { pattern: /(\d+)\s*(?:min|minute)s?/i, minutes: (m) => parseInt(m[1], 10) },
  { pattern: /(\d+(?:\.\d+)?)\s*h\b/i, minutes: (m) => Math.round(parseFloat(m[1]) * 60) },
  { pattern: /half\s*(?:an?\s*)?hour/i, minutes: () => 30 },
];

// Extract a quoted title from the assistant message
function extractTitleFromMessage(message: string): string | null {
  // Match 'Single Quoted' or "Double Quoted" titles
  // Use a non-word-char lookbehind to avoid matching contractions like "I've"
  const quoted = message.match(/(?<!\w)['"\u2018\u2019\u201C\u201D]([^'"\u2018\u2019\u201C\u201D]{3,60})['"\u2018\u2019\u201C\u201D]/);
  if (quoted) return quoted[1];
  return null;
}

// Parse duration from user message like "1 hr", "30 min", "1.5h"
function parseDuration(text: string): number | null {
  for (const { pattern, minutes } of DURATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) return minutes(match);
  }
  return null;
}

// Extract date from conversation context
function extractDate(text: string): string | null {
  // ISO date
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  return null;
}

// Extract time from conversation context (e.g. "at 8am", "at 10:30 PM")
function extractTime(text: string, dateStr: string | null): string | null {
  const lower = text.toLowerCase();
  let hours: number | null = null;
  let minutes = 0;

  const timeMatch = lower.match(/(?:at|for|@)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    if (timeMatch[3] === "pm" && hours !== 12) hours += 12;
    if (timeMatch[3] === "am" && hours === 12) hours = 0;
  }

  if (hours === null) {
    const bare = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
    if (bare) {
      hours = parseInt(bare[1], 10);
      minutes = bare[2] ? parseInt(bare[2], 10) : 0;
      if (bare[3] === "pm" && hours !== 12) hours += 12;
      if (bare[3] === "am" && hours === 12) hours = 0;
    }
  }

  if (hours === null) return null;

  const date = dateStr || new Date().toISOString().split("T")[0];
  const h = String(hours).padStart(2, "0");
  const m = String(minutes).padStart(2, "0");
  return `${date}T${h}:${m}:00`;
}

// Resolve "tomorrow", "tmr", etc. to a date string
function resolveRelativeDate(text: string): string | null {
  const lower = text.toLowerCase();
  const today = new Date();

  if (/\btoday\b/.test(lower)) {
    return today.toISOString().split("T")[0];
  }
  if (/\b(?:tomorrow|tmr|tmrw)\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  return extractDate(text);
}

/**
 * Detect when the LLM's message implies task creation but the actions array
 * is empty. Returns a PendingTaskContext if we can reconstruct the task from
 * conversation history, or null if we can't (fail-safe).
 */
export function detectMissingAction(
  parsed: StructuredResponse,
  conversationHistory: Array<{ role: string; content: string }>
): PendingTaskContext | null {
  // Only trigger when actions are empty but message implies creation
  if (parsed.actions.length > 0) return null;

  const messageImpliesCreation = CREATION_PATTERNS.some((p) =>
    p.test(parsed.message)
  );
  if (!messageImpliesCreation) return null;

  // Extract the title from the current assistant message
  const title = extractTitleFromMessage(parsed.message);
  if (!title) return null;

  // Scan conversation history backwards to find the original user request
  // Pattern: user asks to add task → assistant asks clarification → user confirms
  const history = conversationHistory;
  let dueDate: string | null = null;
  let startTime: string | null = null;
  let estimateMinutes: number | null = null;

  // The last user message should be the confirmation (e.g., "1 hr")
  // The second-to-last user message should be the original request
  const userMessages = history.filter((m) => m.role === "user");

  if (userMessages.length >= 1) {
    const lastUserMsg = userMessages[userMessages.length - 1].content;
    estimateMinutes = parseDuration(lastUserMsg);
  }

  if (userMessages.length >= 2) {
    const originalRequest = userMessages[userMessages.length - 2].content;
    dueDate = resolveRelativeDate(originalRequest);
    startTime = extractTime(originalRequest, dueDate);

    // If no duration from last message, try the original request
    if (!estimateMinutes) {
      estimateMinutes = parseDuration(originalRequest);
    }
  }

  // Also try extracting date/time from the current LLM message as fallback
  if (!dueDate) {
    dueDate = extractDate(parsed.message);
  }

  // Default duration if we still couldn't parse one
  if (!estimateMinutes) {
    estimateMinutes = 60;
  }

  log.warn({ title, estimateMinutes, priority: "medium" }, "detected missing action from LLM response");

  return {
    title,
    estimateMinutes,
    priority: "medium",
    ...(dueDate ? { dueDate } : {}),
    ...(startTime ? { startTime } : {}),
    notes: `${title} session`,
  };
}
