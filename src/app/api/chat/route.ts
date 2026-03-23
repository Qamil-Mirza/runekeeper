import { auth } from "@/lib/auth";
import { db } from "@/db";
import { chatMessages, users, tasks, timeBlocks } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  chatCompletionStream,
  type StructuredResponse,
} from "@/lib/chat/gemini";
import { buildSystemPrompt } from "@/lib/chat/planner-prompt";
import { handleAction, type ActionResult } from "@/lib/chat/action-handler";
import { dbTaskToTask, dbBlockToTimeBlock } from "@/lib/types";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";
import { toLocalDateStr, isValidTimezone } from "@/lib/utils";
import { extractMemories, getMemoryDigest, saveMemories } from "@/lib/chat/memory";
import { buildTieredContext } from "@/lib/chat/context-builder";
import { rateLimit } from "@/lib/rate-limit";

const chatLimiter = rateLimit({ key: "chat", limit: 20, windowMs: 60_000 });

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
  const { message, sessionId, timezone: clientTimezone } = body;

  if (!message) return errorResponse("message is required");
  if (typeof message !== "string" || message.length > 10000) {
    return errorResponse("Message must be a string under 10,000 characters", 400);
  }

  const userId = session.user.id;

  const { success: withinLimit } = chatLimiter.check(userId);
  if (!withinLimit) {
    return errorResponse("Rate limit exceeded. Try again shortly.", 429);
  }
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

  // Load cross-session memory digest
  const memoryDigest = await getMemoryDigest(userId);
  // Validate and prefer browser-provided timezone, then DB, then fallback
  const validClientTz =
    clientTimezone && typeof clientTimezone === "string" && isValidTimezone(clientTimezone)
      ? clientTimezone
      : null;
  const userTimezone = validClientTz || user?.timezone || "America/New_York";

  // Auto-update user timezone in DB if it differs from the browser
  if (validClientTz && user && user.timezone !== validClientTz) {
    await db
      .update(users)
      .set({ timezone: validClientTz })
      .where(eq(users.id, userId))
      .catch(() => null); // best-effort, don't block chat
  }

  // Build tiered context for the LLM
  const tieredContext = buildTieredContext({
    blocks: userBlocks,
    tasks: userTasks,
    weekRange,
    timezone: userTimezone,
  });

  // Build system prompt
  const systemPrompt = buildSystemPrompt({
    user: {
      name: user?.name || "User",
      timezone: userTimezone,
      preferences: (user?.preferences as any) ?? {
        workingHoursStart: 9,
        workingHoursEnd: 18,
        lunchDurationMinutes: 30,
        maxBlockMinutes: 120,
        meetingBuffer: 10,
      },
    },
    todaySchedule: tieredContext.todaySchedule,
    questSummary: tieredContext.questSummary,
    weekOverview: tieredContext.weekOverview,
    weekStart: weekRange.start,
    weekEnd: weekRange.end,
    memoryDigest: memoryDigest || undefined,
  });

  let structured: StructuredResponse;

  // Intercept known quick-action phrases directly — no need to round-trip through the LLM
  const directAction = matchDirectAction(message, userTasks, userBlocks);

  if (directAction) {
    structured = directAction;
  } else {
    const stream = chatCompletionStream(messages, systemPrompt);

    const encoder = new TextEncoder();
    let transformBuffer = "";
    const transformedStream = stream.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        async transform(chunk, controller) {
          transformBuffer += new TextDecoder().decode(chunk);
          const parts = transformBuffer.split("\n\n");
          transformBuffer = parts.pop() || "";
          const lines = parts.filter((l) => l.startsWith("data: "));

          for (const line of lines) {
            const jsonStr = line.replace("data: ", "");
            let event: any;
            try {
              event = JSON.parse(jsonStr);
            } catch {
              controller.enqueue(encoder.encode(`${line}\n\n`));
              continue;
            }

            if (event.type === "done") {
              // Execute actions if the capable model returned them
              const parsed: StructuredResponse = event.parsed ?? {
                message: event.fullMessage,
                actions: [],
              };

              const actionResults: ActionResult[] = [];
              const pinnedBlockIds = new Set<string>();

              for (const action of parsed.actions) {
                try {
                  const result = await handleAction(
                    action,
                    userId,
                    weekRange.start,
                    weekRange.end,
                    pinnedBlockIds,
                    userTimezone
                  );
                  actionResults.push(result);

                  if (action.type === "create_tasks" && result.proposedBlocks) {
                    for (const block of result.proposedBlocks) {
                      pinnedBlockIds.add(block.id);
                    }
                  }
                } catch (err) {
                  console.error("Action execution failed:", err);
                }
              }

              const quickActions = determineQuickActions(
                userTasks,
                userBlocks,
                actionResults
              );
              const diffPreview = actionResults.find((r) => r.diff)?.diff ?? null;
              const schedulePreview =
                actionResults.find((r) => r.proposedBlocks)?.proposedBlocks ?? null;
              const actionSummary = buildActionSummary(actionResults);

              // Save assistant message to DB
              await db.insert(chatMessages).values({
                userId,
                planSessionId: sessionId ?? null,
                role: "assistant",
                content: event.fullMessage,
                metadata: {
                  quickActions,
                  diffPreview,
                  schedulePreview,
                  actionSummary,
                  actions: actionResults,
                },
              });

              // Extract memories (non-blocking)
              try {
                const memories = extractMemories(message);
                if (memories.length > 0) {
                  await saveMemories(userId, memories);
                }
              } catch (err) {
                console.error("Memory extraction failed:", err);
              }

              // Send enriched done event
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "done",
                    fullMessage: event.fullMessage,
                    quickActions,
                    actionSummary,
                    diffPreview,
                    schedulePreview,
                    actions: actionResults,
                  })}\n\n`
                )
              );
              continue;
            }

            if (event.type === "error") {
              // Stream error — use fallback response
              console.warn("Gemini stream error, using fallback");
              const fallback = generateFallbackResponse(message, userTasks, userBlocks);
              const fallbackQuickActions = determineQuickActions(userTasks, userBlocks, []);

              await db.insert(chatMessages).values({
                userId,
                planSessionId: sessionId ?? null,
                role: "assistant",
                content: fallback.message,
                metadata: { quickActions: fallbackQuickActions },
              });

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "token", content: fallback.message })}\n\n`
                )
              );
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "done",
                    fullMessage: fallback.message,
                    quickActions: fallbackQuickActions,
                    actionSummary: null,
                    diffPreview: null,
                    schedulePreview: null,
                  })}\n\n`
                )
              );
              continue;
            }

            // Pass through token events unchanged
            controller.enqueue(encoder.encode(`${line}\n\n`));
          }
        },
        flush(controller) {
          if (transformBuffer.startsWith("data: ")) {
            controller.enqueue(encoder.encode(`${transformBuffer}\n\n`));
          }
        },
      })
    );

    return new Response(transformedStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Direct action path — no LLM needed, return JSON immediately
  const actionResults: ActionResult[] = [];
  const pinnedBlockIds = new Set<string>();

  for (const action of structured.actions) {
    try {
      const result = await handleAction(
        action,
        userId,
        weekRange.start,
        weekRange.end,
        pinnedBlockIds,
        userTimezone
      );
      actionResults.push(result);

      if (action.type === "create_tasks" && result.proposedBlocks) {
        for (const block of result.proposedBlocks) {
          pinnedBlockIds.add(block.id);
        }
      }
    } catch (err) {
      console.error("Action execution failed:", err);
    }
  }

  const quickActions = determineQuickActions(userTasks, userBlocks, actionResults);
  const diffPreview = actionResults.find((r) => r.diff)?.diff;
  const schedulePreview = actionResults.find((r) => r.proposedBlocks)?.proposedBlocks;
  const actionSummary = buildActionSummary(actionResults);

  await db.insert(chatMessages).values({
    userId,
    planSessionId: sessionId ?? null,
    role: "assistant",
    content: structured.message,
    metadata: {
      quickActions,
      diffPreview,
      schedulePreview,
      actionSummary,
      actions: actionResults,
    },
  });

  try {
    const memories = extractMemories(message);
    if (memories.length > 0) {
      await saveMemories(userId, memories);
    }
  } catch (err) {
    console.error("Memory extraction failed:", err);
  }

  return jsonResponse({
    response: structured.message,
    actions: actionResults,
    quickActions,
    diffPreview,
    schedulePreview,
    actionSummary,
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

  // Generate schedule (only exact commands — conversational phrases like
  // "plan my week" should go through the LLM so it can ask about needs first)
  if (
    lower === "generate schedule" ||
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

// ── Fallback when Gemini is unavailable ───────────────────────────────────────

function generateFallbackResponse(
  message: string,
  taskList: any[],
  blockList: any[]
): StructuredResponse {
  const lower = message.toLowerCase();

  // Plan/schedule request — ask about priorities first, don't auto-generate
  if (
    lower.includes("plan") &&
    (lower.includes("week") || lower.includes("day"))
  ) {
    return {
      message:
        "Let's plan your week! What are your priorities and commitments? Tell me what you need to get done and I'll help organize everything.",
      actions: [],
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
): { title: string; priority: "high" | "medium" | "low"; estimateMinutes: number; dueDate?: string; startTime?: string }[] {
  const results: { title: string; priority: "high" | "medium" | "low"; estimateMinutes: number; dueDate?: string; startTime?: string }[] = [];

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

      let priority: "high" | "medium" | "low" = "medium";
      if (/\b(urgent|critical|asap|important|deadline)\b/i.test(line))
        priority = "high";
      if (/\b(later|eventually|low priority|if time|maybe)\b/i.test(line))
        priority = "low";

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

// ── Action summary builder ──────────────────────────────────────────────────

function buildActionSummary(results: ActionResult[]): string | null {
  if (results.length === 0) return null;

  const parts: string[] = [];

  // Tasks created
  const allCreated = results.flatMap((r) => r.tasksCreated ?? []);
  if (allCreated.length > 0) {
    const names = allCreated.map((t) => t.title);
    if (names.length === 1) {
      parts.push(`Added quest: ${names[0]}`);
    } else {
      parts.push(`Added ${names.length} quests: ${names.join(", ")}`);
    }
  }

  // Blocks proposed
  const allProposed = results.flatMap((r) => r.proposedBlocks ?? []);
  if (allProposed.length > 0) {
    parts.push(`${allProposed.length} time block${allProposed.length > 1 ? "s" : ""} proposed`);
  }

  // Unschedulable
  const allUnschedulable = results.flatMap((r) => r.unschedulable ?? []);
  if (allUnschedulable.length > 0) {
    const names = allUnschedulable.map((u) => u.task.title);
    parts.push(`Could not schedule: ${names.join(", ")}`);
  }

  // Committed
  const wasCommitted = results.some((r) => r.committed);
  if (wasCommitted) {
    parts.push("Plan committed to calendar");
  }

  // Diff summary
  const diff = results.find((r) => r.diff)?.diff;
  if (diff?.summary && diff.summary !== "No changes") {
    parts.push(diff.summary);
  }

  if (parts.length === 0) return null;
  return parts.join(" · ");
}
