import { NextResponse } from "next/server";
import { labError, withLabOwner } from "@/lib/lab/route";
import { getAgentTranscript, isValidLabId } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

export function GET(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  return withLabOwner(req, async ({ config, actor }) => {
    const { agentId } = await params;
    if (!isValidLabId(agentId)) return labError(404, "not_found", "Not found");
    return NextResponse.json({ items: await getAgentTranscript(config, actor, agentId) });
  });
}
