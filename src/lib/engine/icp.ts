import type { CompanyProfile } from "../domain/profile";
import { dataCompleteness } from "../domain/profile";
import { ICP_CHARACTERISTICS, type IcpConfig } from "../domain/icp";
import { normalizeCountry, normalizeIndustry } from "./normalize";

export type FactorStatus = "match" | "partial" | "miss" | "unknown";
export type IcpMatch = "strong" | "medium" | "weak" | "poor" | "insufficient_data";

export interface IcpFactor {
  factor: "Industry" | "Company size" | "Geography" | "Business characteristics" | "Technology signals";
  key: "industry" | "size" | "geography" | "characteristics" | "technology";
  weight: number;
  ratio: number; // 0..1
  score: number; // weight * ratio, rounded
  status: FactorStatus;
  reason: string;
  evidence_ids: string[];
}

export interface IcpResult {
  fit_score: number;
  match: IcpMatch;
  factors: IcpFactor[];
  data_completeness: number;
  unknown_factors: string[];
}

function r(n: number) {
  return Math.round(n);
}

export function evaluateIndustry(profile: CompanyProfile, icp: IcpConfig) {
  const f = profile.industry;
  if (!f) return { ratio: 0, status: "unknown" as const, reason: "Insufficient data: industry could not be established.", ids: [] };
  const industry = normalizeIndustry(f.value);
  const targets = icp.industries.map((i) => normalizeIndustry(i));
  if (industry && targets.includes(industry)) {
    return { ratio: 1, status: "match" as const, reason: `${capital(industry)} is a configured target industry.`, ids: f.evidence_ids };
  }
  return {
    ratio: 0,
    status: "miss" as const,
    reason: `${capital(industry ?? f.value)} is not in the configured target industries.`,
    ids: f.evidence_ids,
  };
}

export function evaluateSize(profile: CompanyProfile, icp: IcpConfig) {
  const f = profile.size_range;
  if (!f) return { ratio: 0, status: "unknown" as const, reason: "Insufficient data: company size unknown.", ids: [] };
  const { min, max, label } = f.value;
  const target = `${icp.size_min}–${icp.size_max}`;
  if (min >= icp.size_min && max <= icp.size_max) {
    return { ratio: 1, status: "match" as const, reason: `Size ${label} is within the target range ${target}.`, ids: f.evidence_ids };
  }
  const overlap = Math.min(max, icp.size_max) - Math.max(min, icp.size_min);
  if (overlap >= 0) {
    return { ratio: 0.5, status: "partial" as const, reason: `Size ${label} partially overlaps the target range ${target}.`, ids: f.evidence_ids };
  }
  return { ratio: 0, status: "miss" as const, reason: `Size ${label} is outside the target range ${target}.`, ids: f.evidence_ids };
}

export function evaluateGeography(profile: CompanyProfile, icp: IcpConfig) {
  const candidates: { value: string; ids: string[] }[] = [];
  if (profile.country) candidates.push({ value: profile.country.value, ids: profile.country.evidence_ids });
  if (!candidates.length) {
    return { ratio: 0, status: "unknown" as const, reason: "Insufficient data: headquarters country unknown.", ids: [] };
  }
  const targets = icp.geographies.map((g) => normalizeCountry(g));
  const hit = candidates.find((c) => targets.includes(normalizeCountry(c.value)));
  if (hit) return { ratio: 1, status: "match" as const, reason: `${hit.value} is a target geography.`, ids: hit.ids };
  return {
    ratio: 0,
    status: "miss" as const,
    reason: `${candidates[0].value} is outside the target geographies (${icp.geographies.join(", ")}).`,
    ids: candidates[0].ids,
  };
}

export function evaluateCharacteristics(profile: CompanyProfile, icp: IcpConfig) {
  if (!icp.characteristics.length) {
    return { ratio: 1, status: "match" as const, reason: "No business characteristics configured.", ids: [] as string[], matched: [] as string[] };
  }
  const present = new Map(profile.operational_signals.map((s) => [s.key, s.evidence_ids]));
  const matched: string[] = [];
  const ids: string[] = [];
  for (const id of icp.characteristics) {
    const def = ICP_CHARACTERISTICS[id];
    const hits = def.satisfiedBy.filter((k) => present.has(k));
    if (hits.length) {
      matched.push(def.label);
      hits.forEach((h) => ids.push(...(present.get(h) ?? [])));
    }
  }
  // Companies rarely show every characteristic; half the configured list (min 1) counts as full fit.
  const required = Math.max(1, Math.ceil(icp.characteristics.length / 2));
  const ratio = Math.min(1, matched.length / required);
  if (!profile.operational_signals.length) {
    return { ratio: 0, status: "unknown" as const, reason: "Insufficient data: no operational signals observed.", ids: [], matched };
  }
  const status = ratio >= 1 ? "match" : ratio > 0 ? "partial" : "miss";
  const reason = matched.length
    ? `Observed ${matched.length} of ${required} required characteristics: ${matched.join(", ")}.`
    : "None of the configured business characteristics were observed.";
  return { ratio, status: status as FactorStatus, reason, ids: [...new Set(ids)], matched };
}

export function evaluateTechnology(profile: CompanyProfile, icp: IcpConfig) {
  if (!icp.tech_signals.length) return { ratio: 1, status: "match" as const, reason: "No technology signals configured.", ids: [] as string[] };
  const hits = profile.technology_signals.filter((t) => icp.tech_signals.includes(t.category));
  const categories = [...new Set(hits.map((h) => h.category))];
  const required = Math.min(2, icp.tech_signals.length);
  const ratio = Math.min(1, categories.length / required);
  if (!profile.technology_signals.length) {
    return { ratio: 0, status: "unknown" as const, reason: "No technology signals were detected (absence of evidence, not evidence of absence).", ids: [] };
  }
  const status: FactorStatus = ratio >= 1 ? "match" : ratio > 0 ? "partial" : "miss";
  const reason = categories.length
    ? `Detected ${hits.map((h) => h.name).join(", ")} (${categories.join(", ")}).`
    : `Detected ${profile.technology_signals.map((t) => t.name).join(", ")}, none in the target categories.`;
  return { ratio, status, reason, ids: [...new Set(hits.flatMap((h) => h.evidence_ids))] };
}

/** Deterministic ICP matching. The LLM never produces this score. */
export function matchIcp(profile: CompanyProfile, icp: IcpConfig): IcpResult {
  const w = icp.criteria_weights;
  const parts = [
    { key: "industry" as const, factor: "Industry" as const, weight: w.industry, ...evaluateIndustry(profile, icp) },
    { key: "size" as const, factor: "Company size" as const, weight: w.size, ...evaluateSize(profile, icp) },
    { key: "geography" as const, factor: "Geography" as const, weight: w.geography, ...evaluateGeography(profile, icp) },
    { key: "characteristics" as const, factor: "Business characteristics" as const, weight: w.characteristics, ...evaluateCharacteristics(profile, icp) },
    { key: "technology" as const, factor: "Technology signals" as const, weight: w.technology, ...evaluateTechnology(profile, icp) },
  ];
  const factors: IcpFactor[] = parts.map((p) => ({
    factor: p.factor,
    key: p.key,
    weight: p.weight,
    ratio: p.ratio,
    score: r(p.weight * p.ratio),
    status: p.status,
    reason: p.reason,
    evidence_ids: p.ids,
  }));
  const fit_score = factors.reduce((a, f) => a + f.score, 0);
  const unknown_factors = factors.filter((f) => f.status === "unknown").map((f) => f.factor);
  const coreUnknown = factors.filter((f) => f.status === "unknown" && ["industry", "size", "geography"].includes(f.key)).length;
  let match: IcpMatch;
  if (coreUnknown >= 2) match = "insufficient_data";
  else if (fit_score >= 75) match = "strong";
  else if (fit_score >= 50) match = "medium";
  else if (fit_score >= 30) match = "weak";
  else match = "poor";
  return { fit_score, match, factors, data_completeness: dataCompleteness(profile), unknown_factors };
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
