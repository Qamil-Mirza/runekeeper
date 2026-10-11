import { NextResponse } from "next/server";
import { labError, withLabOwner } from "@/lib/lab/route";
import { getAgentTranscriptPage, isValidCursor, isValidLabId } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

export function GET(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  return withLabOwner(req, async ({ config, actor }) => {
    const { agentId } = await params;
    if (!isValidLabId(agentId)) return labError(404, "not_found", "Not found");

    const query = new URL(req.url).searchParams;
    const before = query.get("before") ?? undefined;
    const after = query.get("after") ?? undefined;
    if ((before !== undefined && !isValidCursor(before)) || (after !== undefined && !isValidCursor(after))) {
      return labError(400, "validation_failed", "Invalid cursor");
    }
    const limit = Number(query.get("limit") ?? 50);
    return NextResponse.json(
      await getAgentTranscriptPage(config, actor, agentId, {
        before,
        after,
        limit: Number.isFinite(limit) ? limit : 50,
      })
    );
  });
}
