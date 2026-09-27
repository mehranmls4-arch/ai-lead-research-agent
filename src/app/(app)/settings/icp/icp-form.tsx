"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/form";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { IcpConfigSchema, type IcpConfig } from "@/lib/domain/icp";
import { cn } from "@/lib/utils";

const CRITERIA_LABELS: Record<keyof IcpConfig["criteria_weights"], string> = {
  industry: "Industry",
  size: "Company size",
  geography: "Geography",
  characteristics: "Business characteristics",
  technology: "Technology signals",
};

const list = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function IcpForm(props: {
  initial: IcpConfig;
  defaults: IcpConfig;
  canEdit: boolean;
  characteristics: { id: string; label: string }[];
  techCategories: string[];
  scoreLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<IcpConfig>(props.initial);
  const [industries, setIndustries] = useState(props.initial.industries.join(", "));
  const [geos, setGeos] = useState(props.initial.geographies.join(", "));
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const disabled = !props.canEdit || busy;

  const criteriaSum = Object.values(cfg.criteria_weights).reduce((a, b) => a + b, 0);
  const scoreSum = Object.values(cfg.score_weights).reduce((a, b) => a + b, 0);

  function toggle(key: "characteristics" | "tech_signals", id: string) {
    const cur = cfg[key] as string[];
    setCfg({ ...cfg, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaved(null);
    const candidate = { ...cfg, industries: list(industries).map((x) => x.toLowerCase()), geographies: list(geos) };
    const parsed = IcpConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`));
      return;
    }
    setErrors([]);
    setBusy(true);
    const res = await fetch("/api/icp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setErrors(Array.isArray(j.details) ? j.details.map((d: { path: string; message: string }) => `${d.path}: ${d.message}`) : [j.error ?? "Save failed"]);
    else {
      setSaved("Saved. New research runs will use this configuration.");
      router.refresh();
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      {!props.canEdit ? (
        <p className="rounded-md border border-line bg-surface px-3 py-2 text-[13px] text-ink-2">You have read-only access. Only admins can change the ICP and scoring weights.</p>
      ) : null}
      <fieldset disabled={disabled} className="space-y-5">
        <Panel>
          <PanelHeader title="Target profile" />
          <PanelBody className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="name">Profile name</Label>
              <Input id="name" value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} maxLength={120} />
            </div>
            <div>
              <Label htmlFor="industries">Target industries</Label>
              <Textarea id="industries" rows={3} value={industries} onChange={(e) => setIndustries(e.target.value)} />
              <FieldHint>Comma-separated. Matched against the normalised industry catalog.</FieldHint>
            </div>
            <div>
              <Label htmlFor="geos">Target geographies</Label>
              <Textarea id="geos" rows={3} value={geos} onChange={(e) => setGeos(e.target.value)} />
              <FieldHint>Comma-separated country names.</FieldHint>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="smin">Min employees</Label>
                <Input id="smin" type="number" min={1} value={cfg.size_min} onChange={(e) => setCfg({ ...cfg, size_min: Number(e.target.value) })} />
              </div>
              <div>
                <Label htmlFor="smax">Max employees</Label>
                <Input id="smax" type="number" min={1} value={cfg.size_max} onChange={(e) => setCfg({ ...cfg, size_max: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label htmlFor="thr">Qualification threshold (lead score)</Label>
              <Input id="thr" type="number" min={0} max={100} value={cfg.qualification_threshold} onChange={(e) => setCfg({ ...cfg, qualification_threshold: Number(e.target.value) })} />
              <FieldHint>Outreach is drafted only for leads at or above this score, unless forced.</FieldHint>
            </div>
          </PanelBody>
        </Panel>

        <div className="grid gap-5 md:grid-cols-2">
          <Panel>
            <PanelHeader title="Business characteristics" description="Satisfied by observed operational signals." />
            <PanelBody className="space-y-2">
              {props.characteristics.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-[13.5px]">
                  <input type="checkbox" className="size-4 accent-[#2349C6]" checked={cfg.characteristics.includes(c.id)} onChange={() => toggle("characteristics", c.id)} />
                  {c.label}
                </label>
              ))}
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Technology signals" description="Technology categories that indicate readiness." />
            <PanelBody className="grid grid-cols-2 gap-2">
              {props.techCategories.map((t) => (
                <label key={t} className="flex items-center gap-2 text-[13.5px]">
                  <input type="checkbox" className="size-4 accent-[#2349C6]" checked={(cfg.tech_signals as string[]).includes(t)} onChange={() => toggle("tech_signals", t)} />
                  {t.replace(/_/g, " ")}
                </label>
              ))}
            </PanelBody>
          </Panel>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Panel>
            <PanelHeader title="ICP fit weights" description="Must total 100." actions={<SumBadge sum={criteriaSum} />} />
            <PanelBody className="space-y-2">
              {(Object.keys(CRITERIA_LABELS) as (keyof IcpConfig["criteria_weights"])[]).map((k) => (
                <WeightRow key={k} id={`cw-${k}`} label={CRITERIA_LABELS[k]} value={cfg.criteria_weights[k]} onChange={(v) => setCfg({ ...cfg, criteria_weights: { ...cfg.criteria_weights, [k]: v } })} />
              ))}
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Lead score weights" description="Must total 100." actions={<SumBadge sum={scoreSum} />} />
            <PanelBody className="space-y-2">
              {Object.keys(cfg.score_weights).map((k) => (
                <WeightRow
                  key={k}
                  id={`sw-${k}`}
                  label={props.scoreLabels[k] ?? k}
                  value={cfg.score_weights[k as keyof IcpConfig["score_weights"]]}
                  onChange={(v) => setCfg({ ...cfg, score_weights: { ...cfg.score_weights, [k]: v } })}
                />
              ))}
            </PanelBody>
          </Panel>
        </div>
      </fieldset>

      {errors.length ? (
        <ul role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}
      {saved ? (
        <p role="status" className="text-[13px] text-ok">
          {saved}
        </p>
      ) : null}
      {props.canEdit ? (
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save configuration"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setCfg(props.defaults);
              setIndustries(props.defaults.industries.join(", "));
              setGeos(props.defaults.geographies.join(", "));
              setErrors([]);
            }}
          >
            Load defaults
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function SumBadge({ sum }: { sum: number }) {
  return <span className={cn("tabular rounded px-2 py-0.5 text-[13px] font-semibold", sum === 100 ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>Total {sum}</span>;
}

function WeightRow({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="flex-1 text-[13.5px]">
        {label}
      </label>
      <Input id={id} type="number" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="w-20 text-right" />
    </div>
  );
}
