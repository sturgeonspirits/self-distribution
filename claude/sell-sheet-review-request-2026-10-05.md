# Review request: protected wholesale sell sheet

Review the staged `2026.10.05.28-APP` / `2026.10.05.21-WEB` sell-sheet change before any deploy.

Focus on these release gates:

- Confirm prices cannot leave `listSkus`, `/api/customer`, or `/api/sell-sheet` without a valid, unexpired signed customer token or staff session.
- Confirm `/go?t=sell_sheet` adds a 90-day token only after a valid tracking signature and for a non-bot user agent; invalid, expired, tampered, and bot requests must receive the no-price page.
- Confirm account Customer Prices override tiers and expired/invalid access falls back safely without an error page.
- Confirm `repairHubStructure()` only appends the `sell_sheet_section` SKU column/validation and the `SELL SHEET` Email Editor block; it must not move existing data.
- Confirm the page and function responses are `noindex`, print is price-aware, the Hub can create customer links, and `SELL_SHEET_URL` is absent from executable code.

Run: `node --test tests/security-workflow.test.mjs`.

Do not deploy until review is approved. Deployment follow-up is documented in `PROJECT_STATUS.md`.
