import { db } from "@/db";
import { withOwner } from "@/lib/lab/route";
import { listRunsForOverview } from "@/lib/lab/store";
import { getRunpodSnapshot } from "@/lib/lab/runpod";
import { buildOverview } from "@/lib/lab/overview";
import type { OverviewDTO } from "@/lib/lab/types";

export const dynamic = "force-dynamic";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function GET(req: Request) {
  return withOwner(req, async ({ settings }) => {
    const now = new Date();
    const since = new Date(now.getTime() - WINDOW_MS);
    const key = settings.runpodKey;

    const [runs, snap] = await Promise.all([
      listRunsForOverview(db, since),
      // A RunPod failure never fails the page: the agents' data still shows.
      key ? getRunpodSnapshot(key, now, since).catch(() => ({ error: "unreachable" })) : null,
    ]);

    let runpodState: OverviewDTO["runpod"] = "not_connected";
    if (snap) runpodState = "error" in snap ? "error" : "ok";
    const snapshot = snap && !("error" in snap) ? snap : null;
    return Response.json(buildOverview({ runs, snapshot, runpodState, now }));
  });
}
