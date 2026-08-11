import { and, eq } from "drizzle-orm";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { GbpRepository } from "@/server/features/gbp/repositories/GbpRepository";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import {
  fetchExtendedReviewsTaskResult,
  fetchGoogleReviewsTaskResult,
} from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import {
  createGbpClient,
  GbpApiError,
  GbpTokenError,
  type GbpLocation as GoogleGbpLocation,
} from "@/server/lib/gbpClient";
import { db } from "@/db";
import { account } from "@/db/schema";
import { GBP_OAUTH_PROVIDER_ID } from "@/shared/gsc";

const REVIEWS_TASK_POLL_ATTEMPTS = 12;
const REVIEWS_TASK_POLL_DELAY_MS = 5_000;
const DEFAULT_REVIEW_DEPTH = 50;
const DEFAULT_PROFILE_LANGUAGE = "en";
const DEFAULT_PROFILE_LOCATION_CODE = 2840;

export class GbpNotConnectedError extends Error {
  constructor(public readonly projectId: string) {
    super("Google Business Profile is not connected for this project");
    this.name = "GbpNotConnectedError";
  }
}

export class GbpLocationNotLinkedError extends Error {
  constructor(public readonly projectId: string) {
    super("No Google Business Profile location is linked to this project");
    this.name = "GbpLocationNotLinkedError";
  }
}

type GbpLocationListResult = {
  accounts: Array<{
    accountId: string;
    accountName: string;
    email: string | null;
    requiresReconnect: boolean;
    locations: Array<{
      googleLocationName: string;
      title: string | null;
      placeId: string | null;
      isSelected: boolean;
    }>;
  }>;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDateParts(date: Date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function reviewIdFromPayload(payload: Record<string, unknown>): string | null {
  const candidates = [payload.review_id, payload.reviewId, payload.id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

function reviewTimestampFromPayload(
  payload: Record<string, unknown>,
): string | null {
  const candidates = [
    payload.timestamp,
    payload.review_timestamp,
    payload.time,
    payload.published_at,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

export function isExpectedGbpGrantFailure(error: unknown): boolean {
  if (error instanceof GbpTokenError) return true;
  return (
    error instanceof GbpApiError &&
    (error.status === 401 || error.status === 403)
  );
}

async function listGrantsForUser(userId: string) {
  return db
    .select({ id: account.id, accountId: account.accountId })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, GBP_OAUTH_PROVIDER_ID),
      ),
    );
}

async function userHasGrant(userId: string): Promise<boolean> {
  const grants = await listGrantsForUser(userId);
  return grants.length > 0;
}

async function resolveGbpAccountId(input: {
  userId: string;
  connectedAccountEmail: string | null;
}): Promise<string> {
  const grants = await listGrantsForUser(input.userId);
  if (grants.length === 0) {
    throw new AppError(
      "NOT_FOUND",
      "No Google Business Profile account is connected.",
    );
  }
  if (grants.length === 1) {
    return grants[0]!.accountId;
  }
  if (!input.connectedAccountEmail) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Multiple Google accounts are connected; reconnect to select one.",
    );
  }
  for (const grant of grants) {
    const client = createGbpClient({
      userId: input.userId,
      gbpAccountId: grant.accountId,
    });
    try {
      const email = await client.getUserInfoEmail();
      if (email === input.connectedAccountEmail) {
        return grant.accountId;
      }
    } catch {
      continue;
    }
  }
  throw new AppError(
    "NOT_FOUND",
    "The connected Google Business Profile grant could not be resolved.",
  );
}

async function getConnection(projectId: string) {
  return GbpRepository.getConnectionByProjectId(projectId);
}

async function ensureConnection(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  accountId: string;
}) {
  const grants = await listGrantsForUser(input.userId);
  if (!grants.some((grant) => grant.accountId === input.accountId)) {
    throw new AppError(
      "NOT_FOUND",
      "That Google account isn't connected to your OpenSEO account.",
    );
  }
  const client = createGbpClient({
    userId: input.userId,
    gbpAccountId: input.accountId,
  });
  let connectedAccountEmail: string | null = null;
  try {
    connectedAccountEmail = await client.getUserInfoEmail();
  } catch {
    connectedAccountEmail = null;
  }
  return GbpRepository.upsertConnection({
    projectId: input.projectId,
    organizationId: input.organizationId,
    connectedByUserId: input.userId,
    connectedAccountEmail,
  });
}

async function listLocationsForUser(input: {
  userId: string;
  projectId: string;
}): Promise<GbpLocationListResult> {
  const [grants, connection, linkedLocation] = await Promise.all([
    listGrantsForUser(input.userId),
    GbpRepository.getConnectionByProjectId(input.projectId),
    GbpRepository.getLocationByProjectId(input.projectId),
  ]);

  const accounts = await Promise.all(
    grants.map(async (grant) => {
      const client = createGbpClient({
        userId: input.userId,
        gbpAccountId: grant.accountId,
      });
      try {
        const [email, gbpAccounts] = await Promise.all([
          client.getUserInfoEmail().catch(() => null),
          client.listAccounts(),
        ]);
        const locations: GoogleGbpLocation[] = [];
        for (const gbpAccount of gbpAccounts) {
          locations.push(...(await client.listLocations(gbpAccount.name)));
        }
        return {
          accountId: grant.accountId,
          accountName: gbpAccounts[0]?.accountName ?? grant.accountId,
          email,
          requiresReconnect: false,
          locations: locations.map((location) => ({
            googleLocationName: location.name,
            title: location.title ?? null,
            placeId: location.metadata?.placeId ?? null,
            isSelected:
              linkedLocation?.googleLocationName === location.name &&
              connection?.connectedAccountEmail === email,
          })),
        };
      } catch (error) {
        if (!isExpectedGbpGrantFailure(error)) {
          console.error(
            "Failed to list Google Business Profile locations",
            grant.accountId,
            error,
          );
        }
        return {
          accountId: grant.accountId,
          accountName: grant.accountId,
          email: null,
          requiresReconnect: true,
          locations: [],
        };
      }
    }),
  );

  return { accounts };
}

async function linkLocation(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  accountId: string;
  googleLocationName: string;
  title?: string | null;
  placeId?: string | null;
}) {
  const connection = await ensureConnection({
    projectId: input.projectId,
    organizationId: input.organizationId,
    userId: input.userId,
    accountId: input.accountId,
  });

  const client = createGbpClient({
    userId: input.userId,
    gbpAccountId: input.accountId,
  });
  const accounts = await client.listAccounts();
  const allLocations: GoogleGbpLocation[] = [];
  for (const gbpAccount of accounts) {
    allLocations.push(...(await client.listLocations(gbpAccount.name)));
  }
  const match = allLocations.find(
    (location) => location.name === input.googleLocationName,
  );
  if (!match) {
    throw new AppError(
      "NOT_FOUND",
      "That Google Business Profile location isn't available on your connected account.",
    );
  }

  return GbpRepository.upsertLocation({
    id: crypto.randomUUID(),
    connectionId: connection.id,
    projectId: input.projectId,
    googleLocationName: match.name,
    placeId: input.placeId ?? match.metadata?.placeId ?? null,
    title: input.title ?? match.title ?? null,
  });
}

async function disconnect(input: { projectId: string; userId: string }) {
  const connection = await GbpRepository.getConnectionByProjectId(
    input.projectId,
  );
  await GbpRepository.deleteLocationByProjectId(input.projectId);
  await GbpRepository.deleteConnectionByProjectId(input.projectId);
  if (connection?.connectedByUserId === input.userId) {
    const grants = await listGrantsForUser(input.userId);
    if (grants.length === 1) {
      await db
        .delete(account)
        .where(
          and(
            eq(account.userId, input.userId),
            eq(account.providerId, GBP_OAUTH_PROVIDER_ID),
          ),
        );
    }
  }
}

async function requireLinkedLocation(projectId: string) {
  const [connection, location] = await Promise.all([
    GbpRepository.getConnectionByProjectId(projectId),
    GbpRepository.getLocationByProjectId(projectId),
  ]);
  if (!connection) {
    throw new GbpNotConnectedError(projectId);
  }
  if (!location) {
    throw new GbpLocationNotLinkedError(projectId);
  }
  return { connection, location };
}

async function syncProfile(input: {
  projectId: string;
  billingCustomer: BillingCustomerContext;
  languageCode?: string;
  locationCode?: number;
}) {
  const { location } = await requireLinkedLocation(input.projectId);
  const client = createDataforseoClient(input.billingCustomer);
  const items = await client.business.myBusinessInfoLive({
    placeId: location.placeId ?? undefined,
    keyword: location.title ?? undefined,
    languageCode: input.languageCode ?? DEFAULT_PROFILE_LANGUAGE,
    locationCode: input.locationCode ?? DEFAULT_PROFILE_LOCATION_CODE,
  });

  const payload = items[0] ?? { items };
  await GbpRepository.insertProfileSnapshot({
    id: crypto.randomUUID(),
    locationId: location.id,
    payloadJson: JSON.stringify(payload),
  });
  return { captured: true, itemCount: items.length };
}

async function pollReviewsTask(
  fetchResult: (input: { taskId: string }) => Promise<
    Awaited<ReturnType<typeof fetchGoogleReviewsTaskResult>>
  >,
  taskId: string,
) {
  for (let attempt = 0; attempt < REVIEWS_TASK_POLL_ATTEMPTS; attempt++) {
    const outcome = await fetchResult({ taskId });
    if (outcome.status === "completed") {
      return outcome.items;
    }
    if (outcome.status === "failed") {
      throw new AppError("INTERNAL_ERROR", outcome.message);
    }
    await sleep(REVIEWS_TASK_POLL_DELAY_MS);
  }
  throw new AppError(
    "UPSTREAM_UNAVAILABLE",
    "Google reviews task did not complete in time.",
  );
}

async function syncReviews(input: {
  projectId: string;
  billingCustomer: BillingCustomerContext;
  languageCode?: string;
  locationCode?: number;
  depth?: number;
  extended?: boolean;
}) {
  const { location } = await requireLinkedLocation(input.projectId);
  const client = createDataforseoClient(input.billingCustomer);
  const taskInput = {
    placeId: location.placeId ?? undefined,
    keyword: location.title ?? undefined,
    languageCode: input.languageCode ?? DEFAULT_PROFILE_LANGUAGE,
    locationCode: input.locationCode ?? DEFAULT_PROFILE_LOCATION_CODE,
    depth: input.depth ?? DEFAULT_REVIEW_DEPTH,
    sortBy: "newest" as const,
  };

  const posted = input.extended
    ? await client.business.extendedReviewsTaskPost({ tasks: [taskInput] })
    : await client.business.reviewsTaskPost({ tasks: [taskInput] });

  const taskId = posted[0]?.taskId;
  if (!taskId) {
    throw new AppError("INTERNAL_ERROR", "DataForSEO did not return a review task id");
  }

  const items = await pollReviewsTask(
    input.extended
      ? fetchExtendedReviewsTaskResult
      : fetchGoogleReviewsTaskResult,
    taskId,
  );

  const rows = items
    .map((item) => {
      const reviewId = reviewIdFromPayload(item);
      if (!reviewId) return null;
      return {
        id: crypto.randomUUID(),
        locationId: location.id,
        reviewId,
        payloadJson: JSON.stringify(item),
        reviewTimestamp: reviewTimestampFromPayload(item),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  await GbpRepository.upsertReviewSnapshots(rows);
  return { synced: rows.length };
}

async function syncPerformance(input: {
  projectId: string;
  days?: number;
}) {
  const { connection, location } = await requireLinkedLocation(input.projectId);
  const accountId = await resolveGbpAccountId({
    userId: connection.connectedByUserId,
    connectedAccountEmail: connection.connectedAccountEmail,
  });
  const client = createGbpClient({
    userId: connection.connectedByUserId,
    gbpAccountId: accountId,
  });

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - (input.days ?? 30) + 1);

  const points = await client.fetchPerformanceMetrics({
    googleLocationName: location.googleLocationName,
    startDate: formatDateParts(startDate),
    endDate: formatDateParts(endDate),
  });

  await GbpRepository.upsertPerformanceSnapshots(
    points.map((point) => ({
      id: crypto.randomUUID(),
      locationId: location.id,
      metricDate: point.metricDate,
      metricType: point.metricType,
      value: point.value,
    })),
  );

  return { synced: points.length };
}

async function getDashboardData(projectId: string) {
  const [connection, location] = await Promise.all([
    GbpRepository.getConnectionByProjectId(projectId),
    GbpRepository.getLocationByProjectId(projectId),
  ]);

  const emptyDashboard = {
    connected: Boolean(connection),
    locationLinked: Boolean(location),
    connection: connection
      ? {
          connectedByEmail: connection.connectedAccountEmail,
          connectedAt: connection.createdAt,
        }
      : null,
    location: null as {
      id: string;
      googleLocationName: string;
      title: string | null;
      placeId: string | null;
    } | null,
    profile: null as {
      capturedAt: string;
      payloadJson: string;
    } | null,
    reviews: [] as Array<{
      reviewId: string;
      reviewTimestamp: string | null;
      capturedAt: string;
      payloadJson: string;
    }>,
    performance: [] as Array<{
      metricDate: string;
      metricType: string;
      value: number;
      capturedAt: string;
    }>,
  };

  if (!connection || !location) {
    return emptyDashboard;
  }

  const [profile, reviews, performance] = await Promise.all([
    GbpRepository.getLatestProfileSnapshot(location.id),
    GbpRepository.getReviewSnapshots(location.id, 25),
    GbpRepository.getPerformanceSnapshots(location.id),
  ]);

  return {
    ...emptyDashboard,
    connected: true,
    locationLinked: true,
    connection: {
      connectedByEmail: connection.connectedAccountEmail,
      connectedAt: connection.createdAt,
    },
    location: {
      id: location.id,
      googleLocationName: location.googleLocationName,
      title: location.title,
      placeId: location.placeId,
    },
    profile: profile
      ? {
          capturedAt: profile.capturedAt,
          payloadJson: profile.payloadJson,
        }
      : null,
    reviews: reviews.map((review) => ({
      reviewId: review.reviewId,
      reviewTimestamp: review.reviewTimestamp,
      capturedAt: review.capturedAt,
      payloadJson: review.payloadJson,
    })),
    performance: performance.map((row) => ({
      metricDate: row.metricDate,
      metricType: row.metricType,
      value: row.value,
      capturedAt: row.capturedAt,
    })),
  };
}

export const GbpService = {
  getConnection,
  userHasGrant,
  ensureConnection,
  listLocationsForUser,
  linkLocation,
  disconnect,
  syncProfile,
  syncReviews,
  syncPerformance,
  getDashboardData,
};
