import { and, eq, inArray, lt, ne, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import * as s from "../db/schema";
import { getConfig } from "../config";
import { runAgent } from "../agent/orchestrator";
import type { LeadContext } from "../agent/types";
import type { CrmStage } from "../domain/lead";
import { canTransition } from "../engine/crm";
import type { AIProvider } from "../providers/ai/types";
import type { ResearchProvider } from "../providers/research/types";
import { createAIProvider, createResearchProvider } from "../providers";
import { getActiveIcp } from "./icp";
import { DbCrmWriter, DbRunRecorder } from "./pipeline-store";
import { logActivity } from "./activity";

/**
 * research_runs doubles as a small DB-backed work queue. Rows are claimed with
 * FOR UPDATE SKIP LOCKED and at most LEAD_CONCURRENCY runs execute per process.
 */
export const ACTIVE_STATUSES = ["researching", "enriching", "qualifying", "scoring"] as const;
export const FINISHED_STATUSES = ["ready", "needs_review", "failed"] as const;
const STALE_MINUTES = 10;

export interface QueueOptions {
  concurrency?: number;
  latencyMs?: number;
  ai?: AIProvider;
  research?: ResearchProvider;
}

type QueueState = { active: number; waiters: (() => void)[] };
const g = globalThis as unknown as { __leadQueue?: QueueState };
function q(): QueueState {
  if (!g.__leadQueue) g.__leadQueue = { active: 0, waiters: [] };
  return g.__leadQueue;
}

export async function enqueueRun(
  db: DB,
  leadId: string,
  opts: { userId?: string | null; batchId?: string | null; forceOutreach?: boolean } = {},
): Promise<string> {
  const [pending] = await db
    .select({ id: s.researchRuns.id })
    .from(s.researchRuns)
    .where(and(eq(s.researchRuns.leadId, leadId), inArray(s.researchRuns.status, ["queued", ...ACTIVE_STATUSES])))
    .limit(1);
  if (pending) return pending.id; // never run the same lead twice concurrently
  const [run] = await db
    .insert(s.researchRuns)
    .values({ leadId, batchId: opts.batchId ?? null, forceOutreach: Boolean(opts.forceOutreach), requestedBy: opts.userId ?? null, status: "queued" })
    .returning({ id: s.researchRuns.id });
  await db.update(s.leads).set({ researchStatus: "queued", updatedAt: new Date() }).where(eq(s.leads.id, leadId));
  return run.id;
}

async function failStaleRuns(db: DB) {
  const stale = await db
    .update(s.researchRuns)
    .set({ status: "failed", error: "Interrupted (process restart or timeout).", finishedAt: new Date() })
    .where(and(inArray(s.researchRuns.status, [...ACTIVE_STATUSES]), lt(s.researchRuns.startedAt, sql`now() - make_interval(mins => ${STALE_MINUTES})`)))
    .returning({ leadId: s.researchRuns.leadId });
  for (const r of stale) await db.update(s.leads).set({ researchStatus: "failed" }).where(eq(s.leads.id, r.leadId));
}

async function claimNext(db: DB): Promise<{ id: string; leadId: string; forceOutreach: boolean } | null> {
  const rows = await db.execute<{ id: string; lead_id: string; force_outreach: boolean }>(sql`
    UPDATE research_runs SET status = 'researching', started_at = now()
    WHERE id = (
      SELECT id FROM research_runs WHERE status = 'queued' ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING id, lead_id, force_outreach`);
  const r = rows[0];
  return r ? { id: r.id, leadId: r.lead_id, forceOutreach: r.force_outreach } : null;
}

/** Starts queued runs up to the concurrency limit. Safe to call often (fire-and-forget). */
export function kickQueue(db: DB, opts: QueueOptions = {}) {
  void drain(db, opts).catch((e) => console.error("[queue] drain failed:", e instanceof Error ? e.message : e));
}

async function drain(db: DB, opts: QueueOptions) {
  const st = q();
  const limit = opts.concurrency ?? getConfig().LEAD_CONCURRENCY;
  if (st.active === 0) await failStaleRuns(db);
  while (st.active < limit) {
    st.active++; // reserve the slot before the async claim so concurrent drains cannot exceed the limit
    let run: Awaited<ReturnType<typeof claimNext>> = null;
    try {
      run = await claimNext(db);
    } catch (e) {
      st.active--;
      throw e;
    }
    if (!run) {
      st.active--;
      break;
    }
    executeRun(db, run, opts)
      .catch(() => undefined)
      .finally(() => {
        st.active--;
        void drain(db, opts).catch(() => undefined);
        notifyIdle();
      });
  }
  notifyIdle();
}

function notifyIdle() {
  const st = q();
  if (st.active === 0) {
    const w = st.waiters.splice(0);
    w.forEach((f) => f());
  }
}

/** Processes the queue until nothing is queued or running (used by seed and tests). */
export async function processQueueUntilIdle(db: DB, opts: QueueOptions = {}) {
  for (let i = 0; i < 1000; i++) {
    await new Promise<void>((resolve) => {
      q().waiters.push(resolve);
      kickQueue(db, opts);
    });
    const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(s.researchRuns).where(eq(s.researchRuns.status, "queued"));
    if (left.n === 0 && q().active === 0) return;
  }
}

export async function executeRun(db: DB, run: { id: string; leadId: string; forceOutreach: boolean }, opts: QueueOptions = {}) {
  const cfg = getConfig();
  const ai = opts.ai ?? createAIProvider(cfg);
  const research = opts.research ?? createResearchProvider(cfg);
  const [row] = await db
    .select({ lead: s.leads, company: s.companies, contact: s.contacts })
    .from(s.leads)
    .innerJoin(s.companies, eq(s.companies.id, s.leads.companyId))
    .leftJoin(s.contacts, eq(s.contacts.id, s.leads.contactId))
    .where(eq(s.leads.id, run.leadId));
  if (!row) throw new Error("Lead not found for run");

  const [agentRun] = await db.insert(s.agentRuns).values({ researchRunId: run.id, leadId: run.leadId, aiProvider: ai.name }).returning({ id: s.agentRuns.id });
  await db.update(s.researchRuns).set({ aiProvider: ai.name, researchProvider: research.name, isDemo: research.isDemo }).where(eq(s.researchRuns.id, run.id));

  let stage = row.lead.stage as CrmStage;
  if (canTransition(stage, "researching", "ai").ok) {
    await db.update(s.leads).set({ stage: "researching", updatedAt: new Date() }).where(eq(s.leads.id, run.leadId));
    stage = "researching";
  }
  await logActivity(db, {
    leadId: run.leadId,
    actorType: "ai",
    type: "research_started",
    message: `Research started (research: ${research.name}${research.isDemo ? " — demo data" : ""}, AI: ${ai.name}).`,
    meta: { research_run_id: run.id },
  });

  const ctx: LeadContext = {
    lead_id: run.leadId,
    company_name: row.company.name,
    website: row.company.website,
    contact: row.contact ? { name: row.contact.name, email: row.contact.email, title: row.contact.title } : null,
    input_industry: row.lead.inputIndustry,
    input_country: row.lead.inputCountry,
    stage,
    force_outreach: run.forceOutreach,
  };
  const icp = await getActiveIcp(db);
  const others = await db.select({ name: s.companies.name }).from(s.companies).where(ne(s.companies.id, row.company.id)).limit(500);

  try {
    const state = await runAgent(ctx, {
      ai,
      research,
      icp: icp.config,
      recorder: new DbRunRecorder(db, agentRun.id, run.id, run.leadId),
      crm: new DbCrmWriter(db, run.id, icp.config),
      knownCompanyNames: others.map((o) => o.name),
      latencyMs: opts.latencyMs ?? (research.isDemo || ai.isMock ? cfg.MOCK_LATENCY_MS : 0),
    });
    await db.update(s.researchRuns).set({ finishedAt: new Date(), notes: state.notes.slice(0, 50), isDemo: state.isDemo }).where(eq(s.researchRuns.id, run.id));
    await db.update(s.agentRuns).set({ status: "completed", finishedAt: new Date() }).where(eq(s.agentRuns.id, agentRun.id));
    await db.update(s.leads).set({ isDemo: state.isDemo }).where(eq(s.leads.id, run.leadId));
    await db.update(s.companies).set({ isDemo: state.isDemo }).where(eq(s.companies.id, row.company.id));
    return state;
  } catch (e) {
    const msg = safeError(e);
    await db.update(s.researchRuns).set({ status: "failed", error: msg, finishedAt: new Date() }).where(eq(s.researchRuns.id, run.id));
    await db.update(s.agentRuns).set({ status: "failed", finishedAt: new Date() }).where(eq(s.agentRuns.id, agentRun.id));
    await db.update(s.leads).set({ researchStatus: "failed", updatedAt: new Date() }).where(eq(s.leads.id, run.leadId));
    await logActivity(db, { leadId: run.leadId, actorType: "system", type: "research_failed", message: `Research failed: ${msg}`, meta: { research_run_id: run.id } });
    throw e;
  }
}

/** Error text shown to users: no stack traces, secrets or raw provider payloads. */
export function safeError(e: unknown): string {
  const m = e instanceof Error ? e.message : "Unknown error";
  return m.replace(/(sk-|Bearer\s+)[A-Za-z0-9_\-]+/g, "$1[redacted]").slice(0, 300);
}
