<!--
DRAFT. Before submitting:
- Replace every "TODO" (grep -n TODO README.md).
- Delete all HTML comments, this one included.
- Keep the pitch identical to the one on the Stadium form.
- Flip each 🟡 row in "What actually works" to ✅ only once you have evidence for it.
-->

# Zealed — private mission rewards

> Complete a mission, let an agent select an eligible perk, and receive it encrypted to your browser after a sponsor authorises the purchase through a shielded testnet payment.

**Implementation status:** the bounded mission-rewards flow is built and has run end to end for real: one invitation per campaign, a fixed mission, constrained agent selection, sponsor approval and encrypted player delivery. On 4 Nov, the following happened in about 71 seconds:
- Claude Haiku picked an India eSIM (1 GB / 7 days, $3.89) within a $5 budget.
- The sponsor approved it and paid shielded TAZ (txid `18436165…f9ca`).
- The watch-only watcher confirmed the payment.
- Bitrefill delivered its **test eSIM product** (invoice `7d8e4569-daa5-4de9-9a35-518b7d42c47f`).
- The player's browser key decrypted the eSIM activation string.

A paid purchase of a real (non-test) product is still to come.

**Funding:** testnet TAZ authorises purchases; Bitrefill is paid from separate event credits. Sponsors authorise each exact order after the player claims. There is no pooled campaign deposit, escrow or automatic refund. ZK proofs and multi-claim campaigns remain roadmap work.

| | |
|---|---|
| **Tracks** | Privacy (Zcash) **and** Agentic Commerce (Bitrefill) |
| **Privacy theme** | 1. Private payment rails (checkout matched by memo) |
| **Bitrefill lane** | 5, Private by default, with mission-triggered fulfillment and gift on claim |
| **What it is** | Organizer/player mission rewards, with the original shopping checkout retained |
| **Live URL** | TODO: https://… |
| **Demo video** | TODO: https://… (2–3 minutes) |
| **Testnet txid** | `1843616532cee751cbe556e902723d47b6675b6c92300b24070b8b6d1961f9ca`: a sponsor's shielded payment authorising a mission reward, mined at height 4581978. [zexplorer](https://zexplorer.app/testnet/tx/1843616532cee751cbe556e902723d47b6675b6c92300b24070b8b6d1961f9ca) · [zcashexplorer](https://testnet.zcashexplorer.app/transactions/1843616532cee751cbe556e902723d47b6675b6c92300b24070b8b6d1961f9ca). The first checkout payment was `1bb9548ea9ee04da491071e86f7287391aa52f3260c51ce6219324615768defd` (height 4581712). <!-- TODO: on 4 Nov, zexplorer's testnet index stopped at 4505881, so it shows "not found". Check the zcashexplorer link in a browser before submitting. --> |
| **Real purchase invoice ID** | TODO: needs event credits and `BITREFILL_PURCHASES=live` |
| **Bitrefill test-product invoices** | `7d8e4569-daa5-4de9-9a35-518b7d42c47f` (mission reward, eSIM) · `2cc79a30-29c6-423a-9d7a-8844d63b671a` (mission reward, gift card) · `98d4f316-c3fa-482a-9137-91723064b4e5` (checkout gift card) · `3f51bca9-39bc-4579-bd51-6df1fc584d4b` (checkout eSIM). Real API purchases of Bitrefill's free test products; the codes aren't redeemable |
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

- **Intended user:** an event or community organizer offering useful perks to participants who complete a mission. Participants should not need to submit names or emails to Zealed to claim a reward.
- **Problem hypothesis:** organizers need bounded reward distribution without copying redemption codes into spreadsheets or messages. Participants need perks they can actually redeem, chosen for their destination, device and preferences. This need has not yet been validated with an organizer.
- **Existing foundation:** Zealed serves buyers of gift cards, eSIMs and top-ups through shopping chat, shielded payment authorization, and encrypted delivery. The rewards workflow separates sponsor authorization from recipient delivery.
- **Evidence:** TODO. Use real evidence only: quotes from people you spoke to at the venue or in the mentors chat, a documented incident or issue thread, or a partner asking for it. Don't invent users, quotes or demand.

## 2. Mission-rewards flow

1. An authenticated organizer creates a campaign with a spending ceiling, a small product allowlist, one mission and an expiring invitation. Each campaign permits one successful claim and expires after 24 hours.
2. A player opens the QR/link in their browser and creates a local encryption key. The player completes a fixed quiz checked by backend code; the LLM cannot grant eligibility.
3. The agent compares the eligible perks with the player's non-secret needs (purpose, trip length, device) and the campaign budget, then proposes an exact product and package. The choice depends on what the player needs, not on a fixed answer-to-product table.
4. The server atomically reserves the invitation and binds the claim to the player’s key. The sponsor reviews the exact product and price; approval atomically creates one order and reserves its budget. The sponsor then authorises fulfillment with a shielded testnet payment.
5. After confirmation, the existing fulfillment service buys through Bitrefill from event credits, polls until delivered, and seals the result to the player's key. The player need not visit Bitrefill, but may need an issuer account or installation step to use the perk.
6. The player decrypts locally. The organizer view shows counts, reserved amounts, delivered order value, status and the proposed product/price needed for approval, without recipient keys or redemption data. Organizer UI restrictions do not exclude a privileged server operator or Bitrefill from plaintext access.

**Implemented claim controls:** hashed invitation tokens, expiry, authenticated organizer access, atomic single-use claims, backend product restrictions, five mission-answer attempts, at most three model-selection attempts, and recovery of uncertain purchases with known invoice IDs without buying again. Claim read access uses a separate secret stored in the player’s browser; invitation and claim secrets are hashed on the server. A public QR can be copied; one claim per key is not one claim per human. Invitation limits bound spending but do not prove attendance or prevent answer sharing.

**Candidate perks for international participants.** Our Bitrefill account's access to these isn't verified yet:

| Candidate | What still needs checking |
|---|---|
| Bitrefill Global / Asia / Europe eSIM | The public listing is verified. Our account's access, the live price, regional coverage and redeemability still need checking, and the player needs a compatible unlocked phone. "Global" doesn't mean every country. |
| Uber & Uber Eats International voucher | The exact product, country and currency restrictions, and account eligibility. |
| NordVPN / Surfshark International | The exact product, price, and account and redemption requirements. |
| FlightGift / AirlineGift / TripGift | Account access and redemption conditions. Bookings can need passenger details, so these are left out for now. |

Sources: [Bitrefill Global eSIM](https://www.bitrefill.com/np/en/esims/bitrefill-esim-global/), [Uber gift-card restrictions](https://gifts.uber.com/giftcards). The Uber page covers its gift cards in general, not the international voucher.

Zealed doesn't promise "global, no-KYC" perks. It avoids collecting names and emails, but issuers still set their own requirements. US-only cards (Amazon.com, Apple US, US prepaid Visa and Mastercard, Airbnb USA) are left out of international campaigns.

### Current implemented shopping flow

1. The buyer asks the agent for something ("the cheapest Airtel top-up"). The agent searches the live Bitrefill India catalog, prices it and runs the spending guardrails.
2. Orders up to $5 go straight to checkout, and orders between $5 and $20 show an **Approve / Decline** card. If the buyer declines, the agent suggests cheaper alternatives.
3. The checkout card creates a one-time key in the buyer's browser. For a top-up, the buyer types the phone number into a secure field, where the browser encrypts it.
4. The buyer gets a ZIP-321 shielded payment request (a QR code, or a **Pay … TAZ with Noir Wallet** button). Its memo carries the order tag and a hash of exactly what is being bought.
5. Zealed's watcher sees the shielded payment through a watch-only viewing key and waits for it to confirm. Then it buys the product from Bitrefill, paying from Zealed's credit balance.
6. The code or eSIM is sealed to the buyer's key on arrival, and the phone number is wiped. The buyer's browser decrypts it locally. Codes stay masked on screen until revealed, and eSIM QR codes are rendered in the browser.

![screenshot](./assets/screenshot.png) <!-- TODO: add the screenshot -->

## 3. Run and try Zealed

### Mission rewards

1. Set `CAMPAIGN_ADMIN_TOKEN` to a random secret of at least 32 characters in `.env.local`. Keep it out of Git and share it only with the trusted organizer. Set the existing model, wallet and Bitrefill configuration as described below. The organizer token is held in browser memory after login, not placed in URLs.
2. Open `/campaigns`, unlock with that token, search the catalog for the destination, and select 1–5 products. Verify regional coverage, account and redemption requirements yourself. Set a budget up to $20 (server spending caps also apply).
3. Create a one-use invitation. Save its link immediately: the server stores only its hash. Its secret travels in the URL fragment, is stored locally by the player, and is removed from the address bar. Treat it as a bearer invitation: anyone holding it can reserve the claim.
4. Open the invitation on a separate browser/device. Complete the mission, then ask the agent to select an eSIM or gift card from the allowlist. Missing model credentials or unsuitable products fail closed; there is no silent simulated agent fallback.
5. In the organizer workspace, review and approve the exact reward, then pay the shielded testnet request it shows. Use **Open payment in wallet** (a ZIP-321 link), or pay from the command line with `pnpm zkool:pay 'zcash:utest1…?amount=…&memo=…'`, pasting that same link. Approvals are idempotent and can't change the player's key. Quotes expire after 15 minutes, and a changed price fails closed.
6. Return to the player browser to follow delivery and reveal the result. Player credentials and keys persist in IndexedDB; `/chat?view=orders` can reopen delivered orders in that browser. Sponsor credentials cannot read the player’s order endpoint.

**Modes and recovery:**
- The organizer screen shows the catalog mode and the purchase mode.
  - **simulate** is the default when `BITREFILL_PURCHASES` is unset or there's no Bitrefill API key. Its result is labelled SIMULATED.
  - **test** buys Bitrefill's free test products, whose codes can't be redeemed.
  - **live** buys real products from event credits.
- A sponsored order expires 15 minutes after approval if it isn't paid, and then the sponsor can approve the reward again. An expired order that already saw a payment stays bound, so a reward can't be bought twice.
- Prices are re-checked at approval and at purchase. They may rise by at most 5% from the approved price (BTC/USD moves between steps), and never above the campaign budget or the per-order cap.
- An uncertain purchase is reconciled before anything else is bought.
- Cross-device claim recovery isn't built. A backup of the decryption key alone doesn't restore the separate claim secret.

### Original shopping checkout

The original `/chat` flow remains available. The public URL and Noir browser-wallet transaction evidence remain outstanding.

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
# 4. Pay from the command line (prints the txid and the explorer link): a checkout order by its ID,
#    or a mission reward by the ZIP-321 link on the sponsor's screen:
pnpm zkool:pay <orderId>
pnpm zkool:pay 'zcash:utest1…?amount=…&memo=…'
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
| Mission rewards end to end: campaign, mission, claim, agent selection, sponsor approval, shielded payment, Bitrefill purchase, player decryption | ✅ real on NU7 testnet, with a Bitrefill **test product** (`BITREFILL_PURCHASES=test`) | Campaign `b9761ef5` ($5 budget, India, two allowed products). Claim `a831d415`. Claude Haiku chose the India eSIM 1 GB / 7 days at $3.89. Order `f0b73cca`: 0.12967367 TAZ, txid `1843616532cee751cbe556e902723d47b6675b6c92300b24070b8b6d1961f9ca` (height 4581978). Delivered 71 s after sending: invoice `7d8e4569-daa5-4de9-9a35-518b7d42c47f`, Bitrefill order `6aeb1f39ff6775c18aed6e10`. The player decrypted the eSIM activation string locally. **Gift card path:** campaign `e8f9427e`, where the agent chose a Flipkart ₹50 card ($0.56). Order `bc64314b`, txid `89eff39bc9db8418d51eea75c9cfb3bb9462b1e0138ea687a017e3f4fe41f114` (height 4582006), invoice `2cc79a30-29c6-423a-9d7a-8844d63b671a`, decrypted by the player. Script: `scripts/e2e-rewards.ts`. TODO: video timestamp |
| Result sealed to the buyer, decrypted locally, phone wiped | ✅ in the real-payment runs: a gift card code, and a real eSIM LPA string with its QR code rendered in the browser | orders `6c279e24` and `49efc554`, `lib/safety.test.ts` |
| Mission proved with a Reclaim zkTLS proof instead of the quiz | 🟡 built and tested with mocked proofs; not live | `lib/reclaim.ts`, `app/claim/reclaim-verify.tsx`, `lib/reclaim.test.ts`. The proof is bound to the claim by a hash of the campaign and the player's key, then checked with Reclaim's `verifyProof` plus provider and freshness checks. Only `{verified, providerId}` is kept. It's off unless `RECLAIM_APP_ID` and `RECLAIM_APP_SECRET` are set, and otherwise the quiz runs, labelled as such |
| One reward per approved Luma attendee, without storing who they are | 🟡 built and tested with mocked proofs; not live | The nullifier is HMAC(server secret, event ID : Luma user ID), kept in `attendance_nullifiers` (unique per event) and written in the same transaction as the claim. Blocker: Reclaim's public Luma provider proves "invited", not "approved", and reads the event slug rather than its ID, so live use needs a custom Reclaim provider that extracts the guest's approval status |
| FROST 2-of-3 sponsor treasury (organizer, co-sponsor, Zealed) | 🟡 built and tested against mocked zkool instances; a live DKG hasn't run | `lib/frost.ts`, `pnpm frost:setup`, `pnpm frost:pay`, using zkool's `dkgStart`, `dkgSetAddress` and `frostSign`. The DKG runs over shielded memos (about 3–15 min) and signing takes about 2–10 min. It needs three zkool instances. Risk: zkool's DKG mailbox addresses may be Orchard-only, which can't receive on NU7. Unverified |

**Reward verification:** 99 automated tests pass across twelve files. They cover concurrent approvals, attempt limits, recipient-key substitution, HTTP authorization, re-approval after an expired request, price drift, Reclaim proof checks, attendance nullifiers, the FROST client's input validation and error handling, and simulated delivery and decryption. TypeScript and lint pass. Browser checks with mocked API responses exercised organizer creation, mission completion, selection and same-browser reload recovery at 375/768/1280 px. These checks are not paid-purchase evidence. The production build (`pnpm build`) succeeds, but deployment to a public URL isn't done yet.

**Known limitations:**
- Mission rewards support one claim per campaign and one fixed learning quiz. They don't prove attendance or unique humanity. The real campaign run bought Bitrefill's free test eSIM. A paid real product is still to come.
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

**Claim boundary:** the database, logs and agent do not receive readable redemption codes. The fulfillment server briefly does, before sealing them. Bitrefill can retrieve them again. Neither the checkout nor the rewards extension can honestly claim "the server never sees the code." No-name claims are not full anonymity: network metadata, timing, recipient keys and campaign membership can still be linked. Organizer views use access controls and omit player credentials and payloads; this is not cryptographic protection from the operator.

1. **What stays private?**
   - On-chain, the sender, receiver and amount are shielded, and the memo (order tag + cart hash) is encrypted.
   - Gift card codes and eSIM activation strings are never stored, logged or sent to the AI in readable form. They're sealed to the buyer's per-order key, and only the buyer's browser can open them.
   - Phone numbers are encrypted in the browser and stored only as ciphertext. They're decrypted only for the Bitrefill call, then wiped.
2. **What does the app reveal, and to whom?**
   - **The light-wallet server** (`testnet.zec.rocks`) sees our watcher's IP address and sync timing. The buyer's wallet uses its own light-wallet server, which sees the buyer's IP address.
   - **Our server** stores order metadata: product, price, ZEC amount, memo tag, cart hash, the buyer's public key, txid, block height, Bitrefill invoice and order IDs, and ciphertext. A sealed phone number sits next to its order (and its txid) until fulfillment, then it's wiped. The agent log keeps a hashed session ID, event names and metadata only, never chat text. For mission rewards, it also stores each campaign (title, country, budget, allowlist, hashed invitation) and each claim (hashed claim secret, the player's public key, preferences and the chosen package). A claim points to the sponsor's order, so the player's key is linked to that order and its txid.
   - **The fulfillment function** holds the plaintext code or phone number in memory for the duration of the Bitrefill call, then seals or wipes it.
   - **Bitrefill** sees the purchase, the phone number for top-ups and our account. It can re-fetch codes by order ID.
   - **The AI model provider** (Anthropic) sees the chat, which is filtered for phone numbers, keys and code-like strings on a best-effort basis, plus tool results: product IDs, prices, order IDs and statuses. When it picks a mission reward, it receives the campaign's country, the player's structured preferences (purpose, number of days, whether the phone supports eSIM) and the allowed packages with prices. It gets no name, email, key or code, and no tools.
   - **The buyer's wallet** (for example Noir) sees our address, the amount and the memo.
   - **The BTC price feeds** (Coinbase, with Kraken as a backup) see our server's IP address. No user data is sent to them.
   - **The host:** TODO, name the hosting provider.
   - **Reclaim** (only if the Reclaim mission is turned on): its servers and attestors see the proved values during verification. Anyone holding Zealed's server secret and a guest's Luma user ID could link that guest to their claim.
   - **FROST treasury** (not live yet): the participants' wallets exchange the key-generation and signing messages as shielded memos.
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

**Mission workflow:** the agent selects from organizer-approved catalog packages using the player’s purpose, duration and device compatibility. Sponsor approval creates a purchase request; confirmed shielded authorization triggers deterministic fulfillment. The fixed quiz is checked by the server, never graded by the model. The shopping-agent tools below remain available in `/chat`.

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
  - **Other limits:** one purchase per order, through an atomic claim. An uncertain outcome is reconciled, never retried blindly. Quotes and proposals expire after 15 minutes. In live mode, fulfillment re-prices the product before it buys. A rise of more than 5% over the approved price, or any price above the cap, stops the purchase.
- **Purchase proof:** TODO, the invoice ID of a paid purchase plus the video timestamp. So far, both flows have made real API purchases of Bitrefill's test products. Mission rewards: invoices `7d8e4569-daa5-4de9-9a35-518b7d42c47f` (eSIM) and `2cc79a30-29c6-423a-9d7a-8844d63b671a` (gift card). Checkout: invoices `98d4f316-c3fa-482a-9137-91723064b4e5` (gift card) and `3f51bca9-39bc-4579-bd51-6df1fc584d4b` (eSIM). Test products cost nothing; the balance was 0 before and after.
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
- `@reclaimprotocol/js-sdk` 5.8.3, for zkTLS mission proofs (optional and not live)
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
- **Mission selection:** the model receives only structured preferences, country and a bounded list of eligible packages. The server validates its selected index and copies product/price fields from the catalog, never from generated text. Eligibility and sponsor approval are enforced outside the model.
- **The agent never touches secrets.** Its tools take and return identifiers and metadata only. A deterministic function, not the LLM, makes the purchase.
- **Seal on arrival.** Bitrefill's response is sealed to the buyer's key as soon as it arrives, and only the ciphertext is stored.
- **One key per order,** so orders can't be linked by key. The key can be exported as a backup string.
- **A payment is bound to its cart.** The memo carries a hash of the order, product, package, price, amount, buyer key and expiry. A receipt counts only with the exact recipient, a shielded pool (Ironwood or Sapling), the exact amount and the matching hash. Each txid matches one order only.
- **The server holds a viewing key only.** Spending keys and seeds never reach the app, the database, logs or the AI.
- **Fail closed.** With no verified real Zcash backend, checkout refuses to start. Simulated payments are refused in production.
- **Money is integers:** USD cents and zatoshis, never floats.
- **Guardrails live in code, not in the prompt.** Approvals are signed, budget reservations are atomic, and limits are re-checked before buying.

**Code worth reading:**
- `lib/campaigns.ts` and `lib/sponsor-order.ts`: hashed invitations, atomic single-use claims, and a sponsor approval that creates exactly one order bound to the player's key.
- `lib/reward-agent.ts`: the model picks an index from a bounded list of eligible packages, and the server copies the product and price from the catalog, never from the model's text.
- `lib/campaigns.test.ts`: concurrent approvals, attempt limits, key substitution and HTTP authorization.
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

## 8. What's next (30 days)

- **Next milestone:** a bounded pilot with one event or community organizer by Fri 4 Dec 2026, with their feedback recorded here.
- **After that:**
  - Campaigns with many claims, plus budget accounting, revocation and safe expiry. Uncertain purchases stay reserved until they're reconciled.
  - Claim links shared over Telegram or any other chat. The sealed copy is deleted after the first open or after a timer.
  - Make the Reclaim mission live, with a custom Reclaim provider for approved Luma attendance, and run the FROST 2-of-3 treasury's key generation on testnet.
  - A zero-knowledge proof of the mission answer, bound to the campaign and the player's key, with campaign-scoped nullifiers to stop replays. It proves a statement about the answer, not that the player is a unique human.
  - Pooled sponsor funding and refunds, designed separately: custody, currency conversion, fees, who may refund, and how pending claims settle. Testnet TAZ can't be spent as Bitrefill credit.
  - Network privacy for the watcher (Nym), shorter metadata retention, and issuers encrypting straight to the player's key.
- **Not planned for now:** pooled deposits, automatic refunds, several missions per campaign, broad global inventory and dispute handling.
- **Who benefits:** TODO: name a real organizer, partner or project.
- **Already started:** TODO: links to an upstream issue or PR, a partner thread, or a post in [What are you building on Zcash?](https://forum.zcashcommunity.com/t/what-are-you-building-on-zcash/55172). No organizer demand or partnership is claimed yet.

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
