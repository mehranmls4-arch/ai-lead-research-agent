import { describe, expect, it } from "vitest";
import { calculateLeadScore, contactRelevance } from "@/lib/engine/scoring";
import { matchIcp } from "@/lib/engine/icp";
import { DEFAULT_ICP, SCORE_FACTOR_KEYS } from "@/lib/domain/icp";
import { profile, runFixture } from "./helpers";

describe("lead scoring", () => {
  it("returns all nine weighted factors whose scores sum to the total", async () => {
    const { state } = await runFixture("example-logistics");
    const s = state.score!;
    expect(s.factors.map((f) => f.key)).toEqual([...SCORE_FACTOR_KEYS]);
    expect(s.factors.reduce((a, f) => a + f.score, 0)).toBe(s.total);
    for (const f of s.factors) {
      expect(f.weight).toBe(DEFAULT_ICP.score_weights[f.key]);
      expect(f.score).toBeGreaterThanOrEqual(0);
      expect(f.score).toBeLessThanOrEqual(f.weight);
      expect(f.ratio).toBeGreaterThanOrEqual(0);
      expect(f.ratio).toBeLessThanOrEqual(1);
      expect(f.explanation.length).toBeGreaterThan(5);
    }
  });

  it("orders the demo fixtures as designed", async () => {
    const strongSignals = (await runFixture("example-logistics")).state.score!;
    const strong = (await runFixture("meridian-health-admin")).state.score!;
    const medium = (await runFixture("brightcart")).state.score!;
    const poor = (await runFixture("ironvale")).state.score!;
    expect(strongSignals.grade).toBe("A");
    expect(strongSignals.total).toBeGreaterThanOrEqual(strong.total - 10);
    expect(strong.total).toBeGreaterThan(medium.total);
    expect(medium.total).toBeGreaterThan(poor.total);
    expect(strong.qualified).toBe(true);
    expect(poor.qualified).toBe(false);
    expect(poor.grade).toBe("D");
  });

  it("strong vs weak buying signals changes the buying-signal factor", async () => {
    const strong = (await runFixture("example-logistics")).state.score!.factors.find((f) => f.key === "buying_signals")!;
    const weak = (await runFixture("harbor-realty")).state.score!.factors.find((f) => f.key === "buying_signals")!;
    expect(strong.ratio).toBeGreaterThan(weak.ratio);
    expect(weak.evidence.length).toBeGreaterThan(0);
  });

  it("applies grade boundaries and the qualification threshold", async () => {
    const base = await runFixture("meridian-health-admin");
    const s = base.state.score!;
    const grade = (t: number) => (t >= 80 ? "A" : t >= 65 ? "B" : t >= 45 ? "C" : "D");
    expect(s.grade).toBe(grade(s.total));
    const strict = { ...DEFAULT_ICP, qualification_threshold: 100 };
    const again = calculateLeadScore({
      profile: base.state.profile!,
      icpResult: base.state.icpResult!,
      signals: base.state.signals!.accepted,
      painPoints: base.state.painPoints!,
      opportunities: base.state.opportunities!,
      contactTitle: "Director of Client Services",
      icp: strict,
    });
    expect(again.total).toBe(s.total);
    expect(again.qualified).toBe(false);
  });

  it("re-weights the total when weights change", async () => {
    const { state } = await runFixture("ironvale");
    const input = { profile: state.profile!, icpResult: state.icpResult!, signals: state.signals!.accepted, painPoints: state.painPoints!, opportunities: state.opportunities!, contactTitle: "Plant Engineer" };
    const def = calculateLeadScore({ ...input, icp: DEFAULT_ICP });
    const contactHeavy = calculateLeadScore({
      ...input,
      icp: { ...DEFAULT_ICP, score_weights: { industry_fit: 0, company_size_fit: 0, geography_fit: 0, business_complexity: 0, automation_need: 0, technology_readiness: 0, buying_signals: 0, pain_severity: 0, contact_relevance: 100 } },
    });
    expect(contactHeavy.factors.find((f) => f.key === "contact_relevance")!.weight).toBe(100);
    expect(contactHeavy.total).not.toBe(def.total);
  });

  it("flags needs_review and does not qualify when evidence is missing", () => {
    const p = profile();
    const s = calculateLeadScore({ profile: p, icpResult: matchIcp(p, DEFAULT_ICP), signals: [], painPoints: [], opportunities: [], contactTitle: null, icp: DEFAULT_ICP });
    expect(s.needs_review).toBe(true);
    expect(s.review_reasons.length).toBeGreaterThan(0);
    expect(s.qualified).toBe(false);
    expect(s.total).toBeGreaterThanOrEqual(0);
    expect(s.total).toBeLessThanOrEqual(100);
  });

  it("rates contact relevance by seniority and function", () => {
    expect(contactRelevance("CEO").ratio).toBe(1);
    expect(contactRelevance("VP of Operations").ratio).toBe(0.85);
    expect(contactRelevance("Customer Support Manager").ratio).toBe(0.65);
    expect(contactRelevance(null).ratio).toBe(0);
    expect(contactRelevance("Intern").ratio).toBeLessThan(0.45);
  });
});
