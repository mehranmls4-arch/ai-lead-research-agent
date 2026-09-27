import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import * as s from "../db/schema";
import { STAGE_LABELS, type CrmStage } from "../domain/lead";
import { canTransition } from "../engine/crm";
import { logActivity } from "./activity";

export class StageError extends Error {}

/** Manual stage change by a human user. Enforces the CRM transition rules. */
export async function changeStage(db: DB, leadId: string, to: CrmStage, actor: { id: string; name: string }, note?: string) {
  const [lead] = await db.select({ stage: s.leads.stage }).from(s.leads).where(eq(s.leads.id, leadId));
  if (!lead) throw new StageError("Lead not found");
  const from = lead.stage as CrmStage;
  const check = canTransition(from, to, "human");
  if (!check.ok) throw new StageError(check.reason);
  await db.update(s.leads).set({ stage: to, updatedAt: new Date() }).where(eq(s.leads.id, leadId));
  await logActivity(db, {
    leadId,
    actorType: "human",
    actorId: actor.id,
    type: "stage_changed",
    message: `${actor.name} moved the lead from ${STAGE_LABELS[from]} to ${STAGE_LABELS[to]}${note ? ` — ${note}` : "."}`,
    meta: { from, to },
  });
  return to;
}
