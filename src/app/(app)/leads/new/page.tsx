import { DEMO_COMPANIES } from "@/lib/fixtures/companies";
import { getConfig } from "@/lib/config";
import { PageHeader } from "@/components/page-header";
import { AnalyzeLead } from "./analyze-lead";

export const metadata = { title: "Analyze lead" };

export default async function NewLeadPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const cfg = getConfig();
  const demos = DEMO_COMPANIES.map((c) => ({
    key: c.key,
    company_name: c.company_name,
    website: c.website,
    contact_name: c.contact.name,
    contact_email: c.contact.email,
    title: c.contact.title,
    expected: c.expected_outcome,
    industry: c.facts.industry,
  }));
  return (
    <>
      <PageHeader
        title="Analyze a lead"
        description="Research the company, match it against the ICP, score it, and draft outreach for human approval. Progress is shown step by step."
      />
      <AnalyzeLead demos={demos} initialDemo={demo ?? "example-logistics"} researchProvider={cfg.RESEARCH_PROVIDER} aiProvider={cfg.AI_PROVIDER} />
    </>
  );
}
