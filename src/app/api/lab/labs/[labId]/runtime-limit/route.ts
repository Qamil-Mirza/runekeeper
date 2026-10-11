import { NextResponse } from "next/server";
import { labError, readJsonObject, withLabOwner } from "@/lib/lab/route";
import { isValidLabId, setRuntimeLimit } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

export function POST(req: Request, { params }: { params: Promise<{ labId: string }> }) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { labId } = await params;
    if (!isValidLabId(labId)) return labError(404, "not_found", "Not found");

    const body = await readJsonObject(req);
    const minutes = body?.wallClockMinutes;
    if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) {
      return labError(400, "validation_failed", "The runtime limit must be a number of minutes, zero or more");
    }
    return NextResponse.json(await setRuntimeLimit(config, actor, idempotencyKey, labId, minutes));
  });
}
