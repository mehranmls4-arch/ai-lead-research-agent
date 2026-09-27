import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { assertUuid, handle, HttpError, readJson, requireUser } from "@/lib/http";
import { approveDraft, editDraft, markSent, OutreachError, rejectDraft } from "@/lib/services/outreach";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), acknowledge_warnings: z.boolean().default(false) }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("edit"), subject: z.string().trim().max(200).nullable().optional(), body: z.string().trim().min(1).max(5000) }),
  z.object({ action: z.literal("send") }),
]);

export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  assertUuid(id, "draft");
  const body = await readJson(req, Body);
  const db = getDb();
  const actor = { id: user.uid, name: user.name };
  try {
    switch (body.action) {
      case "approve":
        await approveDraft(db, id, actor, body.acknowledge_warnings);
        return NextResponse.json({ ok: true });
      case "reject":
        await rejectDraft(db, id, actor, body.reason);
        return NextResponse.json({ ok: true });
      case "edit":
        return NextResponse.json({ ok: true, validation: await editDraft(db, id, actor, { subject: body.subject, body: body.body }) });
      case "send":
        await markSent(db, id, actor);
        return NextResponse.json({ ok: true });
    }
  } catch (e) {
    if (e instanceof OutreachError) throw new HttpError(e.status, e.message);
    throw e;
  }
});
