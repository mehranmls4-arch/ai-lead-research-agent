import type { Evidence } from "../domain/provenance";
import type { CompanyProfile } from "../domain/profile";
import type { IcpConfig } from "../domain/icp";
import type { CrmStage, ResearchStatus } from "../domain/lead";
import type { AutomationOpportunity, PainPoint } from "../domain/signals";
import type { IcpResult } from "../engine/icp";
import type { LeadScore } from "../engine/scoring";
import type { OutreachChannel, OutreachValidation } from "../engine/outreach-validator";
import type { AIProvider } from "../providers/ai/types";
import type { CompanyResearch, ResearchProvider, WebsiteResearch } from "../providers/research/types";
import type { SignalValidationResult } from "../engine/buying-signals";

export const TOOL_NAMES = [
  "research_company",
  "analyze_website",
  "extract_profile",
  "match_icp",
  "detect_buying_signals",
  "identify_pain_points",
  "find_automation_opportunities",
  "calculate_lead_score",
  "generate_outreach",
  "validate_outreach",
  "update_crm",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface LeadContext {
  lead_id: string;
  company_name: string;
  website: string | null;
  contact: { name: string | null; email: string | null; title: string | null } | null;
  input_industry: string | null;
  input_country: string | null;
  stage: CrmStage;
  force_outreach?: boolean;
}

export interface DraftOut {
  channel: OutreachChannel;
  subject: string | null;
  body: string;
  validation?: OutreachValidation;
}

export interface AgentState {
  research?: CompanyResearch;
  website?: WebsiteResearch;
  evidence: Evidence[];
  profile?: CompanyProfile;
  icpResult?: IcpResult;
  signals?: SignalValidationResult;
  painPoints?: PainPoint[];
  rejectedPainPoints?: { title: string; reason: string }[];
  opportunities?: AutomationOpportunity[];
  score?: LeadScore;
  outreach?: { drafts: DraftOut[]; skipped_reason: string | null; personalization_phrases: string[]; allowed_facts: string[] };
  summary?: { summary: string; recommended_angle: string; generated_by: string };
  finalStage?: CrmStage;
  finalStatus?: ResearchStatus;
  notes: string[];
  isDemo: boolean;
}

export interface ToolCallRecord {
  tool: ToolName;
  input_summary: string;
  output_summary: string;
  status: "success" | "skipped" | "warning" | "failed";
  started_at: string;
  duration_ms: number;
  selected_by: "planner" | "fallback";
}

export interface RunRecorder {
  toolStarted(tool: ToolName, inputSummary: string, selectedBy: "planner" | "fallback"): Promise<string>;
  toolFinished(id: string, r: { status: ToolCallRecord["status"]; output_summary: string; duration_ms: number }): Promise<void>;
  setResearchStatus(status: ResearchStatus): Promise<void>;
}

export interface CrmWriter {
  /** Persist all results and move the lead to its next stage. Returns the stage actually set. */
  save(lead: LeadContext, state: AgentState, meta: { aiProvider: string; researchProvider: string }): Promise<CrmStage>;
}

export interface AgentDeps {
  ai: AIProvider;
  research: ResearchProvider;
  icp: IcpConfig;
  recorder: RunRecorder;
  crm: CrmWriter;
  knownCompanyNames: string[];
  latencyMs?: number;
  maxSteps?: number;
  now?: () => Date;
  sender?: { name: string; company: string };
}
