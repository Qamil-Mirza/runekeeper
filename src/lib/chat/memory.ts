import { db } from "@/db";
import { chatMemories } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { createLogger } from "@/lib/logger";

const log = createLogger("memory");

export interface ExtractedMemory {
  content: string;
  category: "identity" | "person" | "routine";
}

// ── Memory extraction from user messages ────────────────────────────────────
//
// Memory captures STABLE USER CONTEXT — who the user is, who matters to them,
// and how they prefer to work. It does NOT capture tasks, one-off events, or
// transient session state. Those live in the task/schedule database.
//
// Design principles (from ChatGPT/Gemini memory research):
//   1. Only extract explicit self-statements, never infer from task requests
//   2. High-confidence patterns only — false positives are worse than misses
//   3. Memory shapes HOW the assistant helps, not WHAT the user needs to do

// ── Skip filters (reject before pattern matching) ───────────────────────────

// Task requests, commands, questions, and short messages are never memories
const SKIP_PATTERNS = [
  // Task/command intent
  /^(?:add|create|delete|remove|move|cancel|undo|schedule|generate|plan|remind|set|mark|complete|finish|do|reschedule)/i,
  // Questions
  /^(?:what|when|where|how|why|can you|could you|please|show me|tell me|is there|are there|do i|did i)/i,
  // Greetings and affirmations
  /^(?:hi|hello|hey|thanks|thank you|ok|yes|no|sure|confirm|do it|looks good|go ahead|sounds good|perfect|great|cool|nice)/i,
  // Explicit task phrasing — "I want to X", "I need to X", "I have to X"
  /i (?:want to|need to|have to|gotta|should|must|'ve got to)\s+(?:do|finish|complete|start|review|study|submit|write|read|work on|prepare)/i,
  // Due date / deadline task phrasing
  /(?:due|deadline|submit|turn in|hand in)\s+(?:by|on|at|before|tomorrow|today|tonight|this|next)/i,
];

// ── Identity — who the user is ──────────────────────────────────────────────

const IDENTITY_PATTERNS = [
  // Academic role: "I'm a junior", "I'm a CS major"
  /i(?:'m| am)\s+(?:a\s+)?(?:freshman|sophomore|junior|senior|grad student|undergrad|phd student|master'?s student)/i,
  // Field of study: "I'm majoring in X", "my major is X"
  /i(?:'m| am)\s+(?:majoring|minoring|studying|specializing|concentrating)\s+(?:in\s+)?(.+)/i,
  /(?:my\s+(?:major|minor|concentration|field|degree|focus))\s+(?:is|in)\s+(.+)/i,
  // Professional role: "I work as a X", "I'm an engineer"
  /i(?:'m| am)\s+(?:a\s+)?(\w+\s+)?(?:engineer|designer|developer|manager|analyst|researcher|scientist|teacher|nurse|doctor|writer|consultant|intern)/i,
  /i\s+work\s+(?:as|at|for|in)\s+(.+)/i,
  // School: "I go to Berkeley", "I attend Stanford"
  /i\s+(?:go to|attend|study at|am at)\s+([A-Z].+)/i,
];

// ── People — key relationships ──────────────────────────────────────────────

const PERSON_PATTERNS = [
  // "my roommate Jake", "my professor Dr. Smith"
  /my\s+(friend|roommate|girlfriend|boyfriend|partner|brother|sister|mom|dad|mother|father|professor|boss|coworker|teammate|coach|mentor|tutor|advisor|counselor|husband|wife|fiancee?)\s+(?:is\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  // "Jake is my roommate"
  /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+my\s+(friend|roommate|girlfriend|boyfriend|partner|brother|sister|mom|dad|mother|father|professor|boss|coworker|teammate|coach|mentor|tutor|advisor|counselor|husband|wife|fiancee?)/i,
  // "Dr. Smith teaches CS170"
  /(?:Dr\.|Professor|Prof\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:teaches|is\s+my|for)\s+(.+)/i,
];

// ── Routines — recurring patterns and preferences ───────────────────────────

const ROUTINE_PATTERNS = [
  // Recurring schedule: "I have lecture every Tuesday"
  /i\s+(?:have|go to|attend|take)\s+(.+?)\s+every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|weekday|morning|evening|afternoon|night|day)/i,
  // Time preferences: "I usually study at night", "I work out in the morning"
  /i\s+(?:usually|typically|normally|always|tend to)\s+(.{10,})/i,
  // Explicit preferences: "I prefer working at night"
  /i\s+prefer\s+(.{10,})/i,
  // Sleep/wake patterns: "I wake up at 7am", "I go to bed around midnight"
  /i\s+(?:wake up|get up|go to (?:bed|sleep))\s+(?:at|around|by)\s+(.+)/i,
  // Work/study rhythm: "I work best in the morning", "I can't focus after 10pm"
  /i\s+(?:work|study|focus|concentrate)\s+(?:best|better|well)\s+(?:in the|at|during|around)\s+(.+)/i,
  /i\s+(?:can't|cannot|don't|do not)\s+(?:focus|concentrate|work|study)\s+(?:well\s+)?(?:after|before|past|in the|at|during)\s+(.+)/i,
];

export function extractMemories(userMessage: string): ExtractedMemory[] {
  const results: ExtractedMemory[] = [];
  const message = userMessage.trim();

  // Reject short messages and task/command/question intent
  if (message.length < 20) return [];
  if (SKIP_PATTERNS.some((p) => p.test(message))) return [];

  for (const pattern of IDENTITY_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const content = cleanMemoryContent(match[0]);
      if (content.length >= 10 && content.length < 200) {
        results.push({ content, category: "identity" });
        break; // one identity match per message is enough
      }
    }
  }

  for (const pattern of PERSON_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const content = cleanMemoryContent(match[0]);
      if (content.length >= 10 && content.length < 200) {
        results.push({ content, category: "person" });
        break;
      }
    }
  }

  for (const pattern of ROUTINE_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const content = cleanMemoryContent(match[0]);
      if (content.length >= 10 && content.length < 200) {
        results.push({ content, category: "routine" });
        break;
      }
    }
  }

  return results;
}

function cleanMemoryContent(raw: string): string {
  return raw
    .replace(/^i\s+/i, "User ")
    .replace(/^my\s+/i, "User's ")
    .replace(/^i'm\s+/i, "User is ")
    .replace(/^i am\s+/i, "User is ")
    .replace(/^i've\s+/i, "User has ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Memory digest for system prompt ─────────────────────────────────────────

export async function getMemoryDigest(
  userId: string,
  maxTokens = 200
): Promise<string> {
  const memories = await db
    .select()
    .from(chatMemories)
    .where(eq(chatMemories.userId, userId))
    .orderBy(desc(chatMemories.createdAt))
    .limit(15);

  const now = new Date();
  const active = memories.filter(
    (m) => !m.expiresAt || m.expiresAt > now
  );

  if (active.length === 0) return "";

  // Deduplicate — prefer longer (more detailed) version
  const unique: typeof active = [];
  for (const mem of active) {
    const overlapIdx = unique.findIndex(
      (existing) =>
        existing.content.toLowerCase().includes(mem.content.toLowerCase()) ||
        mem.content.toLowerCase().includes(existing.content.toLowerCase())
    );
    if (overlapIdx === -1) {
      unique.push(mem);
    } else if (mem.content.length > unique[overlapIdx].content.length) {
      unique[overlapIdx] = mem;
    }
  }

  // Group by category for structured digest
  const identity = unique.filter((m) => m.category === "identity");
  const people = unique.filter((m) => m.category === "person");
  const routines = unique.filter((m) => m.category === "routine");

  const lines: string[] = [];
  let estimatedTokens = 0;

  const addSection = (label: string, items: typeof unique) => {
    if (items.length === 0) return;
    const header = `${label}:`;
    lines.push(header);
    estimatedTokens += Math.ceil(header.length / 4);
    for (const mem of items) {
      const line = `  - ${mem.content}`;
      const lineTokens = Math.ceil(line.length / 4);
      if (estimatedTokens + lineTokens > maxTokens) return;
      lines.push(line);
      estimatedTokens += lineTokens;
    }
  };

  addSection("Who they are", identity);
  addSection("Key people", people);
  addSection("Habits & preferences", routines);

  return lines.join("\n");
}

// ── Save memories to database ───────────────────────────────────────────────

export async function saveMemories(
  userId: string,
  memories: ExtractedMemory[]
): Promise<void> {
  if (memories.length === 0) return;

  const existing = await db
    .select()
    .from(chatMemories)
    .where(eq(chatMemories.userId, userId))
    .limit(50);

  for (const mem of memories) {
    const isDuplicate = existing.some(
      (e) =>
        e.content.toLowerCase().includes(mem.content.toLowerCase()) ||
        mem.content.toLowerCase().includes(e.content.toLowerCase())
    );

    if (isDuplicate) {
      log.debug({ content: mem.content }, "skipping duplicate memory");
      continue;
    }

    // Routines expire after 90 days; identity and people are stable (no expiry)
    const expiresAt =
      mem.category === "routine"
        ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        : null;

    await db.insert(chatMemories).values({
      userId,
      content: mem.content,
      category: mem.category,
      expiresAt,
    });
  }

  log.info(
    { count: memories.length, categories: memories.map((m) => m.category) },
    "saved memories"
  );
}
