import type { Evidence, Provenance } from "../../domain/provenance";
import type { BuyingSignalCandidate } from "../../domain/signals";
import { findDemoCompany } from "../../fixtures/companies";
import type { CompanyResearch, ResearchInput, ResearchProvider, WebsiteResearch } from "./types";

const DEMO_SOURCE = "Demo fixture (MockResearchProvider)";

/**
 * Returns fixture data for the built-in demo companies. For any other company it returns
 * no facts at all — the mock provider never fabricates research for unknown companies.
 */
export class MockResearchProvider implements ResearchProvider {
  readonly name = "mock";
  readonly isDemo = true;
  constructor(private readonly now: () => Date = () => new Date()) {}

  async researchCompany(input: ResearchInput): Promise<CompanyResearch> {
    const fx = findDemoCompany(input.company_name, input.website);
    const ts = this.now().toISOString();
    if (!fx) {
      return {
        provider: this.name,
        is_demo: true,
        fields: {},
        operational_signals: [],
        technology_signals: [],
        evidence: [],
        buying_signal_candidates: [],
        notes: [
          `No demo fixture exists for "${input.company_name}". The mock provider does not invent data; configure RESEARCH_PROVIDER=web for live research.`,
        ],
      };
    }
    const prov = (confidence: number, label: Provenance["label"] = "demo"): Provenance => ({
      source_type: "demo",
      source: DEMO_SOURCE,
      source_url: null,
      confidence,
      retrieved_at: ts,
      label,
    });
    const evidence: Evidence[] = [];
    const ev = (kind: string, statement: string, confidence: number) => {
      const id = `demo-${evidence.length + 1}`;
      evidence.push({ id, kind, statement, excerpt: null, provenance: prov(confidence) });
      return id;
    };
    const f = fx.facts;
    const field = <T,>(value: T, statement: string, kind: string, confidence: number) => ({
      value,
      provenance: prov(confidence),
      evidence_ids: [ev(kind, statement, confidence)],
    });
    const fields: CompanyResearch["fields"] = {
      description: field(f.description, `Company description: ${f.description}`, "description", 0.8),
      industry: field(f.industry, `Industry classification: ${f.industry}`, "industry", 0.85),
      size_range: field(f.size, `Employee count range: ${f.size.label}`, "size", 0.6),
      business_model: field(f.business_model, `Business model: ${f.business_model}`, "business_model", 0.75),
      country: field(f.country, `Headquarters country: ${f.country}`, "country", 0.9),
      locations: field(f.locations, `Office locations: ${f.locations.join("; ")}`, "locations", 0.8),
      services: field(f.services, `Services offered: ${f.services.join(", ")}`, "services", 0.85),
      target_customers: field(f.target_customers, `Target customers: ${f.target_customers.join(", ")}`, "target_customers", 0.7),
    };
    if (f.products?.length) fields.products = field(f.products, `Products: ${f.products.join(", ")}`, "products", 0.85);

    const operational_signals = fx.extra_operational.map((o) => ({
      key: o.key,
      description: o.description,
      provenance: prov(0.65),
      evidence_ids: [ev(`op_${o.key}`, o.statement, 0.65)],
    }));

    const buying_signal_candidates: BuyingSignalCandidate[] = fx.news.map((n) => {
      const id = ev("news", n.statement, n.confidence);
      return {
        signal: n.signal,
        category: n.category,
        strength: n.strength,
        evidence: n.statement,
        source: DEMO_SOURCE,
        source_type: "demo",
        source_url: null,
        confidence: n.confidence,
        detected_at: new Date(this.now().getTime() - n.days_ago * 86_400_000).toISOString(),
        evidence_ids: [id],
      };
    });

    return {
      provider: this.name,
      is_demo: true,
      fields,
      operational_signals,
      technology_signals: [],
      evidence,
      buying_signal_candidates,
      notes: [`Demo fixture "${fx.key}" (${fx.expected_outcome}). All values are simulated.`],
    };
  }

  async analyzeWebsite(url: string): Promise<WebsiteResearch> {
    const fx = findDemoCompany("", url);
    if (!fx) return { analysis: null, notes: [`No demo website fixture for ${url}; nothing was fetched in mock mode.`] };
    const ts = this.now().toISOString();
    return {
      analysis: {
        ...fx.site,
        url: fx.website,
        source_type: "demo",
        fetched_at: ts,
        robots_allowed: true,
        pages: [{ url: fx.website, status: 200, title: fx.site.title }],
        text_sample: [fx.site.title, fx.site.meta_description, ...fx.site.headings].filter(Boolean).join(" "),
        errors: [],
      },
      notes: ["Simulated website analysis (demo fixture). No network request was made."],
    };
  }
}
