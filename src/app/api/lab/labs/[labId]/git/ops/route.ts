import { NextResponse } from "next/server";
import { labError, withLabOwner } from "@/lib/lab/route";
import { isValidLabId, listGitOps } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

/** What the lab's agents pushed and which pull requests they opened or edited. */
export function GET(req: Request, { params }: { params: Promise<{ labId: string }> }) {
  return withLabOwner(req, async ({ config, actor }) => {
    const { labId } = await params;
    if (!isValidLabId(labId)) return labError(404, "not_found", "Not found");
    return NextResponse.json(await listGitOps(config, actor, labId));
  });
}
