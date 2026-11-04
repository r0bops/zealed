# Development feedback notes

These are engineering notes for the human-written final FEEDBACK.md.

- Privacy review: truncating HTTP error messages still preserves sensitive response data. Expected only safe error metadata; synthetic-response regression tests demonstrated the leak. Errors now use fixed descriptions and allowlisted provider codes.
- Catalog modes: switching from simulated to live reused cached simulated products. Expected fresh live results; isolated tests reproduced the mismatch. Cache keys now separate account, mode, test-product visibility and conversion-rate configuration.
- Budget accounting: creation-date totals missed orders paid the next day. Expected spending and outstanding reservations to stay within the cap. Checkout now reserves budget in a SQLite write transaction; fulfillment rechecks limits and retains uncertain purchases across midnight.
- Build verification in the review environment encountered blocked Google Fonts access and a Turbopack worker port-binding restriction. No real payment or purchase was needed for the regression tests.
