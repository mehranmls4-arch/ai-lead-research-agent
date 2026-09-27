import { getDb } from "@/lib/db/client";
import { listBatches } from "@/lib/services/imports";
import { CSV_MAX_ROWS } from "@/lib/engine/csv";
import { PageHeader } from "@/components/page-header";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "CSV import" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const { batch } = await searchParams;
  const batches = await listBatches(getDb());
  return (
    <>
      <PageHeader
        title="CSV import"
        description={`Upload up to ${CSV_MAX_ROWS} leads (1 MB). Rows are validated before anything is saved; invalid rows are reported and never processed. Valid rows are queued and researched a few at a time.`}
      />
      <ImportClient
        initialBatch={batch && /^[0-9a-f-]{36}$/i.test(batch) ? batch : null}
        recent={batches.map((b) => ({ id: b.id, filename: b.filename, total: b.total, valid: b.valid, invalid: b.invalid, createdAt: b.createdAt.toISOString() }))}
      />
    </>
  );
}
