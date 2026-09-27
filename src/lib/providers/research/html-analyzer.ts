import * as cheerio from "cheerio";
import type { WebsiteAnalysis } from "../../domain/website";
import type { TechCategory } from "../../domain/profile";

export interface FetchedPage {
  url: string;
  status: number;
  html: string;
}

const TECH_RULES: { name: string; category: TechCategory; test: RegExp; evidence: string }[] = [
  { name: "Shopify", category: "ecommerce_platform", test: /cdn\.shopify\.com|Shopify\.theme/i, evidence: "Shopify CDN or theme object in page source" },
  { name: "WooCommerce", category: "ecommerce_platform", test: /woocommerce/i, evidence: "WooCommerce markup in page source" },
  { name: "BigCommerce", category: "ecommerce_platform", test: /cdn\d*\.bigcommerce\.com/i, evidence: "BigCommerce CDN in page source" },
  { name: "Magento", category: "ecommerce_platform", test: /mage\/cookies|Magento_/i, evidence: "Magento scripts in page source" },
  { name: "WordPress", category: "cms", test: /\/wp-content\/|\/wp-includes\//i, evidence: "wp-content/wp-includes paths" },
  { name: "Wix", category: "cms", test: /static\.wixstatic\.com|wix\.com\/website/i, evidence: "Wix static assets" },
  { name: "Squarespace", category: "cms", test: /static1\.squarespace\.com/i, evidence: "Squarespace static assets" },
  { name: "HubSpot", category: "crm", test: /js\.hs-scripts\.com|js\.hsforms\.net|hs-analytics/i, evidence: "HubSpot tracking or forms script" },
  { name: "Salesforce", category: "crm", test: /pardot\.com|force\.com|salesforce\.com\/embeddedservice/i, evidence: "Salesforce/Pardot script" },
  { name: "Zoho", category: "crm", test: /salesiq\.zoho|zohopublic/i, evidence: "Zoho script" },
  { name: "Pipedrive", category: "crm", test: /pipedrive(webforms)?\.com/i, evidence: "Pipedrive web form" },
  { name: "Zendesk", category: "helpdesk", test: /static\.zdassets\.com|zendesk\.com\/embeddable/i, evidence: "Zendesk widget script" },
  { name: "Freshdesk", category: "helpdesk", test: /freshdesk|freshchat|freshworks/i, evidence: "Freshworks widget script" },
  { name: "Gorgias", category: "helpdesk", test: /gorgias/i, evidence: "Gorgias widget script" },
  { name: "Intercom", category: "live_chat", test: /widget\.intercom\.io|intercomSettings/i, evidence: "Intercom widget" },
  { name: "Drift", category: "live_chat", test: /js\.driftt\.com|drift\.com\/include/i, evidence: "Drift widget" },
  { name: "Tidio", category: "live_chat", test: /code\.tidio\.co/i, evidence: "Tidio widget" },
  { name: "LiveChat", category: "live_chat", test: /cdn\.livechatinc\.com/i, evidence: "LiveChat widget" },
  { name: "Crisp", category: "live_chat", test: /client\.crisp\.chat/i, evidence: "Crisp widget" },
  { name: "Calendly", category: "booking_system", test: /calendly\.com/i, evidence: "Calendly embed or link" },
  { name: "Acuity", category: "booking_system", test: /acuityscheduling\.com/i, evidence: "Acuity Scheduling embed" },
  { name: "Mailchimp", category: "marketing_automation", test: /list-manage\.com|chimpstatic\.com/i, evidence: "Mailchimp form or script" },
  { name: "Klaviyo", category: "marketing_automation", test: /static\.klaviyo\.com/i, evidence: "Klaviyo script" },
  { name: "Google Analytics", category: "analytics", test: /googletagmanager\.com\/gtag|google-analytics\.com/i, evidence: "Google tag script" },
  { name: "Stripe", category: "payments", test: /js\.stripe\.com/i, evidence: "Stripe.js script" },
];

const CTA_RE = /(get (a|your) (free )?quote|request (a )?(freight )?quote|contact( us)?|book|schedule|request (a )?demo|buy now|shop( now)?|add to cart|get started|sign up|call( us)?|talk to|free consultation|track( shipment)?|client (portal|login)|submit a ticket)/i;
const US_STATES = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const US_ADDRESS_RE = new RegExp(`\\b([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+){0,2}),\\s?(${US_STATES})\\s\\d{5}\\b`, "g");
const HIRING_RE = /\b(hiring|we're hiring|join our team|careers?|open positions?|job openings?)\b/i;
const ROLE_RE = /\b([A-Z][A-Za-z/&-]+(?:\s[A-Z][A-Za-z/&()-]+){0,4}\s(?:Manager|Coordinator|Specialist|Representative|Agent|Associate|Executive|Dispatcher|Analyst|Lead|Director|Assistant))\b/g;

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function formPurpose($: cheerio.CheerioAPI, form: Parameters<cheerio.CheerioAPI>[0]): WebsiteAnalysis["forms"][number]["purpose"] {
  const el = $(form as never);
  const text = (el.text() + " " + (el.attr("action") ?? "") + " " + (el.attr("id") ?? "") + " " + (el.attr("class") ?? "")).toLowerCase();
  const names = el.find("input,select,textarea").map((_, i) => ($(i).attr("name") ?? "") + " " + ($(i).attr("type") ?? "")).get().join(" ").toLowerCase();
  const all = `${text} ${names}`;
  if (/password/.test(all)) return "login";
  if (/quote|shipment|freight|estimate|pickup|origin|destination/.test(all)) return "quote";
  if (/book|appointment|schedule|reservation/.test(all)) return "booking";
  if (/checkout|card|payment/.test(all)) return "checkout";
  if (/search/.test(all) && el.find("input").length <= 2) return "search";
  if (/newsletter|subscribe/.test(all) && el.find("input").length <= 3) return "newsletter";
  if (/message|contact|inquiry|enquiry|email/.test(all)) return "contact";
  return "other";
}

/** Pure HTML analysis over already-fetched pages. Only reports what is literally observable. */
export function analyzeHtml(pages: FetchedPage[], rootUrl: string, fetchedAt: string, robotsAllowed = true, errors: string[] = []): WebsiteAnalysis {
  const home = pages[0];
  const out: WebsiteAnalysis = {
    url: rootUrl,
    source_type: "website",
    fetched_at: fetchedAt,
    robots_allowed: robotsAllowed,
    pages: [],
    title: null,
    meta_description: null,
    headings: [],
    services: [],
    products: [],
    contact: { emails: [], phones: [] },
    ctas: [],
    forms: [],
    booking_indicators: [],
    ecommerce_indicators: [],
    chat_indicators: [],
    whatsapp_links: [],
    technologies: [],
    hiring_mentions: [],
    location_mentions: [],
    text_sample: "",
    errors,
  };
  const emails = new Set<string>();
  const phones = new Set<string>();
  const ctas = new Set<string>();
  const tech = new Map<string, WebsiteAnalysis["technologies"][number]>();
  const headings = new Set<string>();
  const services = new Set<string>();
  const hiring = new Set<string>();
  let text = "";

  for (const page of pages) {
    const $ = cheerio.load(page.html);
    const title = clean($("title").first().text()) || null;
    out.pages.push({ url: page.url, status: page.status, title });
    if (page === home) {
      out.title = title;
      out.meta_description = clean($('meta[name="description"]').attr("content") ?? "") || clean($('meta[property="og:description"]').attr("content") ?? "") || null;
    }
    const scripts = $("script[src]").map((_, s) => $(s).attr("src") ?? "").get().join("\n");
    const inline = $("script:not([src])").map((_, s) => $(s).html() ?? "").get().join("\n").slice(0, 200_000);
    const links = $("a[href]").map((_, a) => $(a).attr("href") ?? "").get();
    const haystack = `${scripts}\n${inline}\n${links.join("\n")}\n${$("link[href]").map((_, l) => $(l).attr("href") ?? "").get().join("\n")}\n${page.html.slice(0, 50_000)}`;
    for (const rule of TECH_RULES) if (!tech.has(rule.name) && rule.test.test(haystack)) tech.set(rule.name, { name: rule.name, category: rule.category, evidence: rule.evidence });

    $("h1,h2,h3").each((_, h) => {
      const t = clean($(h).text());
      if (t && t.length <= 80) headings.add(t);
    });
    const isServicesPage = /services|solutions|what-we-do/i.test(new URL(page.url).pathname);
    $("section,div,ul").filter((_, el) => /service|solution/i.test(`${$(el).attr("id") ?? ""} ${$(el).attr("class") ?? ""}`)).find("h2,h3,h4,li").each((_, el) => {
      const t = clean($(el).text());
      if (t && t.length >= 3 && t.length <= 60) services.add(t);
    });
    if (isServicesPage) $("h2,h3").each((_, el) => { const t = clean($(el).text()); if (t && t.length <= 60) services.add(t); });

    links.filter((h) => h.startsWith("mailto:")).forEach((h) => emails.add(h.slice(7).split("?")[0].toLowerCase()));
    links.filter((h) => h.startsWith("tel:")).forEach((h) => phones.add(h.slice(4).trim()));
    links.filter((h) => /wa\.me\/|api\.whatsapp\.com|whatsapp:\/\//i.test(h)).forEach((h) => out.whatsapp_links.includes(h) || out.whatsapp_links.push(h));
    $("a,button,input[type=submit]").each((_, el) => {
      const t = clean($(el).text() || ($(el).attr("value") ?? ""));
      if (t && t.length <= 40 && CTA_RE.test(t)) ctas.add(t);
    });
    $("form").each((_, form) => {
      out.forms.push({ purpose: formPurpose($, form as never), fields_count: $(form).find("input:not([type=hidden]),select,textarea").length, page_url: page.url });
    });
    const bodyText = clean($("body").text());
    text += " " + bodyText;
    for (const m of bodyText.matchAll(US_ADDRESS_RE)) {
      const loc = `${m[1]}, ${m[2]}`;
      if (!out.location_mentions.includes(loc) && out.location_mentions.length < 10) out.location_mentions.push(loc);
    }
    if (/add to cart|shopping cart|checkout/i.test(bodyText) || links.some((l) => /\/cart\b|\/checkout\b/.test(l))) out.ecommerce_indicators.push(`Cart/checkout on ${page.url}`);
    if (/book (an|your) (appointment|call|showing|consultation)|schedule (a|your) (call|showing|appointment)/i.test(bodyText)) out.booking_indicators.push(`Booking language on ${page.url}`);
    if (HIRING_RE.test(bodyText) && /careers|jobs|hiring/i.test(page.url + bodyText.slice(0, 2000))) {
      for (const m of bodyText.matchAll(ROLE_RE)) if (hiring.size < 8) hiring.add(clean(m[1]));
    }
  }
  for (const t of tech.values()) {
    out.technologies.push(t);
    if (t.category === "live_chat" || t.category === "helpdesk") out.chat_indicators.push(`${t.name} widget script`);
    if (t.category === "booking_system") out.booking_indicators.push(`${t.name} embed`);
    if (t.category === "ecommerce_platform") out.ecommerce_indicators.push(`${t.name} storefront`);
  }
  const bodyEmails = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
  bodyEmails.slice(0, 10).forEach((e) => emails.add(e.toLowerCase()));
  out.contact = { emails: [...emails].slice(0, 10), phones: [...phones].slice(0, 10) };
  out.ctas = [...ctas].slice(0, 12);
  out.headings = [...headings].slice(0, 20);
  out.services = [...services].slice(0, 10);
  out.hiring_mentions = [...hiring];
  out.ecommerce_indicators = [...new Set(out.ecommerce_indicators)];
  out.booking_indicators = [...new Set(out.booking_indicators)];
  out.text_sample = clean(text).slice(0, 4000);
  return out;
}
