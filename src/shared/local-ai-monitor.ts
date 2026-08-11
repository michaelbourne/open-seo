import { roundUsdForBilling } from "@/shared/billing";
import {
  computeNextCheckAt,
  isScheduledRankTrackingInterval,
} from "@/shared/rank-tracking";
import { PROMPT_EXPLORER_MODELS } from "@/types/schemas/ai-search";

export type LocalAiScheduleInterval = "weekly" | "monthly" | "manual";

export const LOCAL_AI_MONITOR_MODELS = PROMPT_EXPLORER_MODELS;

/** Approximate DataForSEO llm_responses/live cost per call (web search on). */
export const LOCAL_AI_LLM_RESPONSE_ESTIMATE_USD = 0.004;

export function isScheduledLocalAiInterval(
  interval: LocalAiScheduleInterval,
): interval is "weekly" | "monthly" {
  return isScheduledRankTrackingInterval(interval);
}

export { computeNextCheckAt as computeNextLocalAiCheckAt };

export function estimateLocalAiScanCost(input: { keywordCount: number }) {
  const apiCalls = input.keywordCount * LOCAL_AI_MONITOR_MODELS.length;
  const costUsd = roundUsdForBilling(
    apiCalls * LOCAL_AI_LLM_RESPONSE_ESTIMATE_USD,
  );
  return { apiCalls, costUsd };
}

export function computeKeywordVisibilityScore(modelsWithMention: number) {
  return Math.round((modelsWithMention / LOCAL_AI_MONITOR_MODELS.length) * 100);
}
