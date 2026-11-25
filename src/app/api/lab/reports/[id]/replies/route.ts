import { db } from "@/db";
import { labError, withOwner } from "@/lib/lab/route";
import { readJson } from "@/lib/lab/json-body";
import { validateReply } from "@/lib/lab/validate";
import { addReply } from "@/lib/lab/store";

export const dynamic = "force-dynamic";

export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(req, async () => {
    const { id } = await ctx.params;
    const body = await readJson(req);
    if (!body.ok) return labError(400, "invalid", "body must be JSON");
    const v = validateReply(body.value);
    if (!v.ok) return labError(400, "invalid", v.message);
    const reply = await addReply(db, id, v.value.body);
    if (!reply) return labError(404, "not_found", "No report with that id");
    return Response.json({ id: reply.id }, { status: 201 });
  });
}
