import { describe, expect, it } from "vitest";
import { MIN_SIGNAL_CONFIDENCE, signalIntensity, validateBuyingSignals } from "@/lib/engine/buying-signals";
import { identifyPainPoints, validatePainPoints } from "@/lib/engine/pain-points";
import { findAutomationOpportunities } from "@/lib/engine/opportunities";
import type { BuyingSignalCandidate } from "@/lib/domain/signals";
import { NOW, runFixture } from "./helpers";

const base: BuyingSignalCandidate = {
  signal: "Hiring for operations roles",
  category: "hiring_operations",
  strength: "moderate",
  evidence: 'Careers page lists "Dispatch Coordinator".',
  source: "acme.com/careers",
  source_type: "website",
  source_url: "https://acme.com/careers",
  confidence: 0.7,
  detected_at: NOW.toISOString(),
  evidence_ids: ["web-1"],
};

describe("buying signal validation", () => {
  it("accepts a valid, evidenced signal and labels website evidence as verified", () => {
    const r = validateBuyingSignals([base]);
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0].label).toBe("verified");
  });
  it("rejects signals without evidence, source, valid category or date", () => {
    const r = validateBuyingSignals([
      { ...base, evidence: "" },
      { ...base, signal: "No source", source: "" },
      { ...base, signal: "Bad category", category: "vibes" },
      { ...base, signal: "Future", detected_at: "2999-01-01T00:00:00Z" },
    ]);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected).toHaveLength(4);
    for (const x of r.rejected) expect(x.reasons.length).toBeGreaterThan(0);
  });
  it("enforces the confidence floor and range", () => {
    const r = validateBuyingSignals([
      { ...base, confidence: MIN_SIGNAL_CONFIDENCE - 0.01 },
      { ...base, signal: "Too high", confidence: 1.5 },
    ]);
    expect(r.accepted).toHaveLength(0);
  });
  it("labels demo signals as demo and de-duplicates", () => {
    const r = validateBuyingSignals([{ ...base, source_type: "demo" }, { ...base, source_type: "demo" }]);
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0].label).toBe("demo");
  });
  it("intensity grows with signal strength", () => {
    const one = validateBuyingSignals([{ ...base, strength: "weak" }]).accepted;
    const two = validateBuyingSignals([{ ...base, strength: "strong" }]).accepted;
    expect(signalIntensity(two)).toBeGreaterThan(signalIntensity(one));
    expect(signalIntensity([])).toBe(0);
  });
});

describe("pain points and opportunities", () => {
  it("produces hedged, evidence-backed pain points for a fixture", async () => {
    const { state } = await runFixture("example-logistics");
    expect(state.painPoints!.length).toBeGreaterThan(0);
    const known = new Set(state.evidence.map((e) => e.id).concat("derived"));
    for (const p of state.painPoints!) {
      expect(p.label).toBe("potential");
      expect(p.title).toMatch(/^(potential|possible|indication|likely|may|could)\b/i);
      expect(p.evidence.length).toBeGreaterThan(0);
      for (const id of p.evidence_ids) expect(known.has(id)).toBe(true);
    }
  });
  it("returns no pain points when there is no evidence", () => {
    expect(identifyPainPoints({ company_name: "X", website: null, technology_signals: [], operational_signals: [] }, [], [])).toEqual([]);
  });
  it("rejects pain points citing unknown evidence and hedges unhedged titles", () => {
    const ev = [{ id: "e1", kind: "page", statement: "Quote form exists", excerpt: null, provenance: { source_type: "website" as const, source: "s", source_url: null, confidence: 0.9, retrieved_at: NOW.toISOString(), label: "verified" as const } }];
    const pp = { key: "k", title: "Slow quote handling", description: "d", evidence: ["Quote form exists"], evidence_ids: ["e1"], severity: "medium", confidence: 0.6, label: "potential" };
    const r = validatePainPoints([pp, { ...pp, title: "Made up", evidence_ids: ["nope"] }, { title: "broken" }], ev);
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0].title).toMatch(/^Potential: slow quote handling/);
    expect(r.rejected.map((x) => x.reason)).toEqual(expect.arrayContaining([expect.stringMatching(/unknown evidence/), "Schema validation failed"]));
  });
  it("maps pain points to automation opportunities without ROI claims", async () => {
    const { state } = await runFixture("example-logistics");
    const opps = findAutomationOpportunities(state.painPoints!);
    expect(opps.length).toBeGreaterThan(0);
    for (const o of opps) {
      expect(o.expected_workflow.length).toBeGreaterThanOrEqual(2);
      expect(o.evidence.length).toBeGreaterThan(0);
      expect(JSON.stringify(o)).not.toMatch(/ROI|\$\d|\d+%/);
    }
    expect(findAutomationOpportunities([])).toEqual([]);
  });
});
