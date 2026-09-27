import { NextResponse } from "next/server";
import { parseLeadCsv } from "@/lib/engine/csv";
import { handle, readJson, requireUser } from "@/lib/http";
import { IMPORT_MAX_BODY, ImportBody } from "../schema";

export const POST = handle(async (req: Request) => {
  await requireUser();
  const { csv } = await readJson(req, ImportBody, IMPORT_MAX_BODY);
  const r = parseLeadCsv(csv);
  return NextResponse.json({
    total: r.total,
    valid: r.valid,
    invalid: r.invalid,
    fileErrors: r.fileErrors,
    unknownColumns: r.unknownColumns,
    rows: r.rows.map((x) => ({ row: x.row, valid: x.valid, errors: x.errors, data: x.data ?? null, raw: x.raw })),
  });
});
