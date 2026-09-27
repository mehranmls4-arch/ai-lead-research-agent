import { eq, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import * as s from "../db/schema";
import { parseLeadCsv, type CsvParseResult } from "../engine/csv";
import { createOrReuseLead } from "./leads";
import { enqueueRun } from "./queue";

export class ImportError extends Error {}

/** Validates, then creates leads for valid rows and queues them. Invalid rows are recorded, not processed. */
export async function commitImport(db: DB, csvText: string, filename: string, userId: string | null): Promise<{ batchId: string; parsed: CsvParseResult }> {
  const parsed = parseLeadCsv(csvText);
  if (parsed.fileErrors.length) throw new ImportError(parsed.fileErrors.join(" "));
  if (!parsed.valid) throw new ImportError("No valid rows to import.");
  const name = filename.replace(/[^\w.\- ]/g, "").slice(0, 120) || "import.csv";
  const [campaign] = await db.insert(s.campaigns).values({ name: `Import: ${name}`, description: `${parsed.valid} lead(s) imported from CSV`, createdBy: userId }).returning();
  const [batch] = await db
    .insert(s.importBatches)
    .values({
      filename: name,
      total: parsed.total,
      valid: parsed.valid,
      invalid: parsed.invalid,
      errors: parsed.rows.filter((r) => !r.valid).map((r) => ({ row: r.row, errors: r.errors })),
      campaignId: campaign.id,
      createdBy: userId,
    })
    .returning();
  for (const row of parsed.rows) {
    if (!row.valid || !row.data) continue;
    const { leadId } = await createOrReuseLead(db, row.data, { userId, source: "csv" });
    await db.insert(s.campaignLeads).values({ campaignId: campaign.id, leadId }).onConflictDoNothing();
    await enqueueRun(db, leadId, { userId, batchId: batch.id });
  }
  return { batchId: batch.id, parsed };
}

export interface BatchStatus {
  id: string;
  filename: string;
  createdAt: string;
  counts: { total: number; valid: number; invalid: number; queued: number; processing: number; completed: number; needs_review: number; failed: number };
  errors: { row: number; errors: string[] }[];
  rows: { run_id: string; lead_id: string; company: string; contact: string | null; status: string; lead_score: number | null; icp_match: string | null; error: string | null }[];
  done: boolean;
}

export async function getBatchStatus(db: DB, batchId: string): Promise<BatchStatus | null> {
  const [batch] = await db.select().from(s.importBatches).where(eq(s.importBatches.id, batchId));
  if (!batch) return null;
  const rows = await db
    .select({
      run_id: s.researchRuns.id,
      lead_id: s.leads.id,
      company: s.companies.name,
      contact: s.contacts.name,
      status: s.researchRuns.status,
      lead_score: s.leads.leadScore,
      icp_match: s.leads.icpMatch,
      error: s.researchRuns.error,
    })
    .from(s.researchRuns)
    .innerJoin(s.leads, eq(s.leads.id, s.researchRuns.leadId))
    .innerJoin(s.companies, eq(s.companies.id, s.leads.companyId))
    .leftJoin(s.contacts, eq(s.contacts.id, s.leads.contactId))
    .where(eq(s.researchRuns.batchId, batchId))
    .orderBy(s.researchRuns.createdAt);
  const c = { queued: 0, processing: 0, completed: 0, needs_review: 0, failed: 0 };
  for (const r of rows) {
    if (r.status === "queued") c.queued++;
    else if (r.status === "ready") c.completed++;
    else if (r.status === "needs_review") {
      c.completed++;
      c.needs_review++;
    } else if (r.status === "failed") c.failed++;
    else c.processing++;
  }
  return {
    id: batch.id,
    filename: batch.filename,
    createdAt: batch.createdAt.toISOString(),
    counts: { total: batch.total, valid: batch.valid, invalid: batch.invalid, ...c },
    errors: batch.errors,
    rows,
    done: c.queued === 0 && c.processing === 0,
  };
}

export async function listBatches(db: DB) {
  return db
    .select({ id: s.importBatches.id, filename: s.importBatches.filename, total: s.importBatches.total, valid: s.importBatches.valid, invalid: s.importBatches.invalid, createdAt: s.importBatches.createdAt, runs: sql<number>`(select count(*)::int from research_runs r where r.batch_id = ${s.importBatches.id})` })
    .from(s.importBatches)
    .orderBy(sql`${s.importBatches.createdAt} desc`)
    .limit(10);
}
