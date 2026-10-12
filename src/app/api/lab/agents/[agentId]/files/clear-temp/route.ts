import { NextResponse } from "next/server";
import { labError, withLabOwner } from "@/lib/lab/route";
import { clearAgentTemp, isValidLabId } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

/** Empties the temp folders the agent's commands use. */
export function POST(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { agentId } = await params;
    if (!isValidLabId(agentId)) return labError(404, "not_found", "Not found");
    return NextResponse.json(await clearAgentTemp(config, actor, idempotencyKey, agentId));
  });
}
