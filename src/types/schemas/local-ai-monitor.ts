import { z } from "zod";

export const localAiScheduleIntervalSchema = z.enum([
  "weekly",
  "monthly",
  "manual",
]);

export const getLocalAiMonitorsSchema = z.object({});

export const createLocalAiMonitorSchema = z.object({
  name: z.string().min(1).max(120),
  targetBusinessName: z.string().min(1).max(200),
  targetDomain: z.string().min(1).max(253).optional(),
  scheduleInterval: localAiScheduleIntervalSchema.default("weekly"),
  keywords: z.array(z.string().min(1).max(500)).min(1).max(20),
});

export const updateLocalAiMonitorSchema = z.object({
  configId: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  targetBusinessName: z.string().min(1).max(200).optional(),
  targetDomain: z.string().min(1).max(253).nullable().optional(),
  scheduleInterval: localAiScheduleIntervalSchema.optional(),
  isActive: z.boolean().optional(),
});

export const triggerLocalAiScanSchema = z.object({
  configId: z.string().uuid(),
});

export const estimateLocalAiScanCostSchema = z.object({
  configId: z.string().uuid(),
});

export const getLocalAiMonitorDetailSchema = z.object({
  configId: z.string().uuid(),
});

export const getLocalAiRunResultsSchema = z.object({
  runId: z.string().uuid(),
});

export const addLocalAiKeywordsSchema = z.object({
  configId: z.string().uuid(),
  keywords: z.array(z.string().min(1).max(500)).min(1).max(20),
});

export const removeLocalAiKeywordsSchema = z.object({
  configId: z.string().uuid(),
  keywordIds: z.array(z.string().uuid()).min(1),
});
