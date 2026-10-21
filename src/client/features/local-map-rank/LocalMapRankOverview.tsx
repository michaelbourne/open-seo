import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { LocalMapCampaignCard } from "@/client/features/local-map-rank/LocalMapCampaignCard";
import {
  createLocalMapCampaign,
  getLocalMapCampaigns,
} from "@/serverFunctions/local-map-rank";

function asSchedule(value: string): "weekly" | "monthly" | "manual" {
  if (value === "monthly" || value === "manual") return value;
  return "weekly";
}

function asDevice(value: string): "desktop" | "mobile" {
  return value === "desktop" ? "desktop" : "mobile";
}

export function LocalMapRankOverview({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const campaigns = useQuery({
    queryKey: ["localMapCampaigns", projectId],
    queryFn: () => getLocalMapCampaigns({ data: { projectId } }),
  });
  const [form, setForm] = useState({
    name: "",
    placeId: "",
    cid: "",
    lat: "",
    lng: "",
    radiusKm: "5",
    gridSize: "5",
    schedule: "weekly" as "weekly" | "monthly" | "manual",
    device: "mobile" as "desktop" | "mobile",
    keywords: "",
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createLocalMapCampaign({
        data: {
          projectId,
          name: form.name,
          centerLatitude: Number(form.lat),
          centerLongitude: Number(form.lng),
          gridSize: Number(form.gridSize),
          radiusKm: Number(form.radiusKm),
          targetPlaceId: form.placeId || undefined,
          targetCid: form.cid || undefined,
          keywords: form.keywords
            .split("\n")
            .map((keyword) => keyword.trim())
            .filter(Boolean),
          device: form.device,
          scheduleInterval: form.schedule,
        },
      }),
    onSuccess: () => {
      toast.success("Grid saved");
      void queryClient.invalidateQueries({
        queryKey: ["localMapCampaigns", projectId],
      });
      setForm((current) => ({
        ...current,
        name: "",
        placeId: "",
        cid: "",
        keywords: "",
      }));
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Maps grid rank"
        description="Track where a business ranks on Google Maps across a grid, and compare each scan with the ones before it."
      />

      <form
        className="space-y-4 rounded-xl border border-border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          createMutation.mutate();
        }}
      >
        <h2 className="text-sm font-medium">New grid</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              required
            />
          </Field>
          <Field label="Place ID">
            <Input
              value={form.placeId}
              placeholder="ChIJ..."
              onChange={(event) =>
                setForm({ ...form, placeId: event.target.value })
              }
            />
          </Field>
          <Field label="CID (if you don't have a place ID)">
            <Input
              value={form.cid}
              onChange={(event) =>
                setForm({ ...form, cid: event.target.value })
              }
            />
          </Field>
          <Field label="Center latitude">
            <Input
              inputMode="decimal"
              value={form.lat}
              onChange={(event) =>
                setForm({ ...form, lat: event.target.value })
              }
              required
            />
          </Field>
          <Field label="Center longitude">
            <Input
              inputMode="decimal"
              value={form.lng}
              onChange={(event) =>
                setForm({ ...form, lng: event.target.value })
              }
              required
            />
          </Field>
          <Field label="Radius (km)">
            <Input
              inputMode="decimal"
              value={form.radiusKm}
              onChange={(event) =>
                setForm({ ...form, radiusKm: event.target.value })
              }
              required
            />
          </Field>
          <Field label="Grid">
            <select
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={form.gridSize}
              onChange={(event) =>
                setForm({ ...form, gridSize: event.target.value })
              }
            >
              <option value="5">5×5 (25 pins)</option>
              <option value="7">7×7 (49 pins)</option>
              <option value="9">9×9 (81 pins)</option>
            </select>
          </Field>
          <Field label="Schedule">
            <select
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={form.schedule}
              onChange={(event) =>
                setForm({
                  ...form,
                  schedule: asSchedule(event.target.value),
                })
              }
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="manual">Manual only</option>
            </select>
          </Field>
          <Field label="Device">
            <select
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={form.device}
              onChange={(event) =>
                setForm({
                  ...form,
                  device: asDevice(event.target.value),
                })
              }
            >
              <option value="mobile">Mobile</option>
              <option value="desktop">Desktop</option>
            </select>
          </Field>
        </div>
        <Field label="Keywords, one per line">
          <Textarea
            value={form.keywords}
            rows={4}
            onChange={(event) =>
              setForm({ ...form, keywords: event.target.value })
            }
            required
          />
        </Field>
        <Button type="submit" pending={createMutation.isPending}>
          Save grid
        </Button>
      </form>

      {campaigns.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading grids…</p>
      ) : (
        <div className="space-y-4">
          {(campaigns.data ?? []).map((campaign) => (
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
