# Sturgeon Distribution Hub

- Web version: `2026.09.18.3-WEB`
- Inventory API version: `2026.09.18.2`

Repository: `sturgeonspirits/sturgeon-distribution-hub`

Netlify site: `sturgeon-distribution-hub`

Customer-facing email: `sales@sturgeonspirits.com`

This repo contains:

- `index.html` — Netlify-hosted inventory and outreach UI
- `customer-signup.html` — public new-customer application form
- `order.html` — public order-request form for current customers
- `assets/customer-portal.css` — shared customer-page styling
- `netlify/functions/inventory.js` — proxy to Apps Script
- `netlify/functions/customer.js` — allowlisted public proxy for signup and order requests
- `apps-script/Code.gs` — JSON API backend for Google Apps Script
- `netlify.toml` — Netlify configuration

The staging outreach review screen saves a personalized subject and message body in `Outreach Drafts`, then supports a final-confirmed, one-recipient-at-a-time send through the separately deployed Distribution Outreach Apps Script. Zoho credentials stay only in that mailer project's Script Properties; the Inventory Backend receives only the mailer web-app URL and a shared service secret. The send path locks server-side, uses an idempotency token, rechecks recipient eligibility and prior sends, records Zoho acceptance/message ID, updates the next stage and follow-up date, and never marks a message sent unless Zoho accepted it.

`Pilot Review` is retained unchanged as a read-only legacy audit/archive. Historical rows, approvals, send state, timestamps, Zoho message IDs, and notes remain duplicate-protection and history inputs. The tab is eligible for later retirement only after direct app sending is deployed and verified.

Business Details also includes planning fields for a possible consent-aware newsletter and customer online ordering. These values are stored in the staging workbook's `Account Programs` tab. The scaffold records status and setup information only; it cannot send newsletter invitations, create ordering accounts, or place orders.

Future integrations are scaffolded with `Toast Item Map` and `Email Engagement` staging tabs. Toast remains disconnected until read-only API access and item-to-SKU mappings are verified. Email opens are displayed as estimates; clicks, replies, and orders remain the preferred engagement signals. No tracking pixel is active in this version.

The `Newsletter Contacts` staging tab and Newsletter app view support customers and non-customers, including vendors, bankers, partners and community contacts. Contacts marked `Subscribed` require both a consent source and date. Campaign sending remains disabled.

The customer signup and order-request pages write only to the staging workbook. Signup submissions land in `Customer Applications`; order headers and products land in `Online Order Requests` and `Online Order Lines`. Permanent Account IDs preserve the email-to-application-to-order relationship even when spreadsheet rows are sorted. The pages explain that Sturgeon Spirits manages product selection, ordering, self-distribution, delivery, and the invoice. The invoice directs payment to Badger State Cooperative. Neither page approves an account, charges a customer, promises stock, or confirms delivery. Staff must review and confirm each request.

The staff-only Orders & Accounts section reviews applications and orders without requiring direct spreadsheet work. Its Accounts view shows every active customer account with complete order, invoice, delivery, outreach, workflow, and inventory-reorder history. Filters cover New, Awaiting invoice, Ready, Delivered, Reorder due, and Inventory-counted. Application review can link an account, assign staff, record a customer ID, activate ordering, and optionally create an inventory store. Customers remain outside Inventory and Counts unless Inventory Tracking is explicitly enabled; disabling it preserves history but deactivates the store record.

The Outreach section can add a single business or import a CSV. Imports are staff-protected, duplicate checked, and recorded in `Import Batches` and `Import Rows`; they never overwrite an existing business. The Customers section exposes protected staging migration status and repeatable Badger/delivery reconciliation.

The hardened Google Sheets model is documented in `docs/hardened-google-sheets-architecture-2026-09-17.md`. It consolidates operational tabs into the existing staging Distribution Hub workbook and keeps only the existing Badger Invoice Tracker separate because it owns the proven PDF parser. No new spreadsheet file is created.

Netlify publishes `customer-signup.html` at `/customer-signup.html`. Distribution Outreach adds a short wholesale-application link to initial-email footers only when Campaign Settings contains a valid public `Customer application URL`. A missing URL suppresses the link so staging and local addresses are never emailed.

New customer applications collect the Wisconsin seller's permit number. They do not collect alcohol license type, license number, or issuing municipality. Existing staging-sheet columns and historical values are retained but are no longer populated by the application.

The newsletter option is selected by default and tells applicants to uncheck it if they do not want marketing email. Stored consent-source text records that the option was preselected rather than describing it as a manually selected opt-in.

## Future improvement: individual staff accounts

Deferred until the current Inventory, Outreach, and Orders & Accounts workflows are functioning reliably. Replace the shared staff access code with a separate login for each staff member. Each account should provide its own display name and approved email signature, automatically attribute outreach and operational changes to that user, support role-based permissions, and allow one staff member to be disabled without changing access for everyone else. Preserve the current audit history during migration. Do not implement this during pilot stabilization.

## Versioning

All deployable files are stamped with the same app version. When updating Apps Script, confirm the `APP_VERSION` value in `apps-script/Code.gs` matches the version shown in this README and the Netlify-hosted app footer.

## Deploy flow

1. Open the **staging Distribution Outreach** Apps Script project attached to the staging Hub workbook.
2. Replace its complete `Code.gs` with `docs/reference/distribution-outreach/Code.gs`; do not append snippets.
3. Add Script Properties `OUTREACH_MAILER_SHARED_SECRET` (a new random value at least 24 characters) and, after a Karl-only test succeeds, `OUTREACH_APP_SENDS_ENABLED=true`. Keep the existing `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, and `ZOHO_REFRESH_TOKEN` only in this project.
4. Deploy Distribution Outreach as a Web App and copy its `/exec` URL.
5. Open the **staging Inventory Backend** Apps Script project.
6. Replace its complete `Code.gs` with `apps-script/Code.gs`; do not append snippets.
7. Add Inventory Backend Script Properties `OUTREACH_MAILER_URL` (the Distribution Outreach `/exec` URL) and the same `OUTREACH_MAILER_SHARED_SECRET`. Do not copy Zoho credentials here.
8. Deploy the Inventory Backend as a Web App and verify its root JSON reports version `2026.09.18.2`.
9. Keep the existing GitHub-to-Netlify connection and environment variables:
   - `APPS_SCRIPT_URL` = your Apps Script `/exec` URL
   - `API_KEY` = the same private key stored in Apps Script Properties
   - `STAFF_ACCESS_CODE` = a separate staff-entered code for customer records
10. Redeploy Netlify only after both staging Apps Script web apps are deployed and the Inventory Backend reports version `2026.09.18.2`.

## API auth

- In `apps-script/Code.gs`, keep `REQUIRE_API_KEY = true`
- Add Script Property `API_KEY` in Apps Script
- Add Netlify env var `API_KEY`
- Never use the API key as the staff access code

## Notes

- The manager grid requires `apiGetManagerGrid_()` in the Apps Script backend.
- The frontend uses `/api/inventory`, which is redirected to the Netlify function via `netlify.toml`.
- Inventory, Outreach, and Orders & Accounts share one session-scoped staff code. No inventory endpoint or inventory data fetch is allowed before unlock.
- The Outreach section reads and updates the staging Distribution Directory and Activity Log. Real delivery is proxied to the separately controlled Distribution Outreach mailer; queued and bulk sends remain disabled.
- Outreach Directory returns every business row, supports searching across all nonblank spreadsheet fields, and shows each business's complete row plus recent activity.
- Business details can update existing contact columns. New notes are appended with a date and logged as activity instead of replacing earlier notes.
- Each business card has a Directions action that passes its address, or its business name and city when no street address is available, to Google Maps.
- Outreach uses one shared audience and ordering control across every work stage. The weekly preset selects send-safe Fit 5 prospects with a recorded distance of 15 miles or less from Oshkosh without adding sheet flags or helper columns.
- Staff can isolate Fit 5 businesses that still need mileage and update fit, mileage, rating basis, email confidence, contact information, and notes from Business details.
- The local preview uses a clearly labeled mock API; it does not read or change either the staging or production spreadsheet.
