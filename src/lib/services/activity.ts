import type { DB } from "../db/client";
import { leadActivities } from "../db/schema";

export async function logActivity(
  db: DB | Parameters<Parameters<DB["transaction"]>[0]>[0],
  a: { leadId: string; actorType: "human" | "ai" | "system"; actorId?: string | null; type: string; message: string; meta?: Record<string, unknown> },
) {
  await db.insert(leadActivities).values({ leadId: a.leadId, actorType: a.actorType, actorId: a.actorId ?? null, type: a.type, message: a.message, meta: a.meta ?? {} });
}
