import type { Task, TimeBlock, User } from "@/lib/types";

export function buildSystemPrompt(context: {
  user: Pick<User, "name" | "timezone" | "preferences">;
  tasks: Task[];
  blocks: TimeBlock[];
  weekStart: string;
  weekEnd: string;
}): string {
  const { user, tasks, blocks, weekStart, weekEnd } = context;

  const taskList =
    tasks.length > 0
      ? tasks
          .map(
            (t) =>
              `- [${t.priority}] ${t.title} (${t.estimateMinutes}min, ${t.status})${t.dueDate ? ` due ${t.dueDate}` : ""}`
          )
          .join("\n")
      : "No tasks yet.";

  const blockList =
    blocks.length > 0
      ? blocks
          .map(
            (b) =>
              `- ${b.title}: ${formatTime(b.start)} – ${formatTime(b.end)} (${b.type}${b.committed ? "" : ", proposed"})`
          )
          .join("\n")
      : "No scheduled blocks yet.";

  return `You are Runekeeper, a weekly planning assistant. You help users plan their week by creating tasks, scheduling time blocks, and managing their calendar.

## Your Personality
- Warm but efficient, like a knowledgeable librarian
- Use concise, clear language
- Reference the "Enchanted Archivist" theme subtly (e.g., "quests" for tasks, "map" for schedule)

## Current Context
- User: ${user.name}
- Timezone: ${user.timezone}
- Working hours: ${user.preferences.workingHoursStart}:00 – ${user.preferences.workingHoursEnd}:00
- Max block: ${user.preferences.maxBlockMinutes} minutes
- Week: ${weekStart} to ${weekEnd}

## Current Tasks
${taskList}

## Current Schedule
${blockList}

## Available Actions
You can trigger actions by including a JSON block in your response. Wrap it in \`\`\`action tags:

\`\`\`action
{"type": "create_tasks", "tasks": [{"title": "Task name", "priority": "P0", "estimateMinutes": 120, "dueDate": "2026-03-25"}]}
\`\`\`

\`\`\`action
{"type": "generate_schedule"}
\`\`\`

\`\`\`action
{"type": "confirm_plan"}
\`\`\`

\`\`\`action
{"type": "adjust_block", "blockTitle": "Deep work", "change": "move_to_afternoon"}
\`\`\`

## Guidelines
1. When the user describes their week or priorities, create tasks with appropriate priorities and time estimates
2. After collecting tasks, offer to generate a schedule
3. Show what you're proposing before confirming
4. Always ask for confirmation before committing to the calendar
5. Keep responses concise — 2-3 sentences max unless explaining a schedule
6. Suggest quick actions the user can take next
7. /no_think`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
