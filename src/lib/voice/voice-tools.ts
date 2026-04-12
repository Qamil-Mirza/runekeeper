import { handleAction, type ActionResult } from "@/lib/chat/action-handler";
import { VoiceSessionTracker } from "@/lib/chat/voice-session-tracker";
import { createLogger } from "@/lib/logger";

const log = createLogger("voice-tools");

/**
 * Gemini Live API function declarations — same 4 action types as text chat.
 */
export const VOICE_TOOL_DECLARATIONS = [
  {
    name: "create_tasks",
    description: "Create one or more new tasks/quests. Use when the user describes tasks to add.",
    parameters: {
      type: "OBJECT",
      properties: {
        tasks: {
          type: "ARRAY",
          description: "Array of tasks to create",
          items: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING", description: "Task title" },
              notes: { type: "STRING", description: "Brief description (1-2 sentences)" },
              priority: { type: "STRING", enum: ["high", "medium", "low"], description: "Task priority" },
              estimateMinutes: { type: "NUMBER", description: "Estimated duration in minutes" },
              dueDate: { type: "STRING", description: "Due date in YYYY-MM-DD format" },
              startTime: { type: "STRING", description: "Specific start time as ISO datetime. Only when user specifies a time." },
              blockType: { type: "STRING", enum: ["focus", "admin", "personal", "meeting", "class"], description: "Time block category" },
            },
            required: ["title", "notes", "priority", "estimateMinutes"],
          },
        },
      },
      required: ["tasks"],
    },
  },
  {
    name: "generate_schedule",
    description: "Auto-schedule all unscheduled tasks into available time blocks. Use when the user asks to plan or schedule everything.",
    parameters: {
      type: "OBJECT",
      properties: {
        startAfter: { type: "STRING", description: "Earliest allowed start time as ISO datetime." },
      },
    },
  },
  {
    name: "confirm_plan",
    description: "Commit the proposed schedule to the calendar. Use when user says 'confirm', 'looks good', 'do it'.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "adjust_block",
    description: "Move or reschedule an existing task to a specific time.",
    parameters: {
      type: "OBJECT",
      properties: {
        blockTitle: { type: "STRING", description: "The task/block name to adjust" },
        change: { type: "STRING", description: "Description of the change" },
        newEstimateMinutes: { type: "NUMBER", description: "New duration in minutes if changed" },
        newStartTime: { type: "STRING", description: "New start time as ISO datetime" },
        startAfter: { type: "STRING", description: "Earliest allowed start time if rescheduling" },
      },
      required: ["blockTitle", "change"],
    },
  },
  {
    name: "refresh_context",
    description: "Fetch the latest tasks and schedule from the database. Use when the user asks about their current tasks, disputes a task's existence, or says something was deleted/completed.",
    parameters: { type: "OBJECT", properties: {} },
  },
];

export interface ActionDetail {
  title: string;
  time?: string;
}

function formatBlockTime(isoStart: string, isoEnd: string, timezone: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone,
    });
  const start = new Date(isoStart);
  const end = new Date(isoEnd);
  const startStr = fmt(isoStart);
  // Only show end time (no weekday) if same day
  const endStr = end.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  });
  return `${startStr} – ${endStr}`;
}

export async function executeToolCall(
  functionName: string,
  args: Record<string, any>,
  userId: string,
  weekStart: string,
  weekEnd: string,
  timezone: string,
  tracker: VoiceSessionTracker
): Promise<{ result: ActionResult; summary: string; details?: ActionDetail[] }> {
  log.info({ functionName, userId }, "executing voice tool call");

  // refresh_context is a no-op — the caller in server.ts always appends fresh
  // currentQuests/currentSchedule after every tool call, so we just need to
  // trigger that pipeline without doing anything else.
  if (functionName === "refresh_context") {
    return { result: {} as ActionResult, summary: "Refreshed task list" };
  }

  const action = { type: functionName, ...args };
  const result = await handleAction(action, userId, weekStart, weekEnd, undefined, timezone);

  let summary = "";
  let details: ActionDetail[] | undefined;
  switch (functionName) {
    case "create_tasks": {
      const count = result.tasksCreated?.length ?? 0;
      const names = result.tasksCreated?.map((t) => t.title).join(", ") ?? "";
      summary = count === 1 ? `Created task: ${names}` : `Created ${count} tasks: ${names}`;
      details = result.tasksCreated?.map((t) => ({ title: t.title }));
      tracker.trackAction("create_tasks", names);
      break;
    }
    case "generate_schedule": {
      const blocks = result.proposedBlocks ?? [];
      const count = blocks.length;
      summary = `Scheduled ${count} block${count !== 1 ? "s" : ""}`;
      details = blocks.map((b) => ({
        title: b.title,
        time: formatBlockTime(b.start, b.end, timezone),
      }));
      tracker.trackAction("generate_schedule", `${count} blocks`);
      break;
    }
    case "confirm_plan":
      summary = "Plan committed to calendar";
      tracker.trackAction("confirm_plan", "committed");
      break;
    case "adjust_block": {
      const title = args.blockTitle || "block";
      summary = `Adjusted: ${title}`;
      details = [{ title, time: args.newStartTime ? "rescheduled" : undefined }];
      tracker.trackAction("adjust_block", title);
      break;
    }
    case "refresh_context":
      summary = "Refreshed task list";
      break;
    default:
      summary = `Action: ${functionName}`;
  }

  if (result.error) {
    summary = `Error: ${result.error}`;
  }

  return { result, summary, details };
}

export function getCurrentWeekRange(timezone: string): { weekStart: string; weekEnd: string } {
  const now = new Date();
  const localDateStr = now.toLocaleDateString("en-CA", { timeZone: timezone });
  const local = new Date(localDateStr + "T12:00:00");
  const dayOfWeek = local.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(local);
  monday.setDate(local.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { weekStart: fmt(monday), weekEnd: fmt(sunday) };
}
