import { db } from "@/db";
import { labError, withAgent } from "@/lib/lab/route";
import { readJson } from "@/lib/lab/json-body";
import { validateRunStart } from "@/lib/lab/validate";
import { listRunningRuns, PodInUseError, startRun } from "@/lib/lab/store";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return withAgent(req, ["executor"], async ({ role }) => {
    const body = await readJson(req);
    if (!body.ok) return labError(400, "invalid", "body must be JSON");
    const v = validateRunStart(body.value);
    if (!v.ok) return labError(400, "invalid", v.message);
    try {
      const { id } = await startRun(db, v.value, role);
      return Response.json({ id }, { status: 201 });
    } catch (err) {
      if (err instanceof PodInUseError) {
        return labError(409, "pod_in_use", "a running run already uses that pod");
      }
      throw err;
    }
  });
}

export function GET(req: Request) {
  return withAgent(req, ["executor"], async () => {
    const rows = await listRunningRuns(db);
    return Response.json({
      runs: rows.map((r) => ({
        id: r.id,
        experiment: r.experimentId,
        stage: r.stage,
        podId: r.podId,
        progressPct: r.progressPct,
        eta: r.eta,
      })),
    });
  });
}
