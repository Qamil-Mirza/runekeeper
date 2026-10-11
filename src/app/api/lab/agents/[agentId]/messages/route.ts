import { NextResponse } from "next/server";
import { labError, readJsonObject, withLabOwner } from "@/lib/lab/route";
import { isValidLabId, sendAgentMessage } from "@/lib/lab/manager";
import { MAX_INSTRUCTION_LENGTH } from "@/lib/lab/types";

export const dynamic = "force-dynamic";

export function POST(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { agentId } = await params;
    if (!isValidLabId(agentId)) return labError(404, "not_found", "Not found");

    const body = await readJsonObject(req);
    const text = typeof body?.text === "string" ? body.text : "";
    if (text.trim().length < 1 || text.length > MAX_INSTRUCTION_LENGTH) {
      return labError(400, "validation_failed", `An instruction must be 1 to ${MAX_INSTRUCTION_LENGTH} characters`);
    }
    const accepted = await sendAgentMessage(config, actor, idempotencyKey, agentId, text);
    return NextResponse.json(accepted, { status: 202 });
  });
}
