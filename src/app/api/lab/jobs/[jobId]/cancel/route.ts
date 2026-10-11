import { NextResponse } from "next/server";
import { labError, withLabOwner } from "@/lib/lab/route";
import { cancelJob, isValidLabId } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

export function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { jobId } = await params;
    if (!isValidLabId(jobId)) return labError(404, "not_found", "Not found");
    return NextResponse.json(await cancelJob(config, actor, idempotencyKey, jobId), { status: 202 });
  });
}
