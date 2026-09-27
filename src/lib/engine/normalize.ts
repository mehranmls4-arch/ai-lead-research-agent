/** Canonical industry names and the aliases/keywords that map to them. */
export const INDUSTRY_CATALOG: Record<string, { aliases: string[]; keywords: string[] }> = {
  logistics: {
    aliases: ["logistics", "freight", "transportation", "trucking", "shipping", "3pl", "supply chain", "warehousing"],
    keywords: ["freight", "shipping", "trucking", "logistics", "warehousing", "3pl", "courier", "fleet", "ltl", "ftl", "dispatch", "cross-dock", "shipment"],
  },
  "real estate": {
    aliases: ["real estate", "realty", "property management", "brokerage", "property"],
    keywords: ["real estate", "realty", "homes for sale", "property management", "listing", "leasing", "brokerage", "showing", "rental"],
  },
  ecommerce: {
    aliases: ["ecommerce", "e-commerce", "online retail", "dtc", "d2c", "online store"],
    keywords: ["add to cart", "online store", "free shipping", "checkout", "shop now", "cart", "returns policy"],
  },
  "healthcare administration": {
    aliases: ["healthcare administration", "medical billing", "revenue cycle management", "healthcare admin", "practice management"],
    keywords: ["medical billing", "credentialing", "revenue cycle", "prior authorization", "practice management", "claims", "patient scheduling", "payer"],
  },
  "professional services": {
    aliases: ["professional services", "accounting", "consulting", "legal", "law firm", "advisory", "bookkeeping"],
    keywords: ["accounting", "bookkeeping", "tax preparation", "consulting", "advisory", "law firm", "attorney", "cpa"],
  },
  manufacturing: {
    aliases: ["manufacturing", "industrial", "steel", "fabrication"],
    keywords: ["manufacturing", "factory", "fabrication", "steel", "machining", "production line", "foundry", "mill"],
  },
  retail: { aliases: ["retail", "brick and mortar"], keywords: ["store locations", "in-store", "retail"] },
  hospitality: { aliases: ["hospitality", "hotel", "restaurant"], keywords: ["hotel", "reservations", "restaurant", "menu", "rooms"] },
  "software / saas": { aliases: ["software", "saas", "technology"], keywords: ["saas", "platform", "api", "software", "free trial"] },
};

export function normalizeIndustry(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  for (const [canonical, { aliases }] of Object.entries(INDUSTRY_CATALOG)) {
    if (v === canonical || aliases.includes(v)) return canonical;
  }
  for (const [canonical, { aliases }] of Object.entries(INDUSTRY_CATALOG)) {
    if (aliases.some((a) => v.includes(a))) return canonical;
  }
  return v;
}

export interface IndustryClassification {
  industry: string;
  hits: string[];
  confidence: number;
}

/**
 * Keyword-based industry inference from page text. Deterministic.
 * Requires at least 2 distinct keyword hits and a clear margin over the runner-up;
 * otherwise returns null (insufficient evidence rather than a guess).
 */
export function classifyIndustryFromText(text: string): IndustryClassification | null {
  const t = text.toLowerCase();
  const scored = Object.entries(INDUSTRY_CATALOG)
    .map(([industry, { keywords }]) => ({ industry, hits: keywords.filter((k) => t.includes(k)) }))
    .sort((a, b) => b.hits.length - a.hits.length);
  const [best, second] = scored;
  if (!best || best.hits.length < 2) return null;
  const margin = best.hits.length - (second?.hits.length ?? 0);
  if (margin < 1) return null;
  const confidence = Math.min(0.85, 0.45 + 0.08 * best.hits.length + 0.05 * margin);
  return { industry: best.industry, hits: best.hits, confidence: Math.round(confidence * 100) / 100 };
}

const COUNTRY_ALIASES: Record<string, string[]> = {
  "united states": ["us", "usa", "u.s.", "u.s.a.", "united states of america", "america"],
  "united kingdom": ["uk", "u.k.", "great britain", "england", "gb"],
  canada: ["ca", "can"],
  germany: ["de", "deutschland"],
  pakistan: ["pk"],
  "united arab emirates": ["uae", "u.a.e."],
  australia: ["au"],
};

export function normalizeCountry(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  for (const [canonical, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (v === canonical || aliases.includes(v)) return canonical;
  }
  return v;
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
