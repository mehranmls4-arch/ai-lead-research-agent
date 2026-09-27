import { and, eq, inArray, ne } from "drizzle-orm";
import type { DB } from "../db/client";
import * as s from "../db/schema";
import type { CrmStage } from "../domain/lead";
import { canTransition } from "../engine/crm";
import { validateOutreach, type OutreachChannel, type OutreachValidation } from "../engine/outreach-validator";
import { logActivity } from "./activity";

export class OutreachError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

type Actor = { id: string; name: string };
const CHANNEL_LABEL: Record<string, string> = { email: "cold email", linkedin: "LinkedIn message", followup_1: "follow-up #1", followup_2: "follow-up #2" };

async function loadDraft(db: DB, id: string) {
  const [d] = await db.select().from(s.outreachDrafts).where(eq(s.outreachDrafts.id, id));
  if (!d) throw new OutreachError(404, "Draft not found");
  return d;
}

async function moveLeadStage(db: DB, leadId: string, to: CrmStage, actor: Actor, reason: string) {
  const [lead] = await db.select({ stage: s.leads.stage }).from(s.leads).where(eq(s.leads.id, leadId));
  const from = lead.stage as CrmStage;
  if (!canTransition(from, to, "human").ok) return from;
  await db.update(s.leads).set({ stage: to, updatedAt: new Date() }).where(eq(s.leads.id, leadId));
  await logActivity(db, { leadId, actorType: "human", actorId: actor.id, type: "stage_changed", message: `Stage ${from} → ${to} (${reason}).`, meta: { from, to } });
  return to;
}

/** Approve a draft. Drafts that failed validation need an explicit acknowledgement. */
export async function approveDraft(db: DB, id: string, actor: Actor, acknowledgeWarnings = false) {
  const d = await loadDraft(db, id);
  if (!["draft", "needs_review"].includes(d.status)) throw new OutreachError(409, `Cannot approve a draft with status "${d.status}".`);
  if (d.validationResult !== "PASS" && !acknowledgeWarnings)
    throw new OutreachError(409, "This draft did not pass the quality check. Edit it, or acknowledge the validation findings to approve anyway.");
  await db.update(s.outreachDrafts).set({ status: "approved", reviewedBy: actor.id, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(s.outreachDrafts.id, id));
  // Never downgrade a lead whose outreach was already sent.
  await db
    .update(s.leads)
    .set({ outreachStatus: "approved", updatedAt: new Date() })
    .where(and(eq(s.leads.id, d.leadId), ne(s.leads.outreachStatus, "sent")));
  await logActivity(db, {
    leadId: d.leadId,
    actorType: "human",
    actorId: actor.id,
    type: "outreach_approved",
    message: `${actor.name} approved the ${CHANNEL_LABEL[d.channel] ?? d.channel}${d.validationResult !== "PASS" ? " (validation findings acknowledged)" : ""}.`,
    meta: { draft_id: id },
  });
  await moveLeadStage(db, d.leadId, "approved", actor, "outreach approved");
}

export async function rejectDraft(db: DB, id: string, actor: Actor, reason?: string) {
  const d = await loadDraft(db, id);
  if (!["draft", "needs_review", "approved"].includes(d.status)) throw new OutreachError(409, `Cannot reject a draft with status "${d.status}".`);
  await db.update(s.outreachDrafts).set({ status: "rejected", reviewedBy: actor.id, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(s.outreachDrafts.id, id));
  const remaining = await db
    .select({ id: s.outreachDrafts.id })
    .from(s.outreachDrafts)
    .where(and(eq(s.outreachDrafts.leadId, d.leadId), inArray(s.outreachDrafts.status, ["draft", "needs_review", "approved"])));
  if (!remaining.length) await db.update(s.leads).set({ outreachStatus: "rejected", updatedAt: new Date() }).where(eq(s.leads.id, d.leadId));
  await logActivity(db, {
    leadId: d.leadId,
    actorType: "human",
    actorId: actor.id,
    type: "outreach_rejected",
    message: `${actor.name} rejected the ${CHANNEL_LABEL[d.channel] ?? d.channel}${reason ? `: ${reason}` : "."}`,
    meta: { draft_id: id },
  });
}

/** Human edit. The edited text is re-validated with the same context the AI draft was checked against. */
export async function editDraft(db: DB, id: string, actor: Actor, patch: { subject?: string | null; body: string }): Promise<OutreachValidation> {
  const d = await loadDraft(db, id);
  if (!["draft", "needs_review", "rejected"].includes(d.status)) throw new OutreachError(409, `Cannot edit a draft with status "${d.status}".`);
  const [row] = await db
    .select({ company: s.companies.name, companyId: s.companies.id, contact: s.contacts.name })
    .from(s.leads)
    .innerJoin(s.companies, eq(s.companies.id, s.leads.companyId))
    .leftJoin(s.contacts, eq(s.contacts.id, s.leads.contactId))
    .where(eq(s.leads.id, d.leadId));
  const others = await db.select({ name: s.companies.name }).from(s.companies).where(ne(s.companies.id, row.companyId)).limit(500);
  const vctx = d.validationContext as { allowed_facts: string[]; personalization_phrases: string[]; detected_technologies: string[] };
  const channel = d.channel as OutreachChannel;
  const subject = channel === "linkedin" ? null : (patch.subject ?? d.subject);
  const validation = validateOutreach(
    { channel, subject, body: patch.body },
    {
      company_name: row.company,
      contact_name: row.contact,
      allowed_facts: vctx.allowed_facts,
      personalization_phrases: channel.startsWith("followup") ? [...vctx.personalization_phrases, row.company] : vctx.personalization_phrases,
      detected_technologies: vctx.detected_technologies,
      other_company_names: others.map((o) => o.name),
      is_demo: d.isDemo,
    },
  );
  await db
    .update(s.outreachDrafts)
    .set({
      subject,
      body: patch.body,
      edited: true,
      status: validation.result === "PASS" ? "draft" : "needs_review",
      validationResult: validation.result,
      validation,
      updatedAt: new Date(),
    })
    .where(eq(s.outreachDrafts.id, id));
  await logActivity(db, {
    leadId: d.leadId,
    actorType: "human",
    actorId: actor.id,
    type: "outreach_edited",
    message: `${actor.name} edited the ${CHANNEL_LABEL[channel] ?? channel}; re-validation: ${validation.result === "PASS" ? "PASS" : "NEEDS REVIEW"}.`,
    meta: { draft_id: id },
  });
  return validation;
}

/** There is no email integration: "send" records that a human sent the approved message themselves. */
export async function markSent(db: DB, id: string, actor: Actor) {
  const d = await loadDraft(db, id);
  if (d.status !== "approved") throw new OutreachError(409, "Only approved drafts can be marked as sent.");
  await db.update(s.outreachDrafts).set({ status: "sent", sentAt: new Date(), updatedAt: new Date() }).where(eq(s.outreachDrafts.id, id));
  await db.update(s.leads).set({ outreachStatus: "sent", updatedAt: new Date() }).where(eq(s.leads.id, d.leadId));
  await logActivity(db, {
    leadId: d.leadId,
    actorType: "human",
    actorId: actor.id,
    type: "outreach_sent",
    message: `${actor.name} marked the ${CHANNEL_LABEL[d.channel] ?? d.channel} as sent (sent manually outside this app).`,
    meta: { draft_id: id },
  });
  await moveLeadStage(db, d.leadId, "contacted", actor, "outreach sent");
}
