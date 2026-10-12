import type { components } from "./openapi";

// Types generated from the pinned Lab Manager contract
// (docs/lab/contract/openapi.yaml). Regenerate with `npm run lab:types`.
type Schemas = components["schemas"];

/** One rented-compute run an agent asked for. Its title and request are agent-written. */
/** What became of a message: a new task, sent into the running task, or kept for later. */
export type MessageDelivery = "started" | "duringTask" | "queued";
export interface LabMessageReceipt {
  /** Null when the message is kept for later. */
  job: LabJob | null;
  transcriptItem: LabTranscriptItem;
  /** Absent from a Lab Manager older than draft.19, which only ever starts a task. */
  delivery?: MessageDelivery;
}
/** A side question as accepted; its answer arrives later in the transcript. */
export interface LabAsideReceipt {
  question: LabTranscriptItem;
}
type Json<P extends keyof import("./openapi").paths, M extends string, S extends number> = import("./openapi").paths[P] extends Record<
  M,
  { responses: Record<S, { content: { "application/json": infer T } }> }
>
  ? T
  : never;
/** One directory of an agent's working directory, each entry with what it holds on disk. */
export type LabFileUsage = Json<"/v1/agents/{agentId}/files/usage", "get", 200>;
export type LabFileUsageEntry = LabFileUsage["entries"][number];
export type LabFileDeletion = Json<"/v1/agents/{agentId}/files", "delete", 200>;
export type LabTempCleared = Json<"/v1/agents/{agentId}/files/clear-temp", "post", 200>;
/** Where the disk space is, by lab and agent. */
export type LabStorage = Json<"/v1/storage", "get", 200>;
/** Longest path inside a working directory the Lab Manager accepts. */
export const MAX_FILE_PATH_LENGTH = 1024;
/**
 * A path inside an agent's working directory, as the browser may name it:
 * relative, with no step out of the directory. The Lab Manager checks again.
 */
export function isWorkspacePath(path: unknown, allowEmpty: boolean): path is string {
  if (typeof path !== "string" || path.length > MAX_FILE_PATH_LENGTH) return false;
  if (path === "") return allowEmpty;
  if (path.startsWith("/") || path.includes("\0")) return false;
  return path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}
export type LabGitOp = Schemas["GitOp"];
export interface LabGitOps {
  repo: string | null;
  defaultBranch: string | null;
  items: LabGitOp[];
}
/** "owner/name" or the repository's https://github.com address. */
export const REPO_PATTERN = /^(https:\/\/github\.com\/)?[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?\/?$/;
export type LabComputeRun = Schemas["ComputeRun"];
/** A rental that waits for the owner's approval, with where it comes from. */
export type LabComputeApproval = LabComputeRun & {
  requestedBy: { labName: string; agentName: string; role: LabAgent["role"] };
};
export interface LabComputeApprovals {
  items: LabComputeApproval[];
}
/**
 * What the owner saw when deciding one rental. The server compares it with
 * the Lab Manager's own record and refuses if they differ.
 */
export interface ComputeDecisionConfirmation {
  runId: string;
  decision: "approve" | "deny";
  worstCaseUsd: number;
  usdPerHour: number;
}
/** A lab's rented-compute budget, counted by the Lab Manager's own clock. */
export type LabComputeBudget = Schemas["ComputeBudget"];
export interface LabComputeRuns {
  items: LabComputeRun[];
  budget: LabComputeBudget;
}

/** An internet host a sandboxed shell command has reached, or that the owner blocked. */
export type LabNetworkHost = Schemas["NetworkHost"];
export interface LabNetworkHosts {
  items: LabNetworkHost[];
  mode: "trustOnFirstUse" | "listOnly";
  /** Hosts set in the Lab Manager's configuration; allowed unless blocked. */
  listed: string[];
}
export const NETWORK_HOST_ACTIONS = ["block", "trust"] as const;
export type NetworkHostAction = (typeof NETWORK_HOST_ACTIONS)[number];

/** What the Lab Manager reports it removed, and what it kept, when a lab is deleted. */
export type LabDeletionReceipt = Schemas["LabDeletionReceipt"];

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
/** The owner's description of a lab, given to every agent of it. */
/** Longest note the Lab Manager keeps with a resolved escalation. */
export const MAX_ESCALATION_NOTE_LENGTH = 2_000;
export type LabEscalation = Schemas["Escalation"];
/** Longest side question the Lab Manager accepts. */
export const MAX_ASIDE_LENGTH = 4_000;
export const MAX_BRIEF_LENGTH = 16_000;

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
  | "forbidden_origin"
  // Refusals by Runekeeper's own server before a decision is passed on.
  | "confirmation_required"
  | "stale_view"
  | "reauthentication_required";

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
