import { withOwner } from "@/lib/lab/route";

export const dynamic = "force-dynamic";

/** 200 for the owner, 404 for everyone else: lets the UI decide whether to show the Lab. */
export function GET(req: Request) {
  return withOwner(req, async () => Response.json({}));
}
