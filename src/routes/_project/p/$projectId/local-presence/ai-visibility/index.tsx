import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  createLocalAiMonitor,
  getLocalAiMonitors,
  triggerLocalAiScan,
} from "@/serverFunctions/local-ai-monitor";

export const Route = createFileRoute(
  "/_project/p/$projectId/local-presence/ai-visibility/",
)({
  component: AiVisibilityPage,
});

function AiVisibilityPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [domain, setDomain] = useState("");
  const [keywords, setKeywords] = useState("");

  const { data: monitors = [] } = useQuery({
    queryKey: ["localAiMonitors", projectId],
    queryFn: () => getLocalAiMonitors({ data: {} }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createLocalAiMonitor({
        data: {
          name,
          targetBusinessName: businessName,
          targetDomain: domain || undefined,
          keywords: keywords
            .split("\n")
            .map((k) => k.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: () => {
      toast.success("Monitor created");
      void queryClient.invalidateQueries({
        queryKey: ["localAiMonitors", projectId],
      });
    },
    onError: (err) => toast.error(getStandardErrorMessage(err)),
  });

  const scanMutation = useMutation({
    mutationFn: (configId: string) =>
      triggerLocalAiScan({ data: { configId } }),
    onSuccess: () => toast.success("AI visibility scan started"),
    onError: (err) => toast.error(getStandardErrorMessage(err)),
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold">AI Visibility Monitor</h1>
      <p className="text-sm text-base-content/60">
        Track how often ChatGPT, Claude, Gemini, and Perplexity mention your
        client for local keywords.
      </p>

      <div className="card bg-base-200/40">
        <div className="card-body gap-3">
          <input
            className="input input-bordered input-sm"
            placeholder="Monitor name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input input-bordered input-sm"
            placeholder="Target business name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
          <input
            className="input input-bordered input-sm"
            placeholder="Domain (optional)"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
          <textarea
            className="textarea textarea-bordered textarea-sm"
            placeholder="Local keywords (one per line)"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm w-fit"
            onClick={() => createMutation.mutate()}
          >
            Create monitor
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {monitors.map((monitor) => (
          <div key={monitor.id} className="card border border-base-300">
            <div className="card-body flex-row items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">{monitor.name}</h3>
                <p className="text-xs text-base-content/60">
                  {monitor.targetBusinessName}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => scanMutation.mutate(monitor.id)}
              >
                Run scan
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
