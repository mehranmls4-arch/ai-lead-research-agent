"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { STAGE_LABELS, type CrmStage } from "@/lib/domain/lead";

/** Human-only CRM actions. Allowed targets are computed server-side from the transition rules. */
export function LeadActions({ leadId, allowed, busyRun }: { leadId: string; allowed: CrmStage[]; busyRun: boolean }) {
  const router = useRouter();
  const [to, setTo] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(j.error ?? "Action failed");
    else {
      setTo("");
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="stage-move">
        Move to stage
      </label>
      <Select id="stage-move" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-44 text-[13px]" disabled={!allowed.length}>
        <option value="">{allowed.length ? "Move to stage…" : "No manual moves"}</option>
        {allowed.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </Select>
      <Button size="sm" variant="secondary" disabled={!to || busy} onClick={() => post(`/api/leads/${leadId}/stage`, { stage: to })}>
        Move
      </Button>
      <Button size="sm" variant="secondary" disabled={busy || busyRun} onClick={() => post(`/api/leads/${leadId}/rerun`, { force_outreach: false })}>
        <RotateCw aria-hidden />
        {busyRun ? "Research running" : "Re-run research"}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
