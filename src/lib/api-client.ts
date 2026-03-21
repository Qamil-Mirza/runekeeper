import type { Task, TimeBlock, WeekRange, DbTask, DbTimeBlock } from "@/lib/types";

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || "API request failed");
  }
  return res.json();
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export function fetchTasks() {
  return apiFetch<DbTask[]>("/api/tasks");
}

export function createTask(data: {
  title: string;
  notes?: string;
  priority?: string;
  estimateMinutes?: number;
  dueDate?: string;
  status?: string;
}) {
  return apiFetch<Task>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateTask(id: string, data: Partial<Task>) {
  return apiFetch<Task>(`/api/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteTask(id: string) {
  return apiFetch(`/api/tasks/${id}`, { method: "DELETE" });
}

// ─── Time Blocks ─────────────────────────────────────────────────────────────

export function fetchBlocks(weekRange?: WeekRange) {
  const params = weekRange
    ? `?start=${weekRange.start}&end=${weekRange.end}`
    : "";
  return apiFetch<DbTimeBlock[]>(`/api/blocks${params}`);
}

export function createBlock(data: {
  title: string;
  startTime: string;
  endTime: string;
  taskId?: string;
  blockType?: string;
  committed?: boolean;
}) {
  return apiFetch<TimeBlock>("/api/blocks", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateBlock(id: string, data: Partial<TimeBlock>) {
  return apiFetch<TimeBlock>(`/api/blocks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteBlock(id: string) {
  return apiFetch(`/api/blocks/${id}`, { method: "DELETE" });
}

// ─── Calendar Sync ──────────────────────────────────────────────────────────

export function syncCalendar() {
  return apiFetch<any>("/api/calendar/events");
}

// ─── Plan Sessions ───────────────────────────────────────────────────────────

export function fetchSessions() {
  return apiFetch<any[]>("/api/sessions");
}

export function createSession(weekStart: string, weekEnd: string) {
  return apiFetch<any>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ weekStart, weekEnd }),
  });
}

export function updateSession(id: string, data: Record<string, unknown>) {
  return apiFetch<any>(`/api/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ─── Chat Messages ───────────────────────────────────────────────────────────

export function fetchMessages(sessionId?: string) {
  const params = sessionId ? `?sessionId=${sessionId}` : "";
  return apiFetch<any[]>(`/api/messages${params}`);
}

export function sendChatMessage(data: {
  content: string;
  role: string;
  planSessionId?: string;
  metadata?: Record<string, unknown>;
}) {
  return apiFetch<any>("/api/messages", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── User Preferences ────────────────────────────────────────────────────────

export function fetchUserPreferences() {
  return apiFetch<any>("/api/user/preferences");
}

export function updateUserPreferences(data: {
  timezone?: string;
  preferences?: Partial<{
    workingHoursStart: number;
    workingHoursEnd: number;
    lunchDurationMinutes: number;
    maxBlockMinutes: number;
    meetingBuffer: number;
  }>;
}) {
  return apiFetch<any>("/api/user/preferences", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ─── Chat with Ollama ────────────────────────────────────────────────────────

export function chatWithAssistant(data: {
  message: string;
  sessionId?: string;
}) {
  return apiFetch<{
    response: string;
    actions?: any[];
    quickActions?: string[];
    diffPreview?: any;
    schedulePreview?: any[];
  }>("/api/chat", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Plan Operations ─────────────────────────────────────────────────────────

export function generatePlan(weekRange: WeekRange) {
  return apiFetch<{
    proposedBlocks: TimeBlock[];
    unschedulable: { task: Task; reason: string }[];
    diff: any;
  }>("/api/plan/generate", {
    method: "POST",
    body: JSON.stringify(weekRange),
  });
}

export function commitPlan(sessionId: string) {
  return apiFetch<{ success: boolean }>("/api/calendar/commit", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export function undoPlan(sessionId: string) {
  return apiFetch<{ success: boolean }>("/api/plan/undo", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}
