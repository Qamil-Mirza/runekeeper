import { auth } from "@/lib/auth";
import { db } from "@/db";
import { chatMessages, users, tasks, timeBlocks } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  chatCompletion,
  OllamaConnectionError,
  OllamaParseError,
  type StructuredResponse,
} from "@/lib/chat/ollama";
import { buildSystemPrompt } from "@/lib/chat/planner-prompt";
import { handleAction, type ActionResult } from "@/lib/chat/action-handler";
import { dbTaskToTask, dbBlockToTimeBlock } from "@/lib/types";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";
import { toLocalDateStr } from "@/lib/utils";

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: toLocalDateStr(monday),
    end: toLocalDateStr(sunday),
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

  let structured: StructuredResponse;

  // Intercept known quick-action phrases directly — no need to round-trip through the LLM
  const directAction = matchDirectAction(message, userTasks, userBlocks);

  if (directAction) {
    structured = directAction;
  } else {
    try {
      structured = await chatCompletion(messages, systemPrompt);
    } catch (error) {
      if (error instanceof OllamaConnectionError || error instanceof OllamaParseError) {
        structured = generateFallbackResponse(message, userTasks, userBlocks);
      } else {
        console.error("Ollama error:", error);
        structured = {
          message: "I'm having trouble processing that right now. Could you try again?",
          actions: [],
        };
      }
    }
  }

  // Execute actions from the structured response
  const actionResults: ActionResult[] = [];

  for (const action of structured.actions) {
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
    content: structured.message,
    metadata: {
      quickActions,
      diffPreview,
      schedulePreview,
      actions: actionResults,
    },
  });

  return jsonResponse({
    response: structured.message,
    actions: actionResults,
    quickActions,
    diffPreview,
    schedulePreview,
  });
}

// ── Direct action matching (bypass LLM for known commands) ────────────────────

function matchDirectAction(
  message: string,
  taskList: any[],
  blockList: any[]
): StructuredResponse | null {
  const lower = message.toLowerCase().trim();

  // Confirm / commit
  if (
    lower === "confirm plan" ||
    lower === "confirm" ||
    lower === "commit" ||
    lower === "do it" ||
    lower === "looks good" ||
    lower === "yes confirm" ||
    lower === "approve"
  ) {
    const uncommitted = blockList.filter((b: any) => !b.committed);
    if (uncommitted.length === 0) {
      return {
        message: "There are no proposed blocks to confirm. Add some tasks and generate a schedule first!",
        actions: [],
      };
    }
    return {
      message: "Your plan has been committed to the calendar. The quests are sealed!",
      actions: [{ type: "confirm_plan" }],
    };
  }

  // Generate schedule
  if (
    lower === "generate schedule" ||
    lower === "schedule" ||
    lower === "plan my week" ||
    lower === "generate"
  ) {
    const unscheduled = taskList.filter((t: any) => t.status === "unscheduled");
    if (unscheduled.length === 0) {
      return {
        message: "No unscheduled quests to arrange. Tell me what you need to do and I'll add them to your log.",
        actions: [],
      };
    }
    return {
      message: `Mapping out ${unscheduled.length} quest${unscheduled.length > 1 ? "s" : ""} into your week.`,
      actions: [{ type: "generate_schedule" }],
    };
  }

  return null;
}

// ── Quick action suggestions ──────────────────────────────────────────────────

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

// ── Fallback when Ollama is unavailable ───────────────────────────────────────

function generateFallbackResponse(
  message: string,
  taskList: any[],
  blockList: any[]
): StructuredResponse {
  const lower = message.toLowerCase();

  // Plan/schedule request
  if (
    lower.includes("plan") &&
    (lower.includes("week") || lower.includes("day"))
  ) {
    if (taskList.filter((t) => t.status === "unscheduled").length === 0) {
      return {
        message:
          "You don't have any unscheduled tasks yet. Tell me about your priorities this week and I'll create tasks for you.",
        actions: [],
      };
    }
    return {
      message: `You have ${taskList.filter((t) => t.status === "unscheduled").length} unscheduled tasks. Let me generate a schedule for them.`,
      actions: [{ type: "generate_schedule" }],
    };
  }

  // Schedule/generate request
  if (
    lower.includes("schedule") ||
    lower.includes("generate") ||
    lower.includes("arrange")
  ) {
    return {
      message: "Let me generate a schedule for your tasks.",
      actions: [{ type: "generate_schedule" }],
    };
  }

  // Confirm/commit request
  if (
    lower.includes("confirm") ||
    lower.includes("commit") ||
    lower.includes("looks good") ||
    lower.includes("approve")
  ) {
    return {
      message: "Confirming your plan and writing to calendar.",
      actions: [{ type: "confirm_plan" }],
    };
  }

  // Try to extract tasks from the message
  const extractedTasks = extractTasksFromMessage(message);
  if (extractedTasks.length > 0) {
    const taskNames = extractedTasks.map((t) => t.title).join(", ");
    return {
      message: `I've added these quests to your log: ${taskNames}. Would you like me to generate a schedule for them?`,
      actions: [{ type: "create_tasks", tasks: extractedTasks }],
    };
  }

  return {
    message:
      'Welcome to Runekeeper! I can help you plan your week. Tell me about your priorities — for example, "I need to finish my essay, study for math, and prepare a presentation."',
    actions: [],
  };
}

// ── Task extraction from natural language (fallback) ──────────────────────────

function extractTasksFromMessage(
  message: string
): { title: string; priority: "P0" | "P1" | "P2"; estimateMinutes: number; dueDate?: string; startTime?: string }[] {
  const results: { title: string; priority: "P0" | "P1" | "P2"; estimateMinutes: number; dueDate?: string; startTime?: string }[] = [];

  // Split on common delimiters
  const lines = message
    .split(/(?:\n|,\s*|\band\b|;\s*|\d+\.\s*|[-•]\s*)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 3 && s.length < 200);

  const taskIndicators =
    /(?:need to|have to|want to|should|must|gotta|gonna|going to|work on|finish|complete|prepare|study|write|read|review|build|fix|create|do|start|submit|practice|meet|call|email|send|plan|research|organize|clean|set up|update|implement|design|test|add|movie|dinner|lunch|breakfast|coffee)/i;

  const messageHasTaskIntent =
    taskIndicators.test(message) ||
    message.includes(",") ||
    message.includes("\n") ||
    /\b(tasks?|priorities|to-?do|quests?)\b/i.test(message);

  if (!messageHasTaskIntent) return [];

  for (const line of lines) {
    if (line.length < 5) continue;
    if (/^(hi|hello|hey|thanks|thank you|please|ok|yes|no|sure)\b/i.test(line))
      continue;

    let title = line
      .replace(
        /^(?:i\s+)?(?:need to|have to|want to|should|must|gotta|gonna|going to)\s+/i,
        ""
      )
      .replace(/^(?:can you\s+)?(?:add|work on|finish|complete)\s+/i, "")
      .trim();

    // Strip time/date phrases from the title
    title = title
      .replace(/\b(?:at|for|@)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, "")
      .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, "")
      .replace(/\b(?:today|tomorrow|tmr|tmrw)\b/gi, "")
      .replace(/\b(?:this|next|on)\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (title.length > 0) {
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }

    if (title.length >= 3 && title.length < 150) {
      let estimate = 60;
      if (/\b(quick|brief|short|small)\b/i.test(line)) estimate = 30;
      if (/\b(long|big|major|deep|thorough)\b/i.test(line)) estimate = 120;
      if (/\b(movie|film)\b/i.test(line)) estimate = 120;
      if (/\b(dinner|lunch|breakfast|coffee|brunch)\b/i.test(line)) estimate = 60;

      let priority: "P0" | "P1" | "P2" = "P1";
      if (/\b(urgent|critical|asap|important|deadline)\b/i.test(line))
        priority = "P0";
      if (/\b(later|eventually|low priority|if time|maybe)\b/i.test(line))
        priority = "P2";

      const dueDate = resolveRelativeDate(line);
      const startTime = resolveSpecificTime(line, dueDate);
      results.push({
        title,
        priority,
        estimateMinutes: estimate,
        ...(dueDate ? { dueDate } : {}),
        ...(startTime ? { startTime } : {}),
      });
    }
  }

  return results;
}

// ── Date/time resolution helpers ──────────────────────────────────────────────

function resolveRelativeDate(text: string): string | null {
  const lower = text.toLowerCase();
  const today = new Date();

  const isoMatch = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  if (/\btoday\b/.test(lower)) {
    return toLocalDateStr(today);
  }

  if (/\b(?:tomorrow|tmr|tmrw)\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return toLocalDateStr(d);
  }

  if (/\bday after tomorrow\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return toLocalDateStr(d);
  }

  const dayNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const dayMatch = lower.match(
    /\b(?:next|this|on|for)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/
  );
  if (dayMatch) {
    const targetDay = dayNames.indexOf(dayMatch[1]);
    const currentDay = today.getDay();
    let diff = targetDay - currentDay;
    if (diff <= 0) diff += 7;
    const d = new Date(today);
    d.setDate(d.getDate() + diff);
    return toLocalDateStr(d);
  }

  const inDaysMatch = lower.match(/\bin\s+(\d+)\s+days?\b/);
  if (inDaysMatch) {
    const d = new Date(today);
    d.setDate(d.getDate() + parseInt(inDaysMatch[1], 10));
    return toLocalDateStr(d);
  }

  return null;
}

function resolveSpecificTime(
  text: string,
  dateStr: string | null
): string | null {
  const lower = text.toLowerCase();

  let hours: number | null = null;
  let minutes = 0;

  const timeMatch = lower.match(
    /(?:at|for|@)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/
  );
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    if (timeMatch[3] === "pm" && hours !== 12) hours += 12;
    if (timeMatch[3] === "am" && hours === 12) hours = 0;
  }

  if (hours === null && /\bnoon\b/.test(lower)) hours = 12;
  if (hours === null && /\bmidnight\b/.test(lower)) hours = 0;

  if (hours === null) {
    const bareMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
    if (bareMatch) {
      hours = parseInt(bareMatch[1], 10);
      minutes = bareMatch[2] ? parseInt(bareMatch[2], 10) : 0;
      if (bareMatch[3] === "pm" && hours !== 12) hours += 12;
      if (bareMatch[3] === "am" && hours === 12) hours = 0;
    }
  }

  if (hours === null) return null;

  const date = dateStr || toLocalDateStr(new Date());
  const h = String(hours).padStart(2, "0");
  const m = String(minutes).padStart(2, "0");
  return `${date}T${h}:${m}:00`;
}
