export type OutreachChannel = "email" | "linkedin" | "followup_1" | "followup_2";

export interface OutreachDraftInput {
  channel: OutreachChannel;
  subject?: string | null;
  body: string;
}

export interface OutreachValidationContext {
  company_name: string;
  contact_name?: string | null;
  /** Evidence statements the draft may rely on. Numbers and technologies must come from here. */
  allowed_facts: string[];
  /** Short phrases, any of which shows the draft is personalised to research. */
  personalization_phrases: string[];
  detected_technologies: string[];
  other_company_names?: string[];
  is_demo?: boolean;
}

export interface ValidationCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  severity: "error" | "warning";
}

export interface OutreachValidation {
  result: "PASS" | "NEEDS_REVIEW";
  checks: ValidationCheck[];
  reasons: string[];
  warnings: string[];
}

export const KNOWN_TECHNOLOGIES = [
  "Salesforce", "HubSpot", "Zendesk", "Intercom", "Shopify", "WooCommerce", "Magento", "BigCommerce", "Calendly",
  "Freshdesk", "Zoho", "Pipedrive", "Drift", "LiveChat", "Tidio", "WordPress", "Wix", "Squarespace", "Stripe",
  "Mailchimp", "Marketo", "ServiceNow", "Gorgias", "Acuity", "Monday.com", "Asana", "Twilio", "Klaviyo", "SAP",
  "Microsoft Dynamics", "Google Analytics", "Pardot", "Crisp", "Gladly",
];

const GENERIC_OPENINGS = [
  /hope (you're|you are|this (email|message)? ?finds you)( doing)? well/i,
  /i hope this (email|message|note) finds you/i,
  /^\s*(hi|hello|dear)[^\n]*\n+\s*my name is/i,
  /i wanted to reach out/i,
  /just (checking|touching) (in|base)/i,
  /i came across your (company|website) and/i,
];
const FAKE_FAMILIARITY = [/as we discussed/i, /great (chatting|talking|speaking)/i, /as you (already )?know/i, /i('ve| have) been following your/i, /our last (call|conversation)/i, /\bremember me\b/i];
const UNSUPPORTED_CLAIMS = [/you('re| are) (struggling|losing|wasting|drowning)/i, /your team (spends|wastes|is losing)/i, /\bguarantee(d|s)?\b/i, /(double|triple|10x) your/i, /\bROI\b/, /save you \$?\d/i, /i know (that )?your/i, /your customers are (unhappy|frustrated|complaining)/i];
const AGGRESSIVE = [/act now/i, /limited time/i, /don't miss (out)?/i, /last chance/i, /\burgent(ly)?\b/i, /you need to/i, /before it's too late/i];
const ACRONYMS = new Set(["CRM", "AI", "FAQ", "USA", "LTL", "FTL", "API", "SMS", "HVAC", "B2B", "B2C", "CEO", "COO", "VP", "WHATSAPP", "SLA", "NOVAFLOW"]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function validateOutreach(draft: OutreachDraftInput, ctx: OutreachValidationContext): OutreachValidation {
  const checks: ValidationCheck[] = [];
  const text = `${draft.subject ?? ""}\n${draft.body}`;
  const factsText = ctx.allowed_facts.join("\n").toLowerCase();
  const add = (id: string, label: string, passed: boolean, detail: string, severity: "error" | "warning" = "error") =>
    checks.push({ id, label, passed, detail, severity });

  // 1. Company name
  const hasCompany = text.includes(ctx.company_name);
  add("company_name", "Company name correct", hasCompany, hasCompany ? `Mentions "${ctx.company_name}".` : `Does not mention "${ctx.company_name}" exactly.`);
  const wrong = (ctx.other_company_names ?? []).filter((n) => n !== ctx.company_name && text.includes(n));
  add("no_other_company", "No other company named", wrong.length === 0, wrong.length ? `Mentions other companies: ${wrong.join(", ")}.` : "No other company names found.");

  // 2. Contact name
  const greeting = draft.body.match(/^\s*(?:hi|hello|dear|hey)\s+([A-Z][\w'-]*)/i);
  if (ctx.contact_name) {
    const first = ctx.contact_name.trim().split(/\s+/)[0];
    const ok = !greeting || greeting[1].toLowerCase() === first.toLowerCase();
    add("contact_name", "Contact name correct", ok, ok ? `Greeting matches "${first}".` : `Greeting uses "${greeting![1]}" but the contact is "${first}".`);
  } else {
    const ok = !greeting || /^(there|team|all)$/i.test(greeting[1]);
    add("contact_name", "Contact name correct", ok, ok ? "No contact name supplied; neutral greeting used." : `Greeting names "${greeting![1]}" but no contact name was supplied.`);
  }

  // 3. Personalisation
  const lower = text.toLowerCase();
  const matched = ctx.personalization_phrases.filter((p) => p && lower.includes(p.toLowerCase()));
  add("personalization", "References research evidence", matched.length > 0, matched.length ? `References: ${matched.slice(0, 3).join("; ")}.` : "No reference to researched evidence.");

  // 4. Generic opening
  const generic = GENERIC_OPENINGS.find((r) => r.test(draft.body));
  add("generic_opening", "No generic opening", !generic, generic ? `Generic phrase matched: ${generic.source}` : "Opening is specific.");

  // 5. Invented metrics — every number must be present in the evidence.
  const numbers = (text.match(/\$?\d[\d,.]*%?/g) ?? []).map((n) => n.replace(/[.,]$/, ""));
  const invented = numbers.filter((n) => !factsText.includes(n.toLowerCase()));
  add("no_invented_metrics", "No invented business metrics", invented.length === 0, invented.length ? `Numbers not found in evidence: ${invented.join(", ")}.` : "No unsupported numbers.");

  // 6. Hallucinated technology
  const detected = ctx.detected_technologies.map((t) => t.toLowerCase());
  const techMentioned = KNOWN_TECHNOLOGIES.filter((t) => new RegExp(`\\b${escape(t)}\\b`, "i").test(text));
  const hallucinated = techMentioned.filter((t) => !detected.includes(t.toLowerCase()));
  add("no_hallucinated_tech", "No unsupported technology claims", hallucinated.length === 0, hallucinated.length ? `Technologies not detected in research: ${hallucinated.join(", ")}.` : "Technology mentions are supported.");

  // 7. Unsupported claims / fake familiarity
  const claim = UNSUPPORTED_CLAIMS.find((r) => r.test(text));
  add("no_unsupported_claims", "No unsupported claims", !claim, claim ? `Unsupported claim pattern: ${claim.source}` : "No unsupported claim patterns.");
  const fam = FAKE_FAMILIARITY.find((r) => r.test(text));
  add("no_fake_familiarity", "No fake familiarity", !fam, fam ? `Implies a prior relationship: ${fam.source}` : "No implied prior relationship.");

  // 8. Tone
  const aggressive = AGGRESSIVE.find((r) => r.test(text));
  const exclaims = (draft.body.match(/!/g) ?? []).length;
  const shouting = (draft.body.match(/\b[A-Z]{5,}\b/g) ?? []).filter((w) => !ACRONYMS.has(w));
  const toneOk = !aggressive && exclaims <= 1 && shouting.length === 0;
  add(
    "professional_tone",
    "Professional tone",
    toneOk,
    toneOk ? "Tone is professional." : [aggressive && `pressure phrase (${aggressive.source})`, exclaims > 1 && `${exclaims} exclamation marks`, shouting.length && `all-caps words: ${shouting.join(", ")}`].filter(Boolean).join("; "),
  );

  // 9. Channel constraints
  if (draft.channel === "email" || draft.channel === "followup_1" || draft.channel === "followup_2") {
    const subjOk = draft.channel !== "email" || Boolean(draft.subject && draft.subject.trim().length >= 4 && draft.subject.length <= 90);
    add("subject", "Subject line present", subjOk, subjOk ? "Subject is present and concise." : "Email needs a subject of 4–90 characters.");
    const words = draft.body.trim().split(/\s+/).length;
    add("length", "Reasonable length", words <= 220, `${words} words (max 220).`, "warning");
  } else {
    add("length", "LinkedIn length", draft.body.length <= 300, `${draft.body.length} characters (LinkedIn connection notes allow 300).`);
  }

  const warnings: string[] = [];
  if (ctx.is_demo) warnings.push("Draft is based on demo data. Do not send it to a real contact.");
  checks.filter((c) => !c.passed && c.severity === "warning").forEach((c) => warnings.push(`${c.label}: ${c.detail}`));
  const reasons = checks.filter((c) => !c.passed && c.severity === "error").map((c) => `${c.label}: ${c.detail}`);
  return { result: reasons.length ? "NEEDS_REVIEW" : "PASS", checks, reasons, warnings };
}
