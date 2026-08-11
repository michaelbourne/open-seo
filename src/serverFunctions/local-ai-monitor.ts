import { createServerFn } from "@tanstack/react-start";
import { LocalAiMonitorRepository } from "@/server/features/local-ai-monitor/repositories/LocalAiMonitorRepository";
import { LocalAiMonitorService } from "@/server/features/local-ai-monitor/services/LocalAiMonitorService";
import { AppError } from "@/server/lib/errors";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  addLocalAiKeywordsSchema,
  createLocalAiMonitorSchema,
  estimateLocalAiScanCostSchema,
  getLocalAiMonitorDetailSchema,
  getLocalAiMonitorsSchema,
  getLocalAiRunResultsSchema,
  removeLocalAiKeywordsSchema,
  triggerLocalAiScanSchema,
  updateLocalAiMonitorSchema,
} from "@/types/schemas/local-ai-monitor";

export const getLocalAiMonitors = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getLocalAiMonitorsSchema)
  .handler(async ({ context }) => {
    return LocalAiMonitorRepository.getConfigsForProject(context.projectId);
  });

export const createLocalAiMonitor = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createLocalAiMonitorSchema)
  .handler(async ({ data, context }) => {
    return LocalAiMonitorService.createConfig({
      projectId: context.projectId,
      ...data,
    });
  });

export const updateLocalAiMonitor = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateLocalAiMonitorSchema)
  .handler(async ({ data, context }) => {
    const { configId, ...rest } = data;
    await LocalAiMonitorService.updateConfig(configId, context.projectId, rest);
    return { success: true };
  });

export const triggerLocalAiScan = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(triggerLocalAiScanSchema)
  .handler(async ({ data, context }) => {
    return LocalAiMonitorService.triggerScan({
      configId: data.configId,
      projectId: context.projectId,
      billingCustomer: context,
    });
  });

export const estimateLocalAiScanCostFn = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(estimateLocalAiScanCostSchema)
  .handler(async ({ data, context }) => {
    return LocalAiMonitorService.estimateScanCost(
      data.configId,
      context.projectId,
    );
  });

export const getLocalAiMonitorDetail = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getLocalAiMonitorDetailSchema)
  .handler(async ({ data, context }) => {
    return LocalAiMonitorService.getConfigDetail(
      data.configId,
      context.projectId,
    );
  });

export const getLocalAiRunResults = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getLocalAiRunResultsSchema)
  .handler(async ({ data, context }) => {
    const run = await LocalAiMonitorRepository.getRunById(data.runId);
    if (!run || run.projectId !== context.projectId) {
      throw new AppError("NOT_FOUND", "Scan run not found");
    }
    return LocalAiMonitorRepository.getResultsForRun(data.runId);
  });

export const addLocalAiKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(addLocalAiKeywordsSchema)
  .handler(async ({ data, context }) => {
    const config = await LocalAiMonitorRepository.getConfigById(
      data.configId,
      context.projectId,
    );
    if (!config) {
      throw new AppError("NOT_FOUND", "Monitor not found");
    }
    const unique = [...new Set(data.keywords.map((k) => k.trim()).filter(Boolean))];
    await LocalAiMonitorRepository.addKeywords(
      unique.map((keyword) => ({
        id: crypto.randomUUID(),
        configId: data.configId,
        keyword,
      })),
    );
    return { added: unique.length };
  });

export const removeLocalAiKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(removeLocalAiKeywordsSchema)
  .handler(async ({ data, context }) => {
    const config = await LocalAiMonitorRepository.getConfigById(
      data.configId,
      context.projectId,
    );
    if (!config) {
      throw new AppError("NOT_FOUND", "Monitor not found");
    }
    await LocalAiMonitorRepository.removeKeywords(
      data.configId,
      data.keywordIds,
    );
    return { removed: data.keywordIds.length };
  });
