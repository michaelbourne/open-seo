import { z } from "zod";

export const updateUsageSettingsSchema = z.object({
  monthlyBudgetUsd: z.number().min(0).nullable(),
  dailyAgentBudgetUsd: z.number().min(0).nullable(),
});
