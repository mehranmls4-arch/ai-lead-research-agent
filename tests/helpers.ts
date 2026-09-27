import { runAgent } from "@/lib/agent/orchestrator";
import { MemoryCrm, MemoryRecorder } from "@/lib/services/preview";
import { DEFAULT_ICP, type IcpConfig } from "@/lib/domain/icp";
import { DEMO_COMPANIES } from "@/lib/fixtures/companies";
import { MockAIProvider } from "@/lib/providers/ai/mock";
import { MockResearchProvider } from "@/lib/providers/research/mock";
import type { AIProvider } from "@/lib/providers/ai/types";
import type { CompanyProfile } from "@/lib/domain/profile";
import type { EvidenceLabel, Field, Provenance } from "@/lib/domain/provenance";

export const NOW = new Date("2026-09-20T12:00:00Z");

/** Fills every optional LeadInput field so literals satisfy the schema's inferred type. */
export function leadInput(overrides: { company_name: string; website?: string; contact_name?: string; contact_email?: string; title?: string; industry?: string; country?: string }) {
  return { website: undefined, contact_name: undefined, contact_email: undefined, title: undefined, industry: undefined, country: undefined, ...overrides };
}

export async function runFixture(key: string, opts: { icp?: IcpConfig; ai?: AIProvider; force?: boolean; contactTitle?: string | null } = {}) {
  const fx = DEMO_COMPANIES.find((c) => c.key === key);
  if (!fx) throw new Error(`no fixture ${key}`);
  const recorder = new MemoryRecorder();
  const crm = new MemoryCrm();
  const state = await runAgent(
    {
      lead_id: "11111111-1111-4111-8111-111111111111",
      company_name: fx.company_name,
      website: fx.website,
      contact: { name: fx.contact.name, email: fx.contact.email, title: opts.contactTitle === undefined ? fx.contact.title : opts.contactTitle },
      input_industry: null,
      input_country: null,
      stage: "new",
      force_outreach: opts.force,
    },
    {
      ai: opts.ai ?? new MockAIProvider(),
      research: new MockResearchProvider(() => NOW),
      icp: opts.icp ?? DEFAULT_ICP,
      recorder,
      crm,
      knownCompanyNames: DEMO_COMPANIES.filter((c) => c.key !== key).map((c) => c.company_name),
      now: () => NOW,
    },
  );
  return { state, recorder, crm, fixture: fx };
}

export function prov(label: EvidenceLabel = "verified", confidence = 0.9): Provenance {
  return { source_type: label === "demo" ? "demo" : "website", source: "Test source", source_url: null, confidence, retrieved_at: NOW.toISOString(), label };
}

export function field<T>(value: T, label: EvidenceLabel = "verified", confidence = 0.9): Field<T> {
  return { value, provenance: prov(label, confidence), evidence_ids: ["e1"] };
}

export function profile(p: Partial<CompanyProfile> = {}): CompanyProfile {
  return { company_name: "Test Co", website: "https://test.example", technology_signals: [], operational_signals: [], ...p };
}
