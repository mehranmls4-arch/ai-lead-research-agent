import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __leadDb?: { db: DB; sql: postgres.Sql; url: string } };

export function getDb(url = process.env.DATABASE_URL): DB {
  if (!url) throw new Error("DATABASE_URL is not set");
  if (globalForDb.__leadDb && globalForDb.__leadDb.url === url) return globalForDb.__leadDb.db;
  const client = postgres(url, { max: 10, onnotice: () => undefined });
  const db = drizzle(client, { schema });
  globalForDb.__leadDb = { db, sql: client, url };
  return db;
}

export async function closeDb() {
  if (globalForDb.__leadDb) {
    await globalForDb.__leadDb.sql.end({ timeout: 5 });
    globalForDb.__leadDb = undefined;
  }
}

export { schema };
