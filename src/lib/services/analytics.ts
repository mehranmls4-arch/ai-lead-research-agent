import { sql } from "drizzle-orm";
import type { DB } from "../db/client";

export interface Analytics {
  leadsTotal: number;
  leadsAnalyzed: number;
  demoLeads: number;
  qualified: number;
  avgScore: number | null;
  icpMatchRate: number | null;
  researchSuccessRate: number | null;
  runsFinished: number;
  outreachDrafts: number;
  approvedOutreach: number;
  byIndustry: { industry: string; leads: number; avgScore: number | null }[];
  scoreDistribution: { bucket: string; leads: number }[];
  icpBreakdown: { match: string; leads: number }[];
  stageBreakdown: { stage: string; leads: number }[];
  researchBreakdown: { status: string; leads: number }[];
  outreachBreakdown: { status: string; leads: number }[];
  opportunities: { title: string; leads: number }[];
  signals: { category: string; signals: number }[];
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** All figures are computed from the database (latest completed run per lead). */
export async function getAnalytics(db: DB): Promise<Analytics> {
  const [totals] = await db.execute<Record<string, unknown>>(sql`
    select
      count(*)::int as leads_total,
      count(*) filter (where l.latest_run_id is not null)::int as analyzed,
      count(*) filter (where l.is_demo)::int as demo,
      count(*) filter (where ls.qualified)::int as qualified,
      round(avg(l.lead_score)::numeric, 1) as avg_score,
      count(*) filter (where l.icp_match in ('strong','medium'))::float / nullif(count(*) filter (where l.latest_run_id is not null), 0) as icp_rate
    from leads l
    left join lead_scores ls on ls.research_run_id = l.latest_run_id`);
  const [runs] = await db.execute<Record<string, unknown>>(sql`
    select count(*) filter (where status in ('ready','needs_review'))::int as ok,
           count(*) filter (where status in ('ready','needs_review','failed'))::int as finished
    from research_runs`);
  const [drafts] = await db.execute<Record<string, unknown>>(sql`
    select count(*) filter (where status <> 'superseded')::int as drafts,
           count(*) filter (where status in ('approved','sent'))::int as approved
    from outreach_drafts`);
  const byIndustry = await db.execute<Record<string, unknown>>(sql`
    select coalesce(c.industry, 'Unknown') as industry, count(*)::int as leads, round(avg(l.lead_score)::numeric, 1) as avg_score
    from leads l join companies c on c.id = l.company_id
    where l.latest_run_id is not null group by 1 order by 2 desc, 1`);
  const dist = await db.execute<Record<string, unknown>>(sql`
    select b.bucket, count(l.id)::int as leads from (values ('0–19',0,19),('20–39',20,39),('40–59',40,59),('60–79',60,79),('80–100',80,100)) as b(bucket, lo, hi)
    left join leads l on l.lead_score between b.lo and b.hi group by b.bucket, b.lo order by b.lo`);
  const icp = await db.execute<Record<string, unknown>>(sql`
    select icp_match as match, count(*)::int as leads from leads where icp_match is not null group by 1 order by 2 desc`);
  const stages = await db.execute<Record<string, unknown>>(sql`select stage, count(*)::int as leads from leads group by 1`);
  const research = await db.execute<Record<string, unknown>>(sql`select research_status as status, count(*)::int as leads from leads group by 1 order by 2 desc`);
  const outreach = await db.execute<Record<string, unknown>>(sql`select outreach_status as status, count(*)::int as leads from leads group by 1 order by 2 desc`);
  const opps = await db.execute<Record<string, unknown>>(sql`
    select o.title, count(distinct o.lead_id)::int as leads from automation_opportunities o
    join leads l on l.latest_run_id = o.research_run_id group by 1 order by 2 desc, 1`);
  const sigs = await db.execute<Record<string, unknown>>(sql`
    select b.category, count(*)::int as signals from buying_signals b
    join leads l on l.latest_run_id = b.research_run_id group by 1 order by 2 desc`);

  const finished = Number(runs.finished);
  return {
    leadsTotal: Number(totals.leads_total),
    leadsAnalyzed: Number(totals.analyzed),
    demoLeads: Number(totals.demo),
    qualified: Number(totals.qualified),
    avgScore: num(totals.avg_score),
    icpMatchRate: num(totals.icp_rate),
    researchSuccessRate: finished ? Number(runs.ok) / finished : null,
    runsFinished: finished,
    outreachDrafts: Number(drafts.drafts),
    approvedOutreach: Number(drafts.approved),
    byIndustry: byIndustry.map((r) => ({ industry: String(r.industry), leads: Number(r.leads), avgScore: num(r.avg_score) })),
    scoreDistribution: dist.map((r) => ({ bucket: String(r.bucket), leads: Number(r.leads) })),
    icpBreakdown: icp.map((r) => ({ match: String(r.match), leads: Number(r.leads) })),
    stageBreakdown: stages.map((r) => ({ stage: String(r.stage), leads: Number(r.leads) })),
    researchBreakdown: research.map((r) => ({ status: String(r.status), leads: Number(r.leads) })),
    outreachBreakdown: outreach.map((r) => ({ status: String(r.status), leads: Number(r.leads) })),
    opportunities: opps.map((r) => ({ title: String(r.title), leads: Number(r.leads) })),
    signals: sigs.map((r) => ({ category: String(r.category), signals: Number(r.signals) })),
  };
}
