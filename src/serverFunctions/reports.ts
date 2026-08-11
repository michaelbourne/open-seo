import { createServerFn } from "@tanstack/react-start";
import {
  getGridRankReportData,
  getLocalPresenceReportData,
  getLocalReportData,
} from "@/server/features/reports/localReportData";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  getProjectGridRankReportSchema,
  getProjectLocalPresenceReportSchema,
  getProjectLocalReportSchema,
} from "@/types/schemas/branding";

export const getProjectLocalReportPrintData = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getProjectLocalReportSchema)
  .handler(async ({ data, context }) => {
    return getLocalReportData({
      projectId: data.projectId ?? context.projectId,
      organizationId: context.organizationId,
      campaignId: data.campaignId,
    });
  });

export const getProjectGridRankReportPrintData = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(getProjectGridRankReportSchema)
  .handler(async ({ data, context }) => {
    return getGridRankReportData({
      projectId: data.projectId ?? context.projectId,
      organizationId: context.organizationId,
      campaignId: data.campaignId,
    });
  });

export const getProjectLocalPresenceReportPrintData = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(getProjectLocalPresenceReportSchema)
  .handler(async ({ data, context }) => {
    return getLocalPresenceReportData({
      projectId: data.projectId ?? context.projectId,
      organizationId: context.organizationId,
    });
  });
