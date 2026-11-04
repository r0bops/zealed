<!--
DRAFT. Before submitting:
- Replace every "TODO" (grep -n TODO README.md).
- Delete all HTML comments, this one included.
- Keep the pitch identical to the one on the Stadium form.
- Flip each 🟡 row in "What actually works" to ✅ only once you have evidence for it.
-->

# Zealed

> Zealed's AI shopping agent buys gift cards, eSIMs and phone top-ups for people in India. A shielded ZEC payment authorises each purchase, and the code is sealed to the buyer's browser key, so our database, our logs and our AI never hold it in readable form.

| | |
|---|---|
| **Tracks** | Privacy (Zcash) **and** Agentic Commerce (Bitrefill) |
| **Privacy theme** | 1. Private payment rails (checkout matched by memo) |
| **Bitrefill lane** | 5. Private by default |
| **What it is** | Web app with an AI shopping agent |
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

- **User:** people in India who buy phone top-ups, eSIMs and gift cards online, and don't want the code or their phone number to sit in a platform's database, logs or AI chat history.
- **Problem:** a gift card code or eSIM activation string works like cash. Once it leaks through a platform's database, logs, support tools or an AI agent's context, it can be spent before the buyer uses it. Top-up services also keep large lists of phone numbers tied to payments.
- **Evidence:** TODO. Use real evidence only: quotes from people you spoke to at the venue or in the mentors chat, a documented incident or issue thread, or a partner asking for it. Don't invent users, quotes or demand.

## 2. What it does

1. The buyer asks the agent for something ("the cheapest Airtel top-up"). The agent searches the live Bitrefill India catalog, prices it and runs the spending guardrails.
2. Orders up to $5 go straight to checkout, and orders between $5 and $20 show an **Approve / Decline** card. If the buyer declines, the agent suggests cheaper alternatives.
3. The checkout card creates a one-time key in the buyer's browser. For a top-up, the buyer types the phone number into a secure field, where the browser encrypts it.
4. The buyer gets a ZIP-321 shielded payment request (a QR code, or a **Pay … TAZ with Noir Wallet** button). Its memo carries the order tag and a hash of exactly what is being bought.
5. Zealed's watcher sees the shielded payment through a watch-only viewing key and waits for it to confirm. Then it buys the product from Bitrefill, paying from Zealed's credit balance.
6. The code or eSIM is sealed to the buyer's key on arrival, and the phone number is wiped. The buyer's browser decrypts it locally. Codes stay masked on screen until revealed, and eSIM QR codes are rendered in the browser.

![screenshot](./assets/screenshot.png) <!-- TODO: add the screenshot -->

## 3. Try it in 5 minutes

**Without installing anything:**
1. Open TODO: live URL and go to **Chat** (`/chat`). The orders you've made in that browser are in the same workspace, in the orders view (`/chat?view=orders`).
2. Ask: "Get me the cheapest Airtel top-up" or "A ₹50 Flipkart gift card".
3. Follow the checkout card. Pay the shielded request from a testnet wallet: the [Noir Wallet testnet extension](https://github.com/NoirWallet/noir-wallet/releases) (load the `-testnet.zip` build unpacked) or any NU7 testnet wallet that can scan a ZIP-321 QR code.
4. You should see the order go from awaiting payment to paid once the payment is mined, then to delivered. That takes about 1–2 minutes. Your browser decrypts the result locally, and the code stays masked until you click **Reveal**.

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
- A `fake` Zcash backend exists for local development only. It's labelled SIMULATED in the UI, it's refused in production, and it's never used in the demo.
- With zkool, the "seen in mempool" state doesn't appear. The transaction shows up only once it's mined, so orders go straight from awaiting payment to paid.
- Bitrefill delivery is detected by polling, not webhooks.
- ZEC is priced at a fixed demo rate (`ZEC_USD_RATE`), because TAZ has no market price. BTC/USD is fetched live, with a configured fallback.
- The Bitrefill purchases so far were test products, whose codes can't be redeemed. A paid purchase of a real product is still to come.
- The resale flow (seller-sealed codes) isn't built yet.
- The app and the watcher share one process and one SQLite file.

## 5. Privacy and trust

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

## 8. What's next (30 days)

- **Next milestone:** a sealed gift link over Telegram, by Fri 4 Dec 2026.
  - The buyer gets a one-time link to a code sealed in the browser, and sends it in any chat.
  - Only the person who opens it can read it.
  - The server deletes the sealed copy after the first open or after a timer.
  - In the safer version, the friend opens the link first, which creates their key, and the code is sealed to that key.
- **After that:**
  - route the watcher's traffic through Nym
  - delete order data after delivery
  - the resale flow with seller-sealed codes
  - a mainnet route for real ZEC through NEAR Intents to USDC to Bitrefill
- **Who benefits:** TODO, name a real user, partner or project.
- **Already started:** TODO, links to an upstream issue or PR, a partner thread, or a post in [What are you building on Zcash?](https://forum.zcashcommunity.com/t/what-are-you-building-on-zcash/55172).

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
