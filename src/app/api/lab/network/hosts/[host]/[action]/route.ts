import { NextResponse } from "next/server";
import { labError, withLabOwner } from "@/lib/lab/route";
import { isValidHostName, setNetworkHost } from "@/lib/lab/manager";
import { NETWORK_HOST_ACTIONS, type NetworkHostAction } from "@/lib/lab/types";

export const dynamic = "force-dynamic";

/** Blocks a host for every shell command, or allows it again. */
export function POST(
  req: Request,
  { params }: { params: Promise<{ host: string; action: string }> }
) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { host, action } = await params;
    if (!isValidHostName(host) || !(NETWORK_HOST_ACTIONS as readonly string[]).includes(action)) {
      return labError(404, "not_found", "Not found");
    }
    return NextResponse.json(
      await setNetworkHost(config, actor, idempotencyKey, host, action as NetworkHostAction)
    );
  });
}
