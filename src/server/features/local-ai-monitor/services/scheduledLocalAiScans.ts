import { LocalAiMonitorRepository } from "@/server/features/local-ai-monitor/repositories/LocalAiMonitorRepository";
import { LocalAiMonitorService } from "@/server/features/local-ai-monitor/services/LocalAiMonitorService";
import {
  computeNextLocalAiCheckAt,
  isScheduledLocalAiInterval,
} from "@/shared/local-ai-monitor";

export async function runScheduledLocalAiScans(_env: Env) {
  const nowIso = new Date().toISOString();
  const dueConfigs =
    await LocalAiMonitorRepository.getDueConfigsWithOrganization(nowIso);

  for (const config of dueConfigs) {
    try {
      const keywords = await LocalAiMonitorRepository.getKeywordsForConfig(
        config.id,
      );
      if (keywords.length === 0) continue;

      const interval = isScheduledLocalAiInterval(config.scheduleInterval)
        ? config.scheduleInterval
        : null;
      if (interval) {
        await LocalAiMonitorRepository.updateConfig(
          config.id,
          config.projectId,
          {
            nextCheckAt: computeNextLocalAiCheckAt(
              interval,
              config.nextCheckAt,
            ),
          },
        );
      }

      const result = await LocalAiMonitorService.triggerScan({
        configId: config.id,
        projectId: config.projectId,
        billingCustomer: {
          userId: "system",
          userEmail: "system@openseo.so",
          organizationId: config.organizationId,
          projectId: config.projectId,
        },
        trigger: "scheduled",
      });

      if (result.ok) {
        console.log(
          `[cron] Completed scheduled local AI scan ${result.runId} for config ${config.id}`,
        );
      }
    } catch (err) {
      console.error(`[cron] Local AI config ${config.id} failed:`, err);
    }
  }
}
