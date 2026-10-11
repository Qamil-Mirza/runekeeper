import { NextResponse } from "next/server";
import { labError, withLabOwner } from "@/lib/lab/route";
import { isValidCursor, isValidLabId, listJobs } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

export function GET(req: Request, { params }: { params: Promise<{ labId: string }> }) {
  return withLabOwner(req, async ({ config, actor }) => {
    const { labId } = await params;
    if (!isValidLabId(labId)) return labError(404, "not_found", "Not found");

    const query = new URL(req.url).searchParams;
    const agentId = query.get("agentId") ?? undefined;
    const before = query.get("before") ?? undefined;
    if ((agentId !== undefined && !isValidLabId(agentId)) || (before !== undefined && !isValidCursor(before))) {
      return labError(400, "validation_failed", "Invalid query");
    }
    return NextResponse.json(await listJobs(config, actor, labId, { agentId, before, limit: 30 }));
  });
}
