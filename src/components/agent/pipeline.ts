/** Maps agent tools to the user-facing pipeline stages shown in the live progress view. */
export const PIPELINE_STEPS = [
  { key: "research", label: "Research", tools: ["research_company", "analyze_website"] },
  { key: "profile", label: "Company profile", tools: ["extract_profile"] },
  { key: "icp", label: "ICP match", tools: ["match_icp"] },
  { key: "signals", label: "Buying signals", tools: ["detect_buying_signals"] },
  { key: "pains", label: "Pain points", tools: ["identify_pain_points"] },
  { key: "opps", label: "Automation opportunities", tools: ["find_automation_opportunities"] },
  { key: "score", label: "Lead score", tools: ["calculate_lead_score"] },
  { key: "outreach", label: "Outreach draft", tools: ["generate_outreach", "validate_outreach"] },
  { key: "approval", label: "Human approval", tools: ["update_crm"] },
] as const;

export const TOOL_LABELS: Record<string, string> = {
  research_company: "Research company",
  analyze_website: "Analyze website",
  extract_profile: "Extract profile",
  match_icp: "Evaluate ICP",
  detect_buying_signals: "Detect buying signals",
  identify_pain_points: "Identify pain points",
  find_automation_opportunities: "Find automation opportunities",
  calculate_lead_score: "Calculate score",
  generate_outreach: "Generate outreach",
  validate_outreach: "Validate outreach",
  update_crm: "Update CRM",
};

export interface ToolCallView {
  seq: number;
  tool: string;
  status: string;
  input: string;
  output: string | null;
  durationMs: number | null;
  selectedBy: string;
  startedAt: string | Date;
}

export type StepState = "pending" | "running" | "done" | "skipped" | "warning" | "failed";

export function stepStates(calls: ToolCallView[]): Record<string, StepState> {
  const out: Record<string, StepState> = {};
  for (const step of PIPELINE_STEPS) {
    const mine = calls.filter((c) => (step.tools as readonly string[]).includes(c.tool));
    if (!mine.length) out[step.key] = "pending";
    else if (mine.some((c) => c.status === "failed")) out[step.key] = "failed";
    else if (mine.some((c) => c.status === "running") || mine.length < step.tools.length) out[step.key] = "running";
    else if (mine.every((c) => c.status === "skipped")) out[step.key] = "skipped";
    else if (mine.some((c) => c.status === "warning")) out[step.key] = "warning";
    else out[step.key] = "done";
  }
  return out;
}
