// Shared Lab shapes. Keep this file free of database imports: the client uses it too.

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
