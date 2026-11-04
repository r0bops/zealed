# Zealed: buy gift cards, eSIMs and top-ups without exposing the code

Tracks: Privacy (Zcash) and Agentic Commerce (Bitrefill), Free Society Hack, Mumbai, 4–5 Nov 2026.

**Problem:** Gift card codes and eSIM QR codes leak through platforms, agent logs and breaches, and a leaked code gets drained in seconds. Resale sites are full of stolen and already-used cards. Top-up services store millions of phone numbers.

**Solution:** What you buy is encrypted on your own device. Zealed's database, its logs and its AI agent only ever hold unreadable data. Only the buyer can open a code. Phone numbers for top-ups are used once for fulfillment and then deleted. A shielded ZEC payment authorises each purchase, and Zealed then pays Bitrefill from its own credit balance, within fixed caps.

**One-line pitch:** Zealed's AI shopping agent gets anyone gift cards, eSIMs and phone top-ups, with a shielded ZEC payment authorising each purchase. The code is encrypted on your device, so our database, our logs and our AI never see it in readable form.

## What stays hidden from whom

| Type | Secret | Never stored or logged readable by | Who can read it |
| --- | --- | --- | --- |
| Gift card (resold) | the code | Zealed's server and database, the agent, logs | the seller and the buyer |
| Gift card or eSIM (Bitrefill) | the code or eSIM activation string | Zealed's database, the agent, logs | Bitrefill (the issuer) and the buyer. Zealed's fulfillment function holds it in memory only while sealing it |
| Top-up | the phone number | Zealed's database, the agent, logs | Bitrefill. Zealed's fulfillment function decrypts it only to place the order, then wipes it |

On-chain, a shielded payment hides the sender, the amount and the memo.

## How the encryption works

- **Buyer key:** at checkout, the buyer's browser makes an X25519 key pair with libsodium. The private key stays in IndexedDB, with an exportable backup string, and only the public key goes to the server. Both parties' screens show a short fingerprint of the public key, so a swapped key would be visible.
- **Resold gift cards:** the seller types the code when listing. It's kept only in the seller's IndexedDB and never sent. When an order arrives, the seller's browser seals the code to the buyer's public key with `crypto_box_seal`. The server stores only that encrypted blob.
- **Bitrefill gift cards and eSIMs:** `lib/fulfill.ts` is a deterministic function, not the LLM. It receives Bitrefill's response and immediately seals the code, link or eSIM activation string to the buyer's public key. The plain value is never logged, never stored and never sent to the LLM. The buyer's browser renders eSIM QR codes locally.
- **Top-ups:** the buyer's browser seals the number to the fulfillment public key (`GET /api/fulfill-key`). After payment, `fulfill.ts` decrypts it, sends it to Bitrefill and wipes it (`sealedPhone = null`, `wipedAt = now`). Zealed keeps only the Bitrefill order ID.
- **Release:** the server returns the sealed blob only after payment is confirmed, and the buyer's browser decrypts it locally. Zealed is trusted to be *fair*, by releasing only after payment, but not trusted with the *secret*.

## The agent's job (it never sees secrets)

The agent is an LLM using the AI SDK, with narrow tools. Tool inputs are identifiers and metadata only, and tool outputs never contain codes, phone numbers or keys.

| Tool | What it does |
| --- | --- |
| `search_catalog` | Searches the cached Bitrefill catalog (country `IN`), returning products, packages and USD prices |
| `check_listing` | Fraud check on a resold listing using metadata only: price vs. face value, seller history, duplicate fingerprints |
| `propose_order` | Creates a draft order for a product and package after a guardrail check. The UI then shows a checkout card. The buyer types any phone number into that card, not into the chat, and the browser encrypts it |
| `get_order_status` | Returns status only, such as `awaiting_payment` or `delivered` |

- The agent never gets raw Bitrefill purchase or order tools.
- The purchase itself happens in `fulfill.ts` once payment is confirmed. The agent starts it, and a deterministic function carries it out.
- Every tool call and result is stored in `agent_events`, which is the "agent log" in the demo. It contains only IDs, metadata and ciphertext.

## Guardrails (required by the Agentic Commerce track)

A pure function, `lib/guardrails.ts`, returns `ALLOW`, `REQUIRE_HUMAN` or `BLOCK`:
- Orders up to **$5** go through automatically.
- **$5 to $20** needs the buyer to click "Approve" on the checkout card.
- Over **$20** is blocked.
- Agent orders are capped at **$25 a day** in total.

Hard limits on spending:
- Zealed calls Bitrefill only after a confirmed shielded payment for the quoted amount.
- There's at most one Bitrefill purchase per order, enforced by an atomic status claim. It's never retried blindly after a timeout.
- Quotes expire after 15 minutes.
- Bitrefill's account caps of 5 top-ups and 15 gift cards a day also apply.

The most the agent can ever spend is the Zealed Bitrefill balance, which holds only event credits. Above $20, nobody can approve; the operator would raise the limit in config.

## Payments

- Payments are **shielded ZEC on NU7 testnet**, to a unified address (`utest1…`). Each order gets a ZIP-321 URI and QR code: `zcash:<ua>?amount=<zec>&memo=<base64url(memoTag)>`. The memo is a short random order reference.
- **Matching:** a receipt matches an order when the memo, the amount and the receiving address all match. A browser-supplied txid never counts as payment.
- **States:** `payment_seen` (mempool, if the backend exposes it) → `paid` (mined, with 1 confirmation on testnet).
- **Detection backend:** `lib/zcash.ts` has an adapter interface. The real backend is zingo-cli/zingolib or CipherPay; that decision is pending a live NU7 check. There's also a `fake` backend for development only. It shows a **SIMULATED** badge in the UI and is never used in the demo.
- **Authorises, doesn't pay:** for Bitrefill products, the shielded payment *authorises* the purchase and Zealed pays Bitrefill from event credits. Bitrefill doesn't take ZEC and has no testnet. Both track files treat a claim that shielded ZEC pays for the card as a faked step. Say "authorises" in the pitch, the README and the video, never "pays for".
- **Pricing:** TAZ is worthless, so the demo uses a fixed `ZEC_USD_RATE`, and the README says so. Zealed fronts the Bitrefill cost from event credits. In production, ZEC would be swapped to USDC through NEAR Intents (Bitrefill Lane 5).

## Order lifecycle

```
resold:    awaiting_seller → awaiting_payment → payment_seen → paid → delivered
bitrefill: awaiting_payment → payment_seen → paid → fulfilling → delivered | failed
any open state → expired (quote timeout)
```

Transitions go through a transition table that throws on illegal moves. The step from `paid` to `fulfilling` is a conditional UPDATE, so only one worker can claim the order.

## Demo flow (under 3 minutes)

1. **Agent purchase:** "Get me a ₹10 Airtel top-up." The agent searches the catalog, passes the guardrails and proposes an order. The buyer types the phone number into the checkout card, where the browser encrypts it.
2. The buyer pays shielded TAZ by scanning the QR code. The status goes from seen to paid, then fulfilling, then "Delivered, number deleted".
3. **The money shot:** `/inspect` shows the raw database rows and the agent log. They contain only ciphertext, IDs and a wiped phone field, plus the Bitrefill order ID.
4. **eSIM or gift card:** the same flow. The buyer's browser decrypts the code (masked until clicked) or renders the eSIM QR code locally.
5. **Resale (if time allows):** a seller lists a card, a buyer orders it, and the seller's browser seals the code to the buyer's key. The buyer pays and decrypts.

## Stack

- **App:** Next.js 16 (App Router), TypeScript, Tailwind, run with pnpm.
- **Crypto:** `libsodium-wrappers`, used in the browser and in `fulfill.ts`.
- **Database:** SQLite through **Drizzle ORM and better-sqlite3**. This changed from Prisma because Prisma 7/8 needs driver adapters and a config file, while Drizzle needs no code generation.
- **Zcash:** the `lib/zcash.ts` adapter described under Payments, plus `worker/watcher.ts`.
- **Bitrefill:** REST API v2 with a Bearer key, using `payment_method: "balance"` and `auto_pay: true`. Development uses the free test products (`test-gift-card-code`, `test-phone-refill`). The demo makes real cheap purchases.
- **Agent:** AI SDK 7 tool calling, with the model set in env.
- **Hosting:** a public URL is required. The plan is one Docker image running Next.js plus the watcher, with SQLite and wallet data on a persistent volume (Railway or Fly).

## Data model (Drizzle, SQLite)

```
listings      id, type(giftcard|esim|topup), brand, faceValueCents, priceUsdCents,
              source(user|bitrefill), bitrefillProductId?, bitrefillPackage?,
              sellerAttested(bool), codeFingerprint?, sellerTokenHash?,
              status(active|sold|rejected), createdAt
orders        id, listingId?, type, productId?, packageValue?, buyerPubKey,
              priceUsdCents, amountZat(int), payAddr, memoTag(unique),
              status, guardrail(ALLOW|REQUIRE_HUMAN), approvedAt?,
              sealedPayload?, sealedPhone?, bitrefillInvoiceId?, bitrefillOrderId?,
              txid?, minedHeight?, paidAt?, releasedAt?, wipedAt?, expiresAt, createdAt
agent_events  id, sessionId, kind(tool_call|tool_result|message), name, payload(JSON, metadata only), createdAt
```

- Money is stored in integer cents and zatoshis, never as floats.
- `codeFingerprint` is a keyed hash computed in the seller's browser, so duplicate listings can be detected without revealing the code.

## API

| Method and path | What it does |
| --- | --- |
| `GET /api/fulfill-key` | Returns the fulfillment public key, used to seal phone numbers |
| `GET /api/catalog?q=&type=` | Bitrefill catalog, cached |
| `POST /api/listings` | Takes `{type, brand, faceValueCents, priceUsdCents, sellerAttested, codeFingerprint}` and returns `{listing, sellerToken}`. No code is ever sent |
| `GET /api/listings?type=` | Lists resold products |
| `POST /api/orders` | Takes `{listingId}` or `{productId, packageValue}`, plus `buyerPubKey` and an optional `sealedPhone`. Returns `{order, zip321Uri, amountZec, memoTag}` |
| `POST /api/orders/:id/approve` | Buyer approval for a `REQUIRE_HUMAN` order |
| `POST /api/orders/:id/seal` | The seller uploads the sealed code. Requires the `x-seller-token` header |
| `GET /api/seller/orders` | Orders waiting for this seller to seal. Requires `x-seller-token` |
| `GET /api/orders/:id` | Status, plus `sealedPayload` once released |
| `POST /api/agent` | Agent chat, streamed |
| `GET /api/inspect` | Raw rows for the demo screen. Contains only ciphertext and metadata by design |
| `POST /api/dev/simulate-payment/:id` | Only when `ZCASH_BACKEND=fake` |

`worker/watcher.ts` polls the Zcash backend, matches receipts, moves orders forward, runs `fulfill()` and wipes phone numbers.

## Repo layout

```
/app            / (agent chat + checkout), /order/[id], /inspect, /sell, /seller/orders
/app/api        agent, orders, orders/[id], fulfill-key, inspect, dev/simulate-payment, listings, seller
/lib            sodium.ts, keystore.ts, payload.ts, db/ (schema, client), zcash.ts, zip321.ts, cart.ts,
                bitrefill.ts, fulfill.ts, fulfill-key.ts, guardrails.ts, proposal.ts, order-state.ts,
                orders.ts, money.ts, agent.ts, log.ts
/worker         watcher.ts (started from instrumentation.ts)
/scripts        keygen.ts, smoke-agent-tools.ts, e2e-simulated.ts, reset-dev-db.ts
SPEC.md  README.md  FEEDBACK.md  .env.example
```

`.env.example`:

```
DATABASE_PATH=./data/zealed.db
FULFILL_SECRET_KEY=            # base64 X25519 secret key; generate with `pnpm keygen`
ZCASH_BACKEND=fake             # fake | zingo | cipherpay
ZCASH_NETWORK=testnet
ZCASH_LIGHTWALLETD=https://testnet.zec.rocks:443
ZCASH_RECEIVE_UA=              # utest1… merchant unified address
ZEC_USD_RATE=30                # fixed demo rate; TAZ has no market price
BITREFILL_API_KEY=
BITREFILL_USE_TEST_PRODUCTS=true
AGENT_AUTO_LIMIT_CENTS=500
AGENT_APPROVAL_LIMIT_CENTS=2000
AGENT_DAILY_LIMIT_CENTS=2500
AI_GATEWAY_API_KEY=
AGENT_MODEL=
```

## Build order (WET times; hard close 18:30, internal target to finalize by 14:30)

1. **By 08:30:** scaffold, `sodium.ts` with a test, DB schema, guardrails, order state machine.
2. **By 09:30:** API routes with the fake backend. Pages: `/order/[id]` with decryption, `/buy`, `/inspect`.
3. **By 10:30:** the real Zcash backend (zingo-cli or CipherPay) and the watcher. A real shielded payment end to end.
4. **By 11:30:** Bitrefill fulfillment with test products, then a real top-up and eSIM. Phone wipe.
5. **By 12:15:** agent chat with tools, guardrails and the agent log.
6. **By 12:45:** deploy to a public URL, then the README, privacy and trust note, and FEEDBACK.md.
7. **By 13:00:** record the demo. **By 14:00:** Stadium draft. **By 14:30:** finalize.
8. Resale flow and seller sealing if time allows, then a Noir Wallet payment button for bonus points.

## Fallbacks

- **Zingo-cli doesn't work on NU7:** use CipherPay's testnet checkout and webhook, and name CipherPay in the trust note.
- **Bitrefill test products aren't enabled:** iterate with the fake fulfillment adapter (labeled), and do one real purchase per flow for the demo.
- **Seller offline:** the demo uses only Bitrefill products, which need no seller step.

## Submission checklist

- [ ] One-line pitch (above)
- [ ] Public URL working on testnet
- [ ] Demo video, 2–3 minutes
- [ ] Public repo with a README: tech list, design decisions, runs in under 15 minutes, which lane
- [ ] Shielded testnet txid that the project created
- [ ] Bitrefill invoice ID from a real purchase
- [ ] Guardrails paragraph (from the section above)
- [ ] Bitrefill touchpoints paragraph: what we built vs. reused
- [ ] **Privacy and trust note**, answering the four questions:
  - What stays private?
  - What's revealed, and to whom? This means the lightwalletd server, Bitrefill, the AI provider and the host.
  - Who must users trust? Zealed for fair release and for the integrity of the JS it serves, `fulfill.ts` handling plaintext briefly, and Bitrefill's ability to re-fetch codes by order ID.
  - What we'd fix next.
- [ ] Which parts are for which track
- [ ] 30-day next step
- [ ] FEEDBACK.md, written by a human

## Roadmap

- **Deliver inside the encrypted memo:** send the sealed code in a shielded memo back to the buyer, so no web session is needed.
- **Network privacy:** route traffic through Nym so Zealed can't see buyers' IP addresses. This counts toward the bonus.
- **Seller payout escrow:** release the payout after the buyer confirms the code works or a timeout passes. Later, threshold or re-encryption keys so the seller can be offline.
- **Make the server untrusted for keys:** verified client builds, or a browser extension, so a malicious server can't serve JS that swaps keys.
- **Hide plaintext from the fulfillment server too:** a TEE, or Bitrefill encrypting directly to the buyer's key.
- **More ways to release:** claim links for gifts, time locks, and approvals (a parent approving a kid's top-up).
- **Seller reputation** built from proofs, without needing an identity.

## Pitch line

"Zealed: your gift card code, eSIM or phone number is never stored, logged or shown to our AI in readable form. Only you can open it."
