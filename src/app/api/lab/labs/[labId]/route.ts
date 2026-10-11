import { NextResponse } from "next/server";
import { labError, readJsonObject, withLabOwner } from "@/lib/lab/route";
import { getLabSnapshot, isValidLabId, updateLab } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

export function GET(req: Request, { params }: { params: Promise<{ labId: string }> }) {
  return withLabOwner(req, async ({ config, actor }) => {
    const { labId } = await params;
    if (!isValidLabId(labId)) return labError(404, "not_found", "Not found");
    return NextResponse.json(await getLabSnapshot(config, actor, labId));
  });
}

/** Changes the lab's goals: its objective and its ordered priorities. */
export function PATCH(req: Request, { params }: { params: Promise<{ labId: string }> }) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { labId } = await params;
    if (!isValidLabId(labId)) return labError(404, "not_found", "Not found");

    const body = await readJsonObject(req);
    const objective = body?.objective;
    const priorities = body?.priorities;
    if (
      typeof objective !== "string" ||
      objective.length > 4000 ||
      !Array.isArray(priorities) ||
      priorities.length > 20 ||
      !priorities.every((p): p is string => typeof p === "string" && p.trim().length > 0 && p.length <= 500)
    ) {
      return labError(400, "validation_failed", "Goals must be an objective of up to 4000 characters and up to 20 priorities of up to 500 characters each");
    }
    return NextResponse.json(
      await updateLab(config, actor, idempotencyKey, labId, {
        objective: objective.trim(),
        priorities: priorities.map((p) => p.trim()),
      })
    );
  });
}
