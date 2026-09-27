import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { DEFAULT_ICP } from "@/lib/domain/icp";
import { hashPassword } from "@/lib/auth/password";
import { createOrReuseLead } from "@/lib/services/leads";
import { leadInput } from "./helpers";
import { executeRun } from "@/lib/services/queue";
import { saveIcp } from "@/lib/services/icp";
import { MockAIProvider } from "@/lib/providers/ai/mock";
import { MockResearchProvider } from "@/lib/providers/research/mock";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";

// This file lets the actual route handlers run (they call the argument-less getDb()),
// so DATABASE_URL is deliberately repointed at TEST_DATABASE_URL for this process only.
// Guarded so it can never silently fall back to wiping a real development database.
const DEV_URL = process.env.DATABASE_URL;
const TEST_URL = process.env.TEST_DATABASE_URL;
if (!TEST_URL) throw new Error("TEST_DATABASE_URL is not set; refusing to run API route tests.");
if (DEV_URL && DEV_URL === TEST_URL) throw new Error("TEST_DATABASE_URL must not equal the original DATABASE_URL.");

async function resetRouteTestDb() {
  const db = getDb(TEST_URL);
  await db.execute(sql`
    truncate table
      tool_calls, agent_runs, research_reports, qualifications, lead_scores, buying_signals,
      pain_points, automation_opportunities, outreach_drafts, lead_activities, research_runs,
      campaign_leads, import_batches, campaigns, leads, contacts, companies, icp_configs, users
    restart identity cascade`);
  return db;
}

vi.mock("@/lib/auth/server", () => ({ getSessionUser: vi.fn() }));
import { getSessionUser } from "@/lib/auth/server";

const asUser = (u: SessionUser | null) => vi.mocked(getSessionUser).mockResolvedValue(u);
const jsonReq = (url: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const admin: SessionUser = { uid: "", email: "admin@test.local", name: "Admin", role: "admin", exp: 9999999999 };
const member: SessionUser = { uid: "", email: "member@test.local", name: "Member", role: "member", exp: 9999999999 };

let db: Awaited<ReturnType<typeof resetRouteTestDb>>;

beforeEach(async () => {
  process.env.DATABASE_URL = TEST_URL;
  db = await resetRouteTestDb();
  const [a] = await db.insert(s.users).values({ email: admin.email, name: admin.name, role: "admin", passwordHash: await hashPassword("test-password-1") }).returning();
  const [m] = await db.insert(s.users).values({ email: member.email, name: member.name, role: "member", passwordHash: await hashPassword("test-password-2") }).returning();
  admin.uid = a.id;
  member.uid = m.id;
  await saveIcp(db, DEFAULT_ICP, a.id);
  vi.resetModules();
});

describe("POST /api/auth/login", () => {
  it("returns 200 and sets a session cookie for correct credentials", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(jsonReq("https://app.test/api/auth/login", "POST", { email: admin.email, password: "test-password-1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/nf_session=/);
  });
  it("returns 401 for a wrong password without revealing which part was wrong", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(jsonReq("https://app.test/api/auth/login", "POST", { email: admin.email, password: "wrong" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Invalid email or password");
  });
  it("returns 401 for an unknown email with the same message", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(jsonReq("https://app.test/api/auth/login", "POST", { email: "nobody@test.local", password: "whatever" }));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/health", () => {
  it("reports ok:true and the configured providers", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ ok: true, db: true });
  });
});

describe("POST /api/leads/analyze", () => {
  it("rejects unauthenticated requests", async () => {
    asUser(null);
    const { POST } = await import("@/app/api/leads/analyze/route");
    const res = await POST(jsonReq("https://app.test/api/leads/analyze", "POST", { company_name: "Acme" }));
    expect(res.status).toBe(401);
  });
  it("rejects invalid input with 422 and field details", async () => {
    asUser(admin);
    const { POST } = await import("@/app/api/leads/analyze/route");
    const res = await POST(jsonReq("https://app.test/api/leads/analyze", "POST", { website: "https://acme.com" }));
    expect(res.status).toBe(422);
    expect((await res.json()).details[0].path).toBe("company_name");
  });
  it("accepts a valid lead and queues a run", async () => {
    asUser(admin);
    const { POST } = await import("@/app/api/leads/analyze/route");
    const res = await POST(jsonReq("https://app.test/api/leads/analyze", "POST", { company_name: "Acme Freight", website: "https://acme.com" }));
    expect(res.status).toBe(202);
    const j = await res.json();
    expect(j.leadId).toBeTruthy();
    expect(j.runId).toBeTruthy();
  });
  it("rejects a private/internal website (SSRF guard applied at the API boundary)", async () => {
    asUser(admin);
    const { POST } = await import("@/app/api/leads/analyze/route");
    const res = await POST(jsonReq("https://app.test/api/leads/analyze", "POST", { company_name: "Acme", website: "http://169.254.169.254/" }));
    expect(res.status).toBe(422);
  });
});

describe("POST /api/leads/[id]/stage", () => {
  it("rejects an invalid CRM transition with 409", async () => {
    asUser(admin);
    const { leadId } = await createOrReuseLead(db, leadInput({ company_name: "Acme Freight", website: "https://acme.com" }), { userId: admin.uid, source: "manual" });
    const { POST } = await import("@/app/api/leads/[id]/stage/route");
    const res = await POST(jsonReq("https://app.test/x", "POST", { stage: "won" }), { params: Promise.resolve({ id: leadId }) });
    expect(res.status).toBe(409);
  });
  it("returns 404 for a non-existent lead id", async () => {
    asUser(admin);
    const { POST } = await import("@/app/api/leads/[id]/stage/route");
    const res = await POST(jsonReq("https://app.test/x", "POST", { stage: "qualified" }), { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }) });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/outreach/[id]", () => {
  async function seedDraft() {
    const { leadId } = await createOrReuseLead(db, leadInput({ company_name: "Meridian Health Admin Partners", website: "https://meridianhealthadmin.example" }), { userId: admin.uid, source: "manual" });
    const [run] = await db.insert(s.researchRuns).values({ leadId, status: "queued" }).returning();
    await executeRun(db, { id: run.id, leadId, forceOutreach: false }, { ai: new MockAIProvider(), research: new MockResearchProvider(), latencyMs: 0 });
    const [draft] = await db.select().from(s.outreachDrafts).where(and(eq(s.outreachDrafts.leadId, leadId), eq(s.outreachDrafts.channel, "email")));
    return draft.id;
  }
  it("rejects approval of a draft that has not passed validation, without acknowledgement", async () => {
    asUser(admin);
    const id = await seedDraft();
    const { PATCH } = await import("@/app/api/outreach/[id]/route");
    // Force a needs-review state via an edit with no personalisation first.
    await PATCH(jsonReq("https://app.test/x", "PATCH", { action: "edit", subject: "Hi", body: "Generic message with no company name." }), { params: Promise.resolve({ id }) });
    const res = await PATCH(jsonReq("https://app.test/x", "PATCH", { action: "approve" }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(409);
  });
  it("approves, then rejects a second approval attempt on an already-approved draft", async () => {
    asUser(admin);
    const id = await seedDraft();
    const { PATCH } = await import("@/app/api/outreach/[id]/route");
    const ok = await PATCH(jsonReq("https://app.test/x", "PATCH", { action: "approve" }), { params: Promise.resolve({ id }) });
    expect(ok.status).toBe(200);
    const again = await PATCH(jsonReq("https://app.test/x", "PATCH", { action: "approve" }), { params: Promise.resolve({ id }) });
    expect(again.status).toBe(409);
  });
  it("rejects malformed action bodies with 422", async () => {
    asUser(admin);
    const id = await seedDraft();
    const { PATCH } = await import("@/app/api/outreach/[id]/route");
    const res = await PATCH(jsonReq("https://app.test/x", "PATCH", { action: "nonsense" }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(422);
  });
});

describe("CSV import routes", () => {
  it("POST /api/import/validate reports valid/invalid counts without saving anything", async () => {
    asUser(admin);
    const { POST } = await import("@/app/api/import/validate/route");
    const res = await POST(jsonReq("https://app.test/x", "POST", { csv: "company,website\nAcme,acme.com\n,bad\n" }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.valid).toBe(1);
    expect(j.invalid).toBe(1);
    expect(await db.$count(s.leads)).toBe(0);
  });
  it("POST /api/import/commit creates a batch and queues valid rows; GET reports status", async () => {
    asUser(admin);
    const { POST } = await import("@/app/api/import/commit/route");
    const res = await POST(jsonReq("https://app.test/x", "POST", { csv: "company,website\nAcme Freight,acme.com\n", filename: "t.csv" }));
    expect(res.status).toBe(202);
    const { batchId } = await res.json();
    const { GET } = await import("@/app/api/import/[batchId]/route");
    const status = await GET(new Request("https://app.test/x"), { params: Promise.resolve({ batchId }) });
    expect(status.status).toBe(200);
    expect((await status.json()).counts.total).toBe(1);
  });
});

describe("ICP routes: admin vs member", () => {
  it("GET is available to any authenticated user", async () => {
    asUser(member);
    const { GET } = await import("@/app/api/icp/route");
    expect((await GET(new Request("https://app.test/api/icp"))).status).toBe(200);
  });
  it("PUT is rejected for a member with 403", async () => {
    asUser(member);
    const { PUT } = await import("@/app/api/icp/route");
    const res = await PUT(jsonReq("https://app.test/x", "PUT", DEFAULT_ICP));
    expect(res.status).toBe(403);
  });
  it("PUT succeeds for an admin with a valid config and rejects an invalid one", async () => {
    asUser(admin);
    const { PUT } = await import("@/app/api/icp/route");
    expect((await PUT(jsonReq("https://app.test/x", "PUT", DEFAULT_ICP))).status).toBe(200);
    const bad = { ...DEFAULT_ICP, criteria_weights: { ...DEFAULT_ICP.criteria_weights, industry: 999 } };
    expect((await PUT(jsonReq("https://app.test/x", "PUT", bad))).status).toBe(422);
  });
});
