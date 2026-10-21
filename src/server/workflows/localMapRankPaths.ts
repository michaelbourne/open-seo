import type { WorkflowStep } from "cloudflare:workers";
import { LocalMapRankRepository } from "@/server/features/local-map-rank/repositories/LocalMapRankRepository";
import { fetchLocalSerpTaskResult } from "@/server/lib/dataforseo/serp";
import type { createDataforseoClient } from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import {
  formatLocationCoordinate,
  buildGridPins,
  type GridPin,
} from "@/shared/grid-pins";
import { matchMapsResultRank } from "@/shared/local-map-rank";
import { MAX_TASKS_PER_POST } from "@/shared/rank-tracking";
import { pgStep } from "@/server/workflows/pgStep";

const SINGLE_ATTEMPT_STEP_CONFIG = {
  retries: { limit: 0, delay: "1 second" as const },
  timeout: "2 minutes" as const,
};

const COLLECT_STEP_CONFIG = {
  retries: { limit: 2, delay: "10 seconds" as const },
  timeout: "5 minutes" as const,
};

const QUEUED_POLL_INTERVALS = [
  "4 minutes",
  "2 minutes",
  "2 minutes",
  "2 minutes",
  "2 minutes",
  "3 minutes",
] as const;

const TASK_GET_CONCURRENCY = 25;
const LIVE_BATCH_SIZE = 10;

type KeywordRow = { id: string; keyword: string };

type PinTask = {
  keywordId: string;
  keyword: string;
  pinIndex: number;
  latitude: number;
  longitude: number;
};

type PostedTask = PinTask & { taskId: string };

export interface ScanContext {
  client: ReturnType<typeof createDataforseoClient>;
  runId: string;
  keywords: KeywordRow[];
  pins: GridPin[];
  languageCode: string;
  device: "desktop" | "mobile";
  serpDepth: number;
  targetPlaceId: string | null;
  targetCid: string | null;
}

function expandTasks(keywords: KeywordRow[], pins: GridPin[]): PinTask[] {
  return keywords.flatMap((keyword) =>
    pins.map((pin) => ({
      keywordId: keyword.id,
      keyword: keyword.keyword,
      pinIndex: pin.index,
      latitude: pin.latitude,
      longitude: pin.longitude,
    })),
  );
}

function isBudgetError(error: unknown): boolean {
  return error instanceof AppError && error.code === "USAGE_BUDGET_EXCEEDED";
}

async function writeMatches(
  ctx: ScanContext,
  rows: Array<PinTask & { items: Record<string, unknown>[] }>,
) {
  if (rows.length === 0) return;
  await LocalMapRankRepository.insertResults(
    rows.map((row) => {
      const match = matchMapsResultRank(row.items, {
        placeId: ctx.targetPlaceId,
        cid: ctx.targetCid,
      });
      return {
        id: crypto.randomUUID(),
        runId: ctx.runId,
        keywordId: row.keywordId,
        pinIndex: row.pinIndex,
        latitude: row.latitude,
        longitude: row.longitude,
        rankAbsolute: match.rankAbsolute,
        matchedTitle: match.matchedTitle,
        snapshotJson: JSON.stringify(row.items.slice(0, 5)),
        checkedAt: new Date().toISOString(),
      };
    }),
  );
  const current = await LocalMapRankRepository.getResultsForRun(ctx.runId);
  await LocalMapRankRepository.updateRun(ctx.runId, {
    pinsCompleted: current.length,
  });
}

async function checkBatchLive(ctx: ScanContext, tasks: PinTask[]) {
  const settled = await Promise.allSettled(
    tasks.map(async (task) => {
      const items = await ctx.client.serp.local({
        keyword: task.keyword,
        locationCoordinate: formatLocationCoordinate(
          task.latitude,
          task.longitude,
        ),
        languageCode: ctx.languageCode,
        searchType: "maps",
        device: ctx.device,
        depth: ctx.serpDepth,
        searchPlaces: false,
        creditFeature: "local_map_rank",
      });
      return { ...task, items };
    }),
  );
  const budgetError = settled.find(
    (result) => result.status === "rejected" && isBudgetError(result.reason),
  );
  if (budgetError && budgetError.status === "rejected")
    throw budgetError.reason;

  const matched = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  await writeMatches(ctx, matched);
  return matched.length;
}

export async function runLiveMapScan(step: WorkflowStep, ctx: ScanContext) {
  const tasks = expandTasks(ctx.keywords, ctx.pins);
  for (let i = 0; i < tasks.length; i += LIVE_BATCH_SIZE) {
    const batch = tasks.slice(i, i + LIVE_BATCH_SIZE);
    const batchIndex = Math.floor(i / LIVE_BATCH_SIZE);
    await pgStep(
      step,
      `live-batch-${batchIndex}`,
      SINGLE_ATTEMPT_STEP_CONFIG,
      () => checkBatchLive(ctx, batch),
    );
  }
}

async function postKeyword(
  ctx: ScanContext,
  keyword: KeywordRow,
): Promise<{ posted: PostedTask[]; fallback: PinTask[] }> {
  const pins = ctx.pins;
  const posted: PostedTask[] = [];
  const fallback: PinTask[] = [];
  for (let i = 0; i < pins.length; i += MAX_TASKS_PER_POST) {
    const chunk = pins.slice(i, i + MAX_TASKS_PER_POST);
    const taskIds = await ctx.client.serp.localTaskPost({
      keyword: keyword.keyword,
      locationCoordinates: chunk.map((pin) =>
        formatLocationCoordinate(pin.latitude, pin.longitude),
      ),
      languageCode: ctx.languageCode,
      device: ctx.device,
      depth: ctx.serpDepth,
      creditFeature: "local_map_rank",
    });
    chunk.forEach((pin, index) => {
      const task: PinTask = {
        keywordId: keyword.id,
        keyword: keyword.keyword,
        pinIndex: pin.index,
        latitude: pin.latitude,
        longitude: pin.longitude,
      };
      const taskId = taskIds[index];
      if (taskId) posted.push({ ...task, taskId });
      else fallback.push(task);
    });
  }
  return { posted, fallback };
}

async function collectQueuedRound(ctx: ScanContext, tasks: PostedTask[]) {
  const completed: Array<PinTask & { items: Record<string, unknown>[] }> = [];
  const stillPending: PostedTask[] = [];
  const failed: PinTask[] = [];

  for (let i = 0; i < tasks.length; i += TASK_GET_CONCURRENCY) {
    const chunk = tasks.slice(i, i + TASK_GET_CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((task) => fetchLocalSerpTaskResult(task.taskId)),
    );
    settled.forEach((result, index) => {
      const task = chunk[index];
      if (!task) return;
      if (result.status === "rejected" || result.value.status === "pending") {
        stillPending.push(task);
        return;
      }
      if (result.value.status === "failed") {
        failed.push(task);
        return;
      }
      completed.push({ ...task, items: result.value.items });
    });
  }

  await writeMatches(ctx, completed);
  return { stillPending, failed };
}

export async function runQueuedMapScan(step: WorkflowStep, ctx: ScanContext) {
  let pending: PostedTask[] = [];
  const fallback: PinTask[] = [];

  for (let index = 0; index < ctx.keywords.length; index++) {
    const keyword = ctx.keywords[index];
    if (!keyword) continue;
    try {
      const outcome = await pgStep(
        step,
        `post-tasks-${index}`,
        SINGLE_ATTEMPT_STEP_CONFIG,
        () => postKeyword(ctx, keyword),
      );
      pending.push(...outcome.posted);
      fallback.push(...outcome.fallback);
    } catch (error) {
      if (isBudgetError(error)) throw error;
      fallback.push(
        ...ctx.pins.map((pin) => ({
          keywordId: keyword.id,
          keyword: keyword.keyword,
          pinIndex: pin.index,
          latitude: pin.latitude,
          longitude: pin.longitude,
        })),
      );
    }
  }

  for (
    let round = 0;
    round < QUEUED_POLL_INTERVALS.length && pending.length > 0;
    round++
  ) {
    await step.sleep(`wait-${round}`, QUEUED_POLL_INTERVALS[round]);
    try {
      const outcome = await pgStep(
        step,
        `collect-${round}`,
        COLLECT_STEP_CONFIG,
        () => collectQueuedRound(ctx, pending),
      );
      pending = outcome.stillPending;
      fallback.push(...outcome.failed);
    } catch (error) {
      if (isBudgetError(error)) throw error;
    }
  }

  const stragglers = [...fallback, ...pending];
  for (let i = 0; i < stragglers.length; i += LIVE_BATCH_SIZE) {
    const batch = stragglers.slice(i, i + LIVE_BATCH_SIZE);
    const batchIndex = Math.floor(i / LIVE_BATCH_SIZE);
    await pgStep(
      step,
      `fallback-batch-${batchIndex}`,
      SINGLE_ATTEMPT_STEP_CONFIG,
      () => checkBatchLive(ctx, batch),
    );
  }
}

export async function loadScanFields(input: {
  campaignId: string;
  projectId: string;
}) {
  const campaign = await LocalMapRankRepository.getCampaignById(
    input.campaignId,
    input.projectId,
  );
  if (!campaign) throw new Error("Campaign not found");
  const keywords = await LocalMapRankRepository.getKeywordsForCampaign(
    input.campaignId,
  );
  return {
    keywords: keywords.map((row) => ({ id: row.id, keyword: row.keyword })),
    pins: buildGridPins({
      centerLatitude: campaign.centerLatitude,
      centerLongitude: campaign.centerLongitude,
      gridSize: campaign.gridSize,
      radiusKm: campaign.radiusKm,
    }),
    languageCode: campaign.languageCode,
    device: campaign.device,
    serpDepth: campaign.serpDepth,
    targetPlaceId: campaign.targetPlaceId,
    targetCid: campaign.targetCid,
    isActive: campaign.isActive,
  };
}
