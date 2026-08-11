/** DataForSEO SERP pricing constants (USD per request). */

export const LIVE_BASE_PAGE_COST_USD = 0.002;
export const LIVE_EXTRA_PAGE_COST_USD = 0.0015;
export const QUEUED_BASE_PAGE_COST_USD = 0.0006;
export const QUEUED_EXTRA_PAGE_COST_USD = 0.00045;

/** Maps live advanced — first page baseline (approximate list pricing). */
export const MAPS_LIVE_BASE_COST_USD = 0.002;
export const MAPS_QUEUED_BASE_COST_USD = 0.0006;

export function costPerSerpAtDepth(
  depth: number,
  method: "live" | "queued",
): number {
  const pages = Math.max(1, depth / 10);
  return method === "queued"
    ? QUEUED_BASE_PAGE_COST_USD + (pages - 1) * QUEUED_EXTRA_PAGE_COST_USD
    : LIVE_BASE_PAGE_COST_USD + (pages - 1) * LIVE_EXTRA_PAGE_COST_USD;
}

export function estimateMapsScanCostUsd(input: {
  pinCount: number;
  keywordCount: number;
  method: "live" | "queued";
}) {
  const perCall =
    input.method === "queued"
      ? MAPS_QUEUED_BASE_COST_USD
      : MAPS_LIVE_BASE_COST_USD;
  return input.pinCount * input.keywordCount * perCall;
}
