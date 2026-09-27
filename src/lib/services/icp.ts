import { desc, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { icpConfigs } from "../db/schema";
import { DEFAULT_ICP, IcpConfigSchema, type IcpConfig } from "../domain/icp";

export async function getActiveIcp(db: DB): Promise<{ id: string | null; config: IcpConfig }> {
  const [row] = await db.select().from(icpConfigs).where(eq(icpConfigs.isActive, true)).orderBy(desc(icpConfigs.updatedAt)).limit(1);
  if (!row) return { id: null, config: DEFAULT_ICP };
  const parsed = IcpConfigSchema.safeParse(row.config);
  return { id: row.id, config: parsed.success ? parsed.data : DEFAULT_ICP };
}

export async function saveIcp(db: DB, config: IcpConfig, userId: string | null) {
  const valid = IcpConfigSchema.parse(config);
  return db.transaction(async (tx) => {
    await tx.update(icpConfigs).set({ isActive: false }).where(eq(icpConfigs.isActive, true));
    const [row] = await tx.insert(icpConfigs).values({ config: valid, isActive: true, updatedBy: userId }).returning();
    return row;
  });
}
