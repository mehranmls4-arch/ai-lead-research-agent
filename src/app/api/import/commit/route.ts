import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { handle, HttpError, readJson, requireUser } from "@/lib/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { commitImport, ImportError } from "@/lib/services/imports";
import { kickQueue } from "@/lib/services/queue";
import { IMPORT_MAX_BODY, ImportBody } from "../schema";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  if (!rateLimit(`import:${user.uid}`, 5, 60_000).ok) throw new HttpError(429, "Too many imports. Try again shortly.");
  const { csv, filename } = await readJson(req, ImportBody, IMPORT_MAX_BODY);
  const db = getDb();
  try {
    const { batchId, parsed } = await commitImport(db, csv, filename, user.uid);
    kickQueue(db);
    return NextResponse.json({ batchId, total: parsed.total, valid: parsed.valid, invalid: parsed.invalid }, { status: 202 });
  } catch (e) {
    if (e instanceof ImportError) throw new HttpError(422, e.message);
    throw e;
  }
});
