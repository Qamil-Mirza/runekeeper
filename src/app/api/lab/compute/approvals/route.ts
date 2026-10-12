import { NextResponse } from "next/server";
import { withLabOwner } from "@/lib/lab/route";
import { listComputeApprovals } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

/** Every rental that waits for the owner's approval, across labs. */
export function GET(req: Request) {
  return withLabOwner(req, async ({ config, actor }) => NextResponse.json(await listComputeApprovals(config, actor)));
}
