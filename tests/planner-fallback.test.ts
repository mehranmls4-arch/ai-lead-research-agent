import { describe, expect, it } from "vitest";
import type { AIProvider, StructuredRequest, ToolChoice, ToolChoiceRequest } from "@/lib/providers/ai/types";
import { MockAIProvider } from "@/lib/providers/ai/mock";
import { runFixture } from "./helpers";

/** Wraps the mock AI provider but overrides chooseNextTool to misbehave in a controlled way. */
class FlakyPlanner implements AIProvider {
  readonly name = "flaky";
  readonly isMock = true;
  private readonly base = new MockAIProvider();
  calls = 0;
  constructor(private readonly mode: "throw" | "unknown_tool" | "no_tool" | "bad_args" | "null") {}
  generateStructured<T>(req: StructuredRequest<T>) {
    return this.base.generateStructured(req);
  }
  async chooseNextTool(req: ToolChoiceRequest): Promise<ToolChoice | null> {
    this.calls++;
    switch (this.mode) {
      case "throw":
        throw new Error("planner backend unreachable");
      case "unknown_tool":
        return { name: "delete_everything", arguments: {} };
      case "no_tool":
        return req.tools.length ? null : null;
      case "bad_args":
        return { name: req.tools[0]?.name ?? "research_company", arguments: { company_name: 12345, extra: () => {} } };
      case "null":
        return null;
    }
  }
}

describe("planner fallback (chooseNextTool misbehaving)", () => {
  it("falls back to canonical tool order when the planner throws, and completes the run", async () => {
    const planner = new FlakyPlanner("throw");
    const { state, recorder } = await runFixture("example-logistics", { ai: planner });
    expect(state.finalStage).toBe("outreach_drafted");
    expect(recorder.calls.every((c) => c.selected_by === "fallback")).toBe(true);
    expect(planner.calls).toBeGreaterThan(0);
  });

  it("falls back when the planner names a tool that is not currently available, and records a note", async () => {
    const { state } = await runFixture("example-logistics", { ai: new FlakyPlanner("unknown_tool") });
    expect(state.finalStage).toBe("outreach_drafted");
    expect(state.notes.some((n) => n.includes('unavailable tool "delete_everything"'))).toBe(true);
  });

  it("falls back when the planner returns no tool choice at all", async () => {
    const { state, recorder } = await runFixture("example-logistics", { ai: new FlakyPlanner("no_tool") });
    expect(state.finalStage).toBe("outreach_drafted");
    expect(recorder.calls[0].selected_by).toBe("fallback");
  });

  it("discards invalid arguments from the planner and runs the tool with safe defaults instead of crashing", async () => {
    const { state, recorder } = await runFixture("example-logistics", { ai: new FlakyPlanner("bad_args") });
    expect(state.finalStage).toBe("outreach_drafted");
    expect(state.notes.some((n) => n.includes("Invalid arguments for research_company"))).toBe(true);
    expect(recorder.calls[0].selected_by).toBe("planner"); // the tool itself was available; only its arguments were rejected
  });

  it("never crashes the whole run: every fixture still reaches update_crm with a flaky planner", async () => {
    for (const key of ["example-logistics", "ironvale", "brightcart"]) {
      const { state } = await runFixture(key, { ai: new FlakyPlanner("throw") });
      expect(state.finalStage, key).toBeTruthy();
    }
  });
});
