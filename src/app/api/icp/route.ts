import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { IcpConfigSchema } from "@/lib/domain/icp";
import { handle, readJson, requireUser } from "@/lib/http";
import { getActiveIcp, saveIcp } from "@/lib/services/icp";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireUser();
  const { config } = await getActiveIcp(getDb());
  return NextResponse.json(config);
});

/** Admin only. Saved ICPs apply to subsequent research runs; existing results keep their ICP snapshot. */
export const PUT = handle(async (req: Request) => {
  const user = await requireUser("admin");
  const cfg = await readJson(req, IcpConfigSchema);
  const row = await saveIcp(getDb(), cfg, user.uid);
  return NextResponse.json({ ok: true, id: row.id });
});
