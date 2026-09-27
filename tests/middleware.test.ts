import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { middleware } from "@/middleware";
import { SESSION_COOKIE, signSession } from "@/lib/auth/session";

const SECRET = "middleware-test-secret-32-chars-ok!";
const req = (path: string, init: { method?: string; origin?: string; cookie?: string; host?: string } = {}) => {
  const host = init.host ?? "app.example.com";
  const headers = new Headers();
  if (init.origin) headers.set("origin", init.origin);
  if (init.cookie) headers.set("cookie", init.cookie);
  headers.set("host", host);
  return new NextRequest(`https://${host}${path}`, { method: init.method ?? "GET", headers });
};

describe("middleware — authentication", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
  });

  it("lets an unauthenticated GET to a public page through unchanged", async () => {
    const res = await middleware(req("/"));
    expect(res.status).toBe(200);
  });

  it("redirects an unauthenticated request for a protected page to /login with a next param", async () => {
    const res = await middleware(req("/leads/new"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/leads/new");
  });

  it("returns 401 JSON for an unauthenticated protected API call, not a redirect", async () => {
    const res = await middleware(req("/api/icp"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Authentication required" });
  });

  it("lets the public login and health API routes through with no session", async () => {
    expect((await middleware(req("/api/auth/login", { method: "POST" }))).status).toBe(200);
    expect((await middleware(req("/api/health"))).status).toBe(200);
  });

  it("passes a request with a valid session cookie", async () => {
    const token = await signSession({ uid: "u1", email: "a@b.com", name: "A", role: "member" }, SECRET);
    const res = await middleware(req("/leads", { cookie: `${SESSION_COOKIE}=${token}` }));
    expect(res.status).toBe(200);
  });

  it("treats a tampered session cookie as unauthenticated", async () => {
    const token = await signSession({ uid: "u1", email: "a@b.com", name: "A", role: "member" }, SECRET);
    const tampered = token.slice(0, -4) + "abcd";
    const res = await middleware(req("/api/icp", { cookie: `${SESSION_COOKIE}=${tampered}` }));
    expect(res.status).toBe(401);
  });

  it("treats a session signed with a different secret as unauthenticated", async () => {
    const token = await signSession({ uid: "u1", email: "a@b.com", name: "A", role: "member" }, "a-totally-different-secret-32-ch");
    const res = await middleware(req("/api/icp", { cookie: `${SESSION_COOKIE}=${token}` }));
    expect(res.status).toBe(401);
  });

  it("treats a missing SESSION_SECRET as unauthenticated rather than throwing", async () => {
    process.env.SESSION_SECRET = "";
    const res = await middleware(req("/api/icp"));
    expect(res.status).toBe(401);
  });
});

describe("middleware — CSRF (cross-origin state-changing requests)", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
  });

  it("rejects a cross-origin POST even to the public login endpoint", async () => {
    const res = await middleware(req("/api/auth/login", { method: "POST", origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("allows a same-origin POST", async () => {
    const res = await middleware(req("/api/auth/login", { method: "POST", origin: "https://app.example.com" }));
    expect(res.status).toBe(200);
  });

  it("allows a state-changing request with no Origin header at all (non-browser clients)", async () => {
    const res = await middleware(req("/api/auth/login", { method: "POST" }));
    expect(res.status).toBe(200);
  });

  it("does not apply the CSRF check to safe GET requests", async () => {
    const res = await middleware(req("/api/health", { origin: "https://evil.example" }));
    expect(res.status).toBe(200);
  });
});
