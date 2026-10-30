# distribution outreach — earlier version notes

Moved out of the `docs/reference/distribution-outreach/Code.gs` header on 2026-10-17 so the deployed file stays short. Newest first, copied word for word. The header keeps only the current version (`CHANGES IN THIS VERSION`); when a new version is made, move that section to the top of this file.

```
CHANGES IN 2026.10.12.33-APP
- Order-online invite (sendCustomerEmail): the Do Not Email box that approval ticks automatically (to keep current
  customers out of sales outreach) no longer blocks the customer's own ordering link. It counts as automatic when
  Customer Source starts with "Application " and Relationship shows customer history (Current customer, Customer,
  Existing customer, Lapsed customer, Win-back due). Status or Outcome Bad address, Unsubscribed, Do not contact or
  Not interested still blocks. The duplicate check now also refuses an invite when this account (Account ID)
  already received an invite or welcome at any address.
- Adds the Hub-only sendWelcomeEmail action: the welcome email with the ordering link that staff review and send
  after approving a wholesale application. It is a transactional reply to the customer's own application, so the
  Directory "Do Not Email" box (which keeps current customers out of sales outreach) does not block it. It is still
  refused for an address the Directory row has marked Bad address, Unsubscribed or Do not contact, and for an
  invalid address. It uses the "Order online invite" stage, so the Hub never sends that address the prospect
  introduction or a second order-online invite from a campaign. Same idempotency receipts and Activity Log row as
  every other app send.
CHANGES IN 2026.10.10.32-APP
- Adds the Hub-only, read-only listSentInThreads action so the Hub can close replies already answered from Zoho. It
  pages the Sent folder (folderType "Sent") newest first back to since_ms (at most 2,000 messages) and returns only
  messages in the requested threads that were sent from the sender address (sales@): thread ID, message ID, sent
  time, from and to addresses, with IDs kept as strings. scan_capped is true when the cap was reached first.
CHANGES IN 2026.10.10.31-APP
- Fix: .30 still scanned the whole Inbox because it reused the folder list .29 had cached for six hours under the
  same key. The cache key now includes the version and the REPLY_CHECK_FOLDERS value. Listing also stops itself
  after 4 minutes with a clear error instead of being cut off by Apps Script (which the Hub saw as an unreadable
  response).
CHANGES IN 2026.10.10.30-APP
- Faster reply checks. Scanning 14 days of the whole Inbox (13,000+ messages) used nearly all of the Hub's run time,
  so a check processed only one reply. The checker now reads only the Inbox subfolder(s) named in the
  REPLY_CHECK_FOLDERS Script Property (default "Sales", where the Zoho filter files sales@ mail), falling back to the
  Inbox and all its subfolders when none of them exists. Only messages addressed (To/Cc) to the sender address or sent
  by a mail daemon (bounces) are returned.
CHANGES IN 2026.10.10.29-APP
- The reply checker reads the Inbox and every folder inside it (for example Inbox/Sales, where a Zoho filter files
  sales@ mail), not only the Inbox itself. Each folder is paged back to the checkpoint (up to 2,000 messages per
  folder) and the oldest 200 across all of them are returned. After deploying, delete the INBOUND_REPLY_SINCE_MS
  Script Property in the Inventory API project once, so the Hub re-reads the last 14 days.
CHANGES IN 2026.10.09.28-APP
- Adds two Hub-only, read-only actions for the Hub's reply checker. listInboxMessages returns the oldest 200 Inbox
  messages received since a given time (scanning up to 1,000) with sender, recipients, subject and Zoho's summary,
  and more_available when there are more.
  getInboxMessage returns one message's plain text (first 20,000 characters) and whether its headers declare it
  automatic (Auto-Submitted, X-Autoreply, auto-reply precedence) or bulk (List-Id, List-Unsubscribe, bulk/list
  precedence), and header_error when the headers could not be read. Neither sends, moves, marks read or deletes mail.
- Reading the Inbox needs two more Zoho scopes. Run "1. Connect Zoho" once with a grant code generated for
  ZohoMail.accounts.READ,ZohoMail.messages.CREATE,ZohoMail.messages.READ,ZohoMail.folders.READ. Sending keeps
  working with the old token until then; only the reply checker reports the missing scope.
- "1. Connect Zoho" now asks for the grant code first, then offers to reuse the saved Client ID and Secret, so the
  code that was just copied is pasted before anything else is copied.
CHANGES IN 2026.10.08.27-APP
- Do Not Email typed as text ("TRUE", "Yes", "1") is now also honoured by the menu paths: refreshFollowupStatuses
  no longer schedules follow-ups for such a row, and assertPilotLeadEligible_ refuses it.
CHANGES IN 2026.10.08.26-APP
- Adds the Hub-only sendCustomerEmail action for the "Order online invite" to current customers. It validates the
  Directory row by row number, business and email; refuses Do Not Email, an opt-out status or outcome, and an address
  that already received the invite; preserves lock/idempotency/Zoho recovery; and writes one Activity Log row with the
  Order online invite stage. It does not change the row's outreach stage.
- Do Not Email typed as text ("TRUE", "Yes", "1") now blocks sales and customer sends too, not only a ticked checkbox.
CHANGES IN 2026.10.04.25-APP
- Adds the Hub-only sendNewsletterEmail action for Cocktail list campaigns. It validates a subscribed Newsletter
  Contacts record by contact ID and email, preserves lock/idempotency/Zoho recovery, and writes one Activity Log row
  with its true Cocktail list stage and saved subject without changing Directory outreach state.
CHANGES IN 2026.10.03.15-APP
- Allows a recurring Nurture check-in only when the prior check-in is more than 60 days old; all other stages retain permanent duplicate-send protection.
- Keeps message-stage identity, recipient validation, and every non-nurture delivery guard unchanged.
CHANGES IN 2026.09.24.13-APP
- Uses Reactivation-specific online-ordering wording for the wholesale application link in every renderer.
- Marks tracking links in Karl-only test messages so test clicks redirect without being recorded as prospect engagement.
- Includes the wholesale application link in every outreach stage while retaining tracked-link fallback behavior.
- Added opt-in signed sell-sheet and wholesale-application links for click measurement; direct links remain unchanged until tracking is configured.
- Allowed Karl-only app tests to render saved drafts before a prospect email is available or verified.
- Kept source-row identity checks and every real-recipient safety check unchanged.
EARLIER APP CHANGES
- Added a secret-authenticated web endpoint for one-at-a-time sends from the Hub.
- Kept Zoho credentials exclusively in this Distribution Outreach project.
- Added server-side locking, idempotency receipts and duplicate-send checks.
- Records Zoho acceptance and partial failures in Activity Log without false sent states.
- Disabled legacy Pilot Review sending and retained the tab as a read-only audit archive.
- Preserved Karl-only test sends and kept bulk or queued delivery disabled.
EARLIER PILOT CHANGES
- Added permanent Account IDs so sorting rows cannot detach drafts or activity.
- Added verified account, business and email context to customer-application links.
- Reads saved email drafts by Account ID first and keeps the row-key fallback.
- Records Account ID in Activity Log while preserving its existing columns.
- Added a configurable wholesale customer-application link to initial emails.
- Placed the application link with the standard footer and sell-sheet link.
- Suppressed the link until Customer application URL is a public HTTPS URL.
- Kept follow-up and reactivation messages unchanged.
- Standardized the script, menu and package name as Distribution Outreach.
- Retained Zoho only as the configured email delivery service.
- Corrected the expected visible sender to sales@sturgeonspirits.com.
- Kept karl@sturgeonspirits.com as the authenticated staging mailbox.
- Uses saved app drafts from the Outreach Drafts tab when present.
- Keeps the sell sheet, signature, logo and compliance footer standardized.
- Leaves template-based messages unchanged when no custom draft exists.
- Fixed pilot lead updates to use the existing validated Sent status.
- Preserved the post-send do-not-resend recovery guard.
- Added individually approved real-email pilot sending from Pilot Review.
- Added a hard three-email pilot cap, duplicate prevention and final confirmation.
- Added pilot send results to the lead row, Pilot Review and Activity Log.
- Kept queued and bulk sending disabled.
- Added a blank line between the email closing and sender name.
- Added an editable sender-title field to every email footer.
- Retained the editable sender title; Karl's configured title is Founder and Distiller.
- Kept the footer logo-only, with no separate text website link.
- Retained the renamed Distribution Directory and Leads sheet.
- Retained the staging workbook lock and Karl-only test delivery.
PASTE INSTRUCTIONS
- This is the complete Code.gs source, not a partial snippet.
- Replace Code.gs only in the STAGING Distribution Directory workbook.
- Keep Zoho credentials in Script Properties; never paste them into this file.
Bound to: STAGING - Distribution Directory and Leads - 2026-09-15
Sends through the authenticated Zoho Mail API account.
```
