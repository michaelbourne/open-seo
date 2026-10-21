import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

// Timestamps stay text so they match the SQLite column shape. See pg/app.schema.ts.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export const localMapCampaigns = pgTable(
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
    isActive: boolean("is_active").notNull().default(true),
    lastCheckedAt: text("last_checked_at"),
    nextCheckAt: text("next_check_at"),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    index("local_map_campaigns_project_idx").on(
      table.projectId,
      table.isActive,
    ),
  ],
);

export const localMapKeywords = pgTable(
  "local_map_keywords",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => localMapCampaigns.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("local_map_keywords_campaign_keyword_idx").on(
      table.campaignId,
      table.keyword,
    ),
  ],
);

export const localMapScanRuns = pgTable(
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
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    index("local_map_scan_runs_campaign_idx").on(
      table.campaignId,
      table.createdAt,
    ),
    uniqueIndex("local_map_scan_runs_active_idx")
      .on(table.campaignId)
      .where(sql`${table.status} IN ('pending', 'running')`),
  ],
);

export const localMapScanResults = pgTable(
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
    checkedAt: text("checked_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("local_map_scan_results_run_keyword_pin_idx").on(
      table.runId,
      table.keywordId,
      table.pinIndex,
    ),
  ],
);
