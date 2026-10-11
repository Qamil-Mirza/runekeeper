import { NextResponse } from "next/server";
import { labError, readJsonObject, withLabOwner } from "@/lib/lab/route";
import { LabManagerError, deleteLab, getLabSnapshot, isValidLabId, updateLab } from "@/lib/lab/manager";

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

/**
 * Permanently deletes the lab. The request must repeat the lab's name, so a
 * stray or replayed call cannot delete a lab the owner did not name.
 */
export function DELETE(req: Request, { params }: { params: Promise<{ labId: string }> }) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { labId } = await params;
    if (!isValidLabId(labId)) return labError(404, "not_found", "Not found");

    const body = await readJsonObject(req);
    const confirmName = body?.confirmName;
    if (typeof confirmName !== "string") {
      return labError(400, "validation_failed", "The lab's name is required to delete it");
    }
    const { lab } = await getLabSnapshot(config, actor, labId);
    if (confirmName !== lab.name) {
      return labError(400, "validation_failed", "The name does not match this lab");
    }
    try {
      return NextResponse.json(await deleteLab(config, actor, idempotencyKey, labId));
    } catch (err) {
      // The lab was just read, so "not found" here means an older Lab Manager without this endpoint.
      if (err instanceof LabManagerError && (err.status === 404 || err.status === 405)) {
        return labError(501, "manager_degraded", "This Lab Manager cannot delete labs yet; it needs to be updated first");
      }
      if (err instanceof LabManagerError && err.code === "lab_not_stopped") {
        return labError(409, "lab_not_stopped", "Stop the lab first: an agent is still up or a task is running", false, err.details);
      }
      throw err;
    }
  });
}
