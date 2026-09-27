import Papa from "papaparse";
import { LeadInputSchema, type LeadInput } from "../domain/lead";
import { normalizeWebsite } from "../security/url";

export const CSV_MAX_BYTES = 1_000_000;
export const CSV_MAX_ROWS = 500;

const HEADER_ALIASES: Record<string, keyof LeadInput> = {
  company: "company_name",
  company_name: "company_name",
  name: "company_name",
  website: "website",
  url: "website",
  domain: "website",
  contact: "contact_name",
  contact_name: "contact_name",
  email: "contact_email",
  contact_email: "contact_email",
  title: "title",
  job_title: "title",
  industry: "industry",
  country: "country",
};

export interface CsvRowResult {
  row: number; // 1-based data row number (header excluded)
  valid: boolean;
  data?: LeadInput;
  errors: string[];
  raw: Record<string, string>;
}

export interface CsvParseResult {
  rows: CsvRowResult[];
  total: number;
  valid: number;
  invalid: number;
  fileErrors: string[];
  unknownColumns: string[];
}

export function parseLeadCsv(text: string): CsvParseResult {
  const fileErrors: string[] = [];
  if (Buffer.byteLength(text, "utf8") > CSV_MAX_BYTES) {
    return { rows: [], total: 0, valid: 0, invalid: 0, fileErrors: [`File exceeds ${CSV_MAX_BYTES / 1_000_000} MB limit.`], unknownColumns: [] };
  }
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });
  const headers = parsed.meta.fields ?? [];
  const unknownColumns = headers.filter((h) => !HEADER_ALIASES[h]);
  if (!headers.some((h) => HEADER_ALIASES[h] === "company_name")) fileErrors.push('Missing required column "company".');
  if (parsed.errors.length) fileErrors.push(...parsed.errors.slice(0, 5).map((e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`));
  if (parsed.data.length > CSV_MAX_ROWS) fileErrors.push(`Too many rows (${parsed.data.length}); the limit is ${CSV_MAX_ROWS}.`);
  if (fileErrors.length) return { rows: [], total: parsed.data.length, valid: 0, invalid: parsed.data.length, fileErrors, unknownColumns };

  const seen = new Map<string, number>();
  const rows: CsvRowResult[] = parsed.data.map((raw, i) => {
    const mapped: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      const target = HEADER_ALIASES[k];
      if (target && typeof v === "string") mapped[target] = v;
    }
    const errors: string[] = [];
    const res = LeadInputSchema.safeParse(mapped);
    if (!res.success) {
      for (const issue of res.error.issues) errors.push(`${issue.path.join(".") || "row"}: ${issue.message}`);
    }
    let data = res.success ? res.data : undefined;
    if (data?.website) {
      const w = normalizeWebsite(data.website);
      if (!w.ok) errors.push(`website: ${w.error}`);
      else data = { ...data, website: w.url };
    }
    if (data && !errors.length) {
      // One lead per company: a later row with the same company name or website domain is a duplicate.
      const keys = [`name:${data.company_name.trim().toLowerCase()}`];
      const host = data.website ? new URL(data.website).hostname.replace(/^www\./, "") : null;
      if (host) keys.push(`host:${host}`);
      const firstRow = keys.map((k) => seen.get(k)).find((r) => r !== undefined);
      if (firstRow !== undefined) errors.push(`Duplicate company: same name or website as row ${firstRow}.`);
      else keys.forEach((k) => seen.set(k, i + 1));
    }
    return { row: i + 1, valid: errors.length === 0, data: errors.length ? undefined : data, errors, raw };
  });
  const valid = rows.filter((r) => r.valid).length;
  return { rows, total: rows.length, valid, invalid: rows.length - valid, fileErrors, unknownColumns };
}
