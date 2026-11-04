// Public health check: is the payment watcher alive and is the watch-only wallet synced?
// Returns only liveness numbers: no addresses, keys, balances, txids, order counts or env values.
// 200 when healthy, 503 otherwise, so an uptime monitor can watch it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { rateLimit } from "@/lib/rate-limit";
import { watcherStatus } from "@/lib/watcher-status";
import { zkoolQuery } from "@/lib/zcash-zkool";

export const dynamic = "force-dynamic";

const ZKOOL_CACHE_MS = 10_000; // one zkool query per 10 s at most, however often this is called
const ZKOOL_TIMEOUT_MS = 3_000;
const TICK_STALE_MS = 60_000; // the watcher ticks every few seconds
const MAX_LAG_BLOCKS = 20;

type ZkoolHealth = { chainHeight: number | null; accountHeight: number | null; lagBlocks: number | null };
const NO_ZKOOL: ZkoolHealth = { chainHeight: null, accountHeight: null, lagBlocks: null };
const g = globalThis as unknown as { __zealedHealthZkool?: { at: number; value: ZkoolHealth }; __zealedRevision?: string | null };

function revision(): string | null {
  if (g.__zealedRevision !== undefined) return g.__zealedRevision;
  const candidates = [process.env.REVISION_FILE, join(process.cwd(), "REVISION"), join(process.cwd(), "..", "REVISION"), "/opt/zealed/app/REVISION"];
  let rev: string | null = null;
  for (const file of candidates) {
    if (!file || !existsSync(file)) continue;
    const text = readFileSync(file, "utf8").trim();
    if (/^[0-9a-f]{7,40}$/.test(text)) { rev = text; break; }
  }
  return (g.__zealedRevision = rev);
}

async function zkoolHealth(): Promise<ZkoolHealth> {
  if ((process.env.ZCASH_BACKEND ?? "fake") !== "zkool") return NO_ZKOOL;
  const cached = g.__zealedHealthZkool;
  if (cached && Date.now() - cached.at < ZKOOL_CACHE_MS) return cached.value;
  let value = NO_ZKOOL;
  try {
    const account = Number(process.env.ZKOOL_ACCOUNT_ID);
    // Ask only for id and height: the accounts object also carries fields we must never read.
    const d = await Promise.race([
      zkoolQuery<{ currentHeight: number; accounts: { id: number; height: number }[] }>("{ currentHeight accounts { id height } }"),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ZKOOL_TIMEOUT_MS)),
    ]);
    const acc = d.accounts?.find((a) => a.id === account);
    const chainHeight = Number.isSafeInteger(d.currentHeight) ? d.currentHeight : null;
    const accountHeight = acc && Number.isSafeInteger(acc.height) ? acc.height : null;
    value = { chainHeight, accountHeight, lagBlocks: chainHeight !== null && accountHeight !== null ? Math.max(0, chainHeight - accountHeight) : null };
  } catch {
    value = NO_ZKOOL;
  }
  g.__zealedHealthZkool = { at: Date.now(), value };
  return value;
}

export async function GET(req: Request) {
  const limited = rateLimit(req, "health", 30, 60_000);
  if (limited) return limited;
  const backend = process.env.ZCASH_BACKEND ?? "fake";
  const w = watcherStatus();
  const zkool = await zkoolHealth();
  const ticking = w.lastTickAt !== null && Date.now() - w.lastTickAt <= TICK_STALE_MS;
  const synced = backend !== "zkool" || (zkool.lagBlocks !== null && zkool.lagBlocks <= MAX_LAG_BLOCKS);
  const ok = w.startedAt !== null && ticking && !w.lastError && synced;
  const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString());
  return Response.json(
    { ok, revision: revision(), backend, watcher: { startedAt: iso(w.startedAt), lastTickAt: iso(w.lastTickAt), lastError: w.lastError }, zkool },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
