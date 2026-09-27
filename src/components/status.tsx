import { Badge, type Tone } from "@/components/ui/badge";
import { RESEARCH_STATUS_LABELS, STAGE_LABELS, type CrmStage, type ResearchStatus } from "@/lib/domain/lead";
import { cn } from "@/lib/utils";

const STAGE_TONE: Record<CrmStage, Tone> = {
  new: "neutral",
  researching: "accent",
  qualified: "ok",
  needs_review: "warn",
  outreach_drafted: "accent",
  approved: "ok",
  contacted: "accent",
  replied: "ok",
  meeting: "ok",
  won: "ok",
  lost: "neutral",
};

export function StageBadge({ stage }: { stage: string }) {
  const s = stage as CrmStage;
  return <Badge tone={STAGE_TONE[s] ?? "neutral"}>{STAGE_LABELS[s] ?? stage}</Badge>;
}

export function ResearchStatusBadge({ status }: { status: string }) {
  const s = status as ResearchStatus;
  const tone: Tone = s === "ready" ? "ok" : s === "failed" ? "danger" : s === "needs_review" ? "warn" : s === "not_started" ? "neutral" : "accent";
  const active = ["queued", "researching", "enriching", "qualifying", "scoring"].includes(s);
  return (
    <Badge tone={tone}>
      {active ? <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-current" /> : null}
      {RESEARCH_STATUS_LABELS[s] ?? status}
    </Badge>
  );
}

const OUTREACH_LABEL: Record<string, [string, Tone]> = {
  none: ["None", "neutral"],
  skipped: ["Skipped", "neutral"],
  drafted: ["Awaiting approval", "accent"],
  needs_review: ["Needs review", "warn"],
  approved: ["Approved", "ok"],
  rejected: ["Rejected", "danger"],
  sent: ["Sent", "ok"],
};

export function OutreachStatusBadge({ status }: { status: string }) {
  const [label, tone] = OUTREACH_LABEL[status] ?? [status, "neutral" as Tone];
  return <Badge tone={tone}>{label}</Badge>;
}

const ICP_LABEL: Record<string, [string, Tone]> = {
  strong: ["Strong fit", "ok"],
  medium: ["Medium fit", "accent"],
  weak: ["Weak fit", "warn"],
  poor: ["Poor fit", "danger"],
  insufficient_data: ["Insufficient data", "neutral"],
};

export function IcpBadge({ match }: { match: string | null | undefined }) {
  if (!match) return <span className="text-muted">—</span>;
  const [label, tone] = ICP_LABEL[match] ?? [match, "neutral" as Tone];
  return <Badge tone={tone}>{label}</Badge>;
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="demo" className={className} title="Produced by the mock research provider from fictional fixture data. Not real research.">
      Demo data
    </Badge>
  );
}

/** Horizontal score bar, 0..max. */
export function ScoreBar({ value, max = 100, className, tone }: { value: number | null | undefined; max?: number; className?: string; tone?: "auto" | "accent" }) {
  if (value === null || value === undefined) return <span className="text-muted">—</span>;
  const ratio = Math.max(0, Math.min(1, value / max));
  const color = tone === "accent" ? "bg-accent" : ratio >= 0.75 ? "bg-ok" : ratio >= 0.55 ? "bg-accent" : ratio >= 0.4 ? "bg-warn" : "bg-danger/70";
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="tabular w-7 text-right font-semibold">{value}</span>
      <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-line" aria-hidden>
        <span className={cn("absolute inset-y-0 left-0 rounded-full", color)} style={{ width: `${ratio * 100}%` }} />
      </span>
    </span>
  );
}
