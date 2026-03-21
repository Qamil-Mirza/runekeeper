const TASKS_API = "https://tasks.googleapis.com/tasks/v1";

export interface GoogleTask {
  id?: string;
  title: string;
  notes?: string;
  due?: string; // RFC 3339 date-only (time portion discarded by API)
  status?: "needsAction" | "completed";
}

export interface TaskList {
  id: string;
  title: string;
}

// ─── Task Lists ──────────────────────────────────────────────────────────────

export async function listTaskLists(
  accessToken: string
): Promise<TaskList[]> {
  const res = await fetch(`${TASKS_API}/users/@me/lists`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to list task lists: ${res.statusText}`);
  }

  const data = await res.json();
  return (data.items || []).map((item: any) => ({
    id: item.id,
    title: item.title,
  }));
}

// ─── Insert Task ─────────────────────────────────────────────────────────────

export async function insertTask(
  accessToken: string,
  tasklistId: string,
  task: GoogleTask
): Promise<GoogleTask> {
  const res = await fetch(`${TASKS_API}/lists/${tasklistId}/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: task.title,
      notes: task.notes,
      // Google Tasks expects date-only in RFC 3339 format
      due: task.due ? `${task.due}T00:00:00.000Z` : undefined,
      status: task.status ?? "needsAction",
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      `Failed to insert task: ${error.error?.message || res.statusText}`
    );
  }

  return res.json();
}

// ─── Patch Task ──────────────────────────────────────────────────────────────

export async function patchTask(
  accessToken: string,
  tasklistId: string,
  taskId: string,
  patch: Partial<GoogleTask>
): Promise<GoogleTask> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.notes !== undefined) body.notes = patch.notes;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.due !== undefined)
    body.due = patch.due ? `${patch.due}T00:00:00.000Z` : null;

  const res = await fetch(
    `${TASKS_API}/lists/${tasklistId}/tasks/${taskId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      `Failed to patch task: ${error.error?.message || res.statusText}`
    );
  }

  return res.json();
}

// ─── Map Internal Task to Google Task ────────────────────────────────────────

export function mapToGoogleTask(task: {
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  status: string;
}): GoogleTask {
  return {
    title: task.title,
    notes: task.notes ?? undefined,
    due: task.dueDate ?? undefined,
    status: task.status === "done" ? "completed" : "needsAction",
  };
}
