import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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

function FieldLabel({ children }: { children: string }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
      {children}
    </span>
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
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!data || seeded) return;
    setBudget(data.budget?.toString() ?? "");
    setDailyAgent(data.settings.dailyAgentBudgetUsd?.toString() ?? "");
    setSeeded(true);
  }, [data, seeded]);

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
      <label className="form-control w-full max-w-xs gap-1.5">
        <FieldLabel>Monthly budget (USD)</FieldLabel>
        <input
          className="input input-bordered input-sm w-full"
          placeholder="No cap"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
      </label>
      <label className="form-control w-full max-w-xs gap-1.5">
        <FieldLabel>Daily SAM agent cap (USD)</FieldLabel>
        <input
          className="input input-bordered input-sm w-full"
          placeholder="No cap"
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
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!data || seeded) return;
    setAgencyName(data.agencyName ?? "");
    setLogoUrl(data.logoUrl ?? "");
    setPrimaryColor(data.primaryColorHex ?? "#2563eb");
    setFooterText(data.footerText ?? "");
    setSeeded(true);
  }, [data, seeded]);

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
      <label className="form-control w-full max-w-md gap-1.5">
        <FieldLabel>Agency name</FieldLabel>
        <input
          className="input input-bordered input-sm w-full"
          placeholder="Agency"
          value={agencyName}
          onChange={(e) => setAgencyName(e.target.value)}
        />
      </label>
      <label className="form-control w-full max-w-md gap-1.5">
        <FieldLabel>Logo URL</FieldLabel>
        <input
          className="input input-bordered input-sm w-full"
          placeholder="https://…"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
        />
      </label>
      <label className="form-control w-full max-w-xs gap-1.5">
        <FieldLabel>Primary color</FieldLabel>
        <input
          className="input input-bordered input-sm w-full"
          placeholder="#2563eb"
          value={primaryColor}
          onChange={(e) => setPrimaryColor(e.target.value)}
        />
      </label>
      <label className="form-control w-full max-w-md gap-1.5">
        <FieldLabel>Footer text</FieldLabel>
        <textarea
          className="textarea textarea-bordered textarea-sm w-full"
          placeholder="Optional footer for reports"
          value={footerText}
          onChange={(e) => setFooterText(e.target.value)}
        />
      </label>
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
