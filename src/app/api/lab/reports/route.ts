import { db } from "@/db";
import { withOwner } from "@/lib/lab/route";
import { listReportsForBoard } from "@/lib/lab/store";
import { reportCard } from "@/lib/lab/board";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withOwner(req, async () => {
    const rows = await listReportsForBoard(db);
    return Response.json({ cards: rows.map(reportCard) });
  });
}
