// Real payment detection through a zkool_graphql wallet server holding a WATCH-ONLY account
// (created from the demo wallet's uviewtest… UFVK with a birth height). It can see incoming notes
// and memos but cannot spend. Run zkool on localhost (or behind -j JWT); never expose seed accounts.
import type { Receipt, ZcashBackend } from "./zcash";

const POOLS: Record<number, string> = { 0: "transparent", 1: "sapling", 2: "orchard", 3: "ironwood" };
const SYNC_EVERY_MS = 10_000;

interface Note {
  pool: number;
  value: number | string; // decimal ZEC
  address?: string | null;
  scope: number; // 0 = received from someone else, 1 = change
  memo?: string | null;
}
interface Tx {
  txid: string;
  height: number | null;
  notes: Note[];
}

function config() {
  const url = process.env.ZKOOL_URL || "http://127.0.0.1:8000/graphql";
  const account = Number(process.env.ZKOOL_ACCOUNT_ID);
  const ua = process.env.ZCASH_RECEIVE_UA ?? "";
  if (!Number.isSafeInteger(account) || account < 1) throw new Error("ZKOOL_ACCOUNT_ID (the watch-only account) is not set");
  if (!/^utest1[0-9a-z]{20,}$/.test(ua)) throw new Error("ZCASH_RECEIVE_UA must be a utest1… unified address");
  return { url, account, ua, jwt: process.env.ZKOOL_JWT };
}

export async function zkoolQuery<T>(query: string, url = config().url, jwt = process.env.ZKOOL_JWT): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { data?: T; errors?: { message?: string }[] } | null;
  if (!res.ok || !body) throw new Error(`zkool request failed (${res.status})`);
  if (body.errors?.length) throw new Error(`zkool: ${String(body.errors[0].message ?? "error").slice(0, 160)}`);
  return body.data as T;
}

/** Convert a decimal-ZEC note value to zatoshis without float drift. */
export function zecToZatoshi(v: number | string): number {
  const s = typeof v === "number" ? v.toFixed(8) : v.trim();
  const m = /^(\d+)(?:\.(\d{1,8})\d*)?$/.exec(s);
  if (!m) return NaN;
  return Number(m[1]) * 100_000_000 + Number((m[2] ?? "").padEnd(8, "0"));
}

/** Turn zkool transactions into receipts for incoming (scope 0) notes only. */
export function toReceipts(txs: Tx[], currentHeight: number, ua: string): Receipt[] {
  const out: Receipt[] = [];
  for (const tx of txs) {
    const incoming = (tx.notes ?? []).filter((n) => n.scope === 0);
    if (!incoming.length) continue;
    const amountZat = incoming.reduce((sum, n) => sum + zecToZatoshi(n.value), 0);
    const pools = new Set(incoming.map((n) => POOLS[n.pool] ?? "unknown"));
    // Only a fully shielded receipt counts; prefer Ironwood (new funds), then Sapling.
    const pool = pools.has("transparent") || pools.has("unknown") ? "transparent" : pools.has("ironwood") ? "ironwood" : pools.has("sapling") ? "sapling" : [...pools][0];
    const memo = incoming.map((n) => n.memo).find((m) => typeof m === "string" && m.trim().length > 0) ?? null;
    const minedHeight = tx.height && tx.height > 0 ? tx.height : null;
    out.push({
      txid: tx.txid,
      recipient: ua, // every scope-0 note of the watched account was received at our address
      memo,
      amountZat,
      pool,
      minedHeight,
      confirmations: minedHeight ? Math.max(0, currentHeight - minedHeight + 1) : 0,
    });
  }
  return out;
}

const g = globalThis as unknown as { __zealedZkoolVerified?: string; __zealedZkoolLastSync?: number };

/** Fail closed: zkool must answer, and the address we hand out must belong to the watched account. */
async function verify() {
  const { url, account, ua, jwt } = config();
  const key = `${url}|${account}|${ua}`;
  if (g.__zealedZkoolVerified === key) return;
  const d = await zkoolQuery<{ currentHeight: number; addressByAccount: { ua: string } | null }>(
    `{ currentHeight addressByAccount(idAccount: ${account}) { ua } }`,
    url,
    jwt,
  );
  if (!(d.currentHeight > 0)) throw new Error("zkool has no chain height yet");
  if (d.addressByAccount?.ua !== ua && process.env.ZKOOL_ALLOW_UA_MISMATCH !== "1") {
    throw new Error("ZCASH_RECEIVE_UA does not belong to ZKOOL_ACCOUNT_ID");
  }
  g.__zealedZkoolVerified = key;
}

export const zkoolBackend: ZcashBackend = {
  name: "zkool",
  simulated: false,
  async receiveAddress() {
    await verify();
    return config().ua;
  },
  async poll() {
    await verify();
    const { url, account, ua, jwt } = config();
    if (Date.now() - (g.__zealedZkoolLastSync ?? 0) > SYNC_EVERY_MS) {
      await zkoolQuery(`mutation { synchronize(idAccounts: [${account}], fast: false) }`, url, jwt);
      g.__zealedZkoolLastSync = Date.now();
    }
    const d = await zkoolQuery<{ currentHeight: number; transactionsByAccount: Tx[] }>(
      `{ currentHeight transactionsByAccount(idAccount: ${account}) { txid height notes { pool value address scope memo } } }`,
      url,
      jwt,
    );
    return toReceipts(d.transactionsByAccount ?? [], d.currentHeight, ua);
  },
};
