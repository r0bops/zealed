// Payment detection adapter. The watcher only ever sees Receipts; how they're found is backend-specific.
import { kvGet, kvSet } from "./orders";

export interface Receipt {
  txid: string;
  memo: string | null; // decoded UTF-8 memo text
  amountZat: number;
  pool?: string; // e.g. "ironwood", "orchard", "sapling"
  minedHeight: number | null; // null = seen in mempool only
  confirmations: number;
}

export interface ZcashBackend {
  readonly name: string;
  /** true for the dev-only fake backend; the UI shows a SIMULATED badge. */
  readonly simulated: boolean;
  receiveAddress(): Promise<string>;
  /** Recent incoming shielded receipts (any order; the watcher matches and dedupes). */
  poll(): Promise<Receipt[]>;
}

export const MIN_CONFIRMATIONS = Number(process.env.ZCASH_MIN_CONFIRMATIONS ?? 1);

// ---------------------------------------------------------------- fake (dev only)
interface FakeReceipt {
  txid: string;
  memo: string;
  amountZat: number;
  seenAt: number;
}
const FAKE_KEY = "zcash:fake:receipts";
const FAKE_MINE_AFTER_MS = 8_000;

export const fakeBackend: ZcashBackend = {
  name: "fake",
  simulated: true,
  async receiveAddress() {
    return process.env.ZCASH_RECEIVE_UA || "utest1simulated0000000000000000000000000000000000000000000";
  },
  async poll() {
    const list = kvGet<FakeReceipt[]>(FAKE_KEY) ?? [];
    const t = Date.now();
    return list.map((r) => {
      const mined = t - r.seenAt >= FAKE_MINE_AFTER_MS;
      return {
        txid: r.txid,
        memo: r.memo,
        amountZat: r.amountZat,
        pool: "simulated",
        minedHeight: mined ? 1_000_000 : null,
        confirmations: mined ? 1 : 0,
      };
    });
  },
};

export function simulatePayment(memo: string, amountZat: number): string {
  const list = kvGet<FakeReceipt[]>(FAKE_KEY) ?? [];
  const txid = `SIMULATED-${crypto.randomUUID().replace(/-/g, "")}`;
  list.push({ txid, memo, amountZat, seenAt: Date.now() });
  kvSet(FAKE_KEY, list.slice(-50));
  return txid;
}

// ---------------------------------------------------------------- selection
let backend: ZcashBackend | null = null;

export async function zcash(): Promise<ZcashBackend> {
  if (backend) return backend;
  const which = process.env.ZCASH_BACKEND ?? "fake";
  if (which === "fake") backend = fakeBackend;
  else if (which === "zingo") backend = (await import("./zcash-zingo")).zingoBackend;
  else throw new Error(`unknown ZCASH_BACKEND: ${which}`);
  return backend;
}
