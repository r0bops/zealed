<!--
DRAFT. Before submitting:
- Replace every "TODO" (grep -n TODO README.md).
- Delete all HTML comments, this one included.
- Keep the pitch identical to the one on the Stadium form.
- Flip each 🟡 row in "What actually works" to ✅ only once you have evidence for it.
-->

# Zealed — private mission rewards

> Proposed: complete a mission, let an agent find an eligible perk, and receive it encrypted to your browser after the sponsor authorises the purchase through a shielded testnet payment.

**Implementation status:** this README describes a proposed mission-rewards extension under the **Zealed** name. Campaigns, missions, claim links, separate sponsor/player access, pooled funding, refunds and ZK proofs are **not implemented**. The running app is still Zealed's shopping chat and per-order checkout. Its existing payment and delivery evidence is preserved below; it does not prove the proposed campaign flow.

**Funding:** testnet TAZ authorises purchases; Bitrefill is paid from separate event credits. The first version would require sponsor authorization for each exact order, after the player chooses. It would not hold a refundable campaign deposit or provide escrow.

| | |
|---|---|
| **Tracks** | Privacy (Zcash) **and** Agentic Commerce (Bitrefill) |
| **Privacy theme** | 1. Private payment rails (checkout matched by memo) |
| **Bitrefill lane** | Current: 5, Private by default. Proposed extension: mission-triggered fulfillment and gift on claim |
| **What it is** | Working shopping agent and encrypted delivery; proposed organizer/player mission-rewards workflow |
| **Live URL** | TODO: https://… |
| **Demo video** | TODO: https://… (2–3 minutes) |
| **Testnet txid** | `1bb9548ea9ee04da491071e86f7287391aa52f3260c51ce6219324615768defd`: a shielded order payment, mined at height 4581712. [zexplorer](https://zexplorer.app/testnet/tx/1bb9548ea9ee04da491071e86f7287391aa52f3260c51ce6219324615768defd) · [zcashexplorer](https://testnet.zcashexplorer.app/transactions/1bb9548ea9ee04da491071e86f7287391aa52f3260c51ce6219324615768defd) <!-- TODO: on 4 Nov, zexplorer's testnet index stopped at 4505881, so it shows "not found". Check the zcashexplorer link in a browser before submitting. --> |
| **Real purchase invoice ID** | TODO: needs event credits and `BITREFILL_PURCHASES=live` |
| **Bitrefill test-product invoices** | `98d4f316-c3fa-482a-9137-91723064b4e5` (gift card) · `3f51bca9-39bc-4579-bd51-6df1fc584d4b` (eSIM). Real API purchases of Bitrefill's free test products; the codes aren't redeemable |
| **Team** | TODO: Name (@handle) |

**Which parts serve which track**

| Privacy (Zcash) | Agentic Commerce (Bitrefill) |
|---|---|
| ZIP-321 checkout with the order tag and cart hash in an encrypted memo | Shopping agent with metadata-only tools (search, quote, propose, status) |
| Watch-only payment detection with a viewing key (zkool_graphql) | Guardrails: spend caps, in-app approval, signed proposals, atomic budget reservations |
| Exact receipt matching: recipient, shielded pool, amount, memo and confirmations | Automatic fulfillment through Bitrefill REST v2, polled until delivered |
| Codes sealed to the buyer's key, and phone numbers sealed and then wiped | Delivery that the agent can't read: the result is sealed to the buyer before it's stored |
| Pay from the browser with Noir Wallet | |

---

## 1. The problem and who it's for

- **Proposed user:** an event or community organizer offering useful perks to participants who complete a mission. Participants should not need to submit names or emails to Zealed to claim a reward.
- **Problem hypothesis:** organizers need bounded reward distribution without copying redemption codes into spreadsheets or messages. Participants need perks they can actually redeem, chosen for their destination, device and preferences. This need has not yet been validated with an organizer.
- **Existing foundation:** Zealed serves buyers of gift cards, eSIMs and top-ups through shopping chat, shielded payment authorization, and encrypted delivery. The proposed extension separates sponsor authorization from recipient delivery.
- **Evidence:** TODO. Use real evidence only: quotes from people you spoke to at the venue or in the mentors chat, a documented incident or issue thread, or a partner asking for it. Don't invent users, quotes or demand.

## 2. Proposed mission-rewards flow (not built)

1. An authenticated organizer creates a campaign with a spending ceiling, a small product allowlist, one mission and an expiring invitation. The first demo permits one successful claim.
2. A player opens the QR/link in their browser and creates a local encryption key. The player completes a fixed quiz checked by backend code; the LLM cannot grant eligibility.
3. The agent compares eligible perks against the player's nonsecret requirements and the campaign budget, then proposes an exact product and package. A fixed answer-to-SKU script alone would not demonstrate meaningful agent decision-making.
4. The server atomically reserves the invitation and budget, binding the claim to the player's key and order. The sponsor reviews and authorises that exact order with a shielded testnet payment.
5. After confirmation, the existing fulfillment service buys through Bitrefill from event credits, polls until delivered, and seals the result to the player's key. The player need not visit Bitrefill, but may need an issuer account or installation step to use the perk.
6. The player decrypts locally. A separate organizer view would show aggregate counts and spend, without redemption data. Organizer UI restrictions do not exclude a privileged server operator or Bitrefill from plaintext access.

**Claim guarantees to implement:** hashed invitation tokens, expiry, authenticated organizer access, atomic single-use claims, backend product restrictions, and recovery of uncertain purchases without buying again. A public QR can be copied; one claim per key is not one claim per human. Invitation limits bound spending but do not prove attendance or prevent answer sharing.

**Candidate perks — eligibility is not yet verified through our API account:**

| Candidate | Verification and first-demo decision |
|---|---|
| Bitrefill Global / Asia / Europe eSIM | Global public listing verified; exact account access, live price, regional coverage and redeemability still need checking. Require a compatible unlocked device. "Global" does not mean every country. Start with one verified package. |
| Uber & Uber Eats International voucher | Exact SKU, country/currency restrictions and account eligibility unverified. Do not promise worldwide use. |
| NordVPN / Surfshark International | Exact SKU, price, account and redemption requirements unverified. |
| FlightGift / AirlineGift / TripGift | Account access and redemption conditions unverified; booking can require passenger information. Exclude from the first demo. |

Sources: [Bitrefill Global eSIM](https://www.bitrefill.com/np/en/esims/bitrefill-esim-global/), [Uber gift-card restrictions](https://gifts.uber.com/giftcards) (not verification of the proposed international voucher).

No blanket "global and no-KYC" promise: Zealed can avoid collecting names/emails while issuers still impose their own requirements. Exclude US-only cards such as Amazon.com, Apple US, US prepaid Visa/Mastercard and Airbnb USA from the proposed international campaign.

### Current implemented shopping flow

1. The buyer asks the agent for something ("the cheapest Airtel top-up"). The agent searches the live Bitrefill India catalog, prices it and runs the spending guardrails.
2. Orders up to $5 go straight to checkout, and orders between $5 and $20 show an **Approve / Decline** card. If the buyer declines, the agent suggests cheaper alternatives.
3. The checkout card creates a one-time key in the buyer's browser. For a top-up, the buyer types the phone number into a secure field, where the browser encrypts it.
4. The buyer gets a ZIP-321 shielded payment request (a QR code, or a **Pay … TAZ with Noir Wallet** button). Its memo carries the order tag and a hash of exactly what is being bought.
5. Zealed's watcher sees the shielded payment through a watch-only viewing key and waits for it to confirm. Then it buys the product from Bitrefill, paying from Zealed's credit balance.
6. The code or eSIM is sealed to the buyer's key on arrival, and the phone number is wiped. The buyer's browser decrypts it locally. Codes stay masked on screen until revealed, and eSIM QR codes are rendered in the browser.

![screenshot](./assets/screenshot.png) <!-- TODO: add the screenshot -->

## 3. Try the current implementation

These instructions exercise shopping checkout, not the proposed mission flow. The public URL and browser-wallet evidence remain outstanding.

**Without installing anything:**
1. Open TODO: live URL and go to **Chat** (`/chat`). The orders you've made in that browser are in the same workspace, in the orders view (`/chat?view=orders`).
2. Ask: "Get me the cheapest Airtel top-up" or "A ₹50 Flipkart gift card".
3. Follow the checkout card. Pay the shielded request from a testnet wallet: the [Noir Wallet testnet extension](https://github.com/NoirWallet/noir-wallet/releases) (load the `-testnet.zip` build unpacked) or any NU7 testnet wallet that can scan a ZIP-321 QR code.
4. You should see the order go from awaiting payment to paid once the payment is mined, then to delivered. Timing depends on chain confirmation and Bitrefill delivery; completion within two minutes is not guaranteed. Your browser decrypts the result locally, and the code stays masked until you click **Reveal**.

<!-- TODO (decide): on the public URL, each paid order triggers a real Bitrefill purchase from our event credits, within the caps in section 6. Decide whether judges get live or test purchases there, and say so here. -->

**Run it locally:**

```bash
git clone https://github.com/r0bops/zealed
cd zealed
pnpm install
cp .env.example .env.local
pnpm keygen               # prints FULFILL_SECRET_KEY: paste it into .env.local
# .env.local:
#   ANTHROPIC_API_KEY   your Anthropic API key
#   BITREFILL_API_KEY   from https://www.bitrefill.com/account/developers (empty = SIMULATED catalog)
#   ZCASH_BACKEND       zkool for real payments (fake = local development only, shown as SIMULATED)
pnpm dev                  # http://localhost:3000
```

**Real shielded payments (ZCASH_BACKEND=zkool):**

```bash
# 1. Run a local zkool_graphql wallet server on NU7 testnet. Keep it on localhost:
#    unauthenticated GraphQL would expose wallet seeds to anyone who can reach the port.
zkool_graphql -d wallet.db -p 8000 -l https://testnet.zec.rocks:443 -C 1 --allow-unauthenticated --allow-unencrypted-database
# 2. Create the receiving wallet, its watch-only account, and a payer wallet. This prints the .env.local lines.
pnpm zkool:setup
# 3. Fund the payer wallet with free TAZ (1 TAZ per address per day):
curl -X POST https://fauzec.com/api/v1/claim -H 'Content-Type: application/json' \
  -d '{"network":"testnet","address":"utest1…"}'
# 4. Pay an order from the command line (prints the txid and the explorer link):
pnpm zkool:pay <orderId>
```

**Requirements:** Node 22+ (tested on 24) and pnpm 11. Real payments also need `zkool_graphql`: either the prebuilt binary from [zkool2 release v6.36.0](https://github.com/hhanh00/zkool2/releases), or a build from source with `cargo build --release --features graphql --bin zkool_graphql`.

**Test funds:** testnet TAZ from [Fauzec](https://fauzec.com) or [Valar](https://faucet.testnet.valargroup.dev/). TAZ is worthless. Bitrefill purchases are paid from our event credits, never in ZEC.

## 4. What actually works

| Step in the core flow | Status | Evidence |
|---|---|---|
| Agent searches the live Bitrefill India catalog and prices packages | ✅ real | TODO: video timestamp |
| Guardrails, approval card and signed proposal | ✅ real | `lib/guardrails.ts`, `lib/proposal.ts`, `lib/safety.test.ts` |
| One-time browser key; phone number sealed in the browser | ✅ real | `lib/keystore.ts`, `app/checkout.tsx` |
| ZIP-321 request with order tag + cart hash memo | ✅ real | `lib/zip321.ts`, `lib/cart.ts` |
| Shielded payment from a wallet (CLI payer through `pnpm zkool:pay`) | ✅ real, NU7 testnet | txid `1bb9548e…8defd`: 0.12966881 TAZ for order `80cceeb9`, mined at 4581712 about 60 s after sending |
| Shielded payment from the buyer's browser with Noir Wallet | 🟡 built; not yet run on testnet | TODO: txid |
| Watch-only detection and confirmation via zkool_graphql | ✅ real | The watch-only account (UFVK, birth 4581688) matched the memo tag, cart hash, exact amount and recipient, then marked the order paid after 1 confirmation. TODO: video timestamp |
| Bitrefill purchase triggered by the confirmed payment, polled until delivered | ✅ real API purchases of Bitrefill **test products** (`BITREFILL_PURCHASES=test`) | **Gift card:** order `6c279e24`, txid `7bc881c3cce15e0f5b24256f0c0de4a517c752760187f07faf210fcd07be8334` (height 4581762), invoice `98d4f316…`. **eSIM** through `POST /esims`: order `49efc554`, txid `a352f788e27c073937b31ff40de810bcd27a434a2af5f067bc9df605062158ed` (height 4581766), invoice `3f51bca9…` |
| Paid Bitrefill purchase of a real product | 🟡 not yet. It needs event credits and `BITREFILL_PURCHASES=live` | TODO: invoice ID, video timestamp |
| Result sealed to the buyer, decrypted locally, phone wiped | ✅ in the real-payment runs: a gift card code, and a real eSIM LPA string with its QR code rendered in the browser | orders `6c279e24` and `49efc554`, `lib/safety.test.ts` |

**Known limitations:**
- Campaigns, mission verification, claim limits, sponsor/player permissions and aggregate organizer receipts are planned, not implemented.
- The current payment memo binds one exact order and recipient key. One campaign deposit cannot authorize arbitrary future claims without new accounting and authorization logic.
- The payment watcher cannot sign refunds. Automatic returns and pooled campaign funding require a separate design.
- A `fake` Zcash backend exists for local development only. It's labelled SIMULATED in the UI, it's refused in production, and it's never used in the demo.
- With zkool, the "seen in mempool" state doesn't appear. The transaction shows up only once it's mined, so orders go straight from awaiting payment to paid.
- Bitrefill delivery is detected by polling, not webhooks.
- ZEC is priced at a fixed demo rate (`ZEC_USD_RATE`), because TAZ has no market price. BTC/USD is fetched live, with a configured fallback.
- The Bitrefill purchases so far were test products, whose codes can't be redeemed. A paid purchase of a real product is still to come.
- The resale flow (seller-sealed codes) isn't built yet.
- The app and the watcher share one process and one SQLite file.

## 5. Privacy and trust

**Claim boundary:** the database, logs and agent do not receive readable redemption codes. The fulfillment server briefly does, before sealing them. Bitrefill can retrieve them again. Neither the current app nor the proposed extension can honestly claim "the server never sees the code." No-name claims are not full anonymity: network metadata, timing, recipient keys and campaign membership can still be linked. Organizer-only aggregate views are planned access controls, not cryptographic protection from the operator.

1. **What stays private?**
   - On-chain, the sender, receiver and amount are shielded, and the memo (order tag + cart hash) is encrypted.
   - Gift card codes and eSIM activation strings are never stored, logged or sent to the AI in readable form. They're sealed to the buyer's per-order key, and only the buyer's browser can open them.
   - Phone numbers are encrypted in the browser and stored only as ciphertext. They're decrypted only for the Bitrefill call, then wiped.
2. **What does the app reveal, and to whom?**
   - **The light-wallet server** (`testnet.zec.rocks`) sees our watcher's IP address and sync timing. The buyer's wallet uses its own light-wallet server, which sees the buyer's IP address.
   - **Our server** stores order metadata: product, price, ZEC amount, memo tag, cart hash, the buyer's public key, txid, block height, Bitrefill invoice and order IDs, and ciphertext. A sealed phone number sits next to its order (and its txid) until fulfillment, then it's wiped. The agent log keeps a hashed session ID, event names and metadata only, never chat text.
   - **The fulfillment function** holds the plaintext code or phone number in memory for the duration of the Bitrefill call, then seals or wipes it.
   - **Bitrefill** sees the purchase, the phone number for top-ups and our account. It can re-fetch codes by order ID.
   - **The AI model provider** (Anthropic) sees the chat, which is filtered for phone numbers, keys and code-like strings on a best-effort basis, plus tool results: product IDs, prices, order IDs and statuses.
   - **The buyer's wallet** (for example Noir) sees our address, the amount and the memo.
   - **The BTC price feeds** (Coinbase, with Kraken as a backup) see our server's IP address. No user data is sent to them.
   - **The host:** TODO, name the hosting provider.
3. **Who do users have to trust?**
   - Zealed as operator: to release only after payment, and to serve honest JavaScript, because a malicious server could serve code that swaps keys.
   - The fulfillment function's brief handling of plaintext.
   - Bitrefill.
   - Anthropic.
   - The light-wallet servers.
   - The host.
4. **What would we fix next?**
   - Route the watcher's traffic through Nym.
   - Delete order metadata after delivery.
   - Ship verified client builds, so a compromised server can't swap keys.
   - Have the issuer encrypt directly to the buyer's key, so no Zealed server ever sees plaintext.

**Payment confirmation threshold:** 1 block on testnet (`ZCASH_MIN_CONFIRMATIONS=1`).

**Viewing key (optional):** TODO: `uviewtest…` · birth height **4581688** (the demo receiving wallet). This key reveals that wallet's history but can't spend.

## 6. Agentic commerce with Bitrefill

- **What the agent does on its own:**
  - It finds products (live catalog search, with a budget filter for alternatives).
  - It chooses and prices them (a quote that runs the guardrails).
  - It proposes a checkout through a signed proposal.
  - The purchase is triggered automatically once a shielded payment confirms. A deterministic function places it, and no human checks out at Bitrefill.
  - A human steps in at two points. They approve orders between $5 and $20 in the app, and they make the shielded payment that authorises the purchase.
- **Bitrefill integration: REST API v2** (`lib/bitrefill.ts`, `lib/fulfill.ts`):
  - product search and details, with the account-scoped cache
  - `POST /invoices` for gift cards and top-ups, `POST /esims` for eSIMs, both with `payment_method: "balance"` and `auto_pay: true`
  - polling `GET /invoices/{id}` and then `GET /orders/{id}` until the order is `delivered`
  - **Built:** the client, the purchase modes (simulate, test and live), the fulfillment state machine, guardrails, approvals, sealing and reconciliation. **Reused:** the Bitrefill catalog, balance payments and test products.
- **Payment method:** account balance (event credits). Bitrefill doesn't take ZEC, so the shielded testnet payment *authorises* the purchase rather than paying for it.
- **Guardrails:**
  - **Per purchase:** up to **$5** goes through automatically. **$5–$20** needs the buyer's approval on the in-app card, and that approval is bound to an HMAC-signed proposal. Above **$20** is blocked, and nobody can approve it; only the operator can raise the limit in config.
  - **Per day:** **$25** of agent orders in total. Budget is reserved in one SQLite transaction at checkout, and re-checked when the purchase is claimed.
  - **Bitrefill's own caps:** 5 top-ups and 15 gift cards a day per account.
  - **Hard ceiling:** the Bitrefill balance, which holds only event credits.
  - **Other limits:** one purchase per order, through an atomic claim. An uncertain outcome is reconciled, never retried blindly. Quotes and proposals expire after 15 minutes. In live mode, fulfillment re-prices the product before it buys.
- **Purchase proof:** TODO, the invoice ID of a paid purchase plus the video timestamp. So far, the full flow has made real API purchases of Bitrefill's test products: invoices `98d4f316-c3fa-482a-9137-91723064b4e5` (gift card) and `3f51bca9-39bc-4579-bd51-6df1fc584d4b` (eSIM). Test products cost nothing; the balance was 0 before and after.
- **What's new here:**
  - **A new guarantee:** the agent, the database and the logs can't leak the code, because they never hold it in readable form.
  - **A new trigger:** a confirmed shielded payment, bound to the exact cart by its memo.
  - The Bitrefill Assistant already turns a chat into an order. It has no budget, approval or sealed-delivery layer.

**Handling the failure cases:**
- **Out of stock:** refused at quote time.
- **Expired quote:** a new quote is needed.
- **429 or timeout during a purchase:** treated as an unknown outcome (`failed_uncertain`), never retried.
- **Uncertain outcomes:** once a minute, the watcher runs `reconcileOrder()`. It only reads the Bitrefill invoice and order, never buys again, and settles the order as delivered or failed. It has already recovered a test order to delivered.
- **Finished invoices:** a delivered invoice can report `all_delivered` rather than `complete`, so polling stops on the order's own final state.
- **Failed or refunded order:** reported as failed.

## 7. How it's built

**Technologies used:**
- Next.js 16.4.5 (App Router), React 19.3.0, TypeScript 5.9.3, Tailwind CSS 4.3.4
- AI SDK 7.0.162 with `@ai-sdk/anthropic` 4.0.96 and `@ai-sdk/react` 4.0.166, running Claude Haiku 5.5 (`claude-haiku-5-5`)
- libsodium-wrappers 0.8.4: X25519 key pairs and `crypto_box_seal`
- Drizzle ORM 0.45.4 with better-sqlite3 13.0.3, zod 4.6.7, qrcode 1.5.4, idb-keyval 6.3.0
- `@noir-wallet/sdk` 0.1.9 with the Noir Wallet testnet extension
- zkool2 `zkool_graphql` (v6.36.0 / main@98db198) as a watch-only wallet server, bound to 127.0.0.1, syncing through lightwalletd at `testnet.zec.rocks:443` on Zcash NU7 testnet
- Bitrefill REST API v2
- Coinbase and Kraken public price APIs, for BTC/USD
- vitest 5.1.0, tsx 4.23.15, pnpm 11.22.0, Node 22+

**Architecture:**

```
Buyer's browser ── chat ──▶ /api/agent ──▶ Claude Haiku (search · quote · propose · status)
  │ one-time X25519 key in IndexedDB; phone number sealed here
  ├── signed proposal + sealed phone ──▶ /api/orders ──▶ SQLite (metadata + ciphertext)
  ◀── ZIP-321 request: address, amount, memo = order tag + cart hash
  └── shielded TAZ payment (Noir Wallet / any testnet wallet) ──▶ Zcash NU7 testnet
                                                                   │
  watcher ◀── zkool_graphql, watch-only UFVK ◀── testnet.zec.rocks ┘
     │ exact match (recipient, pool, amount, memo, confirmations) → paid
     ▼
  fulfill.ts ── REST v2, balance, auto_pay ──▶ Bitrefill ──▶ code / eSIM / top-up
     │ seals the result to the buyer's key; wipes the phone number
     ▼
  Buyer's browser decrypts locally (codes masked; eSIM QR rendered locally)
```

**Design decisions:**
- **The agent never touches secrets.** Its tools take and return identifiers and metadata only. A deterministic function, not the LLM, makes the purchase.
- **Seal on arrival.** Bitrefill's response is sealed to the buyer's key as soon as it arrives, and only the ciphertext is stored.
- **One key per order,** so orders can't be linked by key. The key can be exported as a backup string.
- **A payment is bound to its cart.** The memo carries a hash of the order, product, package, price, amount, buyer key and expiry. A receipt counts only with the exact recipient, a shielded pool (Ironwood or Sapling), the exact amount and the matching hash. Each txid matches one order only.
- **The server holds a viewing key only.** Spending keys and seeds never reach the app, the database, logs or the AI.
- **Fail closed.** With no verified real Zcash backend, checkout refuses to start. Simulated payments are refused in production.
- **Money is integers:** USD cents and zatoshis, never floats.
- **Guardrails live in code, not in the prompt.** Approvals are signed, budget reservations are atomic, and limits are re-checked before buying.

**Code worth reading:**
- `lib/fulfill.ts`: buys at most once, seals the result immediately and wipes the phone number.
- `worker/watcher.ts` and `lib/zcash-zkool.ts`: exact, watch-only receipt matching.
- `lib/cart.ts` and `lib/zip321.ts`: binding the payment memo to the cart.
- `lib/orders.ts`: atomic spend reservations (`reserveOrder`, `claimFulfillment`).
- `lib/agent.ts` and `lib/proposal.ts`: narrow tools, tool approval and signed proposals.
- `lib/chat-privacy.ts` and `lib/log.ts`: the best-effort chat guard and secret redaction.
- `lib/safety.test.ts`: tests for the privacy, spending and payment boundaries.

**Built during the hack vs before:** all code in this repo was written during the hack (4–5 Nov 2026). It relies on the open-source libraries listed above.

**Reusable parts:**
- the watch-only zkool receipt adapter
- the cart-hash memo binding
- the guardrail and reservation module
- the chat secret guard

TODO: link any of these if you publish them as a package.

## 8. Delivery plan and roadmap

**First gate:** verify one permitted, redeemable product through our actual Bitrefill account in live mode, from confirmed shielded authorization through local decryption. The existing free test products do not establish this. Confirm event credits and explicit purchase authorization before spending.

**Proposed three-hour implementation budget (not a completion claim):**

| Time | Work |
|---|---|
| 0–20 min | Verify live SKU, credits and purchase path |
| 20–55 min | Campaign and Claim records; fixed mission configuration; hashed token, expiry and reservation |
| 55–100 min | Mission gate, constrained agent selection, recipient-key binding and sponsor authorization |
| 100–130 min | Player claim page and authenticated organizer summary |
| 130–155 min | Replay, concurrent-claim, key-substitution, access and budget tests |
| 155–180 min | Record real flow, update evidence and prepare submission |

This assumes the existing deployment and fulfillment work. If the first gate fails, complete the current checkout evidence instead. Preserve time to **Finalize and submit on Stadium by Wed 4 Nov 20:00 IST**; a saved draft is not a submission.

**Reuse versus new work:** encryption/key storage, zkool receipt detection, Bitrefill transport and sealing/reconciliation are the foundation. Agent tools need campaign restrictions. New Campaign/Claim records, authenticated organizer routes, mission validation, claim transactions and separate player/organizer pages are required. Full pooled funding would additionally change payment matching, cart commitments, budget accounting and fulfillment authorization; it is outside this deadline.

### Proposed demo (under two minutes, once built)

- **0:00–0:15:** organizer creates one bounded invitation and shows the mission and eligible perks.
- **0:15–0:35:** player opens the QR in a separate browser, creates their key and completes the mission.
- **0:35–0:50:** agent proposes an eligible perk and explains its choice.
- **0:50–1:05:** sponsor approves the exact order and sends shielded testnet authorization.
- **1:05–1:40:** confirmation, Bitrefill purchase, delivery and local decryption; keep codes masked.
- **1:40–1:55:** aggregate organizer receipt, rejected duplicate claim and ciphertext-only storage.

Chain and provider delays may exceed this script. Disclose time cuts in the recording. Judges could try bounded invitations with sponsor authorization; paid redemption stays in team-owned accounts under event rules unless organizers explicitly approve another arrangement.

**Fallback:** a separate local walkthrough labeled **SIMULATED**, using the existing development adapters, can explain interaction but is not purchase or payment evidence. Keep it out of the scored core flow. Show any previously recorded real run separately with its actual txid/invoice and test/live mode. Never mark a pending real payment confirmed to finish the demo.

### After the hack (proposed, not built)

- Validate the workflow with one event organizer and run a bounded pilot by Fri 4 Dec 2026. Document actual feedback and a concrete partner or upstream action.
- Extend from one claim to N claims with campaign budget accounting, revocation, safe expiry and recovery. Retain uncertain purchases as reservations until reconciled.
- Investigate pooled funding and refunds separately. Specify currency conversion, custody, fees, refund authority and pending-claim settlement; testnet TAZ is not spendable Bitrefill credit.
- Explore a ZK answer proof bound to campaign and recipient key, verified off-chain, with campaign-scoped nullifiers and replay protection. This proves a statement about an answer, not unique humanity or resistance to bots. A Noir-language circuit is distinct from Noir Wallet and does not automatically earn a bonus.
- Explore network privacy, limited metadata retention and issuer-to-recipient encryption. Telegram can distribute claim links after the core flow works.
- **Out of first-demo scope:** pooled deposits, automatic refunds, ZK, multiple missions, broad global inventory, Telegram integration and dispute handling.
- **User evidence and continuation links:** TODO. No organizer demand, partnership or ZK implementation is claimed yet.

## 9. Links

- Repo: https://github.com/r0bops/zealed
- Demo video: TODO
- Live app: TODO

## Feedback

See [FEEDBACK.md](FEEDBACK.md): what broke, confused or slowed us down with Zcash tooling and Bitrefill. TODO: written by the human.

## License

TODO: choose a license (for example MIT) and add a LICENSE file.

---

## Resources used

- Privacy track brief: https://stadium.joinwebzero.com/programs/free-society-hack-2026/privacy/llms.txt
- Agentic Commerce track brief: https://stadium.joinwebzero.com/programs/free-society-hack-2026/agentic-commerce/llms.txt
- Bitrefill developer docs (API v2): https://docs.bitrefill.com
- zkool2 (zkool_graphql): https://github.com/hhanh00/zkool2
- Noir Wallet SDK: https://docs.zknoir.com/noir-sdk-integration/
- ZIP 316 (unified addresses), ZIP 317 (fees), ZIP 321 (payment requests): https://zips.z.cash/
- Testnet faucets: https://fauzec.com · https://faucet.testnet.valargroup.dev/
- Testnet explorer: https://zexplorer.app (`/testnet/tx/<txid>`)
