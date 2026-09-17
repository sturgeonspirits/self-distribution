# Distribution Outreach Pilot Package

Current complete version: `2026.09.17.8-APP`

Paste target: the full contents of `Code.gs` into the Apps Script `Code.gs`
file attached to the staging Distribution Directory workbook only.

## Delivery Standard

- Every `Code.gs` revision increments `OUTREACH_VERSION`.
- The beginning of `Code.gs` lists the changes in that version.
- Deliveries always provide one complete, paste-ready file.
- The owner is never asked to merge or add snippets manually.
- Zoho credentials remain in Apps Script Properties and are never committed.

## App Send Safety

- The code is locked to staging spreadsheet
  `1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo`.
- Zoho authentication must use `karl@sturgeonspirits.com`.
- Messages display `sales@sturgeonspirits.com` as the sender alias.
- Karl-only test messages may still be delivered to `karl@sturgeonspirits.com`.
- Real app email is disabled until `OUTREACH_APP_SENDS_ENABLED=true` is set in
  this mailer project's Script Properties and Campaign Settings Mode is `PILOT`.
- The Hub sends one saved, reviewed draft at a time after a final confirmation.
- Server-side locking, idempotency receipts, source-lead checks, Activity Log,
  and historical Pilot Review records prevent duplicate delivery.
- `Pilot Review` is a read-only legacy archive. Do not clear, delete, or edit it
  during the transition.
- Queued and bulk sends remain disabled. Karl-only tests remain available.

## Web App Properties

- `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, and `ZOHO_REFRESH_TOKEN` stay only in
  this Distribution Outreach project.
- `OUTREACH_MAILER_SHARED_SECRET` authenticates calls from the Inventory Backend
  and must match that project's property. Use a random value of at least 24
  characters.
- `OUTREACH_APP_SENDS_ENABLED=true` enables real one-at-a-time app delivery only
  after the test-send and duplicate-protection checks pass.

## Updating The Sell Sheet

The sell-sheet URL is not hardcoded in `Code.gs`. Update the pale-yellow
`Email Editor!B13` cell whenever a new PDF is published. `Campaign Settings`
follows that cell automatically, and every newly generated message uses the
current value. Keep the linked file shared as **Anyone with the link can view**.

## Updating The Website

The footer website and logo are maintained outside the code. Update the
pale-yellow `Email Editor!B15` and `Email Editor!B16` cells. `Campaign
Settings` follows them automatically, and every newly generated email uses the
current URLs. The footer contains only the small clickable logo; it does not
add a separate text website link.

## Customer Application Link

The customer application is published by Netlify from `customer-signup.html`.
After the staging page is deployed and tested, add its public HTTPS address to
the `Customer application URL` row in Campaign Settings. Initial emails then
include a short wholesale-application link beside the sell-sheet footer link.
The link includes the permanent Account ID plus the business and email for
server-side verification. Follow-up and reactivation messages do not include it. Leaving the setting
blank suppresses the link, so a local or unfinished page is never emailed.

## Updating The Sender Footer

The pale-yellow shared fields in `Email Editor` control the closing, sender
name, sender title, business name, tagline, mailing address, website and logo.
Every template leaves one blank line between the closing and sender name.
Karl's title is **Founder and Distiller**. Change the sender name and, when applicable, the title before sending on behalf
of another employee. The title may be left blank.
The staging build still sends through Karl's authenticated Zoho mailbox and the
`sales@sturgeonspirits.com` alias.

Follow `TEST-SETUP.md` for installation and the first controlled send.
