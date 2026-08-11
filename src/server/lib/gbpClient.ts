import { getAuth } from "@/lib/auth";
import { GBP_OAUTH_PROVIDER_ID } from "@/shared/gsc";

const GBP_ACCOUNT_API_BASE =
  "https://mybusinessaccountmanagement.googleapis.com/v1";
const GBP_BUSINESS_INFO_API_BASE =
  "https://mybusinessbusinessinformation.googleapis.com/v1";
const GBP_PERFORMANCE_API_BASE =
  "https://businessprofileperformance.googleapis.com/v1";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export class GbpApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "GbpApiError";
  }
}

export class GbpTokenError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GbpTokenError";
  }
}

export type GbpAccount = {
  name: string;
  accountName: string;
  type?: string;
};

export type GbpLocation = {
  name: string;
  title?: string;
  storefrontAddress?: Record<string, unknown>;
  metadata?: {
    placeId?: string;
    mapsUri?: string;
  };
};

export const GBP_DAILY_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_DIRECTION_REQUESTS",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
] as const;

export type GbpDailyMetric = (typeof GBP_DAILY_METRICS)[number];

export type GbpPerformancePoint = {
  metricDate: string;
  metricType: GbpDailyMetric;
  value: number;
};

function messageForStatus(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return "Google Business Profile denied access (permission missing or connection revoked).";
  }
  if (status === 429) {
    return "Google Business Profile rate limit reached. Retry shortly.";
  }
  if (status === 404) {
    return "Google Business Profile location not found.";
  }
  return `Google Business Profile API error (${status}): ${body.slice(0, 300)}`;
}

/** Extract `locations/{id}` from a full resource name. */
export function toPerformanceLocationName(googleLocationName: string): string {
  const match = googleLocationName.match(/(locations\/[^/]+)$/);
  return match?.[1] ?? googleLocationName;
}

export function createGbpClient(opts: {
  userId: string;
  gbpAccountId?: string;
}) {
  async function getToken(): Promise<string> {
    let result: { accessToken?: string } | undefined;
    try {
      result = await getAuth().api.getAccessToken({
        body: {
          providerId: GBP_OAUTH_PROVIDER_ID,
          userId: opts.userId,
          ...(opts.gbpAccountId ? { accountId: opts.gbpAccountId } : {}),
        },
      });
    } catch (error) {
      throw new GbpTokenError(
        "Could not mint a Google Business Profile access token (grant revoked or expired).",
        error,
      );
    }
    if (!result?.accessToken) {
      throw new GbpTokenError(
        "Google Business Profile returned no access token (grant revoked or expired).",
      );
    }
    return result.accessToken;
  }

  async function request<T>(
    url: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> {
    const token = await getToken();
    const hasBody = init?.body !== undefined;
    const response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      body: hasBody ? JSON.stringify(init?.body) : undefined,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new GbpApiError(
        response.status,
        messageForStatus(response.status, body),
        body,
      );
    }
    return (await response.json()) as T;
  }

  return {
    async getUserInfoEmail(): Promise<string | null> {
      const data = await request<{ email?: unknown }>(GOOGLE_USERINFO_URL);
      return typeof data.email === "string" ? data.email : null;
    },

    async listAccounts(): Promise<GbpAccount[]> {
      const data = await request<{ accounts?: GbpAccount[] }>(
        `${GBP_ACCOUNT_API_BASE}/accounts`,
      );
      return data.accounts ?? [];
    },

    async listLocations(accountName: string): Promise<GbpLocation[]> {
      const locations: GbpLocation[] = [];
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          readMask: "name,title,storefrontAddress,metadata",
          pageSize: "100",
        });
        if (pageToken) params.set("pageToken", pageToken);
        const data = await request<{
          locations?: GbpLocation[];
          nextPageToken?: string;
        }>(
          `${GBP_BUSINESS_INFO_API_BASE}/${accountName}/locations?${params.toString()}`,
        );
        locations.push(...(data.locations ?? []));
        pageToken = data.nextPageToken;
      } while (pageToken);
      return locations;
    },

    async fetchPerformanceMetrics(input: {
      googleLocationName: string;
      startDate: { year: number; month: number; day: number };
      endDate: { year: number; month: number; day: number };
      metrics?: readonly GbpDailyMetric[];
    }): Promise<GbpPerformancePoint[]> {
      const location = toPerformanceLocationName(input.googleLocationName);
      const metrics = input.metrics ?? GBP_DAILY_METRICS;
      const params = new URLSearchParams();
      for (const metric of metrics) {
        params.append("dailyMetrics", metric);
      }
      params.set(
        "dailyRange.startDate.year",
        String(input.startDate.year),
      );
      params.set(
        "dailyRange.startDate.month",
        String(input.startDate.month),
      );
      params.set("dailyRange.startDate.day", String(input.startDate.day));
      params.set("dailyRange.endDate.year", String(input.endDate.year));
      params.set("dailyRange.endDate.month", String(input.endDate.month));
      params.set("dailyRange.endDate.day", String(input.endDate.day));

      const data = await request<{
        multiDailyMetricTimeSeries?: Array<{
          dailyMetricTimeSeries?: Array<{
            dailyMetric?: string;
            timeSeries?: {
              datedValues?: Array<{
                date?: { year?: number; month?: number; day?: number };
                value?: string;
              }>;
            };
          }>;
        }>;
      }>(
        `${GBP_PERFORMANCE_API_BASE}/${location}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`,
      );

      const points: GbpPerformancePoint[] = [];
      for (const group of data.multiDailyMetricTimeSeries ?? []) {
        for (const series of group.dailyMetricTimeSeries ?? []) {
          const metricType = series.dailyMetric;
          if (!metricType) continue;
          for (const dated of series.timeSeries?.datedValues ?? []) {
            const date = dated.date;
            if (!date?.year || !date.month || !date.day) continue;
            const metricDate = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
            points.push({
              metricDate,
              metricType: metricType as GbpDailyMetric,
              value: Number(dated.value ?? 0),
            });
          }
        }
      }
      return points;
    },
  };
}
