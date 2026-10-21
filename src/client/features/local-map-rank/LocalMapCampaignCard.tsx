import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { reverse, sortBy } from "remeda";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  estimateLocalMapScanCostFn,
  getLocalMapCampaignDetail,
  getLocalMapRunResults,
  triggerLocalMapScan,
} from "@/serverFunctions/local-map-rank";

function rankClass(rank: number | null | undefined): string {
  if (rank == null) return "bg-muted";
  if (rank <= 3) return "bg-emerald-500";
  if (rank <= 10) return "bg-amber-400";
  if (rank <= 20) return "bg-orange-500";
  return "bg-destructive/70";
}

function formatRank(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(1);
}

export function LocalMapCampaignCard({
  projectId,
  campaign,
}: {
  projectId: string;
  campaign: {
    id: string;
    name: string;
    gridSize: number;
    radiusKm: number;
    scheduleInterval: string;
    lastCheckedAt: string | null;
  };
}) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["localMapCampaign", projectId, campaign.id],
    queryFn: () =>
      getLocalMapCampaignDetail({
        data: { projectId, campaignId: campaign.id },
      }),
  });
  const estimate = useQuery({
    queryKey: ["localMapEstimate", projectId, campaign.id],
    queryFn: () =>
      estimateLocalMapScanCostFn({
        data: { projectId, campaignId: campaign.id },
      }),
  });

  const runs = detail.data?.runs ?? [];
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const activeRunId = selectedRunId ?? detail.data?.latestRun?.id ?? null;
  const [keyword, setKeyword] = useState<string | null>(null);

  const results = useQuery({
    queryKey: ["localMapRunResults", projectId, activeRunId],
    enabled: activeRunId != null,
    queryFn: () => {
      if (!activeRunId) return [];
      return getLocalMapRunResults({
        data: { projectId, runId: activeRunId },
      });
    },
    refetchInterval:
      detail.data?.latestRun?.id === activeRunId &&
      (detail.data.latestRun.status === "running" ||
        detail.data.latestRun.status === "pending")
        ? 5000
        : false,
  });

  const keywords = useMemo(() => {
    const names = new Set((results.data ?? []).map((row) => row.keyword));
    return [...names];
  }, [results.data]);
  const activeKeyword = keyword ?? keywords[0] ?? null;
  const cells = (results.data ?? []).filter(
    (row) => row.keyword === activeKeyword,
  );

  const history = useMemo(() => {
    const rows = detail.data?.history ?? [];
    const byKeyword = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byKeyword.get(row.keyword) ?? [];
      list.push(row);
      byKeyword.set(row.keyword, list);
    }
    return [...byKeyword.entries()].flatMap(([name, list]) => {
      const ordered = sortBy(list, (row) => row.completedAt ?? row.createdAt);
      return ordered.map((row, index) => {
        const previous = ordered[index - 1];
        const delta =
          previous?.averageRank != null && row.averageRank != null
            ? row.averageRank - previous.averageRank
            : null;
        return { ...row, keyword: name, delta };
      });
    });
  }, [detail.data?.history]);

  const scanMutation = useMutation({
    mutationFn: () =>
      triggerLocalMapScan({ data: { projectId, campaignId: campaign.id } }),
    onSuccess: (result) => {
      if (result.ok) toast.success("Scan started");
      else toast.error("A scan is already running for this grid");
      void queryClient.invalidateQueries({
        queryKey: ["localMapCampaign", projectId, campaign.id],
      });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  return (
    <section className="space-y-4 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{campaign.name}</h3>
          <p className="text-sm text-muted-foreground">
            {campaign.gridSize}×{campaign.gridSize} · {campaign.radiusKm} km ·{" "}
            {campaign.scheduleInterval}
            {campaign.lastCheckedAt
              ? ` · Last scan ${new Date(campaign.lastCheckedAt).toLocaleString()}`
              : ""}
            {estimate.data
              ? ` · About $${estimate.data.costUsd.toFixed(2)} per scan`
              : ""}
          </p>
        </div>
        <Button
          size="sm"
          pending={scanMutation.isPending}
          onClick={() => scanMutation.mutate()}
        >
          Run scan
        </Button>
      </div>

      {keywords.length > 1 && (
        <select
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          value={activeKeyword ?? ""}
          onChange={(event) => setKeyword(event.target.value)}
        >
          {keywords.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )}

      {cells.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            Heatmap — {activeKeyword}. Darker green is a better rank. Empty
            cells were not in the results.
          </p>
          <div
            className="grid max-w-md gap-1"
            style={{
              gridTemplateColumns: `repeat(${campaign.gridSize}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: campaign.gridSize ** 2 }, (_, pinIndex) => {
              const cell = cells.find((row) => row.pinIndex === pinIndex);
              return (
                <div
                  key={pinIndex}
                  title={
                    cell?.rankAbsolute != null
                      ? `Rank ${cell.rankAbsolute}`
                      : "Not ranked"
                  }
                  className={`aspect-square rounded-sm ${rankClass(cell?.rankAbsolute)}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Scan</th>
                <th className="py-1 pr-3 font-medium">Keyword</th>
                <th className="py-1 pr-3 font-medium">Avg rank</th>
                <th className="py-1 pr-3 font-medium">Pins ranked</th>
                <th className="py-1 font-medium">Vs previous</th>
              </tr>
            </thead>
            <tbody>
              {reverse(history).map((row) => (
                <tr key={`${row.runId}-${row.keyword}`} className="border-t">
                  <td className="py-1.5 pr-3">
                    <button
                      type="button"
                      className="underline-offset-2 hover:underline"
                      onClick={() => setSelectedRunId(row.runId)}
                    >
                      {new Date(
                        row.completedAt ?? row.createdAt,
                      ).toLocaleString()}
                    </button>
                  </td>
                  <td className="py-1.5 pr-3">{row.keyword}</td>
                  <td className="py-1.5 pr-3">{formatRank(row.averageRank)}</td>
                  <td className="py-1.5 pr-3">
                    {row.rankedPins}/{row.pins}
                  </td>
                  <td className="py-1.5">
                    {row.delta == null
                      ? "—"
                      : row.delta < -0.05
                        ? `Improved ${Math.abs(row.delta).toFixed(1)}`
                        : row.delta > 0.05
                          ? `Dropped ${row.delta.toFixed(1)}`
                          : "No change"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {runs.length > 0 && cells.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportCsv(campaign.name, results.data ?? [])}
        >
          Export this scan
        </Button>
      )}
    </section>
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
      (row) =>
        `${JSON.stringify(row.keyword)},${row.pinIndex},${row.latitude},${row.longitude},${row.rankAbsolute ?? ""},${JSON.stringify(row.matchedTitle ?? "")},${row.checkedAt}`,
    )
    .join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${campaignName.replace(/\s+/g, "-").toLowerCase()}-grid-rank.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
