import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// ============================================================================
// Phase 1 — Maps grid rank tracking
// ============================================================================

export const localMapCampaigns = sqliteTable(
  "local_map_campaigns",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    centerLatitude: real("center_latitude").notNull(),
    centerLongitude: real("center_longitude").notNull(),
    gridSize: integer("grid_size").notNull().default(5),
    radiusKm: real("radius_km").notNull().default(5),
    targetPlaceId: text("target_place_id"),
    targetCid: text("target_cid"),
    languageCode: text("language_code").notNull().default("en"),
    device: text("device", { enum: ["desktop", "mobile"] })
      .notNull()
      .default("desktop"),
    scheduleInterval: text("schedule_interval", {
      enum: ["weekly", "monthly", "manual"],
    })
      .notNull()
      .default("weekly"),
    serpDepth: integer("serp_depth").notNull().default(20),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastCheckedAt: text("last_checked_at"),
    nextCheckAt: text("next_check_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("local_map_campaigns_project_idx").on(table.projectId, table.isActive),
  ],
);

export const localMapKeywords = sqliteTable(
  "local_map_keywords",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => localMapCampaigns.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("local_map_keywords_campaign_keyword_idx").on(
      table.campaignId,
      table.keyword,
    ),
  ],
);

export const localMapScanRuns = sqliteTable(
  "local_map_scan_runs",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => localMapCampaigns.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "running", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    trigger: text("trigger", { enum: ["manual", "scheduled"] })
      .notNull()
      .default("manual"),
    pinsTotal: integer("pins_total").notNull().default(0),
    pinsCompleted: integer("pins_completed").notNull().default(0),
    costUsd: real("cost_usd"),
    errorMessage: text("error_message"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("local_map_scan_runs_campaign_idx").on(table.campaignId, table.createdAt),
    uniqueIndex("local_map_scan_runs_active_idx")
      .on(table.campaignId)
      .where(sql`${table.status} IN ('pending', 'running')`),
  ],
);

export const localMapScanResults = sqliteTable(
  "local_map_scan_results",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => localMapScanRuns.id, { onDelete: "cascade" }),
    keywordId: text("keyword_id")
      .notNull()
      .references(() => localMapKeywords.id, { onDelete: "cascade" }),
    pinIndex: integer("pin_index").notNull(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    rankAbsolute: integer("rank_absolute"),
    matchedTitle: text("matched_title"),
    snapshotJson: text("snapshot_json"),
    checkedAt: text("checked_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("local_map_scan_results_run_keyword_pin_idx").on(
      table.runId,
      table.keywordId,
      table.pinIndex,
    ),
  ],
);

// ============================================================================
// Phase 2 — Usage budgets
// ============================================================================

export const organizationUsageSettings = sqliteTable(
  "organization_usage_settings",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    monthlyBudgetUsd: real("monthly_budget_usd"),
    alertThresholdPct: integer("alert_threshold_pct").notNull().default(80),
    dailyAgentBudgetUsd: real("daily_agent_budget_usd"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
);

export const organizationUsageLedger = sqliteTable(
  "organization_usage_ledger",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    creditFeature: text("credit_feature").notNull(),
    costUsd: real("cost_usd").notNull(),
    apiPath: text("api_path"),
    projectId: text("project_id"),
    runId: text("run_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("organization_usage_ledger_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

// ============================================================================
// Phase 3 — GBP read-only analytics
// ============================================================================

export const gbpConnections = sqliteTable(
  "gbp_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    connectedByUserId: text("connected_by_user_id").notNull(),
    connectedAccountEmail: text("connected_account_email"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("gbp_connections_project_idx").on(table.projectId),
  ],
);

export const gbpLocations = sqliteTable(
  "gbp_locations",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => gbpConnections.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    googleLocationName: text("google_location_name").notNull(),
    placeId: text("place_id"),
    title: text("title"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("gbp_locations_project_idx").on(table.projectId),
  ],
);

export const gbpPerformanceSnapshots = sqliteTable(
  "gbp_performance_snapshots",
  {
    id: text("id").primaryKey(),
    locationId: text("location_id")
      .notNull()
      .references(() => gbpLocations.id, { onDelete: "cascade" }),
    metricDate: text("metric_date").notNull(),
    metricType: text("metric_type").notNull(),
    value: integer("value").notNull().default(0),
    capturedAt: text("captured_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("gbp_performance_snapshots_location_date_metric_idx").on(
      table.locationId,
      table.metricDate,
      table.metricType,
    ),
  ],
);

export const gbpProfileSnapshots = sqliteTable(
  "gbp_profile_snapshots",
  {
    id: text("id").primaryKey(),
    locationId: text("location_id")
      .notNull()
      .references(() => gbpLocations.id, { onDelete: "cascade" }),
    payloadJson: text("payload_json").notNull(),
    capturedAt: text("captured_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("gbp_profile_snapshots_location_captured_idx").on(
      table.locationId,
      table.capturedAt,
    ),
  ],
);

export const gbpReviewSnapshots = sqliteTable(
  "gbp_review_snapshots",
  {
    id: text("id").primaryKey(),
    locationId: text("location_id")
      .notNull()
      .references(() => gbpLocations.id, { onDelete: "cascade" }),
    reviewId: text("review_id").notNull(),
    payloadJson: text("payload_json").notNull(),
    reviewTimestamp: text("review_timestamp"),
    capturedAt: text("captured_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("gbp_review_snapshots_location_review_idx").on(
      table.locationId,
      table.reviewId,
    ),
  ],
);

// ============================================================================
// Phase 4 — Local AI visibility monitoring
// ============================================================================

export const localAiMonitorConfigs = sqliteTable(
  "local_ai_monitor_configs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetBusinessName: text("target_business_name").notNull(),
    targetDomain: text("target_domain"),
    scheduleInterval: text("schedule_interval", {
      enum: ["weekly", "monthly", "manual"],
    })
      .notNull()
      .default("weekly"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastCheckedAt: text("last_checked_at"),
    nextCheckAt: text("next_check_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("local_ai_monitor_configs_project_idx").on(
      table.projectId,
      table.isActive,
    ),
  ],
);

export const localAiMonitorKeywords = sqliteTable(
  "local_ai_monitor_keywords",
  {
    id: text("id").primaryKey(),
    configId: text("config_id")
      .notNull()
      .references(() => localAiMonitorConfigs.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("local_ai_monitor_keywords_config_keyword_idx").on(
      table.configId,
      table.keyword,
    ),
  ],
);

export const localAiScanRuns = sqliteTable(
  "local_ai_scan_runs",
  {
    id: text("id").primaryKey(),
    configId: text("config_id")
      .notNull()
      .references(() => localAiMonitorConfigs.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "running", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    trigger: text("trigger", { enum: ["manual", "scheduled"] })
      .notNull()
      .default("manual"),
    costUsd: real("cost_usd"),
    errorMessage: text("error_message"),
    completedAt: text("completed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("local_ai_scan_runs_config_idx").on(table.configId, table.createdAt),
  ],
);

export const localAiScanResults = sqliteTable(
  "local_ai_scan_results",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => localAiScanRuns.id, { onDelete: "cascade" }),
    keywordId: text("keyword_id")
      .notNull()
      .references(() => localAiMonitorKeywords.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    mentioned: integer("mentioned", { mode: "boolean" }).notNull().default(false),
    excerpt: text("excerpt"),
    payloadJson: text("payload_json"),
    checkedAt: text("checked_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("local_ai_scan_results_run_keyword_model_idx").on(
      table.runId,
      table.keywordId,
      table.model,
    ),
  ],
);

// ============================================================================
// Phase 5 — Organization branding for PDF reports
// ============================================================================

export const organizationBranding = sqliteTable(
  "organization_branding",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    agencyName: text("agency_name").notNull(),
    logoUrl: text("logo_url"),
    primaryColorHex: text("primary_color_hex").notNull().default("#2563eb"),
    footerText: text("footer_text"),
    coverSubtitle: text("cover_subtitle"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
);
