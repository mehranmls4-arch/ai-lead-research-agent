import "./env";
import { eq } from "drizzle-orm";
import { closeDb, getDb, type DB } from "../src/lib/db/client";
import * as s from "../src/lib/db/schema";
import { DEFAULT_ICP } from "../src/lib/domain/icp";
import { DEMO_COMPANIES } from "../src/lib/fixtures/companies";
import { hashPassword } from "../src/lib/auth/password";
import { MockAIProvider } from "../src/lib/providers/ai/mock";
import { MockResearchProvider } from "../src/lib/providers/research/mock";
import { createOrReuseLead } from "../src/lib/services/leads";
import { enqueueRun, processQueueUntilIdle } from "../src/lib/services/queue";
import { getActiveIcp, saveIcp } from "../src/lib/services/icp";
import { approveDraft, markSent } from "../src/lib/services/outreach";
import { changeStage } from "../src/lib/services/stage";

/**
 * Seeds an admin + member user, the default ICP and the demo leads.
 * Every seeded lead is researched by the MockResearchProvider and is labelled demo.
 * Example Logistics is left un-analysed so the built-in demo can run it live.
 */
export async function seed(db: DB, opts: { log?: (m: string) => void } = {}) {
  const log = opts.log ?? (() => undefined);
  const email = process.env.SEED_ADMIN_EMAIL || "admin@novaflow.demo";
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 8) throw new Error("SEED_ADMIN_PASSWORD must be set (min 8 chars)");

  let [admin] = await db.select().from(s.users).where(eq(s.users.email, email));
  if (!admin) {
    [admin] = await db.insert(s.users).values({ email, name: "Admin (NovaFlow)", role: "admin", passwordHash: await hashPassword(password) }).returning();
    log(`Created admin ${email}`);
  }
  const memberEmail = email.replace(/^[^@]+/, "sdr");
  const [member] = await db.select().from(s.users).where(eq(s.users.email, memberEmail));
  if (!member) {
    await db.insert(s.users).values({ email: memberEmail, name: "Sales rep (NovaFlow)", role: "member", passwordHash: await hashPassword(password) });
    log(`Created member ${memberEmail}`);
  }
  const icp = await getActiveIcp(db);
  if (!icp.id) {
    await saveIcp(db, DEFAULT_ICP, admin.id);
    log("Saved default ICP");
  }

  const toAnalyze = DEMO_COMPANIES.filter((c) => c.key !== "example-logistics");
  for (const c of DEMO_COMPANIES) {
    const { leadId, created } = await createOrReuseLead(
      db,
      { company_name: c.company_name, website: c.website, contact_name: c.contact.name, contact_email: c.contact.email, title: c.contact.title, industry: undefined, country: undefined },
      { userId: admin.id, source: "seed" },
    );
    await db.update(s.leads).set({ isDemo: true }).where(eq(s.leads.id, leadId));
    if (created && toAnalyze.includes(c)) await enqueueRun(db, leadId, { userId: admin.id });
  }
  await processQueueUntilIdle(db, { latencyMs: 0, concurrency: 2, ai: new MockAIProvider(), research: new MockResearchProvider() });
  log("Analysed demo leads with mock providers");

  // A few human CRM actions so the pipeline shows later stages (clearly demo).
  const actor = { id: admin.id, name: admin.name };
  const meridian = await leadByName(db, "Meridian Health Admin Partners");
  if (meridian && meridian.stage === "outreach_drafted") {
    const drafts = await db.select().from(s.outreachDrafts).where(eq(s.outreachDrafts.leadId, meridian.id));
    const main = drafts.find((d) => d.channel === "email") ?? drafts[0];
    await approveDraft(db, main.id, actor, true);
    await markSent(db, main.id, actor);
    await changeStage(db, meridian.id, "replied", actor, "demo: prospect replied");
    log("Meridian → replied (demo human actions)");
  }
  return { adminEmail: email };
}

async function leadByName(db: DB, name: string) {
  const [r] = await db.select({ id: s.leads.id, stage: s.leads.stage }).from(s.leads).innerJoin(s.companies, eq(s.companies.id, s.leads.companyId)).where(eq(s.companies.name, name));
  return r;
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed(getDb(), { log: (m) => console.log(m) })
    .then(async ({ adminEmail }) => {
      console.log(`Seed complete. Sign in as ${adminEmail} with SEED_ADMIN_PASSWORD.`);
      await closeDb();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error("Seed failed:", e instanceof Error ? e.message : e);
      await closeDb();
      process.exit(1);
    });
}
