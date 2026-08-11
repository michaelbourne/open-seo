import { BrandingRepository } from "@/server/features/branding/repositories/BrandingRepository";
import { AppError } from "@/server/lib/errors";

const DEFAULT_PRIMARY_COLOR = "#2563eb";

async function getBranding(organizationId: string) {
  const row = await BrandingRepository.getBranding(organizationId);
  if (!row) {
    return {
      organizationId,
      agencyName: "",
      logoUrl: null,
      primaryColorHex: DEFAULT_PRIMARY_COLOR,
      footerText: null,
      coverSubtitle: null,
      updatedAt: null,
      isConfigured: false,
    };
  }

  return {
    ...row,
    isConfigured: true,
  };
}

async function updateBranding(
  organizationId: string,
  input: {
    agencyName: string;
    logoUrl?: string | null;
    primaryColorHex?: string;
    footerText?: string | null;
    coverSubtitle?: string | null;
  },
) {
  const agencyName = input.agencyName.trim();
  if (!agencyName) {
    throw new AppError("VALIDATION_ERROR", "Agency name is required");
  }

  const primaryColorHex = input.primaryColorHex?.trim() || DEFAULT_PRIMARY_COLOR;
  if (!/^#[0-9a-fA-F]{6}$/.test(primaryColorHex)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Primary color must be a 6-digit hex value like #2563eb",
    );
  }

  await BrandingRepository.upsertBranding(organizationId, {
    agencyName,
    logoUrl: input.logoUrl?.trim() || null,
    primaryColorHex,
    footerText: input.footerText?.trim() || null,
    coverSubtitle: input.coverSubtitle?.trim() || null,
    updatedAt: new Date().toISOString(),
  });

  return getBranding(organizationId);
}

export const BrandingService = {
  getBranding,
  updateBranding,
};
