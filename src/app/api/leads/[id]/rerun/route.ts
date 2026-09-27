import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";
import { assertUuid, handle, HttpError, readJson, requireUser } from "@/lib/http";
import { enqueueRun, kickQueue } from "@/lib/services/queue";
import { logActivity } from "@/lib/services/activity";

/** Re-run research. force_outreach=true is the "Regenerate outreach" action. */
const Body = z.object({ force_outreach: z.boolean().default(false) });

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  assertUuid(id, "lead");
  const body = await readJson(req, Body);
  const db = getDb();
  const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, id));
  if (!lead) throw new HttpError(404, "Lead not found");
  const runId = await enqueueRun(db, id, { userId: user.uid, forceOutreach: body.force_outreach });
  await logActivity(db, {
    leadId: id,
    actorType: "human",
    actorId: user.uid,
    type: body.force_outreach ? "outreach_regenerate_requested" : "rerun_requested",
    message: `${user.name} requested ${body.force_outreach ? "outreach regeneration (full re-research, outreach forced)" : "a new research run"}.`,
  });
  kickQueue(db);
  return NextResponse.json({ runId }, { status: 202 });
});
