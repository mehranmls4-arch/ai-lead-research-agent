import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { assertUuid, handle, HttpError, requireUser } from "@/lib/http";
import { getBatchStatus } from "@/lib/services/imports";
import { kickQueue } from "@/lib/services/queue";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ batchId: string }> }) => {
  await requireUser();
  const { batchId } = await params;
  assertUuid(batchId, "import");
  const db = getDb();
  const st = await getBatchStatus(db, batchId);
  if (!st) throw new HttpError(404, "Import not found");
  if (!st.done) kickQueue(db);
  return NextResponse.json(st);
});
