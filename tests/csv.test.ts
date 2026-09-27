import { describe, expect, it } from "vitest";
import { CSV_MAX_ROWS, parseLeadCsv } from "@/lib/engine/csv";

const header = "company,website,contact_name,contact_email,title\n";

describe("CSV parsing and validation", () => {
  it("accepts a valid CSV and normalises websites", () => {
    const r = parseLeadCsv(header + "Acme Freight,acmefreight.com,Dana Lee,dana@acmefreight.com,COO\nBeta Dental,https://betadental.com/,,,\n");
    expect(r.fileErrors).toEqual([]);
    expect(r.valid).toBe(2);
    expect(r.rows[0].data).toMatchObject({ company_name: "Acme Freight", website: "https://acmefreight.com/", contact_email: "dana@acmefreight.com" });
  });
  it("accepts header aliases, BOM and extra whitespace", () => {
    const r = parseLeadCsv("\uFEFFName , URL, Email\n Acme ,acme.com, a@acme.com \n");
    expect(r.valid).toBe(1);
    expect(r.rows[0].data?.company_name).toBe("Acme");
  });
  it("reports invalid emails", () => {
    const r = parseLeadCsv(header + "Acme,acme.com,Dana,not-an-email,COO\n");
    expect(r.invalid).toBe(1);
    expect(r.rows[0].errors.join()).toMatch(/email/i);
  });
  it("reports invalid and internal URLs", () => {
    const r = parseLeadCsv(header + "A,http://localhost:3000,,,\nB,ftp://b.com,,,\nC,http://10.0.0.5,,,\nD,http://metadata.google.internal,,,\n");
    expect(r.valid).toBe(0);
    expect(r.rows.every((x) => x.errors.some((e) => e.startsWith("website")))).toBe(true);
  });
  it("reports missing company names without dropping the row", () => {
    const r = parseLeadCsv(header + ",acme.com,Dana,dana@acme.com,COO\n");
    expect(r.total).toBe(1);
    expect(r.invalid).toBe(1);
    expect(r.rows[0].errors.join()).toMatch(/company/i);
  });
  it("flags duplicate companies by name or website", () => {
    const r = parseLeadCsv(header + "Acme,acme.com,,,\nACME,,,,\nOther Name,https://www.acme.com/,,,\nBeta,beta.com,,,\n");
    expect(r.rows.map((x) => x.valid)).toEqual([true, false, false, true]);
    expect(r.rows[1].errors[0]).toMatch(/Duplicate company.*row 1/);
  });
  it("rejects files without a company column and malformed rows", () => {
    expect(parseLeadCsv("foo,bar\n1,2\n").fileErrors.join()).toMatch(/Missing required column/);
    const m = parseLeadCsv(header + 'Acme,"acme.com,Dana\n');
    expect(m.fileErrors.length + m.invalid).toBeGreaterThan(0);
  });
  it("enforces the row limit", () => {
    const rows = Array.from({ length: CSV_MAX_ROWS + 1 }, (_, i) => `Co ${i},,,,`).join("\n");
    expect(parseLeadCsv(header + rows).fileErrors.join()).toMatch(/Too many rows/);
  });
});
