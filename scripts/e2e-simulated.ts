// Dev end-to-end check against a running server (pnpm dev), with ZCASH_BACKEND=fake.
// Mints signed proposals like the agent does, then plays the browser: key, sealed phone,
// order, SIMULATED payment, wait for delivery, decrypt locally. Never makes a real purchase.
// Run: npx tsx --env-file=.env.local scripts/e2e-simulated.ts
import { getProduct, priceFor } from "../lib/bitrefill";
import { decodeContent } from "../lib/payload";
import { PROPOSAL_TTL_MS, signProposal, type Proposal } from "../lib/proposal";
import { generateKeyPair, open, seal } from "../lib/sodium";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";

async function run(name: string, input: Omit<Proposal, "v" | "sessionId" | "exp" | "priceCents">, phone?: string) {
  // Price exactly as the agent does (live catalog and BTC/USD rate), so the server's re-check agrees.
  const product = await getProduct(input.productId);
  const priceCents = product ? priceFor(product, input.packageValue) : null;
  if (priceCents == null) return console.log(`✗ ${name}: cannot price ${input.productId} ${input.packageValue}`);
  const p = { ...input, priceCents };
  const token = signProposal({ v: 1, sessionId: "e2e-simulated", exp: Date.now() + PROPOSAL_TTL_MS, ...p });
  const buyer = await generateKeyPair();
  let sealedPhone: string | undefined;
  if (phone) {
    const { publicKey } = await (await fetch(`${BASE}/api/fulfill-key`)).json();
    sealedPhone = await seal(phone, publicKey);
  }
  const res = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ proposalToken: token, buyerPubKey: buyer.publicKey, sealedPhone }),
  });
  const created = await res.json();
  if (!res.ok) return console.log(`✗ ${name}: create ${res.status} ${created.error}`);
  const id = created.order.id as string;
  console.log(`• ${name}: order ${id.slice(0, 8)} ${created.order.status}, ${created.zip321.slice(0, 60)}…`);

  const replay = await fetch(`${BASE}/api/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposalToken: token, buyerPubKey: buyer.publicKey, sealedPhone }) });
  console.log(`  replayed proposal -> ${replay.status} (expect 409)`);

  const sim = await (await fetch(`${BASE}/api/dev/simulate-payment/${id}`, { method: "POST" })).json();
  console.log(`  simulated payment ${String(sim.txid).slice(0, 20)}…`);

  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const { order } = await (await fetch(`${BASE}/api/orders/${id}`)).json();
    if (!seen.has(order.status)) {
      seen.add(order.status);
      console.log(`  status: ${order.status}`);
    }
    if (["delivered", "failed", "failed_uncertain", "expired"].includes(order.status)) {
      if (order.status !== "delivered") return console.log(`✗ ${name}: ${order.failure}`);
      if (order.type === "topup") return console.log(`✓ ${name}: delivered, phoneWiped=${order.phoneWiped}, bitrefill=${order.bitrefillOrderId}`);
      const c = decodeContent(await open(order.sealedPayload, buyer.publicKey, buyer.secretKey));
      const shown = c.kind === "esim" ? `lpa ${c.lpa.slice(0, 12)}…` : c.kind === "giftcard" ? `code ${c.code?.slice(0, 4)}•••` : c.kind;
      return console.log(`✓ ${name}: decrypted locally (${c.kind}: ${shown}) ${"instructions" in c ? c.instructions ?? "" : ""}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`✗ ${name}: timed out`);
}

async function main() {
  await run("top-up (auto)", { productId: "airtel-bundles-india", productName: "Airtel Bundles India", kind: "topup", packageValue: "199: ul calls + 2gb data", verdict: "ALLOW", approved: false }, "+919999999999");
  await run("eSIM (auto)", { productId: "bitrefill-esim-india", productName: "Bitrefill eSIM India", kind: "esim", packageValue: "1GB, 7 Days", verdict: "ALLOW", approved: false });
  await run("gift card (approved)", { productId: "flipkart-india", productName: "Flipkart India", kind: "giftcard", packageValue: "1000", verdict: "REQUIRE_HUMAN", approved: true });
  await run("gift card (NOT approved)", { productId: "flipkart-india", productName: "Flipkart India", kind: "giftcard", packageValue: "1000", verdict: "REQUIRE_HUMAN", approved: false });
}
main();
