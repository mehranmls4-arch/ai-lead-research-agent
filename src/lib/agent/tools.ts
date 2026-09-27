import { z } from "zod";
import type { ResearchStatus } from "../domain/lead";
import { matchIcp } from "../engine/icp";
import { validateBuyingSignals } from "../engine/buying-signals";
import { hiringSignalCandidates } from "../engine/operational-signals";
import { identifyPainPoints, validatePainPoints } from "../engine/pain-points";
import { findAutomationOpportunities } from "../engine/opportunities";
import { calculateLeadScore } from "../engine/scoring";
import { validateOutreach, type OutreachChannel } from "../engine/outreach-validator";
import { assertPublicUrl, normalizeWebsite } from "../security/url";
import { ExtractProfileOutputSchema, OutreachOutputSchema, SummaryOutputSchema } from "../providers/ai/schemas";
import { applyExtraction, buildBaseProfile } from "./profile-builder";
import { buildOutreachContext } from "./outreach-context";
import { mockSummary } from "../providers/ai/mock";
import type { AgentDeps, AgentState, DraftOut, LeadContext, ToolName } from "./types";

export interface ToolOutcome {
  status: "success" | "skipped" | "warning";
  summary: string;
}

export interface RunContext {
  lead: LeadContext;
  deps: AgentDeps;
  state: AgentState;
  now: () => Date;
}

export interface AgentTool<A = Record<string, unknown>> {
  name: ToolName;
  description: string;
  args: z.ZodType<A>;
  requires: ToolName[];
  status: ResearchStatus;
  defaultArgs(ctx: RunContext): A;
  inputSummary(ctx: RunContext, args: A): string;
  run(ctx: RunContext, args: A): Promise<ToolOutcome>;
}

const NoArgs = z.object({}).strict();
type NoArgs = z.infer<typeof NoArgs>;

function tool<A>(t: AgentTool<A>): AgentTool<A> {
  return t;
}

export const TOOLS = [
  tool({
    name: "research_company",
    description: "Collect company facts from the configured research provider (demo fixtures or web search).",
    args: z.object({ company_name: z.string().min(1).max(200), website: z.string().max(500).nullable().optional() }),
    requires: [],
    status: "researching",
    defaultArgs: (c) => ({ company_name: c.lead.company_name, website: c.lead.website }),
    inputSummary: (_c, a) => `company="${a.company_name}"${a.website ? `, website=${a.website}` : ""}`,
    async run(c, a) {
      const r = await c.deps.research.researchCompany({ company_name: a.company_name, website: a.website ?? null, industry: c.lead.input_industry, country: c.lead.input_country });
      c.state.research = r;
      c.state.isDemo = c.state.isDemo || r.is_demo;
      c.state.notes.push(...r.notes);
      const n = Object.keys(r.fields).length;
      return {
        status: n || r.evidence.length ? "success" : "warning",
        summary: `${r.provider}: ${n} profile field(s), ${r.evidence.length} evidence item(s), ${r.buying_signal_candidates.length} signal candidate(s)${r.is_demo ? " [demo data]" : ""}`,
      };
    },
  }),
  tool({
    name: "analyze_website",
    description: "Fetch and analyse the company's public website (robots.txt respected, SSRF-guarded, page-capped).",
    args: z.object({ url: z.string().max(500).nullable() }),
    requires: ["research_company"],
    status: "enriching",
    defaultArgs: (c) => ({ url: c.lead.website }),
    inputSummary: (_c, a) => (a.url ? `url=${a.url}` : "no website supplied"),
    async run(c, a) {
      if (!a.url) {
        c.state.website = { analysis: null, notes: ["No website supplied."] };
        return { status: "skipped", summary: "No website supplied; website analysis skipped." };
      }
      const norm = normalizeWebsite(a.url);
      if (!norm.ok) {
        c.state.website = { analysis: null, notes: [`Website rejected: ${norm.error}`] };
        return { status: "warning", summary: `Website rejected: ${norm.error}` };
      }
      if (!c.deps.research.isDemo) {
        const check = await assertPublicUrl(norm.url);
        if (!check.ok) {
          c.state.website = { analysis: null, notes: [`Website rejected: ${check.error}`] };
          return { status: "warning", summary: `Website rejected: ${check.error}` };
        }
      }
      const w = await c.deps.research.analyzeWebsite(norm.url);
      c.state.website = w;
      c.state.notes.push(...w.notes);
      if (!w.analysis) return { status: "warning", summary: w.notes.join(" ") || "Website could not be analysed." };
      const a2 = w.analysis;
      return {
        status: "success",
        summary: `${a2.pages.length} page(s); ${a2.forms.length} form(s), ${a2.ctas.length} CTA(s), ${a2.technologies.length} technolog${a2.technologies.length === 1 ? "y" : "ies"}${a2.source_type === "demo" ? " [demo data]" : ""}`,
      };
    },
  }),
  tool({
    name: "extract_profile",
    description: "Build a structured, source-attributed company profile from the collected evidence.",
    args: NoArgs,
    requires: ["analyze_website"],
    status: "enriching",
    defaultArgs: () => ({}),
    inputSummary: (c) => `${c.state.research?.evidence.length ?? 0} research evidence item(s); website ${c.state.website?.analysis ? "available" : "unavailable"}`,
    async run(c) {
      const now = c.now().toISOString();
      const analysis = c.state.website?.analysis ?? null;
      const base = buildBaseProfile(c.lead, c.state.research, analysis, now);
      let profile = base.profile;
      let extra = "";
      if (base.missing.length && base.evidence.length) {
        const out = await c.deps.ai
          .generateStructured({
            task: "extract_profile",
            instructions: `Fill only these missing fields: ${base.missing.join(", ")}. Cite evidence ids. Return null when evidence is insufficient.`,
            input: {
              company_name: c.lead.company_name,
              missing_fields: base.missing,
              evidence: base.evidence.map((e) => ({ id: e.id, kind: e.kind, statement: e.statement })),
              website: analysis
                ? { title: analysis.title, meta_description: analysis.meta_description, services: analysis.services, text_sample: analysis.text_sample.slice(0, 3000) }
                : null,
            },
            schema: ExtractProfileOutputSchema,
          })
          .catch((e: unknown) => {
            // Degrade safely: keep the deterministic, evidence-derived profile.
            c.state.notes.push(`AI extraction failed (${e instanceof Error ? e.message : "unknown error"}); using the deterministic profile only.`);
            extra += "; AI extraction failed, deterministic profile used";
            return null;
          });
        if (out) {
          const applied = applyExtraction(base, out, c.deps.ai.name, c.deps.ai.isMock, now);
          profile = applied.profile;
          if (applied.applied.length) extra += `; extracted ${applied.applied.join(", ")}`;
          if (applied.rejected.length) {
            extra += `; rejected ${applied.rejected.length} unsupported field(s)`;
            c.state.notes.push(`Rejected AI-extracted fields: ${applied.rejected.join("; ")}`);
          }
        }
      }
      c.state.profile = profile;
      c.state.evidence = base.evidence;
      const known = ["description", "industry", "size_range", "country", "services", "business_model"].filter((k) => (profile as Record<string, unknown>)[k]);
      return {
        status: known.length ? "success" : "warning",
        summary: `${known.length} core field(s) established; ${profile.operational_signals.length} operational signal(s); ${profile.technology_signals.length} technology signal(s)${extra}`,
      };
    },
  }),
  tool({
    name: "match_icp",
    description: "Evaluate the profile against the configured Ideal Customer Profile (deterministic).",
    args: NoArgs,
    requires: ["extract_profile"],
    status: "qualifying",
    defaultArgs: () => ({}),
    inputSummary: (c) => `ICP "${c.deps.icp.name}"`,
    async run(c) {
      const r = matchIcp(c.state.profile!, c.deps.icp);
      c.state.icpResult = r;
      return {
        status: r.match === "insufficient_data" ? "warning" : "success",
        summary: `fit ${r.fit_score}/100 (${r.match.replace("_", " ")}); unknown: ${r.unknown_factors.join(", ") || "none"}`,
      };
    },
  }),
  tool({
    name: "detect_buying_signals",
    description: "Collect buying-signal candidates and keep only those with evidence, source, confidence and date.",
    args: NoArgs,
    requires: ["extract_profile"],
    status: "qualifying",
    defaultArgs: () => ({}),
    inputSummary: (c) =>
      `${c.state.research?.buying_signal_candidates.length ?? 0} research candidate(s); careers content ${c.state.website?.analysis?.hiring_mentions.length ? "present" : "absent"}`,
    async run(c) {
      const web = c.state.website?.analysis;
      const candidates = [...(c.state.research?.buying_signal_candidates ?? []), ...(web ? hiringSignalCandidates(web, c.state.evidence) : [])];
      const res = validateBuyingSignals(candidates);
      c.state.signals = res;
      return { status: "success", summary: `${res.accepted.length} validated signal(s); ${res.rejected.length} rejected for missing/weak evidence` };
    },
  }),
  tool({
    name: "identify_pain_points",
    description: "Form evidence-linked hypotheses about potential business problems.",
    args: NoArgs,
    requires: ["detect_buying_signals"],
    status: "qualifying",
    defaultArgs: () => ({}),
    inputSummary: (c) => `${c.state.profile?.operational_signals.length ?? 0} operational signal(s), ${c.state.signals?.accepted.length ?? 0} buying signal(s)`,
    async run(c) {
      const raw = identifyPainPoints(c.state.profile!, c.state.evidence, c.state.signals?.accepted ?? []);
      const v = validatePainPoints(raw, c.state.evidence);
      c.state.painPoints = v.accepted;
      c.state.rejectedPainPoints = v.rejected;
      return { status: "success", summary: `${v.accepted.length} potential pain point(s)${v.rejected.length ? `; ${v.rejected.length} rejected` : ""}` };
    },
  }),
  tool({
    name: "find_automation_opportunities",
    description: "Map potential pain points to NovaFlow AI services (no ROI claims).",
    args: NoArgs,
    requires: ["identify_pain_points"],
    status: "qualifying",
    defaultArgs: () => ({}),
    inputSummary: (c) => `${c.state.painPoints?.length ?? 0} pain point(s)`,
    async run(c) {
      const o = findAutomationOpportunities(c.state.painPoints ?? []);
      c.state.opportunities = o;
      return { status: "success", summary: o.length ? o.map((x) => x.title).join(", ") : "No evidence-backed opportunities" };
    },
  }),
  tool({
    name: "calculate_lead_score",
    description: "Compute the transparent weighted lead score (deterministic).",
    args: NoArgs,
    requires: ["match_icp", "find_automation_opportunities"],
    status: "scoring",
    defaultArgs: () => ({}),
    inputSummary: () => "9 weighted factors from configured weights",
    async run(c) {
      const s = calculateLeadScore({
        profile: c.state.profile!,
        icpResult: c.state.icpResult!,
        signals: c.state.signals?.accepted ?? [],
        painPoints: c.state.painPoints ?? [],
        opportunities: c.state.opportunities ?? [],
        contactTitle: c.lead.contact?.title,
        icp: c.deps.icp,
        isDemo: c.state.isDemo,
      });
      c.state.score = s;
      return {
        status: s.needs_review ? "warning" : "success",
        summary: `${s.total}/100 (grade ${s.grade})${s.qualified ? ", qualified" : ""}${s.needs_review ? ", needs review" : ""}`,
      };
    },
  }),
  tool({
    name: "generate_outreach",
    description: "Draft a cold email, LinkedIn note and two follow-ups grounded in observed evidence.",
    args: z.object({ force: z.boolean().optional() }),
    requires: ["calculate_lead_score"],
    status: "scoring",
    defaultArgs: (c) => ({ force: Boolean(c.lead.force_outreach) }),
    inputSummary: (c, a) => `score ${c.state.score?.total ?? "?"}/100${a.force ? ", forced by user" : ""}`,
    async run(c, a) {
      const s = c.state.score!;
      const skip = (reason: string) => {
        c.state.outreach = { drafts: [], skipped_reason: reason, personalization_phrases: [], allowed_facts: [] };
        return { status: "skipped" as const, summary: reason };
      };
      const force = Boolean(a.force || c.lead.force_outreach);
      if (!force && s.needs_review) return skip("Skipped: lead needs review before outreach (insufficient evidence).");
      if (!force && s.total < c.deps.icp.qualification_threshold)
        return skip(`Skipped: score ${s.total} is below the qualification threshold (${c.deps.icp.qualification_threshold}).`);
      const ctx = buildOutreachContext({
        company_name: c.lead.company_name,
        contact_name: c.lead.contact?.name ?? null,
        profile: c.state.profile!,
        evidence: c.state.evidence,
        website: c.state.website?.analysis ?? null,
        signals: c.state.signals?.accepted ?? [],
        painPoints: c.state.painPoints ?? [],
        opportunities: c.state.opportunities ?? [],
        sender: c.deps.sender ?? { name: "Alex Morgan", company: "NovaFlow AI" },
      });
      if (!ctx) return skip("Skipped: no evidence-backed automation opportunity or observation to reference, so outreach would be generic.");
      let out;
      try {
        out = await c.deps.ai.generateStructured({
          task: "generate_outreach",
          instructions:
            "Write a cold email (subject, opening, observation, potential problem, relevant solution, soft CTA), a LinkedIn note under 300 characters and two short follow-ups. Reference only the supplied observations. No generic openings, no fake familiarity, no metrics, no technologies that are not in allowed_facts, no pressure language.",
          input: ctx.input,
          schema: OutreachOutputSchema,
        });
      } catch (e) {
        return skip(`Skipped: the AI provider failed to generate outreach (${e instanceof Error ? e.message : "unknown error"}). Use Regenerate to retry.`);
      }
      const drafts: DraftOut[] = [
        { channel: "email", subject: out.email.subject, body: out.email.body },
        { channel: "linkedin", subject: null, body: out.linkedin.body },
        { channel: "followup_1", subject: out.followup_1.subject, body: out.followup_1.body },
        { channel: "followup_2", subject: out.followup_2.subject, body: out.followup_2.body },
      ];
      c.state.outreach = { drafts, skipped_reason: null, personalization_phrases: ctx.personalization_phrases, allowed_facts: ctx.allowed_facts };
      return { status: "success", summary: `4 drafts (email, LinkedIn, 2 follow-ups) referencing ${ctx.input.observations.length} observation(s)` };
    },
  }),
  tool({
    name: "validate_outreach",
    description: "Check every draft for personalisation, correct names, unsupported claims, invented metrics, hallucinated technology and tone.",
    args: NoArgs,
    requires: ["generate_outreach"],
    status: "scoring",
    defaultArgs: () => ({}),
    inputSummary: (c) => `${c.state.outreach?.drafts.length ?? 0} draft(s)`,
    async run(c) {
      const o = c.state.outreach;
      if (!o || !o.drafts.length) return { status: "skipped", summary: "No drafts to validate." };
      let pass = 0;
      for (const d of o.drafts) {
        d.validation = validateOutreach(
          { channel: d.channel as OutreachChannel, subject: d.subject, body: d.body },
          {
            company_name: c.lead.company_name,
            contact_name: c.lead.contact?.name,
            allowed_facts: o.allowed_facts,
            personalization_phrases: d.channel.startsWith("followup") ? [...o.personalization_phrases, c.lead.company_name] : o.personalization_phrases,
            detected_technologies: c.state.profile?.technology_signals.map((t) => t.name) ?? [],
            other_company_names: c.deps.knownCompanyNames,
            is_demo: c.state.isDemo,
          },
        );
        if (d.validation.result === "PASS") pass++;
      }
      return { status: pass === o.drafts.length ? "success" : "warning", summary: `${pass}/${o.drafts.length} PASS; ${o.drafts.length - pass} NEEDS REVIEW` };
    },
  }),
  tool({
    name: "update_crm",
    description: "Persist the research report, scores and drafts, and move the lead to its next CRM stage.",
    args: NoArgs,
    requires: ["calculate_lead_score", "validate_outreach"],
    status: "scoring",
    defaultArgs: () => ({}),
    inputSummary: (c) => `lead ${c.lead.lead_id.slice(0, 8)}; current stage ${c.lead.stage}`,
    async run(c) {
      const st = c.state;
      const summaryInput = {
        company_name: c.lead.company_name,
        industry: st.profile?.industry?.value ?? null,
        industry_label: st.profile?.industry?.provenance.label ?? null,
        icp_match: st.icpResult!.match,
        fit_score: st.icpResult!.fit_score,
        lead_score: st.score!.total,
        top_pain_point: st.painPoints?.[0]?.title ?? null,
        top_opportunity: st.opportunities?.[0]?.title ?? null,
        signals: st.signals?.accepted.map((s) => s.signal) ?? [],
        is_demo: st.isDemo,
      };
      let generatedBy = c.deps.ai.name;
      const sum = await c.deps.ai
        .generateStructured({
          task: "summarize_lead",
          instructions: "Summarise the findings in 3-4 neutral sentences using only the supplied values, then give a recommended outreach angle. Hedge hypotheses.",
          input: summaryInput,
          schema: SummaryOutputSchema,
        })
        .catch(() => {
          // Degrade safely: a deterministic template built from the same stored values.
          generatedBy = "deterministic template (AI provider unavailable)";
          st.notes.push("AI summary failed; used the deterministic summary template.");
          return mockSummary(summaryInput);
        });
      st.summary = { ...sum, generated_by: generatedBy };
      st.finalStatus = st.score!.needs_review ? "needs_review" : "ready";
      const stage = await c.deps.crm.save(c.lead, st, { aiProvider: c.deps.ai.name, researchProvider: c.deps.research.name });
      st.finalStage = stage;
      return { status: "success", summary: `saved report, score and ${st.outreach?.drafts.length ?? 0} draft(s); stage → ${stage}` };
    },
  }),
] as AgentTool<unknown>[];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

export function toolSpecs(tools: AgentTool<unknown>[]) {
  return tools.map((t) => {
    const params = z.toJSONSchema(t.args as z.ZodType, { unrepresentable: "any" }) as Record<string, unknown>;
    delete params.$schema;
    return { name: t.name, description: t.description, parameters: params };
  });
}
