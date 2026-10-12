import { NextResponse } from "next/server";
import { labError, readJsonObject, withLabOwner } from "@/lib/lab/route";
import { deleteRetiredAgentFiles, getAgent, isValidLabId } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

/**
 * Permanently deletes everything a retired agent left on disk. The owner
 * confirms by the agent's name, which is checked here against the Lab
 * Manager's record, as is that the agent is retired.
 */
export function POST(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { agentId } = await params;
    if (!isValidLabId(agentId)) return labError(404, "not_found", "Not found");
    const body = await readJsonObject(req);
    const confirmName = body?.confirmName;
    if (typeof confirmName !== "string") {
      return labError(400, "validation_failed", "The agent's name is required to delete its files");
    }
    const agent = await getAgent(config, actor, agentId);
    if (confirmName !== agent.name) return labError(400, "validation_failed", "The name does not match this agent");
    if (!agent.retired) return labError(409, "conflict", "Only a retired agent's files can be deleted this way");
    return NextResponse.json(await deleteRetiredAgentFiles(config, actor, idempotencyKey, agentId));
  });
}
