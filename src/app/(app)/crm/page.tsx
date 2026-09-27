import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { getCrmBoard } from "@/lib/services/queries";
import { allowedTransitions } from "@/lib/engine/crm";
import { CRM_STAGES, STAGE_LABELS, type CrmStage } from "@/lib/domain/lead";
import { PageHeader } from "@/components/page-header";
import { IcpBadge, OutreachStatusBadge, ScoreBar } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { StageMover } from "./stage-mover";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pipeline" };

export default async function CrmPage() {
  const rows = await getCrmBoard(getDb());
  const byStage = new Map<CrmStage, typeof rows>(CRM_STAGES.map((s) => [s, []]));
  for (const r of rows) byStage.get(r.stage as CrmStage)?.push(r);

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Every lead by CRM stage. The AI can move leads only to Researching, Qualified, Needs review and Outreach drafted; every later stage, including Won and Lost, is a human decision."
      />
      {rows.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-muted">
          No leads yet.{" "}
          <Link href="/leads/new" className="text-accent underline">
            Analyze a lead
          </Link>{" "}
          to start the pipeline.
        </p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex min-w-max gap-3">
            {CRM_STAGES.map((stage) => {
              const items = byStage.get(stage) ?? [];
              return (
                <section key={stage} aria-label={STAGE_LABELS[stage]} className="flex w-[244px] shrink-0 flex-col rounded-lg border border-line bg-[#eef0f4]">
                  <header className="flex items-center justify-between px-3 py-2">
                    <h2 className="text-[13px] font-semibold">{STAGE_LABELS[stage]}</h2>
                    <span className="tabular rounded bg-surface px-1.5 text-xs text-muted">{items.length}</span>
                  </header>
                  <ul className="flex min-h-24 flex-col gap-2 px-2 pb-2">
                    {items.map((r) => (
                      <li key={r.id} className="relative rounded-md border border-line bg-surface p-2.5">
                        <Link href={`/leads/${r.id}`} className="block font-medium leading-snug hover:text-accent hover:underline">
                          {r.company}
                        </Link>
                        {r.contact ? <p className="text-xs text-muted">{r.contact}</p> : null}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <ScoreBar value={r.leadScore} />
                          <IcpBadge match={r.icpMatch} />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <OutreachStatusBadge status={r.outreachStatus} />
                          {r.isDemo ? <Badge tone="demo">Demo</Badge> : null}
                        </div>
                        <StageMover leadId={r.id} allowed={allowedTransitions(stage, "human")} />
                      </li>
                    ))}
                    {!items.length ? <li className="px-1 py-3 text-center text-xs text-muted">Empty</li> : null}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
