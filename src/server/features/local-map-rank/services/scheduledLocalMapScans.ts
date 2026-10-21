import { LocalMapRankRepository } from "@/server/features/local-map-rank/repositories/LocalMapRankRepository";
import { beginLocalMapScanRun } from "@/server/features/local-map-rank/services/localMapRankRunGuards";
import { assertUsageBudgetForEstimate } from "@/server/features/usage/services/UsageService";
import { buildGridPins } from "@/shared/grid-pins";
import {
  computeNextLocalMapCheckAt,
  estimateLocalMapScanCost,
  isScheduledLocalMapInterval,
} from "@/shared/local-map-rank";

export async function runScheduledLocalMapScans() {
  const nowIso = new Date().toISOString();
  const due =
    await LocalMapRankRepository.getDueCampaignsWithOrganization(nowIso);

  for (const campaign of due) {
    const interval = isScheduledLocalMapInterval(campaign.scheduleInterval)
      ? campaign.scheduleInterval
      : null;
    if (interval) {
      await LocalMapRankRepository.updateCampaign(
        campaign.id,
        campaign.projectId,
        {
          nextCheckAt: computeNextLocalMapCheckAt(
            interval,
            campaign.nextCheckAt,
          ),
        },
      );
    }

    try {
      const keywords = await LocalMapRankRepository.getKeywordsForCampaign(
        campaign.id,
      );
      if (keywords.length === 0) continue;

      const pins = buildGridPins({
        centerLatitude: campaign.centerLatitude,
        centerLongitude: campaign.centerLongitude,
        gridSize: campaign.gridSize,
        radiusKm: campaign.radiusKm,
      });
      const { costUsd } = estimateLocalMapScanCost({
        gridSize: campaign.gridSize,
        keywordCount: keywords.length,
        method: "queued",
      });
      await assertUsageBudgetForEstimate({
        organizationId: campaign.organizationId,
        estimatedCostUsd: costUsd,
      });

      const result = await beginLocalMapScanRun({
        campaignId: campaign.id,
        projectId: campaign.projectId,
        billingCustomer: {
          userId: "system",
          userEmail: "system@openseo.so",
          organizationId: campaign.organizationId,
          projectId: campaign.projectId,
        },
        pinsTotal: pins.length * keywords.length,
        trigger: "scheduled",
        workflowStartErrorMessage: "Failed to start scheduled maps scan",
      });
      if (result.ok) {
        console.log(
          `[cron] Started maps grid scan ${result.runId} for campaign ${campaign.id}`,
        );
      }
    } catch (error) {
      console.error(`[cron] Maps grid campaign ${campaign.id} skipped:`, error);
    }
  }
}
