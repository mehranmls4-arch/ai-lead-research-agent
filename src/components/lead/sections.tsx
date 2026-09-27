import type { CompanyProfile } from "@/lib/domain/profile";
import type { Evidence, Field } from "@/lib/domain/provenance";
import type { LeadDetail } from "@/lib/services/queries";
import { ConfidenceMeter, ProvenanceBadge, SourceLine } from "@/components/provenance";
import { Badge } from "@/components/ui/badge";
import { cn, fmtDate } from "@/lib/utils";

type Detail = LeadDetail;

export const FIELD_LABELS: Record<string, string> = {
  description: "Description",
  industry: "Industry",
  size_range: "Company size",
  business_model: "Business model",
  country: "Country",
  locations: "Locations",
  services: "Services",
  products: "Products",
  target_customers: "Target customers",
};

function renderValue(key: string, v: unknown): string {
  if (key === "size_range" && v && typeof v === "object") return `${(v as { label: string }).label} employees`;
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export function ProfileRow({ k, field, label }: { k: string; field?: Field<unknown>; label?: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-line py-2 last:border-0">
      <dt className="text-[13px] text-muted">{label ?? FIELD_LABELS[k] ?? k}</dt>
      <dd className="min-w-0">
        {field ? (
          <>
            <span className={cn("text-[13.5px]", k === "industry" && "capitalize")}>{renderValue(k, field.value)}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2">
              <ProvenanceBadge label={field.provenance.label} provenance={field.provenance} />
              <ConfidenceMeter value={field.provenance.confidence} />
            </span>
          </>
        ) : (
          <span className="text-[13px] text-muted">Insufficient data to verify</span>
        )}
      </dd>
    </div>
  );
}

export function ProfileFields({ profile, keys }: { profile: CompanyProfile; keys: (keyof CompanyProfile)[] }) {
  return (
    <dl>
      {keys.map((k) => (
        <ProfileRow key={k} k={k} field={profile[k] as Field<unknown> | undefined} />
      ))}
    </dl>
  );
}

export function TechSignals({ profile }: { profile: CompanyProfile }) {
  if (!profile.technology_signals.length) return <p className="text-[13px] text-muted">No technology was reliably detected. Insufficient data to verify the tech stack.</p>;
  return (
    <ul className="space-y-2">
      {profile.technology_signals.map((t) => (
        <li key={t.name} className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{t.name}</span>
          <span className="text-xs text-muted">{t.category.replace(/_/g, " ")}</span>
          <ProvenanceBadge label={t.provenance.label} provenance={t.provenance} />
          <ConfidenceMeter value={t.provenance.confidence} />
        </li>
      ))}
    </ul>
  );
}

export function OperationalSignals({ profile }: { profile: CompanyProfile }) {
  if (!profile.operational_signals.length) return <p className="text-[13px] text-muted">No operational signals observed.</p>;
  return (
    <ul className="space-y-1.5">
      {profile.operational_signals.map((o) => (
        <li key={o.key} className="flex flex-wrap items-start gap-2 text-[13px]">
          <ProvenanceBadge label={o.provenance.label} provenance={o.provenance} />
          <span className="min-w-0 flex-1">{o.description}</span>
        </li>
      ))}
    </ul>
  );
}

export function ScoreBreakdown({ score }: { score: NonNullable<Detail["score"]> }) {
  return (
    <div className="overflow-x-auto">
      <table className="data-table min-w-[640px]">
        <thead>
          <tr>
            <th>Factor</th>
            <th className="text-right">Weight</th>
            <th className="w-44">Score</th>
            <th>Evidence and explanation</th>
          </tr>
        </thead>
        <tbody>
          {score.factors.map((f) => (
            <tr key={f.key}>
              <td className="whitespace-nowrap font-medium">{f.label}</td>
              <td className="tabular text-right text-muted">{f.weight}</td>
              <td>
                <span className="tabular font-semibold">{f.score}</span>
                <span className="tabular text-muted">/{f.weight}</span>
                <span className="mt-1 block h-1.5 w-32 overflow-hidden rounded-full bg-line" aria-hidden>
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${f.ratio * 100}%` }} />
                </span>
              </td>
              <td className="text-[13px]">
                <p>{f.explanation}</p>
                {f.evidence.length ? (
                  <ul className="mt-1 list-disc pl-4 text-xs text-muted">
                    {f.evidence.slice(0, 3).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="px-3 py-2.5 font-semibold">Total</td>
            <td className="tabular px-3 py-2.5 text-right text-muted">100</td>
            <td className="px-3 py-2.5">
              <span className="tabular text-base font-semibold">{score.total}</span>
              <span className="text-muted">/100</span> <Badge tone="accent">Grade {score.grade}</Badge>
            </td>
            <td className="px-3 py-2.5 text-[13px] text-muted">
              {score.qualified ? "Qualified: at or above the configured threshold." : "Not qualified: below the configured threshold or needs review."}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const STATUS_TONE = { match: "ok", partial: "accent", miss: "danger", unknown: "neutral" } as const;

export function IcpFactors({ q }: { q: NonNullable<Detail["qualification"]> }) {
  return (
    <div className="overflow-x-auto">
      <table className="data-table min-w-[560px]">
        <thead>
          <tr>
            <th>Criterion</th>
            <th>Result</th>
            <th className="text-right">Score</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {q.factors.map((f) => (
            <tr key={f.key}>
              <td className="whitespace-nowrap font-medium">{f.factor}</td>
              <td>
                <Badge tone={STATUS_TONE[f.status]}>{f.status}</Badge>
              </td>
              <td className="tabular whitespace-nowrap text-right">
                <span className="font-semibold">{f.score}</span>
                <span className="text-muted">/{f.weight}</span>
              </td>
              <td className="text-[13px]">{f.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STRENGTH_TONE = { strong: "ok", moderate: "accent", weak: "warn" } as const;

export function SignalsList({ signals }: { signals: Detail["signals"] }) {
  if (!signals.length)
    return <p className="px-4 py-4 text-[13px] text-muted">No buying signals with supporting evidence were found. Signals are never reported without evidence.</p>;
  return (
    <ul className="divide-y divide-line">
      {signals.map((s) => (
        <li key={s.id} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{s.signal}</span>
            <Badge tone={STRENGTH_TONE[s.strength as keyof typeof STRENGTH_TONE] ?? "neutral"}>{s.strength}</Badge>
            <ProvenanceBadge label={s.label as never} />
            <ConfidenceMeter value={s.confidence} />
          </div>
          <p className="mt-1 text-[13px] text-ink-2">Evidence: {s.evidence}</p>
          <p className="mt-0.5 text-xs text-muted">
            Source:{" "}
            {s.sourceUrl ? (
              <a className="underline underline-offset-2" href={s.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                {s.source}
              </a>
            ) : (
              s.source
            )}
            , detected {fmtDate(s.detectedAt, false)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function PainPointsList({ pains }: { pains: Detail["pains"] }) {
  if (!pains.length) return <p className="px-4 py-4 text-[13px] text-muted">No pain-point hypotheses: the evidence did not support any.</p>;
  return (
    <ul className="divide-y divide-line">
      {pains.map((p) => (
        <li key={p.id} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <ProvenanceBadge label="potential" />
            <span className="font-medium">{p.title}</span>
            <Badge tone={p.severity === "high" ? "danger" : p.severity === "medium" ? "warn" : "neutral"}>{p.severity} severity</Badge>
            <ConfidenceMeter value={p.confidence} />
          </div>
          <p className="mt-1 text-[13px] text-ink-2">{p.description}</p>
          <ul className="mt-1 list-disc pl-4 text-xs text-muted">
            {p.evidence.map((e, i) => (
              <li key={i}>Evidence: {e}</li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function OpportunitiesList({ opps }: { opps: Detail["opps"] }) {
  if (!opps.length) return <p className="px-4 py-4 text-[13px] text-muted">No automation opportunities: there were no evidence-backed pain points to map.</p>;
  return (
    <ul className="divide-y divide-line">
      {opps.map((o) => (
        <li key={o.id} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{o.title}</span>
            <Badge>{o.complexity} complexity</Badge>
            <ConfidenceMeter value={o.confidence} />
          </div>
          <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-[130px_1fr]">
            <dt className="text-muted">Problem</dt>
            <dd>{o.problem}</dd>
            <dt className="text-muted">Evidence</dt>
            <dd>{o.evidence.join("; ")}</dd>
            <dt className="text-muted">Proposed solution</dt>
            <dd>{o.proposedSolution}</dd>
            <dt className="text-muted">Expected workflow</dt>
            <dd>
              <ol className="list-decimal pl-4">
                {o.expectedWorkflow.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ol>
            </dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return <p className="px-4 py-4 text-[13px] text-muted">No evidence was collected.</p>;
  return (
    <ol className="divide-y divide-line">
      {evidence.map((e) => (
        <li key={e.id} id={`ev-${e.id}`} className="px-4 py-2.5">
          <div className="flex flex-wrap items-start gap-2">
            <ProvenanceBadge label={e.provenance.label} provenance={e.provenance} />
            <span className="min-w-0 flex-1 text-[13px]">{e.statement}</span>
          </div>
          {e.excerpt ? <p className="mt-1 border-l-2 border-line pl-2 text-xs italic text-muted">“{e.excerpt}”</p> : null}
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <SourceLine provenance={e.provenance} />
            <ConfidenceMeter value={e.provenance.confidence} />
          </div>
        </li>
      ))}
    </ol>
  );
}
