CREATE TABLE "lab_experiments" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_protocols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lineage_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"revises_id" uuid,
	"experiment_id" text NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"status" text NOT NULL,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"seen_by_advisor_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_report_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_by_advisor_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lab_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" text,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"html" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lab_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" text NOT NULL,
	"stage" text NOT NULL,
	"setup_id" text NOT NULL,
	"pod_id" text NOT NULL,
	"cap_usd" numeric(10, 2) NOT NULL,
	"status" text NOT NULL,
	"progress_pct" integer,
	"eta" timestamp with time zone,
	"progress_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"end_note" text,
	"created_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lab_protocols" ADD CONSTRAINT "lab_protocols_experiment_id_lab_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."lab_experiments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_report_replies" ADD CONSTRAINT "lab_report_replies_report_id_lab_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."lab_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_experiment_id_lab_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."lab_experiments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD CONSTRAINT "lab_runs_experiment_id_lab_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."lab_experiments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lab_protocols_lineage_version_idx" ON "lab_protocols" USING btree ("lineage_id","version");--> statement-breakpoint
CREATE INDEX "lab_runs_status_idx" ON "lab_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lab_runs_pod_id_idx" ON "lab_runs" USING btree ("pod_id");