// Real end-to-end check against a running server on ZCASH_BACKEND=zkool:
// signed proposal → browser key → order → REAL shielded testnet payment from the zkool payer
// account (exact amount + memo) → watcher sees it confirm → fulfillment → local decryption.
// Bitrefill buys for real only if BITREFILL_PURCHASES=test|live on the server; otherwise simulated.
// Run: npx tsx --env-file=.env.local scripts/e2e-real.ts [productId] [packageValue]
import { getProduct, priceFor } from "../lib/bitrefill";
import { decodeContent } from "../lib/payload";
import { PROPOSAL_TTL_MS, signProposal } from "../lib/proposal";
import { generateKeyPair, open } from "../lib/sodium";
import { zkoolQuery } from "../lib/zcash-zkool";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const ZKOOL = process.env.ZKOOL_URL || "http://127.0.0.1:8000/graphql";
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s`;

async function main() {
  const productId = process.argv[2] ?? "bitrefill-esim-india";
  const packageValue = process.argv[3] ?? "1GB, 7 Days";
  const payer = Number(process.env.ZKOOL_PAYER_ID);
  if (!Number.isSafeInteger(payer) || payer < 1) throw new Error("ZKOOL_PAYER_ID is not set");

  const product = await getProduct(productId);
  const priceCents = product ? priceFor(product, packageValue) : null;
  if (!product || priceCents == null) throw new Error(`cannot price ${productId} ${packageValue}`);
  if (product.kind === "topup") throw new Error("pick a product without a phone number for this script");

  const token = signProposal({
    v: 1, sessionId: "e2e-real", productId, productName: product.name, kind: product.kind,
    packageValue, priceCents, verdict: "ALLOW", approved: false, exp: Date.now() + PROPOSAL_TTL_MS,
  });
  const buyer = await generateKeyPair();
  const res = await fetch(`${BASE}/api/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposalToken: token, buyerPubKey: buyer.publicKey }) });
  const created = await res.json();
  if (!res.ok) throw new Error(`order: ${res.status} ${created.error}`);
  if (created.simulatedPayment) throw new Error("server is on the SIMULATED backend; set ZCASH_BACKEND=zkool and restart");
  const order = created.order as { id: string; payAddr: string; amountZat: number };
  console.log(`${at()} order ${order.id} for ${product.name} · ${packageValue} · $${(priceCents / 100).toFixed(2)} → ${(order.amountZat / 1e8).toFixed(8)} TAZ`);

  await zkoolQuery(`mutation { synchronize(idAccounts: [${payer}], fast: false) }`, ZKOOL);
  const amount = (order.amountZat / 1e8).toFixed(8);
  const { pay: txid } = await zkoolQuery<{ pay: string }>(
    `mutation { pay(idAccount: ${payer}, payment: { recipients: [{ address: ${JSON.stringify(order.payAddr)}, amount: ${amount}, memo: ${JSON.stringify(created.memo)} }], confirmations: 1 }) }`,
    ZKOOL,
  );
  console.log(`${at()} paid from zkool payer #${payer}: txid ${txid}\n      https://zexplorer.app/testnet/tx/${txid}`);

  let last = "";
  for (let i = 0; i < 120; i++) {
    const { order: o } = await (await fetch(`${BASE}/api/orders/${order.id}`)).json();
    if (o.status !== last) {
      last = o.status;
      console.log(`${at()} status: ${o.status}${o.txid ? ` (txid ${String(o.txid).slice(0, 12)}…, height ${o.minedHeight ?? "-"})` : ""}`);
    }
    if (o.status === "delivered") {
      const c = decodeContent(await open(o.sealedPayload, buyer.publicKey, buyer.secretKey));
      const shown = c.kind === "esim" ? `LPA ${c.lpa.slice(0, 14)}…` : c.kind === "giftcard" ? `code ${c.code?.slice(0, 4)}•••` : c.kind;
      console.log(`${at()} ✓ decrypted locally: ${c.kind} (${shown}) ${"instructions" in c ? c.instructions ?? "" : ""}\n      bitrefill order ${o.bitrefillOrderId}`);
      return;
    }
    if (["failed", "failed_uncertain", "expired"].includes(o.status)) throw new Error(`${o.status}: ${o.failure}`);
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error("timed out waiting for delivery");
}

main().catch((e) => {
  console.error(`${at()} ✗ ${(e as Error).message}`);
  process.exit(1);
});
