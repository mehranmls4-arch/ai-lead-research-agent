import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = getConfig();
  let db = false;
  try {
    await getDb().execute(sql`select 1`);
    db = true;
  } catch {
    db = false;
  }
  return NextResponse.json({ ok: db, db, ai_provider: cfg.AI_PROVIDER, research_provider: cfg.RESEARCH_PROVIDER }, { status: db ? 200 : 503 });
}
