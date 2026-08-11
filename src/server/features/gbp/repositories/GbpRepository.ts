import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { db } from "@/db";
import {
  gbpConnections,
  gbpLocations,
  gbpPerformanceSnapshots,
  gbpProfileSnapshots,
  gbpReviewSnapshots,
} from "@/db/schema";
import { executeInBatches } from "@/db/runBatch";

export type GbpConnection = typeof gbpConnections.$inferSelect;
export type GbpLocation = typeof gbpLocations.$inferSelect;

async function getConnectionByProjectId(
  projectId: string,
): Promise<GbpConnection | null> {
  const rows = await db
    .select()
    .from(gbpConnections)
    .where(eq(gbpConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsertConnection(input: {
  projectId: string;
  organizationId: string;
  connectedByUserId: string;
  connectedAccountEmail: string | null;
}): Promise<GbpConnection> {
  const [row] = await db
    .insert(gbpConnections)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: gbpConnections.projectId,
      set: {
        organizationId: input.organizationId,
        connectedByUserId: input.connectedByUserId,
        connectedAccountEmail: sql`coalesce(${input.connectedAccountEmail}, ${gbpConnections.connectedAccountEmail})`,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) {
    throw new Error("Failed to upsert gbp_connection");
  }
  return row;
}

async function deleteConnectionByProjectId(projectId: string): Promise<void> {
  await db
    .delete(gbpConnections)
    .where(eq(gbpConnections.projectId, projectId));
}

async function getLocationByProjectId(
  projectId: string,
): Promise<GbpLocation | null> {
  const rows = await db
    .select()
    .from(gbpLocations)
    .where(eq(gbpLocations.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsertLocation(
  input: InferInsertModel<typeof gbpLocations>,
): Promise<GbpLocation> {
  const [row] = await db
    .insert(gbpLocations)
    .values(input)
    .onConflictDoUpdate({
      target: gbpLocations.projectId,
      set: {
        connectionId: input.connectionId,
        googleLocationName: input.googleLocationName,
        placeId: input.placeId ?? null,
        title: input.title ?? null,
      },
    })
    .returning();
  if (!row) {
    throw new Error("Failed to upsert gbp_location");
  }
  return row;
}

async function deleteLocationByProjectId(projectId: string): Promise<void> {
  await db
    .delete(gbpLocations)
    .where(eq(gbpLocations.projectId, projectId));
}

async function insertProfileSnapshot(input: {
  id: string;
  locationId: string;
  payloadJson: string;
}) {
  await db.insert(gbpProfileSnapshots).values(input);
}

async function getLatestProfileSnapshot(locationId: string) {
  const rows = await db
    .select()
    .from(gbpProfileSnapshots)
    .where(eq(gbpProfileSnapshots.locationId, locationId))
    .orderBy(desc(gbpProfileSnapshots.capturedAt))
    .limit(1);
  return rows[0] ?? null;
}

async function upsertReviewSnapshots(
  rows: InferInsertModel<typeof gbpReviewSnapshots>[],
) {
  if (rows.length === 0) return;
  await executeInBatches(rows, (tx, row) =>
    tx
      .insert(gbpReviewSnapshots)
      .values(row)
      .onConflictDoUpdate({
        target: [
          gbpReviewSnapshots.locationId,
          gbpReviewSnapshots.reviewId,
        ],
        set: {
          payloadJson: row.payloadJson,
          reviewTimestamp: row.reviewTimestamp ?? null,
          capturedAt: sql`(current_timestamp)`,
        },
      }),
  );
}

async function getReviewSnapshots(locationId: string, limit = 50) {
  return db
    .select()
    .from(gbpReviewSnapshots)
    .where(eq(gbpReviewSnapshots.locationId, locationId))
    .orderBy(desc(gbpReviewSnapshots.reviewTimestamp))
    .limit(limit);
}

async function upsertPerformanceSnapshots(
  rows: InferInsertModel<typeof gbpPerformanceSnapshots>[],
) {
  if (rows.length === 0) return;
  await executeInBatches(rows, (tx, row) =>
    tx
      .insert(gbpPerformanceSnapshots)
      .values(row)
      .onConflictDoUpdate({
        target: [
          gbpPerformanceSnapshots.locationId,
          gbpPerformanceSnapshots.metricDate,
          gbpPerformanceSnapshots.metricType,
        ],
        set: {
          value: row.value,
          capturedAt: sql`(current_timestamp)`,
        },
      }),
  );
}

async function getPerformanceSnapshots(
  locationId: string,
  metricTypes?: string[],
) {
  const conditions = [eq(gbpPerformanceSnapshots.locationId, locationId)];
  if (metricTypes && metricTypes.length > 0) {
    conditions.push(
      inArray(gbpPerformanceSnapshots.metricType, metricTypes),
    );
  }
  return db
    .select()
    .from(gbpPerformanceSnapshots)
    .where(and(...conditions))
    .orderBy(gbpPerformanceSnapshots.metricDate);
}

export const GbpRepository = {
  getConnectionByProjectId,
  upsertConnection,
  deleteConnectionByProjectId,
  getLocationByProjectId,
  upsertLocation,
  deleteLocationByProjectId,
  insertProfileSnapshot,
  getLatestProfileSnapshot,
  upsertReviewSnapshots,
  getReviewSnapshots,
  upsertPerformanceSnapshots,
  getPerformanceSnapshots,
};
