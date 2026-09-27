import { z } from "zod";
import { EvidenceLabelSchema, SourceTypeSchema } from "./provenance";

export const BUYING_SIGNAL_CATEGORIES = [
  "hiring_operations",
  "hiring_support_sales",
  "new_service_launch",
  "location_expansion",
  "inquiry_complexity",
  "manual_contact_workflow",
  "new_technology",
  "product_launch",
  "automation_request",
] as const;
export const BuyingSignalCategorySchema = z.enum(BUYING_SIGNAL_CATEGORIES);
export type BuyingSignalCategory = z.infer<typeof BuyingSignalCategorySchema>;

export const SignalStrengthSchema = z.enum(["strong", "moderate", "weak"]);
export type SignalStrength = z.infer<typeof SignalStrengthSchema>;

/** A candidate as produced by a research provider or detector (not yet validated). */
export const BuyingSignalCandidateSchema = z.object({
  signal: z.string(),
  category: z.string(),
  strength: z.string(),
  evidence: z.string(),
  source: z.string(),
  source_type: z.string(),
  source_url: z.string().nullable().optional(),
  confidence: z.number(),
  detected_at: z.string(),
  evidence_ids: z.array(z.string()).optional(),
});
export type BuyingSignalCandidate = z.infer<typeof BuyingSignalCandidateSchema>;

export const BuyingSignalSchema = z.object({
  signal: z.string().min(3),
  category: BuyingSignalCategorySchema,
  strength: SignalStrengthSchema,
  evidence: z.string().min(10),
  source: z.string().min(1),
  source_type: SourceTypeSchema,
  source_url: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  detected_at: z.string(),
  label: EvidenceLabelSchema,
  evidence_ids: z.array(z.string()),
});
export type BuyingSignal = z.infer<typeof BuyingSignalSchema>;

export const SeveritySchema = z.enum(["high", "medium", "low"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const PainPointSchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string(),
  evidence: z.array(z.string()).min(1),
  evidence_ids: z.array(z.string()).min(1),
  severity: SeveritySchema,
  confidence: z.number().min(0).max(1),
  label: z.literal("potential"),
});
export type PainPoint = z.infer<typeof PainPointSchema>;

export const ComplexitySchema = z.enum(["low", "medium", "high"]);

export const AutomationOpportunitySchema = z.object({
  key: z.string(),
  title: z.string(),
  problem: z.string(),
  evidence: z.array(z.string()).min(1),
  evidence_ids: z.array(z.string()),
  proposed_solution: z.string(),
  expected_workflow: z.array(z.string()).min(2),
  implementation_complexity: ComplexitySchema,
  confidence: z.number().min(0).max(1),
  related_pain_points: z.array(z.string()),
  label: z.literal("potential"),
});
export type AutomationOpportunity = z.infer<typeof AutomationOpportunitySchema>;
