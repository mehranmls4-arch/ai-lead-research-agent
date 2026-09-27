import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { assertUuid, handle, HttpError, requireUser } from "@/lib/http";
import { getRunProgress } from "@/lib/services/queries";
import { kickQueue } from "@/lib/services/queue";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const { id } = await params;
  assertUuid(id, "run");
  const db = getDb();
  const p = await getRunProgress(db, id);
  if (!p) throw new HttpError(404, "Run not found");
  if (p.run.status === "queued") kickQueue(db);
  return NextResponse.json(p);
});
