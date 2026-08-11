import type { CreditFeature } from "@/shared/billing-credit-features";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { UsageRepository } from "@/server/features/usage/repositories/UsageRepository";

export async function recordSelfHostedUsage(input: {
  organizationId: string;
  creditFeature: CreditFeature;
  costUsd: number;
  apiPath?: string;
  projectId?: string;
  runId?: string;
}) {
  if (input.costUsd <= 0) return;

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
  const budget = settings?.monthlyBudgetUsd;
  if (budget == null || budget <= 0) return;

  const spent = await UsageRepository.getMonthToDateSpend(input.organizationId);
  if (spent > budget) {
    throw new AppError(
      "USAGE_BUDGET_EXCEEDED",
      `Monthly DataForSEO budget of $${budget.toFixed(2)} exceeded (spent $${spent.toFixed(2)})`,
    );
  }
}

export async function assertUsageBudgetForEstimate(input: {
  organizationId: string;
  estimatedCostUsd: number;
}) {
  if (await isHostedServerAuthMode()) return;

  const settings = await UsageRepository.getSettings(input.organizationId);
  const budget = settings?.monthlyBudgetUsd;
  if (budget == null || budget <= 0) return;

  const spent = await UsageRepository.getMonthToDateSpend(input.organizationId);
  if (spent + input.estimatedCostUsd > budget) {
    throw new AppError(
      "USAGE_BUDGET_EXCEEDED",
      `This action needs about $${input.estimatedCostUsd.toFixed(2)} but only $${Math.max(0, budget - spent).toFixed(2)} remains in your $${budget.toFixed(2)} monthly budget.`,
    );
  }
}

export async function assertAgentDailyBudget(organizationId: string) {
  if (await isHostedServerAuthMode()) return;

  const settings = await UsageRepository.getSettings(organizationId);
  const dailyCap = settings?.dailyAgentBudgetUsd;
  if (dailyCap == null || dailyCap <= 0) return;

  const spent = await UsageRepository.getDailyAgentSpend(organizationId);
  if (spent >= dailyCap) {
    throw new AppError(
      "USAGE_BUDGET_EXCEEDED",
      `Daily SAM agent budget of $${dailyCap.toFixed(2)} reached.`,
    );
  }
}

export async function getUsageDashboard(organizationId: string) {
  const [settings, monthSpend, byFeature] = await Promise.all([
    UsageRepository.getSettings(organizationId),
    UsageRepository.getMonthToDateSpend(organizationId),
    UsageRepository.getMonthToDateSpendByFeature(organizationId),
  ]);

  const budget = settings?.monthlyBudgetUsd ?? null;
  const alertThresholdPct = settings?.alertThresholdPct ?? 80;
  const alertTriggered =
    budget != null &&
    budget > 0 &&
    monthSpend >= budget * (alertThresholdPct / 100);

  return {
    settings: settings ?? {
      organizationId,
      monthlyBudgetUsd: null,
      alertThresholdPct: 80,
      dailyAgentBudgetUsd: null,
      updatedAt: new Date().toISOString(),
    },
    monthSpend,
    byFeature,
    budget,
    alertTriggered,
    budgetExceeded: budget != null && budget > 0 && monthSpend >= budget,
  };
}

export async function updateUsageSettings(
  organizationId: string,
  input: {
    monthlyBudgetUsd?: number | null;
    alertThresholdPct?: number;
    dailyAgentBudgetUsd?: number | null;
  },
) {
  await UsageRepository.upsertSettings(organizationId, input);
}
