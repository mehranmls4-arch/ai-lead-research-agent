"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, CircleAlert, Pencil, RefreshCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/form";
import type { OutreachValidation } from "@/lib/engine/outreach-validator";
import { cn, fmtDate } from "@/lib/utils";

export interface DraftView {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  validationResult: string;
  validation: OutreachValidation;
  generatedBy: string;
  edited: boolean;
  version: number;
  isDemo: boolean;
  reviewedAt: string | null;
  sentAt: string | null;
}

const CHANNEL: Record<string, string> = { email: "Cold email", linkedin: "LinkedIn message", followup_1: "Follow-up #1", followup_2: "Follow-up #2" };
const STATUS: Record<string, [string, Tone]> = {
  draft: ["Awaiting approval", "accent"],
  needs_review: ["Needs review", "warn"],
  approved: ["Approved", "ok"],
  rejected: ["Rejected", "danger"],
  sent: ["Sent", "ok"],
};

async function call(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
  return j;
}

export function OutreachPanel({ leadId, drafts, skippedReason }: { leadId: string; drafts: DraftView[]; skippedReason: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(drafts[0]?.id ?? null);
  const latestVersion = Math.max(0, ...drafts.map((d) => d.version));
  const current = drafts.filter((d) => d.version === latestVersion);
  const history = drafts.filter((d) => d.version !== latestVersion);

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      await call(`/api/leads/${leadId}/rerun`, "POST", { force_outreach: true });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-warn-soft px-4 py-2.5">
        <p className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-warn">
          <CircleAlert className="size-4" aria-hidden />
          AI GENERATED — REQUIRES HUMAN APPROVAL
        </p>
        <Button variant="secondary" size="sm" onClick={regenerate} disabled={busy}>
          <RefreshCw aria-hidden className={cn(busy && "animate-spin")} />
          Regenerate
        </Button>
      </div>
      <p className="border-b border-line px-4 py-2 text-xs text-muted">
        Workflow: Draft, human review, approve, then send manually. This app never sends messages; &ldquo;Mark as sent&rdquo; records that you sent it yourself.
      </p>
      {error ? <p className="px-4 py-2 text-[13px] text-danger">{error}</p> : null}
      {current.length === 0 ? (
        <p className="px-4 py-5 text-[13px] text-muted">{skippedReason ?? "No outreach drafts yet."} Use Regenerate to draft outreach anyway (forced drafts still require approval).</p>
      ) : (
        <>
          <div role="tablist" aria-label="Outreach drafts" className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-2">
            {current.map((d) => (
              <button
                key={d.id}
                role="tab"
                aria-selected={active === d.id}
                onClick={() => setActive(d.id)}
                className={cn("-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2 text-[13px]", active === d.id ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink")}
              >
                {CHANNEL[d.channel] ?? d.channel}
                <span className={cn("size-1.5 rounded-full", d.validationResult === "PASS" ? "bg-ok" : "bg-warn")} aria-label={d.validationResult === "PASS" ? "passed checks" : "needs review"} />
              </button>
            ))}
          </div>
          {current.map((d) => (d.id === active ? <DraftCard key={d.id} d={d} onDone={() => router.refresh()} /> : null))}
        </>
      )}
      {history.length ? (
        <details className="border-t border-line px-4 py-3 text-[13px]">
          <summary className="cursor-pointer text-muted">Earlier approved or sent drafts ({history.length})</summary>
          <ul className="mt-2 space-y-2">
            {history.map((d) => (
              <li key={d.id} className="rounded border border-line p-2">
                <span className="font-medium">{CHANNEL[d.channel]}</span> v{d.version} <Badge tone={STATUS[d.status]?.[1] ?? "neutral"}>{STATUS[d.status]?.[0] ?? d.status}</Badge>
                <p className="mt-1 whitespace-pre-wrap text-xs text-ink-2">{d.body}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function DraftCard({ d, onDone }: { d: DraftView; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(d.subject ?? "");
  const [body, setBody] = useState(d.body);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, tone] = STATUS[d.status] ?? [d.status, "neutral" as Tone];
  const pass = d.validationResult === "PASS";
  const editable = ["draft", "needs_review", "rejected"].includes(d.status);

  async function act(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await call(`/api/outreach/${d.id}`, "PATCH", payload);
      setEditing(false);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 px-4 py-4 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone={tone}>{status}</Badge>
          <span>
            v{d.version}, generated by {d.generatedBy}
            {d.edited ? ", edited by a human" : ""}
          </span>
          {d.isDemo ? <Badge tone="demo">Demo data</Badge> : null}
          {d.sentAt ? <span>Sent {fmtDate(d.sentAt)}</span> : d.reviewedAt ? <span>Reviewed {fmtDate(d.reviewedAt)}</span> : null}
        </div>
        {editing ? (
          <div className="space-y-3">
            {d.channel !== "linkedin" ? (
              <div>
                <Label htmlFor={`s-${d.id}`}>Subject</Label>
                <Input id={`s-${d.id}`} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
              </div>
            ) : null}
            <div>
              <Label htmlFor={`b-${d.id}`}>Message</Label>
              <Textarea id={`b-${d.id}`} rows={12} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
              {d.channel === "linkedin" ? <p className="mt-1 text-xs text-muted">{body.length}/300 characters</p> : null}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-line bg-paper/60 p-3">
            {d.subject ? (
              <p className="mb-2 border-b border-line pb-2 text-[13.5px]">
                <span className="text-muted">Subject: </span>
                <span className="font-medium">{d.subject}</span>
              </p>
            ) : null}
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{d.body}</p>
          </div>
        )}
        {error ? (
          <p role="alert" className="mt-2 text-[13px] text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <Button size="sm" onClick={() => act({ action: "edit", subject: d.channel === "linkedin" ? null : subject, body })} disabled={busy || !body.trim()}>
                Save and re-validate
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setBody(d.body); setSubject(d.subject ?? ""); }}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              {["draft", "needs_review"].includes(d.status) ? (
                <Button size="sm" variant="approve" onClick={() => act({ action: "approve", acknowledge_warnings: ack })} disabled={busy || (!pass && !ack)}>
                  <Check aria-hidden />
                  Approve
                </Button>
              ) : null}
              {editable ? (
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)} disabled={busy}>
                  <Pencil aria-hidden />
                  Edit
                </Button>
              ) : null}
              {["draft", "needs_review", "approved"].includes(d.status) ? (
                <Button size="sm" variant="danger" onClick={() => act({ action: "reject" })} disabled={busy}>
                  <X aria-hidden />
                  Reject
                </Button>
              ) : null}
              {d.status === "approved" ? (
                <Button size="sm" onClick={() => act({ action: "send" })} disabled={busy}>
                  <Send aria-hidden />
                  Mark as sent
                </Button>
              ) : null}
            </>
          )}
        </div>
        {!pass && ["draft", "needs_review"].includes(d.status) && !editing ? (
          <label className="mt-2 flex items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="size-4 accent-[#2349C6]" />
            I reviewed the quality-check findings and approve this draft anyway.
          </label>
        ) : null}
      </div>

      <aside aria-label="Quality check" className="rounded-md border border-line">
        <div className={cn("flex items-center justify-between border-b border-line px-3 py-2", pass ? "bg-ok-soft" : "bg-warn-soft")}>
          <span className="text-[13px] font-medium">Quality check</span>
          <span className={cn("text-[13px] font-semibold", pass ? "text-ok" : "text-warn")}>{pass ? "PASS" : "NEEDS REVIEW"}</span>
        </div>
        <ul className="divide-y divide-line">
          {d.validation.checks.map((c) => (
            <li key={c.id} className="flex gap-2 px-3 py-1.5 text-xs" title={c.detail}>
              <span aria-hidden className={cn("mt-0.5", c.passed ? "text-ok" : c.severity === "error" ? "text-danger" : "text-warn")}>
                {c.passed ? "✓" : "!"}
              </span>
              <span className="min-w-0">
                <span className={cn(!c.passed && "font-medium")}>{c.label}</span>
                {!c.passed ? <span className="block text-muted">{c.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
        {d.validation.warnings.length ? (
          <ul className="border-t border-line px-3 py-2 text-xs text-muted">
            {d.validation.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : null}
      </aside>
    </div>
  );
}
