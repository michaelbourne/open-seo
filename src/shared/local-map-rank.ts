import { estimateMapsScanCostUsd } from "@/shared/dataforseo-pricing";
import { pinCountForGridSize } from "@/shared/grid-pins";
import { roundUsdForBilling } from "@/shared/billing";
import {
  computeNextCheckAt,
  isScheduledRankTrackingInterval,
} from "@/shared/rank-tracking";

export type LocalMapScheduleInterval = "weekly" | "monthly" | "manual";

export function isScheduledLocalMapInterval(
  interval: LocalMapScheduleInterval,
): interval is "weekly" | "monthly" {
  return isScheduledRankTrackingInterval(interval);
}

export { computeNextCheckAt as computeNextLocalMapCheckAt };

export function estimateLocalMapScanCost(input: {
  gridSize: number;
  keywordCount: number;
  method: "live" | "queued";
}) {
  const pinCount = pinCountForGridSize(input.gridSize);
  const costUsd = roundUsdForBilling(
    estimateMapsScanCostUsd({
      pinCount,
      keywordCount: input.keywordCount,
      method: input.method,
    }),
  );
  return { pinCount, costUsd };
}

export function matchMapsResultRank(
  items: Record<string, unknown>[],
  target: { placeId?: string | null; cid?: string | null },
): { rankAbsolute: number | null; matchedTitle: string | null } {
  const normalizedPlaceId = target.placeId?.trim() || null;
  const normalizedCid = target.cid?.trim() || null;

  for (const item of items) {
    const placeId =
      typeof item.place_id === "string" ? item.place_id : undefined;
    const cid = typeof item.cid === "string" ? item.cid : undefined;
    const title = typeof item.title === "string" ? item.title : null;
    const rank =
      typeof item.rank_absolute === "number"
        ? item.rank_absolute
        : typeof item.rank_group === "number"
          ? item.rank_group
          : null;

    const placeMatch =
      normalizedPlaceId != null && placeId === normalizedPlaceId;
    const cidMatch = normalizedCid != null && cid === normalizedCid;
    if (placeMatch || cidMatch) {
      return { rankAbsolute: rank, matchedTitle: title };
    }
  }

  return { rankAbsolute: null, matchedTitle: null };
}
