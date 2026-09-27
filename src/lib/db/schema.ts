import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  createdAt: createdAt(),
});

export const companies = pgTable(
  "companies",
  {
    id: id(),
    name: text("name").notNull(),
    domain: text("domain"),
    website: text("website"),
    industry: text("industry"),
    country: text("country"),
    sizeLabel: text("size_label"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("companies_domain_uq").on(t.domain), index("companies_name_idx").on(t.name)],
);

export const contacts = pgTable("contacts", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name"),
  email: text("email"),
  title: text("title"),
  createdAt: createdAt(),
});

export const campaigns = pgTable("campaigns", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const importBatches = pgTable("import_batches", {
  id: id(),
  filename: text("filename").notNull(),
  total: integer("total").notNull(),
  valid: integer("valid").notNull(),
  invalid: integer("invalid").notNull(),
  errors: jsonb("errors").$type<{ row: number; errors: string[] }[]>().notNull().default([]),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const leads = pgTable(
  "leads",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    stage: text("stage").notNull().default("new"),
    researchStatus: text("research_status").notNull().default("not_started"),
    outreachStatus: text("outreach_status").notNull().default("none"),
    inputIndustry: text("input_industry"),
    inputCountry: text("input_country"),
    // Denormalised latest results for fast filtering; the source of truth is the per-run tables.
    fitScore: integer("fit_score"),
    icpMatch: text("icp_match"),
    leadScore: integer("lead_score"),
    isDemo: boolean("is_demo").notNull().default(false),
    source: text("source").notNull().default("manual"),
    latestRunId: uuid("latest_run_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("leads_stage_idx").on(t.stage), index("leads_score_idx").on(t.leadScore), uniqueIndex("leads_company_uq").on(t.companyId)],
);

export const campaignLeads = pgTable(
  "campaign_leads",
  {
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    addedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.leadId] })],
);

/** One end-to-end research/qualification attempt for a lead (also the processing-queue row). */
export const researchRuns = pgTable(
  "research_runs",
  {
    id: id(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id").references(() => importBatches.id, { onDelete: "set null" }),
    status: text("status").notNull().default("queued"),
    forceOutreach: boolean("force_outreach").notNull().default(false),
    researchProvider: text("research_provider"),
    aiProvider: text("ai_provider"),
    isDemo: boolean("is_demo").notNull().default(false),
    notes: jsonb("notes").$type<string[]>().notNull().default([]),
    error: text("error"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("research_runs_status_idx").on(t.status), index("research_runs_lead_idx").on(t.leadId), index("research_runs_batch_idx").on(t.batchId)],
);

export const agentRuns = pgTable("agent_runs", {
  id: id(),
  researchRunId: uuid("research_run_id").notNull().references(() => researchRuns.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  aiProvider: text("ai_provider").notNull(),
  status: text("status").notNull().default("running"),
  steps: integer("steps").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: id(),
    agentRunId: uuid("agent_run_id").notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    tool: text("tool").notNull(),
    selectedBy: text("selected_by").notNull().default("planner"),
    inputSummary: text("input_summary").notNull(),
    outputSummary: text("output_summary"),
    status: text("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    durationMs: integer("duration_ms"),
  },
  (t) => [index("tool_calls_run_idx").on(t.agentRunId)],
);

export const researchReports = pgTable("research_reports", {
  id: id(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  researchRunId: uuid("research_run_id").notNull().references(() => researchRuns.id, { onDelete: "cascade" }),
  profile: jsonb("profile").notNull(),
  evidence: jsonb("evidence").notNull(),
  websiteAnalysis: jsonb("website_analysis"),
  summary: text("summary"),
  recommendedAngle: text("recommended_angle"),
  summaryGeneratedBy: text("summary_generated_by"),
  dataCompleteness: real("data_completeness").notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

export const qualifications = pgTable("qualifications", {
  id: id(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  researchRunId: uuid("research_run_id").notNull().references(() => researchRuns.id, { onDelete: "cascade" }),
  fitScore: integer("fit_score").notNull(),
  match: text("match").notNull(),
  factors: jsonb("factors").notNull(),
  icpSnapshot: jsonb("icp_snapshot").notNull(),
  createdAt: createdAt(),
});

export const leadScores = pgTable("lead_scores", {
  id: id(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  researchRunId: uuid("research_run_id").notNull().references(() => researchRuns.id, { onDelete: "cascade" }),
  total: integer("total").notNull(),
  grade: text("grade").notNull(),
  factors: jsonb("factors").notNull(),
  weights: jsonb("weights").notNull(),
  needsReview: boolean("needs_review").notNull(),
  reviewReasons: jsonb("review_reasons").$type<string[]>().notNull(),
  qualified: boolean("qualified").notNull(),
  createdAt: createdAt(),
});

export const buyingSignals = pgTable("buying_signals", {
  id: id(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  researchRunId: uuid("research_run_id").notNull().references(() => researchRuns.id, { onDelete: "cascade" }),
  signal: text("signal").notNull(),
  category: text("category").notNull(),
  strength: text("strength").notNull(),
  evidence: text("evidence").notNull(),
  source: text("source").notNull(),
  sourceType: text("source_type").notNull(),
  sourceUrl: text("source_url"),
  confidence: real("confidence").notNull(),
  label: text("label").notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const painPoints = pgTable("pain_points", {
  id: id(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  researchRunId: uuid("research_run_id").notNull().references(() => researchRuns.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  evidence: jsonb("evidence").$type<string[]>().notNull(),
  evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull(),
  severity: text("severity").notNull(),
  confidence: real("confidence").notNull(),
  label: text("label").notNull().default("potential"),
  createdAt: createdAt(),
});

export const automationOpportunities = pgTable("automation_opportunities", {
  id: id(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  researchRunId: uuid("research_run_id").notNull().references(() => researchRuns.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  title: text("title").notNull(),
  problem: text("problem").notNull(),
  evidence: jsonb("evidence").$type<string[]>().notNull(),
  proposedSolution: text("proposed_solution").notNull(),
  expectedWorkflow: jsonb("expected_workflow").$type<string[]>().notNull(),
  complexity: text("complexity").notNull(),
  confidence: real("confidence").notNull(),
  createdAt: createdAt(),
});

export const outreachDrafts = pgTable(
  "outreach_drafts",
  {
    id: id(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    researchRunId: uuid("research_run_id").references(() => researchRuns.id, { onDelete: "set null" }),
    channel: text("channel").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    // draft → (validation) → needs_review | draft ; human: approved | rejected ; approved → sent ; superseded by regeneration
    status: text("status").notNull().default("draft"),
    validationResult: text("validation_result").notNull(),
    validation: jsonb("validation").notNull(),
    validationContext: jsonb("validation_context").notNull(),
    generatedBy: text("generated_by").notNull(),
    edited: boolean("edited").notNull().default(false),
    version: integer("version").notNull().default(1),
    isDemo: boolean("is_demo").notNull().default(false),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("outreach_lead_idx").on(t.leadId)],
);

export const leadActivities = pgTable(
  "lead_activities",
  {
    id: id(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    actorType: text("actor_type", { enum: ["human", "ai", "system"] }).notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    message: text("message").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("activities_lead_idx").on(t.leadId)],
);

export const icpConfigs = pgTable("icp_configs", {
  id: id(),
  isActive: boolean("is_active").notNull().default(true),
  config: jsonb("config").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});
