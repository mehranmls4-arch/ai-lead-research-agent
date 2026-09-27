import { z } from "zod";

export const CRM_STAGES = [
  "new",
  "researching",
  "qualified",
  "needs_review",
  "outreach_drafted",
  "approved",
  "contacted",
  "replied",
  "meeting",
  "won",
  "lost",
] as const;
export const CrmStageSchema = z.enum(CRM_STAGES);
export type CrmStage = z.infer<typeof CrmStageSchema>;

export const STAGE_LABELS: Record<CrmStage, string> = {
  new: "New",
  researching: "Researching",
  qualified: "Qualified",
  needs_review: "Needs review",
  outreach_drafted: "Outreach drafted",
  approved: "Approved",
  contacted: "Contacted",
  replied: "Replied",
  meeting: "Meeting",
  won: "Won",
  lost: "Lost",
};

export const RESEARCH_STATUSES = [
  "not_started",
  "queued",
  "researching",
  "enriching",
  "qualifying",
  "scoring",
  "ready",
  "needs_review",
  "failed",
] as const;
export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];

export const RESEARCH_STATUS_LABELS: Record<ResearchStatus, string> = {
  not_started: "Not started",
  queued: "Queued",
  researching: "Researching",
  enriching: "Enriching",
  qualifying: "Qualifying",
  scoring: "Scoring",
  ready: "Ready",
  needs_review: "Needs review",
  failed: "Failed",
};

export const OUTREACH_STATUSES = ["none", "skipped", "drafted", "needs_review", "approved", "rejected", "sent"] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const LeadInputSchema = z.object({
  company_name: z.string().trim().min(1, "Company name is required").max(200),
  website: optionalText(500),
  contact_name: optionalText(120),
  contact_email: z
    .string()
    .trim()
    .max(254)
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.email("Invalid email address").optional()),
  title: optionalText(120),
  industry: optionalText(80),
  country: optionalText(80),
});
export type LeadInput = z.infer<typeof LeadInputSchema>;
