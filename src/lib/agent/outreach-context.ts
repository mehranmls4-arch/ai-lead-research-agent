import type { Evidence } from "../domain/provenance";
import type { CompanyProfile } from "../domain/profile";
import type { AutomationOpportunity, BuyingSignal, PainPoint } from "../domain/signals";
import type { WebsiteAnalysis } from "../domain/website";
import type { OutreachInput } from "../providers/ai/schemas";

export const PAIN_PHRASES: Record<string, string> = {
  manual_quote_intake: "each quote request being reviewed and answered by hand",
  inquiry_response_delay: "inbound inquiries waiting for a manual reply",
  phone_dependent_intake: "intake that depends on someone being free to answer the phone",
  unstructured_messaging: "WhatsApp messages being answered one at a time",
  manual_lead_handling: "new leads being sorted and assigned manually",
  repetitive_admin: "a lot of repetitive administrative steps",
  multi_location_routing: "inquiries that have to be routed to the right location",
  support_workload: "a growing queue of support requests",
  growing_frontline_workload: "more front-line requests than the team can comfortably handle",
  scheduling_followups: "confirmations and reminders handled by hand",
};

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export interface OutreachContext {
  input: OutreachInput;
  personalization_phrases: string[];
  allowed_facts: string[];
}

/** Builds outreach inputs strictly from observed evidence. */
export function buildOutreachContext(args: {
  company_name: string;
  contact_name: string | null;
  profile: CompanyProfile;
  evidence: Evidence[];
  website: WebsiteAnalysis | null;
  signals: BuyingSignal[];
  painPoints: PainPoint[];
  opportunities: AutomationOpportunity[];
  sender: { name: string; company: string };
}): OutreachContext | null {
  const { profile, website, signals, painPoints, opportunities } = args;
  if (!opportunities.length) return null;
  const obs: { phrase: string; anchor: string; evidence_id: string }[] = [];
  const opKey = new Map(profile.operational_signals.map((o) => [o.key, o]));
  const firstId = (k: string) => opKey.get(k as never)?.evidence_ids[0] ?? "derived";

  const quoteCta = website?.ctas.find((c) => /quote/i.test(c));
  if (opKey.has("quote_request_form")) {
    obs.push(quoteCta
      ? { phrase: `the "${quoteCta}" form on your site`, anchor: quoteCta, evidence_id: firstId("quote_request_form") }
      : { phrase: "the quote request form on your site", anchor: "quote request form", evidence_id: firstId("quote_request_form") });
  }
  for (const s of signals) {
    if (s.category.startsWith("hiring")) {
      const role = s.evidence.match(/"([^"]+)"/)?.[1];
      if (role && !obs.some((o) => o.anchor === role)) obs.push({ phrase: `that you're hiring for a ${role}`, anchor: role, evidence_id: s.evidence_ids[0] ?? "derived" });
    } else if (s.category === "location_expansion") {
      const text = s.evidence.replace(/\.$/, "");
      obs.push({ phrase: `the ${text.charAt(0).toLowerCase()}${text.slice(1)}`, anchor: text.split(" ").slice(-3).join(" "), evidence_id: s.evidence_ids[0] ?? "derived" });
    }
  }
  if (opKey.has("whatsapp_contact")) obs.push({ phrase: "that you offer WhatsApp as a contact channel", anchor: "WhatsApp", evidence_id: firstId("whatsapp_contact") });
  if (opKey.has("booking_system")) {
    const cta = website?.ctas.find((c) => /book|schedule/i.test(c));
    obs.push({ phrase: cta ? `the "${cta}" option on your site` : "that visitors can book time online", anchor: cta ?? "book time online", evidence_id: firstId("booking_system") });
  }
  if (opKey.has("support_portal")) obs.push({ phrase: "the client portal and ticket submission on your site", anchor: "client portal", evidence_id: firstId("support_portal") });
  if (profile.locations && profile.locations.value.length >= 2) {
    obs.push({ phrase: `that you operate from ${list(profile.locations.value)}`, anchor: profile.locations.value[0], evidence_id: profile.locations.evidence_ids[0] ?? "derived" });
  }
  if (opKey.has("contact_form") && obs.length < 2) obs.push({ phrase: "the contact form on your site", anchor: "contact form", evidence_id: firstId("contact_form") });
  if (!obs.length) return null;

  const primary = opportunities[0];
  const secondary = opportunities[1] ?? null;
  const sevRank = { high: 3, medium: 2, low: 1 } as const;
  const primaryPain = painPoints
    .filter((p) => primary.related_pain_points.includes(p.key))
    .sort((a, b) => sevRank[b.severity] - sevRank[a.severity])[0];

  const allowed_facts = [
    args.company_name,
    args.contact_name ?? "",
    ...args.evidence.map((e) => e.statement),
    ...(website?.ctas ?? []),
    ...signals.map((s) => s.evidence),
    ...obs.map((o) => o.phrase),
  ].filter(Boolean);

  const toOpp = (o: AutomationOpportunity) => ({ key: o.key, title: o.title, solution: o.proposed_solution, problem: o.problem });
  return {
    input: {
      company_name: args.company_name,
      contact_first_name: args.contact_name ? args.contact_name.trim().split(/\s+/)[0] : null,
      sender_name: args.sender.name,
      sender_company: args.sender.company,
      observations: obs.slice(0, 4).map(({ phrase, evidence_id }) => ({ phrase, evidence_id })),
      primary_opportunity: toOpp(primary),
      secondary_opportunity: secondary ? toOpp(secondary) : null,
      primary_pain_key: primaryPain?.key ?? null,
      primary_pain_phrase: PAIN_PHRASES[primaryPain?.key ?? ""] ?? "manual follow-up work",
      allowed_facts: allowed_facts.slice(0, 60),
    },
    personalization_phrases: obs.map((o) => o.anchor),
    allowed_facts,
  };
}
