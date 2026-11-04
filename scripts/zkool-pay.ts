// Pays an order from the zkool payer account: a real shielded testnet transaction with the order's
// exact amount and memo. Prints the txid and explorer link (the submission's testnet txid).
// Run: npx tsx --env-file=.env.local scripts/zkool-pay.ts <orderId>
//  or: npx tsx --env-file=.env.local scripts/zkool-pay.ts 'zcash:utest1…?amount=…&memo=…'
// (the ZIP-321 URI form works for sponsored reward orders, whose status needs the player's secret)
import { zkoolQuery } from "../lib/zcash-zkool";
import { decodeBase64UrlNoPad } from "../lib/zip321";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const ZKOOL = process.env.ZKOOL_URL || "http://127.0.0.1:8000/graphql";

async function main() {
  const orderId = process.argv[2];
  const payer = Number(process.env.ZKOOL_PAYER_ID);
  if (!orderId) throw new Error("usage: zkool-pay.ts <orderId | zcash:URI>");
  if (!Number.isSafeInteger(payer) || payer < 1) throw new Error("ZKOOL_PAYER_ID is not set (run scripts/zkool-setup.ts)");

  let to: string, amount: string, memo: string;
  if (orderId.startsWith("zcash:")) {
    // ZIP-321: zcash:<address>?amount=<zec>&memo=<base64url>
    const [address, query = ""] = orderId.slice("zcash:".length).split("?");
    const params = new URLSearchParams(query);
    to = address;
    amount = Number(params.get("amount")).toFixed(8);
    memo = decodeBase64UrlNoPad(params.get("memo") ?? "");
    if (!/^utest1[0-9a-z]+$/.test(to) || !(Number(amount) > 0) || !memo) throw new Error("invalid zcash: payment URI");
  } else {
    const res = await fetch(`${BASE}/api/orders/${encodeURIComponent(orderId)}`);
    const data = (await res.json()) as { order?: { payAddr: string; amountZat: number; status: string }; memo?: string; simulatedPayment?: boolean; error?: string };
    if (!res.ok || !data.order || !data.memo) throw new Error(`${data.error ?? "order not found"} (for a sponsored reward order, pass its zcash: URI instead)`);
    if (data.simulatedPayment) throw new Error("the server is using the SIMULATED backend; set ZCASH_BACKEND=zkool and restart");
    if (data.order.status !== "awaiting_payment") throw new Error(`order is ${data.order.status}`);
    ({ payAddr: to } = data.order);
    amount = (data.order.amountZat / 1e8).toFixed(8);
    memo = data.memo;
  }
  // Sync the spending account first, or a second pay fails with "No feasible note selection found".
  await zkoolQuery(`mutation { synchronize(idAccounts: [${payer}], fast: false) }`, ZKOOL);
  const d = await zkoolQuery<{ pay: string }>(
    `mutation { pay(idAccount: ${payer}, payment: { recipients: [{ address: ${JSON.stringify(to)}, amount: ${amount}, memo: ${JSON.stringify(memo)} }], confirmations: 1 }) }`,
    ZKOOL,
  );
  console.log(`txid ${d.pay}\nhttps://zexplorer.app/testnet/tx/${d.pay}`);
}

main().catch((e) => {
  console.error(`pay failed: ${(e as Error).message}`);
  process.exit(1);
});
