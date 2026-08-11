import { z } from "zod";

export const getOrganizationBrandingSchema = z.object({});

export const updateOrganizationBrandingSchema = z.object({
  agencyName: z.string().min(1).max(120),
  logoUrl: z.string().url().max(2048).nullable().optional(),
  primaryColorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  footerText: z.string().max(500).nullable().optional(),
  coverSubtitle: z.string().max(200).nullable().optional(),
});

export const getProjectLocalReportSchema = z.object({
  projectId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
});

export const getProjectGridRankReportSchema = z.object({
  projectId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
});

export const getProjectLocalPresenceReportSchema = z.object({
  projectId: z.string().uuid().optional(),
});
