import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  gbpConnections,
  gbpLocations,
  gbpPerformanceSnapshots,
  gbpProfileSnapshots,
  gbpReviewSnapshots,
  localMapCampaigns,
  localMapScanRuns,
  projects,
} from "@/db/schema";
import { BrandingService } from "@/server/features/branding/services/BrandingService";
import { LocalMapRankRepository } from "@/server/features/local-map-rank/repositories/LocalMapRankRepository";
import { AppError } from "@/server/lib/errors";

export type GridRankCampaignReport = {
  id: string;
  name: string;
  gridSize: number;
  radiusKm: number;
  lastCheckedAt: string | null;
  latestRun: {
    id: string;
    status: string;
    completedAt: string | null;
    pinsTotal: number;
    pinsCompleted: number;
  } | null;
  summary: {
    keywordCount: number;
    averageRank: number | null;
    top3Pct: number | null;
    top10Pct: number | null;
    rankedPinsPct: number | null;
  };
  keywords: Array<{
    keyword: string;
    averageRank: number | null;
    top3Pct: number | null;
    top10Pct: number | null;
    pins: Array<{
      pinIndex: number;
      latitude: number;
      longitude: number;
      rankAbsolute: number | null;
      matchedTitle: string | null;
    }>;
  }>;
};

export type LocalPresenceReport = {
  connected: boolean;
  location: {
    id: string;
    title: string | null;
    placeId: string | null;
    googleLocationName: string;
  } | null;
  profile: {
    title: string | null;
    phone: string | null;
    website: string | null;
    address: string | null;
    categories: string[];
  } | null;
  performance: Array<{
    metricType: string;
    total: number;
    latestDate: string | null;
  }>;
  reviews: {
    count: number;
    averageRating: number | null;
    latestReviewAt: string | null;
  };
};

export type LocalReportData = {
  generatedAt: string;
  project: {
    id: string;
    name: string;
    domain: string | null;
  };
  branding: Awaited<ReturnType<typeof BrandingService.getBranding>>;
  gridRank: {
    campaigns: GridRankCampaignReport[];
  };
  localPresence: LocalPresenceReport;
};

function summarizeGridResults(
  results: Awaited<ReturnType<typeof LocalMapRankRepository.getResultsForRun>>,
) {
  const byKeyword = new Map<
    string,
    {
      keyword: string;
      ranks: number[];
      pins: GridRankCampaignReport["keywords"][number]["pins"];
    }
  >();

  for (const row of results) {
    const bucket = byKeyword.get(row.keywordId) ?? {
      keyword: row.keyword,
      ranks: [],
      pins: [],
    };
    if (row.rankAbsolute != null) bucket.ranks.push(row.rankAbsolute);
    bucket.pins.push({
      pinIndex: row.pinIndex,
      latitude: row.latitude,
      longitude: row.longitude,
      rankAbsolute: row.rankAbsolute,
      matchedTitle: row.matchedTitle,
    });
    byKeyword.set(row.keywordId, bucket);
  }

  const keywords = [...byKeyword.values()].map((entry) => {
    const totalPins = entry.pins.length;
    const ranked = entry.ranks.length;
    const top3 = entry.ranks.filter((rank) => rank <= 3).length;
    const top10 = entry.ranks.filter((rank) => rank <= 10).length;
    return {
      keyword: entry.keyword,
      averageRank:
        ranked > 0
          ? Math.round(
              (entry.ranks.reduce((sum, rank) => sum + rank, 0) / ranked) * 10,
            ) / 10
          : null,
      top3Pct: totalPins > 0 ? Math.round((top3 / totalPins) * 100) : null,
      top10Pct: totalPins > 0 ? Math.round((top10 / totalPins) * 100) : null,
      pins: entry.pins,
    };
  });

  const allRanks = results
    .map((row) => row.rankAbsolute)
    .filter((rank): rank is number => rank != null);
  const totalPins = results.length;
  const rankedPins = allRanks.length;

  return {
    keywords,
    summary: {
      keywordCount: keywords.length,
      averageRank:
        rankedPins > 0
          ? Math.round(
              (allRanks.reduce((sum, rank) => sum + rank, 0) / rankedPins) * 10,
            ) / 10
          : null,
      top3Pct:
        totalPins > 0
          ? Math.round(
              (allRanks.filter((rank) => rank <= 3).length / totalPins) * 100,
            )
          : null,
      top10Pct:
        totalPins > 0
          ? Math.round(
              (allRanks.filter((rank) => rank <= 10).length / totalPins) * 100,
            )
          : null,
      rankedPinsPct:
        totalPins > 0 ? Math.round((rankedPins / totalPins) * 100) : null,
    },
  };
}

async function buildGridRankCampaignReport(campaign: {
  id: string;
  name: string;
  gridSize: number;
  radiusKm: number;
  lastCheckedAt: string | null;
}) {
  const latestRun = await LocalMapRankRepository.getLatestRunForCampaign(
    campaign.id,
  );
  const completedRun =
    latestRun?.status === "completed"
      ? latestRun
      : (
          await db
            .select()
            .from(localMapScanRuns)
            .where(
              and(
                eq(localMapScanRuns.campaignId, campaign.id),
                eq(localMapScanRuns.status, "completed"),
              ),
            )
            .orderBy(desc(localMapScanRuns.completedAt))
            .limit(1)
        )[0] ?? null;

  const results = completedRun
    ? await LocalMapRankRepository.getResultsForRun(completedRun.id)
    : [];
  const shaped = summarizeGridResults(results);

  return {
    id: campaign.id,
    name: campaign.name,
    gridSize: campaign.gridSize,
    radiusKm: campaign.radiusKm,
    lastCheckedAt: campaign.lastCheckedAt,
    latestRun: completedRun
      ? {
          id: completedRun.id,
          status: completedRun.status,
          completedAt: completedRun.completedAt,
          pinsTotal: completedRun.pinsTotal,
          pinsCompleted: completedRun.pinsCompleted,
        }
      : null,
    summary: shaped.summary,
    keywords: shaped.keywords,
  } satisfies GridRankCampaignReport;
}

async function getLocalPresenceReport(projectId: string): Promise<LocalPresenceReport> {
  const [connection] = await db
    .select()
    .from(gbpConnections)
    .where(eq(gbpConnections.projectId, projectId))
    .limit(1);

  if (!connection) {
    return {
      connected: false,
      location: null,
      profile: null,
      performance: [],
      reviews: { count: 0, averageRating: null, latestReviewAt: null },
    };
  }

  const [location] = await db
    .select()
    .from(gbpLocations)
    .where(eq(gbpLocations.projectId, projectId))
    .limit(1);

  if (!location) {
    return {
      connected: true,
      location: null,
      profile: null,
      performance: [],
      reviews: { count: 0, averageRating: null, latestReviewAt: null },
    };
  }

  const [profileRow] = await db
    .select()
    .from(gbpProfileSnapshots)
    .where(eq(gbpProfileSnapshots.locationId, location.id))
    .orderBy(desc(gbpProfileSnapshots.capturedAt))
    .limit(1);

  const performanceRows = await db
    .select()
    .from(gbpPerformanceSnapshots)
    .where(eq(gbpPerformanceSnapshots.locationId, location.id));

  const performanceByType = new Map<
    string,
    { total: number; latestDate: string | null }
  >();
  for (const row of performanceRows) {
    const existing = performanceByType.get(row.metricType) ?? {
      total: 0,
      latestDate: null,
    };
    existing.total += row.value;
    if (!existing.latestDate || row.metricDate > existing.latestDate) {
      existing.latestDate = row.metricDate;
    }
    performanceByType.set(row.metricType, existing);
  }

  const reviewRows = await db
    .select()
    .from(gbpReviewSnapshots)
    .where(eq(gbpReviewSnapshots.locationId, location.id));

  const ratings: number[] = [];
  let latestReviewAt: string | null = null;
  for (const row of reviewRows) {
    if (row.reviewTimestamp && (!latestReviewAt || row.reviewTimestamp > latestReviewAt)) {
      latestReviewAt = row.reviewTimestamp;
    }
    try {
      const payload = JSON.parse(row.payloadJson) as {
        starRating?: string | number;
        rating?: number;
      };
      const raw =
        typeof payload.rating === "number"
          ? payload.rating
          : payload.starRating != null
            ? Number(payload.starRating)
            : null;
      if (raw != null && Number.isFinite(raw)) ratings.push(raw);
    } catch {
      // Ignore malformed review payloads.
    }
  }

  let profile: LocalPresenceReport["profile"] = null;
  if (profileRow?.payloadJson) {
    try {
      const payload = JSON.parse(profileRow.payloadJson) as {
        title?: string;
        phoneNumbers?: { primaryPhone?: string };
        websiteUri?: string;
        storefrontAddress?: {
          addressLines?: string[];
          locality?: string;
          administrativeArea?: string;
          postalCode?: string;
        };
        categories?: { displayName?: string }[];
      };
      const addressParts = [
        ...(payload.storefrontAddress?.addressLines ?? []),
        payload.storefrontAddress?.locality,
        payload.storefrontAddress?.administrativeArea,
        payload.storefrontAddress?.postalCode,
      ].filter(Boolean);
      profile = {
        title: payload.title ?? location.title,
        phone: payload.phoneNumbers?.primaryPhone ?? null,
        website: payload.websiteUri ?? null,
        address: addressParts.length > 0 ? addressParts.join(", ") : null,
        categories: (payload.categories ?? [])
          .map((category) => category.displayName)
          .filter((name): name is string => Boolean(name)),
      };
    } catch {
      profile = null;
    }
  }

  return {
    connected: true,
    location: {
      id: location.id,
      title: location.title,
      placeId: location.placeId,
      googleLocationName: location.googleLocationName,
    },
    profile,
    performance: [...performanceByType.entries()].map(([metricType, value]) => ({
      metricType,
      total: value.total,
      latestDate: value.latestDate,
    })),
    reviews: {
      count: reviewRows.length,
      averageRating:
        ratings.length > 0
          ? Math.round(
              (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) *
                10,
            ) / 10
          : null,
      latestReviewAt,
    },
  };
}

export async function getLocalReportData(input: {
  projectId: string;
  organizationId: string;
  campaignId?: string;
}): Promise<LocalReportData> {
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      domain: projects.domain,
    })
    .from(projects)
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.organizationId, input.organizationId),
        isNull(projects.archivedAt),
      ),
    )
    .limit(1);

  if (!project) {
    throw new AppError("NOT_FOUND", "Project not found");
  }

  const campaigns = input.campaignId
    ? await db
        .select()
        .from(localMapCampaigns)
        .where(
          and(
            eq(localMapCampaigns.projectId, input.projectId),
            eq(localMapCampaigns.id, input.campaignId),
            eq(localMapCampaigns.isActive, true),
          ),
        )
    : await LocalMapRankRepository.getCampaignsForProject(input.projectId);

  const [branding, campaignReports, localPresence] = await Promise.all([
    BrandingService.getBranding(input.organizationId),
    Promise.all(campaigns.map((campaign) => buildGridRankCampaignReport(campaign))),
    getLocalPresenceReport(input.projectId),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    project,
    branding,
    gridRank: { campaigns: campaignReports },
    localPresence,
  };
}

export async function getGridRankReportData(input: {
  projectId: string;
  organizationId: string;
  campaignId?: string;
}) {
  const report = await getLocalReportData(input);
  return {
    generatedAt: report.generatedAt,
    project: report.project,
    branding: report.branding,
    gridRank: report.gridRank,
  };
}

export async function getLocalPresenceReportData(input: {
  projectId: string;
  organizationId: string;
}) {
  const report = await getLocalReportData({
    projectId: input.projectId,
    organizationId: input.organizationId,
  });
  return {
    generatedAt: report.generatedAt,
    project: report.project,
    branding: report.branding,
    localPresence: report.localPresence,
  };
}
