import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getOrganizationBranding,
  updateOrganizationBranding,
} from "@/serverFunctions/branding";
import {
  getOrganizationUsage,
  saveOrganizationUsageSettings,
} from "@/serverFunctions/usage";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

export function AgencySettingsPanels() {
  if (isHostedClientAuthMode()) return null;
  return (
    <>
      <UsageBudgetPanel />
      <BrandingPanel />
    </>
  );
}

function UsageBudgetPanel() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["organizationUsage"],
    queryFn: () => getOrganizationUsage(),
  });
  const [budget, setBudget] = useState("");
  const [dailyAgent, setDailyAgent] = useState("");

  const saveMutation = useMutation({
    mutationFn: () =>
      saveOrganizationUsageSettings({
        data: {
          monthlyBudgetUsd: budget.trim() ? Number(budget) : null,
          dailyAgentBudgetUsd: dailyAgent.trim() ? Number(dailyAgent) : null,
        },
      }),
    onSuccess: () => {
      toast.success("Usage settings saved");
      void queryClient.invalidateQueries({ queryKey: ["organizationUsage"] });
    },
    onError: (err) => toast.error(getStandardErrorMessage(err)),
  });

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-base-content/50">
        DataForSEO budget (self-hosted)
      </h2>
      {data?.alertTriggered && (
        <div className="alert alert-warning text-sm">
          Month-to-date spend is above your alert threshold.
        </div>
      )}
      <p className="text-sm text-base-content/60">
        Spent this month: ${data?.monthSpend?.toFixed(2) ?? "0.00"}
        {data?.budget != null ? ` / $${data.budget.toFixed(2)} cap` : ""}
      </p>
      <label className="form-control w-full max-w-xs">
        <span className="label-text text-xs">Monthly budget (USD)</span>
        <input
          className="input input-bordered input-sm"
          placeholder={data?.budget?.toString() ?? "No cap"}
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
      </label>
      <label className="form-control w-full max-w-xs">
        <span className="label-text text-xs">Daily SAM agent cap (USD)</span>
        <input
          className="input input-bordered input-sm"
          placeholder={
            data?.settings.dailyAgentBudgetUsd?.toString() ?? "No cap"
          }
          value={dailyAgent}
          onChange={(e) => setDailyAgent(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => saveMutation.mutate()}
      >
        Save budget
      </button>
    </section>
  );
}

function BrandingPanel() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["organizationBranding"],
    queryFn: () => getOrganizationBranding({ data: {} }),
  });
  const [agencyName, setAgencyName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [footerText, setFooterText] = useState("");

  const saveMutation = useMutation({
    mutationFn: () =>
      updateOrganizationBranding({
        data: {
          agencyName: agencyName || data?.agencyName || "Agency",
          logoUrl: logoUrl || null,
          primaryColorHex: primaryColor,
          footerText: footerText || null,
        },
      }),
    onSuccess: () => {
      toast.success("Branding saved");
      void queryClient.invalidateQueries({ queryKey: ["organizationBranding"] });
    },
    onError: (err) => toast.error(getStandardErrorMessage(err)),
  });

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-base-content/50">
        Report branding
      </h2>
      <input
        className="input input-bordered input-sm w-full max-w-md"
        placeholder={data?.agencyName ?? "Agency name"}
        value={agencyName}
        onChange={(e) => setAgencyName(e.target.value)}
      />
      <input
        className="input input-bordered input-sm w-full max-w-md"
        placeholder={data?.logoUrl ?? "Logo URL (HTTPS)"}
        value={logoUrl}
        onChange={(e) => setLogoUrl(e.target.value)}
      />
      <input
        className="input input-bordered input-sm w-full max-w-xs"
        placeholder="Primary color"
        value={primaryColor}
        onChange={(e) => setPrimaryColor(e.target.value)}
      />
      <textarea
        className="textarea textarea-bordered textarea-sm w-full max-w-md"
        placeholder="Footer text"
        value={footerText}
        onChange={(e) => setFooterText(e.target.value)}
      />
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => saveMutation.mutate()}
      >
        Save branding
      </button>
    </section>
  );
}
