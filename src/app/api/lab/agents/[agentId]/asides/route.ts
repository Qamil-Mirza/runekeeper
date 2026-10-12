import { NextResponse } from "next/server";
import { labError, readJsonObject, withLabOwner } from "@/lib/lab/route";
import { askAgentAside, isValidLabId } from "@/lib/lab/manager";
import { MAX_ASIDE_LENGTH } from "@/lib/lab/types";

export const dynamic = "force-dynamic";

// A side question never starts a task and never reaches the agent, so unlike
// a message it does not touch the lab's runtime limit.
export function POST(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { agentId } = await params;
    if (!isValidLabId(agentId)) return labError(404, "not_found", "Not found");

    const body = await readJsonObject(req);
    const text = typeof body?.text === "string" ? body.text : "";
    if (text.trim().length < 1 || text.length > MAX_ASIDE_LENGTH) {
      return labError(400, "validation_failed", `A side question must be 1 to ${MAX_ASIDE_LENGTH} characters`);
    }

    const accepted = await askAgentAside(config, actor, idempotencyKey, agentId, text);
    return NextResponse.json(accepted, { status: 202 });
  });
}
