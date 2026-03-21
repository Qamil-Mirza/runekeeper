import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  getAuthenticatedUser,
  jsonResponse,
  errorResponse,
} from "@/lib/api-helpers";

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

  const body = await req.json();
  if (!body.title) return errorResponse("Title is required");

  const [task] = await db
    .insert(tasks)
    .values({
      userId: user.id,
      title: body.title,
      notes: body.notes ?? null,
      priority: body.priority ?? "P1",
      estimateMinutes: body.estimateMinutes ?? 30,
      dueDate: body.dueDate ?? null,
      recurrenceRule: body.recurrenceRule ?? null,
      status: body.status ?? "unscheduled",
    })
    .returning();

  return jsonResponse(task, 201);
}
