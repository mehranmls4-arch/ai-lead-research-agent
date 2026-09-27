import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { getSessionSecret, SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/auth/session";
import { handle, HttpError, readJson } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";

const Body = z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().min(1).max(200) });

export const POST = handle(async (req: Request) => {
  if (!rateLimit(clientKey(req, "login"), 10, 60_000).ok) throw new HttpError(429, "Too many login attempts. Try again in a minute.");
  const { email, password } = await readJson(req, Body, 4096);
  const [u] = await getDb().select().from(users).where(eq(users.email, email));
  // Same error for unknown user and wrong password.
  if (!u || !(await verifyPassword(password, u.passwordHash))) throw new HttpError(401, "Invalid email or password");
  const token = await signSession({ uid: u.id, email: u.email, name: u.name, role: u.role }, getSessionSecret());
  const res = NextResponse.json({ ok: true, user: { name: u.name, role: u.role } });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true", path: "/", maxAge: SESSION_TTL_SECONDS });
  return res;
});
