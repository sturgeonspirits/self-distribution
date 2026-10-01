# Claude review request — Zoho staff roster migration

Review the working-tree changes that supersede commit `1ab39d2`. Do not deploy, push, edit spreadsheets, run setup functions, or change Netlify variables.

The requirement is narrow: **Zoho remains the staff login.** Keep the existing Zoho OIDC client, callback URL, OIDC environment variables, and signed session configuration. Move only approved staff emails, roles, and permitted areas from `STAFF_ROLES_JSON` into the staging Hub spreadsheet.

## Intended behavior

- A user signs in through the existing Zoho OIDC flow.
- `Staff Access` in the Hub contains `Staff ID`, `Display Name`, `Email`, `Role`, `Areas`, and `Active`.
- The Netlify auth function asks the Hub for the current roster entry after Zoho login and again when validating an existing signed session. Removing or deactivating a row therefore revokes the next request without a Netlify redeploy.
- The existing `APPS_SCRIPT_URL`, `API_KEY`, `ZOHO_OIDC_*`, and `APP_SESSION_SECRET` variables remain private server configuration. Do not remove or expose them.
- Admin users retain all areas; staff users receive only their comma-separated `inventory`, `outreach`, and/or `orders` areas.

## Review questions

1. Confirm Zoho OIDC is still the only browser login path and its ID-token verification, nonce, state, PKCE, secure cookie, and callback protections remain intact.
2. Confirm `STAFF_ROLES_JSON` is no longer read anywhere in deployable code.
3. Confirm the Hub roster lookup is protected by the existing API key and cannot be used by an unauthenticated browser to enumerate staff emails or roles.
4. Confirm a deactivated/removed email and any role/area change take effect on the next protected request.
5. Confirm every inventory, outreach, orders, payment, invoice, and admin action still requires an approved Zoho session and enforces its current area/role.
6. Check outage behavior: a roster lookup failure must fail closed, never grant stale or default access.
7. Verify `apps-script/Code.gs` header version and `APP_VERSION` both equal `2026.10.01.6`.

Report actionable findings with priority, exact file/line, and consequence. State whether the change is safe to provision in staging. No Badger, inventory-migration, or payment-reminder action belongs in this review.
