import { db } from "@/db";
import { labError, withOwner } from "@/lib/lab/route";
import { readJson } from "@/lib/lab/json-body";
import { validateDecision } from "@/lib/lab/validate";
import { decideProtocol, getProtocol } from "@/lib/lab/store";

export const dynamic = "force-dynamic";

export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(req, async () => {
    const { id } = await ctx.params;
    const body = await readJson(req);
    if (!body.ok) return labError(400, "invalid", "body must be JSON");
    const v = validateDecision(body.value);
    if (!v.ok) return labError(400, "invalid", v.message);
    if (await decideProtocol(db, id, v.value.verdict, v.value.note, new Date())) {
      return Response.json({ ok: true });
    }
    // Nothing changed: either there is no such protocol or it is no longer waiting.
    if (!(await getProtocol(db, id))) return labError(404, "not_found", "No protocol with that id");
    return labError(409, "already_decided", "Already decided");
  });
}
