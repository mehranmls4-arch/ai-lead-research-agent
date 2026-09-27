import { describe, expect, it } from "vitest";
import { validateOutreach, type OutreachValidationContext } from "@/lib/engine/outreach-validator";
import { runFixture } from "./helpers";

const ctx: OutreachValidationContext = {
  company_name: "Acme Freight",
  contact_name: "Dana Whitfield",
  allowed_facts: ["Acme Freight", 'The site has a "Request a Freight Quote" form.', "Office in Atlanta, GA"],
  personalization_phrases: ["Request a Freight Quote", "Atlanta"],
  detected_technologies: ["HubSpot"],
  other_company_names: ["Harbor Realty Group"],
};
const good = {
  channel: "email" as const,
  subject: "Question about the Request a Freight Quote form at Acme Freight",
  body:
    "Hi Dana,\n\nI noticed the \"Request a Freight Quote\" form on the Acme Freight website. When quote requests arrive by form, email and phone, some teams find the follow-up hard to keep consistent.\n\nAt NovaFlow AI we build lead qualification agents that respond to new quote requests and route them to the right person.\n\nWould it be useful to compare notes on how quotes are handled today?\n\nAlex Morgan\nNovaFlow AI",
};
const failed = (v: ReturnType<typeof validateOutreach>) => v.checks.filter((c) => !c.passed).map((c) => c.id);

describe("outreach validation", () => {
  it("passes a personalised, evidence-based draft", () => {
    const v = validateOutreach(good, ctx);
    expect(failed(v)).toEqual([]);
    expect(v.result).toBe("PASS");
  });
  it("flags a missing company name", () => {
    const v = validateOutreach({ ...good, subject: "Quick question", body: good.body.replaceAll("Acme Freight", "your company") }, ctx);
    expect(v.result).toBe("NEEDS_REVIEW");
    expect(failed(v)).toContain("company_name");
  });
  it("flags missing personalisation (subject and body both generic)", () => {
    const v = validateOutreach({ ...good, subject: "Automation for Acme Freight", body: "Hi Dana,\n\nAcme Freight could benefit from automation. Would you like to chat?\n\nAlex" }, ctx);
    expect(v.result).toBe("NEEDS_REVIEW");
    expect(failed(v)).toContain("personalization");
  });
  it("counts an evidence reference in the subject line as personalisation", () => {
    const v = validateOutreach({ ...good, body: "Hi Dana,\n\nAcme Freight could benefit from automation. Would you like to chat?\n\nAlex" }, ctx);
    expect(failed(v)).not.toContain("personalization");
  });
  it("flags invented metrics and unsupported claims", () => {
    const v = validateOutreach({ ...good, body: good.body + "\n\nWe guarantee a 73% reduction in response time." }, ctx);
    expect(v.result).toBe("NEEDS_REVIEW");
    expect(failed(v)).toContain("no_invented_metrics");
  });
  it("flags a technology the research never detected", () => {
    const v = validateOutreach({ ...good, body: good.body.replace("route them", "sync them into your Salesforce instance and route them") }, ctx);
    expect(failed(v)).toContain("no_hallucinated_tech");
    const ok = validateOutreach({ ...good, body: good.body.replace("route them", "sync them into HubSpot and route them") }, ctx);
    expect(failed(ok)).not.toContain("no_hallucinated_tech");
  });
  it("flags fake familiarity, generic openings and other company names", () => {
    const v = validateOutreach({ ...good, body: "Hi Dana,\n\nI hope this email finds you well. As we discussed last week, Harbor Realty Group loved it.\n\n" + good.body }, ctx);
    const f = failed(v);
    expect(f).toEqual(expect.arrayContaining(["generic_opening", "no_fake_familiarity", "no_other_company"]));
  });
  it("enforces the LinkedIn length limit", () => {
    const v = validateOutreach({ channel: "linkedin", subject: null, body: "Hi Dana, the Request a Freight Quote form at Acme Freight caught my eye. " + "x".repeat(300) }, ctx);
    expect(failed(v)).toContain("length");
  });
  it("mock-generated drafts for every fixture pass their own validation", async () => {
    for (const key of ["example-logistics", "meridian-health-admin", "harbor-realty", "ledgerline"]) {
      const { state } = await runFixture(key);
      expect(state.outreach!.drafts).toHaveLength(4);
      for (const d of state.outreach!.drafts) expect(d.validation?.result, `${key} ${d.channel}`).toBe("PASS");
    }
  });
  it("does not draft outreach for unqualified leads unless forced, and never without evidence", async () => {
    const poor = await runFixture("ironvale");
    expect(poor.state.outreach!.drafts).toHaveLength(0);
    expect(poor.state.outreach!.skipped_reason).toMatch(/threshold|review|evidence/);
    const forced = await runFixture("brightcart", { force: true });
    expect(forced.state.outreach!.drafts).toHaveLength(0);
    expect(forced.state.outreach!.skipped_reason).toMatch(/evidence-backed/);
  });
});
