import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import * as s from "../db/schema";
import type { AgentState, CrmWriter, LeadContext, RunRecorder, ToolName } from "../agent/types";
import type { CrmStage, OutreachStatus, ResearchStatus } from "../domain/lead";
import { canTransition } from "../engine/crm";
import type { IcpConfig } from "../domain/icp";
import { logActivity } from "./activity";

/** Records agent/tool activity to the database for the observability panel. */
export class DbRunRecorder implements RunRecorder {
  private seq = 0;
  constructor(private readonly db: DB, private readonly agentRunId: string, private readonly researchRunId: string, private readonly leadId: string) {}

  async toolStarted(tool: ToolName, inputSummary: string, selectedBy: "planner" | "fallback") {
    const [row] = await this.db
      .insert(s.toolCalls)
      .values({ agentRunId: this.agentRunId, seq: ++this.seq, tool, inputSummary: inputSummary.slice(0, 500), selectedBy, status: "running" })
      .returning({ id: s.toolCalls.id });
    await this.db.update(s.agentRuns).set({ steps: this.seq }).where(eq(s.agentRuns.id, this.agentRunId));
    return row.id;
  }

  async toolFinished(id: string, r: { status: string; output_summary: string; duration_ms: number }) {
    await this.db.update(s.toolCalls).set({ status: r.status, outputSummary: r.output_summary.slice(0, 1000), durationMs: r.duration_ms }).where(eq(s.toolCalls.id, id));
  }

  async setResearchStatus(status: ResearchStatus) {
    await this.db.update(s.researchRuns).set({ status }).where(eq(s.researchRuns.id, this.researchRunId));
    await this.db.update(s.leads).set({ researchStatus: status, updatedAt: new Date() }).where(eq(s.leads.id, this.leadId));
  }
}

/** Persists pipeline results and applies AI-allowed CRM stage transitions only. */
export class DbCrmWriter implements CrmWriter {
  constructor(private readonly db: DB, private readonly researchRunId: string, private readonly icp: IcpConfig) {}

  async save(lead: LeadContext, st: AgentState, meta: { aiProvider: string; researchProvider: string }): Promise<CrmStage> {
    const runId = this.researchRunId;
    const score = st.score!;
    const icpR = st.icpResult!;
    return this.db.transaction(async (tx) => {
      await tx.insert(s.researchReports).values({
        leadId: lead.lead_id,
        researchRunId: runId,
        profile: st.profile!,
        evidence: st.evidence,
        websiteAnalysis: st.website?.analysis ?? null,
        summary: st.summary?.summary ?? null,
        recommendedAngle: st.summary?.recommended_angle ?? null,
        summaryGeneratedBy: st.summary?.generated_by ?? null,
        dataCompleteness: score.data_completeness,
        isDemo: st.isDemo,
      });
      await tx.insert(s.qualifications).values({ leadId: lead.lead_id, researchRunId: runId, fitScore: icpR.fit_score, match: icpR.match, factors: icpR.factors, icpSnapshot: this.icp });
      await tx.insert(s.leadScores).values({
        leadId: lead.lead_id,
        researchRunId: runId,
        total: score.total,
        grade: score.grade,
        factors: score.factors,
        weights: score.weights,
        needsReview: score.needs_review,
        reviewReasons: score.review_reasons,
        qualified: score.qualified,
      });
      const sigs = st.signals?.accepted ?? [];
      if (sigs.length)
        await tx.insert(s.buyingSignals).values(
          sigs.map((x) => ({ leadId: lead.lead_id, researchRunId: runId, signal: x.signal, category: x.category, strength: x.strength, evidence: x.evidence, source: x.source, sourceType: x.source_type, sourceUrl: x.source_url, confidence: x.confidence, label: x.label, detectedAt: new Date(x.detected_at) })),
        );
      const pps = st.painPoints ?? [];
      if (pps.length)
        await tx.insert(s.painPoints).values(
          pps.map((p) => ({ leadId: lead.lead_id, researchRunId: runId, key: p.key, title: p.title, description: p.description, evidence: p.evidence, evidenceIds: p.evidence_ids, severity: p.severity, confidence: p.confidence })),
        );
      const ops = st.opportunities ?? [];
      if (ops.length)
        await tx.insert(s.automationOpportunities).values(
          ops.map((o) => ({ leadId: lead.lead_id, researchRunId: runId, key: o.key, title: o.title, problem: o.problem, evidence: o.evidence, proposedSolution: o.proposed_solution, expectedWorkflow: o.expected_workflow, complexity: o.implementation_complexity, confidence: o.confidence })),
        );

      let outreachStatus: OutreachStatus | null = null;
      const drafts = st.outreach?.drafts ?? [];
      if (drafts.length) {
        // Earlier unreviewed drafts are superseded; approved/sent drafts are kept as history.
        await tx
          .update(s.outreachDrafts)
          .set({ status: "superseded", updatedAt: new Date() })
          .where(and(eq(s.outreachDrafts.leadId, lead.lead_id), inArray(s.outreachDrafts.status, ["draft", "needs_review", "rejected"])));
        const [{ v }] = await tx.select({ v: sql<number>`coalesce(max(${s.outreachDrafts.version}), 0)` }).from(s.outreachDrafts).where(eq(s.outreachDrafts.leadId, lead.lead_id));
        await tx.insert(s.outreachDrafts).values(
          drafts.map((d) => ({
            leadId: lead.lead_id,
            researchRunId: runId,
            channel: d.channel,
            subject: d.subject,
            body: d.body,
            status: d.validation?.result === "PASS" ? "draft" : "needs_review",
            validationResult: d.validation?.result ?? "NEEDS_REVIEW",
            validation: d.validation ?? { result: "NEEDS_REVIEW", checks: [], reasons: ["Not validated"], warnings: [] },
            validationContext: {
              allowed_facts: st.outreach!.allowed_facts,
              personalization_phrases: st.outreach!.personalization_phrases,
              detected_technologies: st.profile?.technology_signals.map((t) => t.name) ?? [],
            },
            generatedBy: meta.aiProvider,
            version: Number(v) + 1,
            isDemo: st.isDemo,
          })),
        );
        outreachStatus = drafts.every((d) => d.validation?.result === "PASS") ? "drafted" : "needs_review";
      } else if (st.outreach?.skipped_reason) {
        outreachStatus = "skipped";
      }

      // Stage: AI may only move to researching/qualified/needs_review/outreach_drafted.
      const [current] = await tx.select({ stage: s.leads.stage, outreach: s.leads.outreachStatus }).from(s.leads).where(eq(s.leads.id, lead.lead_id));
      let stage = current.stage as CrmStage;
      const target: CrmStage = score.qualified ? "qualified" : "needs_review";
      const steps: CrmStage[] = [target];
      if (drafts.length) steps.push("outreach_drafted");
      for (const to of steps) {
        const ok = canTransition(stage, to, "ai");
        if (ok.ok) stage = to;
      }
      const keepOutreach = ["approved", "sent"].includes(current.outreach);
      await tx
        .update(s.leads)
        .set({
          stage,
          fitScore: icpR.fit_score,
          icpMatch: icpR.match,
          leadScore: score.total,
          outreachStatus: keepOutreach ? current.outreach : (outreachStatus ?? current.outreach),
          latestRunId: runId,
          updatedAt: new Date(),
        })
        .where(eq(s.leads.id, lead.lead_id));
      await tx.update(s.companies).set({
        industry: st.profile?.industry?.value ?? null,
        country: st.profile?.country?.value ?? null,
        sizeLabel: st.profile?.size_range?.value.label ?? null,
        updatedAt: new Date(),
      }).where(eq(s.companies.id, (await tx.select({ c: s.leads.companyId }).from(s.leads).where(eq(s.leads.id, lead.lead_id)))[0].c));

      await logActivity(tx, {
        leadId: lead.lead_id,
        actorType: "ai",
        type: "research_completed",
        message: `Research completed: ICP ${icpR.match.replace("_", " ")} (${icpR.fit_score}/100), lead score ${score.total}/100.`,
        meta: { research_run_id: runId, ai_provider: meta.aiProvider, research_provider: meta.researchProvider, demo: st.isDemo },
      });
      if (stage !== current.stage) {
        await logActivity(tx, { leadId: lead.lead_id, actorType: "ai", type: "stage_changed", message: `Stage ${current.stage} → ${stage} (automatic).`, meta: { from: current.stage, to: stage } });
      }
      if (drafts.length) {
        await logActivity(tx, { leadId: lead.lead_id, actorType: "ai", type: "outreach_drafted", message: `${drafts.length} outreach drafts generated — awaiting human approval.`, meta: { outreach_status: outreachStatus } });
      } else if (st.outreach?.skipped_reason) {
        await logActivity(tx, { leadId: lead.lead_id, actorType: "ai", type: "outreach_skipped", message: st.outreach.skipped_reason });
      }
      return stage;
    });
  }
}
