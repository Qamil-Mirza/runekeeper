import { NextResponse } from "next/server";
import { labError, readJsonObject, withLabOwner } from "@/lib/lab/route";
import { isValidLabId, resolveEscalation } from "@/lib/lab/manager";
import { MAX_ESCALATION_NOTE_LENGTH } from "@/lib/lab/types";

export const dynamic = "force-dynamic";

/** The owner acknowledges an escalation. It approves nothing and resumes nothing. */
export function POST(req: Request, { params }: { params: Promise<{ escalationId: string }> }) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { escalationId } = await params;
    if (!isValidLabId(escalationId)) return labError(404, "not_found", "Not found");
    const body = await readJsonObject(req);
    const note = body?.note;
    if (note !== undefined && (typeof note !== "string" || note.length > MAX_ESCALATION_NOTE_LENGTH)) {
      return labError(400, "validation_failed", `A note is at most ${MAX_ESCALATION_NOTE_LENGTH} characters`);
    }
    const trimmed = typeof note === "string" && note.trim() ? note : undefined;
    return NextResponse.json(await resolveEscalation(config, actor, idempotencyKey, escalationId, trimmed));
  });
}
