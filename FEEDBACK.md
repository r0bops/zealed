# Feedback

This is what broke, confused or slowed us down while building Zealed at Free Society Hack 2026 (4 Nov 2026), grouped by area. Each item says what we tried, what happened, what we expected and how we worked around it.

## Bitrefill (REST API v2)

1. **A delivered invoice reports `all_delivered`, which isn't documented.**
   - We polled `GET /invoices/{id}` until we saw a documented final status (`complete`, `denied`, …).
   - A delivered test purchase came back as `all_delivered`, so our poller timed out and marked a delivered order as uncertain.
   - Expected: the full list of final invoice statuses in the docs, or an `is_final` flag.
   - Workaround: we stop on each order's own status (`delivered`, `failed`, `refunded`), and reconcile by re-reading the invoice, never by buying again.
2. **The eSIM test product isn't listed.** `test-esim-product` (package "1GB, 7 Days", bought through `POST /esims`) works, but the test-products page lists no eSIM. Expected: it listed, with the endpoint to use.
3. **The docs disagree on whether test products cost money.**
   - The test-products page says they're free.
   - The MCP guide says paying a test product from the balance debits real money.
   - The API overview lists them for Business accounts only.
   - With a Bearer key and a 0 BTC balance, `test-gift-card-code` and `test-esim-product` both went through, and the balance stayed at 0.
   - Expected: one answer, stated the same way in all three places.
4. **Package prices have no unit.**
   - For our BTC-denominated account, `packages[].price` is in satoshis (7010 for a ₹500 Airtel top-up). No field says so, and `?currency=USD` is ignored.
   - We read it as $7,010 until we checked `/accounts/balance`.
   - Expected: a `price_currency` field on each package, or `currency` being honoured.
5. **Field names differ from the guides.** The guides use `type: "gift_card" | "phone_refill" | "esim"` and `package_id`. Live responses carry `categories` (an array), `recipient_type` (`phone_number`, `account`, `none` or `mixed`), and packages with `id`. Expected: guides that match the live schema.
6. **Country-specific products don't show up in search.**
   - Searching "esim" for India returned the first 20 eSIMs worldwide. Filtering those by country left nothing, so our campaign form showed "No products found".
   - Expected: a country parameter on search, or results ranked for the account's country.
   - Workaround: we read up to three pages of 50 and fall back to searching "<query> <country name>".
7. **The India catalog no longer matches the builder pack.**
   - "Airtel talktime from ₹10" no longer exists: `airtel-india` has only ₹500 and ₹1000, and the cheapest is `airtel-bundles-india` "199: …", about $2.19.
   - `jio-india` returns 403 "not available for your account".
   - Expected: the builder pack's examples to match what event accounts can buy.

## Zcash tooling

8. **Building zkool2's `zkool_graphql` on Fedora 44 fails.**
   - The vendored OpenSSL build stops with `Can't locate Time/Piece.pm`, because Fedora ships Perl modules separately.
   - Workarounds: `OPENSSL_NO_VENDOR=1` with the system openssl-devel, or `dnf install perl-Time-Piece`.
   - The prebuilt `zkool_graphql` asset on release v6.36.0 avoids the build altogether.
9. **zkool's startup flags are easy to get wrong.**
   - Without flags it exits with "JWT authentication is required".
   - It binds to 127.0.0.1 by default, but the `--allow-unauthenticated` warning doesn't say so, so it's hard to tell how exposed an unauthenticated server is.
   - Expected: the bind address stated next to that warning.
10. **No memo on unconfirmed payments in zkool.**
    - `transactionsByAccount` lists an incoming payment only once it's mined.
    - `unconfirmedByAccount` has the txid and value but no memo, so a checkout that matches payments by memo can't show a "seen in the mempool" step.
    - Expected: the memo on unconfirmed transactions for watch-only accounts.
11. **The testnet explorers are hard to rely on.**
    - zexplorer.app's testnet index was about 76,000 blocks behind on 4 Nov, so our mined txids, and the faucet's, showed "Transaction not found".
    - testnet.zcashexplorer.app works in a browser but returns 403 to scripted requests, so we couldn't check txids automatically.
12. **What worked well.**
    - Fauzec's API worked first time: 1 TAZ, a txid returned at once, and mined within about a minute.
    - zkool's distributed key generation and FROST signing worked live: a 2-of-3 treasury in 4 min 14 s, and a payment signed by two of the three in 4 min 38 s.

## Reclaim Protocol

13. **The portal's in-browser provider builder can't start a session.**
    - It fails every time with `ClientError: /channel.SessionService/GenerateSession UNKNOWN: Response closed without headers`.
    - The portal points its session service at `https://dev-tool.reclaimprotocol.org`, which has no DNS record, while `devapi.reclaimprotocol.org` and `api.reclaimprotocol.org` respond.
    - Expected: the portal to use a live backend, or to say the DevTool is retired and point to the MCP agent (`@reclaimprotocol/agent`), which works. We built our provider with the MCP agent.
14. **The public Luma provider proves an invite, not an approved registration.**
    - "Luma Invited to an Event" takes `event_id` from the URL slug, uses the invite's secret key as `user_id`, and parses `approval_status` out of description text.
    - For an "approved attendee" check, we built a custom provider on `api.lu.ma/event/get` (`guest_data.approval_status`, `guest_data.ticket_key`).
    - Expected: a public provider for approved attendance.
15. **The link shortener fails, and the QR code becomes unscannable.**
    - `/api/sdk/shortener` returned 500, so `getRequestUrl` fell back to the full 1,679-character portal link.
    - As a QR code that's version 30 (137 modules), which phones couldn't scan at 180 px.
    - Expected: the shortener to work, or the SDK to report the failure.
    - Workaround: our server keeps the link for 15 minutes, and the QR code encodes a short `/v/<id>` redirect.
16. **What worked well.**
    - `ReclaimProofRequest.init` with our app ID and secret produced a request URL first time, and `toJsonString()` never contains the secret.
    - A real Luma attendance proof was verified end to end on 4 Nov.
