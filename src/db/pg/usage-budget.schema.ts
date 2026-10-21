import { sql } from "drizzle-orm";
import { index, integer, pgTable, real, text } from "drizzle-orm/pg-core";
import { organization } from "./better-auth-schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export const organizationUsageSettings = pgTable(
  "organization_usage_settings",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    monthlyBudgetUsd: real("monthly_budget_usd"),
    alertThresholdPct: integer("alert_threshold_pct").notNull().default(80),
    dailyAgentBudgetUsd: real("daily_agent_budget_usd"),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
);

export const organizationUsageLedger = pgTable(
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
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    index("organization_usage_ledger_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);
