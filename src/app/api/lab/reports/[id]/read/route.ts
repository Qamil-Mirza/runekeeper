import { db } from "@/db";
import { labError, withOwner } from "@/lib/lab/route";
import { markReportRead } from "@/lib/lab/store";

export const dynamic = "force-dynamic";

/** Mark a report read. Idempotent: the first read time is kept. */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(req, async () => {
    const { id } = await ctx.params;
    if (!(await markReportRead(db, id, new Date()))) {
      return labError(404, "not_found", "No report with that id");
    }
    return Response.json({ ok: true });
  });
}
