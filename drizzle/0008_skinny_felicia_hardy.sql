DROP INDEX "lab_runs_pod_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "lab_runs_pod_id_running_idx" ON "lab_runs" USING btree ("pod_id") WHERE "lab_runs"."status" = 'running';