import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { getProjectLocalReportPrintData } from "@/serverFunctions/reports";

export const Route = createFileRoute("/_project/p/$projectId/reports/print")({
  validateSearch: (search: Record<string, unknown>) => ({
    campaignId:
      typeof search.campaignId === "string" ? search.campaignId : undefined,
  }),
  component: ReportPrintPage,
});

function ReportPrintPage() {
  const { projectId } = Route.useParams();
  const { campaignId } = Route.useSearch();

  const { data, isLoading } = useQuery({
    queryKey: ["localReportPrint", projectId, campaignId],
    queryFn: () =>
      getProjectLocalReportPrintData({
        data: { projectId, campaignId },
      }),
  });

  if (isLoading || !data) {
    return <p className="p-8">Loading report…</p>;
  }

  const brand = data.branding;
  const campaign = data.gridRank.campaigns[0];
  const presence = data.localPresence;

  return (
    <div className="min-h-screen bg-white p-8 text-black print:p-12">
      <header
        className="mb-8 border-b pb-4"
        style={{ borderColor: brand.primaryColorHex }}
      >
        {brand.logoUrl ? (
          <img src={brand.logoUrl} alt="" className="mb-4 h-12 object-contain" />
        ) : null}
        <h1
          className="text-2xl font-bold"
          style={{ color: brand.primaryColorHex }}
        >
          {brand.agencyName}
        </h1>
        {brand.coverSubtitle ? (
          <p className="text-sm text-gray-600">{brand.coverSubtitle}</p>
        ) : null}
      </header>

      {campaign ? (
        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold">Maps grid rank</h2>
          <p className="text-sm text-gray-700">
            {campaign.name} · {campaign.summary.keywordCount} keywords
          </p>
          <p className="text-sm">
            Average rank: {campaign.summary.averageRank ?? "Not ranking"}
          </p>
        </section>
      ) : null}

      {presence.connected ? (
        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold">Local presence</h2>
          <p className="text-sm">{presence.location?.title ?? "—"}</p>
          <p className="text-sm">
            Reviews: {presence.reviews.count} · Rating:{" "}
            {presence.reviews.averageRating ?? "—"}
          </p>
        </section>
      ) : null}

      <footer className="mt-12 border-t pt-4 text-xs text-gray-500">
        {brand.footerText ??
          `Generated ${new Date(data.generatedAt).toLocaleString()}`}
      </footer>

      <button
        type="button"
        className="btn btn-primary mt-6 print:hidden"
        onClick={() => window.print()}
      >
        Download PDF
      </button>
    </div>
  );
}
