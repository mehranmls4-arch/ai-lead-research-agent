import type { Evidence, Provenance } from "../domain/provenance";
import type { CompanyProfile, OperationalSignal, TechSignal } from "../domain/profile";
import { emptyProfile } from "../domain/profile";
import type { WebsiteAnalysis } from "../domain/website";
import { normalizeCountry, normalizeIndustry, titleCase } from "../engine/normalize";
import { detectOperationalSignals, evidenceFromWebsite, techSignalsFromWebsite } from "../engine/operational-signals";
import type { ExtractProfileOutput } from "../providers/ai/schemas";
import type { CompanyResearch } from "../providers/research/types";
import type { LeadContext } from "./types";

const US_STATE_RE = /,\s?(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)$/;

export interface BaseProfileResult {
  profile: CompanyProfile;
  evidence: Evidence[];
  missing: string[];
}

/** Deterministic merge of provider research, website observations and user input. */
export function buildBaseProfile(lead: LeadContext, research: CompanyResearch | undefined, website: WebsiteAnalysis | null, now: string): BaseProfileResult {
  const profile = emptyProfile(lead.company_name, lead.website);
  const evidence: Evidence[] = [...(research?.evidence ?? [])];
  let webEv: Evidence[] = [];
  if (website) {
    webEv = evidenceFromWebsite(website);
    evidence.push(...webEv);
  }

  if (research) Object.assign(profile, research.fields);

  const userProv = (confidence: number): Provenance => ({
    source_type: "user_input",
    source: "Lead input",
    source_url: null,
    confidence,
    retrieved_at: now,
    label: "source_backed",
  });
  const addUser = (kind: string, statement: string) => {
    const id = `user-${evidence.filter((e) => e.id.startsWith("user-")).length + 1}`;
    evidence.push({ id, kind, statement, excerpt: null, provenance: userProv(0.7) });
    return id;
  };
  if (!profile.industry && lead.input_industry) {
    const v = normalizeIndustry(lead.input_industry) ?? lead.input_industry;
    profile.industry = { value: v, provenance: userProv(0.7), evidence_ids: [addUser("industry", `Industry provided in lead input: ${lead.input_industry}`)] };
  }
  if (!profile.country && lead.input_country) {
    const v = titleCase(normalizeCountry(lead.input_country) ?? lead.input_country);
    profile.country = { value: v, provenance: userProv(0.7), evidence_ids: [addUser("country", `Country provided in lead input: ${lead.input_country}`)] };
  }

  if (website) {
    const locEv = webEv.filter((e) => e.kind === "locations").map((e) => e.id);
    if (!profile.locations && website.location_mentions.length && locEv.length) {
      profile.locations = { value: website.location_mentions, provenance: webEv.find((e) => e.kind === "locations")!.provenance, evidence_ids: locEv };
    }
    if (!profile.country && website.location_mentions.length && website.location_mentions.every((l) => US_STATE_RE.test(l)) && locEv.length) {
      profile.country = {
        value: "United States",
        provenance: { ...webEv.find((e) => e.kind === "locations")!.provenance, source_type: website.source_type === "demo" ? "demo" : "derived", source: website.source_type === "demo" ? "Demo fixture (simulated website)" : "Inferred from US addresses on website", confidence: 0.6, label: website.source_type === "demo" ? "demo" : "inferred" },
        evidence_ids: locEv,
      };
    }
  }

  const tech: TechSignal[] = [...(research?.technology_signals ?? []), ...(website ? techSignalsFromWebsite(website, webEv) : [])];
  profile.technology_signals = dedupeBy(tech, (t) => t.name.toLowerCase());
  const ops: OperationalSignal[] = [...(research?.operational_signals ?? []), ...(website ? detectOperationalSignals(website, webEv) : [])];
  profile.operational_signals = dedupeBy(ops, (o) => o.key);

  const missing = (["description", "industry", "services", "target_customers"] as const).filter((k) => !profile[k]);
  return { profile, evidence, missing };
}

/** Apply AI extraction output, rejecting any field that cites evidence we do not have. */
export function applyExtraction(
  base: BaseProfileResult,
  out: ExtractProfileOutput,
  providerName: string,
  isMockAI: boolean,
  now: string,
): { profile: CompanyProfile; applied: string[]; rejected: string[] } {
  const known = new Set(base.evidence.map((e) => e.id));
  const profile: CompanyProfile = { ...base.profile };
  const applied: string[] = [];
  const rejected: string[] = [];
  const allDemo = (ids: string[]) => ids.every((id) => base.evidence.find((e) => e.id === id)?.provenance.source_type === "demo");
  const prov = (confidence: number, ids: string[]): Provenance => ({
    source_type: allDemo(ids) ? "demo" : "derived",
    source: isMockAI ? "Rule-based extraction (mock AI provider)" : `AI extraction (${providerName})`,
    source_url: null,
    confidence: Math.min(0.75, confidence),
    retrieved_at: now,
    label: allDemo(ids) ? "demo" : "inferred",
  });
  for (const key of ["description", "industry", "services", "target_customers"] as const) {
    const f = out[key];
    if (!f || !base.missing.includes(key)) continue;
    const unknown = f.evidence_ids.filter((id) => !known.has(id));
    if (unknown.length || !f.evidence_ids.length) {
      rejected.push(`${key} (cited unknown evidence ${unknown.join(", ") || "none"})`);
      continue;
    }
    const value = key === "industry" ? normalizeIndustry(f.value as string) ?? (f.value as string) : f.value;
    (profile as Record<string, unknown>)[key] = { value, provenance: prov(f.confidence, f.evidence_ids), evidence_ids: f.evidence_ids };
    applied.push(key);
  }
  return { profile, applied, rejected };
}

function dedupeBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = key(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
