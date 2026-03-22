import { db } from "@/db";
import { chatMemories } from "@/db/schema";
import { eq, desc, gt, or, isNull } from "drizzle-orm";

interface ExtractedMemory {
  content: string;
  category: "preference" | "fact" | "context";
}

// ── Memory extraction from user messages ────────────────────────────────────

const PREFERENCE_PATTERNS = [
  /i (?:prefer|like to|usually|always|never|tend to|want to|don't like to)\s+(.+)/i,
  /(?:my (?:preferred|usual|typical|default))\s+(.+)/i,
  /i (?:work|study|exercise|wake up|go to bed|eat)\s+(?:in the|at|around|before|after)\s+(.+)/i,
];

const FACT_PATTERNS = [
  /(?:my|i have a|i've got|i have)\s+(.+?)\s+(?:on|at|by|due|is on|next|this|every)\s+(.+)/i,
  /(?:exam|test|deadline|presentation|meeting|appointment|interview)\s+(?:is|on|at|due)\s+(.+)/i,
  /every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|morning|evening|day)\s+(.+)/i,
  /i (?:work|have class|have a meeting)\s+(?:on|every|at)\s+(.+)/i,
];

const SKIP_PATTERNS = [
  /^(?:hi|hello|hey|thanks|ok|yes|no|sure|confirm|do it|looks good|schedule|generate|plan my week)/i,
];

export function extractMemories(userMessage: string): ExtractedMemory[] {
  const results: ExtractedMemory[] = [];
  const message = userMessage.trim();

  // Skip greetings, commands, and very short messages
  if (message.length < 15) return [];
  if (SKIP_PATTERNS.some((p) => p.test(message))) return [];

  // Check for preferences
  for (const pattern of PREFERENCE_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const content = cleanMemoryContent(match[0]);
      if (content.length >= 10 && content.length < 200) {
        results.push({ content, category: "preference" });
      }
    }
  }

  // Check for facts
  for (const pattern of FACT_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const content = cleanMemoryContent(match[0]);
      if (content.length >= 10 && content.length < 200) {
        results.push({ content, category: "fact" });
      }
    }
  }

  return results;
}

function cleanMemoryContent(raw: string): string {
  return raw
    .replace(/^i\s+/i, "User ")
    .replace(/^my\s+/i, "User's ")
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
    .where(
      eq(chatMemories.userId, userId),
    )
    .orderBy(desc(chatMemories.createdAt))
    .limit(15);

  // Filter out expired memories
  const now = new Date();
  const active = memories.filter(
    (m) => !m.expiresAt || m.expiresAt > now
  );

  if (active.length === 0) return "";

  // Deduplicate by checking if one memory contains another, preferring longer (more detailed)
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
      // Replace with the more detailed memory
      unique[overlapIdx] = mem;
    }
  }

  // Build bullet list, respecting token budget
  const lines: string[] = [];
  let estimatedTokens = 0;

  for (const mem of unique) {
    const line = `- ${mem.content}`;
    const lineTokens = Math.ceil(line.length / 4);
    if (estimatedTokens + lineTokens > maxTokens) break;
    lines.push(line);
    estimatedTokens += lineTokens;
  }

  return lines.join("\n");
}

// ── Save memories to database ───────────────────────────────────────────────

export async function saveMemories(
  userId: string,
  memories: ExtractedMemory[]
): Promise<void> {
  if (memories.length === 0) return;

  // Load existing memories once for dedup check
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

    if (isDuplicate) continue;

    // Set expiry for time-sensitive facts (30 days)
    const expiresAt =
      mem.category === "fact"
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : null;

    await db.insert(chatMemories).values({
      userId,
      content: mem.content,
      category: mem.category,
      expiresAt,
    });
  }
}
