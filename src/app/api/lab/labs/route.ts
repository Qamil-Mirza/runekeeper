import { NextResponse } from "next/server";
import { labError, readJsonObject, withLabOwner } from "@/lib/lab/route";
import { LabManagerError, createLab, listLabs } from "@/lib/lab/manager";
import { MAX_BRIEF_LENGTH } from "@/lib/lab/types";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withLabOwner(req, async ({ config, actor }) =>
    NextResponse.json({ items: await listLabs(config, actor) })
  );
}

export function POST(req: Request) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const body = await readJsonObject(req);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (name.length < 1 || name.length > 120) {
      return labError(400, "validation_failed", "Name must be 1 to 120 characters");
    }
    const objective =
      typeof body?.objective === "string" ? body.objective.trim() : undefined;
    if (objective !== undefined && objective.length > 4000) {
      return labError(400, "validation_failed", "Objective must be at most 4000 characters");
    }
    const brief = typeof body?.brief === "string" ? body.brief.trim() : "";
    if (brief.length > MAX_BRIEF_LENGTH) {
      return labError(400, "validation_failed", `The description must be at most ${MAX_BRIEF_LENGTH} characters`);
    }
    try {
      const snapshot = await createLab(config, actor, idempotencyKey, {
        name,
        ...(objective ? { objective } : {}),
        ...(brief ? { brief } : {}),
      });
      return NextResponse.json(snapshot, { status: 201 });
    } catch (err) {
      // A Lab Manager from before lab descriptions refuses the unknown field.
      if (brief && err instanceof LabManagerError && err.code === "validation_failed") {
        return labError(
          400,
          "validation_failed",
          `The Lab Manager refused this lab (${err.message}). If it is older than lab descriptions, update it or create the lab without one.`
        );
      }
      throw err;
    }
  });
}
