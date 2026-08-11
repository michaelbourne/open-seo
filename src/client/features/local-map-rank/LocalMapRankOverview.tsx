import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createLocalMapCampaign,
  estimateLocalMapScanCostFn,
  getLocalMapCampaignDetail,
  getLocalMapCampaigns,
  getLocalMapRunResults,
  triggerLocalMapScan,
} from "@/serverFunctions/local-map-rank";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

function rankColor(rank: number | null | undefined): string {
  if (rank == null) return "bg-base-300";
  if (rank <= 3) return "bg-success";
  if (rank <= 10) return "bg-warning";
  if (rank <= 20) return "bg-orange-400";
  return "bg-error/60";
}

export function LocalMapRankOverview({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["localMapCampaigns", projectId],
    queryFn: () => getLocalMapCampaigns({ data: {} }),
  });

  const form = useStateForm();

  const createMutation = useMutation({
    mutationFn: () =>
      createLocalMapCampaign({
        data: {
          name: form.name,
          centerLatitude: Number(form.lat),
          centerLongitude: Number(form.lng),
          gridSize: Number(form.gridSize) as 5 | 7 | 9,
          radiusKm: Number(form.radiusKm),
          targetPlaceId: form.placeId || undefined,
          targetCid: form.cid || undefined,
          keywords: form.keywords
            .split("\n")
            .map((k: string) => k.trim())
            .filter(Boolean),
          device: form.device,
          scheduleInterval: form.schedule,
        },
      }),
    onSuccess: () => {
      toast.success("Grid campaign created");
      void queryClient.invalidateQueries({
        queryKey: ["localMapCampaigns", projectId],
      });
      form.reset();
    },
    onError: (err) => toast.error(getStandardErrorMessage(err)),
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Maps Grid Rank</h1>
        <p className="text-sm text-base-content/60">
          Track Google Maps pack rankings across a geo-grid for each client
          location.
        </p>
      </div>

      <div className="card bg-base-200/50">
        <div className="card-body gap-3">
          <h2 className="card-title text-base">New campaign</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="input input-bordered input-sm"
              placeholder="Campaign name"
              value={form.name}
              onChange={(e) => form.setName(e.target.value)}
            />
            <input
              className="input input-bordered input-sm"
              placeholder="Target place ID"
              value={form.placeId}
              onChange={(e) => form.setPlaceId(e.target.value)}
            />
            <input
              className="input input-bordered input-sm"
              placeholder="Target CID (optional)"
              value={form.cid}
              onChange={(e) => form.setCid(e.target.value)}
            />
            <input
              className="input input-bordered input-sm"
              placeholder="Center latitude"
              value={form.lat}
              onChange={(e) => form.setLat(e.target.value)}
            />
            <input
              className="input input-bordered input-sm"
              placeholder="Center longitude"
              value={form.lng}
              onChange={(e) => form.setLng(e.target.value)}
            />
            <select
              className="select select-bordered select-sm"
              value={form.gridSize}
              onChange={(e) => form.setGridSize(e.target.value)}
            >
              <option value="5">5×5 (25 pins)</option>
              <option value="7">7×7 (49 pins)</option>
              <option value="9">9×9 (81 pins)</option>
            </select>
          </div>
          <textarea
            className="textarea textarea-bordered textarea-sm"
            placeholder="Keywords (one per line)"
            rows={4}
            value={form.keywords}
            onChange={(e) => form.setKeywords(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm w-fit"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Create campaign
          </button>
        </div>
      </div>

      {isLoading ? (
        <span className="loading loading-spinner" />
      ) : (
        <div className="grid gap-3">
          {campaigns.map((campaign) => (
            <LocalMapCampaignCard
              key={campaign.id}
              projectId={projectId}
              campaign={campaign}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LocalMapCampaignCard({
  projectId,
  campaign,
}: {
  projectId: string;
  campaign: {
    id: string;
    name: string;
    gridSize: number;
    lastCheckedAt: string | null;
  };
}) {
  const queryClient = useQueryClient();
  const { data: detail } = useQuery({
    queryKey: ["localMapCampaign", projectId, campaign.id],
    queryFn: () =>
      getLocalMapCampaignDetail({ data: { campaignId: campaign.id } }),
  });

  const scanMutation = useMutation({
    mutationFn: () =>
      triggerLocalMapScan({ data: { campaignId: campaign.id } }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Grid scan started");
      } else {
        toast.error("A scan is already running for this campaign");
      }
      void queryClient.invalidateQueries({
        queryKey: ["localMapCampaign", projectId, campaign.id],
      });
    },
    onError: (err) => toast.error(getStandardErrorMessage(err)),
  });

  const latestRunId = detail?.latestRun?.id;
  const { data: results = [] } = useQuery({
    queryKey: ["localMapRunResults", latestRunId],
    enabled: Boolean(latestRunId),
    queryFn: () =>
      getLocalMapRunResults({ data: { runId: latestRunId! } }),
    refetchInterval: detail?.latestRun?.status === "running" ? 5000 : false,
  });

  const gridSize = campaign.gridSize;
  const keyword = results[0]?.keyword;

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">{campaign.name}</h3>
            <p className="text-xs text-base-content/60">
              {gridSize}×{gridSize} grid
              {campaign.lastCheckedAt
                ? ` · Last scan ${new Date(campaign.lastCheckedAt).toLocaleString()}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={scanMutation.isPending}
            onClick={() => scanMutation.mutate()}
          >
            Run scan
          </button>
        </div>

        {keyword && results.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-base-content/70">
              Heatmap — {keyword}
            </p>
            <div
              className="grid gap-1"
              style={{
                gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: gridSize * gridSize }, (_, pinIndex) => {
                const cell = results.find((r) => r.pinIndex === pinIndex);
                return (
                  <div
                    key={pinIndex}
                    title={
                      cell?.rankAbsolute != null
                        ? `Rank ${cell.rankAbsolute}`
                        : "Not ranked"
                    }
                    className={`aspect-square rounded-sm ${rankColor(cell?.rankAbsolute)}`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {results.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-xs w-fit"
            onClick={() => exportCsv(campaign.name, results)}
          >
            Export CSV
          </button>
        )}
      </div>
    </div>
  );
}

function exportCsv(
  campaignName: string,
  rows: Array<{
    keyword: string;
    pinIndex: number;
    latitude: number;
    longitude: number;
    rankAbsolute: number | null;
    matchedTitle: string | null;
    checkedAt: string;
  }>,
) {
  const header = "keyword,pin,lat,lng,rank,matched_title,checked_at\n";
  const body = rows
    .map(
      (r) =>
        `${JSON.stringify(r.keyword)},${r.pinIndex},${r.latitude},${r.longitude},${r.rankAbsolute ?? ""},${JSON.stringify(r.matchedTitle ?? "")},${r.checkedAt}`,
    )
    .join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${campaignName.replace(/\s+/g, "-").toLowerCase()}-grid-rank.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function useStateForm() {
  const [name, setName] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [cid, setCid] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [gridSize, setGridSize] = useState("5");
  const [radiusKm] = useState("5");
  const [keywords, setKeywords] = useState("");
  const [device] = useState<"desktop" | "mobile">("desktop");
  const [schedule] = useState<"weekly" | "monthly" | "manual">("weekly");
  return {
    name,
    setName,
    placeId,
    setPlaceId,
    cid,
    setCid,
    lat,
    setLat,
    lng,
    setLng,
    gridSize,
    setGridSize,
    radiusKm,
    keywords,
    setKeywords,
    device,
    schedule,
    reset: () => {
      setName("");
      setPlaceId("");
      setCid("");
      setLat("");
      setLng("");
      setKeywords("");
    },
  };
}
