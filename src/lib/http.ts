import { NextResponse } from "next/server";
import type { z } from "zod";
import { getSessionUser } from "./auth/server";
import type { SessionUser } from "./auth/session";

export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly details?: unknown) {
    super(message);
  }
}

export const MAX_JSON_BYTES = 64 * 1024;

export async function readJson<T>(req: Request, schema: z.ZodType<T>, maxBytes = MAX_JSON_BYTES): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes) throw new HttpError(413, "Request body too large");
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new HttpError(413, "Request body too large");
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new HttpError(422, "Validation failed", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return parsed.data;
}

export async function requireUser(role?: "admin"): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new HttpError(401, "Authentication required");
  if (role === "admin" && u.role !== "admin") throw new HttpError(403, "Admin role required");
  return u;
}

/** Wraps a route handler: maps HttpError to JSON and hides unexpected error details. */
export function handle<C = undefined>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx?: C): Promise<Response> => {
    try {
      return await fn(req, ctx as C);
    } catch (e) {
      if (e instanceof HttpError) {
        return NextResponse.json({ error: e.message, details: e.details }, { status: e.status, headers: e.status === 429 ? { "Retry-After": "60" } : undefined });
      }
      console.error("[api] unexpected error:", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function assertUuid(s: string, what = "id") {
  if (!isUuid(s)) throw new HttpError(404, `Unknown ${what}`);
}
