import { z } from "zod";
import { CSV_MAX_BYTES } from "@/lib/engine/csv";

export const ImportBody = z.object({ filename: z.string().trim().max(200).default("import.csv"), csv: z.string().min(1, "CSV is empty").max(CSV_MAX_BYTES) });
export const IMPORT_MAX_BODY = CSV_MAX_BYTES + 4096;
