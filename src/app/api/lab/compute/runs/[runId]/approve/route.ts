import { withLabOwner } from "@/lib/lab/route";
import { decideCompute } from "@/lib/lab/compute-decision";

export const dynamic = "force-dynamic";

/** The owner approves one rental of compute. */
export function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  return withLabOwner(req, async (ctx) => decideCompute(req, ctx, (await params).runId, "approve"));
}
