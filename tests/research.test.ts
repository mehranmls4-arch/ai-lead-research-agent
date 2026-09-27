import { describe, expect, it } from "vitest";
import { classifyIndustryFromText, normalizeCountry, normalizeIndustry } from "@/lib/engine/normalize";
import { confidenceBand, enforceDemoLabel, EvidenceSchema } from "@/lib/domain/provenance";
import { MockResearchProvider } from "@/lib/providers/research/mock";
import { analyzeHtml } from "@/lib/providers/research/html-analyzer";
import { detectOperationalSignals, evidenceFromWebsite, techSignalsFromWebsite } from "@/lib/engine/operational-signals";
import { NOW, prov } from "./helpers";

describe("normalisation", () => {
  it("normalises industries and countries", () => {
    expect(normalizeIndustry("Logistics")).toBe("logistics");
    expect(normalizeIndustry("  real estate ")).toBe("real estate");
    expect(normalizeIndustry("")).toBeNull();
    expect(normalizeCountry("USA")).toBe("united states");
    expect(normalizeCountry("United States of America")).toBe("united states");
    expect(normalizeCountry(null)).toBeNull();
  });
  it("classifies industry from text only with enough keyword evidence", () => {
    expect(classifyIndustryFromText("freight shipping, trucking and warehouse distribution for carriers")?.industry).toBe("logistics");
    expect(classifyIndustryFromText("hello world")).toBeNull();
  });
});

describe("provenance and confidence", () => {
  it("forces demo data to carry the demo label", () => {
    expect(enforceDemoLabel({ ...prov("verified"), source_type: "demo" }).label).toBe("demo");
    expect(enforceDemoLabel(prov("verified")).label).toBe("verified");
  });
  it("bands confidence", () => {
    expect(confidenceBand(0.9)).toBe("high");
    expect(confidenceBand(0.6)).toBe("medium");
    expect(confidenceBand(0.2)).toBe("low");
  });
});

describe("MockResearchProvider", () => {
  const provider = new MockResearchProvider(() => NOW);
  it("returns demo-labelled facts with provenance for a known fixture", async () => {
    const r = await provider.researchCompany({ company_name: "Example Logistics", website: "https://examplelogistics.example" });
    expect(r.is_demo).toBe(true);
    expect(r.evidence.length).toBeGreaterThan(3);
    for (const e of r.evidence) {
      expect(EvidenceSchema.safeParse(e).success).toBe(true);
      expect(e.provenance.source_type).toBe("demo");
      expect(e.provenance.label).toBe("demo");
      expect(e.provenance.retrieved_at).toBe(NOW.toISOString());
    }
    for (const f of Object.values(r.fields)) expect(f!.provenance.label).toBe("demo");
  });
  it("never invents research for unknown companies", async () => {
    const r = await provider.researchCompany({ company_name: "Totally Unknown Corp", website: "https://unknown-corp.com" });
    expect(r.fields).toEqual({});
    expect(r.evidence).toEqual([]);
    expect(r.buying_signal_candidates).toEqual([]);
    expect(r.notes[0]).toMatch(/does not invent/);
    const w = await provider.analyzeWebsite("https://unknown-corp.com");
    expect(w.analysis).toBeNull();
  });
});

describe("HTML analysis (live-fetch path, fed with static HTML)", () => {
  const html = `<!doctype html><html><head><title>Acme Freight | Trucking</title><meta name="description" content="Regional freight and trucking for shippers."></head>
  <body><h1>Freight shipping you can track</h1><a href="/quote">Request a Freight Quote</a>
  <form action="/quote"><input name="name"><input name="email"><input name="pickup"><textarea name="details"></textarea><button>Get quote</button></form>
  <a href="https://wa.me/15551234567">WhatsApp us</a><script src="https://js.hs-scripts.com/123.js"></script>
  <a href="/careers">Careers</a><p>We're hiring a Dispatch Coordinator.</p><p>Call (555) 123-4567 or email ops@acmefreight.com</p></body></html>`;
  const a = analyzeHtml([{ url: "https://acmefreight.com/", status: 200, html }], "https://acmefreight.com/", NOW.toISOString());
  it("extracts title, meta, CTAs, forms, contact and technologies", () => {
    expect(a.source_type).toBe("website");
    expect(a.title).toContain("Acme Freight");
    expect(a.meta_description).toContain("freight");
    expect(a.ctas.some((c) => /quote/i.test(c))).toBe(true);
    expect(a.forms.some((f) => f.purpose === "quote")).toBe(true);
    expect(a.whatsapp_links.length).toBe(1);
    expect(a.contact.emails).toContain("ops@acmefreight.com");
    expect(a.technologies.map((t) => t.name)).toContain("HubSpot");
  });
  it("turns observations into verified evidence and operational signals", () => {
    const ev = evidenceFromWebsite(a);
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.every((e) => e.provenance.source_type === "website" && e.provenance.label === "verified")).toBe(true);
    const ops = detectOperationalSignals(a, ev).map((o) => o.key);
    expect(ops).toContain("quote_request_form");
    expect(ops).toContain("whatsapp_contact");
    expect(techSignalsFromWebsite(a, ev).map((t) => t.category)).toContain("crm");
  });
});
