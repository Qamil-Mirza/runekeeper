import { NextResponse } from "next/server";
import { labError, readJsonObject, withLabOwner } from "@/lib/lab/route";
import { deleteAgentFile, isValidLabId } from "@/lib/lab/manager";
import { isWorkspacePath } from "@/lib/lab/types";

export const dynamic = "force-dynamic";

/**
 * Permanently deletes one file or directory of the agent's working directory.
 * Only the signed-in owner's own request reaches this; the page asks for
 * confirmation, naming the path, before sending it.
 */
export function DELETE(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { agentId } = await params;
    if (!isValidLabId(agentId)) return labError(404, "not_found", "Not found");
    const body = await readJsonObject(req);
    const path = body?.path;
    if (!isWorkspacePath(path, false)) {
      return labError(400, "validation_failed", "A path inside the agent's working directory is required");
    }
    return NextResponse.json(await deleteAgentFile(config, actor, idempotencyKey, agentId, path));
  });
}
