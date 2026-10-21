import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { organization } from "./better-auth-schema";

// Self-host spend ceiling. Hosted mode uses credits and ignores these rows.
// A null or non-positive cap means that limit is off.
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
