// Payment detection adapter. The watcher only ever sees Receipts; how they're found is backend-specific.
import { kvGet, kvSet } from "./orders";

export interface Receipt {
  txid: string;
  recipient: string;
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
  recipient: string;
}
const FAKE_KEY = "zcash:fake:receipts";
const FAKE_MINE_AFTER_MS = 8_000;

export const fakeBackend: ZcashBackend = {
  name: "fake",
  simulated: true,
  async receiveAddress() {
    assertSimulationAllowed();
    return process.env.ZCASH_RECEIVE_UA || "utest1simulated0000000000000000000000000000000000000000000";
  },
  async poll() {
    assertSimulationAllowed();
    const list = kvGet<FakeReceipt[]>(FAKE_KEY) ?? [];
    const t = Date.now();
    return list.map((r) => {
      const mined = t - r.seenAt >= FAKE_MINE_AFTER_MS;
      return {
        txid: r.txid,
        memo: r.memo,
        recipient: r.recipient,
        amountZat: r.amountZat,
        pool: "simulated",
        minedHeight: mined ? 1_000_000 : null,
        confirmations: mined ? 1 : 0,
      };
    });
  },
};

export function simulatePayment(memo: string, amountZat: number): string {
  assertSimulationAllowed();
  const list = kvGet<FakeReceipt[]>(FAKE_KEY) ?? [];
  const txid = `SIMULATED-${crypto.randomUUID().replace(/-/g, "")}`;
  list.push({ txid, memo, amountZat, seenAt: Date.now(), recipient: process.env.ZCASH_RECEIVE_UA || "utest1simulated0000000000000000000000000000000000000000000" });
  kvSet(FAKE_KEY, list.slice(-50));
  return txid;
}

export function assertSimulationAllowed() {
  if (process.env.NODE_ENV === "production" || (process.env.ZCASH_BACKEND ?? "fake") !== "fake") {
    throw new Error("Simulated payments are disabled");
  }
}

export async function zcash(): Promise<ZcashBackend> {
  if ((process.env.ZCASH_NETWORK ?? "testnet") !== "testnet") throw new Error("Only testnet is supported");
  if (!Number.isSafeInteger(MIN_CONFIRMATIONS) || MIN_CONFIRMATIONS < 1) throw new Error("Invalid confirmation threshold");
  const which = process.env.ZCASH_BACKEND ?? "fake";
  if (which === "fake") { assertSimulationAllowed(); return fakeBackend; }
  // Real detection: a watch-only zkool_graphql account. It verifies itself (reachable, address
  // belongs to the watched account) before any checkout is created or receipt is trusted.
  if (which === "zkool") return (await import("./zcash-zkool")).zkoolBackend;
  // Fail before generating a checkout for an adapter that cannot verify payments.
  throw new Error("Real Zcash payment backend is not configured and verified");
}
