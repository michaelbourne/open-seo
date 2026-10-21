import { and, eq, gte, sum } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { db } from "@/db";
import {
  organizationUsageLedger,
  organizationUsageSettings,
} from "@/db/schema";

function monthStartIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

async function getSettings(organizationId: string) {
  const rows = await db
    .select()
    .from(organizationUsageSettings)
    .where(eq(organizationUsageSettings.organizationId, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsertSettings(
  organizationId: string,
  data: {
    monthlyBudgetUsd: number | null;
    dailyAgentBudgetUsd: number | null;
  },
) {
  const existing = await getSettings(organizationId);
  const updatedAt = new Date().toISOString();
  if (existing) {
    await db
      .update(organizationUsageSettings)
      .set({ ...data, updatedAt })
      .where(eq(organizationUsageSettings.organizationId, organizationId));
    return;
  }
  await db.insert(organizationUsageSettings).values({
    organizationId,
    monthlyBudgetUsd: data.monthlyBudgetUsd,
    dailyAgentBudgetUsd: data.dailyAgentBudgetUsd,
    alertThresholdPct: 80,
    updatedAt,
  });
}

async function appendLedgerRow(
  row: InferInsertModel<typeof organizationUsageLedger>,
) {
  await db.insert(organizationUsageLedger).values(row);
}

async function getMonthToDateSpend(organizationId: string): Promise<number> {
  const rows = await db
    .select({ total: sum(organizationUsageLedger.costUsd) })
    .from(organizationUsageLedger)
    .where(
      and(
        eq(organizationUsageLedger.organizationId, organizationId),
        gte(organizationUsageLedger.createdAt, monthStartIso()),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

async function getMonthToDateSpendByFeature(organizationId: string) {
  const rows = await db
    .select({
      creditFeature: organizationUsageLedger.creditFeature,
      total: sum(organizationUsageLedger.costUsd),
    })
    .from(organizationUsageLedger)
    .where(
      and(
        eq(organizationUsageLedger.organizationId, organizationId),
        gte(organizationUsageLedger.createdAt, monthStartIso()),
      ),
    )
    .groupBy(organizationUsageLedger.creditFeature);
  return rows.map((row) => ({
    creditFeature: row.creditFeature,
    costUsd: Number(row.total ?? 0),
  }));
}

async function getDailyAgentSpend(organizationId: string): Promise<number> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const rows = await db
    .select({ total: sum(organizationUsageLedger.costUsd) })
    .from(organizationUsageLedger)
    .where(
      and(
        eq(organizationUsageLedger.organizationId, organizationId),
        eq(organizationUsageLedger.creditFeature, "agent"),
        gte(organizationUsageLedger.createdAt, dayStart.toISOString()),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

export const UsageRepository = {
  getSettings,
  upsertSettings,
  appendLedgerRow,
  getMonthToDateSpend,
  getMonthToDateSpendByFeature,
  getDailyAgentSpend,
};
