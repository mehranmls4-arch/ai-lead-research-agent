import { z } from "zod";
import { TechCategorySchema, type OperationalSignalKey } from "./profile";

/** Business characteristics an ICP can target, and the observable signals that satisfy each. */
export const ICP_CHARACTERISTICS: Record<string, { label: string; satisfiedBy: OperationalSignalKey[] }> = {
  high_customer_inquiry_volume: {
    label: "High customer inquiry volume",
    satisfiedBy: ["high_inquiry_volume", "quote_request_form", "whatsapp_contact", "phone_primary_contact"],
  },
  repetitive_admin_work: {
    label: "Repetitive administrative work",
    satisfiedBy: ["repetitive_admin", "booking_system", "support_portal"],
  },
  multiple_sales_channels: {
    label: "Multiple sales channels",
    satisfiedBy: ["multiple_sales_channels", "ecommerce", "whatsapp_contact"],
  },
  manual_lead_handling: {
    label: "Manual lead handling",
    satisfiedBy: ["manual_lead_handling", "quote_request_form", "contact_form"],
  },
  large_support_workload: {
    label: "Large support workload",
    satisfiedBy: ["high_inquiry_volume", "support_portal", "email_only_support", "live_chat"],
  },
  multi_location_operations: {
    label: "Multi-location operations",
    satisfiedBy: ["multiple_locations"],
  },
};
export const ICP_CHARACTERISTIC_IDS = Object.keys(ICP_CHARACTERISTICS);

export const CriteriaWeightsSchema = z
  .object({
    industry: z.number().int().min(0).max(100),
    size: z.number().int().min(0).max(100),
    geography: z.number().int().min(0).max(100),
    characteristics: z.number().int().min(0).max(100),
    technology: z.number().int().min(0).max(100),
  })
  .refine((w) => Object.values(w).reduce((a, b) => a + b, 0) === 100, {
    message: "ICP criteria weights must sum to 100",
  });
export type CriteriaWeights = z.infer<typeof CriteriaWeightsSchema>;

export const SCORE_FACTOR_KEYS = [
  "industry_fit",
  "company_size_fit",
  "geography_fit",
  "business_complexity",
  "automation_need",
  "technology_readiness",
  "buying_signals",
  "pain_severity",
  "contact_relevance",
] as const;
export type ScoreFactorKey = (typeof SCORE_FACTOR_KEYS)[number];

export const SCORE_FACTOR_LABELS: Record<ScoreFactorKey, string> = {
  industry_fit: "Industry fit",
  company_size_fit: "Company size",
  geography_fit: "Geography",
  business_complexity: "Business complexity",
  automation_need: "Automation need",
  technology_readiness: "Technology readiness",
  buying_signals: "Buying signals",
  pain_severity: "Pain severity",
  contact_relevance: "Contact relevance",
};

export const ScoreWeightsSchema = z
  .object(Object.fromEntries(SCORE_FACTOR_KEYS.map((k) => [k, z.number().int().min(0).max(100)])) as Record<
    ScoreFactorKey,
    z.ZodNumber
  >)
  .refine((w) => Object.values(w).reduce((a: number, b) => a + (b as number), 0) === 100, {
    message: "Lead score weights must sum to 100",
  });
export type ScoreWeights = Record<ScoreFactorKey, number>;

export const IcpConfigSchema = z
  .object({
    name: z.string().min(1).max(120),
    industries: z.array(z.string().min(1).max(80)).min(1).max(30),
    size_min: z.number().int().min(1),
    size_max: z.number().int().min(1),
    geographies: z.array(z.string().min(1).max(80)).min(1).max(30),
    characteristics: z.array(z.string()).max(20),
    tech_signals: z.array(TechCategorySchema).max(10),
    criteria_weights: CriteriaWeightsSchema,
    score_weights: ScoreWeightsSchema,
    qualification_threshold: z.number().int().min(0).max(100),
  })
  .refine((c) => c.size_min <= c.size_max, { message: "size_min must be <= size_max", path: ["size_min"] })
  .refine((c) => c.characteristics.every((id) => ICP_CHARACTERISTIC_IDS.includes(id)), {
    message: "Unknown business characteristic",
    path: ["characteristics"],
  });
export type IcpConfig = z.infer<typeof IcpConfigSchema>;

export const DEFAULT_ICP: IcpConfig = {
  name: "NovaFlow AI — core ICP",
  industries: ["logistics", "real estate", "ecommerce", "healthcare administration", "professional services"],
  size_min: 10,
  size_max: 500,
  geographies: ["United States"],
  characteristics: [
    "high_customer_inquiry_volume",
    "repetitive_admin_work",
    "multiple_sales_channels",
    "manual_lead_handling",
    "large_support_workload",
  ],
  tech_signals: ["crm", "ecommerce_platform", "helpdesk", "booking_system"],
  criteria_weights: { industry: 30, size: 20, geography: 20, characteristics: 20, technology: 10 },
  score_weights: {
    industry_fit: 15,
    company_size_fit: 10,
    geography_fit: 10,
    business_complexity: 10,
    automation_need: 20,
    technology_readiness: 10,
    buying_signals: 15,
    pain_severity: 5,
    contact_relevance: 5,
  },
  qualification_threshold: 55,
};
