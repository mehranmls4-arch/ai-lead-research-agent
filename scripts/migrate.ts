import "./env";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, getDb } from "../src/lib/db/client";

async function main() {
  const url = process.argv[2] === "--test" ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
  if (!url) throw new Error("Database URL not set");
  await migrate(getDb(url), { migrationsFolder: "drizzle" });
  console.log(`Migrations applied (${new URL(url).pathname.slice(1)}).`);
  await closeDb();
}

main().catch(async (e) => {
  console.error("Migration failed:", e instanceof Error ? e.message : e);
  await closeDb();
  process.exit(1);
});
