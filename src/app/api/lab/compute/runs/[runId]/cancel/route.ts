import { NextResponse } from "next/server";
import { labError, withLabOwner } from "@/lib/lab/route";
import { cancelComputeRun, isValidLabId } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

/** Stops a rented-compute run; the Lab Manager removes what it rented. */
export function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { runId } = await params;
    if (!isValidLabId(runId)) return labError(404, "not_found", "Not found");
    return NextResponse.json(await cancelComputeRun(config, actor, idempotencyKey, runId), { status: 202 });
  });
}
