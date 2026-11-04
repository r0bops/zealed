// Real end-to-end check of the mission-rewards flow against a running server on ZCASH_BACKEND=zkool:
// organizer creates a campaign → player answers the mission with a fresh key → the agent selects a perk →
// sponsor approves → REAL shielded payment from the zkool payer → watcher confirms → Bitrefill buys
// (test products with BITREFILL_PURCHASES=test) → the player decrypts locally.
// Run: npx tsx --env-file=.env.local scripts/e2e-rewards.ts [connectivity|gift]
// In email-list mode (MISSION_MODE=email) the player claims with E2E_ATTENDEE_EMAIL (default bob@example.org from
// demo/luma-guests-demo.csv); each attendee claims once per event, so use a different listed email per run.
import { randomBytes } from "node:crypto";
import { attendeeHashBrowser } from "../lib/attendee-hash";
import { decodeContent } from "../lib/payload";
import { generateKeyPair, open } from "../lib/sodium";
import { zkoolQuery } from "../lib/zcash-zkool";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const ZKOOL = process.env.ZKOOL_URL || "http://127.0.0.1:8000/graphql";
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s`;

async function call<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data.error ?? ""}`);
  return data;
}

async function main() {
  const purpose = process.argv[2] === "gift" ? "gift" : "connectivity";
  const admin = process.env.CAMPAIGN_ADMIN_TOKEN ?? "";
  const payer = Number(process.env.ZKOOL_PAYER_ID);
  if (admin.length < 32) throw new Error("CAMPAIGN_ADMIN_TOKEN is not set");
  if (!Number.isSafeInteger(payer) || payer < 1) throw new Error("ZKOOL_PAYER_ID is not set");

  // 1. Organizer creates a single-use campaign.
  const camp = await call<{ id: string; token: string }>("POST", "/api/campaigns", admin, {
    title: "Zealed e2e mission",
    budgetCents: 500,
    country: "IN",
    productIds: ["bitrefill-esim-india", "flipkart-india"],
  });
  console.log(`${at()} campaign ${camp.id}`);

  // 2. Player opens the invitation and answers the mission with a fresh key and claim secret.
  const invite = await call<{ mission: { question: string; options: string[] }; missionMode?: string; attendeeEventId?: string }>("GET", `/api/campaigns/${camp.id}`, camp.token);
  const answer = invite.mission.options.findIndex((o) => /exact shielded payment is confirmed/i.test(o));
  const player = await generateKeyPair();
  const secret = randomBytes(32).toString("base64url");
  let claim: { id: string; state: string; attendee?: string };
  if (invite.missionMode === "email") {
    const email = process.env.E2E_ATTENDEE_EMAIL ?? "bob@example.org";
    const emailHash = await attendeeHashBrowser(invite.attendeeEventId!, email); // what the browser sends: the hash only
    claim = await call("POST", `/api/campaigns/${camp.id}/claim`, camp.token, { emailHash, publicKey: player.publicKey, secret });
    console.log(`${at()} claim ${claim.id} (${claim.state}); approved attendee, anonymous ID "Attendee ${claim.attendee}" (email never sent)`);
  } else {
    claim = await call("POST", `/api/campaigns/${camp.id}/claim`, camp.token, { answer, publicKey: player.publicKey, secret });
    console.log(`${at()} claim ${claim.id} (${claim.state}); mission answered: "${invite.mission.options[answer]}"`);
  }

  // 3. The agent selects a perk within the campaign policy.
  await call("POST", `/api/claims/${claim.id}/select`, secret, { purpose, days: 7, esimCompatible: true });
  const picked = await call<{ state: string; choice: { productName: string; packageValue: string; priceCents: number; reason: string } }>("GET", `/api/claims/${claim.id}`, secret);
  console.log(`${at()} agent picked ${picked.choice.productName} · ${picked.choice.packageValue} · $${(picked.choice.priceCents / 100).toFixed(2)}: ${picked.choice.reason}`);

  // 4. Sponsor approves: this creates the order and the shielded payment request.
  const { payment } = await call<{ payment: { id: string; to: string; amountZec: string; memo: string; simulated: boolean } }>("POST", `/api/campaigns/${camp.id}/approve`, admin);
  if (payment.simulated) throw new Error("server is on the SIMULATED backend");
  console.log(`${at()} sponsor approved: order ${payment.id}, ${payment.amountZec} TAZ`);

  // 5. Sponsor pays from the zkool payer account (real shielded testnet transaction).
  await zkoolQuery(`mutation { synchronize(idAccounts: [${payer}], fast: false) }`, ZKOOL);
  const { pay: txid } = await zkoolQuery<{ pay: string }>(
    `mutation { pay(idAccount: ${payer}, payment: { recipients: [{ address: ${JSON.stringify(payment.to)}, amount: ${payment.amountZec}, memo: ${JSON.stringify(payment.memo)} }], confirmations: 1 }) }`,
    ZKOOL,
  );
  console.log(`${at()} sponsor paid: txid ${txid}`);

  // 6. Player follows the order with the claim secret and decrypts locally.
  let last = "";
  for (let i = 0; i < 120; i++) {
    const { order: o } = await call<{ order: { status: string; minedHeight: number | null; sealedPayload: string | null; bitrefillOrderId: string | null; failure: string | null } }>(
      "GET",
      `/api/orders/${payment.id}`,
      secret,
    );
    if (o.status !== last) console.log(`${at()} status: ${(last = o.status)}${o.minedHeight ? ` (height ${o.minedHeight})` : ""}`);
    if (o.status === "delivered" && o.sealedPayload) {
      const c = decodeContent(await open(o.sealedPayload, player.publicKey, player.secretKey));
      const shown = c.kind === "esim" ? `LPA ${c.lpa.slice(0, 14)}…` : c.kind === "giftcard" ? `code ${c.code?.slice(0, 4)}•••` : c.kind;
      console.log(`${at()} ✓ player decrypted locally: ${c.kind} (${shown}) ${"instructions" in c ? c.instructions ?? "" : ""}\n      bitrefill order ${o.bitrefillOrderId}`);
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
