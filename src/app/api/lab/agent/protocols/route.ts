import { db } from "@/db";
import { labError, withAgent } from "@/lib/lab/route";
import { readJson } from "@/lib/lab/json-body";
import { validateProtocolPost } from "@/lib/lab/validate";
import { planRevision, ProtocolRuleError } from "@/lib/lab/protocols";
import { createProtocol, getProtocol } from "@/lib/lab/store";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function POST(req: Request) {
  return withAgent(req, ["advisor"], async () => {
    const body = await readJson(req);
    if (!body.ok) return labError(400, "invalid", "body must be JSON");
    const v = validateProtocolPost(body.value);
    if (!v.ok) return labError(400, "invalid", v.message);
    const input = v.value;

    let revised = null;
    if (input.revisesId !== null) {
      if (!UUID_RE.test(input.revisesId)) return labError(400, "invalid", "revisesId must be a protocol id");
      revised = await getProtocol(db, input.revisesId);
      if (!revised) return labError(404, "not_found", "No protocol with that revisesId");
      if (revised.experimentId !== input.experiment) {
        return labError(400, "invalid", "a revision must keep the experiment of the protocol it revises");
      }
    }

    try {
      const plan = planRevision(revised);
      const created = await createProtocol(db, input, plan);
      return Response.json({ id: created.id, version: created.version }, { status: 201 });
    } catch (err) {
      if (err instanceof ProtocolRuleError) {
        return labError(409, err.code, "that version was replaced; revise the newest version");
      }
      throw err;
    }
  });
}
