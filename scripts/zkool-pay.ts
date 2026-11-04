// Pays an order from the zkool payer account: a real shielded testnet transaction with the order's
// exact amount and memo. Prints the txid and explorer link (the submission's testnet txid).
// Run: npx tsx --env-file=.env.local scripts/zkool-pay.ts <orderId>
import { zkoolQuery } from "../lib/zcash-zkool";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const URL = process.env.ZKOOL_URL || "http://127.0.0.1:8000/graphql";

async function main() {
  const orderId = process.argv[2];
  const payer = Number(process.env.ZKOOL_PAYER_ID);
  if (!orderId) throw new Error("usage: zkool-pay.ts <orderId>");
  if (!Number.isSafeInteger(payer) || payer < 1) throw new Error("ZKOOL_PAYER_ID is not set (run scripts/zkool-setup.ts)");

  const res = await fetch(`${BASE}/api/orders/${encodeURIComponent(orderId)}`);
  const data = (await res.json()) as { order?: { payAddr: string; amountZat: number; status: string }; memo?: string; simulatedPayment?: boolean; error?: string };
  if (!res.ok || !data.order || !data.memo) throw new Error(data.error ?? "order not found");
  if (data.simulatedPayment) throw new Error("the server is using the SIMULATED backend; set ZCASH_BACKEND=zkool and restart");
  if (data.order.status !== "awaiting_payment") throw new Error(`order is ${data.order.status}`);

  const amount = (data.order.amountZat / 1e8).toFixed(8);
  // Sync the spending account first, or a second pay fails with "No feasible note selection found".
  await zkoolQuery(`mutation { synchronize(idAccounts: [${payer}], fast: false) }`, URL);
  const d = await zkoolQuery<{ pay: string }>(
    `mutation { pay(idAccount: ${payer}, payment: { recipients: [{ address: ${JSON.stringify(data.order.payAddr)}, amount: ${amount}, memo: ${JSON.stringify(data.memo)} }], confirmations: 1 }) }`,
    URL,
  );
  console.log(`txid ${d.pay}\nhttps://zexplorer.app/testnet/tx/${d.pay}`);
}

main().catch((e) => {
  console.error(`pay failed: ${(e as Error).message}`);
  process.exit(1);
});
