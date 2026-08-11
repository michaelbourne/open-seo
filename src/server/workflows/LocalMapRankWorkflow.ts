import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { withPgClient } from "@/db";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { LocalMapRankRepository } from "@/server/features/local-map-rank/repositories/LocalMapRankRepository";
import { failLocalMapRunIfActive } from "@/server/features/local-map-rank/services/localMapRankRunGuards";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { pgStep } from "@/server/workflows/pgStep";
import {
  buildScanContext,
  runLiveMapScan,
  runQueuedMapScan,
} from "@/server/workflows/localMapRankPaths";

const SINGLE_ATTEMPT_STEP_CONFIG = {
  retries: { limit: 0, delay: "1 second" as const },
  timeout: "2 minutes" as const,
};

interface LocalMapRankParams {
  runId: string;
  campaignId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
  trigger: "manual" | "scheduled";
}

export class LocalMapRankWorkflow extends WorkflowEntrypoint<
  Env,
  LocalMapRankParams
> {
  async run(event: WorkflowEvent<LocalMapRankParams>, step: WorkflowStep) {
    return withPgClient(() => this.runScoped(event, step));
  }

  private async runScoped(
    event: WorkflowEvent<LocalMapRankParams>,
    step: WorkflowStep,
  ) {
    const { runId, campaignId, projectId, billingCustomer, trigger } =
      event.payload;
    const client = createDataforseoClient(billingCustomer);

    try {
      const campaign = await LocalMapRankRepository.getCampaignById(
        campaignId,
        projectId,
      );
      if (!campaign?.isActive) {
        await failLocalMapRunIfActive(runId, "Campaign is not active");
        return;
      }

      await pgStep(step, "mark-running", SINGLE_ATTEMPT_STEP_CONFIG, async () => {
        await LocalMapRankRepository.updateRun(runId, { status: "running" });
      });

      const ctx = await pgStep(
        step,
        "prepare",
        SINGLE_ATTEMPT_STEP_CONFIG,
        async () =>
          buildScanContext({
            client,
            runId,
            campaignId,
            projectId,
          }),
      );

      if (trigger === "scheduled") {
        await runQueuedMapScan(step, ctx);
      } else {
        await runLiveMapScan(step, ctx);
      }

      await pgStep(step, "finalize", SINGLE_ATTEMPT_STEP_CONFIG, async () => {
        const results = await LocalMapRankRepository.getResultsForRun(runId);
        const nowIso = new Date().toISOString();
        await LocalMapRankRepository.updateRun(runId, {
          status: "completed",
          pinsCompleted: results.length,
          completedAt: nowIso,
        });
        await LocalMapRankRepository.updateCampaign(campaignId, projectId, {
          lastCheckedAt: nowIso,
        });
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown workflow error";
      await pgStep(step, "mark-failed", SINGLE_ATTEMPT_STEP_CONFIG, async () => {
        await failLocalMapRunIfActive(runId, message);
      });
      throw error;
    }
  }
}
