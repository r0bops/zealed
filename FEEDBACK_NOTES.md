# Development feedback notes

These are engineering notes for the human-written final FEEDBACK.md.

- Privacy review: truncating HTTP error messages still preserves sensitive response data. Expected only safe error metadata; synthetic-response regression tests demonstrated the leak. Errors now use fixed descriptions and allowlisted provider codes.
- Catalog modes: switching from simulated to live reused cached simulated products. Expected fresh live results; isolated tests reproduced the mismatch. Cache keys now separate account, mode, test-product visibility and conversion-rate configuration.
- Budget accounting: creation-date totals missed orders paid the next day. Expected spending and outstanding reservations to stay within the cap. Checkout now reserves budget in a SQLite write transaction; fulfillment rechecks limits and retains uncertain purchases across midnight.
- Build verification in the review environment encountered blocked Google Fonts access and a Turbopack worker port-binding restriction. No real payment or purchase was needed for the regression tests.

## Bitrefill (REST v2), verified live on 4 Nov

- Undocumented invoice status: a delivered invoice reports `status: "all_delivered"`, which isn't among the documented statuses (`complete`, `denied`, …). Our poller waited for `complete`, timed out, and marked a delivered order "uncertain". Expected: documented final statuses, or a single `is_final` flag. We now stop on each order's own status and reconcile uncertain orders by re-reading the invoice (never re-buying).
- Test eSIM product exists: `test-esim-product` (package "1GB, 7 Days", bought via `POST /esims`) works, but the test-products page lists no eSIM test product. Expected it listed with the endpoint to use.
- Test products are free with a zero balance: the docs disagree (the test-products page says free; the MCP guide says paying test products from balance debits real money; the API overview lists them for Business accounts only). Our account (Bearer key, balance 0 BTC) bought `test-gift-card-code` and `test-esim-product`; the balance stayed 0.
- Prices are in the account's balance currency: for our BTC-denominated balance, `packages[].price` is satoshis (7010 for a ₹500 Airtel top-up), with no field naming the unit, and `?currency=USD` is ignored. We read it as $7,010 until we checked `/accounts/balance`. Expected a `price_currency` field per package.
- Product type fields: the guides use `type: "gift_card" | "phone_refill" | "esim"`, but live responses carry `categories` (array) and `recipient_type` (`phone_number` / `account` / `none` / `mixed`). Packages use `id`, not the guides' `package_id`.
- India catalog drift: the builder pack's "Airtel talktime from ₹10" no longer exists (`airtel-india` has only ₹500/₹1000; cheapest is `airtel-bundles-india` "199: …" ≈ $2.19); `jio-india` returns 403 "not available for your account".

## Zcash tooling

- zkool2 `zkool_graphql` from source on Fedora 44: the vendored OpenSSL build fails with `Can't locate Time/Piece.pm` because Fedora splits Perl modules. Workarounds: `OPENSSL_NO_VENDOR=1` (system openssl-devel) or `dnf install perl-Time-Piece`; or use the prebuilt `zkool_graphql` asset on the v6.36.0 release. Running it without flags exits with "JWT authentication is required"; it binds to 127.0.0.1 by default, which isn't mentioned next to the `--allow-unauthenticated` warning.
- zkool `transactionsByAccount` listed our incoming payment only once mined, so the "seen in mempool" step never showed; `unconfirmedByAccount` has txid and value but no memo, so a memo-matched checkout can't use it.
- zexplorer.app's testnet index is ~76k blocks behind: our mined txids (and the faucet's) show "Transaction not found". testnet.zcashexplorer.app returns 403 to scripted requests.
- Fauzec's API worked first time (1 TAZ, txid returned immediately, mined within ~1 minute).

## Reclaim Protocol, 4 Nov

- The developer portal's in-browser provider builder fails every time with `ClientError: /channel.SessionService/GenerateSession UNKNOWN: Response closed without headers`. The portal bundle points its session service at `https://dev-tool.reclaimprotocol.org`, which has no DNS record (`getent hosts` returns nothing), while `devapi.reclaimprotocol.org` and `api.reclaimprotocol.org` respond. Expected: the portal to route to a live backend, or to say the DevTool is retired and link the MCP agent (`@reclaimprotocol/agent`, which uses devapi/api and works).
- The public "Luma Invited to an Event" provider proves an invite, not an approved registration: `event_id` comes from the URL slug, `user_id` is the invite's secret key, and `approval_status` is parsed from description text. A custom provider on `api.lu.ma/event/get` (`guest_data.approval_status`, `guest_data.ticket_key`) is needed for "approved attendee" checks.
- Credentials and SDK worked first time: `ReclaimProofRequest.init` with our app id and secret produced a portal request URL, and `toJsonString()` never contains the secret.
