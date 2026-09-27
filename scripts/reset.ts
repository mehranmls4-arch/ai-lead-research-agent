import "./env";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/lib/db/client";

/** Drops all application tables (development only). */
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database");
  const db = getDb();
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  console.log("Database reset.");
  await closeDb();
}
main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await closeDb();
  process.exit(1);
});
