// Shared Lab shapes. Keep this file free of database imports: the client uses it too.

import type { ProtocolStatus } from "./protocols";

export type RunStatus = "running" | "done" | "failed" | "stopped";

export interface OverviewRun {
  id: string;
  experimentId: string;
  experimentTitle: string | null;
  stage: string;
  setupId: string;
  podId: string;
  capUsd: number;
  status: RunStatus;
  progressPct: number | null;
  eta: Date | null;
  progressAt: Date | null;
  startedAt: Date;
  endedAt: Date | null;
  endNote: string | null;
}

// ─── Overview DTO (server → client) ──────────────────────────────────────────
// Times are ISO strings. Money is plain USD numbers; the UI formats it.

export type PodRowStatus = RunStatus | "pod_gone" | "unassigned";

export interface PodRow {
  kind: "run" | "unassigned";
  runId: string | null;
  // The run's stage, or the pod's name for an unassigned pod.
  stage: string;
  setupId: string | null;
  podId: string;
  capUsd: number | null;
  // Billed plus accruing; null (unknown) when RunPod is not connected or unavailable.
  cost: number | null;
  status: PodRowStatus;
  progressPct: number | null;
  eta: string | null;
  staleMinutes: number | null;
  endedAt: string | null;
  /** Why the run ended, as its agent reported; null while running or for an unassigned pod. */
  endNote: string | null;
}

export interface ExperimentRow {
  id: string;
  title: string | null;
  summary: string;
  progressPct: number | null;
  eta: string | null;
  // Sum of its pod rows; null (unknown) when RunPod is not connected or unavailable.
  cost: number | null;
  expanded: boolean;
  pods: PodRow[];
}

export interface OverviewDTO {
  runpod: "ok" | "not_connected" | "error";
  podsRunning: number | null;
  podsRunningLabel: string;
  spent: { billed: number; accruing: number } | null;
  next: { at: string; label: string } | null;
  experiments: ExperimentRow[];
}

// ─── Board DTOs (server → client) ────────────────────────────────────────────
// Columns are derived on the client: protocols from `status`, reports from
// `read` and `replies.length`. Times are ISO strings.

export interface ProtocolCard {
  id: string;
  experiment: string;
  title: string;
  version: number;
  status: ProtocolStatus;
  /** First paragraph of the markdown, plain text, at most 200 chars. */
  excerpt: string;
  note: string | null;
  /** The owner's note on the version this one revises. */
  previousNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export type ProtocolDetail = ProtocolCard & {
  bodyMd: string;
  previous: { version: number; status: ProtocolStatus; note: string | null } | null;
};

export interface ReportCard {
  id: string;
  experiment: string | null;
  title: string;
  summary: string;
  createdAt: string;
  read: boolean;
  /** Oldest first. */
  replies: { body: string; createdAt: string }[];
}
