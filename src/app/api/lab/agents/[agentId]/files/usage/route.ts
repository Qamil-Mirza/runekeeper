import { NextResponse } from "next/server";
import { labError, withLabOwner } from "@/lib/lab/route";
import { getAgentFileUsage, isValidLabId } from "@/lib/lab/manager";
import { isWorkspacePath } from "@/lib/lab/types";

export const dynamic = "force-dynamic";

/** One directory of the agent's working directory, each entry with its size. */
export function GET(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  return withLabOwner(req, async ({ config, actor }) => {
    const { agentId } = await params;
    if (!isValidLabId(agentId)) return labError(404, "not_found", "Not found");
    const path = new URL(req.url).searchParams.get("path") ?? "";
    if (!isWorkspacePath(path, true)) return labError(400, "validation_failed", "Invalid path");
    return NextResponse.json(await getAgentFileUsage(config, actor, agentId, path));
  });
}
