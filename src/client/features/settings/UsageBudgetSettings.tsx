import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SectionHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { creditFeatureLabel } from "@/shared/billing-credit-features";
import { getUsageBudget, saveUsageBudget } from "@/serverFunctions/usage";

export function UsageBudgetSettings() {
  const queryClient = useQueryClient();
  const budget = useQuery({
    queryKey: ["usageBudget"],
    queryFn: () => getUsageBudget(),
  });
  const [monthly, setMonthly] = useState<string | null>(null);
  const [daily, setDaily] = useState<string | null>(null);

  const monthlyValue =
    monthly ??
    (budget.data?.monthlyBudgetUsd != null
      ? String(budget.data.monthlyBudgetUsd)
      : "");
  const dailyValue =
    daily ??
    (budget.data?.dailyAgentBudgetUsd != null
      ? String(budget.data.dailyAgentBudgetUsd)
      : "");

  const save = useMutation({
    mutationFn: () =>
      saveUsageBudget({
        data: {
          monthlyBudgetUsd: monthlyValue.trim() ? Number(monthlyValue) : null,
          dailyAgentBudgetUsd: dailyValue.trim() ? Number(dailyValue) : null,
        },
      }),
    onSuccess: () => {
      toast.success("Spend caps saved");
      setMonthly(null);
      setDaily(null);
      void queryClient.invalidateQueries({ queryKey: ["usageBudget"] });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Spend caps"
        hint="Self-hosted installs pay DataForSEO and the in-app agent directly. Leave a field blank for no cap. Caps reset on the UTC month and UTC day."
      />
      {budget.data && (
        <p className="text-sm text-muted-foreground">
          Spent this month: ${budget.data.monthSpend.toFixed(2)}
          {budget.data.budgetExceeded
            ? ". The monthly cap is reached, so new data calls are blocked until next month or you raise it."
            : budget.data.alertTriggered
              ? ". This is past 80% of the monthly cap."
              : "."}
        </p>
      )}
      {budget.data && budget.data.byFeature.length > 0 && (
        <ul className="text-sm text-muted-foreground">
          {budget.data.byFeature.map((row) => (
            <li key={row.creditFeature}>
              {creditFeatureLabel(row.creditFeature)}: ${row.costUsd.toFixed(2)}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5">
          <Label>Monthly cap (USD)</Label>
          <Input
            inputMode="decimal"
            value={monthlyValue}
            placeholder="No cap"
            onChange={(event) => setMonthly(event.target.value)}
          />
        </label>
        <label className="space-y-1.5">
          <Label>Daily agent cap (USD)</Label>
          <Input
            inputMode="decimal"
            value={dailyValue}
            placeholder="No cap"
            onChange={(event) => setDaily(event.target.value)}
          />
        </label>
      </div>
      <Button size="sm" pending={save.isPending} onClick={() => save.mutate()}>
        Save caps
      </Button>
    </section>
  );
}
