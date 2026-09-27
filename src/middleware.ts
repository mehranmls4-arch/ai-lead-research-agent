import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/auth/session";

const PUBLIC_API = ["/api/auth/login", "/api/health"];
const PROTECTED_PAGES = ["/leads", "/import", "/analytics", "/crm", "/settings", "/demo"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // CSRF defence for state-changing API calls: a browser-sent Origin must match this host.
  if (isApi && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (origin) {
      let ok = false;
      try {
        ok = new URL(origin).host === req.headers.get("host");
      } catch {
        ok = false;
      }
      if (!ok) return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
    }
  }

  const needsAuth = isApi ? !PUBLIC_API.includes(pathname) : PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!needsAuth) return NextResponse.next();

  const secret = process.env.SESSION_SECRET ?? "";
  const user = secret.length >= 32 ? await verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret) : null;
  if (user) return NextResponse.next();
  if (isApi) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/api/:path*", "/leads/:path*", "/import/:path*", "/analytics/:path*", "/crm/:path*", "/settings/:path*", "/demo/:path*"],
};
