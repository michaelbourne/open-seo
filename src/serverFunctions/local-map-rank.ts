import { createServerFn } from "@tanstack/react-start";
import { LocalMapRankRepository } from "@/server/features/local-map-rank/repositories/LocalMapRankRepository";
import { LocalMapRankService } from "@/server/features/local-map-rank/services/LocalMapRankService";
import { AppError } from "@/server/lib/errors";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  addLocalMapKeywordsSchema,
  createLocalMapCampaignSchema,
  estimateLocalMapScanCostSchema,
  getLocalMapCampaignDetailSchema,
  getLocalMapCampaignsSchema,
  getLocalMapRunResultsSchema,
  removeLocalMapKeywordsSchema,
  triggerLocalMapScanSchema,
  updateLocalMapCampaignSchema,
} from "@/types/schemas/local-map-rank";

export const getLocalMapCampaigns = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getLocalMapCampaignsSchema)
  .handler(async ({ context }) => {
    return LocalMapRankRepository.getCampaignsForProject(context.projectId);
  });

export const createLocalMapCampaign = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createLocalMapCampaignSchema)
  .handler(async ({ data, context }) => {
    return LocalMapRankService.createCampaign({
      projectId: context.projectId,
      ...data,
    });
  });

export const updateLocalMapCampaign = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateLocalMapCampaignSchema)
  .handler(async ({ data, context }) => {
    const { campaignId, ...rest } = data;
    await LocalMapRankService.updateCampaign(
      campaignId,
      context.projectId,
      rest,
    );
    return { success: true };
  });

export const triggerLocalMapScan = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(triggerLocalMapScanSchema)
  .handler(async ({ data, context }) => {
    return LocalMapRankService.triggerScan({
      campaignId: data.campaignId,
      projectId: context.projectId,
      billingCustomer: context,
    });
  });

export const estimateLocalMapScanCostFn = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(estimateLocalMapScanCostSchema)
  .handler(async ({ data, context }) => {
    return LocalMapRankService.estimateScanCost(
      data.campaignId,
      context.projectId,
    );
  });

export const getLocalMapCampaignDetail = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getLocalMapCampaignDetailSchema)
  .handler(async ({ data, context }) => {
    return LocalMapRankService.getCampaignDetail(
      data.campaignId,
      context.projectId,
    );
  });

export const getLocalMapRunResults = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getLocalMapRunResultsSchema)
  .handler(async ({ data, context }) => {
    const run = await LocalMapRankRepository.getRunById(data.runId);
    if (!run || run.projectId !== context.projectId) {
      throw new AppError("NOT_FOUND", "Scan run not found");
    }
    return LocalMapRankRepository.getResultsForRun(data.runId);
  });

export const addLocalMapKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(addLocalMapKeywordsSchema)
  .handler(async ({ data, context }) => {
    const campaign = await LocalMapRankRepository.getCampaignById(
      data.campaignId,
      context.projectId,
    );
    if (!campaign) {
      throw new AppError("NOT_FOUND", "Campaign not found");
    }
    const unique = [...new Set(data.keywords.map((k) => k.trim()).filter(Boolean))];
    await LocalMapRankRepository.addKeywords(
      unique.map((keyword) => ({
        id: crypto.randomUUID(),
        campaignId: data.campaignId,
        keyword,
      })),
    );
    return { added: unique.length };
  });

export const removeLocalMapKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(removeLocalMapKeywordsSchema)
  .handler(async ({ data, context }) => {
    const campaign = await LocalMapRankRepository.getCampaignById(
      data.campaignId,
      context.projectId,
    );
    if (!campaign) {
      throw new AppError("NOT_FOUND", "Campaign not found");
    }
    await LocalMapRankRepository.removeKeywords(
      data.campaignId,
      data.keywordIds,
    );
    return { removed: data.keywordIds.length };
  });
