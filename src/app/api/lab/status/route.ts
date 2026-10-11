import { NextResponse } from "next/server";
import { withLabOwner } from "@/lib/lab/route";
import { runtimeLimitEnabled } from "@/lib/lab/config";
import { getConnectionStatus } from "@/lib/lab/manager";

export const dynamic = "force-dynamic";

// Also the probe the client uses to decide whether to show the Lab at all:
// anyone but a configured owner gets 404.
export function GET(req: Request) {
  return withLabOwner(req, async ({ config }) =>
    NextResponse.json({
      ...(await getConnectionStatus(config)),
      features: { runtimeLimit: runtimeLimitEnabled() },
    })
  );
}
