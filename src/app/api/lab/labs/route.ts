import { NextResponse } from "next/server";
import { labError, readJsonObject, withLabOwner } from "@/lib/lab/route";
import { createLab, listLabs } from "@/lib/lab/manager";

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
    const snapshot = await createLab(config, actor, idempotencyKey, {
      name,
      ...(objective ? { objective } : {}),
    });
    return NextResponse.json(snapshot, { status: 201 });
  });
}
