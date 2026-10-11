import type { components } from "./openapi";

// Types generated from the pinned Lab Manager contract
// (docs/lab/contract/openapi.yaml). Regenerate with `npm run lab:types`.
type Schemas = components["schemas"];

export type LabHealth = Schemas["Health"];
export type LabCapability = Schemas["Capability"];
export type LabSummary = Schemas["LabSummary"];
export type Lab = Schemas["Lab"];
export type LabSnapshot = Schemas["LabSnapshot"];
export type LabStatus = Schemas["LabStatus"];
export type LabAgent = Schemas["Agent"];
export type LabAgentState = Schemas["AgentState"];
export type LabAgentRole = Schemas["AgentRole"];
export type LabTranscriptItem = Schemas["TranscriptItem"];
export type LabErrorCode = Schemas["ErrorCode"];
export type LabJob = Schemas["Job"];
export type LabJobStatus = Schemas["JobStatus"];
export type LabBudget = Schemas["Budget"];

export interface LabTranscriptPage {
  items: LabTranscriptItem[];
  nextCursor: string | null;
}

export interface LabJobPage {
  items: LabJob[];
  nextCursor: string | null;
}

/** Longest instruction the Lab Manager accepts. */
export const MAX_INSTRUCTION_LENGTH = 20_000;

export const LAB_ACTIONS = ["start", "stop"] as const;
export type LabAction = (typeof LAB_ACTIONS)[number];

export const AGENT_ACTIONS = ["start", "stop", "restart", "resume"] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];

/** Major API version this client was written against. */
export const SUPPORTED_API_MAJOR = "1";

/**
 * Error codes Runekeeper adds on top of the contract's list, for failures
 * that happen before the Lab Manager can answer.
 */
export type LabClientErrorCode =
  | LabErrorCode
  | "manager_unreachable"
  | "manager_bad_response"
  | "forbidden_origin";

export interface LabErrorBody {
  error: {
    code: LabClientErrorCode;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}

/** What the Lab view needs to render the connection banner. */
export interface LabConnectionStatus {
  reachable: boolean;
  /** False when the manager's API major version is not the one we support. */
  apiCompatible: boolean;
  health: LabHealth | null;
  error: LabErrorBody["error"] | null;
  checkedAt: string;
  /** Optional parts of the Lab screen, switched by Runekeeper's own settings. */
  features?: { runtimeLimit: boolean };
}
