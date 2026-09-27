import { describe, expect, it } from "vitest";
import { TOOLS, TOOL_MAP, toolSpecs } from "@/lib/agent/tools";
import { TOOL_NAMES } from "@/lib/agent/types";

describe("agent tool registry", () => {
  it("has exactly the 11 documented tools, each wired to a distinct name", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    expect(TOOL_MAP.size).toBe(TOOLS.length);
  });

  it("declares a valid dependency graph with no forward or circular references", () => {
    const seen = new Set<string>();
    for (const t of TOOLS) {
      for (const r of t.requires) expect(seen.has(r), `${t.name} requires ${r} before it is defined`).toBe(true);
      seen.add(t.name);
    }
  });

  it("only update_crm has no downstream dependents (it is the terminal tool)", () => {
    const required = new Set(TOOLS.flatMap((t) => t.requires));
    const terminal = TOOLS.filter((t) => !required.has(t.name)).map((t) => t.name);
    expect(terminal).toEqual(["update_crm"]);
  });

  it("produces JSON-schema tool specs with a name, description and object parameters", () => {
    const specs = toolSpecs(TOOLS as never);
    expect(specs).toHaveLength(TOOLS.length);
    for (const s of specs) {
      expect(s.name).toBeTruthy();
      expect(s.description.length).toBeGreaterThan(10);
      expect((s.parameters as { type?: string }).type).toBe("object");
      expect(s.parameters).not.toHaveProperty("$schema");
    }
  });

  it("validates arguments with zod: research_company accepts valid input and rejects the wrong shape", () => {
    const t = TOOL_MAP.get("research_company")!;
    expect(t.args.safeParse({ company_name: "Acme", website: "https://acme.com" }).success).toBe(true);
    expect(t.args.safeParse({ company_name: "Acme", website: null }).success).toBe(true);
    expect(t.args.safeParse({ website: "https://acme.com" }).success).toBe(false); // company_name required
    expect(t.args.safeParse({ company_name: "" }).success).toBe(false); // min length 1
    expect(t.args.safeParse({ company_name: "a".repeat(300) }).success).toBe(false); // max length 200
  });

  it("no-arg tools (match_icp, calculate_lead_score, ...) reject unexpected extra fields", () => {
    for (const name of ["match_icp", "identify_pain_points", "find_automation_opportunities", "calculate_lead_score", "update_crm"] as const) {
      const t = TOOL_MAP.get(name)!;
      expect(t.args.safeParse({}).success).toBe(true);
      expect(t.args.safeParse({ unexpected: true }).success).toBe(false);
    }
  });

  it("generate_outreach's force flag is optional and boolean", () => {
    const t = TOOL_MAP.get("generate_outreach")!;
    expect(t.args.safeParse({}).success).toBe(true);
    expect(t.args.safeParse({ force: true }).success).toBe(true);
    expect(t.args.safeParse({ force: "yes" }).success).toBe(false);
  });

  it("analyze_website requires a nullable url string", () => {
    const t = TOOL_MAP.get("analyze_website")!;
    expect(t.args.safeParse({ url: "https://acme.com" }).success).toBe(true);
    expect(t.args.safeParse({ url: null }).success).toBe(true);
    expect(t.args.safeParse({}).success).toBe(false); // url key required (may be null, not absent)
  });

  it("every tool's status is one of the pipeline's research statuses", () => {
    const valid = new Set(["queued", "researching", "enriching", "qualifying", "scoring", "ready", "needs_review", "failed", "not_started"]);
    for (const t of TOOLS) expect(valid.has(t.status), t.name).toBe(true);
  });
});
