import { NextResponse } from "next/server";
import { labError, readJsonObject, withLabOwner } from "@/lib/lab/route";
import { isValidLabId, reconcileJob } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

export function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { jobId } = await params;
    if (!isValidLabId(jobId)) return labError(404, "not_found", "Not found");

    const resolution = (await readJsonObject(req))?.resolution;
    if (resolution !== "acknowledge" && resolution !== "retry") {
      return labError(400, "validation_failed", "Resolution must be acknowledge or retry");
    }
    return NextResponse.json(await reconcileJob(config, actor, idempotencyKey, jobId, resolution));
  });
}
