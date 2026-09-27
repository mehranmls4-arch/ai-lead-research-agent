"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Loader2, Minus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldHint, Input, Label } from "@/components/ui/form";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { PIPELINE_STEPS, stepStates, type StepState, type ToolCallView } from "@/components/agent/pipeline";
import { ToolActivity } from "@/components/agent/tool-activity";
import { IcpBadge, OutreachStatusBadge, StageBadge } from "@/components/status";
import { cn } from "@/lib/utils";

interface Demo {
  key: string;
  company_name: string;
  website: string;
  contact_name: string;
  contact_email: string;
  title: string;
  expected: string;
  industry: string;
}

interface Progress {
  run: { id: string; leadId: string; status: string; error: string | null; isDemo: boolean; researchProvider: string | null; aiProvider: string | null };
  calls: ToolCallView[];
  lead: { stage: string; leadScore: number | null; fitScore: number | null; icpMatch: string | null; outreachStatus: string };
}

const EMPTY = { company_name: "", website: "", contact_name: "", contact_email: "", title: "", industry: "", country: "" };
const FINISHED = ["ready", "needs_review", "failed"];

export function AnalyzeLead({ demos, initialDemo, researchProvider, aiProvider }: { demos: Demo[]; initialDemo: string; researchProvider: string; aiProvider: string }) {
  const start = demos.find((d) => d.key === initialDemo);
  const [selected, setSelected] = useState<string | null>(start?.key ?? null);
  const [form, setForm] = useState(start ? fromDemo(start) : EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const poll = async () => {
      const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const p = (await res.json()) as Progress;
      setProgress(p);
      if (!FINISHED.includes(p.run.status)) timer.current = setTimeout(poll, 600);
      else setBusy(false);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [runId]);

  function pick(d: Demo) {
    setSelected(d.key);
    setForm(fromDemo(d));
    setErrors({});
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    setProgress(null);
    setRunId(null);
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ""));
    const res = await fetch("/api/leads/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      if (Array.isArray(j.details)) setErrors(Object.fromEntries(j.details.map((d: { path: string; message: string }) => [d.path, d.message])));
      setFormError(j.error ?? "Could not start the analysis");
      return;
    }
    setRunId(j.runId);
  }

  const states = progress ? stepStates(progress.calls) : null;
  const finished = progress && FINISHED.includes(progress.run.status);

  return (
    <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
      <div className="space-y-5">
        <Panel>
          <PanelHeader title="Built-in demo companies" description="Fictional companies with fixture data. Results are labelled Demo." />
          <ul className="divide-y divide-line">
            {demos.map((d) => (
              <li key={d.key}>
                <button
                  type="button"
                  onClick={() => pick(d)}
                  aria-pressed={selected === d.key}
                  className={cn("flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-paper", selected === d.key && "bg-accent-soft/60")}
                >
                  <span className={cn("mt-1 size-3 shrink-0 rounded-full border", selected === d.key ? "border-accent bg-accent" : "border-line-strong")} aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-medium">{d.company_name}</span>
                    <span className="block text-xs text-muted">
                      {d.industry}. Designed outcome: {d.expected}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Lead details" description={`Research provider: ${researchProvider}. AI provider: ${aiProvider}.`} />
          <PanelBody>
            <form onSubmit={submit} className="space-y-3" noValidate>
              <Field id="company_name" label="Company name" required value={form.company_name} error={errors.company_name} onChange={(v) => { setSelected(null); setForm({ ...form, company_name: v }); }} />
              <Field id="website" label="Company website" value={form.website} error={errors.website} placeholder="https://" onChange={(v) => setForm({ ...form, website: v })} />
              <div className="grid grid-cols-2 gap-3">
                <Field id="contact_name" label="Contact name" value={form.contact_name} error={errors.contact_name} onChange={(v) => setForm({ ...form, contact_name: v })} />
                <Field id="title" label="Job title" value={form.title} error={errors.title} onChange={(v) => setForm({ ...form, title: v })} />
              </div>
              <Field id="contact_email" label="Contact email" type="email" value={form.contact_email} error={errors.contact_email} onChange={(v) => setForm({ ...form, contact_email: v })} />
              <div className="grid grid-cols-2 gap-3">
                <Field id="industry" label="Industry (optional)" value={form.industry} error={errors.industry} onChange={(v) => setForm({ ...form, industry: v })} />
                <Field id="country" label="Country (optional)" value={form.country} error={errors.country} onChange={(v) => setForm({ ...form, country: v })} />
              </div>
              <FieldHint>Industry and country you enter are stored as user input and labelled Source-backed; research findings take precedence when they exist.</FieldHint>
              {formError ? (
                <p role="alert" className="text-[13px] text-danger">
                  {formError}
                </p>
              ) : null}
              <Button type="submit" size="lg" className="w-full" disabled={busy || !form.company_name.trim()}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {busy ? "Analyzing…" : "Analyze Lead"}
              </Button>
            </form>
          </PanelBody>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel>
          <PanelHeader
            title="Pipeline progress"
            description={progress ? `Run ${progress.run.id.slice(0, 8)} — ${progress.run.status.replace("_", " ")}` : "Start an analysis to see each step as it runs."}
            actions={progress?.run.isDemo ? <Badge tone="demo">Demo data</Badge> : null}
          />
          <ol className="grid gap-px bg-line sm:grid-cols-3" aria-live="polite">
            {PIPELINE_STEPS.map((s, i) => {
              let st: StepState = states?.[s.key] ?? "pending";
              if (s.key === "approval" && st === "done") st = progress?.lead.outreachStatus === "drafted" || progress?.lead.outreachStatus === "needs_review" ? "running" : "skipped";
              return <Step key={s.key} n={i + 1} label={s.label} state={st} approval={s.key === "approval"} />;
            })}
          </ol>
          {progress?.run.status === "failed" ? <p className="border-t border-line px-4 py-3 text-[13px] text-danger">Run failed: {progress.run.error ?? "unknown error"}</p> : null}
          {finished && progress ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-4 py-3 text-[13px]">
              <span>
                ICP fit <strong className="tabular">{progress.lead.fitScore ?? "—"}</strong> <IcpBadge match={progress.lead.icpMatch} />
              </span>
              <span>
                Lead score <strong className="tabular">{progress.lead.leadScore ?? "—"}</strong>/100
              </span>
              <span className="flex items-center gap-1.5">
                Stage <StageBadge stage={progress.lead.stage} />
              </span>
              <span className="flex items-center gap-1.5">
                Outreach <OutreachStatusBadge status={progress.lead.outreachStatus} />
              </span>
              <span className="ml-auto flex gap-2">
                <Link href={`/leads/${progress.run.leadId}/report`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Research report
                </Link>
                <Link href={`/leads/${progress.run.leadId}#outreach`} className={buttonVariants({ size: "sm" })}>
                  Review lead and outreach
                </Link>
              </span>
            </div>
          ) : null}
        </Panel>
        <Panel>
          <PanelHeader title="Agent activity" description="Tool calls made by the agent: inputs and outputs are summaries. Model reasoning is not recorded." />
          <ToolActivity calls={progress?.calls ?? []} compact />
        </Panel>
      </div>
    </div>
  );
}

function fromDemo(d: Demo) {
  return { ...EMPTY, company_name: d.company_name, website: d.website, contact_name: d.contact_name, contact_email: d.contact_email, title: d.title };
}

function Field(p: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; required?: boolean; type?: string; placeholder?: string }) {
  return (
    <div>
      <Label htmlFor={p.id}>
        {p.label}
        {p.required ? <span className="text-danger"> *</span> : null}
      </Label>
      <Input id={p.id} type={p.type ?? "text"} value={p.value} placeholder={p.placeholder} aria-invalid={Boolean(p.error)} onChange={(e) => p.onChange(e.target.value)} />
      {p.error ? <p className="mt-1 text-xs text-danger">{p.error}</p> : null}
    </div>
  );
}

function Step({ n, label, state, approval }: { n: number; label: string; state: StepState; approval?: boolean }) {
  const icon =
    state === "done" ? <Check className="size-3.5" /> : state === "running" ? (approval ? <CircleAlert className="size-3.5" /> : <Loader2 className="size-3.5 animate-spin" />) : state === "failed" ? <CircleAlert className="size-3.5" /> : state === "skipped" ? <Minus className="size-3.5" /> : state === "warning" ? <CircleAlert className="size-3.5" /> : <span className="tabular text-[11px]">{n}</span>;
  const note =
    approval && state === "running" ? "Waiting for you" : approval && state === "skipped" ? "No drafts to approve" : state === "warning" ? "Completed with findings" : state === "skipped" ? "Skipped" : state === "running" ? "In progress" : state === "done" ? "Done" : state === "failed" ? "Failed" : "Pending";
  return (
    <li className="flex items-center gap-3 bg-surface px-4 py-3">
      <span
        aria-hidden
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border",
          state === "done" && "border-ok bg-ok text-white",
          state === "running" && (approval ? "border-warn bg-warn-soft text-warn" : "border-accent text-accent"),
          state === "warning" && "border-warn bg-warn-soft text-warn",
          state === "failed" && "border-danger bg-danger-soft text-danger",
          state === "skipped" && "border-line-strong text-muted",
          state === "pending" && "border-line-strong text-muted",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className={cn("block text-[13.5px] font-medium", state === "pending" && "text-muted")}>{label}</span>
        <span className="block text-xs text-muted">{note}</span>
      </span>
    </li>
  );
}
