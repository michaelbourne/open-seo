import { z } from "zod";

export const projectScopedGbpSchema = z.object({
  projectId: z.string().min(1),
});

export const ensureGbpConnectionSchema = projectScopedGbpSchema.extend({
  accountId: z.string().min(1),
});

export const linkGbpLocationSchema = projectScopedGbpSchema.extend({
  accountId: z.string().min(1),
  googleLocationName: z.string().min(1),
  title: z.string().nullable().optional(),
  placeId: z.string().nullable().optional(),
});

export const syncGbpProfileSchema = projectScopedGbpSchema.extend({
  languageCode: z.string().min(2).max(10).optional(),
  locationCode: z.number().int().positive().optional(),
});

export const syncGbpReviewsSchema = projectScopedGbpSchema.extend({
  languageCode: z.string().min(2).max(10).optional(),
  locationCode: z.number().int().positive().optional(),
  depth: z.number().int().min(10).max(500).optional(),
  extended: z.boolean().optional(),
});

export const syncGbpPerformanceSchema = projectScopedGbpSchema.extend({
  days: z.number().int().min(1).max(540).optional(),
});

export const getGbpDashboardSchema = projectScopedGbpSchema;
