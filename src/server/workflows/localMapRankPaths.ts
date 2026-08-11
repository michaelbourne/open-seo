import type { WorkflowStep } from "cloudflare:workers";
import { LocalMapRankRepository } from "@/server/features/local-map-rank/repositories/LocalMapRankRepository";
import {
  fetchMapsTaskResult,
  MAX_TASKS_PER_POST,
} from "@/server/lib/dataforseo";
import type {
  createDataforseoClient,
  MapsRankTaskInput,
  PostedMapsRankTask,
} from "@/server/lib/dataforseo";
import { buildGridPins } from "@/shared/grid-pins";
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
const TASK_GETS_PER_COLLECT = 500;

type KeywordRow = { id: string; keyword: string };

interface ScanContext {
  client: ReturnType<typeof createDataforseoClient>;
  runId: string;
  campaignId: string;
  keywords: KeywordRow[];
  pins: ReturnType<typeof buildGridPins>;
  languageCode: string;
  device: "desktop" | "mobile";
  serpDepth: number;
  targetPlaceId: string | null;
  targetCid: string | null;
}

function expandTasks(
  keywords: KeywordRow[],
  pins: ReturnType<typeof buildGridPins>,
): MapsRankTaskInput[] {
  return keywords.flatMap((kw) =>
    pins.map((pin) => ({
      keyword: kw.keyword,
      keywordId: kw.id,
      pinIndex: pin.index,
      latitude: pin.latitude,
      longitude: pin.longitude,
    })),
  );
}

function mapResultRows(
  runId: string,
  results: Array<{
    keywordId: string;
    pinIndex: number;
    latitude: number;
    longitude: number;
    rankAbsolute: number | null;
    matchedTitle: string | null;
    items: Record<string, unknown>[];
  }>,
) {
  return results.map((r) => ({
    id: crypto.randomUUID(),
    runId,
    keywordId: r.keywordId,
    pinIndex: r.pinIndex,
    latitude: r.latitude,
    longitude: r.longitude,
    rankAbsolute: r.rankAbsolute,
    matchedTitle: r.matchedTitle,
    snapshotJson: JSON.stringify(r.items.slice(0, 5)),
    checkedAt: new Date().toISOString(),
  }));
}

async function checkBatchLive(
  ctx: ScanContext,
  tasks: MapsRankTaskInput[],
): Promise<number> {
  const settled = await Promise.allSettled(
    tasks.map((task) =>
      ctx.client.serp.mapsRankLive({
        ...task,
        languageCode: ctx.languageCode,
        device: ctx.device,
        depth: ctx.serpDepth,
        targetPlaceId: ctx.targetPlaceId,
        targetCid: ctx.targetCid,
        creditFeature: "local_map_rank",
      }),
    ),
  );

  const results = settled
    .filter(
      (
        o,
      ): o is PromiseFulfilledResult<
        Awaited<ReturnType<typeof ctx.client.serp.mapsRankLive>>
      > => o.status === "fulfilled",
    )
    .map((o) => o.value);

  if (results.length > 0) {
    await LocalMapRankRepository.insertResults(mapResultRows(ctx.runId, results));
  }
  return results.length;
}

async function collectQueuedRound(
  ctx: ScanContext,
  tasks: PostedMapsRankTask[],
) {
  const completed: Awaited<ReturnType<typeof ctx.client.serp.mapsRankLive>>[] =
    [];
  const stillPending: PostedMapsRankTask[] = [];
  const failed: PostedMapsRankTask[] = [];

  for (let i = 0; i < tasks.length; i += TASK_GET_CONCURRENCY) {
    const chunk = tasks.slice(i, i + TASK_GET_CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((task) =>
        fetchMapsTaskResult({
          taskId: task.taskId,
          task,
          targetPlaceId: ctx.targetPlaceId,
          targetCid: ctx.targetCid,
        }),
      ),
    );

    settled.forEach((result, index) => {
      const task = chunk[index];
      if (result.status === "rejected") {
        stillPending.push(task);
      } else if (result.value.status === "pending") {
        stillPending.push(task);
      } else if (result.value.status === "failed") {
        failed.push(task);
      } else {
        completed.push(result.value.result);
      }
    });
  }

  if (completed.length > 0) {
    await LocalMapRankRepository.insertResults(
      mapResultRows(ctx.runId, completed),
    );
    const current = await LocalMapRankRepository.getResultsForRun(ctx.runId);
    await LocalMapRankRepository.updateRun(ctx.runId, {
      pinsCompleted: current.length,
    });
  }

  return { collected: completed.length, stillPending, failed };
}

export async function runLiveMapScan(
  step: WorkflowStep,
  ctx: ScanContext,
): Promise<void> {
  const tasks = expandTasks(ctx.keywords, ctx.pins);
  const batchSize = 10;
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize);
    await pgStep(
      step,
      `live-batch-${batchIndex}`,
      SINGLE_ATTEMPT_STEP_CONFIG,
      async () => {
        const written = await checkBatchLive(ctx, batch);
        const current = await LocalMapRankRepository.getResultsForRun(ctx.runId);
        await LocalMapRankRepository.updateRun(ctx.runId, {
          pinsCompleted: current.length,
        });
        return written;
      },
    );
  }
}

export async function runQueuedMapScan(
  step: WorkflowStep,
  ctx: ScanContext,
): Promise<void> {
  const taskInputs = expandTasks(ctx.keywords, ctx.pins);
  let pending: PostedMapsRankTask[] = [];
  const fallback: MapsRankTaskInput[] = [];

  for (let i = 0; i < taskInputs.length; i += MAX_TASKS_PER_POST) {
    const chunk = taskInputs.slice(i, i + MAX_TASKS_PER_POST);
    const postIndex = Math.floor(i / MAX_TASKS_PER_POST);
    try {
      const posted = await pgStep(
        step,
        `post-tasks-${postIndex}`,
        SINGLE_ATTEMPT_STEP_CONFIG,
        async () =>
          ctx.client.serp.mapsRankTaskPost({
            tasks: chunk,
            languageCode: ctx.languageCode,
            device: ctx.device,
            depth: ctx.serpDepth,
            creditFeature: "local_map_rank",
          }),
      );
      pending.push(...posted);
      if (posted.length < chunk.length) {
        const accepted = new Set(
          posted.map((t) => `${t.keywordId}:${t.pinIndex}`),
        );
        fallback.push(
          ...chunk.filter(
            (t) => !accepted.has(`${t.keywordId}:${t.pinIndex}`),
          ),
        );
      }
    } catch {
      fallback.push(...chunk);
    }
  }

  for (
    let round = 0;
    round < QUEUED_POLL_INTERVALS.length && pending.length > 0;
    round++
  ) {
    await step.sleep(`wait-${round}`, QUEUED_POLL_INTERVALS[round]);
    const batch = pending.slice(0, TASK_GETS_PER_COLLECT);
    const overflow = pending.slice(TASK_GETS_PER_COLLECT);
    try {
      const outcome = await pgStep(
        step,
        `collect-${round}`,
        COLLECT_STEP_CONFIG,
        () => collectQueuedRound(ctx, batch),
      );
      pending = [...outcome.stillPending, ...overflow];
      fallback.push(...outcome.failed);
    } catch {
      // retry next round
    }
  }

  const stragglers = [...fallback, ...pending];
  if (stragglers.length === 0) return;

  const batchSize = 10;
  for (let i = 0; i < stragglers.length; i += batchSize) {
    const batch = stragglers.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize);
    await pgStep(
      step,
      `fallback-batch-${batchIndex}`,
      SINGLE_ATTEMPT_STEP_CONFIG,
      () => checkBatchLive(ctx, batch),
    );
  }
}

export async function buildScanContext(input: {
  client: ReturnType<typeof createDataforseoClient>;
  runId: string;
  campaignId: string;
  projectId: string;
}) {
  const campaign = await LocalMapRankRepository.getCampaignById(
    input.campaignId,
    input.projectId,
  );
  if (!campaign) {
    throw new Error("Campaign not found");
  }
  const keywords = await LocalMapRankRepository.getKeywordsForCampaign(
    input.campaignId,
  );
  const pins = buildGridPins({
    centerLatitude: campaign.centerLatitude,
    centerLongitude: campaign.centerLongitude,
    gridSize: campaign.gridSize,
    radiusKm: campaign.radiusKm,
  });
  return {
    client: input.client,
    runId: input.runId,
    campaignId: input.campaignId,
    keywords,
    pins,
    languageCode: campaign.languageCode,
    device: campaign.device,
    serpDepth: campaign.serpDepth,
    targetPlaceId: campaign.targetPlaceId,
    targetCid: campaign.targetCid,
  } satisfies ScanContext;
}
