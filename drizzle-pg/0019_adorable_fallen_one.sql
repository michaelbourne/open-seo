CREATE TABLE "gbp_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"connected_by_user_id" text NOT NULL,
	"connected_account_email" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gbp_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"project_id" text NOT NULL,
	"google_location_name" text NOT NULL,
	"place_id" text,
	"title" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gbp_performance_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"metric_date" text NOT NULL,
	"metric_type" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"captured_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gbp_profile_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"payload_json" text NOT NULL,
	"captured_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gbp_review_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"review_id" text NOT NULL,
	"payload_json" text NOT NULL,
	"review_timestamp" text,
	"captured_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_ai_monitor_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"target_business_name" text NOT NULL,
	"target_domain" text,
	"schedule_interval" text DEFAULT 'weekly' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_checked_at" text,
	"next_check_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_ai_monitor_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text NOT NULL,
	"keyword" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_ai_scan_results" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"keyword_id" text NOT NULL,
	"model" text NOT NULL,
	"mentioned" boolean DEFAULT false NOT NULL,
	"excerpt" text,
	"payload_json" text,
	"checked_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_ai_scan_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text NOT NULL,
	"project_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"cost_usd" real,
	"error_message" text,
	"completed_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_map_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"center_latitude" real NOT NULL,
	"center_longitude" real NOT NULL,
	"grid_size" integer DEFAULT 5 NOT NULL,
	"radius_km" real DEFAULT 5 NOT NULL,
	"target_place_id" text,
	"target_cid" text,
	"language_code" text DEFAULT 'en' NOT NULL,
	"device" text DEFAULT 'desktop' NOT NULL,
	"schedule_interval" text DEFAULT 'weekly' NOT NULL,
	"serp_depth" integer DEFAULT 20 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_checked_at" text,
	"next_check_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_map_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"keyword" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_map_scan_results" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"keyword_id" text NOT NULL,
	"pin_index" integer NOT NULL,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"rank_absolute" integer,
	"matched_title" text,
	"snapshot_json" text,
	"checked_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_map_scan_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"project_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"pins_total" integer DEFAULT 0 NOT NULL,
	"pins_completed" integer DEFAULT 0 NOT NULL,
	"cost_usd" real,
	"error_message" text,
	"started_at" text,
	"completed_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_branding" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"agency_name" text NOT NULL,
	"logo_url" text,
	"primary_color_hex" text DEFAULT '#2563eb' NOT NULL,
	"footer_text" text,
	"cover_subtitle" text,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_usage_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"credit_feature" text NOT NULL,
	"cost_usd" real NOT NULL,
	"api_path" text,
	"project_id" text,
	"run_id" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_usage_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"monthly_budget_usd" real,
	"alert_threshold_pct" integer DEFAULT 80 NOT NULL,
	"daily_agent_budget_usd" real,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gbp_connections" ADD CONSTRAINT "gbp_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gbp_connections" ADD CONSTRAINT "gbp_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gbp_locations" ADD CONSTRAINT "gbp_locations_connection_id_gbp_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."gbp_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gbp_locations" ADD CONSTRAINT "gbp_locations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gbp_performance_snapshots" ADD CONSTRAINT "gbp_performance_snapshots_location_id_gbp_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gbp_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gbp_profile_snapshots" ADD CONSTRAINT "gbp_profile_snapshots_location_id_gbp_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gbp_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gbp_review_snapshots" ADD CONSTRAINT "gbp_review_snapshots_location_id_gbp_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gbp_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_ai_monitor_configs" ADD CONSTRAINT "local_ai_monitor_configs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_ai_monitor_keywords" ADD CONSTRAINT "local_ai_monitor_keywords_config_id_local_ai_monitor_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."local_ai_monitor_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_ai_scan_results" ADD CONSTRAINT "local_ai_scan_results_run_id_local_ai_scan_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."local_ai_scan_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_ai_scan_results" ADD CONSTRAINT "local_ai_scan_results_keyword_id_local_ai_monitor_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."local_ai_monitor_keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_ai_scan_runs" ADD CONSTRAINT "local_ai_scan_runs_config_id_local_ai_monitor_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."local_ai_monitor_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_ai_scan_runs" ADD CONSTRAINT "local_ai_scan_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_map_campaigns" ADD CONSTRAINT "local_map_campaigns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_map_keywords" ADD CONSTRAINT "local_map_keywords_campaign_id_local_map_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."local_map_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_map_scan_results" ADD CONSTRAINT "local_map_scan_results_run_id_local_map_scan_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."local_map_scan_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_map_scan_results" ADD CONSTRAINT "local_map_scan_results_keyword_id_local_map_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."local_map_keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_map_scan_runs" ADD CONSTRAINT "local_map_scan_runs_campaign_id_local_map_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."local_map_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_map_scan_runs" ADD CONSTRAINT "local_map_scan_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_branding" ADD CONSTRAINT "organization_branding_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_usage_ledger" ADD CONSTRAINT "organization_usage_ledger_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_usage_settings" ADD CONSTRAINT "organization_usage_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gbp_connections_project_idx" ON "gbp_connections" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gbp_locations_project_idx" ON "gbp_locations" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gbp_performance_snapshots_location_date_metric_idx" ON "gbp_performance_snapshots" USING btree ("location_id","metric_date","metric_type");--> statement-breakpoint
CREATE INDEX "gbp_profile_snapshots_location_captured_idx" ON "gbp_profile_snapshots" USING btree ("location_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gbp_review_snapshots_location_review_idx" ON "gbp_review_snapshots" USING btree ("location_id","review_id");--> statement-breakpoint
CREATE INDEX "local_ai_monitor_configs_project_idx" ON "local_ai_monitor_configs" USING btree ("project_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "local_ai_monitor_keywords_config_keyword_idx" ON "local_ai_monitor_keywords" USING btree ("config_id","keyword");--> statement-breakpoint
CREATE UNIQUE INDEX "local_ai_scan_results_run_keyword_model_idx" ON "local_ai_scan_results" USING btree ("run_id","keyword_id","model");--> statement-breakpoint
CREATE INDEX "local_ai_scan_runs_config_idx" ON "local_ai_scan_runs" USING btree ("config_id","created_at");--> statement-breakpoint
CREATE INDEX "local_map_campaigns_project_idx" ON "local_map_campaigns" USING btree ("project_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "local_map_keywords_campaign_keyword_idx" ON "local_map_keywords" USING btree ("campaign_id","keyword");--> statement-breakpoint
CREATE UNIQUE INDEX "local_map_scan_results_run_keyword_pin_idx" ON "local_map_scan_results" USING btree ("run_id","keyword_id","pin_index");--> statement-breakpoint
CREATE INDEX "local_map_scan_runs_campaign_idx" ON "local_map_scan_runs" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "local_map_scan_runs_active_idx" ON "local_map_scan_runs" USING btree ("campaign_id") WHERE "local_map_scan_runs"."status" IN ('pending', 'running');--> statement-breakpoint
CREATE INDEX "organization_usage_ledger_org_created_idx" ON "organization_usage_ledger" USING btree ("organization_id","created_at");