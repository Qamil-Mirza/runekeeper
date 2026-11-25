import { db } from "@/db";
import { labError, withOwner } from "@/lib/lab/route";
import { getReportHtml } from "@/lib/lab/store";
import { REPORT_FRAME_CSP } from "@/lib/security-headers";

export const dynamic = "force-dynamic";

/**
 * The report's HTML, for an `<iframe sandbox="allow-scripts">` on the Lab
 * page. The CSP sandboxes it into an opaque origin even if opened directly.
 */
export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(req, async () => {
    const { id } = await ctx.params;
    const html = await getReportHtml(db, id);
    if (html === null) return labError(404, "not_found", "No report with that id");
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": REPORT_FRAME_CSP,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  });
}
