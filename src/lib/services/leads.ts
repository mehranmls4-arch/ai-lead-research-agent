import { and, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import * as s from "../db/schema";
import type { LeadInput } from "../domain/lead";
import { domainOf, normalizeWebsite } from "../security/url";
import { logActivity } from "./activity";

export class LeadInputError extends Error {}

export interface CreateLeadResult {
  leadId: string;
  companyId: string;
  created: boolean;
}

/**
 * Creates (or reuses) the company, contact and lead for an input row.
 * One lead per company: re-submitting a known company returns its existing lead.
 */
export async function createOrReuseLead(
  db: DB,
  input: LeadInput,
  opts: { userId: string | null; source: "manual" | "csv" | "demo" | "seed" },
): Promise<CreateLeadResult> {
  let website: string | null = null;
  if (input.website) {
    const n = normalizeWebsite(input.website);
    if (!n.ok) throw new LeadInputError(`Website: ${n.error}`);
    website = n.url;
  }
  const domain = domainOf(website);

  return db.transaction(async (tx) => {
    let company = domain
      ? (await tx.select().from(s.companies).where(eq(s.companies.domain, domain)).limit(1))[0]
      : (await tx.select().from(s.companies).where(and(isNull(s.companies.domain), sql`lower(${s.companies.name}) = lower(${input.company_name})`)).limit(1))[0];
    if (!company) {
      [company] = await tx.insert(s.companies).values({ name: input.company_name, domain, website }).returning();
    }

    let contactId: string | null = null;
    if (input.contact_name || input.contact_email) {
      const existing = input.contact_email
        ? (await tx.select().from(s.contacts).where(and(eq(s.contacts.companyId, company.id), sql`lower(${s.contacts.email}) = lower(${input.contact_email})`)).limit(1))[0]
        : undefined;
      if (existing) {
        contactId = existing.id;
        await tx.update(s.contacts).set({ name: input.contact_name ?? existing.name, title: input.title ?? existing.title }).where(eq(s.contacts.id, existing.id));
      } else {
        const [c] = await tx.insert(s.contacts).values({ companyId: company.id, name: input.contact_name ?? null, email: input.contact_email ?? null, title: input.title ?? null }).returning();
        contactId = c.id;
      }
    }

    const [existingLead] = await tx.select().from(s.leads).where(eq(s.leads.companyId, company.id)).limit(1);
    if (existingLead) {
      await tx
        .update(s.leads)
        .set({
          contactId: contactId ?? existingLead.contactId,
          inputIndustry: input.industry ?? existingLead.inputIndustry,
          inputCountry: input.country ?? existingLead.inputCountry,
          updatedAt: new Date(),
        })
        .where(eq(s.leads.id, existingLead.id));
      return { leadId: existingLead.id, companyId: company.id, created: false };
    }
    const [lead] = await tx
      .insert(s.leads)
      .values({ companyId: company.id, contactId, ownerId: opts.userId, inputIndustry: input.industry ?? null, inputCountry: input.country ?? null, source: opts.source })
      .returning();
    await logActivity(tx, {
      leadId: lead.id,
      actorType: opts.userId ? "human" : "system",
      actorId: opts.userId,
      type: "lead_created",
      message: `Lead created (${opts.source === "csv" ? "CSV import" : opts.source}).`,
    });
    return { leadId: lead.id, companyId: company.id, created: true };
  });
}
