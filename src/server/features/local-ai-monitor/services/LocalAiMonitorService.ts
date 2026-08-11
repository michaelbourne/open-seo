import type { BillingCustomerContext } from "@/server/billing/subscription";
import { LocalAiMonitorRepository } from "@/server/features/local-ai-monitor/repositories/LocalAiMonitorRepository";
import { detectBusinessMention } from "@/server/features/local-ai-monitor/services/mentionDetection";
import { assertUsageBudgetForEstimate } from "@/server/features/usage/services/UsageService";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import {
  computeKeywordVisibilityScore,
  computeNextLocalAiCheckAt,
  estimateLocalAiScanCost,
  isScheduledLocalAiInterval,
  LOCAL_AI_LLM_RESPONSE_ESTIMATE_USD,
  LOCAL_AI_MONITOR_MODELS,
} from "@/shared/local-ai-monitor";
import type { PromptExplorerModel } from "@/types/schemas/ai-search";

const MAX_CONFIGS_PER_PROJECT = 10;
const MAX_KEYWORDS_PER_CONFIG = 20;
const PROMPT_RESPONSE_MAX_TOKENS = 4096;

const MODEL_NAMES: Record<PromptExplorerModel, string> = {
  chat_gpt: "gpt-5",
  claude: "claude-sonnet-4-5",
  gemini: "gemini-2.5-pro",
  perplexity: "sonar-reasoning-pro",
};

async function createConfig(input: {
  projectId: string;
  name: string;
  targetBusinessName: string;
  targetDomain?: string;
  scheduleInterval: "weekly" | "monthly" | "manual";
  keywords: string[];
}) {
  const existing = await LocalAiMonitorRepository.getConfigsForProject(
    input.projectId,
  );
  if (existing.length >= MAX_CONFIGS_PER_PROJECT) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Maximum ${MAX_CONFIGS_PER_PROJECT} AI visibility monitors per project`,
    );
  }

  const uniqueKeywords = [
    ...new Set(input.keywords.map((k) => k.trim()).filter(Boolean)),
  ];
  if (uniqueKeywords.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Add at least one keyword");
  }
  if (uniqueKeywords.length > MAX_KEYWORDS_PER_CONFIG) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Maximum ${MAX_KEYWORDS_PER_CONFIG} keywords per monitor`,
    );
  }

  const configId = crypto.randomUUID();
  const nextCheckAt = isScheduledLocalAiInterval(input.scheduleInterval)
    ? computeNextLocalAiCheckAt(input.scheduleInterval)
    : null;

  await LocalAiMonitorRepository.createConfig({
    id: configId,
    projectId: input.projectId,
    name: input.name.trim(),
    targetBusinessName: input.targetBusinessName.trim(),
    targetDomain: input.targetDomain?.trim() || null,
    scheduleInterval: input.scheduleInterval,
    isActive: true,
    nextCheckAt,
  });

  await LocalAiMonitorRepository.addKeywords(
    uniqueKeywords.map((keyword) => ({
      id: crypto.randomUUID(),
      configId,
      keyword,
    })),
  );

  return { configId };
}

async function updateConfig(
  configId: string,
  projectId: string,
  input: {
    name?: string;
    targetBusinessName?: string;
    targetDomain?: string | null;
    scheduleInterval?: "weekly" | "monthly" | "manual";
    isActive?: boolean;
  },
) {
  const config = await LocalAiMonitorRepository.getConfigById(configId, projectId);
  if (!config) {
    throw new AppError("NOT_FOUND", "Monitor not found");
  }

  const scheduleInterval = input.scheduleInterval ?? config.scheduleInterval;
  const nextCheckAt = isScheduledLocalAiInterval(scheduleInterval)
    ? computeNextLocalAiCheckAt(scheduleInterval, config.nextCheckAt)
    : null;

  await LocalAiMonitorRepository.updateConfig(configId, projectId, {
    ...input,
    nextCheckAt,
  });
}

async function estimateScanCost(configId: string, projectId: string) {
  const config = await LocalAiMonitorRepository.getConfigById(configId, projectId);
  if (!config) {
    throw new AppError("NOT_FOUND", "Monitor not found");
  }
  const keywords = await LocalAiMonitorRepository.getKeywordsForConfig(configId);
  return estimateLocalAiScanCost({ keywordCount: keywords.length });
}

async function triggerScan(input: {
  configId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
  trigger?: "manual" | "scheduled";
}) {
  const config = await LocalAiMonitorRepository.getConfigById(
    input.configId,
    input.projectId,
  );
  if (!config) {
    throw new AppError("NOT_FOUND", "Monitor not found");
  }

  const keywords = await LocalAiMonitorRepository.getKeywordsForConfig(
    input.configId,
  );
  if (keywords.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Add keywords before running a scan");
  }

  const active = await LocalAiMonitorRepository.getActiveRunForConfig(
    input.configId,
  );
  if (active) {
    return {
      ok: false as const,
      reason: "already_running" as const,
      blockingRunId: active.id,
    };
  }

  const { costUsd } = estimateLocalAiScanCost({
    keywordCount: keywords.length,
  });
  await assertUsageBudgetForEstimate({
    organizationId: input.billingCustomer.organizationId,
    estimatedCostUsd: costUsd,
  });

  const runId = await executeScan({
    config,
    keywords,
    billingCustomer: input.billingCustomer,
    trigger: input.trigger ?? "manual",
  });

  return { ok: true as const, runId };
}

async function executeScan(input: {
  config: {
    id: string;
    projectId: string;
    targetBusinessName: string;
    targetDomain: string | null;
    scheduleInterval: "weekly" | "monthly" | "manual";
    nextCheckAt: string | null;
  };
  keywords: Array<{ id: string; keyword: string }>;
  billingCustomer: BillingCustomerContext;
  trigger: "manual" | "scheduled";
}) {
  const runId = crypto.randomUUID();
  await LocalAiMonitorRepository.createRun({
    id: runId,
    configId: input.config.id,
    projectId: input.config.projectId,
    status: "running",
    trigger: input.trigger,
  });

  const dataforseo = createDataforseoClient(input.billingCustomer);
  let completedCalls = 0;
  const resultRows: Array<{
    id: string;
    runId: string;
    keywordId: string;
    model: string;
    mentioned: boolean;
    excerpt: string | null;
    payloadJson: string | null;
  }> = [];

  try {
    for (const keyword of input.keywords) {
      let modelsWithMention = 0;
      const keywordRows: typeof resultRows = [];

      for (const model of LOCAL_AI_MONITOR_MODELS) {
        const response = await dataforseo.aiSearch.llmResponse({
          modelSlug: model,
          modelName: MODEL_NAMES[model],
          userPrompt: keyword.keyword,
          webSearch: true,
          webSearchCountryCode: "US",
          maxOutputTokens: PROMPT_RESPONSE_MAX_TOKENS,
        });
        completedCalls += 1;

        const mention = detectBusinessMention(response, {
          businessName: input.config.targetBusinessName,
          domain: input.config.targetDomain,
        });
        if (mention.mentioned) modelsWithMention += 1;

        keywordRows.push({
          id: crypto.randomUUID(),
          runId,
          keywordId: keyword.id,
          model,
          mentioned: mention.mentioned,
          excerpt: mention.excerpt,
          payloadJson: JSON.stringify({ response }),
        });
      }

      const visibilityScore = computeKeywordVisibilityScore(modelsWithMention);
      for (const row of keywordRows) {
        const payload = JSON.parse(row.payloadJson ?? "{}") as Record<
          string,
          unknown
        >;
        payload.visibilityScore = visibilityScore;
        row.payloadJson = JSON.stringify(payload);
      }
      resultRows.push(...keywordRows);
    }

    await LocalAiMonitorRepository.insertResults(resultRows);

    const nowIso = new Date().toISOString();
    await LocalAiMonitorRepository.updateRun(runId, {
      status: "completed",
      costUsd: completedCalls * LOCAL_AI_LLM_RESPONSE_ESTIMATE_USD,
      completedAt: nowIso,
    });
    await LocalAiMonitorRepository.updateConfig(
      input.config.id,
      input.config.projectId,
      { lastCheckedAt: nowIso },
    );

    return runId;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Local AI scan failed";
    await LocalAiMonitorRepository.updateRun(runId, {
      status: "failed",
      errorMessage: message,
      costUsd: completedCalls * LOCAL_AI_LLM_RESPONSE_ESTIMATE_USD,
      completedAt: new Date().toISOString(),
    });
    if (resultRows.length > 0) {
      await LocalAiMonitorRepository.insertResults(resultRows);
    }
    throw error;
  }
}

async function getConfigDetail(configId: string, projectId: string) {
  const config = await LocalAiMonitorRepository.getConfigById(configId, projectId);
  if (!config) return null;

  const [keywords, runs, latestRun] = await Promise.all([
    LocalAiMonitorRepository.getKeywordsForConfig(configId),
    LocalAiMonitorRepository.getRunsForConfig(configId),
    LocalAiMonitorRepository.getLatestRunForConfig(configId),
  ]);

  let latestResults: Awaited<
    ReturnType<typeof LocalAiMonitorRepository.getResultsForRun>
  > = [];
  if (latestRun?.status === "completed") {
    latestResults = await LocalAiMonitorRepository.getResultsForRun(latestRun.id);
  }

  const keywordSummaries = summarizeKeywordResults(latestResults);

  return {
    config,
    keywords,
    runs,
    latestRun,
    keywordSummaries,
    overallVisibilityScore: averageVisibility(keywordSummaries),
  };
}

function summarizeKeywordResults(
  results: Awaited<ReturnType<typeof LocalAiMonitorRepository.getResultsForRun>>,
) {
  const byKeyword = new Map<
    string,
    {
      keywordId: string;
      keyword: string;
      modelsWithMention: number;
      visibilityScore: number;
      results: typeof results;
    }
  >();

  for (const row of results) {
    const existing = byKeyword.get(row.keywordId) ?? {
      keywordId: row.keywordId,
      keyword: row.keyword,
      modelsWithMention: 0,
      visibilityScore: 0,
      results: [],
    };
    if (row.mentioned) existing.modelsWithMention += 1;
    existing.results.push(row);
    existing.visibilityScore = computeKeywordVisibilityScore(
      existing.modelsWithMention,
    );
    byKeyword.set(row.keywordId, existing);
  }

  return [...byKeyword.values()];
}

function averageVisibility(
  summaries: Array<{ visibilityScore: number }>,
): number | null {
  if (summaries.length === 0) return null;
  const total = summaries.reduce((sum, row) => sum + row.visibilityScore, 0);
  return Math.round(total / summaries.length);
}

export const LocalAiMonitorService = {
  createConfig,
  updateConfig,
  estimateScanCost,
  triggerScan,
  executeScan,
  getConfigDetail,
};
