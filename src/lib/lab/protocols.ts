export type ProtocolStatus = "waiting" | "accepted" | "rejected" | "superseded";

export interface ProtocolRow {
  id: string;
  lineageId: string;
  version: number;
  status: ProtocolStatus;
  experimentId: string;
}

export type ProtocolRuleCode = "already_decided" | "revise_superseded";

export class ProtocolRuleError extends Error {
  readonly code: ProtocolRuleCode;
  constructor(code: ProtocolRuleCode) {
    super(code);
    this.name = "ProtocolRuleError";
    this.code = code;
    Object.setPrototypeOf(this, ProtocolRuleError.prototype);
  }
}

/** Plan a new protocol post. `revised` is the protocol being revised, or null for a first post. */
export function planRevision(revised: ProtocolRow | null): {
  version: number;
  lineageId: string | null;
  supersedeId: string | null;
} {
  if (!revised) return { version: 1, lineageId: null, supersedeId: null };
  if (revised.status === "superseded") throw new ProtocolRuleError("revise_superseded");
  return {
    version: revised.version + 1,
    lineageId: revised.lineageId,
    supersedeId: revised.status === "waiting" ? revised.id : null,
  };
}

/** Only a waiting protocol can be decided. */
export function checkDecision(p: ProtocolRow): void {
  if (p.status !== "waiting") throw new ProtocolRuleError("already_decided");
}
