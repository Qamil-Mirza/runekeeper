import { NextResponse } from "next/server";
import { labError, readJsonObject, withLabOwner } from "@/lib/lab/route";
import { runtimeLimitEnabled } from "@/lib/lab/config";
import {
  LabManagerError,
  getAgent,
  getHealth,
  isValidLabId,
  sendAgentMessage,
  setRuntimeLimit,
} from "@/lib/lab/manager";
import { MAX_INSTRUCTION_LENGTH } from "@/lib/lab/types";

export const dynamic = "force-dynamic";

const outOfRuntime = (err: unknown): err is LabManagerError =>
  err instanceof LabManagerError && err.code === "budget_exceeded" && err.details?.metric === "wallClockMinutes";

export function POST(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  return withLabOwner(req, async ({ config, actor, idempotencyKey }) => {
    const { agentId } = await params;
    if (!isValidLabId(agentId)) return labError(404, "not_found", "Not found");

    const body = await readJsonObject(req);
    const text = typeof body?.text === "string" ? body.text : "";
    if (text.trim().length < 1 || text.length > MAX_INSTRUCTION_LENGTH) {
      return labError(400, "validation_failed", `An instruction must be 1 to ${MAX_INSTRUCTION_LENGTH} characters`);
    }

    try {
      const accepted = await sendAgentMessage(config, actor, idempotencyKey, agentId, text);
      return NextResponse.json(accepted, { status: 202 });
    } catch (err) {
      // With the runtime limit switched off, keep it at the host's maximum so
      // it never stands between the owner and an agent. The owner's own
      // instruction is what triggers this; nothing else can.
      if (!outOfRuntime(err) || runtimeLimitEnabled()) throw err;
      // Only in manual mode, where the owner starts every task. Under a host
      // policy this limit bounds unattended work and is never raised here.
      const { policy } = await getHealth(config);
      const cap = policy.runtimeCapMinutes;
      const consumed = Number(err.details?.consumed);
      if (policy.mode !== "manual" || !(cap > 0) || !(consumed < cap)) throw err;
      const { labId } = await getAgent(config, actor, agentId);
      await setRuntimeLimit(config, actor, `${idempotencyKey}-rt`.slice(0, 128), labId, cap);
      const accepted = await sendAgentMessage(config, actor, `${idempotencyKey}-2`.slice(0, 128), agentId, text);
      return NextResponse.json(accepted, { status: 202 });
    }
  });
}
