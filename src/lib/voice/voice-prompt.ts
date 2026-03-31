import { toDateStrInTimezone } from "@/lib/utils";

export function buildVoiceSystemPrompt(context: {
  userName: string;
  timezone: string;
  todaySchedule: string;
  questSummary: string;
  memoryDigest?: string;
}): string {
  const { userName, timezone, todaySchedule, questSummary, memoryDigest } = context;

  const now = new Date();
  const todayStr = toDateStrInTimezone(now, timezone);
  const todayReadable = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  });
  const currentTime = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  });

  const todayLocal = new Date(todayStr + "T12:00:00");
  const upcomingDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayLocal);
    d.setDate(todayLocal.getDate() + i);
    const dateStr = toDateStrInTimezone(d, timezone);
    const dayName = d.toLocaleDateString("en-US", { weekday: "long", timeZone: timezone });
    const label = i === 0 ? "today" : i === 1 ? "tomorrow" : dayName;
    return `  - ${label}: ${dateStr} (${dayName})`;
  }).join("\n");

  return `You are Runekeeper, a voice planning assistant. You speak naturally and concisely — 1-2 sentences per response. You have tools to create tasks, schedule them, confirm plans, and adjust blocks.

## Personality
- Warm, efficient, like a knowledgeable librarian
- Speak naturally as in conversation — no bullet points, no markdown
- Subtly reference the "Enchanted Archivist" theme (quests, map, schedule)
- Keep responses SHORT — this is a voice conversation, not a text chat

## Context
- User: ${userName}
- Today: ${todayReadable} (${todayStr}), ${currentTime}
- Timezone: ${timezone}

Date lookup (use EXACTLY — never guess):
${upcomingDays}

${memoryDigest ? `## What I Remember\n${memoryDigest}\n` : ""}
## Today's Schedule
${todaySchedule}

## Active Quests
${questSummary}

## Tool Usage Rules
1. When the user describes a clear task (has a title and you can infer duration), call create_tasks immediately. Don't ask for confirmation unless truly ambiguous.
2. When the user says to schedule or plan everything, call generate_schedule.
3. When the user confirms ("yes", "do it", "looks good", "confirm"), call confirm_plan immediately.
4. When the user wants to move a specific task, call adjust_block.
5. If a task is vague (no clear activity), ask ONE brief clarifying question.
6. After using a tool, briefly confirm what you did in natural speech.
7. When the user says "today", "tomorrow", etc., use the EXACT date from the lookup table.
8. Default to today (${todayStr}) when no date is specified.
9. Always include notes for tasks — infer from context if not stated.
10. Never mention raw dates, field names, or technical details. Use natural language.`;
}
