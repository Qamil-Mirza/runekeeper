import { NextResponse } from "next/server";
import { labError, readJsonObject, withLabOwner } from "@/lib/lab/route";
import { isValidLabId, retireAgent } from "@/lib/lab/manager";
import { MAX_RETIRE_REASON_LENGTH } from "@/lib/lab/types";

export const dynamic = "force-dynamic";

/** Takes an agent out of the lab's team. Nothing is deleted. */
export function POST(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { agentId } = await params;
    if (!isValidLabId(agentId)) return labError(404, "not_found", "Not found");
    const body = await readJsonObject(req);
    const reason = body?.reason;
    if (reason !== undefined && (typeof reason !== "string" || reason.length > MAX_RETIRE_REASON_LENGTH)) {
      return labError(400, "validation_failed", `A reason is at most ${MAX_RETIRE_REASON_LENGTH} characters`);
    }
    const trimmed = typeof reason === "string" && reason.trim() ? reason : undefined;
    return NextResponse.json(await retireAgent(config, actor, idempotencyKey, agentId, trimmed));
  });
}
