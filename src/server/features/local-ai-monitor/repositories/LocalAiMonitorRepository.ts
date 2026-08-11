import { and, desc, eq, inArray, lte } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { db } from "@/db";
import {
  localAiMonitorConfigs,
  localAiMonitorKeywords,
  localAiScanResults,
  localAiScanRuns,
  projects,
} from "@/db/schema";
import { executeInBatches } from "@/db/runBatch";

async function getConfigsForProject(projectId: string) {
  return db
    .select()
    .from(localAiMonitorConfigs)
    .where(
      and(
        eq(localAiMonitorConfigs.projectId, projectId),
        eq(localAiMonitorConfigs.isActive, true),
      ),
    )
    .orderBy(localAiMonitorConfigs.createdAt);
}

async function getConfigById(configId: string, projectId: string) {
  const rows = await db
    .select()
    .from(localAiMonitorConfigs)
    .where(
      and(
        eq(localAiMonitorConfigs.id, configId),
        eq(localAiMonitorConfigs.projectId, projectId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function createConfig(data: InferInsertModel<typeof localAiMonitorConfigs>) {
  await db.insert(localAiMonitorConfigs).values(data);
}

async function updateConfig(
  configId: string,
  projectId: string,
  data: Partial<InferInsertModel<typeof localAiMonitorConfigs>>,
) {
  await db
    .update(localAiMonitorConfigs)
    .set(data)
    .where(
      and(
        eq(localAiMonitorConfigs.id, configId),
        eq(localAiMonitorConfigs.projectId, projectId),
      ),
    );
}

async function getKeywordsForConfig(configId: string) {
  return db
    .select()
    .from(localAiMonitorKeywords)
    .where(eq(localAiMonitorKeywords.configId, configId))
    .orderBy(localAiMonitorKeywords.createdAt);
}

async function addKeywords(
  rows: InferInsertModel<typeof localAiMonitorKeywords>[],
) {
  if (rows.length === 0) return;
  await executeInBatches(rows, (tx, row) =>
    tx.insert(localAiMonitorKeywords).values(row).onConflictDoNothing(),
  );
}

async function removeKeywords(configId: string, keywordIds: string[]) {
  if (keywordIds.length === 0) return;
  await db
    .delete(localAiMonitorKeywords)
    .where(
      and(
        eq(localAiMonitorKeywords.configId, configId),
        inArray(localAiMonitorKeywords.id, keywordIds),
      ),
    );
}

async function createRun(data: InferInsertModel<typeof localAiScanRuns>) {
  await db.insert(localAiScanRuns).values(data);
}

async function getRunById(runId: string) {
  const rows = await db
    .select()
    .from(localAiScanRuns)
    .where(eq(localAiScanRuns.id, runId))
    .limit(1);
  return rows[0] ?? null;
}

async function getActiveRunForConfig(configId: string) {
  const rows = await db
    .select()
    .from(localAiScanRuns)
    .where(
      and(
        eq(localAiScanRuns.configId, configId),
        inArray(localAiScanRuns.status, ["pending", "running"]),
      ),
    )
    .orderBy(desc(localAiScanRuns.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

async function updateRun(
  runId: string,
  data: Partial<InferInsertModel<typeof localAiScanRuns>>,
) {
  await db.update(localAiScanRuns).set(data).where(eq(localAiScanRuns.id, runId));
}

async function insertResults(rows: InferInsertModel<typeof localAiScanResults>[]) {
  if (rows.length === 0) return;
  await executeInBatches(rows, (tx, row) =>
    tx.insert(localAiScanResults).values(row).onConflictDoNothing(),
  );
}

async function getResultsForRun(runId: string) {
  return db
    .select({
      id: localAiScanResults.id,
      runId: localAiScanResults.runId,
      keywordId: localAiScanResults.keywordId,
      keyword: localAiMonitorKeywords.keyword,
      model: localAiScanResults.model,
      mentioned: localAiScanResults.mentioned,
      excerpt: localAiScanResults.excerpt,
      checkedAt: localAiScanResults.checkedAt,
    })
    .from(localAiScanResults)
    .innerJoin(
      localAiMonitorKeywords,
      eq(localAiScanResults.keywordId, localAiMonitorKeywords.id),
    )
    .where(eq(localAiScanResults.runId, runId))
    .orderBy(localAiMonitorKeywords.keyword, localAiScanResults.model);
}

async function getRunsForConfig(configId: string, limit = 20) {
  return db
    .select()
    .from(localAiScanRuns)
    .where(eq(localAiScanRuns.configId, configId))
    .orderBy(desc(localAiScanRuns.createdAt))
    .limit(limit);
}

async function getLatestRunForConfig(configId: string) {
  const rows = await db
    .select()
    .from(localAiScanRuns)
    .where(eq(localAiScanRuns.configId, configId))
    .orderBy(desc(localAiScanRuns.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

async function getDueConfigsWithOrganization(nowIso: string) {
  return db
    .select({
      id: localAiMonitorConfigs.id,
      projectId: localAiMonitorConfigs.projectId,
      targetBusinessName: localAiMonitorConfigs.targetBusinessName,
      targetDomain: localAiMonitorConfigs.targetDomain,
      scheduleInterval: localAiMonitorConfigs.scheduleInterval,
      nextCheckAt: localAiMonitorConfigs.nextCheckAt,
      organizationId: projects.organizationId,
    })
    .from(localAiMonitorConfigs)
    .innerJoin(projects, eq(localAiMonitorConfigs.projectId, projects.id))
    .where(
      and(
        eq(localAiMonitorConfigs.isActive, true),
        inArray(localAiMonitorConfigs.scheduleInterval, ["weekly", "monthly"]),
        lte(localAiMonitorConfigs.nextCheckAt, nowIso),
      ),
    );
}

export const LocalAiMonitorRepository = {
  getConfigsForProject,
  getConfigById,
  createConfig,
  updateConfig,
  getKeywordsForConfig,
  addKeywords,
  removeKeywords,
  createRun,
  getRunById,
  getActiveRunForConfig,
  updateRun,
  insertResults,
  getResultsForRun,
  getRunsForConfig,
  getLatestRunForConfig,
  getDueConfigsWithOrganization,
};
