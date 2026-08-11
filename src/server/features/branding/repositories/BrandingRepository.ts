import { eq } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { db } from "@/db";
import { organizationBranding } from "@/db/schema";

async function getBranding(organizationId: string) {
  const rows = await db
    .select()
    .from(organizationBranding)
    .where(eq(organizationBranding.organizationId, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsertBranding(
  organizationId: string,
  data: Omit<InferInsertModel<typeof organizationBranding>, "organizationId">,
) {
  const existing = await getBranding(organizationId);
  if (existing) {
    await db
      .update(organizationBranding)
      .set({
        ...data,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(organizationBranding.organizationId, organizationId));
    return;
  }

  await db.insert(organizationBranding).values({
    organizationId,
    ...data,
  });
}

export const BrandingRepository = {
  getBranding,
  upsertBranding,
};
