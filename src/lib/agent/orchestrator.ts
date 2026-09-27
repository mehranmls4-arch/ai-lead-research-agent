import { TOOL_NAMES, type AgentDeps, type AgentState, type LeadContext, type ToolName } from "./types";
import { TOOLS, TOOL_MAP, toolSpecs, type RunContext } from "./tools";

const GOAL =
  "Research the company, build an evidence-backed profile, evaluate ICP fit, detect buying signals, form pain-point hypotheses, map automation opportunities, score the lead, draft and validate outreach, then update the CRM.";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function stateSummary(state: AgentState, done: Set<ToolName>): string {
  const lines = [`Completed tools: ${[...done].join(", ") || "none"}.`];
  if (state.profile) lines.push(`Profile has ${state.evidence.length} evidence items.`);
  if (state.icpResult) lines.push(`ICP fit ${state.icpResult.fit_score}.`);
  if (state.score) lines.push(`Lead score ${state.score.total}.`);
  return lines.join(" ");
}

/**
 * Tool-calling agent loop. The AI provider chooses the next tool from those whose
 * prerequisites are met; guardrails validate the choice and its arguments. Deterministic
 * tools (ICP, scoring, validation) never delegate their results to the model.
 */
export async function runAgent(lead: LeadContext, deps: AgentDeps): Promise<AgentState> {
  const now = deps.now ?? (() => new Date());
  const state: AgentState = { evidence: [], notes: [], isDemo: deps.research.isDemo };
  const ctx: RunContext = { lead, deps, state, now };
  const done = new Set<ToolName>();
  const maxSteps = deps.maxSteps ?? TOOL_NAMES.length + 2;
  let lastStatus: string | null = null;

  for (let step = 0; step < maxSteps && !done.has("update_crm"); step++) {
    const available = TOOLS.filter((t) => !done.has(t.name) && t.requires.every((r) => done.has(r)));
    if (!available.length) break;

    let selectedBy: "planner" | "fallback" = "planner";
    let choice = await deps.ai.chooseNextTool({ goal: GOAL, state: stateSummary(state, done), tools: toolSpecs(available) }).catch(() => null);
    if (!choice || !available.some((t) => t.name === choice!.name)) {
      selectedBy = "fallback";
      if (choice) state.notes.push(`Planner chose unavailable tool "${choice.name}"; used canonical order instead.`);
      choice = { name: available[0].name, arguments: {} };
    }
    const tool = TOOL_MAP.get(choice.name as ToolName)!;
    const parsedArgs = tool.args.safeParse({ ...(tool.defaultArgs(ctx) as object), ...choice.arguments });
    const args = parsedArgs.success ? parsedArgs.data : tool.defaultArgs(ctx);
    if (!parsedArgs.success) state.notes.push(`Invalid arguments for ${tool.name}; defaults used.`);

    if (tool.status !== lastStatus) {
      await deps.recorder.setResearchStatus(tool.status);
      lastStatus = tool.status;
    }
    const started = Date.now();
    const id = await deps.recorder.toolStarted(tool.name, tool.inputSummary(ctx, args), selectedBy);
    if (deps.latencyMs) await sleep(deps.latencyMs);
    try {
      const outcome = await tool.run(ctx, args);
      await deps.recorder.toolFinished(id, { status: outcome.status, output_summary: outcome.summary, duration_ms: Date.now() - started });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      await deps.recorder.toolFinished(id, { status: "failed", output_summary: msg.slice(0, 300), duration_ms: Date.now() - started });
      await deps.recorder.setResearchStatus("failed");
      state.finalStatus = "failed";
      throw e;
    }
    done.add(tool.name);
  }
  if (!done.has("update_crm")) {
    await deps.recorder.setResearchStatus("failed");
    state.finalStatus = "failed";
    throw new Error("Agent stopped before completing the pipeline");
  }
  await deps.recorder.setResearchStatus(state.finalStatus ?? "ready");
  return state;
}
