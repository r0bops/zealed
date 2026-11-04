<!--
DRAFT. Before submitting:
- Replace every "TODO" (grep -n TODO README.md).
- Delete all HTML comments, this one included.
- Keep the pitch identical to the one on the Stadium form.
- Flip each 🟡 row in "What actually works" to ✅ only once you have evidence for it.
-->

# Zealed — private mission rewards

> Complete an event’s missions, unlock one prize, and receive a gift card, eSIM, testnet Zcash or custom reward—with codes sealed to your browser.

## Event missions and prizes

Zealed is an event rewards system: organizers define a checklist of quizzes, social-media actions and custom tasks. Participants must complete every required task before choosing a prize: a Bitrefill gift card, an eSIM, a shielded Zcash testnet payout or an organizer-defined reward.

**Implemented and deployed:** configurable task checklists, organizer review, one-prize redemption, encrypted custom instructions and organizer-reported testnet payouts. They run at [tryzealed.xyz](https://tryzealed.xyz), where Bitrefill purchases are in test mode. Automated checks cover these paths; the historical live Bitrefill evidence below applies to the earlier single-mission flow. New multi-task Bitrefill delivery and direct Zcash payouts have not been run on the live services.

- Organizers configure immutable mission requirements and available reward types per invitation. The existing one-participant, one-use invitation limit remains; create separate invitations for additional participants.
- Quiz answers are checked on the server; answer keys are omitted from participant responses. Pass/fail feedback and five attempts do not prevent guessing or answer sharing.
- Social-media actions and custom tasks use explicit organizer review of submitted public evidence. This is human verification, not automatic proof of a social account or AI certification. The existing Reclaim attendance flow remains available for legacy invitations.
- Reward redemption is locked until every task is approved. Repeated requests must not create extra rewards or purchases.
- Gift cards and eSIMs reuse agent selection, sponsor approval, shielded payment authorization, spending reservations and encrypted Bitrefill fulfillment.
- Zcash prizes are direct shielded **testnet TAZ** transfers from the sponsor wallet to the participant's address. A submitted transaction is not treated as confirmed delivery; participant acknowledgment is recorded separately. Automatic chain verification and mainnet payouts are outside this extension.
- Custom rewards are fulfilled by the organizer. Private instructions/codes are encrypted in the organizer's browser to the participant's key. Physical fulfillment is explicitly organizer-managed.
- Social evidence and payout addresses are visible to the organizer and server. Do not submit passwords, private account data or redemption codes as task evidence.
- Sponsors start with **Start funding**, with no account or token. The browser creates an anonymous sponsor key and keeps it in localStorage; the server stores only its SHA-256 hash. Each sponsor lists, reviews and approves only the campaigns it created, and other sponsors' campaigns answer 404. Open sponsors are capped at $5 per campaign and 5 campaigns a day, with 300 new sponsor sessions a day site-wide. Open access switches off automatically when purchases are set to live. The operator token still works as an override that sees every campaign.
- The landing page offers two role cards, **Fund a reward** and **Claim a reward**. `/claim` scans the invitation QR inside the app where the browser supports it, accepts a pasted link, and lists claims saved in this browser. Sponsors can show the invitation QR full screen.
- **One-time sealed gift links (built, not live yet).** A participant can pass a delivered reward to a friend through any chat, Telegram included. The friend's browser opens the link and creates a key. The giver confirms the friend's key code, then re-seals the reward to that key in their own browser. The friend's browser opens it once, and the server deletes the row in the same transaction. Details are in [section 5](#5-privacy-and-trust).
- Organizer, participant and order pages adopt the dark, gold, pixel-grid landing theme with responsive forms and navigation.

**Public access:** standalone shopping chat and checkout are disabled (`POST /api/agent` and `POST /api/orders` return 410). `/chat` redirects to `/claim`; existing orders remain accessible at `/orders`. The agent selects rewards only through authenticated campaign claims. The shopping UI, agent tools, signed proposals and obsolete shopping scripts have been removed. Earlier checkout transaction evidence is retained as historical evidence.

**Historical live evidence:** the earlier bounded mission-rewards flow ran end to end for real: one invitation per campaign, a fixed mission, constrained agent selection, sponsor approval and encrypted player delivery. On 4 Nov, the following happened in about 71 seconds:
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
| **What it is** | Organizer/player mission rewards; standalone shopping disabled |
| **Live URL** | https://tryzealed.xyz (also https://www.tryzealed.xyz). Bitrefill purchases there run in **test mode**, so codes aren't redeemable. Sponsors start with **Start funding**; no token is needed |
| **Demo video** | TODO: https://… (2–3 minutes) |
| **Testnet txid** | `1843616532cee751cbe556e902723d47b6675b6c92300b24070b8b6d1961f9ca`: a sponsor's shielded payment authorising a mission reward, mined at height 4581978. [explorer](https://testnet.zcashexplorer.app/transactions/1843616532cee751cbe556e902723d47b6675b6c92300b24070b8b6d1961f9ca). The first checkout payment was `1bb9548ea9ee04da491071e86f7287391aa52f3260c51ce6219324615768defd` (height 4581712). |
| **Real purchase invoice ID** | TODO: needs event credits and `BITREFILL_PURCHASES=live` |
| **Bitrefill test-product invoices** | `7d8e4569-daa5-4de9-9a35-518b7d42c47f` (mission reward, eSIM) · `2cc79a30-29c6-423a-9d7a-8844d63b671a` (mission reward, gift card) · `306668d4-01cd-4294-a08c-a6e94641eb11` (attendee-checked reward, gift card) · `98d4f316-c3fa-482a-9137-91723064b4e5` (checkout gift card) · `3f51bca9-39bc-4579-bd51-6df1fc584d4b` (checkout eSIM). Real API purchases of Bitrefill's free test products; the codes aren't redeemable |
| **Team** | TODO: Name (@handle) |

**Which parts serve which track**

| Privacy (Zcash) | Agentic Commerce (Bitrefill) |
|---|---|
| ZIP-321 checkout with the order tag and cart hash in an encrypted memo | Reward agent selecting from allowed packages using structured preferences |
| Watch-only payment detection with a viewing key (zkool_graphql) | Guardrails: campaign allowlists, sponsor approval, atomic budget reservations |
| Exact receipt matching: recipient, shielded pool, amount, memo and confirmations | Automatic fulfillment through Bitrefill REST v2, polled until delivered |
| Reward codes and activation data sealed to the player's browser key | Delivery that the agent can't read: the result is sealed to the buyer before it's stored |
| Pay from the browser with Noir Wallet | |

---

## 1. The problem and who it's for

- **Intended user:** an event or community organizer offering useful perks to participants who complete a mission. Participants should not need to submit names or emails to Zealed to claim a reward.
- **Problem hypothesis:** organizers need bounded reward distribution without copying redemption codes into spreadsheets or messages. Participants need perks they can actually redeem, chosen for their destination, device and preferences. This need has not yet been validated with an organizer.
- **Existing foundation:** Zealed originally served buyers of gift cards, eSIMs and top-ups through shopping chat, shielded payment authorization, and encrypted delivery. The rewards workflow separates sponsor authorization from recipient delivery.
- **Evidence:** TODO. Use real evidence only: quotes from people you spoke to at the venue or in the mentors chat, a documented incident or issue thread, or a partner asking for it. Don't invent users, quotes or demand.

## 2. Mission-rewards flow

1. An authenticated organizer defines 1–10 required tasks and available prize types. Requirements are immutable after creation. A campaign has one invitation, one participant and a 24-hour expiry; joining reserves it before tasks begin.
2. The participant opens the QR/link and creates a local encryption key plus a separate claim secret. Quizzes are checked server-side. Social and custom tasks accept public evidence URLs for organizer approval; the server and organizer can read these links. Each task has at most five submissions.
3. Every task must be approved before redemption. The participant chooses exactly one prize. Its type and any payout address become immutable; retries cannot reserve another prize.
4. **Gift card / eSIM:** the agent compares allowed packages against country, budget, duration and device needs. The organizer approves the exact package, then authorises it with a shielded testnet payment. Confirmed payment triggers Bitrefill fulfillment from separate event credits, with existing spending limits and duplicate-purchase protection. Codes are sealed before storage and decrypted locally.
5. **Zcash:** the participant supplies a testnet unified address. The organizer sends TAZ from their wallet and records the transaction ID. Address validation checks format only, not the receiver or checksum. Zealed does not verify destination, amount or confirmations for these direct payouts. The participant checks their wallet and separately acknowledges receipt.
6. **Custom reward:** the organizer encrypts instructions in their browser to the participant’s public key. The server stores ciphertext. The participant decrypts locally and acknowledges receipt. This is not proof of physical delivery; the organizer necessarily knows the instructions they issue.

**Legacy invitations:** existing campaigns without a task checklist keep their fixed quiz, email-list attendance check (`MISSION_MODE=email`), or optional Reclaim zkTLS mission. These global modes do not apply to new checklist campaigns. The email check proves allowlist membership, not ownership of an email address; live Reclaim proof completion remains unverified.

**Implemented claim controls:** hashed invitation tokens, expiry, authenticated sponsor access (an anonymous sponsor key or the operator token), atomic single-use claims, backend product restrictions, five mission-answer attempts, at most three model-selection attempts, and recovery of uncertain purchases with known invoice IDs without buying again. Claim read access uses a separate secret stored in the player’s browser; invitation and claim secrets are hashed on the server. A public QR can be copied; one claim per key is not one claim per human. Invitation limits bound spending but do not prove attendance or prevent answer sharing.

**Candidate perks for international participants.** Our Bitrefill account's access to these isn't verified yet:

| Candidate | What still needs checking |
|---|---|
| Bitrefill Global / Asia / Europe eSIM | The public listing is verified. Our account's access, the live price, regional coverage and redeemability still need checking, and the player needs a compatible unlocked phone. "Global" doesn't mean every country. |
| Uber & Uber Eats International voucher | The exact product, country and currency restrictions, and account eligibility. |
| NordVPN / Surfshark International | The exact product, price, and account and redemption requirements. |
| FlightGift / AirlineGift / TripGift | Account access and redemption conditions. Bookings can need passenger details, so these are left out for now. |

Sources: [Bitrefill Global eSIM](https://www.bitrefill.com/np/en/esims/bitrefill-esim-global/), [Uber gift-card restrictions](https://gifts.uber.com/giftcards). The Uber page covers its gift cards in general, not the international voucher.

Zealed doesn't promise "global, no-KYC" perks. It avoids collecting names and emails, but issuers still set their own requirements. US-only cards (Amazon.com, Apple US, US prepaid Visa and Mastercard, Airbnb USA) are left out of international campaigns.

## 3. Run and try Zealed

### Try the live site

Bitrefill purchases on https://tryzealed.xyz run in test mode: real API calls for Bitrefill's test products, whose codes can't be redeemed.

1. Open https://tryzealed.xyz and choose **Fund a reward**. Click **Start funding**. Your browser creates an anonymous sponsor key; there's no sign-up. Clearing this site's data loses access to your campaigns.
2. Create a campaign: tasks, prize types and, for gift cards or eSIMs, a budget of up to $5 and the allowed products. Open sponsors can create 5 campaigns a day.
3. Share the invitation link or show its QR full screen. On another device or browser, open it, or choose **Claim a reward** and scan or paste it at `/claim`.
4. Complete the tasks as the participant, then review them on the sponsor side. When every task passes, the participant picks one prize.
5. A gift card or eSIM needs the sponsor to approve the exact package and pay the shielded testnet request from a NU7 testnet wallet. The participant's browser then decrypts the delivered test code.

### Run it yourself

1. Choose how sponsors get in, in `.env.local`:
   - **Open sponsors:** `SPONSOR_OPEN_ACCESS=1` shows **Start funding** on `/campaigns`. It works only while `BITREFILL_PURCHASES` isn't `live`. Optional caps: `OPEN_SPONSOR_MAX_CENTS` (default 500, so $5 per campaign), `OPEN_SPONSOR_CAMPAIGNS_PER_DAY` (5) and `OPEN_SPONSOR_SESSIONS_PER_DAY` (300 site-wide).
   - **Operator override:** `CAMPAIGN_ADMIN_TOKEN`, a random secret of at least 32 characters, sees every campaign. Keep it out of Git and share it only with a trusted organizer. It's held in browser memory after login, not placed in URLs. It's required when open access is off.
   - Set the model, wallet and Bitrefill configuration as described below.
   - **For the attendee mission:** set `MISSION_MODE=email` and `LUMA_EVENT_ID`, then import the guest list with `npx tsx --env-file=.env.local scripts/attendees-import.ts <luma-guests.csv>`. It keeps approved guests only and stores hashes, never emails.
   - **To try it without a real list:** import `demo/luma-guests-demo.csv` (fictional `example.org` guests), then claim as `judge@example.org`. `carol@example.org` is pending and `dave@example.org` is declined, so both are refused.
2. Open `/campaigns`, click **Start funding** or unlock with the operator token, configure required quizzes/social/custom tasks and select prize types. For gift cards/eSIMs, allow 1–5 catalog products, including each offered type; verify issuer restrictions and set a budget up to $20 ($5 for open sponsors). Custom-only or Zcash-only campaigns do not need catalog access. Quiz checks require the configured `FULFILL_SECRET_KEY` or an explicit `TOOL_APPROVAL_SECRET` on the server.
3. Create a one-use invitation. Save its link immediately: the server stores only its hash. Its secret travels in the URL fragment, is stored locally by the player, and is removed from the address bar. Treat it as a bearer invitation: anyone holding it can reserve the claim.
4. Open the invitation on a separate browser/device, join, answer quizzes and submit public evidence. Use **Review tasks & fulfill prize** in the organizer workspace to approve or reject evidence. When all tasks pass, the participant reserves a prize.
5. For Bitrefill, the participant asks the agent to select a package; the organizer approves and pays the exact shielded testnet request. For custom rewards, the organizer uses **Seal & send instructions**. For Zcash, send once from the organizer wallet, then record the txid; recording it is not on-chain verification. Model credentials are needed only for Bitrefill selection.
6. Return to the participant browser to open the delivery and, for direct/custom rewards, acknowledge receipt. `/claim` resumes saved invitations; `/orders` lists Bitrefill and historical purchase orders. Keys and claim access persist in IndexedDB. A private-key backup alone does not restore cross-device claim access.

**Modes and recovery:**
- The organizer screen shows the catalog mode and the purchase mode.
  - **simulate** is the default when `BITREFILL_PURCHASES` is unset or there's no Bitrefill API key. Its result is labelled SIMULATED.
  - **test** buys Bitrefill's free test products, whose codes can't be redeemed.
  - **live** buys real products from event credits.
- A sponsored order expires 15 minutes after approval if it isn't paid, and then the sponsor can approve the reward again. An expired order that already saw a payment stays bound, so a reward can't be bought twice.
- Prices are re-checked at approval and at purchase. They may rise by at most 5% from the approved price (BTC/USD moves between steps), and never above the campaign budget or the per-order cap.
- An uncertain purchase is reconciled before anything else is bought.
- Cross-device claim recovery isn't built. A backup of the decryption key alone doesn't restore the separate claim secret.
- A sponsor key lives in that browser's localStorage. Clearing site data loses access to that sponsor's campaigns; the operator token still sees them.

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
| Configurable quizzes + reviewed social/custom tasks; one-prize redemption | ✅ local browser flow and automated checks | `lib/program.test.ts`: all-task gating, authorization, attempt limits, reward locking and expiry. Browser flow used real local routes and a temporary database; no external reward purchase |
| Custom reward instructions sealed by organizer and opened by participant | ✅ local browser flow | Create → join → quiz → evidence → review → reserve → seal → decrypt → acknowledge → reload. Synthetic collection instructions, no physical delivery claimed |
| Direct Zcash prize | 🟡 built; no live payout verified | Wallet-send UI, format-only address checks, unique reported txid and separate participant acknowledgment; no destination/amount/confirmation verification |
| Agent selects from allowed catalog packages within the campaign budget | ✅ real with test-product delivery | Mission-rewards runs below |
| Guardrails and authenticated sponsor approval | ✅ implemented and tested | `lib/guardrails.ts`, `lib/sponsor-order.ts`, `lib/safety.test.ts` |
| Player browser key and local reward decryption | ✅ real | `lib/keystore.ts`, `app/order-details.tsx` |
| ZIP-321 request with order tag + cart hash memo | ✅ real | `lib/zip321.ts`, `lib/cart.ts` |
| Shielded payment from a wallet (CLI payer through `pnpm zkool:pay`) | ✅ real, NU7 testnet | txid `1bb9548e…8defd`: 0.12966881 TAZ for order `80cceeb9`, mined at 4581712 about 60 s after sending |
| Shielded payment from the buyer's browser with Noir Wallet | 🟡 built; not yet run on testnet | TODO: txid |
| Watch-only detection and confirmation via zkool_graphql | ✅ real | The watch-only account (UFVK, birth 4581688) matched the memo tag, cart hash, exact amount and recipient, then marked the order paid after 1 confirmation. TODO: video timestamp |
| Bitrefill purchase triggered by the confirmed payment, polled until delivered | ✅ real API purchases of Bitrefill **test products** (`BITREFILL_PURCHASES=test`) | **Gift card:** order `6c279e24`, txid `7bc881c3cce15e0f5b24256f0c0de4a517c752760187f07faf210fcd07be8334` (height 4581762), invoice `98d4f316…`. **eSIM** through `POST /esims`: order `49efc554`, txid `a352f788e27c073937b31ff40de810bcd27a434a2af5f067bc9df605062158ed` (height 4581766), invoice `3f51bca9…` |
| Paid Bitrefill purchase of a real product | 🟡 not yet. It needs event credits and `BITREFILL_PURCHASES=live` | TODO: invoice ID, video timestamp |
| Mission rewards end to end: campaign, mission, claim, agent selection, sponsor approval, shielded payment, Bitrefill purchase, player decryption | ✅ real on NU7 testnet, with a Bitrefill **test product** (`BITREFILL_PURCHASES=test`) | Campaign `b9761ef5` ($5 budget, India, two allowed products). Claim `a831d415`. Claude Haiku chose the India eSIM 1 GB / 7 days at $3.89. Order `f0b73cca`: 0.12967367 TAZ, txid `1843616532cee751cbe556e902723d47b6675b6c92300b24070b8b6d1961f9ca` (height 4581978). Delivered 71 s after sending: invoice `7d8e4569-daa5-4de9-9a35-518b7d42c47f`, Bitrefill order `6aeb1f39ff6775c18aed6e10`. The player decrypted the eSIM activation string locally. **Gift card path:** campaign `e8f9427e`, where the agent chose a Flipkart ₹50 card ($0.56). Order `bc64314b`, txid `89eff39bc9db8418d51eea75c9cfb3bb9462b1e0138ea687a017e3f4fe41f114` (height 4582006), invoice `2cc79a30-29c6-423a-9d7a-8844d63b671a`, decrypted by the player. Script: `scripts/e2e-rewards.ts`. TODO: video timestamp |
| Result sealed to the buyer, decrypted locally, phone wiped | ✅ in the real-payment runs: a gift card code, and a real eSIM LPA string with its QR code rendered in the browser | orders `6c279e24` and `49efc554`, `lib/safety.test.ts` |
| Mission proved with a Reclaim zkTLS proof instead of the quiz | 🟡 built and tested with mocked proofs; no live proof yet | `lib/reclaim.ts`, `app/claim/reclaim-verify.tsx`, `lib/reclaim.test.ts`. The proof is bound to the claim by a hash of the campaign and the player's key, then checked with Reclaim's `verifyProof` plus provider and freshness checks. Only `{verified, providerId}` is kept. A custom Reclaim provider for Luma (`10103ed6-3256-4a96-a2ae-d5230df0a649`) proves only the event ID, the approval status and the ticket key. Our server can create proof requests with our credentials, but no player has completed a live proof. It's inactive while `MISSION_MODE=email` |
| One reward per approved Luma attendee, without storing who they are | 🟡 built and tested; the Reclaim variant isn't live | The nullifier is a keyed HMAC of the event ID and a per-guest value: the email hash in the attendee mission, or the Luma user or ticket key in a Reclaim proof. It's kept in `attendance_nullifiers` (unique per event) and written in the same transaction as the claim, so the same attendee gets a 409 on another campaign |
| Attendee check against the organizer's imported Luma guest list | ✅ real on NU7 testnet, with a Bitrefill **test product** | `lib/attendees.ts`, `lib/attendee-hash.ts`, `app/claim/email-verify.tsx`, `scripts/attendees-import.ts`, `lib/attendees.test.ts`. The browser hashes `zealed:attendee:v1:<event>:<email>` with WebCrypto, and the server stores only the approved guests' hashes. **Live run (4 Nov, fictional demo list):** campaign `eab0e7a0`, claim `b8357326`. Only the browser-side hash of `bob@example.org` was sent, and the player appeared as "Attendee EBAF-F4BD". The agent chose Flipkart India ₹50 ($0.56). Order `123e9bf7`: 0.01867583 TAZ, txid `f1fa38e3bd4f2b7ce6225aa1911051c94652d7fab770ecbdddbb260f3d60631b` (height 4582200). Invoice `306668d4-01cd-4294-a08c-a6e94641eb11`, decrypted by the player 76 s after sending. The same email on a new campaign got 409 "This attendee has already claimed a reward." A scan of every database table found no email address |
| Rate limiting on public reward mutations | ✅ implemented and tested | `lib/rate-limit.ts`. Per client per minute: claim 10, agent selection 6, Reclaim request 10, approval 20, campaign creation 20, campaign list 60, Start funding 5, invitation 60, order status 120, program action 20 and organizer review/delivery 30. Counters live in memory under salted-hash keys; over-limit requests get 429 with `Retry-After` |
| Sponsor access with **Start funding** instead of a token | ✅ implemented, tested and deployed (test purchases only) | `lib/campaigns.ts` (`requireSponsor`, `ownedCampaign`), `app/api/sponsors/route.ts`, `lib/sponsors.test.ts`, `lib/sponsors-security.test.ts`. Tests cover: another sponsor's campaign answers 404 on every management route, forged or malformed keys get 401, existing sessions stop working when open access is off or purchases go live, the operator token sees every campaign, open-sponsor caps, hash-only key storage, and the Start funding rate limit. On tryzealed.xyz, `GET /api/sponsors` reports open access with a $5 per-campaign cap |
| Public deployment | ✅ live at https://tryzealed.xyz, Bitrefill test mode | A read-only smoke test there passed: the landing, `/campaigns`, `/claim` and `/orders` pages load, unauthenticated campaign listing gets 401, unknown campaigns and orders get 404, and the rate limit answers 429 with `Retry-After`. No full checklist campaign on the live site is recorded here yet |
| One-time sealed gift links (pass a delivered reward to a friend) | 🟡 built and tested; not yet linked from the order page and not live on the public site until the next deploy | `lib/gift-links.ts`, `lib/gift-envelope.ts`, `app/api/gifts/`, `app/gift/`, `lib/gift-links.test.ts`. Tests cover create → accept → seal → open returning the blob exactly once, first-accept-only (409 after), 404 for wrong tokens or roles, sealing only to the accepted key, cancel, expiry sweeps and the creation rate limit. An end-to-end test re-seals a reward to the friend's key and checks that the plaintext never reaches the database |
| FROST 2-of-3 sponsor treasury (organizer, co-sponsor, Zealed) | 🟡 built and tested against mocked zkool instances; a live DKG hasn't run | `lib/frost.ts`, `pnpm frost:setup`, `pnpm frost:pay`, using zkool's `dkgStart`, `dkgSetAddress` and `frostSign`. The DKG runs over shielded memos (about 3–15 min) and signing takes about 2–10 min. It needs three zkool instances. Risk: zkool's DKG mailbox addresses may be Orchard-only, which can't receive on NU7. Unverified |

**Reward verification:** 140 automated tests pass across 18 files. Coverage includes spending and payment boundaries, legacy attendance, all-task gating, organizer review, rejected submissions, immutable prize choice, encrypted custom delivery, payout recording, expiry, sponsor isolation and one-time gift links. CI runs install, typecheck, lint and these tests on every push and pull request. TypeScript, lint and the production build pass. An isolated browser check exercised the full quiz + social task → custom reward flow against real local routes and SQLite, including decryption and reload recovery. Landing, organizer, participant, invitation, history and order pages were checked at 320/375/768/1440 px without horizontal overflow. No external purchase or payout occurred in these checks. The extension is deployed at https://tryzealed.xyz, but no full checklist campaign has been run there yet; historical live evidence is listed separately.

**Known limitations:**
- New social/custom tasks require human review of public links; no social-platform API or account-ownership verification is implemented. Public links may reveal identity.
- Direct Zcash prizes are testnet only, at most 1 TAZ. Payout recording is manual and unverified; no automated payouts or mainnet funds. Custom rewards use encrypted instructions and participant acknowledgment, not fulfillment tracking with a shipping provider.
- Mission rewards support one claim per campaign. None of the missions proves unique humanity.
  - The quiz doesn't prove attendance.
  - The attendee check proves that an email is on the organizer's list, not that the player owns it. That's what a live Reclaim proof would add. Anyone who already has candidate emails can guess the hashes.
  - The real campaign runs bought Bitrefill's free test products. A paid real product is still to come.
- Rate limits live in one server process's memory, so they reset when it restarts.
- The guardrail daily spend cap ($25 by default) is global, not per sponsor. One open sponsor could use up the day's test budget for everyone. That's a denial of service, not a loss of funds, because open access is off when purchases are live.
- Sponsor keys don't expire and sit in localStorage, so an XSS bug would expose them. Clearing site data loses access to your sponsor campaigns.
- A sealed gift link can't revoke the giver's own copy of the code. Deleted gift ciphertext may linger in SQLite free pages or the WAL until it's overwritten.
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
   - **Our server** stores order metadata: product, price, ZEC amount, memo tag, cart hash, the buyer's public key, txid, block height, Bitrefill invoice and order IDs, and ciphertext. A sealed phone number sits next to its order (and its txid) until fulfillment, then it's wiped. The agent log keeps a hashed session ID, event names and metadata only, never chat text. For mission rewards, it also stores each campaign (title, country, budget, allowlist, hashed invitation) and each claim (hashed claim secret, the player's public key, preferences and the chosen package), task configurations and answer HMACs, public evidence URLs, review results, prize reservations and any payout address/reported txid. A claim points to the sponsor's order, so the player's key is linked to that order and its txid. For the attendee mission, it also stores SHA-256 hashes of the approved guests' emails (never the emails) and one keyed nullifier per claimed attendee. The organizer runs the guest-list import on the server, so the exported CSV passes through the operator's machine. For open sponsors, it stores the SHA-256 hash of each sponsor key with its creation time, and each campaign records its owner's hash. For a sealed gift link, it stores SHA-256 hashes of three tokens (the link, which only lets the friend register a browser key; the giver's token, which seals or cancels; and the accepting browser's token, which opens), the friend's public key and the ciphertext. It keeps no order, wallet, txid or link to the giver. Opening is a one-time read that deletes the row in the same transaction, and unopened gifts are deleted after `GIFT_TTL_HOURS` (default 72). The app's rate-limit counters are kept in memory under salted hashes, never as IP addresses. The web server in front of it (nginx) does write standard access logs for the whole machine: client IP address, time, requested path and user agent.
   - **The fulfillment function** holds the plaintext code or phone number in memory for the duration of the Bitrefill call, then seals or wipes it.
   - **Bitrefill** sees the purchase, the phone number for top-ups and our account. It can re-fetch codes by order ID.
   - **The AI model provider** (Anthropic) receives the campaign's country, the player's structured preferences (purpose, number of days, whether the phone supports eSIM) and the allowed packages with prices. It gets no name, email, key or code, and no tools.
   - **The organizer** sees task submissions, reward choice and delivery state. For custom delivery, the organizer receives the participant’s public encryption key and knows the instructions they issue; private keys and Bitrefill codes stay out of organizer responses. For direct Zcash payouts, the organizer and server see the destination address, configured amount and reported txid.
   - **The buyer's wallet** (for example Noir) sees the recipient address, amount and memo.
   - **The BTC price feeds** (Coinbase, with Kraken as a backup) see our server's IP address. No user data is sent to them.
   - **The host:** a VPS operated by the team, running Ubuntu. nginx terminates TLS with a Let's Encrypt certificate and proxies to the Next.js standalone server on 127.0.0.1:3100, which runs the payment watcher in the same process. `zkool_graphql` runs on 127.0.0.1:8000 as a watch-only wallet: it holds the viewing key, never a seed or spending key. The SQLite database sits on the server's disk. Both services run under systemd. Whoever controls the machine (the team, and the VPS provider underneath it) can read everything the server stores. Purchases there run in Bitrefill test mode.
   - **Reclaim** (only if the Reclaim mission is turned on): its servers and attestors see the proved values during verification. Anyone holding Zealed's server secret and a guest's Luma user ID could link that guest to their claim.
   - **FROST treasury** (not live yet): the participants' wallets exchange the key-generation and signing messages as shielded memos.
3. **Who do users have to trust?**
   - Zealed as operator: to release only after payment, and to serve honest JavaScript, because a malicious server could serve code that swaps keys.
   - The fulfillment function's brief handling of plaintext.
   - Bitrefill.
   - Anthropic.
   - The light-wallet servers.
   - The host: the team's VPS and its provider.
   - The sponsor's own browser, which holds the sponsor key in localStorage.
4. **What would we fix next?**
   - Route the watcher's traffic through Nym.
   - Delete order metadata after delivery.
   - Ship verified client builds, so a compromised server can't swap keys.
   - Have the issuer encrypt directly to the buyer's key, so no Zealed server ever sees plaintext.

**Payment confirmation threshold:** 1 block on testnet (`ZCASH_MIN_CONFIRMATIONS=1`).

**Viewing key (optional):** TODO: `uviewtest…` · birth height **4581688** (the demo receiving wallet). This key reveals that wallet's history but can't spend.

## 6. Agentic commerce with Bitrefill

**Mission workflow:** the agent selects from organizer-approved packages using purpose, duration and device compatibility. The server checks the selected package against the campaign policy. The sponsor approves every exact purchase and authorises it with a shielded payment. Confirmed payment triggers deterministic Bitrefill fulfillment; the player never checks out at Bitrefill. Mission verification, spending limits and sponsor authority are enforced outside the model.

- **Bitrefill integration: REST API v2** (`lib/bitrefill.ts`, `lib/fulfill.ts`):
  - product search and details, with the account-scoped cache
  - `POST /invoices` for gift cards and top-ups, `POST /esims` for eSIMs, both with `payment_method: "balance"` and `auto_pay: true`
  - polling `GET /invoices/{id}` and then `GET /orders/{id}` until the order is `delivered`
  - **Built:** the client, the purchase modes (simulate, test and live), the fulfillment state machine, guardrails, approvals, sealing and reconciliation. **Reused:** the Bitrefill catalog, balance payments and test products.
- **Payment method:** account balance (event credits). Bitrefill doesn't take ZEC, so the shielded testnet payment *authorises* the purchase rather than paying for it.
- **Guardrails:**
  - **Per purchase:** every reward needs authenticated sponsor approval. The campaign budget and configured per-order cap apply; campaigns cannot exceed $20. Open sponsors (Start funding) are capped at $5 per campaign and 5 campaigns a day, with 300 new sponsor sessions a day site-wide. Open access exists only while purchases are in test or simulate mode.
  - **Per day:** **$25** of agent orders in total, shared by every sponsor. Budget is reserved in one SQLite transaction at checkout, and re-checked when the purchase is claimed.
  - **Bitrefill's own caps:** 5 top-ups and 15 gift cards a day per account.
  - **Hard ceiling:** the Bitrefill balance, which holds only event credits.
  - **Other limits:** one purchase per order, through an atomic claim. An uncertain outcome is reconciled, never retried blindly. Payment requests expire after 15 minutes. In live mode, fulfillment re-prices the product before it buys. A rise of more than 5% over the approved price, or any price above the cap, stops the purchase. Public reward endpoints are rate-limited per client (for example 10 claims, 6 agent selections and 5 Start funding sessions a minute).
  - **Above the caps:** nothing is bought; the guardrail blocks the order and there's no in-app override. Only the operator can change the caps, in the server configuration. Switching purchases to live (`BITREFILL_PURCHASES=live`) also turns off open sponsor access.
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
- AI SDK 7.0.162 with `@ai-sdk/anthropic` 4.0.96, running Claude Haiku 5.5 (`claude-haiku-5-5`)
- libsodium-wrappers 0.8.4: X25519 key pairs and `crypto_box_seal`
- Drizzle ORM 0.45.4 with better-sqlite3 13.0.3, zod 4.6.7, qrcode 1.5.4, idb-keyval 6.3.0
- `@noir-wallet/sdk` 0.1.9 with the Noir Wallet testnet extension
- `@reclaimprotocol/js-sdk` 5.8.3, for zkTLS mission proofs (optional and not live)
- zkool2 `zkool_graphql` (v6.36.0 / main@98db198) as a watch-only wallet server, bound to 127.0.0.1, syncing through lightwalletd at `testnet.zec.rocks:443` on Zcash NU7 testnet
- Bitrefill REST API v2
- Coinbase and Kraken public price APIs, for BTC/USD
- vitest 5.1.0, tsx 4.23.15, pnpm 11.22.0, Node 22+
- Hosting: an Ubuntu VPS with nginx 1.28.3, Let's Encrypt TLS and systemd services; GitHub Actions for CI and deploys (Node 24)

**Architecture:**

```
Sponsor → /campaigns → Start funding (anonymous key) → allowlisted products, budget, one-use invitation
Player → /claim (scan or paste) → mission → structured preferences → reward-agent.ts
Sponsor approval → exact order + ZIP-321 request → shielded testnet payment
Watcher → confirmed receipt → fulfill.ts → Bitrefill (event credits)
Bitrefill redemption → seal to player key → SQLite ciphertext
Player → /orders → local decryption and masked reveal
```

**Deployment:**
- **Production** is https://tryzealed.xyz on the team's VPS. nginx serves it with a Let's Encrypt certificate and proxies to the Next.js standalone server on 127.0.0.1:3100, which also runs the payment watcher. The watch-only `zkool_graphql` runs on 127.0.0.1:8000. Both are systemd services, and SQLite is on the server's disk.
- **CI:** `.github/workflows/ci.yml` runs install, typecheck, lint and tests on every push and pull request.
- **Deploys:** on `main`, a deploy job asks the VPS to deploy that exact commit, through an SSH key restricted to one forced command. The server builds the new release next to the live one, switches over, and rolls back if the health check fails. The job skips until the repository's deploy secrets are configured; until then, deploys are run by hand with the same release-swap procedure.
- **Security headers** (set by nginx): HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a `Permissions-Policy` that allows the camera only for the site itself, for in-app QR scanning.

**Design decisions:**
- **Mission selection:** the model receives only structured preferences, country and a bounded list of eligible packages. The server validates its selected index and copies product/price fields from the catalog, never from generated text. Eligibility and sponsor approval are enforced outside the model.
- **The agent never touches secrets.** It receives structured preferences and eligible catalog packages only. A deterministic function, not the LLM, makes the purchase.
- **Seal on arrival.** Bitrefill's response is sealed to the buyer's key as soon as it arrives, and only the ciphertext is stored.
- **One key per order,** so orders can't be linked by key. The key can be exported as a backup string.
- **A payment is bound to its cart.** The memo carries a hash of the order, product, package, price, amount, buyer key and expiry. A receipt counts only with the exact recipient, a shielded pool (Ironwood or Sapling), the exact amount and the matching hash. Each txid matches one order only.
- **The server holds a viewing key only.** Spending keys and seeds never reach the app, the database, logs or the AI.
- **Fail closed.** With no verified real Zcash backend, checkout refuses to start. Simulated payments are refused in production.
- **Money is integers:** USD cents and zatoshis, never floats.
- **Guardrails live in code, not in the prompt.** Sponsor approval is an authenticated request checked against the campaign's owner, budget reservations are atomic, and limits are re-checked before buying.
- **Anonymous sponsors in test mode only.** Start funding gives a sponsor a random key that only its browser holds. The server stores its hash and scopes every campaign to it. Open access fails closed: it turns off when purchases are live.
- **Gift links carry ciphertext only.** The giver's browser re-seals a delivered reward to a key the friend's browser created, so the server relays ciphertext and deletes it on first open.

**Code worth reading:**
- `lib/campaigns.ts` and `lib/sponsor-order.ts`: hashed invitations, anonymous sponsor keys with per-sponsor ownership, atomic single-use claims, and a sponsor approval that creates exactly one order bound to the player's key.
- `lib/sponsors-security.test.ts`: sponsor isolation, forged keys and fail-closed sessions.
- `lib/gift-links.ts`: one-time gift links that hold token hashes, a public key and ciphertext only.
- `lib/reward-agent.ts`: the model picks an index from a bounded list of eligible packages, and the server copies the product and price from the catalog, never from the model's text.
- `lib/campaigns.test.ts`: concurrent approvals, attempt limits, key substitution and HTTP authorization.
- `lib/fulfill.ts`: buys at most once, seals the result immediately and wipes the phone number.
- `worker/watcher.ts` and `lib/zcash-zkool.ts`: exact, watch-only receipt matching.
- `lib/cart.ts` and `lib/zip321.ts`: binding the payment memo to the cart.
- `lib/orders.ts`: atomic spend reservations (`reserveOrder`, `claimFulfillment`).
- `lib/event-metadata.ts` and `lib/log.ts`: metadata allowlisting and secret redaction.
- `lib/safety.test.ts`: tests for the privacy, spending and payment boundaries.

**Built during the hack vs before:** all code in this repo was written during the hack (4–5 Nov 2026). It relies on the open-source libraries listed above.

**Reusable parts:**
- the watch-only zkool receipt adapter
- the cart-hash memo binding
- the guardrail and reservation module
- the event metadata allowlist

TODO: link any of these if you publish them as a package.

## 8. What's next (30 days)

- **Next milestone:** a bounded pilot with one event or community organizer by Fri 4 Dec 2026, with their feedback recorded here.
- **After that:**
  - Campaigns with many claims, plus budget accounting, revocation and safe expiry. Uncertain purchases stay reserved until they're reconciled.
  - Finish sealed gift links shared over Telegram or any other chat: link them from the delivered-order view and deploy them. The server side, the API, the gift button and the friend's page are built and tested; the sealed copy is deleted after the first open or after a timer.
  - Make the Reclaim mission live, with a custom Reclaim provider for approved Luma attendance, and run the FROST 2-of-3 treasury's key generation on testnet.
  - A zero-knowledge proof of the mission answer, bound to the campaign and the player's key, with campaign-scoped nullifiers to stop replays. It proves a statement about the answer, not that the player is a unique human.
  - Pooled sponsor funding and refunds, designed separately: custody, currency conversion, fees, who may refund, and how pending claims settle. Testnet TAZ can't be spent as Bitrefill credit.
  - Network privacy for the watcher (Nym), shorter metadata retention, and issuers encrypting straight to the player's key.
- **Not planned for now:** pooled deposits, automatic refunds, broad global inventory and dispute handling.
- **Who benefits:** TODO: name a real organizer, partner or project.
- **Already started:** TODO: links to an upstream issue or PR, a partner thread, or a post in [What are you building on Zcash?](https://forum.zcashcommunity.com/t/what-are-you-building-on-zcash/55172). No organizer demand or partnership is claimed yet.

## 9. Links

- Repo: https://github.com/r0bops/zealed
- Demo video: TODO
- Live app: https://tryzealed.xyz (Bitrefill test mode)

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
- Testnet explorer: https://testnet.zcashexplorer.app (`/transactions/<txid>`)
