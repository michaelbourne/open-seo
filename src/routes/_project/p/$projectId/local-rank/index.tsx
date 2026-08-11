import { createFileRoute } from "@tanstack/react-router";
import { LocalMapRankOverview } from "@/client/features/local-map-rank/LocalMapRankOverview";

export const Route = createFileRoute("/_project/p/$projectId/local-rank/")({
  component: LocalRankPage,
});

function LocalRankPage() {
  const { projectId } = Route.useParams();
  return <LocalMapRankOverview projectId={projectId} />;
}
