import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "../db/client";
import * as s from "../db/schema";
import type { CompanyProfile } from "../domain/profile";
import type { Evidence } from "../domain/provenance";
import type { WebsiteAnalysis } from "../domain/website";
import type { IcpFactor } from "../engine/icp";
import type { ScoreFactor } from "../engine/scoring";
import type { OutreachValidation } from "../engine/outreach-validator";
import type { ScoreWeights } from "../domain/icp";

export interface LeadFilters {
  q?: string;
  stage?: string;
  industry?: string;
  icp?: string;
  research?: string;
  outreach?: string;
  minScore?: number;
  maxScore?: number;
  sort?: "score" | "updated" | "company";
}

export async function listLeads(db: DB, f: LeadFilters = {}, limit = 200) {
  const where: SQL[] = [];
  if (f.q) where.push(or(ilike(s.companies.name, `%${f.q}%`), ilike(s.contacts.name, `%${f.q}%`))!);
  if (f.stage) where.push(eq(s.leads.stage, f.stage));
  if (f.industry) where.push(f.industry === "unknown" ? sql`${s.companies.industry} is null` : eq(s.companies.industry, f.industry));
  if (f.icp) where.push(eq(s.leads.icpMatch, f.icp));
  if (f.research) where.push(eq(s.leads.researchStatus, f.research));
  if (f.outreach) where.push(eq(s.leads.outreachStatus, f.outreach));
  if (f.minScore !== undefined) where.push(gte(s.leads.leadScore, f.minScore));
  if (f.maxScore !== undefined) where.push(lte(s.leads.leadScore, f.maxScore));
  const order =
    f.sort === "company" ? [asc(s.companies.name)] : f.sort === "updated" ? [desc(s.leads.updatedAt)] : [sql`${s.leads.leadScore} desc nulls last`, desc(s.leads.updatedAt)];
  return db
    .select({
      id: s.leads.id,
      company: s.companies.name,
      domain: s.companies.domain,
      industry: s.companies.industry,
      country: s.companies.country,
      contact: s.contacts.name,
      contactTitle: s.contacts.title,
      fitScore: s.leads.fitScore,
      icpMatch: s.leads.icpMatch,
      leadScore: s.leads.leadScore,
      stage: s.leads.stage,
      researchStatus: s.leads.researchStatus,
      outreachStatus: s.leads.outreachStatus,
      isDemo: s.leads.isDemo,
      updatedAt: s.leads.updatedAt,
    })
    .from(s.leads)
    .innerJoin(s.companies, eq(s.companies.id, s.leads.companyId))
    .leftJoin(s.contacts, eq(s.contacts.id, s.leads.contactId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(...order)
    .limit(limit);
}
export type LeadRow = Awaited<ReturnType<typeof listLeads>>[number];

export async function listIndustries(db: DB): Promise<string[]> {
  const rows = await db.selectDistinct({ i: s.companies.industry }).from(s.companies).where(isNotNull(s.companies.industry));
  return rows.map((r) => r.i!).sort();
}

export async function getLeadDetail(db: DB, id: string) {
  const [row] = await db
    .select({ lead: s.leads, company: s.companies, contact: s.contacts })
    .from(s.leads)
    .innerJoin(s.companies, eq(s.companies.id, s.leads.companyId))
    .leftJoin(s.contacts, eq(s.contacts.id, s.leads.contactId))
    .where(eq(s.leads.id, id));
  if (!row) return null;

  const [latestRun] = await db.select().from(s.researchRuns).where(eq(s.researchRuns.leadId, id)).orderBy(desc(s.researchRuns.createdAt)).limit(1);
  const resultRunId = row.lead.latestRunId; // last run that completed and saved results

  const [report] = resultRunId ? await db.select().from(s.researchReports).where(eq(s.researchReports.researchRunId, resultRunId)) : [];
  const [qualification] = resultRunId ? await db.select().from(s.qualifications).where(eq(s.qualifications.researchRunId, resultRunId)) : [];
  const [score] = resultRunId ? await db.select().from(s.leadScores).where(eq(s.leadScores.researchRunId, resultRunId)) : [];
  const signals = resultRunId ? await db.select().from(s.buyingSignals).where(eq(s.buyingSignals.researchRunId, resultRunId)).orderBy(desc(s.buyingSignals.confidence)) : [];
  const pains = resultRunId ? await db.select().from(s.painPoints).where(eq(s.painPoints.researchRunId, resultRunId)).orderBy(desc(s.painPoints.confidence)) : [];
  const opps = resultRunId ? await db.select().from(s.automationOpportunities).where(eq(s.automationOpportunities.researchRunId, resultRunId)).orderBy(desc(s.automationOpportunities.confidence)) : [];
  const drafts = await db
    .select()
    .from(s.outreachDrafts)
    .where(and(eq(s.outreachDrafts.leadId, id), ne(s.outreachDrafts.status, "superseded")))
    .orderBy(desc(s.outreachDrafts.version), sql`array_position(array['email','linkedin','followup_1','followup_2'], ${s.outreachDrafts.channel})`);
  const activities = await db
    .select({ a: s.leadActivities, actor: s.users.name })
    .from(s.leadActivities)
    .leftJoin(s.users, eq(s.users.id, s.leadActivities.actorId))
    .where(eq(s.leadActivities.leadId, id))
    .orderBy(desc(s.leadActivities.createdAt))
    .limit(100);
  const runs = await db.select().from(s.researchRuns).where(eq(s.researchRuns.leadId, id)).orderBy(desc(s.researchRuns.createdAt)).limit(10);
  const [agentRun] = latestRun ? await db.select().from(s.agentRuns).where(eq(s.agentRuns.researchRunId, latestRun.id)).orderBy(desc(s.agentRuns.startedAt)).limit(1) : [];
  const toolCalls = agentRun ? await db.select().from(s.toolCalls).where(eq(s.toolCalls.agentRunId, agentRun.id)).orderBy(asc(s.toolCalls.seq)) : [];

  return {
    lead: row.lead,
    company: row.company,
    contact: row.contact,
    latestRun: latestRun ?? null,
    runs,
    report: report
      ? { ...report, profile: report.profile as CompanyProfile, evidence: report.evidence as Evidence[], websiteAnalysis: report.websiteAnalysis as WebsiteAnalysis | null }
      : null,
    qualification: qualification ? { ...qualification, factors: qualification.factors as IcpFactor[] } : null,
    score: score ? { ...score, factors: score.factors as ScoreFactor[], weights: score.weights as ScoreWeights } : null,
    signals,
    pains,
    opps,
    drafts: drafts.map((d) => ({ ...d, validation: d.validation as OutreachValidation })),
    activities: activities.map((x) => ({ ...x.a, actorName: x.actor })),
    agentRun: agentRun ?? null,
    toolCalls,
  };
}
export type LeadDetail = NonNullable<Awaited<ReturnType<typeof getLeadDetail>>>;

/** Lightweight status for polling the live progress view. */
export async function getRunProgress(db: DB, runId: string) {
  const [run] = await db.select().from(s.researchRuns).where(eq(s.researchRuns.id, runId));
  if (!run) return null;
  const [agentRun] = await db.select().from(s.agentRuns).where(eq(s.agentRuns.researchRunId, runId)).limit(1);
  const calls = agentRun
    ? await db
        .select({ seq: s.toolCalls.seq, tool: s.toolCalls.tool, status: s.toolCalls.status, input: s.toolCalls.inputSummary, output: s.toolCalls.outputSummary, durationMs: s.toolCalls.durationMs, selectedBy: s.toolCalls.selectedBy, startedAt: s.toolCalls.startedAt })
        .from(s.toolCalls)
        .where(eq(s.toolCalls.agentRunId, agentRun.id))
        .orderBy(asc(s.toolCalls.seq))
    : [];
  const [lead] = await db.select({ stage: s.leads.stage, leadScore: s.leads.leadScore, fitScore: s.leads.fitScore, icpMatch: s.leads.icpMatch, outreachStatus: s.leads.outreachStatus }).from(s.leads).where(eq(s.leads.id, run.leadId));
  return {
    run: { id: run.id, leadId: run.leadId, status: run.status, error: run.error, isDemo: run.isDemo, researchProvider: run.researchProvider, aiProvider: run.aiProvider, startedAt: run.startedAt, finishedAt: run.finishedAt },
    calls,
    lead,
  };
}

export async function getCrmBoard(db: DB) {
  return db
    .select({ id: s.leads.id, company: s.companies.name, contact: s.contacts.name, stage: s.leads.stage, leadScore: s.leads.leadScore, icpMatch: s.leads.icpMatch, outreachStatus: s.leads.outreachStatus, isDemo: s.leads.isDemo })
    .from(s.leads)
    .innerJoin(s.companies, eq(s.companies.id, s.leads.companyId))
    .leftJoin(s.contacts, eq(s.contacts.id, s.leads.contactId))
    .orderBy(sql`${s.leads.leadScore} desc nulls last`);
}

export async function pendingApprovals(db: DB) {
  return db
    .select({ leadId: s.leads.id, company: s.companies.name, n: sql<number>`count(*)::int` })
    .from(s.outreachDrafts)
    .innerJoin(s.leads, eq(s.leads.id, s.outreachDrafts.leadId))
    .innerJoin(s.companies, eq(s.companies.id, s.leads.companyId))
    .where(inArray(s.outreachDrafts.status, ["draft", "needs_review"]))
    .groupBy(s.leads.id, s.companies.name);
}
