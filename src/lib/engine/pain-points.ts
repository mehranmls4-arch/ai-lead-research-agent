import type { Evidence } from "../domain/provenance";
import type { CompanyProfile, OperationalSignalKey } from "../domain/profile";
import { PainPointSchema, type BuyingSignal, type PainPoint, type Severity } from "../domain/signals";

interface Rule {
  key: string;
  when: (has: (k: OperationalSignalKey) => boolean, signals: BuyingSignal[]) => boolean;
  uses: (OperationalSignalKey | "hiring_signal")[];
  title: string;
  description: string;
  severity: Severity;
}

/** Hypothesis rules. Every output is a "potential" pain point tied to concrete evidence. */
const RULES: Rule[] = [
  {
    key: "manual_quote_intake",
    when: (has) => has("quote_request_form") && !has("chatbot"),
    uses: ["quote_request_form"],
    title: "Potential manual quote-intake workload",
    description:
      "Quote requests arrive through a web form with no visible automated qualification step, which may require staff to review and follow up on each request manually.",
    severity: "high",
  },
  {
    key: "inquiry_response_delay",
    when: (has) => has("contact_form") && !has("live_chat") && !has("chatbot"),
    uses: ["contact_form"],
    title: "Possible delays in responding to inbound inquiries",
    description:
      "Inbound inquiries appear to rely on a contact form without live chat or an assistant, which can indicate slower first responses outside business hours.",
    severity: "medium",
  },
  {
    key: "phone_dependent_intake",
    when: (has) => has("phone_primary_contact"),
    uses: ["phone_primary_contact"],
    title: "Possible dependency on phone-based intake",
    description: "The phone is promoted as a primary contact route, which may concentrate intake work on staff availability.",
    severity: "medium",
  },
  {
    key: "unstructured_messaging",
    when: (has) => has("whatsapp_contact") && !has("chatbot"),
    uses: ["whatsapp_contact"],
    title: "Potential unstructured messaging workload",
    description: "WhatsApp is offered as a contact channel with no visible automation, suggesting messages may be handled one by one.",
    severity: "medium",
  },
  {
    key: "manual_lead_handling",
    when: (has) => has("manual_lead_handling"),
    uses: ["manual_lead_handling"],
    title: "Indication of manual lead handling",
    description: "Form submissions have no visible automated routing or follow-up, an indication that leads may be triaged manually.",
    severity: "high",
  },
  {
    key: "repetitive_admin",
    when: (has) => has("repetitive_admin"),
    uses: ["repetitive_admin"],
    title: "Indication of repetitive administrative processing",
    description: "Observed services involve recurring administrative steps that are often candidates for workflow automation.",
    severity: "high",
  },
  {
    key: "multi_location_routing",
    when: (has) => has("multiple_locations"),
    uses: ["multiple_locations"],
    title: "Possible fragmented routing across locations",
    description: "Several locations are listed, which may require inquiries and leads to be routed to the right branch.",
    severity: "medium",
  },
  {
    key: "support_workload",
    when: (has) => has("high_inquiry_volume") || (has("support_portal") && has("email_only_support")),
    uses: ["high_inquiry_volume", "support_portal", "email_only_support"],
    title: "Potential high support workload",
    description: "Support signals (portal, email-based support, or inquiry volume indicators) suggest a meaningful support workload.",
    severity: "high",
  },
  {
    key: "growing_frontline_workload",
    when: (_has, signals) => signals.some((s) => s.category === "hiring_support_sales" || s.category === "hiring_operations"),
    uses: ["hiring_signal"],
    title: "Possible growing front-line workload",
    description: "Active hiring for operations or customer-facing roles can indicate increasing workload in those functions.",
    severity: "medium",
  },
  {
    key: "scheduling_followups",
    when: (has) => has("booking_system"),
    uses: ["booking_system"],
    title: "Possible scheduling follow-up workload",
    description: "Online scheduling is offered; confirmations, reminders and rescheduling are commonly handled by hand.",
    severity: "low",
  },
];

export function identifyPainPoints(profile: CompanyProfile, evidence: Evidence[], signals: BuyingSignal[]): PainPoint[] {
  const byKey = new Map(profile.operational_signals.map((s) => [s.key, s]));
  const has = (k: OperationalSignalKey) => byKey.has(k);
  const evById = new Map(evidence.map((e) => [e.id, e]));
  const out: PainPoint[] = [];

  for (const rule of RULES) {
    if (!rule.when(has, signals)) continue;
    const ids: string[] = [];
    const statements: string[] = [];
    const confidences: number[] = [];
    for (const u of rule.uses) {
      if (u === "hiring_signal") {
        for (const s of signals.filter((x) => x.category.startsWith("hiring"))) {
          statements.push(s.evidence);
          ids.push(...s.evidence_ids);
          confidences.push(s.confidence);
        }
        continue;
      }
      const sig = byKey.get(u);
      if (!sig) continue;
      confidences.push(sig.provenance.confidence);
      for (const id of sig.evidence_ids) {
        const e = evById.get(id);
        if (e) {
          ids.push(id);
          statements.push(e.statement);
        }
      }
      if (!sig.evidence_ids.length) statements.push(sig.description);
    }
    if (!statements.length) continue;
    const base = Math.min(...confidences);
    const pp: PainPoint = {
      key: rule.key,
      title: rule.title,
      description: rule.description,
      evidence: [...new Set(statements)],
      evidence_ids: ids.length ? [...new Set(ids)] : ["derived"],
      severity: rule.severity,
      // Hypotheses are discounted relative to the evidence they rest on.
      confidence: Math.round(base * 0.8 * 100) / 100,
      label: "potential",
    };
    out.push(pp);
  }
  return out;
}

const HEDGES = /^(potential|possible|indication|likely|may|could)\b/i;

/**
 * Validates pain points (e.g. those refined by an LLM): drops items that cite unknown
 * evidence and forces hedged wording so hypotheses are never shown as facts.
 */
export function validatePainPoints(items: unknown[], evidence: Evidence[]) {
  const known = new Set(evidence.map((e) => e.id).concat("derived"));
  const accepted: PainPoint[] = [];
  const rejected: { title: string; reason: string }[] = [];
  for (const raw of items) {
    const parsed = PainPointSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({ title: String((raw as { title?: string })?.title ?? "(unknown)"), reason: "Schema validation failed" });
      continue;
    }
    const p = parsed.data;
    const unknownRefs = p.evidence_ids.filter((id) => !known.has(id));
    if (unknownRefs.length) {
      rejected.push({ title: p.title, reason: `Cites unknown evidence: ${unknownRefs.join(", ")}` });
      continue;
    }
    accepted.push(HEDGES.test(p.title) ? p : { ...p, title: `Potential: ${p.title.charAt(0).toLowerCase()}${p.title.slice(1)}` });
  }
  return { accepted, rejected };
}
