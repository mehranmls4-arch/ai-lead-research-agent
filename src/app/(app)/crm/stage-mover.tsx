"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { STAGE_LABELS, type CrmStage } from "@/lib/domain/lead";

export function StageMover({ leadId, allowed }: { leadId: string; allowed: CrmStage[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!allowed.length) return null;
  return (
    <div className="mt-2">
      <label className="sr-only" htmlFor={`mv-${leadId}`}>
        Move lead to stage
      </label>
      <select
        id={`mv-${leadId}`}
        disabled={busy}
        value=""
        onChange={async (e) => {
          const stage = e.target.value;
          if (!stage) return;
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/leads/${leadId}/stage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) });
          setBusy(false);
          if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Move failed");
          else router.refresh();
        }}
        className="h-7 w-full rounded border border-line bg-surface px-1.5 text-xs text-ink-2"
      >
        <option value="">{busy ? "Moving…" : "Move to…"}</option>
        {allowed.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
