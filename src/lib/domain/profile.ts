import { z } from "zod";
import { EvidenceSchema, ProvenanceSchema, makeField } from "./provenance";

export const SIZE_BANDS = [
  { label: "1-10", min: 1, max: 10 },
  { label: "11-50", min: 11, max: 50 },
  { label: "51-200", min: 51, max: 200 },
  { label: "201-500", min: 201, max: 500 },
  { label: "501-1000", min: 501, max: 1000 },
  { label: "1001-5000", min: 1001, max: 5000 },
  { label: "5000+", min: 5001, max: 1_000_000 },
] as const;

export const SizeRangeSchema = z.object({
  label: z.string(),
  min: z.number().int().nonnegative(),
  max: z.number().int().positive(),
});
export type SizeRange = z.infer<typeof SizeRangeSchema>;

export const TECH_CATEGORIES = [
  "crm",
  "ecommerce_platform",
  "helpdesk",
  "booking_system",
  "live_chat",
  "marketing_automation",
  "cms",
  "analytics",
  "payments",
  "erp",
] as const;
export const TechCategorySchema = z.enum(TECH_CATEGORIES);
export type TechCategory = z.infer<typeof TechCategorySchema>;

export const TechSignalSchema = z.object({
  name: z.string(),
  category: TechCategorySchema,
  provenance: ProvenanceSchema,
  evidence_ids: z.array(z.string()),
});
export type TechSignal = z.infer<typeof TechSignalSchema>;

export const OPERATIONAL_SIGNAL_KEYS = [
  "quote_request_form",
  "contact_form",
  "booking_system",
  "ecommerce",
  "live_chat",
  "chatbot",
  "whatsapp_contact",
  "phone_primary_contact",
  "multiple_locations",
  "multiple_sales_channels",
  "high_inquiry_volume",
  "manual_lead_handling",
  "repetitive_admin",
  "support_portal",
  "careers_page",
  "email_only_support",
] as const;
export const OperationalSignalKeySchema = z.enum(OPERATIONAL_SIGNAL_KEYS);
export type OperationalSignalKey = z.infer<typeof OperationalSignalKeySchema>;

export const OperationalSignalSchema = z.object({
  key: OperationalSignalKeySchema,
  description: z.string(),
  provenance: ProvenanceSchema,
  evidence_ids: z.array(z.string()),
});
export type OperationalSignal = z.infer<typeof OperationalSignalSchema>;

export const BusinessModelSchema = z.enum(["B2B", "B2C", "B2B2C", "Marketplace"]);

export const CompanyProfileSchema = z.object({
  company_name: z.string(),
  website: z.string().nullable(),
  description: makeField(z.string()).optional(),
  industry: makeField(z.string()).optional(),
  size_range: makeField(SizeRangeSchema).optional(),
  business_model: makeField(BusinessModelSchema).optional(),
  country: makeField(z.string()).optional(),
  locations: makeField(z.array(z.string())).optional(),
  services: makeField(z.array(z.string())).optional(),
  products: makeField(z.array(z.string())).optional(),
  target_customers: makeField(z.array(z.string())).optional(),
  technology_signals: z.array(TechSignalSchema),
  operational_signals: z.array(OperationalSignalSchema),
});
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

export const PROFILE_FIELD_KEYS = [
  "description",
  "industry",
  "size_range",
  "business_model",
  "country",
  "locations",
  "services",
  "products",
  "target_customers",
] as const;
export type ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number];

/** Fields that the ICP engine depends on. Used for data-completeness. */
export const CORE_FIELDS: ProfileFieldKey[] = ["industry", "size_range", "country", "services", "business_model"];

export function emptyProfile(company_name: string, website: string | null): CompanyProfile {
  return { company_name, website, technology_signals: [], operational_signals: [] };
}

export function dataCompleteness(profile: CompanyProfile): number {
  const present = CORE_FIELDS.filter((k) => profile[k] !== undefined).length;
  return present / CORE_FIELDS.length;
}

export const EvidenceListSchema = z.array(EvidenceSchema);

export function sizeBandFor(n: number): SizeRange {
  const band = SIZE_BANDS.find((b) => n >= b.min && n <= b.max) ?? SIZE_BANDS[SIZE_BANDS.length - 1];
  return { label: band.label, min: band.min, max: band.max };
}
