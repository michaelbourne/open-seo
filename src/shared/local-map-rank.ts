import { roundUsdForBilling } from "@/shared/billing";
import {
  computeNextCheckAt,
  isScheduledRankTrackingInterval,
} from "@/shared/rank-tracking";

export type LocalMapScheduleInterval = "weekly" | "monthly" | "manual";

// Raw DataForSEO prices, matching server/lib/dataforseo/pricing.ts
// (LOCAL_SERP_PAGE_USD for a live Maps call, LOCAL_SERP_TASK_USD for the queue).
const LIVE_MAPS_PIN_USD = 0.002;
const QUEUED_MAPS_PIN_USD = 0.0012;

export function isScheduledLocalMapInterval(
  interval: LocalMapScheduleInterval,
): interval is "weekly" | "monthly" {
  return isScheduledRankTrackingInterval(interval);
}

export const computeNextLocalMapCheckAt = computeNextCheckAt;

export function estimateLocalMapScanCost(input: {
  gridSize: number;
  keywordCount: number;
  method: "live" | "queued";
}) {
  const pinCount = input.gridSize * input.gridSize;
  const unit =
    input.method === "queued" ? QUEUED_MAPS_PIN_USD : LIVE_MAPS_PIN_USD;
  return {
    pinCount,
    costUsd: roundUsdForBilling(pinCount * input.keywordCount * unit),
  };
}

/**
 * First Maps result whose place_id or cid matches the target business.
 * A null rank means the business was not in the returned results.
 */
export function matchMapsResultRank(
  items: Record<string, unknown>[],
  target: { placeId?: string | null; cid?: string | null },
): { rankAbsolute: number | null; matchedTitle: string | null } {
  const placeId = target.placeId?.trim() || null;
  const cid = target.cid?.trim() || null;

  for (const item of items) {
    const itemPlaceId =
      typeof item.place_id === "string" ? item.place_id : null;
    const itemCid = typeof item.cid === "string" ? item.cid : null;
    const title = typeof item.title === "string" ? item.title : null;
    const rank =
      typeof item.rank_absolute === "number"
        ? item.rank_absolute
        : typeof item.rank_group === "number"
          ? item.rank_group
          : null;
    if ((placeId && itemPlaceId === placeId) || (cid && itemCid === cid)) {
      return { rankAbsolute: rank, matchedTitle: title };
    }
  }
  return { rankAbsolute: null, matchedTitle: null };
}
