import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { db } from "@/db";
import {
  localMapCampaigns,
  localMapKeywords,
  localMapScanResults,
  localMapScanRuns,
  projects,
} from "@/db/schema";
import { executeInBatches } from "@/db/runBatch";

async function getCampaignsForProject(projectId: string) {
  return db
    .select()
    .from(localMapCampaigns)
    .where(
      and(
        eq(localMapCampaigns.projectId, projectId),
        eq(localMapCampaigns.isActive, true),
      ),
    )
    .orderBy(localMapCampaigns.createdAt);
}

async function getCampaignById(campaignId: string, projectId: string) {
  const rows = await db
    .select()
    .from(localMapCampaigns)
    .where(
      and(
        eq(localMapCampaigns.id, campaignId),
        eq(localMapCampaigns.projectId, projectId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function createCampaign(
  data: InferInsertModel<typeof localMapCampaigns>,
) {
  await db.insert(localMapCampaigns).values(data);
}

async function updateCampaign(
  campaignId: string,
  projectId: string,
  data: Partial<InferInsertModel<typeof localMapCampaigns>>,
) {
  await db
    .update(localMapCampaigns)
    .set(data)
    .where(
      and(
        eq(localMapCampaigns.id, campaignId),
        eq(localMapCampaigns.projectId, projectId),
      ),
    );
}

async function getKeywordsForCampaign(campaignId: string) {
  return db
    .select()
    .from(localMapKeywords)
    .where(eq(localMapKeywords.campaignId, campaignId))
    .orderBy(localMapKeywords.createdAt);
}

async function addKeywords(rows: InferInsertModel<typeof localMapKeywords>[]) {
  if (rows.length === 0) return;
  await executeInBatches(rows, (tx, row) =>
    tx.insert(localMapKeywords).values(row).onConflictDoNothing(),
  );
}

async function tryCreateRun(data: InferInsertModel<typeof localMapScanRuns>) {
  try {
    await db.insert(localMapScanRuns).values({
      ...data,
      startedAt: new Date().toISOString(),
    });
    return true;
  } catch {
    return false;
  }
}

async function getRunById(runId: string) {
  const rows = await db
    .select()
    .from(localMapScanRuns)
    .where(eq(localMapScanRuns.id, runId))
    .limit(1);
  return rows[0] ?? null;
}

async function getActiveRunForCampaign(campaignId: string) {
  const rows = await db
    .select()
    .from(localMapScanRuns)
    .where(
      and(
        eq(localMapScanRuns.campaignId, campaignId),
        inArray(localMapScanRuns.status, ["pending", "running"]),
      ),
    )
    .orderBy(desc(localMapScanRuns.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

async function updateRun(
  runId: string,
  data: Partial<InferInsertModel<typeof localMapScanRuns>>,
) {
  await db
    .update(localMapScanRuns)
    .set(data)
    .where(eq(localMapScanRuns.id, runId));
}

async function insertResults(
  rows: InferInsertModel<typeof localMapScanResults>[],
) {
  if (rows.length === 0) return;
  await executeInBatches(rows, (tx, row) =>
    tx.insert(localMapScanResults).values(row).onConflictDoNothing(),
  );
}

async function getResultsForRun(runId: string) {
  return db
    .select({
      id: localMapScanResults.id,
      runId: localMapScanResults.runId,
      keywordId: localMapScanResults.keywordId,
      keyword: localMapKeywords.keyword,
      pinIndex: localMapScanResults.pinIndex,
      latitude: localMapScanResults.latitude,
      longitude: localMapScanResults.longitude,
      rankAbsolute: localMapScanResults.rankAbsolute,
      matchedTitle: localMapScanResults.matchedTitle,
      checkedAt: localMapScanResults.checkedAt,
    })
    .from(localMapScanResults)
    .innerJoin(
      localMapKeywords,
      eq(localMapScanResults.keywordId, localMapKeywords.id),
    )
    .where(eq(localMapScanResults.runId, runId))
    .orderBy(localMapScanResults.pinIndex, localMapKeywords.keyword);
}

async function getRunsForCampaign(campaignId: string, limit = 24) {
  return db
    .select()
    .from(localMapScanRuns)
    .where(eq(localMapScanRuns.campaignId, campaignId))
    .orderBy(desc(localMapScanRuns.createdAt))
    .limit(limit);
}

async function getLatestRunForCampaign(campaignId: string) {
  const rows = await db
    .select()
    .from(localMapScanRuns)
    .where(eq(localMapScanRuns.campaignId, campaignId))
    .orderBy(desc(localMapScanRuns.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Average rank per keyword for each scan, so the page can show progress. */
async function getKeywordRunSummaries(campaignId: string) {
  const rows = await db
    .select({
      runId: localMapScanResults.runId,
      completedAt: localMapScanRuns.completedAt,
      createdAt: localMapScanRuns.createdAt,
      status: localMapScanRuns.status,
      keyword: localMapKeywords.keyword,
      averageRank: sql<number | null>`avg(${localMapScanResults.rankAbsolute})`,
      rankedPins: sql<number>`sum(case when ${localMapScanResults.rankAbsolute} is not null then 1 else 0 end)`,
      pins: sql<number>`count(${localMapScanResults.id})`,
    })
    .from(localMapScanResults)
    .innerJoin(
      localMapKeywords,
      eq(localMapScanResults.keywordId, localMapKeywords.id),
    )
    .innerJoin(
      localMapScanRuns,
      eq(localMapScanResults.runId, localMapScanRuns.id),
    )
    .where(eq(localMapScanRuns.campaignId, campaignId))
    .groupBy(
      localMapScanResults.runId,
      localMapScanRuns.completedAt,
      localMapScanRuns.createdAt,
      localMapScanRuns.status,
      localMapKeywords.keyword,
    );
  return rows.map((row) => ({
    runId: row.runId,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    status: row.status,
    keyword: row.keyword,
    averageRank: row.averageRank == null ? null : Number(row.averageRank),
    rankedPins: Number(row.rankedPins ?? 0),
    pins: Number(row.pins ?? 0),
  }));
}

async function getDueCampaignsWithOrganization(nowIso: string) {
  return db
    .select({
      id: localMapCampaigns.id,
      projectId: localMapCampaigns.projectId,
      centerLatitude: localMapCampaigns.centerLatitude,
      centerLongitude: localMapCampaigns.centerLongitude,
      gridSize: localMapCampaigns.gridSize,
      radiusKm: localMapCampaigns.radiusKm,
      scheduleInterval: localMapCampaigns.scheduleInterval,
      nextCheckAt: localMapCampaigns.nextCheckAt,
      organizationId: projects.organizationId,
    })
    .from(localMapCampaigns)
    .innerJoin(projects, eq(localMapCampaigns.projectId, projects.id))
    .where(
      and(
        eq(localMapCampaigns.isActive, true),
        inArray(localMapCampaigns.scheduleInterval, ["weekly", "monthly"]),
        lte(localMapCampaigns.nextCheckAt, nowIso),
      ),
    );
}

export const LocalMapRankRepository = {
  getCampaignsForProject,
  getCampaignById,
  createCampaign,
  updateCampaign,
  getKeywordsForCampaign,
  addKeywords,
  tryCreateRun,
  getRunById,
  getActiveRunForCampaign,
  updateRun,
  insertResults,
  getResultsForRun,
  getRunsForCampaign,
  getLatestRunForCampaign,
  getKeywordRunSummaries,
  getDueCampaignsWithOrganization,
};
