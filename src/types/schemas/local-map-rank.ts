import { z } from "zod";

export const localMapScheduleIntervalSchema = z.enum([
  "weekly",
  "monthly",
  "manual",
]);

export const getLocalMapCampaignsSchema = z.object({});

export const createLocalMapCampaignSchema = z.object({
  name: z.string().min(1).max(120),
  centerLatitude: z.number().min(-90).max(90),
  centerLongitude: z.number().min(-180).max(180),
  gridSize: z.number().int().min(3).max(15).refine((n) => n % 2 === 1, {
    message: "gridSize must be odd",
  }),
  radiusKm: z.number().min(0.5).max(50),
  targetPlaceId: z.string().optional(),
  targetCid: z.string().optional(),
  languageCode: z.string().min(2).max(10).default("en"),
  device: z.enum(["desktop", "mobile"]).default("desktop"),
  scheduleInterval: localMapScheduleIntervalSchema.default("weekly"),
  serpDepth: z.number().int().min(10).max(100).default(20),
  keywords: z.array(z.string().min(1).max(700)).min(1).max(20),
});

export const updateLocalMapCampaignSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  centerLatitude: z.number().min(-90).max(90).optional(),
  centerLongitude: z.number().min(-180).max(180).optional(),
  gridSize: z
    .number()
    .int()
    .min(3)
    .max(15)
    .refine((n) => n % 2 === 1, { message: "gridSize must be odd" })
    .optional(),
  radiusKm: z.number().min(0.5).max(50).optional(),
  targetPlaceId: z.string().nullable().optional(),
  targetCid: z.string().nullable().optional(),
  languageCode: z.string().min(2).max(10).optional(),
  device: z.enum(["desktop", "mobile"]).optional(),
  scheduleInterval: localMapScheduleIntervalSchema.optional(),
  serpDepth: z.number().int().min(10).max(100).optional(),
  isActive: z.boolean().optional(),
});

export const triggerLocalMapScanSchema = z.object({
  campaignId: z.string().uuid(),
});

export const estimateLocalMapScanCostSchema = z.object({
  campaignId: z.string().uuid(),
});

export const getLocalMapRunResultsSchema = z.object({
  runId: z.string().uuid(),
});

export const getLocalMapCampaignDetailSchema = z.object({
  campaignId: z.string().uuid(),
});

export const addLocalMapKeywordsSchema = z.object({
  campaignId: z.string().uuid(),
  keywords: z.array(z.string().min(1).max(700)).min(1).max(20),
});

export const removeLocalMapKeywordsSchema = z.object({
  campaignId: z.string().uuid(),
  keywordIds: z.array(z.string().uuid()).min(1),
});
