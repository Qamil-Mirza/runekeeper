import { auth } from "@/lib/auth";
import { db } from "@/db";
import { chatMessages, users, tasks, timeBlocks } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { chatCompletion, OllamaConnectionError } from "@/lib/chat/ollama";
import { buildSystemPrompt } from "@/lib/chat/planner-prompt";
import { handleAction, type ActionResult } from "@/lib/chat/action-handler";
import { dbTaskToTask, dbBlockToTimeBlock } from "@/lib/types";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split("T")[0],
    end: sunday.toISOString().split("T")[0],
  };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("Unauthorized", 401);

  const body = await req.json();
  const { message, sessionId } = body;

  if (!message) return errorResponse("message is required");

  const userId = session.user.id;
  const weekRange = getWeekRange();

  // Save user message
  await db.insert(chatMessages).values({
    userId,
    planSessionId: sessionId ?? null,
    role: "user",
    content: message,
  });

  // Load context for the LLM
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const userTasks = (
    await db.select().from(tasks).where(eq(tasks.userId, userId))
  ).map(dbTaskToTask);

  const userBlocks = (
    await db.select().from(timeBlocks).where(eq(timeBlocks.userId, userId))
  ).map(dbBlockToTimeBlock);

  // Build conversation history (last 20 messages)
  const history = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.userId, userId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(20);

  const messages = history
    .reverse()
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  // Build system prompt
  const systemPrompt = buildSystemPrompt({
    user: {
      name: user?.name || "User",
      timezone: user?.timezone || "America/New_York",
      preferences: (user?.preferences as any) ?? {
        workingHoursStart: 9,
        workingHoursEnd: 18,
        lunchDurationMinutes: 30,
        maxBlockMinutes: 120,
        meetingBuffer: 10,
      },
    },
    tasks: userTasks,
    blocks: userBlocks,
    weekStart: weekRange.start,
    weekEnd: weekRange.end,
  });

  let responseText: string;

  try {
    responseText = await chatCompletion(messages, systemPrompt);
  } catch (error) {
    if (error instanceof OllamaConnectionError) {
      // Fallback: generate a helpful response without LLM
      responseText = generateFallbackResponse(message, userTasks, userBlocks);
    } else {
      console.error("Ollama error:", error);
      responseText =
        "I'm having trouble processing that right now. Could you try again?";
    }
  }

  // Extract and execute actions from the response
  const actions = extractActions(responseText);
  const cleanResponse = removeActionBlocks(responseText);
  const actionResults: ActionResult[] = [];

  for (const action of actions) {
    try {
      const result = await handleAction(
        action,
        userId,
        weekRange.start,
        weekRange.end
      );
      actionResults.push(result);
    } catch (err) {
      console.error("Action execution failed:", err);
    }
  }

  // Determine quick actions based on context
  const quickActions = determineQuickActions(
    userTasks,
    userBlocks,
    actionResults
  );

  // Build diff preview if schedule was generated
  const diffPreview = actionResults.find((r) => r.diff)?.diff;
  const schedulePreview = actionResults.find((r) => r.proposedBlocks)
    ?.proposedBlocks;

  // Save assistant message
  await db.insert(chatMessages).values({
    userId,
    planSessionId: sessionId ?? null,
    role: "assistant",
    content: cleanResponse,
    metadata: {
      quickActions,
      diffPreview,
      schedulePreview,
      actions: actionResults,
    },
  });

  return jsonResponse({
    response: cleanResponse,
    actions: actionResults,
    quickActions,
    diffPreview,
    schedulePreview,
  });
}

function extractActions(text: string): any[] {
  const actions: any[] = [];
  const regex = /```action\s*\n([\s\S]*?)\n```/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    try {
      actions.push(JSON.parse(match[1]));
    } catch {
      // Ignore malformed JSON
    }
  }

  return actions;
}

function removeActionBlocks(text: string): string {
  return text.replace(/```action\s*\n[\s\S]*?\n```/g, "").trim();
}

function determineQuickActions(
  taskList: any[],
  blockList: any[],
  results: ActionResult[]
): string[] {
  const hasUnscheduled = taskList.some((t) => t.status === "unscheduled");
  const hasProposed = blockList.some((b) => !b.committed);
  const justCreatedTasks = results.some((r) => r.tasksCreated?.length);
  const justGenerated = results.some((r) => r.proposedBlocks?.length);
  const justCommitted = results.some((r) => r.committed);

  if (justCommitted) {
    return ["Undo changes", "Plan another day", "Show map"];
  }
  if (justGenerated) {
    return ["Confirm plan", "Adjust schedule", "Show map"];
  }
  if (justCreatedTasks) {
    return ["Generate schedule", "Add more tasks", "Show inventory"];
  }
  if (hasProposed) {
    return ["Confirm plan", "Adjust schedule", "Show diff"];
  }
  if (hasUnscheduled) {
    return ["Generate schedule", "Show inventory"];
  }

  return ["Plan my week", "Show inventory", "Show map"];
}

function generateFallbackResponse(
  message: string,
  taskList: any[],
  blockList: any[]
): string {
  const lower = message.toLowerCase();

  if (
    lower.includes("plan") &&
    (lower.includes("week") || lower.includes("day"))
  ) {
    if (taskList.filter((t) => t.status === "unscheduled").length === 0) {
      return "You don't have any unscheduled tasks yet. Tell me about your priorities this week and I'll create tasks for you.";
    }
    return `You have ${taskList.filter((t) => t.status === "unscheduled").length} unscheduled tasks. Would you like me to generate a schedule for them?

\`\`\`action
{"type": "generate_schedule"}
\`\`\``;
  }

  if (lower.includes("confirm") || lower.includes("commit")) {
    return `Confirming your plan and writing to calendar.

\`\`\`action
{"type": "confirm_plan"}
\`\`\``;
  }

  return "Welcome to Runekeeper! I can help you plan your week. Tell me about your priorities, or say \"Plan my week\" to get started.";
}
