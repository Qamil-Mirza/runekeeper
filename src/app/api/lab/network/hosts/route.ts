import { NextResponse } from "next/server";
import { withLabOwner } from "@/lib/lab/route";
import { listNetworkHosts } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

/** The internet hosts sandboxed shell commands have reached or been forbidden. */
export function GET(req: Request) {
  return withLabOwner(req, async ({ config, actor }) =>
    NextResponse.json(await listNetworkHosts(config, actor))
  );
}
