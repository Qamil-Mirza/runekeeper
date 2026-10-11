import { NextResponse } from "next/server";
import { labError, withLabOwner } from "@/lib/lab/route";
import { getLabSnapshot, isValidLabId } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

export function GET(req: Request, { params }: { params: Promise<{ labId: string }> }) {
  return withLabOwner(req, async ({ config, actor }) => {
    const { labId } = await params;
    if (!isValidLabId(labId)) return labError(404, "not_found", "Not found");
    return NextResponse.json(await getLabSnapshot(config, actor, labId));
  });
}
