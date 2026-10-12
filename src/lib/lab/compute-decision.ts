import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { authorizeComputeDecision, maxAuthAgeMs } from "./decision";
import { decideComputeRun, getComputeRun, isValidLabId } from "./manager";
import { labError, readJsonObject, type LabRouteContext } from "./route";

const STATUS: Record<string, number> = {
  not_pending: 409,
  confirmation_required: 400,
  stale_view: 409,
  reauthentication_required: 403,
};

/**
 * The owner's decision on one rental of compute, for a route already inside
 * the owner gate. Server-side only.
 *
 * The request is read from the Lab Manager here, not taken from the browser:
 * the browser says which run, which decision, and the figures the owner was
 * shown, and those must match the record. Approving also needs a sign-in
 * recent enough, taken from the signed session and nowhere else.
 */
export async function decideCompute(
  req: Request,
  { config, actor, idempotencyKey }: LabRouteContext,
  runId: string,
  decision: "approve" | "deny"
): Promise<Response> {
  if (!isValidLabId(runId)) return labError(404, "not_found", "Not found");
  const body = await readJsonObject(req);

  const session = await auth();
  if (session?.user?.id !== actor.id) return labError(404, "not_found", "Not found");

  const run = await getComputeRun(config, actor, runId);
  const verdict = authorizeComputeDecision({
    run,
    decision,
    confirmation: body?.confirmation,
    authTime: (session as { authTime?: unknown }).authTime,
    now: Date.now(),
    maxAuthAgeMs: maxAuthAgeMs(),
  });
  if (!verdict.ok) {
    const code = verdict.code === "not_pending" ? "conflict" : verdict.code;
    return labError(STATUS[verdict.code] ?? 400, code as Parameters<typeof labError>[1], verdict.message);
  }
  return NextResponse.json(await decideComputeRun(config, actor, idempotencyKey, runId, decision));
}
