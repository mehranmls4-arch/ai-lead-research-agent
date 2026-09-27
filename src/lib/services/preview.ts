import { runAgent } from "../agent/orchestrator";
import type { AgentState, CrmWriter, LeadContext, RunRecorder, ToolCallRecord, ToolName } from "../agent/types";
import { DEFAULT_ICP } from "../domain/icp";
import { DEMO_COMPANIES, findDemoCompany } from "../fixtures/companies";
import { MockAIProvider } from "../providers/ai/mock";
import { MockResearchProvider } from "../providers/research/mock";

/** In-memory recorder: keeps the tool log without touching the database. */
export class MemoryRecorder implements RunRecorder {
  calls: (Omit<ToolCallRecord, "status" | "output_summary" | "duration_ms"> & Partial<ToolCallRecord>)[] = [];
  statuses: string[] = [];
  async toolStarted(tool: ToolName, input: string, selectedBy: "planner" | "fallback") {
    this.calls.push({ tool, input_summary: input, selected_by: selectedBy, started_at: new Date().toISOString() });
    return String(this.calls.length - 1);
  }
  async toolFinished(id: string, r: { status: ToolCallRecord["status"]; output_summary: string; duration_ms: number }) {
    Object.assign(this.calls[Number(id)], r);
  }
  async setResearchStatus(s: string) {
    this.statuses.push(s);
  }
}

export class MemoryCrm implements CrmWriter {
  saved: AgentState | null = null;
  async save(lead: LeadContext, state: AgentState) {
    this.saved = state;
    return state.score?.qualified ? (state.outreach?.drafts.length ? "outreach_drafted" : "qualified") : "needs_review";
  }
}

let cached: { state: AgentState; calls: MemoryRecorder["calls"]; company: string } | null = null;

/**
 * Runs the real pipeline (mock providers, default ICP) for the Example Logistics fixture
 * entirely in memory. Used by the public landing page so it shows genuine engine output.
 */
export async function getLandingPreview() {
  if (cached) return cached;
  const fx = findDemoCompany("Example Logistics") ?? DEMO_COMPANIES[0];
  const rec = new MemoryRecorder();
  const crm = new MemoryCrm();
  const state = await runAgent(
    {
      lead_id: "00000000-0000-4000-8000-000000000000",
      company_name: fx.company_name,
      website: fx.website,
      contact: { name: fx.contact.name, email: fx.contact.email, title: fx.contact.title },
      input_industry: null,
      input_country: null,
      stage: "new",
    },
    {
      ai: new MockAIProvider(),
      research: new MockResearchProvider(),
      icp: DEFAULT_ICP,
      recorder: rec,
      crm,
      knownCompanyNames: DEMO_COMPANIES.filter((c) => c.key !== fx.key).map((c) => c.company_name),
    },
  );
  cached = { state, calls: rec.calls, company: fx.company_name };
  return cached;
}
