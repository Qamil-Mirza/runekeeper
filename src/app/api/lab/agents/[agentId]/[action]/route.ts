import { NextResponse } from "next/server";
import { labError, withLabOwner } from "@/lib/lab/route";
import { isValidLabId, runAgentAction } from "@/lib/lab/manager";
import { AGENT_ACTIONS, type AgentAction } from "@/lib/lab/types";

export const dynamic = "force-dynamic";

export function POST(
  req: Request,
  { params }: { params: Promise<{ agentId: string; action: string }> }
) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { agentId, action } = await params;
    if (!isValidLabId(agentId) || !(AGENT_ACTIONS as readonly string[]).includes(action)) {
      return labError(404, "not_found", "Not found");
    }
    const agent = await runAgentAction(
      config,
      actor,
      idempotencyKey,
      agentId,
      action as AgentAction
    );
    return NextResponse.json(agent, { status: 202 });
  });
}
