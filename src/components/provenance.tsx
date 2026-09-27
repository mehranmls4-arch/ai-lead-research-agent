import type { EvidenceLabel, Provenance } from "@/lib/domain/provenance";
import { LABEL_TEXT, confidenceBand } from "@/lib/domain/provenance";
import { cn, fmtDate } from "@/lib/utils";

const LABEL_COLOR: Record<EvidenceLabel, string> = {
  verified: "text-prov-verified border-prov-verified/35 bg-prov-verified/[0.06]",
  source_backed: "text-prov-source border-prov-source/35 bg-prov-source/[0.06]",
  estimated: "text-prov-estimated border-prov-estimated/40 bg-prov-estimated/[0.07]",
  inferred: "text-prov-inferred border-prov-inferred/35 bg-prov-inferred/[0.06]",
  demo: "text-prov-demo border-prov-demo/35 bg-prov-demo/[0.07]",
  potential: "text-prov-potential border-prov-potential/35 bg-prov-potential/[0.06]",
};

const LABEL_HELP: Record<EvidenceLabel, string> = {
  verified: "Observed directly on the company's own website.",
  source_backed: "Stated by a cited third-party source or supplied by a user.",
  estimated: "Approximate value, not directly stated.",
  inferred: "Deduced by rules or the AI model from other evidence.",
  demo: "Simulated fixture data from the mock research provider. Not real research.",
  potential: "A hypothesis to validate, not a fact.",
};

/** The label chip shown next to every claim. Hover/focus reveals source, confidence and time. */
export function ProvenanceBadge({ label, provenance, className }: { label: EvidenceLabel; provenance?: Provenance | null; className?: string }) {
  const title = provenance
    ? `${LABEL_TEXT[label]} — ${LABEL_HELP[label]}\nSource: ${provenance.source}${provenance.source_url ? ` (${provenance.source_url})` : ""}\nConfidence: ${Math.round(provenance.confidence * 100)}%\nRetrieved: ${fmtDate(provenance.retrieved_at)}`
    : `${LABEL_TEXT[label]} — ${LABEL_HELP[label]}`;
  return (
    <span
      title={title}
      tabIndex={0}
      className={cn("inline-flex shrink-0 cursor-help items-center gap-1 rounded-sm border px-1.5 py-px text-[11px] font-medium leading-4", LABEL_COLOR[label], className)}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {LABEL_TEXT[label]}
    </span>
  );
}

export function ConfidenceMeter({ value, className, showText = true }: { value: number; className?: string; showText?: boolean }) {
  const band = confidenceBand(value);
  const filled = Math.max(1, Math.round(value * 5));
  const color = band === "high" ? "bg-ok" : band === "medium" ? "bg-warn" : "bg-danger/70";
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={`Confidence ${Math.round(value * 100)}% (${band})`}>
      <span className="flex gap-px" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={cn("h-2.5 w-1.5 rounded-[1px]", i < filled ? color : "bg-line")} />
        ))}
      </span>
      {showText ? <span className="tabular text-xs text-muted">{Math.round(value * 100)}%</span> : <span className="sr-only">{Math.round(value * 100)}% confidence</span>}
    </span>
  );
}

export function SourceLine({ provenance }: { provenance: Provenance }) {
  return (
    <span className="text-xs text-muted">
      {provenance.source_url ? (
        <a href={provenance.source_url} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
          {provenance.source}
        </a>
      ) : (
        provenance.source
      )}
      {", retrieved "}
      {fmtDate(provenance.retrieved_at)}
    </span>
  );
}

export function LabelLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
      {(Object.keys(LABEL_TEXT) as EvidenceLabel[]).map((l) => (
        <span key={l} className="inline-flex items-center gap-1.5 text-xs text-muted">
          <ProvenanceBadge label={l} />
          <span className="hidden sm:inline">{LABEL_HELP[l]}</span>
        </span>
      ))}
    </div>
  );
}
