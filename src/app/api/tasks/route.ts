import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("tasks");

const tasksLimiter = rateLimit({ key: "tasks", limit: 30, windowMs: 60_000 });

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const userTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, user.id))
    .orderBy(desc(tasks.createdAt));

  return jsonResponse(userTasks);
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const { success: withinLimit } = tasksLimiter.check(user.id);
  if (!withinLimit) {
    return errorResponse("Rate limit exceeded. Try again shortly.", 429);
  }

  const body = await req.json();
  if (!body.title || typeof body.title !== "string" || body.title.length > 500) {
    return errorResponse("Title is required and must be under 500 characters");
  }

  const [task] = await db
    .insert(tasks)
    .values({
      userId: user.id,
      title: body.title,
      notes: body.notes ?? null,
      priority: body.priority ?? "medium",
      estimateMinutes: body.estimateMinutes ?? 30,
      dueDate: body.dueDate ?? null,
      recurrenceRule: body.recurrenceRule ?? null,
      status: body.status ?? "unscheduled",
    })
    .returning();

  log.info({ userId: user.id, title: body.title }, "task created");
  return jsonResponse(task, 201);
}
