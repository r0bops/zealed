import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const g = globalThis as unknown as { __zealedDb?: DB };

export function openDb(path = process.env.DATABASE_PATH ?? "./data/zealed.db"): DB {
  const file = resolve(path);
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(schema.BOOTSTRAP_SQL);
  return drizzle(sqlite, { schema }) as DB;
}

/** Process-wide singleton (survives Next.js dev hot reloads). */
export function db(): DB {
  if (!g.__zealedDb) g.__zealedDb = openDb();
  return g.__zealedDb;
}

export { schema };
