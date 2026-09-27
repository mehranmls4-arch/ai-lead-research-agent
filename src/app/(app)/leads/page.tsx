import Link from "next/link";
import { Plus, FileUp } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { CRM_STAGES, RESEARCH_STATUSES, RESEARCH_STATUS_LABELS, STAGE_LABELS } from "@/lib/domain/lead";
import { listIndustries, listLeads, type LeadFilters } from "@/lib/services/queries";
import { PageHeader } from "@/components/page-header";
import { Panel, Empty } from "@/components/ui/panel";
import { buttonVariants } from "@/components/ui/button";
import { Select, Input, Label } from "@/components/ui/form";
import { DemoBadge, IcpBadge, OutreachStatusBadge, ResearchStatusBadge, ScoreBar, StageBadge } from "@/components/status";
import { AutoRefresh } from "@/components/auto-refresh";
import { kickQueue } from "@/lib/services/queue";

export const metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

function parseFilters(sp: SP): LeadFilters {
  const n = (v?: string) => (v && /^\d{1,3}$/.test(v) ? Number(v) : undefined);
  const band = sp.score;
  const [minScore, maxScore] = band === "a" ? [80, 100] : band === "b" ? [65, 79] : band === "c" ? [45, 64] : band === "d" ? [0, 44] : [n(sp.min), n(sp.max)];
  return {
    q: sp.q?.slice(0, 100) || undefined,
    stage: sp.stage || undefined,
    industry: sp.industry || undefined,
    icp: sp.icp || undefined,
    research: sp.research || undefined,
    outreach: sp.outreach || undefined,
    minScore,
    maxScore,
    sort: sp.sort === "company" || sp.sort === "updated" ? sp.sort : "score",
  };
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const db = getDb();
  const [rows, industries] = await Promise.all([listLeads(db, f), listIndustries(db)]);
  const processing = rows.some((r) => ["queued", "researching", "enriching", "qualifying", "scoring"].includes(r.researchStatus));
  if (rows.some((r) => r.researchStatus === "queued")) kickQueue(db);
  const filtered = Object.entries(sp).some(([k, v]) => v && k !== "sort");

  return (
    <>
      <PageHeader
        title="Leads"
        description="Every lead with its deterministic ICP fit, weighted lead score and pipeline status. Sorted by lead score."
        actions={
          <>
            <Link href="/import" className={buttonVariants({ variant: "secondary" })}>
              <FileUp aria-hidden />
              Import CSV
            </Link>
            <Link href="/leads/new" className={buttonVariants()}>
              <Plus aria-hidden />
              Analyze lead
            </Link>
          </>
        }
      />
      {processing ? <AutoRefresh intervalMs={2500} /> : null}
      <Panel className="mb-4">
        <form className="grid grid-cols-2 gap-3 px-4 py-3 md:grid-cols-4 xl:grid-cols-8" method="get">
          <div className="col-span-2">
            <Label htmlFor="q">Search</Label>
            <Input id="q" name="q" placeholder="Company or contact" defaultValue={sp.q ?? ""} />
          </div>
          <div>
            <Label htmlFor="stage">Stage</Label>
            <Select id="stage" name="stage" defaultValue={sp.stage ?? ""}>
              <option value="">All</option>
              {CRM_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="score">Lead score</Label>
            <Select id="score" name="score" defaultValue={sp.score ?? ""}>
              <option value="">All</option>
              <option value="a">A (80–100)</option>
              <option value="b">B (65–79)</option>
              <option value="c">C (45–64)</option>
              <option value="d">D (0–44)</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="industry">Industry</Label>
            <Select id="industry" name="industry" defaultValue={sp.industry ?? ""}>
              <option value="">All</option>
              {industries.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
              <option value="unknown">Unknown</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="icp">ICP match</Label>
            <Select id="icp" name="icp" defaultValue={sp.icp ?? ""}>
              <option value="">All</option>
              <option value="strong">Strong</option>
              <option value="medium">Medium</option>
              <option value="weak">Weak</option>
              <option value="poor">Poor</option>
              <option value="insufficient_data">Insufficient data</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="research">Research</Label>
            <Select id="research" name="research" defaultValue={sp.research ?? ""}>
              <option value="">All</option>
              {RESEARCH_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RESEARCH_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="outreach">Outreach</Label>
            <Select id="outreach" name="outreach" defaultValue={sp.outreach ?? ""}>
              <option value="">All</option>
              <option value="none">None</option>
              <option value="drafted">Awaiting approval</option>
              <option value="needs_review">Needs review</option>
              <option value="approved">Approved</option>
              <option value="sent">Sent</option>
              <option value="rejected">Rejected</option>
              <option value="skipped">Skipped</option>
            </Select>
          </div>
          <div className="col-span-2 flex items-end gap-2 md:col-span-4 xl:col-span-8">
            <button type="submit" className={buttonVariants({ size: "sm" })}>
              Apply filters
            </button>
            {filtered ? (
              <Link href="/leads" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Clear
              </Link>
            ) : null}
            <span className="ml-auto text-[13px] text-muted">
              {rows.length} lead{rows.length === 1 ? "" : "s"}
            </span>
          </div>
        </form>
      </Panel>

      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty title={filtered ? "No leads match these filters" : "No leads yet"}>
            {filtered ? "Clear a filter to widen the list." : (
              <>
                <Link href="/leads/new" className="text-accent underline">
                  Analyze a lead
                </Link>{" "}
                or import a CSV to get started.
              </>
            )}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[980px]">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Industry</th>
                  <th>ICP fit</th>
                  <th>Lead score</th>
                  <th>Stage</th>
                  <th>Research</th>
                  <th>Outreach</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/leads/${r.id}`} className="font-medium text-ink hover:text-accent hover:underline">
                        {r.company}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                        {r.domain ?? "no website"}
                        {r.isDemo ? <DemoBadge /> : null}
                      </div>
                    </td>
                    <td>
                      {r.contact ?? <span className="text-muted">—</span>}
                      {r.contactTitle ? <div className="text-xs text-muted">{r.contactTitle}</div> : null}
                    </td>
                    <td className="capitalize">{r.industry ?? <span className="normal-case text-muted">Unknown</span>}</td>
                    <td>
                      <div className="flex flex-col items-start gap-1">
                        <ScoreBar value={r.fitScore} tone="accent" />
                        <IcpBadge match={r.icpMatch} />
                      </div>
                    </td>
                    <td>
                      <ScoreBar value={r.leadScore} />
                    </td>
                    <td>
                      <StageBadge stage={r.stage} />
                    </td>
                    <td>
                      <ResearchStatusBadge status={r.researchStatus} />
                    </td>
                    <td>
                      <OutreachStatusBadge status={r.outreachStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
