import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { getAnalytics } from "@/lib/services/analytics";
import { STAGE_LABELS, RESEARCH_STATUS_LABELS, CRM_STAGES, type CrmStage, type ResearchStatus } from "@/lib/domain/lead";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelHeader, Empty } from "@/components/ui/panel";
import { pct } from "@/lib/utils";
import { BarsChart, DonutChart } from "./charts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics" };

const ICP_LABELS: Record<string, string> = { strong: "Strong", medium: "Medium", weak: "Weak", poor: "Poor", insufficient_data: "Insufficient data" };
const OUTREACH_LABELS: Record<string, string> = { none: "None", skipped: "Skipped", drafted: "Awaiting approval", needs_review: "Needs review", approved: "Approved", rejected: "Rejected", sent: "Sent" };

export default async function AnalyticsPage() {
  const a = await getAnalytics(getDb());
  if (a.leadsTotal === 0) {
    return (
      <>
        <PageHeader title="Analytics" />
        <Panel>
          <Empty title="No data yet">
            Analytics are computed from the database.{" "}
            <Link href="/leads/new" className="text-accent underline">
              Analyze a lead
            </Link>{" "}
            to see figures here.
          </Empty>
        </Panel>
      </>
    );
  }
  const stageOrder = new Map(CRM_STAGES.map((s, i) => [s, i]));
  const stages = [...a.stageBreakdown].sort((x, y) => (stageOrder.get(x.stage as CrmStage) ?? 0) - (stageOrder.get(y.stage as CrmStage) ?? 0)).map((s) => ({ name: STAGE_LABELS[s.stage as CrmStage] ?? s.stage, value: s.leads }));

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`Computed live from PostgreSQL across ${a.leadsTotal} lead(s)${a.demoLeads ? `, of which ${a.demoLeads} use demo data` : ""}. Scores use each lead's latest completed run.`}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Total leads" value={a.leadsTotal} />
        <Kpi label="Leads analyzed" value={a.leadsAnalyzed} />
        <Kpi label="Qualified" value={a.qualified} />
        <Kpi label="Average lead score" value={a.avgScore ?? "—"} />
        <Kpi label="ICP match rate" value={pct(a.icpMatchRate)} hint="Strong or medium fit, of analyzed" />
        <Kpi label="Research success" value={pct(a.researchSuccessRate)} hint={`${a.runsFinished} finished run(s)`} />
        <Kpi label="Outreach drafts" value={a.outreachDrafts} hint="Excludes superseded" />
        <Kpi label="Approved outreach" value={a.approvedOutreach} hint="Approved or sent" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartPanel title="Lead score distribution" empty={!a.leadsAnalyzed}>
          <BarsChart data={a.scoreDistribution.map((d) => ({ name: d.bucket, value: d.leads }))} label="Leads" />
        </ChartPanel>
        <ChartPanel title="ICP match" empty={!a.icpBreakdown.length}>
          <DonutChart data={a.icpBreakdown.map((d) => ({ name: ICP_LABELS[d.match] ?? d.match, value: d.leads }))} />
        </ChartPanel>
        <ChartPanel title="Leads by stage" empty={!stages.length}>
          <BarsChart data={stages} label="Leads" horizontal />
        </ChartPanel>
        <ChartPanel title="Leads by industry" empty={!a.byIndustry.length}>
          <BarsChart data={a.byIndustry.map((d) => ({ name: d.industry, value: d.leads }))} label="Leads" horizontal />
        </ChartPanel>
        <ChartPanel title="Research status" empty={!a.researchBreakdown.length}>
          <DonutChart data={a.researchBreakdown.map((d) => ({ name: RESEARCH_STATUS_LABELS[d.status as ResearchStatus] ?? d.status, value: d.leads }))} />
        </ChartPanel>
        <ChartPanel title="Outreach status" empty={!a.outreachBreakdown.length}>
          <DonutChart data={a.outreachBreakdown.map((d) => ({ name: OUTREACH_LABELS[d.status] ?? d.status, value: d.leads }))} />
        </ChartPanel>
        <ChartPanel title="Automation opportunities" description="Leads per opportunity type (latest runs)" empty={!a.opportunities.length} wide>
          <BarsChart data={a.opportunities.map((d) => ({ name: d.title, value: d.leads }))} label="Leads" horizontal />
        </ChartPanel>
      </div>
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular mt-0.5 text-xl font-semibold">{value}</p>
      {hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

function ChartPanel({ title, description, empty, wide, children }: { title: string; description?: string; empty: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <Panel className={wide ? "lg:col-span-2" : undefined}>
      <PanelHeader title={title} description={description} />
      {empty ? <Empty title="No data for this chart yet" /> : <div className="px-2 py-3">{children}</div>}
    </Panel>
  );
}
