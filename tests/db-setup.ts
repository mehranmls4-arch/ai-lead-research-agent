import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export function testDb() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set; refusing to run integration tests against the dev database.");
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL.");
  return getDb(url);
}

/** Wipes all application tables between tests. Only ever called against TEST_DATABASE_URL. */
export async function resetTestDb() {
  const db = testDb();
  await db.execute(sql`
    truncate table
      tool_calls, agent_runs, research_reports, qualifications, lead_scores, buying_signals,
      pain_points, automation_opportunities, outreach_drafts, lead_activities, research_runs,
      campaign_leads, import_batches, campaigns, leads, contacts, companies, icp_configs, users
    restart identity cascade`);
  return db;
}
