import { createServerFn } from "@tanstack/react-start";
import { waitUntil } from "cloudflare:workers";
import { GbpRepository } from "@/server/features/gbp/repositories/GbpRepository";
import { GbpService } from "@/server/features/gbp/services/GbpService";
import { captureServerEvent } from "@/server/lib/posthog";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";
import {
  ensureGbpConnectionSchema,
  getGbpDashboardSchema,
  linkGbpLocationSchema,
  projectScopedGbpSchema,
  syncGbpPerformanceSchema,
  syncGbpProfileSchema,
  syncGbpReviewsSchema,
} from "@/types/schemas/gbp";

export const getGbpGrantStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    return { connected: await GbpService.userHasGrant(context.userId) };
  });

export const getGbpConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedGbpSchema)
  .handler(async ({ context }) => {
    const [connection, currentUserHasGrant, hosted, location] =
      await Promise.all([
        GbpService.getConnection(context.projectId),
        GbpService.userHasGrant(context.userId),
        isHostedServerAuthMode(),
        GbpRepository.getLocationByProjectId(context.projectId),
      ]);
    return {
      connected: Boolean(connection),
      currentUserHasGrant,
      googleOAuthConfigured: hosted,
      connectedByEmail: connection?.connectedAccountEmail ?? null,
      connectedAt: connection?.createdAt ?? null,
      locationLinked: Boolean(location),
      locationTitle: location?.title ?? null,
    };
  });

export const ensureGbpConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(ensureGbpConnectionSchema)
  .handler(async ({ data, context }) => {
    const connection = await GbpService.ensureConnection({
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
      accountId: data.accountId,
    });
    return {
      connected: true as const,
      connectedByEmail: connection.connectedAccountEmail,
    };
  });

export const listGbpLocations = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedGbpSchema)
  .handler(async ({ context }) => {
    return GbpService.listLocationsForUser({
      userId: context.userId,
      projectId: context.projectId,
    });
  });

export const linkGbpLocation = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(linkGbpLocationSchema)
  .handler(async ({ data, context }) => {
    const location = await GbpService.linkLocation({
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
      accountId: data.accountId,
      googleLocationName: data.googleLocationName,
      title: data.title,
      placeId: data.placeId,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "gbp:location_select",
        organizationId: context.organizationId,
        properties: {
          project_id: context.projectId,
          google_location_name: data.googleLocationName,
        },
      }),
    );
    return {
      linked: true as const,
      locationId: location.id,
      title: location.title,
    };
  });

export const disconnectGbp = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedGbpSchema)
  .handler(async ({ context }) => {
    await GbpService.disconnect({
      projectId: context.projectId,
      userId: context.userId,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "gbp:disconnect",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId },
      }),
    );
    return { connected: false as const };
  });

export const syncGbpProfile = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(syncGbpProfileSchema)
  .handler(async ({ data, context }) => {
    return GbpService.syncProfile({
      projectId: context.projectId,
      billingCustomer: context,
      languageCode: data.languageCode,
      locationCode: data.locationCode,
    });
  });

export const syncGbpReviews = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(syncGbpReviewsSchema)
  .handler(async ({ data, context }) => {
    return GbpService.syncReviews({
      projectId: context.projectId,
      billingCustomer: context,
      languageCode: data.languageCode,
      locationCode: data.locationCode,
      depth: data.depth,
      extended: data.extended,
    });
  });

export const syncGbpPerformance = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(syncGbpPerformanceSchema)
  .handler(async ({ data, context }) => {
    return GbpService.syncPerformance({
      projectId: context.projectId,
      days: data.days,
    });
  });

export const getGbpDashboard = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getGbpDashboardSchema)
  .handler(async ({ context }) => {
    return GbpService.getDashboardData(context.projectId);
  });
