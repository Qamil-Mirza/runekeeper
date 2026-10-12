import { NextResponse } from "next/server";
import { labError, withLabOwner } from "@/lib/lab/route";
import { isValidLabId, restoreAgent } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

/** Brings a retired agent back into the lab's team. It is not started by this. */
export function POST(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { agentId } = await params;
    if (!isValidLabId(agentId)) return labError(404, "not_found", "Not found");
    return NextResponse.json(await restoreAgent(config, actor, idempotencyKey, agentId));
  });
}
