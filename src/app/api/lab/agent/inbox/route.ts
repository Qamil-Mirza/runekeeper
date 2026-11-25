import { db } from "@/db";
import { labError, withAgent } from "@/lib/lab/route";
import { takeInbox } from "@/lib/lab/store";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return withAgent(req, ["advisor"], async () => {
    const text = await req.text();
    let all = false;
    if (text.trim() !== "") {
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return labError(400, "invalid", "body must be JSON");
      }
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return labError(400, "invalid", "body must be a JSON object");
      }
      const flag = (body as Record<string, unknown>).all;
      if (flag !== undefined && typeof flag !== "boolean") {
        return labError(400, "invalid", "all must be true or false");
      }
      all = flag === true;
    }
    const items = await takeInbox(db, all, new Date());
    return Response.json({ items });
  });
}
