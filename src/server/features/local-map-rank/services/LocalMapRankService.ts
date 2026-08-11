import type { BillingCustomerContext } from "@/server/billing/subscription";
import { LocalMapRankRepository } from "@/server/features/local-map-rank/repositories/LocalMapRankRepository";
import { beginLocalMapScanRun } from "@/server/features/local-map-rank/services/localMapRankRunGuards";
import { assertUsageBudgetForEstimate } from "@/server/features/usage/services/UsageService";
import { AppError } from "@/server/lib/errors";
import { buildGridPins } from "@/shared/grid-pins";
import {
  computeNextLocalMapCheckAt,
  estimateLocalMapScanCost,
  isScheduledLocalMapInterval,
} from "@/shared/local-map-rank";

const MAX_CAMPAIGNS_PER_PROJECT = 10;
const MAX_KEYWORDS_PER_CAMPAIGN = 20;

async function createCampaign(input: {
  projectId: string;
  name: string;
  centerLatitude: number;
  centerLongitude: number;
  gridSize: number;
  radiusKm: number;
  targetPlaceId?: string;
  targetCid?: string;
  languageCode: string;
  device: "desktop" | "mobile";
  scheduleInterval: "weekly" | "monthly" | "manual";
  serpDepth: number;
  keywords: string[];
}) {
  if (!input.targetPlaceId?.trim() && !input.targetCid?.trim()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Provide a target Google place ID or CID",
    );
  }

  const existing = await LocalMapRankRepository.getCampaignsForProject(
    input.projectId,
  );
  if (existing.length >= MAX_CAMPAIGNS_PER_PROJECT) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Maximum ${MAX_CAMPAIGNS_PER_PROJECT} grid campaigns per project`,
    );
  }

  const uniqueKeywords = [
    ...new Set(input.keywords.map((k) => k.trim()).filter(Boolean)),
  ];
  if (uniqueKeywords.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Add at least one keyword");
  }
  if (uniqueKeywords.length > MAX_KEYWORDS_PER_CAMPAIGN) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Maximum ${MAX_KEYWORDS_PER_CAMPAIGN} keywords per campaign`,
    );
  }

  const campaignId = crypto.randomUUID();
  const nextCheckAt = isScheduledLocalMapInterval(input.scheduleInterval)
    ? computeNextLocalMapCheckAt(input.scheduleInterval)
    : null;

  await LocalMapRankRepository.createCampaign({
    id: campaignId,
    projectId: input.projectId,
    name: input.name.trim(),
    centerLatitude: input.centerLatitude,
    centerLongitude: input.centerLongitude,
    gridSize: input.gridSize,
    radiusKm: input.radiusKm,
    targetPlaceId: input.targetPlaceId?.trim() || null,
    targetCid: input.targetCid?.trim() || null,
    languageCode: input.languageCode,
    device: input.device,
    scheduleInterval: input.scheduleInterval,
    serpDepth: input.serpDepth,
    isActive: true,
    nextCheckAt,
  });

  await LocalMapRankRepository.addKeywords(
    uniqueKeywords.map((keyword) => ({
      id: crypto.randomUUID(),
      campaignId,
      keyword,
    })),
  );

  return { campaignId };
}

async function updateCampaign(
  campaignId: string,
  projectId: string,
  input: {
    name?: string;
    centerLatitude?: number;
    centerLongitude?: number;
    gridSize?: number;
    radiusKm?: number;
    targetPlaceId?: string | null;
    targetCid?: string | null;
    languageCode?: string;
    device?: "desktop" | "mobile";
    scheduleInterval?: "weekly" | "monthly" | "manual";
    serpDepth?: number;
    isActive?: boolean;
  },
) {
  const campaign = await LocalMapRankRepository.getCampaignById(
    campaignId,
    projectId,
  );
  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found");
  }

  const scheduleInterval = input.scheduleInterval ?? campaign.scheduleInterval;
  const nextCheckAt = isScheduledLocalMapInterval(scheduleInterval)
    ? computeNextLocalMapCheckAt(scheduleInterval, campaign.nextCheckAt)
    : null;

  await LocalMapRankRepository.updateCampaign(campaignId, projectId, {
    ...input,
    nextCheckAt,
  });
}

async function estimateScanCost(campaignId: string, projectId: string) {
  const campaign = await LocalMapRankRepository.getCampaignById(
    campaignId,
    projectId,
  );
  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found");
  }
  const keywords = await LocalMapRankRepository.getKeywordsForCampaign(
    campaignId,
  );
  const method =
    campaign.scheduleInterval === "manual" ? "live" : ("queued" as const);
  return estimateLocalMapScanCost({
    gridSize: campaign.gridSize,
    keywordCount: keywords.length,
    method,
  });
}

async function triggerScan(input: {
  campaignId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
}) {
  const campaign = await LocalMapRankRepository.getCampaignById(
    input.campaignId,
    input.projectId,
  );
  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found");
  }

  const keywords = await LocalMapRankRepository.getKeywordsForCampaign(
    input.campaignId,
  );
  if (keywords.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Add keywords before running a scan");
  }

  const pins = buildGridPins({
    centerLatitude: campaign.centerLatitude,
    centerLongitude: campaign.centerLongitude,
    gridSize: campaign.gridSize,
    radiusKm: campaign.radiusKm,
  });
  const pinsTotal = pins.length * keywords.length;
  const { costUsd } = estimateLocalMapScanCost({
    gridSize: campaign.gridSize,
    keywordCount: keywords.length,
    method: "live",
  });

  await assertUsageBudgetForEstimate({
    organizationId: input.billingCustomer.organizationId,
    estimatedCostUsd: costUsd,
  });

  return beginLocalMapScanRun({
    campaignId: input.campaignId,
    projectId: input.projectId,
    billingCustomer: input.billingCustomer,
    pinsTotal,
    trigger: "manual",
    workflowStartErrorMessage: "Failed to start maps grid scan",
  });
}

async function getCampaignDetail(campaignId: string, projectId: string) {
  const campaign = await LocalMapRankRepository.getCampaignById(
    campaignId,
    projectId,
  );
  if (!campaign) return null;
  const [keywords, runs, latestRun] = await Promise.all([
    LocalMapRankRepository.getKeywordsForCampaign(campaignId),
    LocalMapRankRepository.getRunsForCampaign(campaignId),
    LocalMapRankRepository.getLatestRunForCampaign(campaignId),
  ]);
  return { campaign, keywords, runs, latestRun };
}

export const LocalMapRankService = {
  createCampaign,
  updateCampaign,
  estimateScanCost,
  triggerScan,
  getCampaignDetail,
};
