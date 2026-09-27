import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { CrmStageSchema } from "@/lib/domain/lead";
import { assertUuid, handle, HttpError, readJson, requireUser } from "@/lib/http";
import { changeStage, StageError } from "@/lib/services/stage";

const Body = z.object({ stage: CrmStageSchema, note: z.string().trim().max(300).optional() });

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  assertUuid(id, "lead");
  const body = await readJson(req, Body);
  try {
    const stage = await changeStage(getDb(), id, body.stage, { id: user.uid, name: user.name }, body.note);
    return NextResponse.json({ stage });
  } catch (e) {
    if (e instanceof StageError) throw new HttpError(e.message === "Lead not found" ? 404 : 409, e.message);
    throw e;
  }
});
