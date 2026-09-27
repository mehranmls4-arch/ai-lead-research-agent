import type { AutomationOpportunity, PainPoint } from "../domain/signals";

/** NovaFlow AI's service catalog. */
export const OFFERINGS = {
  lead_qualification_agent: {
    title: "AI Lead Qualification Agent",
    solution: "An AI intake agent that collects request details, asks follow-up questions, qualifies the request and routes it to the right salesperson.",
    workflow: ["Visitor submits a request or starts a conversation", "Agent collects missing details and validates them", "Agent scores the request against sales criteria", "Qualified request is created in the CRM and assigned", "Salesperson reviews and responds"],
    complexity: "medium" as const,
  },
  customer_support_agent: {
    title: "AI Customer Support Agent",
    solution: "A support agent that answers common questions from an approved knowledge base and escalates everything else to staff.",
    workflow: ["Customer asks a question on the website", "Agent answers from approved content", "Agent escalates unresolved questions with context", "Staff reply from a shared inbox"],
    complexity: "medium" as const,
  },
  whatsapp_agent: {
    title: "WhatsApp AI Support Agent",
    solution: "A WhatsApp Business agent that answers routine questions, captures structured details and hands off to a person when needed.",
    workflow: ["Customer messages on WhatsApp", "Agent answers routine questions", "Agent captures structured details", "Conversation is handed to staff when needed"],
    complexity: "medium" as const,
  },
  crm_automation: {
    title: "CRM Automation",
    solution: "Automatic capture, de-duplication, routing and follow-up reminders for every inbound lead.",
    workflow: ["Inbound lead is captured from each channel", "Lead is de-duplicated and enriched", "Routing rules assign the owner or branch", "Follow-up tasks and reminders are created"],
    complexity: "low" as const,
  },
  workflow_automation: {
    title: "Business Workflow Automation",
    solution: "Automation of recurring administrative steps such as confirmations, reminders, status updates and data entry.",
    workflow: ["Trigger event is detected", "Data is validated and transferred between systems", "Notifications and reminders are sent", "Exceptions are flagged for staff"],
    complexity: "medium" as const,
  },
};
export type OfferingKey = keyof typeof OFFERINGS;

const PAIN_TO_OFFERING: Record<string, OfferingKey> = {
  manual_quote_intake: "lead_qualification_agent",
  phone_dependent_intake: "lead_qualification_agent",
  inquiry_response_delay: "customer_support_agent",
  support_workload: "customer_support_agent",
  growing_frontline_workload: "customer_support_agent",
  unstructured_messaging: "whatsapp_agent",
  manual_lead_handling: "crm_automation",
  multi_location_routing: "crm_automation",
  repetitive_admin: "workflow_automation",
  scheduling_followups: "workflow_automation",
};

/** Deterministic mapping of pain points to offerings. No ROI or financial claims are produced. */
export function findAutomationOpportunities(painPoints: PainPoint[]): AutomationOpportunity[] {
  const grouped = new Map<OfferingKey, PainPoint[]>();
  for (const p of painPoints) {
    const k = PAIN_TO_OFFERING[p.key];
    if (!k) continue;
    grouped.set(k, [...(grouped.get(k) ?? []), p]);
  }
  const out: AutomationOpportunity[] = [];
  for (const [key, pps] of grouped) {
    const o = OFFERINGS[key];
    const maxConf = Math.max(...pps.map((p) => p.confidence));
    // More independent pain points pointing at the same offering raise confidence slightly.
    const confidence = Math.min(0.9, Math.round((maxConf + 0.05 * (pps.length - 1)) * 100) / 100);
    const complexity = key === "crm_automation" && pps.length > 1 ? "medium" : o.complexity;
    out.push({
      key,
      title: o.title,
      problem: pps.map((p) => p.title).join("; "),
      evidence: [...new Set(pps.flatMap((p) => p.evidence))],
      evidence_ids: [...new Set(pps.flatMap((p) => p.evidence_ids))],
      proposed_solution: o.solution,
      expected_workflow: o.workflow,
      implementation_complexity: complexity,
      confidence,
      related_pain_points: pps.map((p) => p.key),
      label: "potential",
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}
