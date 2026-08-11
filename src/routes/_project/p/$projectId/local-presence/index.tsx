import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  getGbpConnection,
  getGbpDashboard,
  syncGbpPerformance,
  syncGbpProfile,
  syncGbpReviews,
} from "@/serverFunctions/gbp";

export const Route = createFileRoute(
  "/_project/p/$projectId/local-presence/",
)({
  component: LocalPresencePage,
});

function parseReviewPayload(payloadJson: string) {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    return {
      author:
        typeof parsed.profile_name === "string"
          ? parsed.profile_name
          : typeof parsed.author === "string"
            ? parsed.author
            : "Reviewer",
      text:
        typeof parsed.review_text === "string"
          ? parsed.review_text
          : typeof parsed.text === "string"
            ? parsed.text
            : "",
      rating:
        typeof parsed.rating === "number"
          ? parsed.rating
          : typeof parsed.rating_value === "number"
            ? parsed.rating_value
            : null,
    };
  } catch {
    return { author: "Reviewer", text: "", rating: null };
  }
}

function sumPerformance(
  rows: Array<{ metricType: string; value: number }>,
  metricType: string,
) {
  return rows
    .filter((row) => row.metricType === metricType)
    .reduce((sum, row) => sum + row.value, 0);
}

function LocalPresencePage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  const { data: connection } = useQuery({
    queryKey: ["gbpConnection", projectId],
    queryFn: () => getGbpConnection({ data: { projectId } }),
  });

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["gbpDashboard", projectId],
    queryFn: () => getGbpDashboard({ data: { projectId } }),
    enabled: Boolean(connection?.locationLinked),
  });

  const syncMutation = useMutation({
    mutationFn: async (action: "profile" | "reviews" | "performance") => {
      const payload = { projectId };
      if (action === "profile") return syncGbpProfile({ data: payload });
      if (action === "reviews") return syncGbpReviews({ data: payload });
      return syncGbpPerformance({ data: payload });
    },
    onSuccess: () => {
      toast.success("Sync complete");
      void queryClient.invalidateQueries({ queryKey: ["gbpDashboard", projectId] });
    },
    onError: (err) => toast.error(getStandardErrorMessage(err)),
  });

  const profilePayload = dashboard?.profile?.payloadJson
    ? (JSON.parse(dashboard.profile.payloadJson) as Record<string, unknown>)
    : null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Local Presence</h1>
          <p className="text-sm text-base-content/60">
            Read-only GBP analytics, reviews, and performance trends.
          </p>
        </div>
        <Link
          to="/p/$projectId/local-presence/ai-visibility"
          params={{ projectId }}
          className="btn btn-ghost btn-sm"
        >
          AI visibility
        </Link>
      </div>

      {!connection?.locationLinked ? (
        <div className="alert">
          <span>
            Link a Google Business Profile location to this project to view
            local presence analytics.
          </span>
        </div>
      ) : isLoading ? (
        <span className="loading loading-spinner" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card bg-base-200/40">
            <div className="card-body">
              <h2 className="card-title text-base">Profile</h2>
              <p className="text-sm">{dashboard?.location?.title ?? "—"}</p>
              <p className="text-sm text-base-content/70">
                Rating:{" "}
                {typeof profilePayload?.rating === "number"
                  ? profilePayload.rating
                  : "—"}
              </p>
              <button
                type="button"
                className="btn btn-outline btn-sm w-fit"
                onClick={() => syncMutation.mutate("profile")}
              >
                Refresh profile
              </button>
            </div>
          </div>

          <div className="card bg-base-200/40">
            <div className="card-body">
              <h2 className="card-title text-base">Performance (30 days)</h2>
              <ul className="text-sm">
                <li>
                  Views:{" "}
                  {sumPerformance(dashboard?.performance ?? [], "BUSINESS_IMPRESSIONS")}
                </li>
                <li>
                  Calls:{" "}
                  {sumPerformance(dashboard?.performance ?? [], "CALL_CLICKS")}
                </li>
                <li>
                  Directions:{" "}
                  {sumPerformance(
                    dashboard?.performance ?? [],
                    "BUSINESS_DIRECTION_REQUESTS",
                  )}
                </li>
                <li>
                  Website clicks:{" "}
                  {sumPerformance(dashboard?.performance ?? [], "WEBSITE_CLICKS")}
                </li>
              </ul>
              <button
                type="button"
                className="btn btn-outline btn-sm w-fit"
                onClick={() => syncMutation.mutate("performance")}
              >
                Sync performance
              </button>
            </div>
          </div>

          <div className="card bg-base-200/40 lg:col-span-2">
            <div className="card-body">
              <h2 className="card-title text-base">Recent reviews</h2>
              <button
                type="button"
                className="btn btn-outline btn-sm mb-3 w-fit"
                onClick={() => syncMutation.mutate("reviews")}
              >
                Sync reviews
              </button>
              <div className="space-y-2">
                {(dashboard?.reviews ?? []).slice(0, 5).map((review) => {
                  const parsed = parseReviewPayload(review.payloadJson);
                  return (
                    <div
                      key={review.reviewId}
                      className="rounded-lg border p-3 text-sm"
                    >
                      <p className="font-medium">{parsed.author}</p>
                      <p className="text-base-content/80">{parsed.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
