import type { CompanyProfile } from "../domain/profile";
import { dataCompleteness } from "../domain/profile";
import { SCORE_FACTOR_KEYS, SCORE_FACTOR_LABELS, type IcpConfig, type ScoreFactorKey, type ScoreWeights } from "../domain/icp";
import type { AutomationOpportunity, BuyingSignal, PainPoint } from "../domain/signals";
import type { IcpResult } from "./icp";
import { signalIntensity } from "./buying-signals";

export interface ScoreFactor {
  key: ScoreFactorKey;
  label: string;
  weight: number;
  ratio: number;
  score: number;
  evidence: string[];
  explanation: string;
}

export interface LeadScore {
  total: number;
  grade: "A" | "B" | "C" | "D";
  factors: ScoreFactor[];
  weights: ScoreWeights;
  data_completeness: number;
  needs_review: boolean;
  review_reasons: string[];
  qualified: boolean;
}

export interface ScoreInput {
  profile: CompanyProfile;
  icpResult: IcpResult;
  signals: BuyingSignal[];
  painPoints: PainPoint[];
  opportunities: AutomationOpportunity[];
  contactTitle?: string | null;
  icp: IcpConfig;
  isDemo?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function contactRelevance(title?: string | null): { ratio: number; explanation: string } {
  if (!title || !title.trim()) return { ratio: 0, explanation: "No contact title supplied." };
  const t = title.toLowerCase();
  if (/\b(ceo|founder|co-founder|owner|president|coo|cto|chief|managing director|partner|principal)\b/.test(t) || /broker\/owner/.test(t))
    return { ratio: 1, explanation: `"${title}" is an executive decision-maker.` };
  if (/\b(vp|vice president|head of|director)\b/.test(t)) return { ratio: 0.85, explanation: `"${title}" is a senior leader.` };
  if (/\b(manager|lead)\b/.test(t) && /(operations|ops|sales|support|customer|service|revenue|growth|marketing|client)/.test(t))
    return { ratio: 0.65, explanation: `"${title}" manages a function NovaFlow's services affect.` };
  if (/\b(manager|lead)\b/.test(t)) return { ratio: 0.45, explanation: `"${title}" is a manager outside the core buying functions.` };
  return { ratio: 0.25, explanation: `"${title}" is unlikely to own the buying decision.` };
}

/** Transparent, deterministic weighted lead score. */
export function calculateLeadScore(input: ScoreInput): LeadScore {
  const { profile, icpResult, signals, painPoints, opportunities, icp } = input;
  const weights = icp.score_weights;
  const f = (k: "industry" | "size" | "geography") => icpResult.factors.find((x) => x.key === k)!;
  const factors: ScoreFactor[] = [];
  const push = (key: ScoreFactorKey, ratio: number, explanation: string, evidence: string[]) => {
    const w = weights[key];
    const rr = Math.max(0, Math.min(1, ratio));
    factors.push({ key, label: SCORE_FACTOR_LABELS[key], weight: w, ratio: round2(rr), score: Math.round(w * rr), evidence, explanation });
  };

  push("industry_fit", f("industry").ratio, f("industry").reason, profile.industry ? [`Industry: ${profile.industry.value} (${profile.industry.provenance.label})`] : []);
  push("company_size_fit", f("size").ratio, f("size").reason, profile.size_range ? [`Size: ${profile.size_range.value.label} (${profile.size_range.provenance.label})`] : []);
  push("geography_fit", f("geography").ratio, f("geography").reason, profile.country ? [`Country: ${profile.country.value} (${profile.country.provenance.label})`] : []);

  const complexity: string[] = [];
  const keys = new Set(profile.operational_signals.map((s) => s.key));
  if (keys.has("multiple_locations")) complexity.push("multiple locations");
  if (keys.has("multiple_sales_channels")) complexity.push("multiple customer channels");
  if ((profile.services?.value.length ?? 0) >= 3) complexity.push(`${profile.services!.value.length} service lines`);
  if (keys.has("support_portal")) complexity.push("customer portal");
  if (profile.business_model && ["B2B2C", "Marketplace"].includes(profile.business_model.value)) complexity.push(`${profile.business_model.value} model`);
  push(
    "business_complexity",
    complexity.length / 3,
    complexity.length ? `Complexity indicators: ${complexity.join(", ")} (3 indicators = full score).` : "No complexity indicators observed.",
    complexity,
  );

  const oppSum = opportunities.reduce((a, o) => a + o.confidence, 0);
  push(
    "automation_need",
    oppSum / 2,
    opportunities.length
      ? `${opportunities.length} potential automation opportunities; summed confidence ${round2(oppSum)} (2.0 = full score).`
      : "No evidence-backed automation opportunities identified.",
    opportunities.map((o) => o.title),
  );

  const techCats = [...new Set(profile.technology_signals.map((t) => t.category))];
  push(
    "technology_readiness",
    techCats.length / 3,
    techCats.length
      ? `Detected tooling in ${techCats.length} categories: ${techCats.join(", ")} (3 categories = full score).`
      : "No technology signals detected; readiness unknown.",
    profile.technology_signals.map((t) => `${t.name} (${t.provenance.label})`),
  );

  const intensity = signalIntensity(signals);
  push(
    "buying_signals",
    intensity / 2,
    signals.length
      ? `${signals.length} validated signal(s); weighted intensity ${round2(intensity)} (strong=1, moderate=0.6, weak=0.3, × confidence; 2.0 = full score).`
      : "No validated buying signals. Score is not inflated without evidence.",
    signals.map((s) => `${s.signal} (${s.strength}, ${s.label})`),
  );

  const sevPoints = { high: 1, medium: 0.6, low: 0.3 } as const;
  const worst = painPoints.reduce((a, p) => Math.max(a, sevPoints[p.severity] * Math.min(1, p.confidence / 0.7)), 0);
  push(
    "pain_severity",
    worst,
    painPoints.length ? `Most severe potential pain point weighted by confidence: ${round2(worst)}.` : "No potential pain points identified.",
    painPoints.map((p) => `${p.title} (${p.severity})`),
  );

  const cr = contactRelevance(input.contactTitle);
  push("contact_relevance", cr.ratio, cr.explanation, input.contactTitle ? [input.contactTitle] : []);

  // Keep factor order stable regardless of push order.
  factors.sort((a, b) => SCORE_FACTOR_KEYS.indexOf(a.key) - SCORE_FACTOR_KEYS.indexOf(b.key));
  const total = factors.reduce((a, x) => a + x.score, 0);
  const completeness = dataCompleteness(profile);
  const review_reasons: string[] = [];
  if (completeness < 0.6) review_reasons.push(`Low data completeness (${Math.round(completeness * 100)}% of core fields).`);
  if (icpResult.match === "insufficient_data") review_reasons.push("ICP match could not be determined from available data.");
  if (!profile.operational_signals.length && !profile.technology_signals.length)
    review_reasons.push("No website evidence was available to analyse.");
  const lowConfCore = (["industry", "size_range", "country"] as const).filter((k) => profile[k] && profile[k]!.provenance.confidence < 0.5);
  if (lowConfCore.length) review_reasons.push(`Low-confidence core fields: ${lowConfCore.join(", ")}.`);
  if (input.isDemo) review_reasons.push("Based on demo data — not real research.");
  const blocking = review_reasons.filter((r) => !r.startsWith("Based on demo"));
  const grade = total >= 80 ? "A" : total >= 65 ? "B" : total >= 45 ? "C" : "D";
  return {
    total,
    grade,
    factors,
    weights,
    data_completeness: round2(completeness),
    needs_review: blocking.length > 0,
    review_reasons,
    qualified: blocking.length === 0 && total >= icp.qualification_threshold,
  };
}
