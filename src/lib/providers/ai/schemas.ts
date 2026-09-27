import { z } from "zod";

const cited = <T extends z.ZodTypeAny>(v: T) =>
  z.object({ value: v, evidence_ids: z.array(z.string()).min(1), confidence: z.number().min(0).max(1) });

/** Output of the extract_profile task. Every field must cite evidence ids supplied in the input. */
export const ExtractProfileOutputSchema = z.object({
  description: cited(z.string().max(400)).nullable(),
  industry: cited(z.string().max(80)).nullable(),
  services: cited(z.array(z.string().max(80)).max(10)).nullable(),
  target_customers: cited(z.array(z.string().max(80)).max(6)).nullable(),
});
export type ExtractProfileOutput = z.infer<typeof ExtractProfileOutputSchema>;

export const OutreachInputSchema = z.object({
  company_name: z.string(),
  contact_first_name: z.string().nullable(),
  sender_name: z.string(),
  sender_company: z.string(),
  observations: z.array(z.object({ phrase: z.string(), evidence_id: z.string() })),
  primary_opportunity: z.object({ key: z.string(), title: z.string(), solution: z.string(), problem: z.string() }),
  secondary_opportunity: z.object({ key: z.string(), title: z.string(), solution: z.string(), problem: z.string() }).nullable(),
  primary_pain_key: z.string().nullable(),
  primary_pain_phrase: z.string(),
  allowed_facts: z.array(z.string()),
});
export type OutreachInput = z.infer<typeof OutreachInputSchema>;

export const OutreachOutputSchema = z.object({
  email: z.object({ subject: z.string().min(1).max(120), body: z.string().min(1) }),
  linkedin: z.object({ body: z.string().min(1) }),
  followup_1: z.object({ subject: z.string().min(1).max(120), body: z.string().min(1) }),
  followup_2: z.object({ subject: z.string().min(1).max(120), body: z.string().min(1) }),
});
export type OutreachOutput = z.infer<typeof OutreachOutputSchema>;

export const SummaryOutputSchema = z.object({
  summary: z.string().min(1).max(900),
  recommended_angle: z.string().min(1).max(400),
});
export type SummaryOutput = z.infer<typeof SummaryOutputSchema>;
