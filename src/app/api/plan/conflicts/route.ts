import { auth } from "@/lib/auth";
import { db } from "@/db";
import { timeBlocks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { detectConflicts } from "@/lib/scheduler/conflicts";
import { dbBlockToTimeBlock } from "@/lib/types";
import { jsonResponse, errorResponse } from "@/lib/api-helpers";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("Unauthorized", 401);

  const body = await req.json();
  const proposedBlocks = body.blocks;

  if (!Array.isArray(proposedBlocks)) {
    return errorResponse("blocks array is required");
  }

  // Load existing committed blocks
  const existingBlocks = await db
    .select()
    .from(timeBlocks)
    .where(eq(timeBlocks.userId, session.user.id));

  const committed = existingBlocks
    .map(dbBlockToTimeBlock)
    .filter((b) => b.committed);

  const conflicts = detectConflicts(proposedBlocks, committed);

  return jsonResponse({
    hasConflicts: conflicts.length > 0,
    conflicts,
  });
}
