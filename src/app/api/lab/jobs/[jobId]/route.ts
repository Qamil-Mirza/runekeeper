import { NextResponse } from "next/server";
import { labError, withLabOwner } from "@/lib/lab/route";
import { getJob, isValidLabId } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

export function GET(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  return withLabOwner(req, async ({ config, actor }) => {
    const { jobId } = await params;
    if (!isValidLabId(jobId)) return labError(404, "not_found", "Not found");
    return NextResponse.json(await getJob(config, actor, jobId));
  });
}
