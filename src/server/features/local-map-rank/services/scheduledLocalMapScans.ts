import { LocalMapRankRepository } from "@/server/features/local-map-rank/repositories/LocalMapRankRepository";
import { beginLocalMapScanRun } from "@/server/features/local-map-rank/services/localMapRankRunGuards";
import { buildGridPins } from "@/shared/grid-pins";
import {
  computeNextLocalMapCheckAt,
  isScheduledLocalMapInterval,
} from "@/shared/local-map-rank";

export async function runScheduledLocalMapScans(env: Env) {
  const nowIso = new Date().toISOString();
  const dueCampaigns =
    await LocalMapRankRepository.getDueCampaignsWithOrganization(nowIso);

  for (const campaign of dueCampaigns) {
    try {
      const keywords = await LocalMapRankRepository.getKeywordsForCampaign(
        campaign.id,
      );
      if (keywords.length === 0) continue;

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

      const pins = buildGridPins({
        centerLatitude: campaign.centerLatitude,
        centerLongitude: campaign.centerLongitude,
        gridSize: campaign.gridSize,
        radiusKm: campaign.radiusKm,
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
          `[cron] Started scheduled local map scan ${result.runId} for campaign ${campaign.id}`,
        );
      }
    } catch (err) {
      console.error(`[cron] Local map campaign ${campaign.id} failed:`, err);
    }
  }
}
