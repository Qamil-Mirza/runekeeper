export type Priority = "high" | "medium" | "low";
export type TaskStatus = "unscheduled" | "scheduled" | "done";
export type BlockType = "focus" | "admin" | "personal" | "meeting" | "class";
export type BlockSource = "runekeeper" | "google_calendar";

export interface User {
  id: string;
  name: string;
  initials: string;
  timezone: string;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  priority: Priority;
  estimateMinutes: number;
  dueDate?: string; // ISO date string (date only)
  recurrenceRule?: string;
  status: TaskStatus;
  timeBlockId?: string; // linked to a TimeBlock
  canvasAssignmentId?: string;
}

export interface TimeBlock {
  id: string;
  taskId?: string;
  title: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
  type: BlockType;
  committed: boolean; // false = proposed, true = committed
  source?: BlockSource;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string; // ISO datetime
  schedulePreview?: TimeBlock[];
  diffPreview?: DiffPreview;
  quickActions?: string[];
  actionSummary?: string;
}

export interface DiffChange {
  type: "add" | "modify" | "remove";
  block: TimeBlock;
  previousBlock?: TimeBlock;
}

export interface DiffPreview {
  changes: DiffChange[];
  summary: string;
}

export interface WeekRange {
  start: string; // ISO date (Monday)
  end: string; // ISO date (Sunday)
}

export interface PlanSession {
  id: string;
  userId: string;
  weekRange: WeekRange;
  status: "drafting" | "proposed" | "committed";
}

// ─── Scheduler Types ─────────────────────────────────────────────────────────

export interface SchedulerInput {
  tasks: Task[];
  busyWindows: TimeBlock[];
  preferences: {
    maxBlockMinutes: number;
    meetingBuffer: number;
  };
  weekRange: WeekRange;
  startAfter?: string; // ISO datetime — only schedule blocks at or after this time
}

export interface SchedulerOutput {
  proposedBlocks: TimeBlock[];
  unschedulable: { task: Task; reason: string }[];
}

// ─── DB Row Mappers ──────────────────────────────────────────────────────────

export interface DbTask {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  priority: string;
  estimateMinutes: number;
  dueDate: string | null;
  recurrenceRule: string | null;
  status: string;
  googleTaskId: string | null;
  googleTasklistId: string | null;
  canvasAssignmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DbTimeBlock {
  id: string;
  userId: string;
  taskId: string | null;
  title: string;
  startTime: string;
  endTime: string;
  blockType: string;
  committed: boolean;
  source: string;
  googleEventId: string | null;
  googleCalendarId: string | null;
  googleEtag: string | null;
  createdAt: string;
  updatedAt: string;
}

export function dbTaskToTask(row: DbTask | Record<string, any>): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? undefined,
    priority: row.priority as Priority,
    estimateMinutes: row.estimateMinutes,
    dueDate: row.dueDate ?? undefined,
    recurrenceRule: row.recurrenceRule ?? undefined,
    status: row.status as TaskStatus,
  };
}

export function dbBlockToTimeBlock(row: DbTimeBlock | Record<string, any>): TimeBlock {
  const startTime = row.startTime instanceof Date
    ? row.startTime.toISOString()
    : row.startTime;
  const endTime = row.endTime instanceof Date
    ? row.endTime.toISOString()
    : row.endTime;

  return {
    id: row.id,
    taskId: row.taskId ?? undefined,
    title: row.title,
    start: startTime,
    end: endTime,
    type: row.blockType as BlockType,
    committed: row.committed,
    source: (row.source as BlockSource) ?? "runekeeper",
  };
}
