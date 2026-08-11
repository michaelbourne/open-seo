import { createServerFn } from "@tanstack/react-start";
import { BrandingService } from "@/server/features/branding/services/BrandingService";
import { requireOrganizationContext } from "@/serverFunctions/middleware";
import {
  getOrganizationBrandingSchema,
  updateOrganizationBrandingSchema,
} from "@/types/schemas/branding";

export const getOrganizationBranding = createServerFn({ method: "POST" })
  .middleware(requireOrganizationContext)
  .validator(getOrganizationBrandingSchema)
  .handler(async ({ context }) => {
    return BrandingService.getBranding(context.organizationId);
  });

export const updateOrganizationBranding = createServerFn({ method: "POST" })
  .middleware(requireOrganizationContext)
  .validator(updateOrganizationBrandingSchema)
  .handler(async ({ data, context }) => {
    return BrandingService.updateBranding(context.organizationId, data);
  });
