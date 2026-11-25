import { db } from "@/db";
import { labError, withAgent } from "@/lib/lab/route";
import { readJson } from "@/lib/lab/json-body";
import { validateReportPost } from "@/lib/lab/validate";
import { createReport } from "@/lib/lab/store";

export const dynamic = "force-dynamic";

// 4 MB of HTML plus room for the JSON wrapper and escaping.
const MAX_BODY_BYTES = 4 * 1024 * 1024 + 64 * 1024;

export function POST(req: Request) {
  return withAgent(req, ["advisor"], async () => {
    const length = Number(req.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
      return labError(413, "too_large", "html must be at most 4 MB");
    }
    const body = await readJson(req);
    if (!body.ok) return labError(400, "invalid", "body must be JSON");
    const v = validateReportPost(body.value);
    if (!v.ok) {
      return /\b(MB|KB)\b/.test(v.message)
        ? labError(413, "too_large", v.message)
        : labError(400, "invalid", v.message);
    }
    const { id } = await createReport(db, v.value);
    return Response.json({ id }, { status: 201 });
  });
}
