import { env } from "cloudflare:workers";
import { LocalMapRankRepository } from "@/server/features/local-map-rank/repositories/LocalMapRankRepository";
import type { BillingCustomerContext } from "@/server/billing/subscription";

type RunRow = Awaited<ReturnType<typeof LocalMapRankRepository.getRunById>>;

const ACTIVE_WORKFLOW_STATUSES = new Set([
  "queued",
  "running",
  "waiting",
  "waitingForPause",
  "paused",
  "unknown",
]);

const STARTUP_GRACE_MS = 60 * 1000;

type WorkflowStatus = {
  status: string;
  error?: { message: string };
};

async function getWorkflowStatus(runId: string): Promise<WorkflowStatus | null> {
  try {
    const instance = await env.LOCAL_MAP_RANK_WORKFLOW.get(runId);
    return (await instance.status()) as WorkflowStatus;
  } catch {
    return null;
  }
}

export async function failLocalMapRunIfActive(
  runId: string,
  reason: string,
  run?: RunRow,
) {
  const current = run ?? (await LocalMapRankRepository.getRunById(runId));
  if (
    !current ||
    current.status === "completed" ||
    current.status === "failed"
  ) {
    return;
  }
  await LocalMapRankRepository.updateRun(runId, {
    status: "failed",
    errorMessage: reason,
    completedAt: new Date().toISOString(),
  });
}

export async function beginLocalMapScanRun(input: {
  campaignId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
  pinsTotal: number;
  trigger: "manual" | "scheduled";
  workflowStartErrorMessage: string;
}): Promise<
  | { ok: true; runId: string }
  | { ok: false; reason: "already_running"; blockingRunId: string | null }
> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const runId = crypto.randomUUID();
    const inserted = await LocalMapRankRepository.tryCreateRun({
      id: runId,
      campaignId: input.campaignId,
      projectId: input.projectId,
      status: "pending",
      trigger: input.trigger,
      pinsTotal: input.pinsTotal,
      pinsCompleted: 0,
    });

    if (inserted) {
      try {
        await env.LOCAL_MAP_RANK_WORKFLOW.create({
          id: runId,
          params: {
            runId,
            campaignId: input.campaignId,
            projectId: input.projectId,
            billingCustomer: input.billingCustomer,
            trigger: input.trigger,
          },
        });
      } catch (error) {
        await failLocalMapRunIfActive(runId, input.workflowStartErrorMessage);
        try {
          const instance = await env.LOCAL_MAP_RANK_WORKFLOW.get(runId);
          await instance.terminate();
        } catch {
          // Workflow may not exist.
        }
        throw error;
      }
      return { ok: true, runId };
    }

    const blocker = await LocalMapRankRepository.getActiveRunForCampaign(
      input.campaignId,
    );
    if (!blocker) continue;

    if (attempt === 0) {
      const workflowStatus = await getWorkflowStatus(blocker.id);
      const ageMs = Date.now() - new Date(blocker.startedAt ?? blocker.createdAt).getTime();
      const startupWindow =
        ageMs < STARTUP_GRACE_MS &&
        (blocker.status === "pending" || blocker.status === "running") &&
        (!workflowStatus || workflowStatus.status === "unknown");

      const stale =
        !startupWindow &&
        (!workflowStatus ||
          !ACTIVE_WORKFLOW_STATUSES.has(workflowStatus.status));

      if (stale) {
        await failLocalMapRunIfActive(
          blocker.id,
          workflowStatus?.error?.message ?? "Workflow no longer active",
          blocker,
        );
        continue;
      }
    }

    return {
      ok: false,
      reason: "already_running",
      blockingRunId: blocker.id,
    };
  }

  const final = await LocalMapRankRepository.getActiveRunForCampaign(
    input.campaignId,
  );
  return {
    ok: false,
    reason: "already_running",
    blockingRunId: final?.id ?? null,
  };
}
