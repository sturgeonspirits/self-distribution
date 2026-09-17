# Sturgeon Distribution Hub

Version: `2026.09.16.26`

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

The staging outreach review screen can save a personalized subject and message body. Drafts are stored in the staging workbook's `Outreach Drafts` tab; saving a draft does not approve or send an email. The Distribution Outreach script in `docs/reference/distribution-outreach/Code.gs` uses the saved draft when one exists and adds the standard branded and compliance footer at send time. Zoho Mail is the delivery service, not the name of the system.

Business Details also includes planning fields for a possible consent-aware newsletter and customer online ordering. These values are stored in the staging workbook's `Account Programs` tab. The scaffold records status and setup information only; it cannot send newsletter invitations, create ordering accounts, or place orders.

Future integrations are scaffolded with `Toast Item Map` and `Email Engagement` staging tabs. Toast remains disconnected until read-only API access and item-to-SKU mappings are verified. Email opens are displayed as estimates; clicks, replies, and orders remain the preferred engagement signals. No tracking pixel is active in this version.

The `Newsletter Contacts` staging tab and Newsletter app view support customers and non-customers, including vendors, bankers, partners and community contacts. Contacts marked `Subscribed` require both a consent source and date. Campaign sending remains disabled.

The customer signup and order-request pages write only to the staging workbook. Signup submissions land in `Customer Applications`; order headers and products land in `Online Order Requests` and `Online Order Lines`. The pages explain that Sturgeon Spirits manages product selection, ordering, self-distribution, delivery, and the invoice. The invoice directs payment to Badger State Cooperative. Neither page approves an account, charges a customer, promises stock, or confirms delivery. Staff must review and confirm each request.

The staff-only Customers section reviews those applications and orders without requiring direct spreadsheet work. Application review can assign staff, record a customer ID, add internal notes, and activate an ordering account. Order review tracks confirmation, Badger invoice number and status, delivery status, assignment, and internal notes. Changes are appended to `Customer Workflow Log`.

Netlify publishes `customer-signup.html` at `/customer-signup.html`. Distribution Outreach adds a short wholesale-application link to initial-email footers only when Campaign Settings contains a valid public `Customer application URL`. A missing URL suppresses the link so staging and local addresses are never emailed.

New customer applications collect the Wisconsin seller's permit number. They do not collect alcohol license type, license number, or issuing municipality. Existing staging-sheet columns and historical values are retained but are no longer populated by the application.

The newsletter option is selected by default and tells applicants to uncheck it if they do not want marketing email. Stored consent-source text records that the option was preselected rather than describing it as a manually selected opt-in.

## Versioning

All deployable files are stamped with the same app version. When updating Apps Script, confirm the `APP_VERSION` value in `apps-script/Code.gs` matches the version shown in this README and the Netlify-hosted app footer.

## Deploy flow

1. Create a new Apps Script project or update your existing backend.
2. Paste `apps-script/Code.gs` into Apps Script.
3. Deploy Apps Script as a Web App.
4. Copy the `/exec` URL.
5. Create a GitHub repo from this folder.
6. Connect the repo to Netlify.
7. Add environment variable:
   - `APPS_SCRIPT_URL` = your Apps Script `/exec` URL
   - `API_KEY` = the same private key stored in Apps Script Properties
   - `STAFF_ACCESS_CODE` = a separate staff-entered code for customer records
8. Redeploy Netlify.

## API auth

- In `apps-script/Code.gs`, keep `REQUIRE_API_KEY = true`
- Add Script Property `API_KEY` in Apps Script
- Add Netlify env var `API_KEY`
- Never use the API key as the staff access code

## Notes

- The manager grid requires `apiGetManagerGrid_()` in the Apps Script backend.
- The frontend uses `/api/inventory`, which is redirected to the Netlify function via `netlify.toml`.
- The Outreach section reads and updates the staging Distribution Directory and Activity Log. It intentionally cannot send email until staff authentication is added to the web app.
- Outreach Directory returns every business row, supports searching across all nonblank spreadsheet fields, and shows each business's complete row plus recent activity.
- Business details can update existing contact columns. New notes are appended with a date and logged as activity instead of replacing earlier notes.
- Each business card has a Directions action that passes its address, or its business name and city when no street address is available, to Google Maps.
- Outreach uses one shared audience and ordering control across every work stage. The weekly preset selects send-safe Fit 5 prospects with a recorded distance of 15 miles or less from Oshkosh without adding sheet flags or helper columns.
- Staff can isolate Fit 5 businesses that still need mileage and update fit, mileage, rating basis, email confidence, contact information, and notes from Business details.
- The local preview uses a clearly labeled mock API; it does not read or change either the staging or production spreadsheet.
