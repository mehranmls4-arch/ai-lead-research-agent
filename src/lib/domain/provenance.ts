import { z } from "zod";

/**
 * Where a piece of data came from.
 * - website:     fetched from the company's own public website
 * - web_search:  returned by a third-party web search provider
 * - user_input:  typed/imported by a user of this application
 * - demo:        fixture data from the mock research provider (NOT real)
 * - derived:     computed by this system from other evidence
 */
export const SourceTypeSchema = z.enum(["website", "web_search", "user_input", "demo", "derived"]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

/**
 * How much a claim can be trusted. Shown on every data point in the UI.
 * - verified:      observed literally in a primary source (the company's own website)
 * - source_backed: stated by a cited third-party source or supplied by the user
 * - estimated:     an approximate value (e.g. size range) without a direct statement
 * - inferred:      deduced by rules or the AI model from other evidence
 * - demo:          simulated fixture data — never real research
 * - potential:     a hypothesis (pain points, opportunities) — not a fact
 */
export const EvidenceLabelSchema = z.enum([
  "verified",
  "source_backed",
  "estimated",
  "inferred",
  "demo",
  "potential",
]);
export type EvidenceLabel = z.infer<typeof EvidenceLabelSchema>;

export const ProvenanceSchema = z.object({
  source_type: SourceTypeSchema,
  source: z.string().min(1),
  source_url: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  retrieved_at: z.string(),
  label: EvidenceLabelSchema,
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const EvidenceSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  statement: z.string().min(1),
  excerpt: z.string().nullable(),
  provenance: ProvenanceSchema,
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export function makeField<T extends z.ZodTypeAny>(value: T) {
  return z.object({
    value,
    provenance: ProvenanceSchema,
    evidence_ids: z.array(z.string()),
  });
}

export type Field<T> = { value: T; provenance: Provenance; evidence_ids: string[] };

/** Demo data must always carry the demo label, whatever the caller asked for. */
export function enforceDemoLabel(p: Provenance): Provenance {
  if (p.source_type === "demo" && p.label !== "demo") return { ...p, label: "demo" };
  return p;
}

export const LABEL_TEXT: Record<EvidenceLabel, string> = {
  verified: "Verified",
  source_backed: "Source-backed",
  estimated: "Estimated",
  inferred: "Inferred",
  demo: "Demo",
  potential: "Potential",
};

export function confidenceBand(c: number): "high" | "medium" | "low" {
  if (c >= 0.75) return "high";
  if (c >= 0.5) return "medium";
  return "low";
}
