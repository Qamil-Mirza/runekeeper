import { NextResponse } from "next/server";
import { labError, withLabOwner } from "@/lib/lab/route";
import { isValidLabId, runLabAction } from "@/lib/lab/manager";
import { LAB_ACTIONS, type LabAction } from "@/lib/lab/types";

export const dynamic = "force-dynamic";

export function POST(
  req: Request,
  { params }: { params: Promise<{ labId: string; action: string }> }
) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { labId, action } = await params;
    if (!isValidLabId(labId) || !(LAB_ACTIONS as readonly string[]).includes(action)) {
      return labError(404, "not_found", "Not found");
    }
    const lab = await runLabAction(config, actor, idempotencyKey, labId, action as LabAction);
    return NextResponse.json(lab, { status: 202 });
  });
}
