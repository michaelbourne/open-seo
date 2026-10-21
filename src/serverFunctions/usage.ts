import { createServerFn } from "@tanstack/react-start";
import {
  getUsageDashboard,
  updateUsageSettings,
} from "@/server/features/usage/services/UsageService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import { updateUsageSettingsSchema } from "@/types/schemas/usage-budget";

export const getUsageBudget = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => getUsageDashboard(context.organizationId));

export const saveUsageBudget = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(updateUsageSettingsSchema)
  .handler(async ({ data, context }) => {
    await updateUsageSettings(context.organizationId, data);
    return getUsageDashboard(context.organizationId);
  });
