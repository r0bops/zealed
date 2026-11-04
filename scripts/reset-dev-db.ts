// Clears orders, the agent log and cached/simulated state from the local DB (dev and pre-demo).
// Listings are kept. Run: npx tsx --env-file=.env.local scripts/reset-dev-db.ts
import { openDb } from "../lib/db/client";

const db = openDb();
const sqlite = db.$client;
const counts = {
  orders: sqlite.prepare("DELETE FROM orders").run().changes,
  agent_events: sqlite.prepare("DELETE FROM agent_events").run().changes,
  kv: sqlite.prepare("DELETE FROM kv WHERE key NOT LIKE 'bitrefill:%'").run().changes,
};
console.log("cleared", counts);
