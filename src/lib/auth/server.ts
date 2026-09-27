import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionSecret, SESSION_COOKIE, verifySession, type SessionUser } from "./session";

/** Current user from the session cookie (server components and route handlers). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value, getSessionSecret());
}

/** For server components: redirect to /login when there is no session. */
export async function requirePageUser(next = "/leads"): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}
