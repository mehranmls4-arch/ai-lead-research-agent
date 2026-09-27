import { describe, expect, it } from "vitest";
import { evaluateGeography, evaluateIndustry, evaluateSize, matchIcp } from "@/lib/engine/icp";
import { DEFAULT_ICP, IcpConfigSchema } from "@/lib/domain/icp";
import { field, profile, runFixture } from "./helpers";

describe("ICP engine — demo fixtures end to end", () => {
  it("rates Meridian Health Admin Partners a strong fit", async () => {
    const { state } = await runFixture("meridian-health-admin");
    expect(state.icpResult!.match).toBe("strong");
    expect(state.icpResult!.fit_score).toBeGreaterThanOrEqual(75);
  });
  it("rates Brightcart Home Goods (Canada, 201-500) a medium fit", async () => {
    const { state } = await runFixture("brightcart");
    expect(state.icpResult!.match).toBe("medium");
    const geo = state.icpResult!.factors.find((f) => f.key === "geography")!;
    expect(geo.status).toBe("miss");
  });
  it("rates Ironvale Steelworks (manufacturing, Germany, 1001-5000) a poor fit", async () => {
    const { state } = await runFixture("ironvale");
    expect(state.icpResult!.match).toBe("poor");
    expect(state.icpResult!.fit_score).toBeLessThan(30);
  });
  it("explains every factor and the factor scores add up to the fit score", async () => {
    const { state } = await runFixture("example-logistics");
    const r = state.icpResult!;
    expect(r.factors).toHaveLength(5);
    for (const f of r.factors) {
      expect(f.reason.length).toBeGreaterThan(10);
      expect(f.score).toBeLessThanOrEqual(f.weight);
    }
    expect(r.factors.reduce((a, f) => a + f.score, 0)).toBe(r.fit_score);
  });
});

describe("ICP engine — individual criteria", () => {
  it("scores company size: inside, partial overlap, outside, unknown", () => {
    expect(evaluateSize(profile({ size_range: field({ label: "51-200", min: 51, max: 200 }) }), DEFAULT_ICP).status).toBe("match");
    expect(evaluateSize(profile({ size_range: field({ label: "201-1000", min: 201, max: 1000 }) }), DEFAULT_ICP).status).toBe("partial");
    const out = evaluateSize(profile({ size_range: field({ label: "1001-5000", min: 1001, max: 5000 }) }), DEFAULT_ICP);
    expect(out.status).toBe("miss");
    expect(out.ratio).toBe(0);
    expect(evaluateSize(profile(), DEFAULT_ICP).status).toBe("unknown");
  });
  it("scores industry via the normalised catalog", () => {
    expect(evaluateIndustry(profile({ industry: field("logistics") }), DEFAULT_ICP).status).toBe("match");
    expect(evaluateIndustry(profile({ industry: field("manufacturing") }), DEFAULT_ICP).status).toBe("miss");
    expect(evaluateIndustry(profile(), DEFAULT_ICP).status).toBe("unknown");
  });
  it("scores geography with country normalisation", () => {
    expect(evaluateGeography(profile({ country: field("USA") }), DEFAULT_ICP).status).toBe("match");
    expect(evaluateGeography(profile({ country: field("Germany") }), DEFAULT_ICP).status).toBe("miss");
  });
  it("reports insufficient data instead of guessing when core facts are missing", () => {
    const r = matchIcp(profile(), DEFAULT_ICP);
    expect(r.match).toBe("insufficient_data");
    expect(r.unknown_factors.length).toBeGreaterThanOrEqual(2);
  });
  it("responds to a changed ICP configuration", () => {
    const p = profile({ industry: field("manufacturing"), country: field("Germany"), size_range: field({ label: "1001-5000", min: 1001, max: 5000 }) });
    const custom = { ...DEFAULT_ICP, industries: ["manufacturing"], geographies: ["Germany"], size_max: 5000 };
    expect(matchIcp(p, custom).fit_score).toBeGreaterThan(matchIcp(p, DEFAULT_ICP).fit_score);
  });
  it("rejects ICP configurations whose weights do not sum to 100", () => {
    const bad = { ...DEFAULT_ICP, criteria_weights: { ...DEFAULT_ICP.criteria_weights, industry: 50 } };
    expect(IcpConfigSchema.safeParse(bad).success).toBe(false);
    expect(IcpConfigSchema.safeParse({ ...DEFAULT_ICP, size_min: 600 }).success).toBe(false);
    expect(IcpConfigSchema.safeParse(DEFAULT_ICP).success).toBe(true);
  });
});
