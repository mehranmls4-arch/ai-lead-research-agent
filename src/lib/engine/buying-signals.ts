import {
  BuyingSignalCategorySchema,
  SignalStrengthSchema,
  type BuyingSignal,
  type BuyingSignalCandidate,
} from "../domain/signals";
import { SourceTypeSchema, type EvidenceLabel } from "../domain/provenance";

export const MIN_SIGNAL_CONFIDENCE = 0.3;

export interface SignalValidationResult {
  accepted: BuyingSignal[];
  rejected: { signal: string; reasons: string[] }[];
}

function labelFor(sourceType: string): EvidenceLabel {
  switch (sourceType) {
    case "demo":
      return "demo";
    case "website":
      return "verified";
    case "web_search":
    case "user_input":
      return "source_backed";
    default:
      return "inferred";
  }
}

/**
 * A buying signal is only accepted when it carries evidence, a source,
 * a confidence in range and a valid detection date. No evidence → no signal.
 */
export function validateBuyingSignals(candidates: BuyingSignalCandidate[]): SignalValidationResult {
  const accepted: BuyingSignal[] = [];
  const rejected: SignalValidationResult["rejected"] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    const reasons: string[] = [];
    const category = BuyingSignalCategorySchema.safeParse(c.category);
    const strength = SignalStrengthSchema.safeParse(c.strength);
    const sourceType = SourceTypeSchema.safeParse(c.source_type);
    if (!c.signal || c.signal.trim().length < 3) reasons.push("Missing signal description");
    if (!category.success) reasons.push(`Unknown signal category "${c.category}"`);
    if (!strength.success) reasons.push(`Unknown strength "${c.strength}"`);
    if (!c.evidence || c.evidence.trim().length < 10) reasons.push("No supporting evidence");
    if (!c.source || !c.source.trim()) reasons.push("No source");
    if (!sourceType.success) reasons.push(`Unknown source type "${c.source_type}"`);
    if (!(c.confidence >= 0 && c.confidence <= 1)) reasons.push("Confidence out of range");
    else if (c.confidence < MIN_SIGNAL_CONFIDENCE) reasons.push(`Confidence ${c.confidence} below minimum ${MIN_SIGNAL_CONFIDENCE}`);
    if (Number.isNaN(Date.parse(c.detected_at))) reasons.push("Invalid detection date");
    else if (Date.parse(c.detected_at) > Date.now() + 60_000) reasons.push("Detection date is in the future");

    const dedupeKey = `${c.category}|${c.evidence?.trim().toLowerCase()}`;
    if (!reasons.length && seen.has(dedupeKey)) reasons.push("Duplicate signal");

    if (reasons.length || !category.success || !strength.success || !sourceType.success) {
      rejected.push({ signal: c.signal || "(empty)", reasons });
      continue;
    }
    seen.add(dedupeKey);
    accepted.push({
      signal: c.signal.trim(),
      category: category.data,
      strength: strength.data,
      evidence: c.evidence.trim(),
      source: c.source.trim(),
      source_type: sourceType.data,
      source_url: c.source_url ?? null,
      confidence: c.confidence,
      detected_at: new Date(c.detected_at).toISOString(),
      label: labelFor(sourceType.data),
      evidence_ids: c.evidence_ids ?? [],
    });
  }
  return { accepted, rejected };
}

export const STRENGTH_POINTS = { strong: 1, moderate: 0.6, weak: 0.3 } as const;

export function signalIntensity(signals: BuyingSignal[]): number {
  return signals.reduce((a, s) => a + STRENGTH_POINTS[s.strength] * s.confidence, 0);
}
