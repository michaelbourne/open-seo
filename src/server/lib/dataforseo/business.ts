import { z } from "zod";
import {
  BusinessDataBusinessListingsSearchLiveRequestInfo,
  BusinessDataGoogleExtendedReviewsTaskPostRequestInfo,
  BusinessDataGoogleMyBusinessInfoLiveRequestInfo,
  BusinessDataGoogleQuestionsAndAnswersLiveRequestInfo,
  BusinessDataGoogleReviewsTaskPostRequestInfo,
  type BusinessDataBusinessListingsSearchLiveItem,
} from "dataforseo-client";
import { businessDataApi } from "@/server/lib/dataforseo/core";
import { MAX_TASKS_PER_POST } from "@/server/lib/dataforseo/shared";
import {
  assertOk,
  buildTaskBilling,
  isNoResultsTask,
  parseTaskItems,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";

type BusinessListingItem = BusinessDataBusinessListingsSearchLiveItem;

export async function fetchBusinessListingsSearch(input: {
  categories?: string[];
  title?: string;
  locationCoordinate: string;
  orderBy?: string[];
  limit: number;
}): Promise<DataforseoApiResponse<BusinessListingItem[]>> {
  const response = await businessDataApi().businessListingsSearchLive([
    new BusinessDataBusinessListingsSearchLiveRequestInfo({
      categories: input.categories,
      title: input.title,
      location_coordinate: input.locationCoordinate,
      order_by: input.orderBy,
      limit: input.limit,
    }),
  ]);
  // "No Search Results" (40501) is a valid empty result for obscure
  // businesses/keywords — DataForSEO still charges for it, so treat it as an
  // empty success instead of surfacing a charged-task error to the user.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: task.result?.[0]?.items ?? [],
    billing: buildTaskBilling(task),
  };
}

// Q&A results carry both answered (`items`) and unanswered
// (`items_without_answers`) rows; the SDK types this result as `any`, so we
// validate a generic record shape and flatten both.
const questionsResultSchema = z
  .object({
    items: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
    items_without_answers: z
      .array(z.record(z.string(), z.unknown()))
      .nullable()
      .optional(),
  })
  .passthrough();

function combinedQuestionItems(results: unknown): Record<string, unknown>[] {
  const list = Array.isArray(results) ? results : [];
  return list.flatMap((result) => {
    const parsed = questionsResultSchema.safeParse(result ?? {});
    if (!parsed.success) return [];
    return [
      ...(parsed.data.items ?? []),
      ...(parsed.data.items_without_answers ?? []),
    ];
  });
}

export async function fetchQuestionsAnswers(input: {
  keyword: string;
  locationCoordinate: string;
  languageCode: string;
  depth: number;
}): Promise<DataforseoApiResponse<Record<string, unknown>[]>> {
  const response = await businessDataApi().googleQuestionsAndAnswersLive([
    new BusinessDataGoogleQuestionsAndAnswersLiveRequestInfo({
      keyword: input.keyword,
      location_coordinate: input.locationCoordinate,
      language_code: input.languageCode,
      depth: input.depth,
    }),
  ]);
  // "No Search Results" (40501) is a valid empty result for obscure
  // businesses/keywords — DataForSEO still charges for it, so treat it as an
  // empty success instead of surfacing a charged-task error to the user.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: combinedQuestionItems(task.result),
    billing: buildTaskBilling(task),
  };
}

const businessInfoItemSchema = z.record(z.string(), z.unknown());

export async function fetchMyBusinessInfoLive(input: {
  keyword?: string;
  placeId?: string;
  cid?: string;
  locationCode?: number;
  locationName?: string;
  languageCode: string;
}): Promise<DataforseoApiResponse<Record<string, unknown>[]>> {
  const keyword = input.placeId
    ? `place_id:${input.placeId}`
    : input.cid
      ? `cid:${input.cid}`
      : input.keyword;
  if (!keyword?.trim()) {
    throw new AppError("VALIDATION_ERROR", "Provide a keyword, place ID, or CID");
  }
  const locationParams = input.locationName
    ? { location_name: input.locationName }
    : input.locationCode
      ? { location_code: input.locationCode }
      : {};

  const response = await businessDataApi().googleMyBusinessInfoLive([
    new BusinessDataGoogleMyBusinessInfoLiveRequestInfo({
      keyword,
      ...locationParams,
      language_code: input.languageCode,
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: parseTaskItems(
      "google-my-business-info-live",
      task,
      businessInfoItemSchema,
    ),
    billing: buildTaskBilling(task),
  };
}

const reviewItemSchema = z.record(z.string(), z.unknown());

const TASK_IN_PROGRESS_STATUS_CODES = new Set([20100, 40601, 40602]);

export interface PostedReviewsTask {
  taskId: string;
  tag?: string;
}

async function postReviewsTasks(input: {
  tasks: Array<Record<string, unknown>>;
  post: (
    tasks: BusinessDataGoogleReviewsTaskPostRequestInfo[],
  ) => Promise<{
    status_code?: number;
    status_message?: string;
    tasks?: Array<{
      status_code?: number;
      status_message?: string;
      id?: string;
      cost?: number;
      data?: { tag?: unknown };
    }>;
  }>;
  billingPath: string[];
}): Promise<DataforseoApiResponse<PostedReviewsTask[]>> {
  if (input.tasks.length === 0 || input.tasks.length > MAX_TASKS_PER_POST) {
    throw new AppError(
      "INTERNAL_ERROR",
      `task_post accepts 1-${MAX_TASKS_PER_POST} tasks, got ${input.tasks.length}`,
    );
  }

  const response = await input.post(
    input.tasks.map(
      (task) =>
        new BusinessDataGoogleReviewsTaskPostRequestInfo(
          task as ConstructorParameters<
            typeof BusinessDataGoogleReviewsTaskPostRequestInfo
          >[0],
        ),
    ),
  );

  if (!response || response.status_code !== 20000) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || "DataForSEO reviews task_post failed",
    );
  }

  const posted: PostedReviewsTask[] = [];
  let costUsd = 0;
  for (const entry of response.tasks ?? []) {
    costUsd += entry.cost ?? 0;
    if (entry.status_code !== 20100 || !entry.id) {
      console.warn(
        `dataforseo.reviews.task_post.rejected-entry (${entry.status_code}): ${entry.status_message}`,
      );
      continue;
    }
    const tag = entry.data?.tag;
    posted.push({
      taskId: entry.id,
      tag: typeof tag === "string" ? tag : undefined,
    });
  }

  return {
    data: posted,
    billing: { path: input.billingPath, costUsd },
  };
}

type ReviewsTaskOutcome =
  | { status: "pending" }
  | { status: "failed"; message: string }
  | { status: "completed"; items: Record<string, unknown>[] };

async function fetchReviewsTaskResult(input: {
  taskId: string;
  taskGet: (id: string) => Promise<{
    status_code?: number;
    status_message?: string;
    tasks?: Array<{
      status_code?: number;
      status_message?: string;
      result?: unknown[];
    }>;
  }>;
  label: string;
}): Promise<ReviewsTaskOutcome> {
  const response = await input.taskGet(input.taskId);
  const task = response?.tasks?.[0];
  if (!response || response.status_code !== 20000 || !task) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || `DataForSEO ${input.label} task_get failed`,
    );
  }

  if (
    task.status_code !== undefined &&
    TASK_IN_PROGRESS_STATUS_CODES.has(task.status_code)
  ) {
    return { status: "pending" };
  }

  if (task.status_code !== 20000) {
    if (!isNoResultsTask(task)) {
      return {
        status: "failed",
        message:
          task.status_message || `DataForSEO task failed (${task.status_code})`,
      };
    }
    return { status: "completed", items: [] };
  }

  const items = parseTaskItems(
    input.label,
    task,
    reviewItemSchema,
  );
  return { status: "completed", items };
}

export async function postGoogleReviewsTasks(input: {
  tasks: Array<{
    keyword?: string;
    placeId?: string;
    cid?: string;
    locationCode?: number;
    locationName?: string;
    languageCode: string;
    depth?: number;
    sortBy?: string;
    tag?: string;
  }>;
}): Promise<DataforseoApiResponse<PostedReviewsTask[]>> {
  return postReviewsTasks({
    tasks: input.tasks.map((task) => ({
      keyword: task.keyword,
      place_id: task.placeId,
      cid: task.cid,
      ...(task.locationName
        ? { location_name: task.locationName }
        : task.locationCode
          ? { location_code: task.locationCode }
          : {}),
      language_code: task.languageCode,
      depth: task.depth,
      sort_by: task.sortBy,
      tag: task.tag,
    })),
    post: (tasks) =>
      businessDataApi().googleReviewsTaskPost(tasks) as Promise<{
        status_code?: number;
        status_message?: string;
        tasks?: Array<{
          status_code?: number;
          status_message?: string;
          id?: string;
          cost?: number;
          data?: { tag?: unknown };
        }>;
      }>,
    billingPath: ["v3", "business_data", "google", "reviews", "task_post"],
  });
}

export async function fetchGoogleReviewsTaskResult(input: {
  taskId: string;
}): Promise<ReviewsTaskOutcome> {
  return fetchReviewsTaskResult({
    taskId: input.taskId,
    taskGet: (id) =>
      businessDataApi().googleReviewsTaskGet(id) as Promise<{
        status_code?: number;
        status_message?: string;
        tasks?: Array<{
          status_code?: number;
          status_message?: string;
          result?: unknown[];
        }>;
      }>,
    label: "google-reviews-task-get",
  });
}

export async function postExtendedReviewsTasks(input: {
  tasks: Array<{
    keyword?: string;
    placeId?: string;
    cid?: string;
    locationCode?: number;
    locationName?: string;
    languageCode: string;
    depth?: number;
    tag?: string;
  }>;
}): Promise<DataforseoApiResponse<PostedReviewsTask[]>> {
  if (input.tasks.length === 0 || input.tasks.length > MAX_TASKS_PER_POST) {
    throw new AppError(
      "INTERNAL_ERROR",
      `task_post accepts 1-${MAX_TASKS_PER_POST} tasks, got ${input.tasks.length}`,
    );
  }

  const response = await businessDataApi().googleExtendedReviewsTaskPost(
    input.tasks.map(
      (task) =>
        new BusinessDataGoogleExtendedReviewsTaskPostRequestInfo({
          keyword: task.keyword,
          place_id: task.placeId,
          cid: task.cid,
          ...(task.locationName
            ? { location_name: task.locationName }
            : task.locationCode
              ? { location_code: task.locationCode }
              : {}),
          language_code: task.languageCode,
          depth: task.depth,
          tag: task.tag,
        }),
    ),
  );

  if (!response || response.status_code !== 20000) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || "DataForSEO extended reviews task_post failed",
    );
  }

  const posted: PostedReviewsTask[] = [];
  let costUsd = 0;
  for (const entry of response.tasks ?? []) {
    costUsd += entry.cost ?? 0;
    if (entry.status_code !== 20100 || !entry.id) {
      console.warn(
        `dataforseo.extended_reviews.task_post.rejected-entry (${entry.status_code}): ${entry.status_message}`,
      );
      continue;
    }
    const tag = entry.data?.tag;
    posted.push({
      taskId: entry.id,
      tag: typeof tag === "string" ? tag : undefined,
    });
  }

  return {
    data: posted,
    billing: {
      path: ["v3", "business_data", "google", "extended_reviews", "task_post"],
      costUsd,
    },
  };
}

export async function fetchExtendedReviewsTaskResult(input: {
  taskId: string;
}): Promise<ReviewsTaskOutcome> {
  return fetchReviewsTaskResult({
    taskId: input.taskId,
    taskGet: (id) =>
      businessDataApi().googleExtendedReviewsTaskGet(id) as Promise<{
        status_code?: number;
        status_message?: string;
        tasks?: Array<{
          status_code?: number;
          status_message?: string;
          result?: unknown[];
        }>;
      }>,
    label: "google-extended-reviews-task-get",
  });
}
