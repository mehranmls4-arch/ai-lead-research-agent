import { classifyIndustryFromText } from "../../engine/normalize";
import type { AIProvider, StructuredRequest, ToolChoice, ToolChoiceRequest } from "./types";
import { AIProviderError } from "./types";
import type { ExtractProfileOutput, OutreachInput, OutreachOutput, SummaryOutput } from "./schemas";

interface ExtractInput {
  company_name: string;
  evidence: { id: string; kind: string; statement: string }[];
  website: { title: string | null; meta_description: string | null; services: string[]; text_sample: string } | null;
  missing_fields: string[];
}

const SUBJECTS: Record<string, string> = {
  manual_quote_intake: "Quote requests at {company}",
  inquiry_response_delay: "Inbound inquiries at {company}",
  unstructured_messaging: "WhatsApp inquiries at {company}",
  manual_lead_handling: "Lead follow-up at {company}",
  repetitive_admin: "Admin workload at {company}",
  support_workload: "Support requests at {company}",
  multi_location_routing: "Routing inquiries across {company} locations",
  phone_dependent_intake: "Phone intake at {company}",
  growing_frontline_workload: "Front-line workload at {company}",
  scheduling_followups: "Scheduling follow-ups at {company}",
};

function joinObs(obs: string[]): string {
  if (obs.length <= 1) return obs[0] ?? "";
  return `${obs.slice(0, -1).join(", ")} and ${obs[obs.length - 1]}`;
}

export function mockExtractProfile(input: ExtractInput): ExtractProfileOutput {
  const ev = input.evidence;
  const idOf = (kind: string) => ev.filter((e) => e.kind === kind).map((e) => e.id);
  const out: ExtractProfileOutput = { description: null, industry: null, services: null, target_customers: null };
  if (!input.website) return out;
  const meta = idOf("meta_description");
  if (input.missing_fields.includes("description") && input.website.meta_description && meta.length) {
    out.description = { value: input.website.meta_description.slice(0, 400), evidence_ids: meta, confidence: 0.7 };
  }
  if (input.missing_fields.includes("industry")) {
    const text = [input.website.title, input.website.meta_description, input.website.text_sample].filter(Boolean).join(" ");
    const c = classifyIndustryFromText(text);
    const ids = [...idOf("page_title"), ...idOf("meta_description")];
    if (c && ids.length) out.industry = { value: c.industry, evidence_ids: ids, confidence: c.confidence };
  }
  const svc = idOf("services");
  if (input.missing_fields.includes("services") && input.website.services.length && svc.length) {
    out.services = { value: input.website.services.slice(0, 10), evidence_ids: svc, confidence: 0.6 };
  }
  return out;
}

export function mockOutreach(i: OutreachInput): OutreachOutput {
  const hi = i.contact_first_name ? `Hi ${i.contact_first_name},` : "Hi there,";
  const obs = i.observations.map((o) => o.phrase);
  const first = obs.slice(0, 2);
  const subject = (SUBJECTS[i.primary_pain_key ?? ""] ?? "An automation idea for {company}").replace("{company}", i.company_name);
  const p = i.primary_opportunity;
  const article = /^[aeiou]/i.test(p.title) ? "an" : "a";
  const email = [
    hi,
    "",
    `I was reading the ${i.company_name} website and noticed ${joinObs(first)}.`,
    "",
    `Teams with a similar setup often end up with ${i.primary_pain_phrase}. I can't see how this works inside ${i.company_name}, so treat this as a question rather than an assumption.`,
    "",
    `At ${i.sender_company} we build ${article} ${p.title}: ${p.solution.charAt(0).toLowerCase()}${p.solution.slice(1)}`,
    "",
    `Would a short call be useful to check whether this fits how ${i.company_name} handles it today?`,
    "",
    i.sender_name,
    i.sender_company,
  ].join("\n");

  const greet = hi.replace(",", "");
  let linkedin = `${greet}, I was looking at ${i.company_name} and noticed ${obs[0] ?? "your website"}. We help teams with this kind of inbound work using ${article} ${p.title}. Open to connecting?`;
  if (linkedin.length > 300) linkedin = `${greet}, I was looking at ${i.company_name}. We help teams with busy inbound workflows using ${article} ${p.title}. Open to connecting?`;

  const second = i.secondary_opportunity;
  const followup_1 = [
    hi,
    "",
    `Following up on my note about ${i.company_name}.${obs[2] ? ` One more detail I noticed: ${obs[2]}.` : ""}`,
    "",
    second
      ? `Beyond ${article} ${p.title}, a ${second.title} may also be relevant: ${second.solution.charAt(0).toLowerCase()}${second.solution.slice(1)}`
      : `If it helps, I can outline how ${article} ${p.title} would sit alongside your current process.`,
    "",
    "If this isn't a priority right now, a quick reply either way is appreciated.",
    "",
    i.sender_name,
  ].join("\n");

  const followup_2 = [
    hi,
    "",
    `I'll close the loop here. If automating this part of the workflow at ${i.company_name} becomes relevant later, I'm happy to share how ${article} ${p.title} would fit.`,
    "",
    i.sender_name,
  ].join("\n");

  return {
    email: { subject, body: email },
    linkedin: { body: linkedin },
    followup_1: { subject: `Re: ${subject}`, body: followup_1 },
    followup_2: { subject: `Re: ${subject}`, body: followup_2 },
  };
}

interface SummaryInput {
  company_name: string;
  industry: string | null;
  industry_label: string | null;
  icp_match: string;
  fit_score: number;
  lead_score: number;
  top_pain_point: string | null;
  top_opportunity: string | null;
  signals: string[];
  is_demo: boolean;
}

export function mockSummary(i: SummaryInput): SummaryOutput {
  const parts = [
    `${i.company_name}${i.industry ? ` operates in ${i.industry} (${i.industry_label})` : " has no established industry"}.`,
    `ICP match: ${i.icp_match.replace("_", " ")} (${i.fit_score}/100). Lead score: ${i.lead_score}/100.`,
    i.top_pain_point ? `Most relevant hypothesis: ${i.top_pain_point.toLowerCase()}.` : "No evidence-backed pain points were identified.",
    i.signals.length ? `Buying signals: ${i.signals.join("; ")}.` : "No validated buying signals.",
  ];
  if (i.is_demo) parts.push("All findings are based on demo data.");
  const angle = i.top_opportunity
    ? `Lead with the observed workflow and ask whether it is handled manually today; position the ${i.top_opportunity} as one option, not a conclusion.`
    : "Do not send outreach until more evidence is available.";
  return { summary: parts.join(" "), recommended_angle: angle };
}

/**
 * Deterministic stand-in for an LLM. Produces clearly labelled demo output and picks
 * the first available tool in canonical order when planning.
 */
export class MockAIProvider implements AIProvider {
  readonly name = "mock";
  readonly isMock = true;

  async generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
    let raw: unknown;
    switch (req.task) {
      case "extract_profile":
        raw = mockExtractProfile(req.input as ExtractInput);
        break;
      case "generate_outreach":
        raw = mockOutreach(req.input as OutreachInput);
        break;
      case "summarize_lead":
        raw = mockSummary(req.input as SummaryInput);
        break;
      default:
        throw new AIProviderError(`Mock provider has no handler for task "${String(req.task)}"`);
    }
    const parsed = req.schema.safeParse(raw);
    if (!parsed.success) throw new AIProviderError(`Mock output failed schema validation for ${req.task}`);
    return parsed.data;
  }

  async chooseNextTool(req: ToolChoiceRequest): Promise<ToolChoice | null> {
    const next = req.tools[0];
    return next ? { name: next.name, arguments: {} } : null;
  }
}
