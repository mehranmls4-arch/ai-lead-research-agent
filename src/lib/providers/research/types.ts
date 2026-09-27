import type { Evidence } from "../../domain/provenance";
import type { CompanyProfile, OperationalSignal, TechSignal } from "../../domain/profile";
import type { BuyingSignalCandidate } from "../../domain/signals";
import type { WebsiteAnalysis } from "../../domain/website";

export interface ResearchInput {
  company_name: string;
  website?: string | null;
  industry?: string | null;
  country?: string | null;
}

export type ProfileFields = Partial<
  Pick<CompanyProfile, "description" | "industry" | "size_range" | "business_model" | "country" | "locations" | "services" | "products" | "target_customers">
>;

export interface CompanyResearch {
  provider: string;
  is_demo: boolean;
  fields: ProfileFields;
  operational_signals: OperationalSignal[];
  technology_signals: TechSignal[];
  evidence: Evidence[];
  buying_signal_candidates: BuyingSignalCandidate[];
  notes: string[];
}

export interface WebsiteResearch {
  analysis: WebsiteAnalysis | null;
  notes: string[];
}

/** Every research backend implements this interface. The agent never talks to a vendor directly. */
export interface ResearchProvider {
  readonly name: string;
  readonly isDemo: boolean;
  researchCompany(input: ResearchInput): Promise<CompanyResearch>;
  analyzeWebsite(url: string): Promise<WebsiteResearch>;
}
