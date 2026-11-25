import { db } from "@/db";
import { labError, withAgent } from "@/lib/lab/route";
import { readJson } from "@/lib/lab/json-body";
import { validateProgress } from "@/lib/lab/validate";
import { updateProgress } from "@/lib/lab/store";

export const dynamic = "force-dynamic";

export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAgent(req, ["executor"], async () => {
    const { id } = await ctx.params;
    const now = new Date();
    const body = await readJson(req);
    if (!body.ok) return labError(400, "invalid", "body must be JSON");
    const v = validateProgress(body.value, now);
    if (!v.ok) return labError(400, "invalid", v.message);
    const ok = await updateProgress(db, id, v.value.pct, v.value.eta, now);
    if (!ok) return labError(404, "not_found", "No running run with that id");
    return Response.json({ ok: true });
  });
}
