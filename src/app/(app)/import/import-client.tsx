"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { IcpBadge, ResearchStatusBadge } from "@/components/status";
import { fmtDate } from "@/lib/utils";

interface Row {
  row: number;
  valid: boolean;
  errors: string[];
  data: { company_name: string; website?: string; contact_name?: string; contact_email?: string; title?: string; industry?: string; country?: string } | null;
  raw: Record<string, string>;
}
interface Validation {
  total: number;
  valid: number;
  invalid: number;
  fileErrors: string[];
  unknownColumns: string[];
  rows: Row[];
}
interface BatchStatus {
  id: string;
  filename: string;
  counts: { total: number; valid: number; invalid: number; queued: number; processing: number; completed: number; needs_review: number; failed: number };
  errors: { row: number; errors: string[] }[];
  rows: { run_id: string; lead_id: string; company: string; contact: string | null; status: string; lead_score: number | null; icp_match: string | null; error: string | null }[];
  done: boolean;
}

export const SAMPLE_CSV = `company,website,contact_name,contact_email,title,industry,country
Harbor Realty Group,https://harborrealtygroup.example,Marcus Ortega,marcus@harborrealtygroup.example,Broker/Owner,,
Ironvale Steelworks,https://ironvale.example,Klaus Berger,k.berger@ironvale.example,Plant Engineer,,
Northwind Dental Group,https://northwind-dental.example,Lena Fischer,lena@northwind-dental.example,Practice Manager,healthcare administration,United States
Bad Email Co,https://bademail.example,Sam Lee,not-an-email,Owner,,
Internal Host Inc,http://localhost:3000,Jo Park,jo@internalhost.example,CEO,,
,https://missing-company.example,Ana Diaz,ana@missing-company.example,COO,,
Harbor Realty Group,https://harborrealtygroup.example,Marcus Ortega,marcus@harborrealtygroup.example,Broker/Owner,,
`;

export function ImportClient({ initialBatch, recent }: { initialBatch: string | null; recent: { id: string; filename: string; total: number; valid: number; invalid: number; createdAt: string }[] }) {
  const [csv, setCsv] = useState<string | null>(null);
  const [filename, setFilename] = useState("import.csv");
  const [validation, setValidation] = useState<Validation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(initialBatch);
  const [batch, setBatch] = useState<BatchStatus | null>(null);

  useEffect(() => {
    if (!batchId) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const res = await fetch(`/api/import/${batchId}`, { cache: "no-store" });
      if (stop) return;
      if (!res.ok) {
        setError("Could not load import status");
        return;
      }
      const b = (await res.json()) as BatchStatus;
      setBatch(b);
      if (!b.done) t = setTimeout(poll, 1000);
    };
    void poll();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [batchId]);

  async function validate(text: string, name: string) {
    setBusy(true);
    setError(null);
    setValidation(null);
    setCsv(text);
    setFilename(name);
    const res = await fetch("/api/import/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: text, filename: name }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(j.error ?? "Validation failed");
    else setValidation(j);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) {
      setError("File exceeds the 1 MB limit.");
      return;
    }
    await validate(await file.text(), file.name);
  }

  async function commit() {
    if (!csv) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/import/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, filename }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(j.error ?? "Import failed");
    else {
      setBatchId(j.batchId);
      setValidation(null);
      window.history.replaceState(null, "", `/import?batch=${j.batchId}`);
    }
  }

  const invalidRows = validation?.rows.filter((r) => !r.valid) ?? [];
  const validRows = validation?.rows.filter((r) => r.valid) ?? [];
  const c = batch?.counts;
  const processed = c ? c.completed + c.failed : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Panel>
          <PanelHeader title="1. Upload and validate" />
          <PanelBody className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong bg-paper px-4 py-8 text-center hover:border-accent">
              <Upload className="size-5 text-muted" aria-hidden />
              <span className="text-[13.5px] font-medium">Choose a CSV file</span>
              <span className="text-xs text-muted">UTF-8, comma-separated, first row is the header</span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} data-testid="csv-file" />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => validate(SAMPLE_CSV, "sample-with-errors.csv")}>
                Validate the sample file
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const url = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: "text/csv" }));
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "sample-leads.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download aria-hidden />
                Download sample
              </Button>
            </div>
            {busy ? <p className="text-[13px] text-muted">Working…</p> : null}
            {error ? (
              <p role="alert" className="text-[13px] text-danger">
                {error}
              </p>
            ) : null}
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Columns" />
          <PanelBody className="text-[13px]">
            <table className="w-full">
              <tbody className="[&_td]:py-1 [&_td]:align-top">
                <tr>
                  <td className="font-medium">company</td>
                  <td className="text-muted">Required</td>
                </tr>
                <tr>
                  <td className="font-medium">website</td>
                  <td className="text-muted">Optional. Public http(s) URL; internal hosts and private IPs are rejected.</td>
                </tr>
                <tr>
                  <td className="font-medium">contact_name</td>
                  <td className="text-muted">Optional</td>
                </tr>
                <tr>
                  <td className="font-medium">contact_email</td>
                  <td className="text-muted">Optional, must be a valid email</td>
                </tr>
                <tr>
                  <td className="font-medium">title</td>
                  <td className="text-muted">Optional, used for contact relevance</td>
                </tr>
                <tr>
                  <td className="font-medium">industry, country</td>
                  <td className="text-muted">Optional hints</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">Aliases accepted: name, url, domain, email, job_title. Duplicate companies (same name or domain) are flagged. A company that already exists is re-analyzed on its existing lead.</p>
          </PanelBody>
        </Panel>
      </div>

      {validation ? (
        <Panel>
          <PanelHeader
            title="2. Review"
            description={`${validation.total} row(s): ${validation.valid} valid, ${validation.invalid} invalid.`}
            actions={
              <Button onClick={commit} disabled={busy || !validation.valid || validation.fileErrors.length > 0}>
                Import {validation.valid} valid lead{validation.valid === 1 ? "" : "s"}
              </Button>
            }
          />
          {validation.fileErrors.length ? (
            <ul className="border-b border-line bg-danger-soft px-4 py-2 text-[13px] text-danger">
              {validation.fileErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : null}
          {validation.unknownColumns.length ? <p className="border-b border-line px-4 py-2 text-xs text-muted">Ignored columns: {validation.unknownColumns.join(", ")}</p> : null}
          {invalidRows.length ? (
            <div className="overflow-x-auto border-b border-line">
              <p className="px-4 pt-3 text-[13px] font-medium text-danger">Invalid rows (not imported)</p>
              <table className="data-table min-w-[640px]">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Company</th>
                    <th>Problems</th>
                  </tr>
                </thead>
                <tbody>
                  {invalidRows.map((r) => (
                    <tr key={r.row}>
                      <td className="tabular">{r.row}</td>
                      <td>{r.raw.company || r.raw.company_name || r.raw.name || <span className="text-muted">(empty)</span>}</td>
                      <td className="text-danger">{r.errors.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {validRows.length ? (
            <div className="overflow-x-auto">
              <p className="px-4 pt-3 text-[13px] font-medium text-ok">Valid rows (preview)</p>
              <table className="data-table min-w-[720px]">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Company</th>
                    <th>Website</th>
                    <th>Contact</th>
                    <th>Email</th>
                    <th>Title</th>
                  </tr>
                </thead>
                <tbody>
                  {validRows.slice(0, 100).map((r) => (
                    <tr key={r.row}>
                      <td className="tabular">{r.row}</td>
                      <td className="font-medium">{r.data?.company_name}</td>
                      <td className="text-muted">{r.data?.website ?? "—"}</td>
                      <td>{r.data?.contact_name ?? "—"}</td>
                      <td>{r.data?.contact_email ?? "—"}</td>
                      <td>{r.data?.title ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {batch && c ? (
        <Panel>
          <PanelHeader title={`3. Processing ${batch.filename}`} description={batch.done ? "All queued leads have finished." : "Leads are researched a few at a time. This view updates every second."} />
          <div className="grid grid-cols-3 gap-px border-b border-line bg-line sm:grid-cols-7">
            {(
              [
                ["Total rows", c.total],
                ["Valid", c.valid],
                ["Invalid", c.invalid],
                ["Queued", c.queued],
                ["Processing", c.processing],
                ["Completed", c.completed],
                ["Failed", c.failed],
              ] as const
            ).map(([l, v]) => (
              <div key={l} className="bg-surface px-3 py-2">
                <p className="text-xs text-muted">{l}</p>
                <p className="tabular text-lg font-semibold">{v}</p>
              </div>
            ))}
          </div>
          <div className="px-4 py-3">
            <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={processed} aria-valuemin={0} aria-valuemax={c.valid}>
              <div className="h-full bg-accent transition-[width]" style={{ width: `${c.valid ? (processed / c.valid) * 100 : 0}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">
              {processed} of {batch.rows.length} processed{c.needs_review ? `, ${c.needs_review} need review` : ""}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>ICP</th>
                  <th className="text-right">Lead score</th>
                </tr>
              </thead>
              <tbody>
                {batch.rows.map((r) => (
                  <tr key={r.run_id}>
                    <td>
                      <Link href={`/leads/${r.lead_id}`} className="font-medium hover:text-accent hover:underline">
                        {r.company}
                      </Link>
                      {r.error ? <p className="text-xs text-danger">{r.error}</p> : null}
                    </td>
                    <td>{r.contact ?? "—"}</td>
                    <td>
                      <ResearchStatusBadge status={r.status} />
                    </td>
                    <td>
                      <IcpBadge match={r.icp_match} />
                    </td>
                    <td className="tabular text-right">{r.lead_score ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {batch.errors.length ? (
            <details className="border-t border-line px-4 py-3 text-[13px]">
              <summary className="cursor-pointer text-muted">{batch.errors.length} invalid row(s) recorded with this import</summary>
              <ul className="mt-2 space-y-1 text-danger">
                {batch.errors.map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.errors.join("; ")}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Panel>
      ) : null}

      {recent.length ? (
        <Panel>
          <PanelHeader title="Recent imports" />
          <ul className="divide-y divide-line text-[13px]">
            {recent.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <button type="button" className="font-medium text-accent hover:underline" onClick={() => setBatchId(b.id)}>
                  {b.filename}
                </button>
                <span className="flex items-center gap-2 text-muted">
                  <Badge tone="ok">{b.valid} valid</Badge>
                  {b.invalid ? <Badge tone="danger">{b.invalid} invalid</Badge> : null}
                  {fmtDate(b.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
