import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, ExternalLink } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/http";
import { getLeadDetail } from "@/lib/services/queries";
import { kickQueue } from "@/lib/services/queue";
import { allowedTransitions } from "@/lib/engine/crm";
import type { CrmStage } from "@/lib/domain/lead";
import { Panel, PanelBody, PanelHeader, Empty } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { AutoRefresh } from "@/components/auto-refresh";
import { ConfidenceMeter } from "@/components/provenance";
import { DemoBadge, IcpBadge, OutreachStatusBadge, ResearchStatusBadge, StageBadge } from "@/components/status";
import { EvidenceList, IcpFactors, OpportunitiesList, PainPointsList, ProfileFields, ScoreBreakdown, SignalsList, TechSignals, OperationalSignals } from "@/components/lead/sections";
import { OutreachPanel, type DraftView } from "@/components/lead/outreach-panel";
import { LeadActions } from "@/components/lead/lead-actions";
import { ToolActivity } from "@/components/agent/tool-activity";
import { fmtDate, pct } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ACTIVE = ["queued", "researching", "enriching", "qualifying", "scoring"];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Lead" };
  const d = await getLeadDetail(getDb(), id);
  return { title: d?.company.name ?? "Lead" };
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = getDb();
  const d = await getLeadDetail(db, id);
  if (!d) notFound();
  const running = ACTIVE.includes(d.lead.researchStatus);
  if (d.lead.researchStatus === "queued") kickQueue(db);
  const stage = d.lead.stage as CrmStage;
  const skippedReason = d.activities.find((a) => a.type === "outreach_skipped")?.message ?? null;
  const drafts: DraftView[] = d.drafts.map((x) => ({
    id: x.id,
    channel: x.channel,
    subject: x.subject,
    body: x.body,
    status: x.status,
    validationResult: x.validationResult,
    validation: x.validation,
    generatedBy: x.generatedBy,
    edited: x.edited,
    version: x.version,
    isDemo: x.isDemo,
    reviewedAt: x.reviewedAt?.toISOString() ?? null,
    sentAt: x.sentAt?.toISOString() ?? null,
  }));
  const p = d.report?.profile;

  return (
    <>
      {running ? <AutoRefresh intervalMs={1500} /> : null}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] text-muted">
            <Link href="/leads" className="hover:underline">
              Leads
            </Link>{" "}
            / {d.company.name}
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-[22px] font-semibold tracking-tight">
            {d.company.name}
            {d.lead.isDemo ? <DemoBadge /> : null}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {d.company.website ? (
              d.company.domain?.endsWith(".example") ? (
                <span title="Reserved .example domain used by demo fixtures; it does not resolve.">{d.company.domain}</span>
              ) : (
                <a href={d.company.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 hover:text-ink hover:underline">
                  {d.company.domain}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              )
            ) : (
              <span>No website</span>
            )}
            <StageBadge stage={d.lead.stage} />
            <ResearchStatusBadge status={d.lead.researchStatus} />
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <LeadActions leadId={d.lead.id} allowed={allowedTransitions(stage, "human")} busyRun={running} />
          {d.report ? (
            <Link href={`/leads/${d.lead.id}/report`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <FileText aria-hidden />
              Research report
            </Link>
          ) : null}
        </div>
      </div>

      {d.lead.isDemo ? (
        <p className="mb-4 rounded-md border border-prov-demo/30 bg-[#f3eefb] px-3 py-2 text-[13px] text-ink-2">
          This lead was researched with the mock research provider. Company facts come from a fictional fixture and are labelled Demo; they are not real research.
        </p>
      ) : null}
      {d.latestRun?.status === "failed" ? (
        <p className="mb-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">Latest research run failed: {d.latestRun.error ?? "unknown error"}</p>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="ICP fit" value={d.qualification ? `${d.qualification.fitScore}` : "—"} suffix="/100">
          <IcpBadge match={d.qualification?.match} />
        </Stat>
        <Stat label="Lead score" value={d.score ? `${d.score.total}` : "—"} suffix="/100">
          {d.score ? (
            <span className="flex flex-wrap gap-1.5">
              <Badge tone="accent">Grade {d.score.grade}</Badge>
              {d.score.qualified ? <Badge tone="ok">Qualified</Badge> : <Badge tone="warn">Not qualified</Badge>}
            </span>
          ) : null}
        </Stat>
        <Stat label="Data completeness" value={d.report ? pct(d.report.dataCompleteness) : "—"}>
          {d.report ? <ConfidenceMeter value={d.report.dataCompleteness} showText={false} /> : null}
          {d.score?.needsReview ? <Badge tone="warn">Needs review</Badge> : null}
        </Stat>
        <Stat label="Outreach" value="">
          <OutreachStatusBadge status={d.lead.outreachStatus} />
        </Stat>
      </div>

      {!d.report ? (
        <Panel className="mb-5">
          <Empty title={running ? "Research in progress" : "Not analyzed yet"}>
            {running ? "This page refreshes automatically as the agent works." : "Use Re-run research to analyze this lead."}
          </Empty>
          {d.toolCalls.length ? <ToolActivity calls={d.toolCalls.map((c) => ({ seq: c.seq, tool: c.tool, status: c.status, input: c.inputSummary, output: c.outputSummary, durationMs: c.durationMs, selectedBy: c.selectedBy, startedAt: c.startedAt }))} /> : null}
        </Panel>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          {d.report ? (
            <Panel>
              <PanelHeader title="AI summary and recommended angle" description={`Generated by ${d.report.summaryGeneratedBy ?? "—"} from the stored findings only.`} />
              <PanelBody className="space-y-3 text-[13.5px]">
                <p>{d.report.summary}</p>
                <div className="rounded-md border-l-4 border-accent bg-accent-soft/50 px-3 py-2">
                  <p className="text-xs font-medium text-accent-strong">Recommended outreach angle</p>
                  <p className="mt-0.5">{d.report.recommendedAngle}</p>
                </div>
              </PanelBody>
            </Panel>
          ) : null}
          {d.score ? (
            <Panel>
              <PanelHeader title="Lead score breakdown" description="Weighted, deterministic factors. Weights are configured in ICP & scoring." />
              <ScoreBreakdown score={d.score} />
              {d.score.reviewReasons.length ? (
                <ul className="border-t border-line px-4 py-3 text-[13px] text-warn">
                  {d.score.reviewReasons.map((r, i) => (
                    <li key={i}>Review: {r}</li>
                  ))}
                </ul>
              ) : null}
            </Panel>
          ) : null}
          {d.qualification ? (
            <Panel>
              <PanelHeader title="ICP qualification" description={`Fit ${d.qualification.fitScore}/100 against the ICP snapshot saved with this run.`} actions={<IcpBadge match={d.qualification.match} />} />
              <IcpFactors q={d.qualification} />
            </Panel>
          ) : null}
          {d.report ? (
            <>
              <Panel>
                <PanelHeader title="Buying signals" description="Only signals with evidence and sufficient confidence are kept." />
                <SignalsList signals={d.signals} />
              </Panel>
              <Panel>
                <PanelHeader title="Potential pain points" description="Hypotheses derived from observed evidence. Validate them in conversation." />
                <PainPointsList pains={d.pains} />
              </Panel>
              <Panel>
                <PanelHeader title="AI automation opportunities" description="Mapped to NovaFlow services. No ROI is estimated." />
                <OpportunitiesList opps={d.opps} />
              </Panel>
            </>
          ) : null}
          <Panel id="outreach">
            <PanelHeader title="Outreach" description="Cold email, LinkedIn message and two follow-ups." />
            <OutreachPanel leadId={d.lead.id} drafts={drafts} skippedReason={skippedReason} />
          </Panel>
          <Panel>
            <PanelHeader
              title="Agent activity"
              description={d.agentRun ? `Latest run: ${d.agentRun.aiProvider} planner, ${d.agentRun.steps} steps, ${d.agentRun.status}.` : "No agent runs yet."}
            />
            <ToolActivity calls={d.toolCalls.map((c) => ({ seq: c.seq, tool: c.tool, status: c.status, input: c.inputSummary, output: c.outputSummary, durationMs: c.durationMs, selectedBy: c.selectedBy, startedAt: c.startedAt }))} />
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel>
            <PanelHeader title="Contact" />
            <PanelBody className="text-[13.5px]">
              {d.contact ? (
                <dl className="grid grid-cols-[70px_1fr] gap-y-1.5">
                  <dt className="text-muted">Name</dt>
                  <dd>{d.contact.name ?? "—"}</dd>
                  <dt className="text-muted">Title</dt>
                  <dd>{d.contact.title ?? "—"}</dd>
                  <dt className="text-muted">Email</dt>
                  <dd className="break-all">{d.contact.email ?? "—"}</dd>
                </dl>
              ) : (
                <p className="text-muted">No contact supplied.</p>
              )}
              <p className="mt-2 text-xs text-muted">Contact details are user input; they are not researched or enriched.</p>
            </PanelBody>
          </Panel>
          {p ? (
            <Panel>
              <PanelHeader title="Company facts" description="Hover a label for source, confidence and time." />
              <PanelBody className="py-1">
                <ProfileFields profile={p} keys={["industry", "size_range", "business_model", "country", "locations", "services", "products", "target_customers"]} />
              </PanelBody>
              <div className="border-t border-line px-4 py-3">
                <p className="mb-2 text-[13px] font-medium">Technology signals</p>
                <TechSignals profile={p} />
              </div>
              <div className="border-t border-line px-4 py-3">
                <p className="mb-2 text-[13px] font-medium">Operational signals</p>
                <OperationalSignals profile={p} />
              </div>
            </Panel>
          ) : null}
          {d.report ? (
            <Panel>
              <PanelHeader title="Research sources" description={`${d.report.evidence.length} evidence item(s).`} />
              <div className="max-h-[420px] overflow-y-auto">
                <EvidenceList evidence={d.report.evidence} />
              </div>
            </Panel>
          ) : null}
          <Panel>
            <PanelHeader title="Activity" description="Who did what: human, AI or system." />
            {d.activities.length ? (
              <ol className="max-h-[480px] divide-y divide-line overflow-y-auto">
                {d.activities.map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-[13px]">
                    <div className="flex items-center gap-2">
                      <Badge tone={a.actorType === "human" ? "accent" : a.actorType === "ai" ? "demo" : "neutral"}>{a.actorType === "ai" ? "AI" : a.actorType}</Badge>
                      <span className="text-xs text-muted">{fmtDate(a.createdAt)}</span>
                    </div>
                    <p className="mt-1">{a.message}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty title="No activity yet" />
            )}
          </Panel>
          <Panel>
            <PanelHeader title="Research runs" />
            <ul className="divide-y divide-line text-[13px]">
              {d.runs.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2">
                  <span>
                    {fmtDate(r.createdAt)}
                    <span className="block text-xs text-muted">
                      {r.researchProvider ?? "—"} research / {r.aiProvider ?? "—"} AI{r.forceOutreach ? ", outreach forced" : ""}
                    </span>
                  </span>
                  <ResearchStatusBadge status={r.status} />
                </li>
              ))}
              {!d.runs.length ? <li className="px-4 py-3 text-muted">No runs yet.</li> : null}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, suffix, children }: { label: string; value: string; suffix?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-[13px] text-muted">{label}</p>
      {value ? (
        <p className="mt-0.5">
          <span className="tabular text-2xl font-semibold">{value}</span>
          {suffix && value !== "—" ? <span className="text-muted">{suffix}</span> : null}
        </p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
