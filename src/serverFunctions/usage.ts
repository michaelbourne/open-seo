import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getUsageDashboard,
  updateUsageSettings,
} from "@/server/features/usage/services/UsageService";
import { requireOrganizationContext } from "@/serverFunctions/middleware";

const updateUsageSettingsSchema = z.object({
  monthlyBudgetUsd: z.number().min(0).nullable().optional(),
  alertThresholdPct: z.number().int().min(1).max(100).optional(),
  dailyAgentBudgetUsd: z.number().min(0).nullable().optional(),
});

export const getOrganizationUsage = createServerFn({ method: "POST" })
  .middleware(requireOrganizationContext)
  .handler(async ({ context }) => {
    return getUsageDashboard(context.organizationId);
  });

export const saveOrganizationUsageSettings = createServerFn({ method: "POST" })
  .middleware(requireOrganizationContext)
  .validator(updateUsageSettingsSchema)
  .handler(async ({ data, context }) => {
    await updateUsageSettings(context.organizationId, data);
    return getUsageDashboard(context.organizationId);
  });
