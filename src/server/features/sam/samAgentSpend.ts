import { withPgClient } from "@/db";
import type { SamTurnStats } from "@/server/features/sam/samTurnTelemetry";
import {
  assertAgentDailyBudget,
  recordSelfHostedUsage,
} from "@/server/features/usage/services/UsageService";
import { trackUsageCreditSpend } from "@/server/billing/subscription";

// Batching threshold for metering, not a charge: the user pays the turn's
// actual OpenRouter cost (times the usual markup) whatever this is set to.
const SAM_BILLING_CHUNK_USD = 0.05;

const SELF_HOST_AGENT_CAP_MESSAGE =
  "Daily agent budget reached. Raise the cap in Settings or try again tomorrow.";

type SpendContext = {
  row: { userId: string };
  userEmail: string;
  project: { id: string; organizationId: string };
};

export async function selfHostAgentTurnRefusal(organizationId: string) {
  try {
    await assertAgentDailyBudget(organizationId);
    return null;
  } catch {
    return SELF_HOST_AGENT_CAP_MESSAGE;
  }
}

/**
 * Accumulate OpenRouter spend and flush a chunk to hosted credits or the
 * self-host ledger. Returns the updated unbilled total and billing chain.
 */
export function queueAgentSpend(input: {
  costUsd: number;
  flush: boolean;
  unbilledUsd: number;
  armedMonthlyRemaining: number | null;
  getMonthlyRemaining: () => number | null;
  billing: Promise<void>;
  turn: SamTurnStats | null;
  loadContext: () => Promise<SpendContext | null>;
  onCredits: (monthlyCredits: number) => void;
  onMeterError: (error: unknown) => void;
}): { unbilledUsd: number; billing: Promise<void> } {
  let unbilledUsd = input.unbilledUsd + input.costUsd;
  const armed = input.armedMonthlyRemaining;
  if (!input.flush && unbilledUsd < SAM_BILLING_CHUNK_USD) {
    return { unbilledUsd, billing: input.billing };
  }
  const chunkUsd = unbilledUsd;
  unbilledUsd = 0;
  if (chunkUsd <= 0) return { unbilledUsd, billing: input.billing };

  const billing = input.billing
    .then(() =>
      armed === null
        ? recordSelfHostChunk(input.loadContext, chunkUsd)
        : meterHostedChunk(input, chunkUsd, armed),
    )
    .catch((error: unknown) => {
      if (armed === null) {
        console.error("[sam] self-host spend recording failed", error);
        return;
      }
      console.error("[sam] credit metering failed", error);
      input.onMeterError(error);
    });
  return { unbilledUsd, billing };
}

async function recordSelfHostChunk(
  loadContext: () => Promise<SpendContext | null>,
  costUsd: number,
) {
  const ctx = await withPgClient(loadContext);
  if (!ctx) return;
  await recordSelfHostedUsage({
    organizationId: ctx.project.organizationId,
    creditFeature: "agent",
    costUsd,
    apiPath: "openrouter",
    projectId: ctx.project.id,
  });
}

async function meterHostedChunk(
  input: {
    turn: SamTurnStats | null;
    loadContext: () => Promise<SpendContext | null>;
    onCredits: (monthlyCredits: number) => void;
    getMonthlyRemaining: () => number | null;
  },
  costUsd: number,
  armedMonthlyRemaining: number,
) {
  const ctx = await withPgClient(input.loadContext);
  if (!ctx) return;
  const { monthlyCredits, topupCredits } = await trackUsageCreditSpend({
    customer: {
      userId: ctx.row.userId,
      userEmail: ctx.userEmail,
      organizationId: ctx.project.organizationId,
      projectId: ctx.project.id,
    },
    customerId: ctx.project.organizationId,
    creditFeature: "agent",
    costUsd,
    monthlyRemaining: input.getMonthlyRemaining() ?? armedMonthlyRemaining,
    properties: { provider: "openrouter", turn_id: input.turn?.turnId },
  });
  if (input.turn) input.turn.credits += monthlyCredits + topupCredits;
  input.onCredits(monthlyCredits);
}
