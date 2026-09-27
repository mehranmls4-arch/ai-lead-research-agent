import type { Evidence, Provenance } from "../domain/provenance";
import type { OperationalSignal, OperationalSignalKey, TechSignal } from "../domain/profile";
import type { WebsiteAnalysis } from "../domain/website";

/** Build evidence items from a website analysis. Live fetches → "verified"; fixtures → "demo". */
export function evidenceFromWebsite(a: WebsiteAnalysis, idPrefix = "web"): Evidence[] {
  const isDemo = a.source_type === "demo";
  const prov = (confidence: number, url = a.url): Provenance => ({
    source_type: isDemo ? "demo" : "website",
    source: isDemo ? "Demo fixture (simulated website)" : new URL(url).hostname,
    source_url: url,
    confidence,
    retrieved_at: a.fetched_at,
    label: isDemo ? "demo" : "verified",
  });
  const out: Evidence[] = [];
  let n = 0;
  const add = (kind: string, statement: string, excerpt: string | null, confidence: number, url?: string) =>
    out.push({ id: `${idPrefix}-${++n}`, kind, statement, excerpt, provenance: prov(confidence, url) });

  if (a.title) add("page_title", `Homepage title: "${a.title}"`, a.title, 0.95);
  if (a.meta_description) add("meta_description", `Meta description: "${a.meta_description}"`, a.meta_description, 0.95);
  for (const f of a.forms) {
    if (["quote", "contact", "booking"].includes(f.purpose)) {
      add(`form_${f.purpose}`, `A ${f.purpose} form with ${f.fields_count} fields is published on the website.`, null, 0.9, f.page_url);
    }
  }
  if (a.ctas.length) add("ctas", `Calls to action on the website: ${a.ctas.slice(0, 6).join("; ")}.`, null, 0.9);
  if (a.contact.phones.length) add("contact_phone", `Phone number(s) listed for contact: ${a.contact.phones.slice(0, 3).join(", ")}.`, null, 0.9);
  if (a.contact.emails.length) add("contact_email", `Email address(es) listed for contact: ${a.contact.emails.slice(0, 3).join(", ")}.`, null, 0.9);
  if (a.booking_indicators.length) add("booking", `Booking/scheduling indicators: ${a.booking_indicators.join("; ")}.`, null, 0.8);
  if (a.ecommerce_indicators.length) add("ecommerce", `E-commerce indicators: ${a.ecommerce_indicators.join("; ")}.`, null, 0.85);
  if (a.chat_indicators.length) add("chat", `Chat/support widget indicators: ${a.chat_indicators.join("; ")}.`, null, 0.8);
  if (a.whatsapp_links.length) add("whatsapp", `WhatsApp contact link(s) present: ${a.whatsapp_links.slice(0, 2).join(", ")}.`, null, 0.9);
  for (const t of a.technologies) add(`tech_${t.name.toLowerCase().replace(/\W+/g, "_")}`, `${t.name} detected (${t.evidence}).`, t.evidence, 0.85);
  for (const h of a.hiring_mentions.slice(0, 5)) add("hiring", `Careers content mentions: "${h}"`, h, 0.75);
  if (a.location_mentions.length) add("locations", `Locations mentioned on the website: ${a.location_mentions.join(", ")}.`, null, 0.8);
  if (a.services.length) add("services", `Services listed on the website: ${a.services.join(", ")}.`, null, 0.8);
  if (a.products.length) add("products", `Products listed on the website: ${a.products.join(", ")}.`, null, 0.8);
  return out;
}

const idsOf = (ev: Evidence[], kinds: (k: string) => boolean) => ev.filter((e) => kinds(e.kind)).map((e) => e.id);

/** Deterministic mapping from website evidence to operational signals. */
export function detectOperationalSignals(a: WebsiteAnalysis, ev: Evidence[]): OperationalSignal[] {
  const out: OperationalSignal[] = [];
  const isDemo = a.source_type === "demo";
  const push = (key: OperationalSignalKey, description: string, ids: string[], confidence: number, observed = true) => {
    if (!ids.length) return;
    out.push({
      key,
      description,
      evidence_ids: ids,
      provenance: {
        source_type: isDemo ? "demo" : observed ? "website" : "derived",
        source: isDemo ? "Demo fixture (simulated website)" : observed ? new URL(a.url).hostname : "Rule-based detection",
        source_url: a.url,
        confidence,
        retrieved_at: a.fetched_at,
        label: isDemo ? "demo" : observed ? "verified" : "inferred",
      },
    });
  };
  const has = (p: string) => a.forms.some((f) => f.purpose === p);
  if (has("quote")) push("quote_request_form", "Quote request form published", idsOf(ev, (k) => k === "form_quote"), 0.9);
  if (has("contact")) push("contact_form", "Contact form published", idsOf(ev, (k) => k === "form_contact"), 0.9);
  if (has("booking") || a.booking_indicators.length)
    push("booking_system", "Online booking/scheduling present", idsOf(ev, (k) => k === "booking" || k === "form_booking"), 0.8);
  if (a.ecommerce_indicators.length) push("ecommerce", "Online store / checkout present", idsOf(ev, (k) => k === "ecommerce"), 0.85);
  const chatbot = a.chat_indicators.some((c) => /bot|ai assistant|virtual assistant/i.test(c));
  if (a.chat_indicators.length) push("live_chat", "Live chat widget present", idsOf(ev, (k) => k === "chat"), 0.8);
  if (chatbot) push("chatbot", "Chatbot/virtual assistant present", idsOf(ev, (k) => k === "chat"), 0.7);
  if (a.whatsapp_links.length) push("whatsapp_contact", "WhatsApp used as a contact channel", idsOf(ev, (k) => k === "whatsapp"), 0.9);
  const phoneCta = a.ctas.some((c) => /call|phone|dispatch line/i.test(c));
  if (a.contact.phones.length && phoneCta && !a.chat_indicators.length)
    push("phone_primary_contact", "Phone is promoted as a primary contact route", idsOf(ev, (k) => k === "contact_phone" || k === "ctas"), 0.7, false);
  if (a.location_mentions.length >= 2)
    push("multiple_locations", `${a.location_mentions.length} locations mentioned`, idsOf(ev, (k) => k === "locations"), 0.8);
  const channels = [a.ecommerce_indicators.length > 0, a.whatsapp_links.length > 0, a.contact.phones.length > 0, a.forms.length > 0].filter(Boolean).length;
  if (channels >= 3)
    push("multiple_sales_channels", `${channels} customer-facing channels observed`, idsOf(ev, (k) => ["ecommerce", "whatsapp", "contact_phone", "form_quote", "form_contact"].includes(k)), 0.65, false);
  if (a.hiring_mentions.length) push("careers_page", "Careers/hiring content present", idsOf(ev, (k) => k === "hiring"), 0.75);
  const hasPortal = a.ctas.some((c) => /portal|client login|submit a ticket/i.test(c));
  if (hasPortal) push("support_portal", "Customer/support portal linked", idsOf(ev, (k) => k === "ctas"), 0.7);
  if (a.contact.emails.some((e) => /^(support|help|service|billing|care)@/i.test(e)) && !a.chat_indicators.length)
    push("email_only_support", "Support appears to be email-based (no chat observed)", idsOf(ev, (k) => k === "contact_email"), 0.6, false);
  if ((has("quote") || has("contact")) && !chatbot && !a.chat_indicators.length)
    push("manual_lead_handling", "Inbound requests arrive via forms with no visible automated follow-up", idsOf(ev, (k) => k === "form_quote" || k === "form_contact"), 0.55, false);
  return out;
}

export function techSignalsFromWebsite(a: WebsiteAnalysis, ev: Evidence[]): TechSignal[] {
  const isDemo = a.source_type === "demo";
  return a.technologies.map((t) => ({
    name: t.name,
    category: t.category,
    evidence_ids: ev.filter((e) => e.kind === `tech_${t.name.toLowerCase().replace(/\W+/g, "_")}`).map((e) => e.id),
    provenance: {
      source_type: isDemo ? "demo" : "website",
      source: isDemo ? "Demo fixture (simulated website)" : new URL(a.url).hostname,
      source_url: a.url,
      confidence: 0.85,
      retrieved_at: a.fetched_at,
      label: isDemo ? "demo" : "verified",
    },
  }));
}

const HIRING_OPS = /(operations|dispatch|coordinator|logistics|admin|billing|scheduling|revenue cycle)/i;
const HIRING_SUPPORT = /(customer service|customer support|support specialist|sales|account executive|client services|inside sales)/i;

/** Website careers content → buying-signal candidates (validated later). */
export function hiringSignalCandidates(a: WebsiteAnalysis, ev: Evidence[]) {
  const hiringIds = ev.filter((e) => e.kind === "hiring").map((e) => e.id);
  const out = [];
  for (const h of a.hiring_mentions) {
    const category = HIRING_SUPPORT.test(h) ? "hiring_support_sales" : HIRING_OPS.test(h) ? "hiring_operations" : null;
    if (!category) continue;
    out.push({
      signal: category === "hiring_support_sales" ? "Hiring for customer-facing roles" : "Hiring for operations roles",
      category,
      strength: "moderate",
      evidence: `Careers content lists: "${h}"`,
      source: a.source_type === "demo" ? "Demo fixture (simulated careers page)" : new URL(a.url).hostname,
      source_type: a.source_type === "demo" ? "demo" : "website",
      source_url: a.url,
      confidence: 0.7,
      detected_at: a.fetched_at,
      evidence_ids: hiringIds,
    });
  }
  return out;
}
