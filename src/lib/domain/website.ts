import { z } from "zod";
import { SourceTypeSchema } from "./provenance";
import { TechCategorySchema } from "./profile";

export const FormPurposeSchema = z.enum(["quote", "contact", "booking", "newsletter", "search", "login", "checkout", "other"]);

export const WebsiteAnalysisSchema = z.object({
  url: z.string(),
  source_type: SourceTypeSchema, // "website" for live fetches, "demo" for fixtures
  fetched_at: z.string(),
  robots_allowed: z.boolean(),
  pages: z.array(z.object({ url: z.string(), status: z.number(), title: z.string().nullable() })),
  title: z.string().nullable(),
  meta_description: z.string().nullable(),
  headings: z.array(z.string()),
  services: z.array(z.string()),
  products: z.array(z.string()),
  contact: z.object({ emails: z.array(z.string()), phones: z.array(z.string()) }),
  ctas: z.array(z.string()),
  forms: z.array(z.object({ purpose: FormPurposeSchema, fields_count: z.number().int(), page_url: z.string() })),
  booking_indicators: z.array(z.string()),
  ecommerce_indicators: z.array(z.string()),
  chat_indicators: z.array(z.string()),
  whatsapp_links: z.array(z.string()),
  technologies: z.array(z.object({ name: z.string(), category: TechCategorySchema, evidence: z.string() })),
  hiring_mentions: z.array(z.string()),
  location_mentions: z.array(z.string()),
  text_sample: z.string(),
  errors: z.array(z.string()),
});
export type WebsiteAnalysis = z.infer<typeof WebsiteAnalysisSchema>;
