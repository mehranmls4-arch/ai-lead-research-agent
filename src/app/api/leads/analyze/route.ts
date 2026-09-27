import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { LeadInputSchema } from "@/lib/domain/lead";
import { handle, HttpError, readJson, requireUser } from "@/lib/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { createOrReuseLead, LeadInputError } from "@/lib/services/leads";
import { enqueueRun, kickQueue } from "@/lib/services/queue";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  if (!rateLimit(`analyze:${user.uid}`, 30, 60_000).ok) throw new HttpError(429, "Too many analysis requests. Try again shortly.");
  const input = await readJson(req, LeadInputSchema);
  const db = getDb();
  try {
    const { leadId, created } = await createOrReuseLead(db, input, { userId: user.uid, source: "manual" });
    const runId = await enqueueRun(db, leadId, { userId: user.uid });
    kickQueue(db);
    return NextResponse.json({ leadId, runId, created }, { status: 202 });
  } catch (e) {
    if (e instanceof LeadInputError) throw new HttpError(422, e.message);
    throw e;
  }
});
