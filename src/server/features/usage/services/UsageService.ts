import type { CreditFeature } from "@/shared/billing-credit-features";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { UsageRepository } from "@/server/features/usage/repositories/UsageRepository";

function capOrNull(value: number | null | undefined): number | null {
  if (value == null || value <= 0) return null;
  return value;
}

/** Append a self-host charge, then refuse once the monthly cap is crossed. */
export async function recordSelfHostedUsage(input: {
  organizationId: string;
  creditFeature: CreditFeature;
  costUsd: number;
  apiPath?: string;
  projectId?: string;
  runId?: string;
}) {
  if (input.costUsd <= 0) return;
  if (await isHostedServerAuthMode()) return;

  await UsageRepository.appendLedgerRow({
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    creditFeature: input.creditFeature,
    costUsd: input.costUsd,
    apiPath: input.apiPath ?? null,
    projectId: input.projectId ?? null,
    runId: input.runId ?? null,
    createdAt: new Date().toISOString(),
  });

  const settings = await UsageRepository.getSettings(input.organizationId);
  const budget = capOrNull(settings?.monthlyBudgetUsd);
  if (budget == null) return;

  const spent = await UsageRepository.getMonthToDateSpend(input.organizationId);
  if (spent > budget) {
    throw new AppError(
      "USAGE_BUDGET_EXCEEDED",
      `Monthly spend cap of $${budget.toFixed(2)} exceeded (spent $${spent.toFixed(2)}).`,
    );
  }
}

/** Refuse an action whose estimate would cross the monthly cap. */
export async function assertUsageBudgetForEstimate(input: {
  organizationId: string;
  estimatedCostUsd: number;
}) {
  if (await isHostedServerAuthMode()) return;

  const settings = await UsageRepository.getSettings(input.organizationId);
  const budget = capOrNull(settings?.monthlyBudgetUsd);
  if (budget == null) return;

  const spent = await UsageRepository.getMonthToDateSpend(input.organizationId);
  if (spent + input.estimatedCostUsd > budget) {
    throw new AppError(
      "USAGE_BUDGET_EXCEEDED",
      `This action needs about $${input.estimatedCostUsd.toFixed(2)} but only $${Math.max(0, budget - spent).toFixed(2)} remains of the $${budget.toFixed(2)} monthly cap.`,
    );
  }
}

export async function assertAgentDailyBudget(organizationId: string) {
  if (await isHostedServerAuthMode()) return;

  const settings = await UsageRepository.getSettings(organizationId);
  const dailyCap = capOrNull(settings?.dailyAgentBudgetUsd);
  if (dailyCap == null) return;

  const spent = await UsageRepository.getDailyAgentSpend(organizationId);
  if (spent >= dailyCap) {
    throw new AppError(
      "USAGE_BUDGET_EXCEEDED",
      `Daily agent cap of $${dailyCap.toFixed(2)} reached.`,
    );
  }
}

export async function getUsageDashboard(organizationId: string) {
  const [settings, monthSpend, byFeature] = await Promise.all([
    UsageRepository.getSettings(organizationId),
    UsageRepository.getMonthToDateSpend(organizationId),
    UsageRepository.getMonthToDateSpendByFeature(organizationId),
  ]);

  const budget = capOrNull(settings?.monthlyBudgetUsd ?? null);
  const alertThresholdPct = settings?.alertThresholdPct ?? 80;
  return {
    monthlyBudgetUsd: budget,
    dailyAgentBudgetUsd: capOrNull(settings?.dailyAgentBudgetUsd ?? null),
    monthSpend,
    byFeature,
    alertTriggered:
      budget != null && monthSpend >= budget * (alertThresholdPct / 100),
    budgetExceeded: budget != null && monthSpend >= budget,
  };
}

export async function updateUsageSettings(
  organizationId: string,
  input: {
    monthlyBudgetUsd: number | null;
    dailyAgentBudgetUsd: number | null;
  },
) {
  await UsageRepository.upsertSettings(organizationId, {
    monthlyBudgetUsd: capOrNull(input.monthlyBudgetUsd),
    dailyAgentBudgetUsd: capOrNull(input.dailyAgentBudgetUsd),
  });
}
