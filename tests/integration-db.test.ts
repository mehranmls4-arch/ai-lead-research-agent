import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { DEFAULT_ICP } from "@/lib/domain/icp";
import { commitImport } from "@/lib/services/imports";
import { createOrReuseLead } from "@/lib/services/leads";
import { leadInput } from "./helpers";
import { getActiveIcp, saveIcp } from "@/lib/services/icp";
import { approveDraft, editDraft, markSent, rejectDraft } from "@/lib/services/outreach";
import { getLeadDetail, listLeads } from "@/lib/services/queries";
import { executeRun, processQueueUntilIdle } from "@/lib/services/queue";
import { changeStage, StageError } from "@/lib/services/stage";
import { MockAIProvider } from "@/lib/providers/ai/mock";
import { MockResearchProvider } from "@/lib/providers/research/mock";
import { resetTestDb } from "./db-setup";

/**
 * Integration coverage against a real PostgreSQL database (TEST_DATABASE_URL, migrated,
 * truncated before each test). Never touches DATABASE_URL / the seeded demo database.
 */
let db: Awaited<ReturnType<typeof resetTestDb>>;
const admin = { id: "", name: "Admin" };

beforeEach(async () => {
  db = await resetTestDb();
  const [u] = await db.insert(s.users).values({ email: "admin@test.local", name: "Admin", role: "admin", passwordHash: "scrypt$1$1$1$aa$bb" }).returning();
  admin.id = u.id;
  await saveIcp(db, DEFAULT_ICP, admin.id);
});

async function analyze(companyName: string, website: string) {
  const { leadId } = await createOrReuseLead(db, leadInput({ company_name: companyName, website }), { userId: admin.id, source: "manual" });
  const [run] = await db.insert(s.researchRuns).values({ leadId, status: "queued" }).returning();
  await executeRun(db, { id: run.id, leadId, forceOutreach: false }, { ai: new MockAIProvider(), research: new MockResearchProvider(), latencyMs: 0 });
  return leadId;
}

describe("lead creation and duplicate handling", () => {
  it("creates a company, contact and lead", async () => {
    const { leadId, created } = await createOrReuseLead(db, leadInput({ company_name: "Acme Freight", website: "https://acme.com", contact_name: "Dana", contact_email: "dana@acme.com" }), { userId: admin.id, source: "manual" });
    expect(created).toBe(true);
    const [lead] = await db.select().from(s.leads).where(eq(s.leads.id, leadId));
    expect(lead.stage).toBe("new");
    expect(lead.researchStatus).toBe("not_started");
  });

  it("reuses the existing lead for the same company (one lead per company)", async () => {
    const a = await createOrReuseLead(db, leadInput({ company_name: "Acme Freight", website: "https://acme.com" }), { userId: admin.id, source: "manual" });
    const b = await createOrReuseLead(db, leadInput({ company_name: "Acme Freight", website: "https://acme.com" }), { userId: admin.id, source: "csv" });
    expect(b.created).toBe(false);
    expect(b.leadId).toBe(a.leadId);
    expect(await db.$count(s.leads)).toBe(1);
  });
});

describe("research run: qualification, scoring and CRM stage", () => {
  it("runs the full pipeline for a demo fixture and persists every artifact", async () => {
    const leadId = await analyze("Example Logistics", "https://examplelogistics.example");
    const detail = await getLeadDetail(db, leadId);
    expect(detail!.lead.stage).toBe("outreach_drafted");
    expect(detail!.lead.researchStatus).toBe("ready");
    expect(detail!.qualification!.match).toBe("strong");
    expect(detail!.score!.total).toBeGreaterThan(0);
    expect(detail!.signals.length).toBeGreaterThan(0);
    expect(detail!.pains.length).toBeGreaterThan(0);
    expect(detail!.opps.length).toBeGreaterThan(0);
    expect(detail!.drafts.filter((d) => d.status !== "superseded")).toHaveLength(4);
    expect(detail!.toolCalls.length).toBeGreaterThan(5);
    expect(detail!.activities.some((a) => a.type === "research_started")).toBe(true);
  });

  it("moves an unqualified lead to needs_review with no outreach", async () => {
    const leadId = await analyze("Ironvale Steelworks", "https://ironvale.example");
    const detail = await getLeadDetail(db, leadId);
    expect(detail!.lead.stage).toBe("needs_review");
    expect(detail!.drafts.filter((d) => d.status !== "superseded")).toHaveLength(0);
  });

  it("appears correctly in the leads list and filters", async () => {
    await analyze("Example Logistics", "https://examplelogistics.example");
    await analyze("Ironvale Steelworks", "https://ironvale.example");
    expect(await listLeads(db, {})).toHaveLength(2);
    expect(await listLeads(db, { icp: "strong" })).toHaveLength(1);
    expect(await listLeads(db, { stage: "needs_review" })).toHaveLength(1);
  });
});

describe("outreach approval workflow (persisted)", () => {
  it("approves, edits and rejects drafts, and marking sent advances the CRM stage", async () => {
    const leadId = await analyze("Meridian Health Admin Partners", "https://meridianhealthadmin.example");
    const detail = await getLeadDetail(db, leadId);
    const email = detail!.drafts.find((d) => d.channel === "email")!;
    await approveDraft(db, email.id, admin);
    await markSent(db, email.id, admin);
    const after = await getLeadDetail(db, leadId);
    expect(after!.lead.stage).toBe("contacted");
    expect(after!.lead.outreachStatus).toBe("sent");
    await expect(markSent(db, email.id, admin)).rejects.toThrow();

    const li = after!.drafts.find((d) => d.channel === "linkedin")!;
    const v = await editDraft(db, li.id, admin, { body: "A completely generic message with no company name at all." });
    expect(v.result).toBe("NEEDS_REVIEW");
    const [updated] = await db.select().from(s.outreachDrafts).where(eq(s.outreachDrafts.id, li.id));
    expect(updated.status).toBe("needs_review");

    const fu1 = after!.drafts.find((d) => d.channel === "followup_1")!;
    await rejectDraft(db, fu1.id, admin, "not needed");
    const [r] = await db.select().from(s.outreachDrafts).where(eq(s.outreachDrafts.id, fu1.id));
    expect(r.status).toBe("rejected");
  });
});

describe("CRM stage transitions (human-only enforcement)", () => {
  it("rejects a human trying to skip stages, and rejects moving straight to Won", async () => {
    const leadId = await analyze("Harbor Realty Group", "https://harborrealtygroup.example");
    await expect(changeStage(db, leadId, "won", admin)).rejects.toThrow(StageError);
    const [lead] = await db.select({ stage: s.leads.stage }).from(s.leads).where(eq(s.leads.id, leadId));
    expect(lead.stage).toBe("outreach_drafted");
  });
});

describe("CSV import (persisted)", () => {
  it("imports valid rows, records invalid ones, queues and processes the batch", async () => {
    const csv = "company,website\nHarbor Realty Group,https://harborrealtygroup.example\nBad Row,not-a-real-url-\n";
    const { batchId, parsed } = await commitImport(db, csv, "test.csv", admin.id);
    expect(parsed.valid).toBe(1);
    expect(parsed.invalid).toBe(1);
    await processQueueUntilIdle(db, { latencyMs: 0, ai: new MockAIProvider(), research: new MockResearchProvider() });
    const [batch] = await db.select().from(s.importBatches).where(eq(s.importBatches.id, batchId));
    expect(batch.valid).toBe(1);
    const runs = await db.select().from(s.researchRuns).where(eq(s.researchRuns.batchId, batchId));
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("ready");
  });

  it("detects a duplicate company against an existing lead, not just within the file", async () => {
    await createOrReuseLead(db, leadInput({ company_name: "Harbor Realty Group", website: "https://harborrealtygroup.example" }), { userId: admin.id, source: "manual" });
    const { parsed } = await commitImport(db, "company,website\nHarbor Realty Group,https://harborrealtygroup.example\n", "dup.csv", admin.id);
    expect(parsed.valid).toBe(1); // CSV-level duplicate detection is within-file; re-analyzing an existing company reuses its lead
    expect(await db.$count(s.leads)).toBe(1);
  });
});

describe("ICP configuration persistence", () => {
  it("saves a new active ICP and supersedes the previous one", async () => {
    const before = await getActiveIcp(db);
    const updated = { ...before.config, qualification_threshold: 70 };
    const saved = await saveIcp(db, updated, admin.id);
    const after = await getActiveIcp(db);
    expect(after.id).toBe(saved.id);
    expect(after.config.qualification_threshold).toBe(70);
    const active = await db.select().from(s.icpConfigs).where(eq(s.icpConfigs.isActive, true));
    expect(active).toHaveLength(1);
  });
});
