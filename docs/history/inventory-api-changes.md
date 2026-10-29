# Inventory API — earlier version notes

Moved out of the `apps-script/Code.gs` header on 2026-10-17 so the deployed file stays short. Newest first, copied word for word. The header keeps only the current version (`CHANGES IN THIS VERSION`); when a new version is made, move that section to the top of this file.

```
CHANGES IN 2026.10.28.48-APP
- Badger invoice units: 330 mL cans (Badger unit 6) and 187 mL (unit 7), read from Sturgeon's own Badger invoices on
  2026-10-28 (SS0079, SS0093, SS0167). Online orders of the five canned cocktails (invoice_volume 330ml) can now be
  previewed and invoiced instead of being listed as blocked.
CHANGES IN 2026.10.17.47-APP
- Campaigns made in error can be deleted (deleteOutreachCampaign). Only a Review or Approved campaign that never
  sent or attempted a single email qualifies: every recipient still Ready for review, Ready to send or Excluded,
  no Zoho message ID or sent time, no accepted send in the activity log, sent count 0, and not mid scheduled send.
  Deleting is a soft delete under the script lock: the campaign and its recipients are marked Deleted, approval and
  any schedule are cleared, the rows stay for the audit trail, and DELETE_OUTREACH_CAMPAIGN is logged. Deleted
  campaigns are left out of the Campaigns list and no longer block creating the same audience again.
- Follow-ups can use exactly the businesses of an earlier campaign ("Same businesses as that campaign"): criteria
  audience_mode "source" keeps only the stage check (who is due for this email) and the usual send-eligibility
  rules, and skips the distance, fit, city, county, segment and wave filters. The stored center, radius and fit are
  copied from the source campaign for labels and distances. Turning it off uses the filters as before.
- "Only recipients of campaign" matched businesses by the stored Directory row number, which goes stale when the
  Directory is sorted or rows are inserted (every Appleton row pointed at a different business by 2026-10-17).
  campaignSourceRows_ now finds the businesses the source campaign sent to by account ID, then email, then name,
  using a match only when it is unique (and an email/name match only when its account ID does not conflict);
  ambiguous or missing businesses are listed as left out rather than guessed (chat review P2, 2026-10-17).
- Sales campaign previews explain who was left out and why (due for a different email, not due until a date,
  recently emailed, excluded, outside the radius or fit, over the maximum), with up to 8 names per reason.
- Campaigns can be renamed at any stage (renameOutreachCampaign); names are internal labels only and never appear
  in email. Logged as RENAME_OUTREACH_CAMPAIGN.
CHANGES IN 2026.10.12.46-APP
- Added to Badger is a checkbox only: Badger shows no customer number to members, so the window no longer asks for
  one. The Hub still learns a customer's Badger ID from their first invoice (entered by hand in Badger, then linked
  by the daily sync); the invoice error now says exactly that. A Badger Customer ID typed into the Directory by hand
  is still used.
CHANGES IN 2026.10.12.45-APP
- Added to Badger: the application window has an "Added to Badger" checkbox and an optional Badger customer number.
  Saving writes them to the application and to the customer's Directory row ("Added to Badger", "Badger Customer
  ID" columns, created at the end of each sheet when first used). Badger invoice creation already reads the
  Directory's Badger Customer ID, so entering the number lets the Hub invoice a new customer without a first invoice
  by hand. A number counts as added. Accounts show their Badger status (an account with a matched Badger invoice
  counts as in Badger).
CHANGES IN 2026.10.12.44-APP
- Welcome email fix (first real send, The Wild Boar, 2026-10-12): Zoho accepted the email, but moving the application
  to "Account active" was refused by the Customer Applications Workflow Status dropdown (New, Reviewing, Need
  information, Approved, Declined, Converted), so the Hub reported "needs recovery". Now:
  - Every record of the send (Welcome Email Sent At / By / Recipient / Message ID, Ordering Invite Date, workflow log,
    audit) is written first. The status change comes last and can no longer fail a send: if it is refused, the
    application stays Approved, the audit notes why, and the Hub reports the email as sent.
  - The Workflow Status dropdown is widened to the Hub's statuses (New, Reviewing, Needs information, Approved,
    Account active, Declined), keeping the values it already allows (Need information, Converted), the next time an
    application is saved or welcomed. Before this, saving "Needs information" or "Account active" from the Hub also
    failed on that rule.
CHANGES IN 2026.10.12.43-APP
- Approving a wholesale application now sets the customer up: saving an application as "Approved" does what
  "Account active" used to do (links or creates the Directory account, creates the ordering link, sets up the
  inventory store when tracking is ticked). Customer ID is no longer required; it can be added later.
- Welcome email: new staff actions previewApplicationWelcome (returns the drafted welcome email with the
  customer's ordering link) and sendApplicationWelcome (sends the staff-reviewed text through the Distribution
  Outreach mailer's sendWelcomeEmail action, mailer 2026.10.12.33-APP or later). Nothing is sent without staff
  clicking Send in the Hub. The draft text can be overridden with the Campaign Settings keys "Welcome email subject"
  and "Welcome email body" ({{First Name}}, {{Business Name}}, {{Ordering Link}}). The message must keep the
  ordering link. A sent welcome records Welcome Email Sent At / Sent By / Recipient / Message ID on the application,
  sets the program's Ordering Invite Date, and moves the application to "Account active" (which now means approved
  and welcomed). A second send needs an explicit "Send again".
- The ordering link now also carries the business name, ordering email and contact name, so the order page fills them
  in and a reorder is only choosing products.
- Current customers no longer get sent to the new-customer account form. The "Order online invite" campaign now
  puts each customer's own ordering link in the email (account, business, email and contact filled in), and a sent
  invite marks the account set up for online ordering (Outreach Programs: Ordering Status Active, Ordering Portal URL,
  Ordering Invite Date). Stored Email Editor text that still mentions the account form or approval is replaced by
  the new default wording automatically; edited text is kept. A Directory row without an Account ID is left out
  ("No Account ID on the Directory row"). The invite no longer needs Customer application URL.
- Lapsed and win-back customers count as customers for the order-online invite (no Badger invoice in the last
  12 months needed), and every outreach email to a Directory row with customer history (current, lapsed, win-back
  or Existing customer status) links to that customer's own ordering page instead of the account form (tracked as
  target "order" when tracking is configured). Everyone else's account-form link now carries everything the
  Directory has (business, email, contact, phone, address, city, state, ZIP) so the form is filled in.
- Invite eligibility (chat review P1/P2): the Do Not Email box that approval ticks automatically no longer leaves a
  customer out of the ordering-link invite. It counts as automatic when Customer Source starts with "Application "
  and the row has customer history; Status/Outcome opt-outs (Bad address, Unsubscribed, Do not contact, Not
  interested) still block. An invite or welcome sent to ANY address of an account now counts for the whole account
  (Activity Log Account ID), so a welcome to an alternate ordering email stops a second link to the primary email.
- Invite eligibility: "set up for online ordering" now means the link was actually emailed (an Order online invite or
  welcome send to that address). Accounts activated earlier without an email are no longer left out of the invite.
CHANGES IN 2026.10.10.42-APP
- Replies view (web 2026.10.10.44-WEB): each bounce now carries a plain-words verdict (`bounce`: dead, probably dead,
  refused, delayed or unknown, and whether the receiver refused OUR sending address). Display only; it changes no data.
CHANGES IN 2026.10.10.41-APP
- Bounce fix: a bounce saying the receiver refused OUR sending address or domain (5.1.7, 5.1.8, "Sender address
  rejected/blocked") is now "refused", not a hard bounce, so it no longer marks a good address Bad automatically.
  Such refusals usually point at our own mail setup (SPF/DKIM/DMARC).
CHANGES IN 2026.10.10.40-APP
- "Answered — log outcome": a reply closed as "Answered in Zoho" stays listed (with Log outcome) until an outcome is
  recorded for it, so answered emails leave the to-do list but the business doesn't get lost. The new Inbound Replies
  column "Outcome Logged" is filled when an outcome is logged from the reply, from Log outcome on the business, or
  from Log contact with an outcome (every reply of that business waiting for an outcome), or when staff choose
  "No outcome needed".
- Reopen on a reply records "Reopened by <staff>" with the time (Status stays New), and "Answered in Zoho" only closes
  a reopened reply again for a message sent after the reopen.
- Alt emails are learned: logging an outcome from a reply sent from an address that isn't the business's email (and
  isn't already in its Notes, a bounce, a mail daemon or our own domain) adds "Alt email: <address>" to the Notes, so
  later replies from that person match the business.
CHANGES IN 2026.10.10.39-APP
- Replies answered from Zoho are closed automatically. After each check, open replies (Status New, a Thread ID, not a
  bounce or unsubscribe, not "Confirm unsubscribe" / "Review bounce") are compared with the Sent folder through the
  mailer's listSentInThreads (2026.10.10.32-APP): a message sent from sales@ in the same thread after the reply was
  received marks it Handled ("Answered in Zoho <date>", Handled At = the sent time) and writes an audit line. Only the
  four status cells are written. A failure here is logged and never fails the check; the run summary and "Last
  checked" show how many were answered, and warn when the Sent scan hit its cap.
- Bounces that were refused or unclear no longer suggest "Bad address"; only a hard bounce does.
CHANGES IN 2026.10.09.38-APP
- Inbound reply checker. Every 15 minutes (installInboundReplyChecker() once) the Hub asks the Distribution Outreach
  mailer (2026.10.09.28-APP) for new Inbox messages addressed (To/Cc) to sales@ and keeps the ones that answer us:
  from a Directory email or an "Alt email" in Notes, an address we emailed, a Newsletter contact, or a bounce naming
  one of our recipients. A "Re:" from the only Directory business on that company domain, or a "Re:" of a subject
  sent to exactly one business, is kept as a possible match that changes nothing. Each reply is written to the
  new Inbound Replies tab (created by repairHubStructure() or the installer) with the reply text (quoted history
  removed), the business, what we last sent, a category, a one-line summary, the suggested outcome, a priority and a
  respond-by time (orders, interest and tastings: same business day if received by 3 PM; questions and the rest: next
  business day).
- Categories come from fixed rules (bounces; a reply that is only "stop" / "unsubscribe" / "remove me"; "cocktails";
  automatic replies recognised from their headers or subject). The Hub makes no AI calls. Any other reply is listed as
  "Needs reading" (Classifier "Awaiting skill") until the sort-inbound-replies Claude skill sorts it in the sheet.
- Applied without a click (the only automatic changes), and only for a sure match: a person's reply sets Status
  "Replied" and clears Next Follow-Up when the row was waiting on a sales or reactivation email; a reply that is only
  "stop" (plus sign-off lines) records Unsubscribed (as the Log outcome button does) and unsubscribes the newsletter
  contact; a bounce saying the row's current address does not exist (5.1.x / user unknown) records Bad address.
  Blocked, refused, delayed and unclear bounces, automatic replies, mailing-list mail and possible matches change
  nothing. A stop or bounce that could not be applied stays open as "Confirm unsubscribe" / "Review bounce".
  An unsubscribe request the skill finds in a longer message is only suggested.
- Each message is stored once: Zoho IDs are written as text, a per-message script lock re-checks the ID, the row is
  written before any change is made, and the checkpoint is saved after every message. Status changes and the
  automatic Directory changes write only the cells they change (also for Log outcome and Log contact), so
  apostrophe-protected text is never turned into a formula. Respond-by times use the project time zone; the
  installer warns unless it is America/Chicago.
- New staff actions: inboundReplies (read), resolveInboundReply (Handled / Dismissed / reopen) and checkInboundReplies
  (starts a background check). updateOutreachOutcome accepts reply_id and marks that reply handled in the same save.
CHANGES IN 2026.10.08.37-APP
- Order online invite: a recent Badger invoice matched to a Directory account by business or location name alone
  now counts when that row's Relationship shows customer history (Current customer, Customer, Existing customer,
  Lapsed customer or Win-back due). The preview gives the reason as "<Relationship> with a Badger invoice in the
  last 12 months (matched by business name; Relationship may need updating)". A name-only match into a Prospect
  (or blank) row is still left out as "Possible customer" until the invoice is linked, because the same name could
  be a different business. The same rule is used at preview, rebuild and send time.
- Public customer actions (listSkus, submitCustomerApplication, submitOnlineOrderRequest) return only messages
  written for the customer (validation such as "Business name is required."). Any other failure is logged with
  console.error and the caller sees "The request could not be processed."
- The public order reply no longer includes the internal Account ID or verification status (only message and
  request_id).
- Write actions are refused over GET ("This action must be sent as POST."); only READ_ACTIONS work as a GET, so a
  link cannot trigger syncBadgerStatus or another change. The staff proxy (2026.10.08.40-WEB) refuses them first.
- Rebuild / send-time re-check reads Badger only for rows that Relationship or Status do not already qualify, so a
  Badger read failure during a scheduled send no longer blocks Current customer / Existing customer recipients.
CHANGES IN 2026.10.08.36-APP
- New campaign type "Current customers — order online invite" (campaign_type customer_invite, stage Order online
  invite). Audience: Directory rows whose Relationship is Current customer / Customer or whose Status is Existing
  customer, plus any Directory account with a non-void Badger invoice in the last 12 months that is matched by an
  explicit invoice link, an order link or a learned alias. A match by business or location name alone could be a
  different business with the same name, so it is only listed as a "possible customer" (link the invoice to include
  it). If Badger cannot be read the preview stops instead of shrinking. The preview lists who was left out by name,
  why each recipient is included, recent invoices that match no Directory account, and a stale Badger sync. Left out,
  and counted by reason in the preview: no or invalid email, Do Not Email, an opt-out status or outcome, an account
  already ordering online (Account Programs ordering status Active), an address that already received the invite,
  an unverified email, and the 14-day gap after a Cocktail list email. One recipient per address.
- The message comes from a new CUSTOMER ORDER INVITE EMAIL block in the Email Editor (added with starting copy by
  repairHubStructure(); edited cells are never overwritten). The code always adds the link to the wholesale account
  form (tracked when Tracking base URL is set, prefilled with the account, business and email), the sign-off and the
  physical address / "Reply stop to unsubscribe." footer. These sit outside the editable text, so editing one
  recipient's email or rebuilding it never drops the link. Requires Physical mailing address and Customer
  application URL. An address that received the invite is never sent the Initial prospect email.
- It uses the existing review → freeze → approve → batch / scheduled send flow. Every check is repeated at rebuild
  and send time, and sending goes through the Distribution Outreach mailer's new sendCustomerEmail action
  (2026.10.08.26-APP). The Directory outreach stage, Last Emailed and follow-up dates are never changed.
CHANGES IN 2026.10.08.35-APP
- Cocktail list: Directory Do Not Email no longer excludes an active customer (Directory status Existing customer
  and Account Programs ordering status Active, both set on activation) whose Newsletter Contacts status is
  Subscribed. Activation ticks Do Not Email only to stop sales outreach. Every recorded opt-out still excludes:
  newsletter or program Unsubscribed/Declined, and a Directory status or outcome of Do not contact, Unsubscribed,
  Bad address or Not interested. Sales stages, Reactivation and payment reminders still honor Do Not Email.
- A customer application with the newsletter box ticked no longer re-subscribes an address whose Newsletter
  Contacts status is Unsubscribed or Declined, and no longer replaces the name, business or account already on
  that row (the public form does not prove who owns the address). It fills blank fields and adds a note; staff can
  re-subscribe from the Hub. A new address, or a Candidate/Invited contact, is subscribed as before. Any
  Unsubscribed/Declined row for the address counts (not only the first row), and a row without a Contact ID gets one.
- Cocktail list: an address with any Unsubscribed or Declined Newsletter Contacts row is treated as opted out, even if
  another row for the same address says Subscribed (preview, freeze, rebuild and send all use the same record).
CHANGES IN 2026.10.07.34-APP
- New read-only salesReport action (Orders & Accounts area): returns the displayed values of the Badger tracker's
  Sales by Location, Sales by Product and Location x Product tabs. The analysis itself is sheet formulas.
- submitCounts always writes the count to on-hand inventory and the last-count fields; the updateInventory flag
  (formerly a Hub checkbox, now removed) is ignored.
- managerGrid returns each store's most recent count date (latest last_count_date on its Inventory rows), shown on
  the Inventory summary's location lines.
- Inventory counts: submitCounts accepts an optional submission_token and skips a retry whose token is already in the
  Counts log, so a timed-out submit tapped again is not recorded twice. Shelf, back, the system number the counter
  started from, and the token are logged in four new Counts columns (added automatically). Inventory on-hand and
  last-count fields are written in three batched column writes instead of two or three calls per bottle. A bottle
  whose system number changed during the count is reported in the response. Bottles confirmed as matching are
  submitted too, so their last-count date updates. Counts must be whole numbers; a repeated SKU is rejected.
- (2026.10.06.33-APP, not separately deployed) Batched campaign-template rebuild; see below.
- Rebuilds large review campaigns in small, safe batches from the Hub, so one slow Google Sheets response cannot
  abandon a 100-plus-recipient template refresh. It also skips the costly Badger lookup unless a template actually
  uses the tasting-offer merge field (subject or body); when it is unused, the offer value is left blank.
  The editor fallback rebuildUnsentCampaignEmails() loops through every batch. Rebuild batches never send email.
- Rebuilds unsent campaign email snapshots from one Audit Log lookup instead of searching that sheet once per
  recipient. Large review campaigns can refresh current template copy without timing out; edited recipient copy
  remains protected and no rebuild sends email.
- Applies each saved sales campaign's distance, fit, and optional field criteria to Initial, Follow-up, and
  Nurture previews, freezes, and send-time checks. A Follow-up campaign with a 30-mile radius can no longer
  include or send a farther-away recipient simply because it is not an Initial campaign.
- Sets the editable sell-sheet headline default to "Oshkosh's First Distillery Since 1919" for the May-style
  product sheet. Existing Email Editor content remains untouched.
- Makes conflicting active Customer Prices rows explicitly unpriceable in the sell sheet, matching invoicing,
  and classifies gift boxes before canned cocktails when no SKU section is selected.
- Routes known liqueur SKU prefixes and liqueur product names to Liqueur so active products are retained in the
  sell-sheet catalog when Karl has not selected an explicit section.
- Retains the protected sell-sheet read: an append-only SELL SHEET editor block, sell_sheet_section SKU dropdown,
  live active-SKU grouping and availability, and account-aware wholesale prices only when the Netlify proxy has
  verified a staff session or a time-limited customer link. The public listSkus response remains price-free.
CHANGES IN 2026.10.05.27-APP
- Gives every Cocktail list recipient a 14-day gap from another Cocktail list or sales outreach email, while
  preserving the existing sales-follow-up cadence. The per-execution send index continues to fail closed for
  undated sends and records accepted sends before a scheduler can start another campaign.
- Adds the Campaign Settings Public site URL, uses it for new order-portal links, and supplies the editor-only
  rewritePublicSiteUrls() migration for saved Account Programs links. It changes only legacy Netlify-host URLs.
CHANGES IN 2026.10.04.25-APP
- Makes Cocktail list delivery use the mailer's newsletter-contact action, which validates the subscribed contact
  and records one authoritative Activity Log row with the real subject. It never treats a newsletter as sales outreach.
- Builds one per-execution Activity Log cooldown index and one newsletter/directory/program index, preventing
  per-recipient sheet reads while preserving fail-closed protection for undated sent rows.
- Applies Directory and Account Programs email suppressions to Cocktail list eligibility, unsubscribes every
  duplicate Newsletter Contacts row for a reply-stop, and requires a physical mailing address before preview or freeze.
- Hides irrelevant sales criteria and approvals for Cocktail list campaigns; their previews use contact details.
CHANGES IN 2026.10.04.24-APP
- Adds reviewed Cocktail list campaigns for subscribed newsletter contacts, using the existing campaign approval,
  batch, scheduler, and mailer guards. These messages have their own append-only template and a seven-day
  cross-send cooldown with sales outreach; reply-stop unsubscribes the newsletter contact.
CHANGES IN 2026.10.04.23-APP
- Makes the monthly tasting-offer Badger lookup fail closed: any source-read error suppresses the offer for every
  recipient for that execution. It also preserves the account matcher’s explicit-link precedence and conflicting-order
  safety rule.
CHANGES IN 2026.10.04.22-APP
- Adds one shared, append-only MONTHLY CONTENT section for outreach templates and a per-recipient tasting-offer
  gate: only Prospects without a matched Badger invoice in the prior 12 months can render that optional offer.
  Campaign previews freeze the rendered content, so the reviewed offer is what is sent.
CHANGES IN 2026.10.04.21-APP
- Badger invoice preview and create always read SKUs, Price Tiers and Customer Prices fresh, so a fixed price or proof
  is used at once; installHubReadCacheWarmer() also adds a change trigger on the inventory workbook.
- Duplicate Price Tiers rows, or duplicate active Customer Prices rows for one SKU and account, with different prices
  block invoicing instead of picking one; checkWholesaleCatalog() reports them as tier_conflicts and
  customer_price_conflicts, and lists products with no Toast item as not_stock_tracked (information).
- The Toast stock import clears toast_stock / toast_stock_date for a mapped SKU missing from the newest report, so the
  order page shows "Staff will confirm availability" instead of an old "In stock".
CHANGES IN 2026.10.04.20-APP
- Wholesale prices come from the SKUs tab: price_tier (amounts on the Price Tiers tab) or a wholesale_price override,
  plus account-specific rows on Customer Prices. Replaces the Current Prices tab and seedCurrentPricesTab().
- SKUs toast_stock (weekly Toast bottle count) marks products In stock / Out of stock on the order page.
- importLatestToastStockReport() (hourly via installToastStockImport) reads the newest Toast 86 Report CSV from the
  "Toast 86 Reports" Drive folder and updates toast_stock / toast_stock_date by each SKU's toast_item_name.
CHANGES IN 2026.10.03.19-APP
- Adds scheduled campaign sends: an approved campaign can be given a send time; a five-minute trigger
  (installOutreachCampaignScheduler) sends it in small locked batches with every manual-send guard, skips
  recipients a guard blocks, and pauses the schedule if a mailer attempt fails or is uncertain.
CHANGES IN 2026.10.03.18-APP
- Repairs strict Directory validations for every stage, status, and outcome this project writes, so lifecycle advances and new outcomes cannot fail after Zoho acceptance.
- Requires Follow-up 1 and 2 due dates before preview, freeze, or send; preserves a campaign's stored stage when rebuilding or reconciling a delivery.
- Allows recurring Nurture check-ins only after a 60-day duplicate-send cooldown.
CHANGES IN 2026.10.01.3
- Exposes the permanent Online-request-to-Badger-invoice link and current Badger payment state in both staff invoice and Online-request views.
CHANGES IN 2026.09.24.56
- Corrects live payment-state classification, reversible payment marks, sync freshness validation, and pending-reminder resolution safeguards.
CHANGES IN 2026.09.24.55
- Adds staff-locked live-tracker payment marks, check recording, and an audit ledger for Badger payment operations.
CHANGES IN 2026.09.24.54
- Hardens the pre-deployment Badger sync and payment-reminder safety paths following review.
CHANGES IN 2026.09.24.53
- Makes Badger payment reminders eligible only for fresh, aged Customer-owes invoices and adds fingerprint, pending-send, cooldown, and retry-safe timeout guards.
CHANGES IN 2026.09.24.52
- Adds staff- and schedule-triggered Badger status synchronization, with fail-closed source validation, a fresh-status ledger, sync audit rows, and account payment states derived from Badger plus the live tracker.
CHANGES IN 2026.09.24.51
- Adds a manual Badger server-login spike that caches an authenticated session for no more than 20 minutes and logs only the invoice count plus five invoice numbers.
- Keeps customer payment reminders disabled by default; the preview hides Send and the send endpoint refuses until Hub Configuration explicitly enables them.
CHANGES IN 2026.09.24.50
- Adds an account-level unpaid Badger invoice queue with balances, payment-due filtering, reviewed one-at-a-time reminder delivery, idempotency, and an audit trail. No reminder is sent automatically.
CHANGES IN 2026.09.24.49
- Sends an immediate sales alert when a recipient opens the tracked wholesale-application link, while excluding likely link-scanner clicks and retaining duplicate-click suppression.
CHANGES IN 2026.09.24.48
- Drive response relay: when the staff proxy sends relay_id, every response is also written to a fixed Drive slot file that the proxy reads directly, bypassing the stalling web-app response handoff. Run setupDriveRelay() once.
CHANGES IN 2026.09.24.47
- Read responses over 50 KB are sent gzip+base64 when the staff proxy asks (gz=1). The 647 KB Outreach list was stalling in Google's response handoff even though it built in ~2 seconds.
CHANGES IN 2026.09.24.46
- Opening a campaign reads its recipient rows in one block instead of one sheet read per recipient.
- warmHubReadCaches rebuilds at most one missing cache per run, so it no longer competes with staff requests for 30+ seconds.
CHANGES IN 2026.09.24.45
- listSkus reads an optional "Out of Stock" checkbox column in SKUs and marks those products Out of stock for the order page.
CHANGES IN 2026.09.24.43
- Learned Badger aliases match an exact customer name first and use the loose name key only when it points to one account. A staff link is always learned, so correcting a loose-name collision teaches the right account instead of being refused.
CHANGES IN 2026.09.24.42
- Keeps a staff-ignored Badger invoice out of every account ledger, including an account whose order references that invoice.
- Treats conflicting loose customer-name aliases and conflicting Badger Location_Directory mappings as review-needed rather than choosing the last row and guessing an account.
CHANGES IN 2026.09.24.41
- Refresh buttons (Orders & Accounts, Outreach, Inventory store list) rebuild through the read cache and save the fresh result even when the browser request times out, so the next normal load shows current data instead of repeating a slow rebuild.
CHANGES IN 2026.09.24.40
- Business CSV import writes new Directory rows and import-log rows in one batch per sheet instead of two appendRow calls per business, so imports finish inside the web request limit; if a batch is rejected it falls back to row-by-row and logs each failure.
CHANGES IN 2026.09.24.39
- Badger invoice matching learns: a staff link also saves the Badger customer name in "Badger Customer Aliases", so later invoices for that customer match automatically.
- Uses the Badger Tracker Location_Directory (Invoice Name → Public Name) to match legal names to Directory businesses.
- Customer-name comparison ignores case, punctuation, spacing, a leading "The", and trailing LLC/Inc./Co./Corp.
CHANGES IN 2026.09.24.38
- Account ID repair writes only the Account ID (and Directory Record Created At) columns instead of rewriting whole tabs, so data validation, formulas, and unrelated cells are untouched.
- Each related tab is backfilled independently; a failing tab is logged and reported in the repair result instead of stopping the repair.
CHANGES IN 2026.09.24.37
- Replaces per-keystroke Directory reads with one compact, versioned customer-account index cached server-side and in the browser.
- Keeps Badger invoice account filtering entirely in the browser after the first account-box focus.
CHANGES IN 2026.09.24.36
- Keeps unmatched and ignored Badger invoices reviewable without loading the full Directory into the work-queue cache.
- Gives conflicting order references an explicit manual-review reason and prevents an overridden invoice from appearing on two accounts.
- Adds staff-controlled invoice ignore/restore and uses the Badger cache before a Tracker read when linking.
CHANGES IN 2026.09.24.35
- Added an account-level Badger invoice ledger that supports accounts without inventory tracking.
- Matches invoices by existing order, one exact directory business name, or an explicit staff-reviewed Account ID link.
- Keeps ambiguous invoices visible for review and refreshes Badger invoice cache data on explicit Orders & Accounts refreshes.
EARLIER CHANGES
- Invalidates Hub read caches for spreadsheet edits, direct editor writes, failed write requests, and explicit refreshes.
- Limits read-cache entries to fifteen minutes and safe 45 KB chunks.
- Makes an external email contact mark a no-outcome prospect Sent and schedule its first follow-up.
- Normalizes legacy Medium priorities to Normal during the explicit structure repair.
- Updates bulk campaign exclusions only in their Status and Result Detail cells.
- Added versioned, chunked read caching and a daytime cache warmer for core Hub load paths.
- Added stage timing metadata to all primary staff read responses.
- Added campaign recipient search, filters, sorting, and batched exclusion support.
- Added external contact logging, engagement repair/backfill, and valid High/Normal/Low priority handling.
OTHER EARLIER CHANGES
- Rechecks full initial-send eligibility while freezing a campaign, using one memoized Pilot Review read and cross-row email duplicate protection.
- Blocks campaign delivery when another directory row or a non-test Activity Log Initial send already used the recipient address.
- Builds campaign previews from directory-only eligibility records and defers rendered email creation until campaign freeze.
- Rejects campaign exclusion changes for recipients already marked Sent or Sent - needs recording.
- Backfills missing legacy campaign-recipient cities from one directory read per campaign load and omits unstored legacy mileage.
- Makes campaign delivery use one directory row plus targeted Activity Log duplicate lookup instead of rebuilding Outreach support maps.
- Batches directory finalization into one row write and logs lock, row-read, mailer, and finalization timing for every recipient.
- Lets timeout recovery reconcile the specific delivery-unknown recipient before the browser decides whether to continue.
- Requires a preview and confirmation of editable center, radius, fit, optional field filters, and recipient cap before freezing a campaign.
- Calculates campaign distance between ZIP centroids, so campaigns can target a ZIP, city, or the distillery rather than only Oshkosh.
- Stores each new campaign's criteria as JSON, shows frozen center distance in review, and rechecks that criteria immediately before delivery.
- Leaves campaigns created before stored criteria without a new distance or fit gate at send time.
- Adds cached ZIP-centroid mileage, manual-mile protection, and an admin mileage-recalculation action.
- Rebuilds only review-ready campaign snapshots from the current template after reconciling verified blocked sends.
- Reconciles campaign recipients with verified Activity Log acceptance records without resending or adding an Activity Log send row.
- Sends Karl-only test email HTML from the renderer's actual html field so test links retain their non-recording marker.
- Uses Reactivation-specific online-ordering wording for the wholesale application link in every renderer.
- Marks tracking links in Karl-only test messages so test clicks redirect without being recorded as prospect engagement.
- Includes the wholesale application link in every outreach stage while retaining tracked-link fallback behavior.
- Shows the most recent tracked link target alongside click counts in Outreach business details.
- Added opt-in signed sell-sheet and wholesale-application links for click measurement without changing send approval, eligibility, receipt, or Activity Log safeguards.
- Added a locked-down click-engagement endpoint for signed Netlify tracking links, with duplicate suppression and no request-path schema changes.
- Replaced full Outreach support-tab reads for a single business with targeted record lookups, cached campaign settings, and added record timing diagnostics.
- Corrected all-caps business display formatting so a terminal possessive 's stays lowercase while names such as O'Brien still retain their internal capital.
- Added lightweight Outreach badges and search text from the Programs and Engagement support tabs for slim dashboard loads.
- Fixed the nightly repair trigger handler, refreshed a missed Badger invoice lookup once, and made single-record Outreach lookup accept source-row-only requests.
- Added an optional slim Outreach dashboard response and a single-record outreach endpoint.
- Moved structural and Account ID repair out of normal requests, with an optional nightly repair installer.
- Memoized Hub configuration and campaign settings, cached Badger invoices, and reduced campaign-list reads.
- Batched business updates and added per-stage customer work-queue timing.
- Allows genuinely unsent blocked campaign recipients to return to review after checking the mailer Activity Log for an accepted send.
- Keeps an accepted Zoho message out of the resend path when its follow-up sheet recording fails.
- Locks campaign approval and preserves valid idempotency tokens that begin with a hyphen.
- Added reopening for unsent approved campaign recipients, returning only those recipients to review for editing.
- Preserved sent, blocked, and excluded recipients when reopening a campaign, and kept every reopen audited.
- Added saved, per-recipient campaign subject and message editing before approval.
- Allowed Karl-only test sends for saved drafts whose prospect email is missing or unverified.
- Kept every real-send recipient, exclusion, stage and duplicate safety check unchanged.
EARLIER STAGING CHANGES
- Removed duplicate account migration and cross-tab backfills from the customer work-queue read path.
- Added customer work-queue timing diagnostics without changing customer records.
- Removed account migration and cross-tab backfills from the Outreach dashboard read path.
- Reused one workbook handle per request instead of reopening the Outreach workbook repeatedly.
- Moved mailer-status and newsletter reads behind small dedicated endpoints.
- Cached mailer status briefly and logged per-stage dashboard timing.
- Reduced repeated activity payload while preserving recent history in the app.
- Required the shared staff code for every inventory read and write at the Netlify boundary.
- Added an Inventory unlock gate that prevents data loading before authentication.
- Neutralized spreadsheet formulas in staff-written product, contact and count fields.
- Restored usable count and reorder controls after network or response failures.
- Added account-centric order, invoice, delivery, activity and reorder history.
- Kept non-counted customer accounts out of active Inventory stores by default.
- Added locked, one-at-a-time app email delivery through the separate Zoho mailer.
- Preserved Pilot Review as a read-only legacy archive and duplicate-send source.
- Added global browser error visibility and staff-code throttling.
- Added a guarded, verified migration into one staging Distribution Hub workbook.
- Kept the existing staging Inventory Backend as a rollback source until cutover.
- Replaced spreadsheet-row identity with permanent account IDs.
- Added write-ahead submission journals, audit events and retryable integration jobs.
- Linked outreach, applications, ordering access, orders, delivery and Badger invoices.
- Added protected business creation and reviewable CSV business imports.
- Added idempotent customer, store, delivery and Badger reconciliation writes.
- Kept the proven Badger parser separate and read only from this application.
- Added a disabled Toast catalog adapter boundary without adding credentials.
- Preserved all existing inventory, count, reorder and outreach workflows.
- Replaced the browser-autofill-prone company_website spam trap.
- Prevented legitimate customer applications and orders from being discarded.
- Added an immediate staff email for each new online order request.
- Included ordered products and a direct staging-row link in the notice.
- Recorded order-notification success or failure without losing the order.
- Added an immediate staff email for each new wholesale customer application.
- Sent application notices to sales@sturgeonspirits.com with a direct review link.
- Set the applicant as the reply-to address for efficient follow-up.
- Recorded notification success or failure beside the saved application.
- Kept application storage successful even if the notification email fails.
- Enabled API-key authentication for every Inventory API request.
- Required the same API_KEY in Apps Script Properties and Netlify.
- Rejected direct requests that omit the key or provide the wrong key.
- Preserved all inventory, outreach, customer and ordering behavior from .22.
- Selected newsletter participation by default on the customer application.
- Added explicit instructions for applicants who do not want newsletter email.
- Recorded that the newsletter option was preselected on the form.
- Prepared the Netlify-hosted customer application for initial-email links.
- Kept the public link disabled until a deployed HTTPS URL is configured.
- Standardized the companion email system name as Distribution Outreach.
- Corrected the customer-facing address to sales@sturgeonspirits.com.
- Matched the supplied Badger customer form by collecting only the seller's permit.
- Removed alcohol license type and issuing municipality from new applications.
- Preserved existing staging-sheet licensing data without collecting more.
- Removed the alcohol license number from new customer applications.
- Preserved any existing staging-sheet license-number data without collecting more.
- Corrected the invoice workflow: Sturgeon provides the invoice with delivery.
- Clarified that the invoice directs payment to Badger State Cooperative.
- Standardized the product name as Sturgeon Distribution Hub.
- Updated API identity and activity-source labels to the new product name.
- Updated the cooperative's customer-facing name to Badger State Cooperative.
- Clarified that Sturgeon Spirits manages ordering and self-distribution.
- Clarified that payment is remitted to Badger State Cooperative.
- Locked inventory reads and writes to the staging Inventory Backend copy.
- Removed reliance on whichever spreadsheet happens to own the script.
- Added a public new-customer application endpoint based on the April 2026 form.
- Added structured account, contact, delivery, product-interest and consent fields.
- Added a customer order-request endpoint with normalized order lines.
- Kept account approval, price confirmation, invoicing and payment as staff decisions.
- Added submission tokens, honeypots, length limits and staged review statuses.
- Stored customer applications and order requests only in the staging workbook.
- Added a standalone newsletter contact list for customers and non-customers.
- Added relationship types including banker, vendor, partner and community.
- Required consent details before a contact can be marked Subscribed.
- Kept newsletter sending disabled during staging.
- Scaffolded read-only Toast stock integration with explicit SKU mapping.
- Added email engagement events and estimated-open summaries.
- Kept Toast credentials, tracking pixels and newsletter tracking disabled.
- Prioritized clicks, replies and orders over imperfect open signals.
- Scaffolded consent-aware newsletter participation for each business.
- Scaffolded online-ordering candidacy, invitations and account activation.
- Stored both optional programs separately from the core directory workflow.
- Kept newsletter delivery and online ordering inactive during staging.
- Added editable outreach subjects and message bodies with persistent drafts.
- Stored per-business drafts in a separate Outreach Drafts staging tab.
- Kept the sell sheet, signature, logo and compliance footer standardized.
- Exposed saved drafts to the Zoho sender without approving or sending them.
- Added the complete Outreach business directory and all nonblank row fields.
- Added business detail, contact editing, and append-only business notes.
- Added contact-update activity logging with row and email change checks.
- Added one authoritative weekly audience: Fit 5 within 15 miles of Oshkosh.
- Added in-app editing for qualification, mileage and email confidence.
- Normalized all-caps business names in email previews and app display.
- Added send-safety eligibility reasons without changing source-sheet rows.
- Corrected staging header aliases for contact, queue, fit and Top 50 fields.
- Reused Campaign Settings as the email-preview source of truth.
- Kept email delivery disabled in this API and preserved inventory workflows.
PASTE INSTRUCTIONS
- This is the complete Code.gs source, not a partial snippet.
- Use only in the staging inventory backend until testing is complete.
```
