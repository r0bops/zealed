# Zealed — private mission rewards

A sponsor offers a bounded perk, a player completes a mission, and an agent selects an eligible Bitrefill package. A confirmed shielded testnet payment authorises fulfillment. The redemption payload is sealed to the player's browser key and decrypted locally.

## Product scope

- `/campaigns`: organizer access, catalog search, campaign creation, invitation QR, status and sponsor approval/payment.
- `/claim`: open an invitation or resume one saved on this browser.
- `/claim/[id]`: mission, reward preferences, agent selection and delivery.
- `/orders` and `/order/[id]`: existing order status and local decryption.
- Standalone shopping chat is removed. `/chat` redirects to `/claim`; old orders bookmarks redirect to `/orders`. `POST /api/agent` and `POST /api/orders` return 410 without model or purchase calls.
- One claim per campaign, 24-hour campaign expiry, one selected gift card or eSIM. Top-ups and resale are not offered by campaigns. Existing order history remains readable.
- No pooled deposit, escrow, automatic refunds or multi-claim campaign funding.

## Reward flow

1. An organizer authenticates with `CAMPAIGN_ADMIN_TOKEN`, sets a destination, budget and one to five allowed products, and verifies issuer restrictions.
2. The server generates a random invitation token and stores its hash. The share link carries the token in its URL fragment.
3. The player creates a browser X25519 key and a separate claim-access secret. Both survive same-browser reloads in IndexedDB.
4. The player completes the fixed quiz or, when configured, a Reclaim proof. Claims are reserved atomically. Five mission attempts per invitation; a quiz does not establish identity or unique humanity.
5. The player supplies structured purpose, duration and eSIM compatibility. The server filters eligible catalog packages by allowlist and budget. The model chooses an index; product and price fields come from the catalog, not generated text. Up to three selection attempts.
6. The organizer approves the exact reward. The server atomically reserves spending and binds an order to the player's key. A ZIP-321 request includes amount, address and a cart-hash memo.
7. The sponsor pays shielded testnet TAZ. The watch-only zkool backend detects the receipt; the watcher checks amount, memo, pool and confirmations. Broadcast alone never authorises fulfillment.
8. Fulfillment claims the order once, rechecks the live price and spending limits, and buys from Bitrefill using separate event credits. It seals redemption data immediately and stores ciphertext only.
9. The player's claim secret authorises order reads. The browser decrypts the payload; codes and activation QR remain masked until Reveal.

## Payments and spending

- Zcash NU7 public testnet; TAZ is worthless and does not pay Bitrefill. Bitrefill has no testnet. Purchase modes are simulate, test product and live.
- Every reward needs organizer approval, regardless of the legacy automatic-spend threshold.
- Campaign budget: at most $20. Configured per-order and daily caps also apply; the default daily cap is $25.
- Quotes expire after 15 minutes. Expired unpaid orders can be re-approved while their campaign remains valid. Paid or uncertain orders cannot be replaced automatically.
- Small live-price drift is tolerated only within the configured limits and campaign budget. The current quoted cost is reserved atomically; this is not an atomic supplier price lock.
- One transaction ID matches at most one order. A purchase is claimed before contacting Bitrefill. Unknown outcomes are never blindly retried.
- Interrupted inactive purchases become uncertain after ten minutes. A saved invoice can be reconciled read-only; missing invoice IDs require operator investigation.
- Missing redemption data does not count as delivered.

## Privacy and trust

- Browser keys, claim secrets and invitation tokens are capabilities. Losing browser storage can lose access; a key backup alone does not restore claim authorization on another device.
- The database stores campaign/order metadata, hashed invitation and claim secrets, recipient public keys, payment references and encrypted redemption payloads. It is not metadata-private.
- The sponsor sees product, package, price, counts and payment state. The sponsor API does not reveal player keys, claim secrets or redemption ciphertext.
- The model receives country, structured preferences and eligible package metadata. It receives no player identity, decryption key or redemption code.
- Bitrefill and the fulfillment process briefly handle plaintext redemption data before sealing. Bitrefill may retain that data. The server operator controls the delivered JavaScript; this is a trust boundary.
- Reclaim proofs are verified in memory. Attendance mode stores a keyed per-event nullifier. The provider must prove approved attendance; live provider suitability remains unverified. Mission configuration currently applies globally.
- FROST treasury code is experimental and is not required for the reward flow. Live DKG/signing and independent co-signer approval remain unverified.

## Implementation

Next.js App Router, React, TypeScript, Tailwind, AI SDK with Anthropic, libsodium, Drizzle/better-sqlite3, IndexedDB, Noir Wallet SDK, zkool GraphQL and Bitrefill REST v2. Optional Reclaim proof verification and FROST treasury scripts are documented in README.

Core modules: `lib/campaigns.ts`, `lib/reward-agent.ts`, `lib/sponsor-order.ts`, `lib/orders.ts`, `lib/fulfill.ts`, `worker/watcher.ts`, `lib/keystore.ts` and `app/order-details.tsx`.

Tables: campaigns, reward_claims, attendance_nullifiers, orders, spend_reservations, agent_events and kv. Historical listing data is retained; removal of chat does not delete existing records.

Run `pnpm test`, `pnpm typecheck` and `pnpm lint` for automated checks. `pnpm build` produces standalone output and removes environment-file copies, rejecting accidental local databases. Runtime credentials and storage must be supplied separately. `pnpm e2e:rewards` performs a real testnet payment and may purchase through Bitrefill according to server configuration; run it only with explicit purchase authorization.

README records historical live testnet/test-product evidence and distinguishes unverified features. Paid real-product delivery, public deployment, multi-claim campaigns, cross-device claim recovery and stronger eligibility are outstanding work.
