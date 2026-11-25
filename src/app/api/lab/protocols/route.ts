import { db } from "@/db";
import { labError, withOwner } from "@/lib/lab/route";
import { getProtocol, listProtocolsForBoard } from "@/lib/lab/store";
import { protocolCard, protocolDetail } from "@/lib/lab/board";

export const dynamic = "force-dynamic";

/** The board's cards, or with `?id=` one protocol in full. */
export function GET(req: Request) {
  return withOwner(req, async () => {
    const id = new URL(req.url).searchParams.get("id");
    if (id !== null) {
      const p = await getProtocol(db, id);
      if (!p) return labError(404, "not_found", "No protocol with that id");
      return Response.json(protocolDetail(p));
    }
    const rows = await listProtocolsForBoard(db);
    return Response.json({ cards: rows.map(protocolCard) });
  });
}
