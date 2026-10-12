import { NextResponse } from "next/server";
import { withLabOwner } from "@/lib/lab/route";
import { getStorage } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

/** Where the disk space is, by lab and agent. */
export function GET(req: Request) {
  return withLabOwner(req, async ({ config, actor }) => NextResponse.json(await getStorage(config, actor)));
}
