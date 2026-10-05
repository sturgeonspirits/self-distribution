# Review request: May sell-sheet rebuild and follow-up fixes

Review the staged `2026.10.05.29-APP` / `2026.10.05.22-WEB` follow-up before any deploy. The earlier protected-sell-sheet review passed its release gates; this follow-up applies its five findings and faithfully rebuilds the front end with the supplied May assets.

Focus on these release gates:

- Confirm prices cannot leave `listSkus`, `/api/customer`, or `/api/sell-sheet` without a valid, unexpired signed customer token or staff session.
- Confirm `/go?t=sell_sheet` adds a 90-day token only after a valid tracking signature and for a non-bot user agent; invalid, expired, tampered, and bot requests must receive the no-price page.
- Confirm account Customer Prices override tiers, but conflicting active Customer Prices rows emit **Ask us for your price** rather than falling back to the tier; expired/invalid access must fall back safely without an error page.
- Confirm `repairHubStructure()` only appends the `sell_sheet_section` SKU column/validation and the `SELL SHEET` Email Editor block; it must not move existing data.
- Confirm the page and function responses are `noindex`, print is price-aware, the public view has no price wording or order button, and a valid customer token makes **Place an order** link to `/order.html?account_id=…`.
- Confirm the editable headline defaults to **Oshkosh's First Distillery Since 1919**, the supplied artwork/fonts are self-hosted, an unmapped SKU creates no product image, and fallback classification checks gift boxes before canned cocktails.

Run: `node --test tests/security-workflow.test.mjs`.

Do not deploy until review is approved. Deployment follow-up is documented in `PROJECT_STATUS.md`.
