/*********************************
 * Inventory API (JSON) for Netlify
 * App version: 2026.10.10.40-APP
 *
 * CHANGES IN THIS VERSION
 * - "Answered — log outcome": a reply closed as "Answered in Zoho" stays listed (with Log outcome) until an outcome is
 *   recorded for it, so answered emails leave the to-do list but the business doesn't get lost. The new Inbound Replies
 *   column "Outcome Logged" is filled when an outcome is logged from the reply, from Log outcome on the business, or
 *   from Log contact with an outcome (every reply of that business waiting for an outcome), or when staff choose
 *   "No outcome needed".
 * - Reopen on a reply records "Reopened by <staff>" with the time (Status stays New), and "Answered in Zoho" only closes
 *   a reopened reply again for a message sent after the reopen.
 * - Alt emails are learned: logging an outcome from a reply sent from an address that isn't the business's email (and
 *   isn't already in its Notes, a bounce, a mail daemon or our own domain) adds "Alt email: <address>" to the Notes, so
 *   later replies from that person match the business.
 *
 * CHANGES IN 2026.10.10.39-APP
 * - Replies answered from Zoho are closed automatically. After each check, open replies (Status New, a Thread ID, not a
 *   bounce or unsubscribe, not "Confirm unsubscribe" / "Review bounce") are compared with the Sent folder through the
 *   mailer's listSentInThreads (2026.10.10.32-APP): a message sent from sales@ in the same thread after the reply was
 *   received marks it Handled ("Answered in Zoho <date>", Handled At = the sent time) and writes an audit line. Only the
 *   four status cells are written. A failure here is logged and never fails the check; the run summary and "Last
 *   checked" show how many were answered, and warn when the Sent scan hit its cap.
 * - Bounces that were refused or unclear no longer suggest "Bad address"; only a hard bounce does.
 *
 * CHANGES IN 2026.10.09.38-APP
 * - Inbound reply checker. Every 15 minutes (installInboundReplyChecker() once) the Hub asks the Distribution Outreach
 *   mailer (2026.10.09.28-APP) for new Inbox messages addressed (To/Cc) to sales@ and keeps the ones that answer us:
 *   from a Directory email or an "Alt email" in Notes, an address we emailed, a Newsletter contact, or a bounce naming
 *   one of our recipients. A "Re:" from the only Directory business on that company domain, or a "Re:" of a subject
 *   sent to exactly one business, is kept as a possible match that changes nothing. Each reply is written to the
 *   new Inbound Replies tab (created by repairHubStructure() or the installer) with the reply text (quoted history
 *   removed), the business, what we last sent, a category, a one-line summary, the suggested outcome, a priority and a
 *   respond-by time (orders, interest and tastings: same business day if received by 3 PM; questions and the rest: next
 *   business day).
 * - Categories come from fixed rules (bounces; a reply that is only "stop" / "unsubscribe" / "remove me"; "cocktails";
 *   automatic replies recognised from their headers or subject). The Hub makes no AI calls. Any other reply is listed as
 *   "Needs reading" (Classifier "Awaiting skill") until the sort-inbound-replies Claude skill sorts it in the sheet.
 * - Applied without a click (the only automatic changes), and only for a sure match: a person's reply sets Status
 *   "Replied" and clears Next Follow-Up when the row was waiting on a sales or reactivation email; a reply that is only
 *   "stop" (plus sign-off lines) records Unsubscribed (as the Log outcome button does) and unsubscribes the newsletter
 *   contact; a bounce saying the row's current address does not exist (5.1.x / user unknown) records Bad address.
 *   Blocked, refused, delayed and unclear bounces, automatic replies, mailing-list mail and possible matches change
 *   nothing. A stop or bounce that could not be applied stays open as "Confirm unsubscribe" / "Review bounce".
 *   An unsubscribe request the skill finds in a longer message is only suggested.
 * - Each message is stored once: Zoho IDs are written as text, a per-message script lock re-checks the ID, the row is
 *   written before any change is made, and the checkpoint is saved after every message. Status changes and the
 *   automatic Directory changes write only the cells they change (also for Log outcome and Log contact), so
 *   apostrophe-protected text is never turned into a formula. Respond-by times use the project time zone; the
 *   installer warns unless it is America/Chicago.
 * - New staff actions: inboundReplies (read), resolveInboundReply (Handled / Dismissed / reopen) and checkInboundReplies
 *   (starts a background check). updateOutreachOutcome accepts reply_id and marks that reply handled in the same save.
 *
 * CHANGES IN 2026.10.08.37-APP
 * - Order online invite: a recent Badger invoice matched to a Directory account by business or location name alone
 *   now counts when that row's Relationship shows customer history (Current customer, Customer, Existing customer,
 *   Lapsed customer or Win-back due). The preview gives the reason as "<Relationship> with a Badger invoice in the
 *   last 12 months (matched by business name; Relationship may need updating)". A name-only match into a Prospect
 *   (or blank) row is still left out as "Possible customer" until the invoice is linked, because the same name could
 *   be a different business. The same rule is used at preview, rebuild and send time.
 * - Public customer actions (listSkus, submitCustomerApplication, submitOnlineOrderRequest) return only messages
 *   written for the customer (validation such as "Business name is required."). Any other failure is logged with
 *   console.error and the caller sees "The request could not be processed."
 * - The public order reply no longer includes the internal Account ID or verification status (only message and
 *   request_id).
 * - Write actions are refused over GET ("This action must be sent as POST."); only READ_ACTIONS work as a GET, so a
 *   link cannot trigger syncBadgerStatus or another change. The staff proxy (2026.10.08.40-WEB) refuses them first.
 * - Rebuild / send-time re-check reads Badger only for rows that Relationship or Status do not already qualify, so a
 *   Badger read failure during a scheduled send no longer blocks Current customer / Existing customer recipients.
 *
 * CHANGES IN 2026.10.08.36-APP
 * - New campaign type "Current customers — order online invite" (campaign_type customer_invite, stage Order online
 *   invite). Audience: Directory rows whose Relationship is Current customer / Customer or whose Status is Existing
 *   customer, plus any Directory account with a non-void Badger invoice in the last 12 months that is matched by an
 *   explicit invoice link, an order link or a learned alias. A match by business or location name alone could be a
 *   different business with the same name, so it is only listed as a "possible customer" (link the invoice to include
 *   it). If Badger cannot be read the preview stops instead of shrinking. The preview lists who was left out by name,
 *   why each recipient is included, recent invoices that match no Directory account, and a stale Badger sync. Left out,
 *   and counted by reason in the preview: no or invalid email, Do Not Email, an opt-out status or outcome, an account
 *   already ordering online (Account Programs ordering status Active), an address that already received the invite,
 *   an unverified email, and the 14-day gap after a Cocktail list email. One recipient per address.
 * - The message comes from a new CUSTOMER ORDER INVITE EMAIL block in the Email Editor (added with starting copy by
 *   repairHubStructure(); edited cells are never overwritten). The code always adds the link to the wholesale account
 *   form (tracked when Tracking base URL is set, prefilled with the account, business and email), the sign-off and the
 *   physical address / "Reply stop to unsubscribe." footer. These sit outside the editable text, so editing one
 *   recipient's email or rebuilding it never drops the link. Requires Physical mailing address and Customer
 *   application URL. An address that received the invite is never sent the Initial prospect email.
 * - It uses the existing review → freeze → approve → batch / scheduled send flow. Every check is repeated at rebuild
 *   and send time, and sending goes through the Distribution Outreach mailer's new sendCustomerEmail action
 *   (2026.10.08.26-APP). The Directory outreach stage, Last Emailed and follow-up dates are never changed.
 *
 * CHANGES IN 2026.10.08.35-APP
 * - Cocktail list: Directory Do Not Email no longer excludes an active customer (Directory status Existing customer
 *   and Account Programs ordering status Active, both set on activation) whose Newsletter Contacts status is
 *   Subscribed. Activation ticks Do Not Email only to stop sales outreach. Every recorded opt-out still excludes:
 *   newsletter or program Unsubscribed/Declined, and a Directory status or outcome of Do not contact, Unsubscribed,
 *   Bad address or Not interested. Sales stages, Reactivation and payment reminders still honor Do Not Email.
 * - A customer application with the newsletter box ticked no longer re-subscribes an address whose Newsletter
 *   Contacts status is Unsubscribed or Declined, and no longer replaces the name, business or account already on
 *   that row (the public form does not prove who owns the address). It fills blank fields and adds a note; staff can
 *   re-subscribe from the Hub. A new address, or a Candidate/Invited contact, is subscribed as before. Any
 *   Unsubscribed/Declined row for the address counts (not only the first row), and a row without a Contact ID gets one.
 * - Cocktail list: an address with any Unsubscribed or Declined Newsletter Contacts row is treated as opted out, even if
 *   another row for the same address says Subscribed (preview, freeze, rebuild and send all use the same record).
 *
 * CHANGES IN 2026.10.07.34-APP
 * - New read-only salesReport action (Orders & Accounts area): returns the displayed values of the Badger tracker's
 *   Sales by Location, Sales by Product and Location x Product tabs. The analysis itself is sheet formulas.
 * - submitCounts always writes the count to on-hand inventory and the last-count fields; the updateInventory flag
 *   (formerly a Hub checkbox, now removed) is ignored.
 * - managerGrid returns each store's most recent count date (latest last_count_date on its Inventory rows), shown on
 *   the Inventory summary's location lines.
 * - Inventory counts: submitCounts accepts an optional submission_token and skips a retry whose token is already in the
 *   Counts log, so a timed-out submit tapped again is not recorded twice. Shelf, back, the system number the counter
 *   started from, and the token are logged in four new Counts columns (added automatically). Inventory on-hand and
 *   last-count fields are written in three batched column writes instead of two or three calls per bottle. A bottle
 *   whose system number changed during the count is reported in the response. Bottles confirmed as matching are
 *   submitted too, so their last-count date updates. Counts must be whole numbers; a repeated SKU is rejected.
 * - (2026.10.06.33-APP, not separately deployed) Batched campaign-template rebuild; see below.
 * - Rebuilds large review campaigns in small, safe batches from the Hub, so one slow Google Sheets response cannot
 *   abandon a 100-plus-recipient template refresh. It also skips the costly Badger lookup unless a template actually
 *   uses the tasting-offer merge field (subject or body); when it is unused, the offer value is left blank.
 *   The editor fallback rebuildUnsentCampaignEmails() loops through every batch. Rebuild batches never send email.
 * - Rebuilds unsent campaign email snapshots from one Audit Log lookup instead of searching that sheet once per
 *   recipient. Large review campaigns can refresh current template copy without timing out; edited recipient copy
 *   remains protected and no rebuild sends email.
 * - Applies each saved sales campaign's distance, fit, and optional field criteria to Initial, Follow-up, and
 *   Nurture previews, freezes, and send-time checks. A Follow-up campaign with a 30-mile radius can no longer
 *   include or send a farther-away recipient simply because it is not an Initial campaign.
 * - Sets the editable sell-sheet headline default to "Oshkosh's First Distillery Since 1919" for the May-style
 *   product sheet. Existing Email Editor content remains untouched.
 * - Makes conflicting active Customer Prices rows explicitly unpriceable in the sell sheet, matching invoicing,
 *   and classifies gift boxes before canned cocktails when no SKU section is selected.
 * - Routes known liqueur SKU prefixes and liqueur product names to Liqueur so active products are retained in the
 *   sell-sheet catalog when Karl has not selected an explicit section.
 * - Retains the protected sell-sheet read: an append-only SELL SHEET editor block, sell_sheet_section SKU dropdown,
 *   live active-SKU grouping and availability, and account-aware wholesale prices only when the Netlify proxy has
 *   verified a staff session or a time-limited customer link. The public listSkus response remains price-free.
 *
 * CHANGES IN 2026.10.05.27-APP
 * - Gives every Cocktail list recipient a 14-day gap from another Cocktail list or sales outreach email, while
 *   preserving the existing sales-follow-up cadence. The per-execution send index continues to fail closed for
 *   undated sends and records accepted sends before a scheduler can start another campaign.
 * - Adds the Campaign Settings Public site URL, uses it for new order-portal links, and supplies the editor-only
 *   rewritePublicSiteUrls() migration for saved Account Programs links. It changes only legacy Netlify-host URLs.
 *
 * CHANGES IN 2026.10.04.25-APP
 * - Makes Cocktail list delivery use the mailer's newsletter-contact action, which validates the subscribed contact
 *   and records one authoritative Activity Log row with the real subject. It never treats a newsletter as sales outreach.
 * - Builds one per-execution Activity Log cooldown index and one newsletter/directory/program index, preventing
 *   per-recipient sheet reads while preserving fail-closed protection for undated sent rows.
 * - Applies Directory and Account Programs email suppressions to Cocktail list eligibility, unsubscribes every
 *   duplicate Newsletter Contacts row for a reply-stop, and requires a physical mailing address before preview or freeze.
 * - Hides irrelevant sales criteria and approvals for Cocktail list campaigns; their previews use contact details.
 *
 * CHANGES IN 2026.10.04.24-APP
 * - Adds reviewed Cocktail list campaigns for subscribed newsletter contacts, using the existing campaign approval,
 *   batch, scheduler, and mailer guards. These messages have their own append-only template and a seven-day
 *   cross-send cooldown with sales outreach; reply-stop unsubscribes the newsletter contact.
 *
 * CHANGES IN 2026.10.04.23-APP
 * - Makes the monthly tasting-offer Badger lookup fail closed: any source-read error suppresses the offer for every
 *   recipient for that execution. It also preserves the account matcher’s explicit-link precedence and conflicting-order
 *   safety rule.
 *
 * CHANGES IN 2026.10.04.22-APP
 * - Adds one shared, append-only MONTHLY CONTENT section for outreach templates and a per-recipient tasting-offer
 *   gate: only Prospects without a matched Badger invoice in the prior 12 months can render that optional offer.
 *   Campaign previews freeze the rendered content, so the reviewed offer is what is sent.
 *
 * CHANGES IN 2026.10.04.21-APP
 * - Badger invoice preview and create always read SKUs, Price Tiers and Customer Prices fresh, so a fixed price or proof
 *   is used at once; installHubReadCacheWarmer() also adds a change trigger on the inventory workbook.
 * - Duplicate Price Tiers rows, or duplicate active Customer Prices rows for one SKU and account, with different prices
 *   block invoicing instead of picking one; checkWholesaleCatalog() reports them as tier_conflicts and
 *   customer_price_conflicts, and lists products with no Toast item as not_stock_tracked (information).
 * - The Toast stock import clears toast_stock / toast_stock_date for a mapped SKU missing from the newest report, so the
 *   order page shows "Staff will confirm availability" instead of an old "In stock".
 *
 * CHANGES IN 2026.10.04.20-APP
 * - Wholesale prices come from the SKUs tab: price_tier (amounts on the Price Tiers tab) or a wholesale_price override,
 *   plus account-specific rows on Customer Prices. Replaces the Current Prices tab and seedCurrentPricesTab().
 * - SKUs toast_stock (weekly Toast bottle count) marks products In stock / Out of stock on the order page.
 * - importLatestToastStockReport() (hourly via installToastStockImport) reads the newest Toast 86 Report CSV from the
 *   "Toast 86 Reports" Drive folder and updates toast_stock / toast_stock_date by each SKU's toast_item_name.
 *
 * CHANGES IN 2026.10.03.19-APP
 * - Adds scheduled campaign sends: an approved campaign can be given a send time; a five-minute trigger
 *   (installOutreachCampaignScheduler) sends it in small locked batches with every manual-send guard, skips
 *   recipients a guard blocks, and pauses the schedule if a mailer attempt fails or is uncertain.
 *
 * CHANGES IN 2026.10.03.18-APP
 * - Repairs strict Directory validations for every stage, status, and outcome this project writes, so lifecycle advances and new outcomes cannot fail after Zoho acceptance.
 * - Requires Follow-up 1 and 2 due dates before preview, freeze, or send; preserves a campaign's stored stage when rebuilding or reconciling a delivery.
 * - Allows recurring Nurture check-ins only after a 60-day duplicate-send cooldown.
 *
 * CHANGES IN 2026.10.01.3
 * - Exposes the permanent Online-request-to-Badger-invoice link and current Badger payment state in both staff invoice and Online-request views.
 *
 * CHANGES IN 2026.09.24.56
 * - Corrects live payment-state classification, reversible payment marks, sync freshness validation, and pending-reminder resolution safeguards.
 *
 * CHANGES IN 2026.09.24.55
 * - Adds staff-locked live-tracker payment marks, check recording, and an audit ledger for Badger payment operations.
 *
 * CHANGES IN 2026.09.24.54
 * - Hardens the pre-deployment Badger sync and payment-reminder safety paths following review.
 *
 * CHANGES IN 2026.09.24.53
 * - Makes Badger payment reminders eligible only for fresh, aged Customer-owes invoices and adds fingerprint, pending-send, cooldown, and retry-safe timeout guards.
 *
 * CHANGES IN 2026.09.24.52
 * - Adds staff- and schedule-triggered Badger status synchronization, with fail-closed source validation, a fresh-status ledger, sync audit rows, and account payment states derived from Badger plus the live tracker.
 *
 * CHANGES IN 2026.09.24.51
 * - Adds a manual Badger server-login spike that caches an authenticated session for no more than 20 minutes and logs only the invoice count plus five invoice numbers.
 * - Keeps customer payment reminders disabled by default; the preview hides Send and the send endpoint refuses until Hub Configuration explicitly enables them.
 *
 * CHANGES IN 2026.09.24.50
 * - Adds an account-level unpaid Badger invoice queue with balances, payment-due filtering, reviewed one-at-a-time reminder delivery, idempotency, and an audit trail. No reminder is sent automatically.
 *
 * CHANGES IN 2026.09.24.49
 * - Sends an immediate sales alert when a recipient opens the tracked wholesale-application link, while excluding likely link-scanner clicks and retaining duplicate-click suppression.
 *
 * CHANGES IN 2026.09.24.48
 * - Drive response relay: when the staff proxy sends relay_id, every response is also written to a fixed Drive slot file that the proxy reads directly, bypassing the stalling web-app response handoff. Run setupDriveRelay() once.
 *
 * CHANGES IN 2026.09.24.47
 * - Read responses over 50 KB are sent gzip+base64 when the staff proxy asks (gz=1). The 647 KB Outreach list was stalling in Google's response handoff even though it built in ~2 seconds.
 *
 * CHANGES IN 2026.09.24.46
 * - Opening a campaign reads its recipient rows in one block instead of one sheet read per recipient.
 * - warmHubReadCaches rebuilds at most one missing cache per run, so it no longer competes with staff requests for 30+ seconds.
 *
 * CHANGES IN 2026.09.24.45
 * - listSkus reads an optional "Out of Stock" checkbox column in SKUs and marks those products Out of stock for the order page.
 *
 * CHANGES IN 2026.09.24.43
 * - Learned Badger aliases match an exact customer name first and use the loose name key only when it points to one account. A staff link is always learned, so correcting a loose-name collision teaches the right account instead of being refused.
 *
 * CHANGES IN 2026.09.24.42
 * - Keeps a staff-ignored Badger invoice out of every account ledger, including an account whose order references that invoice.
 * - Treats conflicting loose customer-name aliases and conflicting Badger Location_Directory mappings as review-needed rather than choosing the last row and guessing an account.

 * CHANGES IN 2026.09.24.41
 * - Refresh buttons (Orders & Accounts, Outreach, Inventory store list) rebuild through the read cache and save the fresh result even when the browser request times out, so the next normal load shows current data instead of repeating a slow rebuild.
 *
 * CHANGES IN 2026.09.24.40
 * - Business CSV import writes new Directory rows and import-log rows in one batch per sheet instead of two appendRow calls per business, so imports finish inside the web request limit; if a batch is rejected it falls back to row-by-row and logs each failure.
 *
 * CHANGES IN 2026.09.24.39
 * - Badger invoice matching learns: a staff link also saves the Badger customer name in "Badger Customer Aliases", so later invoices for that customer match automatically.
 * - Uses the Badger Tracker Location_Directory (Invoice Name → Public Name) to match legal names to Directory businesses.
 * - Customer-name comparison ignores case, punctuation, spacing, a leading "The", and trailing LLC/Inc./Co./Corp.
 *
 * CHANGES IN 2026.09.24.38
 * - Account ID repair writes only the Account ID (and Directory Record Created At) columns instead of rewriting whole tabs, so data validation, formulas, and unrelated cells are untouched.
 * - Each related tab is backfilled independently; a failing tab is logged and reported in the repair result instead of stopping the repair.
 *
 * CHANGES IN 2026.09.24.37
 * - Replaces per-keystroke Directory reads with one compact, versioned customer-account index cached server-side and in the browser.
 * - Keeps Badger invoice account filtering entirely in the browser after the first account-box focus.
 *
 * CHANGES IN 2026.09.24.36
 * - Keeps unmatched and ignored Badger invoices reviewable without loading the full Directory into the work-queue cache.
 * - Gives conflicting order references an explicit manual-review reason and prevents an overridden invoice from appearing on two accounts.
 * - Adds staff-controlled invoice ignore/restore and uses the Badger cache before a Tracker read when linking.
 *
 * CHANGES IN 2026.09.24.35
 * - Added an account-level Badger invoice ledger that supports accounts without inventory tracking.
 * - Matches invoices by existing order, one exact directory business name, or an explicit staff-reviewed Account ID link.
 * - Keeps ambiguous invoices visible for review and refreshes Badger invoice cache data on explicit Orders & Accounts refreshes.
 *
 * EARLIER CHANGES
 * - Invalidates Hub read caches for spreadsheet edits, direct editor writes, failed write requests, and explicit refreshes.
 * - Limits read-cache entries to fifteen minutes and safe 45 KB chunks.
 *
 * - Makes an external email contact mark a no-outcome prospect Sent and schedule its first follow-up.
 * - Normalizes legacy Medium priorities to Normal during the explicit structure repair.
 * - Updates bulk campaign exclusions only in their Status and Result Detail cells.
 *
 * - Added versioned, chunked read caching and a daytime cache warmer for core Hub load paths.
 * - Added stage timing metadata to all primary staff read responses.
 *
 * - Added campaign recipient search, filters, sorting, and batched exclusion support.
 * - Added external contact logging, engagement repair/backfill, and valid High/Normal/Low priority handling.
 *
 * OTHER EARLIER CHANGES
 * - Rechecks full initial-send eligibility while freezing a campaign, using one memoized Pilot Review read and cross-row email duplicate protection.
 * - Blocks campaign delivery when another directory row or a non-test Activity Log Initial send already used the recipient address.
 * - Builds campaign previews from directory-only eligibility records and defers rendered email creation until campaign freeze.
 * - Rejects campaign exclusion changes for recipients already marked Sent or Sent - needs recording.
 * - Backfills missing legacy campaign-recipient cities from one directory read per campaign load and omits unstored legacy mileage.
 * - Makes campaign delivery use one directory row plus targeted Activity Log duplicate lookup instead of rebuilding Outreach support maps.
 * - Batches directory finalization into one row write and logs lock, row-read, mailer, and finalization timing for every recipient.
 * - Lets timeout recovery reconcile the specific delivery-unknown recipient before the browser decides whether to continue.
 * - Requires a preview and confirmation of editable center, radius, fit, optional field filters, and recipient cap before freezing a campaign.
 * - Calculates campaign distance between ZIP centroids, so campaigns can target a ZIP, city, or the distillery rather than only Oshkosh.
 * - Stores each new campaign's criteria as JSON, shows frozen center distance in review, and rechecks that criteria immediately before delivery.
 * - Leaves campaigns created before stored criteria without a new distance or fit gate at send time.
 * - Adds cached ZIP-centroid mileage, manual-mile protection, and an admin mileage-recalculation action.
 * - Rebuilds only review-ready campaign snapshots from the current template after reconciling verified blocked sends.
 * - Reconciles campaign recipients with verified Activity Log acceptance records without resending or adding an Activity Log send row.
 * - Sends Karl-only test email HTML from the renderer's actual html field so test links retain their non-recording marker.
 * - Uses Reactivation-specific online-ordering wording for the wholesale application link in every renderer.
 * - Marks tracking links in Karl-only test messages so test clicks redirect without being recorded as prospect engagement.
 * - Includes the wholesale application link in every outreach stage while retaining tracked-link fallback behavior.
 * - Shows the most recent tracked link target alongside click counts in Outreach business details.
 * - Added opt-in signed sell-sheet and wholesale-application links for click measurement without changing send approval, eligibility, receipt, or Activity Log safeguards.
 * - Added a locked-down click-engagement endpoint for signed Netlify tracking links, with duplicate suppression and no request-path schema changes.
 * - Replaced full Outreach support-tab reads for a single business with targeted record lookups, cached campaign settings, and added record timing diagnostics.
 * - Corrected all-caps business display formatting so a terminal possessive 's stays lowercase while names such as O'Brien still retain their internal capital.
 * - Added lightweight Outreach badges and search text from the Programs and Engagement support tabs for slim dashboard loads.
 * - Fixed the nightly repair trigger handler, refreshed a missed Badger invoice lookup once, and made single-record Outreach lookup accept source-row-only requests.
 * - Added an optional slim Outreach dashboard response and a single-record outreach endpoint.
 * - Moved structural and Account ID repair out of normal requests, with an optional nightly repair installer.
 * - Memoized Hub configuration and campaign settings, cached Badger invoices, and reduced campaign-list reads.
 * - Batched business updates and added per-stage customer work-queue timing.
 * - Allows genuinely unsent blocked campaign recipients to return to review after checking the mailer Activity Log for an accepted send.
 * - Keeps an accepted Zoho message out of the resend path when its follow-up sheet recording fails.
 * - Locks campaign approval and preserves valid idempotency tokens that begin with a hyphen.
 * - Added reopening for unsent approved campaign recipients, returning only those recipients to review for editing.
 * - Preserved sent, blocked, and excluded recipients when reopening a campaign, and kept every reopen audited.
 * - Added saved, per-recipient campaign subject and message editing before approval.
 * - Allowed Karl-only test sends for saved drafts whose prospect email is missing or unverified.
 * - Kept every real-send recipient, exclusion, stage and duplicate safety check unchanged.
 *
 * EARLIER STAGING CHANGES
 * - Removed duplicate account migration and cross-tab backfills from the customer work-queue read path.
 * - Added customer work-queue timing diagnostics without changing customer records.
 * - Removed account migration and cross-tab backfills from the Outreach dashboard read path.
 * - Reused one workbook handle per request instead of reopening the Outreach workbook repeatedly.
 * - Moved mailer-status and newsletter reads behind small dedicated endpoints.
 * - Cached mailer status briefly and logged per-stage dashboard timing.
 * - Reduced repeated activity payload while preserving recent history in the app.
 *
 * - Required the shared staff code for every inventory read and write at the Netlify boundary.
 * - Added an Inventory unlock gate that prevents data loading before authentication.
 * - Neutralized spreadsheet formulas in staff-written product, contact and count fields.
 * - Restored usable count and reorder controls after network or response failures.
 * - Added account-centric order, invoice, delivery, activity and reorder history.
 * - Kept non-counted customer accounts out of active Inventory stores by default.
 * - Added locked, one-at-a-time app email delivery through the separate Zoho mailer.
 * - Preserved Pilot Review as a read-only legacy archive and duplicate-send source.
 * - Added global browser error visibility and staff-code throttling.
 *
 * - Added a guarded, verified migration into one staging Distribution Hub workbook.
 * - Kept the existing staging Inventory Backend as a rollback source until cutover.
 * - Replaced spreadsheet-row identity with permanent account IDs.
 * - Added write-ahead submission journals, audit events and retryable integration jobs.
 * - Linked outreach, applications, ordering access, orders, delivery and Badger invoices.
 * - Added protected business creation and reviewable CSV business imports.
 * - Added idempotent customer, store, delivery and Badger reconciliation writes.
 * - Kept the proven Badger parser separate and read only from this application.
 * - Added a disabled Toast catalog adapter boundary without adding credentials.
 * - Preserved all existing inventory, count, reorder and outreach workflows.
 *
 * - Replaced the browser-autofill-prone company_website spam trap.
 * - Prevented legitimate customer applications and orders from being discarded.
 * - Added an immediate staff email for each new online order request.
 * - Included ordered products and a direct staging-row link in the notice.
 * - Recorded order-notification success or failure without losing the order.
 * - Added an immediate staff email for each new wholesale customer application.
 * - Sent application notices to sales@sturgeonspirits.com with a direct review link.
 * - Set the applicant as the reply-to address for efficient follow-up.
 * - Recorded notification success or failure beside the saved application.
 * - Kept application storage successful even if the notification email fails.
 * - Enabled API-key authentication for every Inventory API request.
 * - Required the same API_KEY in Apps Script Properties and Netlify.
 * - Rejected direct requests that omit the key or provide the wrong key.
 * - Preserved all inventory, outreach, customer and ordering behavior from .22.
 * - Selected newsletter participation by default on the customer application.
 * - Added explicit instructions for applicants who do not want newsletter email.
 * - Recorded that the newsletter option was preselected on the form.
 * - Prepared the Netlify-hosted customer application for initial-email links.
 * - Kept the public link disabled until a deployed HTTPS URL is configured.
 * - Standardized the companion email system name as Distribution Outreach.
 * - Corrected the customer-facing address to sales@sturgeonspirits.com.
 * - Matched the supplied Badger customer form by collecting only the seller's permit.
 * - Removed alcohol license type and issuing municipality from new applications.
 * - Preserved existing staging-sheet licensing data without collecting more.
 * - Removed the alcohol license number from new customer applications.
 * - Preserved any existing staging-sheet license-number data without collecting more.
 * - Corrected the invoice workflow: Sturgeon provides the invoice with delivery.
 * - Clarified that the invoice directs payment to Badger State Cooperative.
 * - Standardized the product name as Sturgeon Distribution Hub.
 * - Updated API identity and activity-source labels to the new product name.
 * - Updated the cooperative's customer-facing name to Badger State Cooperative.
 * - Clarified that Sturgeon Spirits manages ordering and self-distribution.
 * - Clarified that payment is remitted to Badger State Cooperative.
 * - Locked inventory reads and writes to the staging Inventory Backend copy.
 * - Removed reliance on whichever spreadsheet happens to own the script.
 * - Added a public new-customer application endpoint based on the April 2026 form.
 * - Added structured account, contact, delivery, product-interest and consent fields.
 * - Added a customer order-request endpoint with normalized order lines.
 * - Kept account approval, price confirmation, invoicing and payment as staff decisions.
 * - Added submission tokens, honeypots, length limits and staged review statuses.
 * - Stored customer applications and order requests only in the staging workbook.
 * - Added a standalone newsletter contact list for customers and non-customers.
 * - Added relationship types including banker, vendor, partner and community.
 * - Required consent details before a contact can be marked Subscribed.
 * - Kept newsletter sending disabled during staging.
 * - Scaffolded read-only Toast stock integration with explicit SKU mapping.
 * - Added email engagement events and estimated-open summaries.
 * - Kept Toast credentials, tracking pixels and newsletter tracking disabled.
 * - Prioritized clicks, replies and orders over imperfect open signals.
 * - Scaffolded consent-aware newsletter participation for each business.
 * - Scaffolded online-ordering candidacy, invitations and account activation.
 * - Stored both optional programs separately from the core directory workflow.
 * - Kept newsletter delivery and online ordering inactive during staging.
 * - Added editable outreach subjects and message bodies with persistent drafts.
 * - Stored per-business drafts in a separate Outreach Drafts staging tab.
 * - Kept the sell sheet, signature, logo and compliance footer standardized.
 * - Exposed saved drafts to the Zoho sender without approving or sending them.
 * - Added the complete Outreach business directory and all nonblank row fields.
 * - Added business detail, contact editing, and append-only business notes.
 * - Added contact-update activity logging with row and email change checks.
 * - Added one authoritative weekly audience: Fit 5 within 15 miles of Oshkosh.
 * - Added in-app editing for qualification, mileage and email confidence.
 * - Normalized all-caps business names in email previews and app display.
 * - Added send-safety eligibility reasons without changing source-sheet rows.
 * - Corrected staging header aliases for contact, queue, fit and Top 50 fields.
 * - Reused Campaign Settings as the email-preview source of truth.
 * - Kept email delivery disabled in this API and preserved inventory workflows.
 *
 * PASTE INSTRUCTIONS
 * - This is the complete Code.gs source, not a partial snippet.
 * - Use only in the staging inventory backend until testing is complete.
 *********************************/

const APP_VERSION = "2026.10.10.40-APP";

const SHEET_NAMES = {
  STORES: "Stores",
  SKUS: "SKUs",
  INVENTORY: "Inventory",
  COUNTS: "Counts",
  REORDERS: "Reorders",
};

const LEGACY_INVENTORY_SPREADSHEET_ID = "1asGSIuz65hhbXbanDSuLdgsasDKqAyVWgu7DGi42Il8"; // staging rollback source
const REQUIRE_API_KEY = true;
const OUTREACH_SPREADSHEET_ID = "1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo"; // staging only
const BADGER_TRACKER_SPREADSHEET_ID = "1nmHzrZLB2Kv-bLf3z0GBXbkO0XqUL-ETCxUlOlidSEk"; // live Badger tracker; P/Q remain staff-maintained workflow marks
const BADGER_BASE_URL = "https://badgerstatecoop.com/BSWCSite";
const BADGER_SESSION_CACHE_KEY = "hub_badger_session_v1";
const BADGER_SESSION_TTL_SECONDS = 20 * 60;
const PAYMENT_REMINDERS_ENABLED_CONFIG_KEY = "payment_reminders_enabled";
const BADGER_STATUS_SHEET_NAME = "Badger Invoice Status";
const BADGER_SYNC_LOG_SHEET_NAME = "Badger Sync Log";
const BADGER_SYNC_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const BADGER_PAYMENT_LOG_SHEET_NAME = "Badger Invoice Payment Log";
const PRICE_TIERS_SHEET_NAME = "Price Tiers"; // inventory workbook: Tier, Price
const CUSTOMER_PRICES_SHEET_NAME = "Customer Prices"; // inventory workbook: SKU ID, Account ID, Price, Active, Notes
const BADGER_INVOICE_CREATIONS_SHEET_NAME = "Badger Invoice Creations";
const OUTREACH_SHEET_NAME = "Distribution Directory and Leads";
const OUTREACH_ACTIVITY_SHEET_NAME = "Activity Log";
const OUTREACH_DRAFTS_SHEET_NAME = "Outreach Drafts";
const OUTREACH_PILOT_SHEET_NAME = "Pilot Review";
const OUTREACH_PROGRAMS_SHEET_NAME = "Account Programs";
const OUTREACH_ENGAGEMENT_SHEET_NAME = "Email Engagement";
const OUTREACH_CAMPAIGNS_SHEET_NAME = "Outreach Campaigns";
const OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME = "Outreach Campaign Recipients";
const ZIP_CENTROIDS_SHEET_NAME = "ZIP Centroids";
const TOAST_ITEM_MAP_SHEET_NAME = "Toast Item Map";
const NEWSLETTER_CONTACTS_SHEET_NAME = "Newsletter Contacts";
const CUSTOMER_APPLICATIONS_SHEET_NAME = "Customer Applications";
const CUSTOMER_APPLICATION_NOTIFICATION_EMAIL = "sales@sturgeonspirits.com";
const ONLINE_ORDER_REQUESTS_SHEET_NAME = "Online Order Requests";
const ONLINE_ORDER_LINES_SHEET_NAME = "Online Order Lines";
const CUSTOMER_WORKFLOW_LOG_SHEET_NAME = "Customer Workflow Log";
const BADGER_INVOICE_LINKS_SHEET_NAME = "Badger Invoice Links";
const BADGER_CUSTOMER_ALIASES_SHEET_NAME = "Badger Customer Aliases";
const BADGER_CUSTOMER_ALIAS_HEADERS = ["Badger Customer Name", "Normalized Key", "Account ID", "Source", "Linked At", "Linked By", "App Version"];
const BADGER_PAYMENT_REMINDERS_SHEET_NAME = "Badger Payment Reminders";
const BADGER_PAYMENT_REMINDER_MIN_DAYS = 7;
const BADGER_PAYMENT_REMINDER_MIN_AGE_CONFIG_KEY = "payment_reminder_min_age_days";
const BADGER_PAYMENT_REMINDER_DEFAULT_MIN_AGE_DAYS = 30;
const BADGER_PAYMENT_REMINDER_PENDING_MS = 60 * 60 * 1000;
const HUB_CONFIGURATION_SHEET_NAME = "Hub Configuration";
const SUBMISSION_JOURNAL_SHEET_NAME = "Submission Journal";
const HUB_AUDIT_SHEET_NAME = "Hub Audit Log";
const INTEGRATION_JOBS_SHEET_NAME = "Integration Jobs";
const IMPORT_BATCHES_SHEET_NAME = "Import Batches";
const IMPORT_ROWS_SHEET_NAME = "Import Rows";
const DELIVERIES_SHEET_NAME = "Deliveries";
const DELIVERY_LINES_SHEET_NAME = "Delivery Lines";
const ACCOUNT_ID_HEADER = "Account ID";
const HUB_MIGRATION_STATUS_KEY = "inventory_migration_status";
const HUB_MIGRATION_ACTIVE = "ACTIVE";
const ORDER_CATALOG_SOURCE = "SHEETS"; // Toast remains disabled until a reviewed integration is configured.
const OUTREACH_COCKTAIL_LIST_STAGE = "Cocktail list";
const OUTREACH_COCKTAIL_LIST_GAP_DAYS = 14;
const PUBLIC_SITE_URL_SETTING_KEY = "Public site URL";
const PUBLIC_SITE_URL_FALLBACK = "https://distribution-hub.netlify.app";
const READ_CACHE_VERSION_KEY = "hub_read_cache_version";
const READ_CACHE_TTL_SECONDS = 900;
const READ_CACHE_CHUNK_SIZE = 45000;
const READ_ACTIONS = new Set(["initData", "listSkus", "sellSheet", "managerGrid", "salesSinceCount", "outreachDashboard", "outreachRecord", "outreachSendStatus", "outreachNewsletterContacts", "outreachCampaigns", "outreachCampaign", "previewOutreachCampaign", "customerWorkQueue", "customerAccountIndex", "hubSystemStatus", "salesReport", "inboundReplies"]);

let __OPERATIONAL_SS = null;
let __OUTREACH_SS = null;
let __HUB_INVENTORY_ACTIVE = null;
let __OUTREACH_CAMPAIGN_SETTINGS = null;
let __OUTREACH_RECENT_BADGER_INVOICE_ACCOUNT_IDS = null;
let __OUTREACH_RECENT_BADGER_INVOICE_LOOKUP_FAILED = false;
let __OUTREACH_RECENT_BADGER_MATCHES = null; // { strong:Set, name_only:Map(account -> Badger name), unplaced_invoices:number }
let __ZIP_CENTROID_MAP = null;
let __LEGACY_PILOT_SENT_BY_EMAIL = null;
let __OUTREACH_RECENT_SEND_INDEX = null;
let __OUTREACH_COCKTAIL_LIST_CONTACT_INDEX = null;

function readCacheVersion_() {
  return PropertiesService.getScriptProperties().getProperty(READ_CACHE_VERSION_KEY) || "1";
}

function bumpReadCacheVersion_() {
  const properties = PropertiesService.getScriptProperties();
  const next = Number(properties.getProperty(READ_CACHE_VERSION_KEY) || "1") + 1;
  properties.setProperty(READ_CACHE_VERSION_KEY, String(next));
  return String(next);
}

function readCachePresent_(scope) {
  try {
    return !!CacheService.getScriptCache().get(`hub_read:${scope}:${readCacheVersion_()}:meta`);
  } catch (error) {
    return false;
  }
}

function cachedReadPayload_(scope, build, bypass) {
  const startedAt = Date.now();
  const version = readCacheVersion_();
  const cache = CacheService.getScriptCache();
  const key = `hub_read:${scope}:${version}`;
  if (!bypass) {
    try {
      const meta = JSON.parse(cache.get(`${key}:meta`) || "null");
      if (meta && Number.isInteger(meta.parts) && meta.parts > 0 && meta.parts <= 20) {
        const text = Array.from({ length:meta.parts }, (_, index) => cache.get(`${key}:${index}`)).join("");
        if (text) {
          const payload = JSON.parse(text);
          payload.performance = Object.assign({}, payload.performance || {}, { total_ms:Date.now() - startedAt, cache_hit:true, stages:{ cache_read_ms:Date.now() - startedAt } });
          return payload;
        }
      }
    } catch (error) { console.warn("Read cache miss: " + String(error && error.message || error)); }
  }
  const payload = build();
  const totalMs = Date.now() - startedAt;
  payload.performance = Object.assign({}, payload.performance || {}, { total_ms:totalMs, cache_hit:false, stages:Object.assign({}, payload.performance?.stages || {}, { cache_build_ms:totalMs }) });
  try {
    const text = JSON.stringify(payload);
    const parts = Math.ceil(text.length / READ_CACHE_CHUNK_SIZE);
    if (scope === "customer_account_index") {
      console.log(JSON.stringify({ event:"customer_account_index_cache_rebuild", payload_chars:text.length, parts:parts, max_parts:20 }));
      if (parts > 20) console.warn(`Customer account index is ${parts} cache parts; it exceeds the 20-part cache limit.`);
    }
    if (parts > 0 && parts <= 20) {
      for (let index = 0; index < parts; index += 1) cache.put(`${key}:${index}`, text.slice(index * READ_CACHE_CHUNK_SIZE, (index + 1) * READ_CACHE_CHUNK_SIZE), READ_CACHE_TTL_SECONDS);
      cache.put(`${key}:meta`, JSON.stringify({ parts:parts }), READ_CACHE_TTL_SECONDS);
    }
  } catch (error) { console.warn("Read cache write skipped: " + String(error && error.message || error)); }
  return payload;
}

function warmHubReadCaches() {
  const hour = Number(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "H"));
  if (hour < 7 || hour >= 21) return { message:"Skipped outside 7am–9pm." };
  // Rebuild at most ONE missing cache per run. Rebuilding all three at once took 30+ seconds
  // and slowed staff requests (campaign preview/freeze) running at the same moment.
  const scopes = [
    ["outreach_slim", () => apiGetOutreachDashboard_({ slim:"1", _cache_bypass:true })],
    ["customer_work_queue", () => apiGetCustomerWorkQueue_({ _cache_bypass:true })],
    ["inventory_stores", () => apiGetInitData_("", true)],
  ];
  const missing = scopes.find(([scope]) => !readCachePresent_(scope));
  if (!missing) return { message:"Hub read caches already warm.", version:readCacheVersion_() };
  cachedReadPayload_(missing[0], missing[1]);
  return { message:`Hub read cache warmed: ${missing[0]}.`, version:readCacheVersion_() };
}

function onHubReadCacheSpreadsheetChange(e) {
  const version = bumpReadCacheVersion_();
  clearBadgerInvoiceCache_();
  console.log(JSON.stringify({ event:"hub_read_cache_invalidated", change_type:String(e?.changeType || "unknown"), version:version }));
}

function installHubReadCacheWarmer() {
  const warmerHandler = "warmHubReadCaches";
  const changeHandler = "onHubReadCacheSpreadsheetChange";
  ScriptApp.getProjectTriggers()
    .filter(trigger => [warmerHandler, changeHandler].includes(trigger.getHandlerFunction()))
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(warmerHandler).timeBased().everyMinutes(10).create();
  // getSs_() is the inventory workbook (SKUs, Price Tiers, Customer Prices): the legacy Inventory Backend before the hub
  // migration, the Outreach workbook after it. Re-run this installer after switching migration state.
  const workbooks = new Map();
  [getOutreachSs_(), SpreadsheetApp.openById(BADGER_TRACKER_SPREADSHEET_ID), getSs_()].forEach(spreadsheet => workbooks.set(spreadsheet.getId(), spreadsheet));
  workbooks.forEach(spreadsheet => {
    ScriptApp.newTrigger(changeHandler).forSpreadsheet(spreadsheet).onChange().create();
  });
  return { message:"Ten-minute Hub read-cache warmer and change triggers installed for the Outreach, Badger Tracker and inventory workbooks." };
}

function installBadgerStatusSyncTrigger() {
  const handler = "scheduledBadgerStatusSync";
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === handler)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(handler).timeBased().inTimezone("America/Chicago").atHour(6).nearMinute(10).everyDays(1).create();
  return { message:"Daily Badger status sync trigger installed for approximately 6:10am Central." };
}

function scheduledBadgerStatusSync() {
  return syncBadgerStatus_("Scheduled Badger status sync");
}

function getLegacyInventorySs_() {
  return SpreadsheetApp.openById(LEGACY_INVENTORY_SPREADSHEET_ID);
}

function getHubConfigurationValue_(key) {
  const sheet = getOutreachSs_().getSheetByName(HUB_CONFIGURATION_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return "";
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  const row = values.find(item => String(item[0] || "").trim() === String(key));
  return row ? String(row[1] || "").trim() : "";
}

function paymentRemindersEnabled_() {
  return /^(1|true|yes|on)$/i.test(getHubConfigurationValue_(PAYMENT_REMINDERS_ENABLED_CONFIG_KEY));
}

function isHubInventoryActive_() {
  if (__HUB_INVENTORY_ACTIVE === null) {
    __HUB_INVENTORY_ACTIVE = getHubConfigurationValue_(HUB_MIGRATION_STATUS_KEY) === HUB_MIGRATION_ACTIVE;
  }
  return __HUB_INVENTORY_ACTIVE;
}

function getSs_() {
  if (__OPERATIONAL_SS) return __OPERATIONAL_SS;
  __OPERATIONAL_SS = isHubInventoryActive_() ? getOutreachSs_() : getLegacyInventorySs_();
  return __OPERATIONAL_SS;
}

function inventoryTrackedAccountIds_() {
  const sheet = getCustomerApplicationsSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) return new Set();
  return new Set(getAllRowsAsObjects_(sheet)
    .filter(row => toBool_(row.inventory_tracking) && row.account_id)
    .map(row => String(row.account_id || "").trim()));
}

function inventoryStoreAllowed_(store, trackedAccountIds) {
  if (!toBool_(store.active)) return false;
  const accountId = String(store.account_id || "").trim();
  return !accountId || trackedAccountIds.has(accountId);
}

function assertInventoryStoreAllowed_(storeId) {
  const tracked = inventoryTrackedAccountIds_();
  const store = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.STORES)).find(row => String(row.store_id || "") === String(storeId || ""));
  if (!store || !inventoryStoreAllowed_(store, tracked)) throw new Error("Inventory Tracking is not enabled for this customer account.");
  return store;
}
function getSheet_(name) {
  const sh = getSs_().getSheetByName(name);
  if (!sh) throw new Error(`Missing sheet: ${name}`);
  return sh;
}
function getOutreachSs_() {
  if (!__OUTREACH_SS) __OUTREACH_SS = SpreadsheetApp.openById(OUTREACH_SPREADSHEET_ID);
  return __OUTREACH_SS;
}
function getOutreachSheet_(name) {
  const sh = getOutreachSs_().getSheetByName(name);
  if (!sh) throw new Error(`Missing outreach sheet: ${name}`);
  return sh;
}
function normalizeHeader_(h) {
  return String(h || "").trim().toLowerCase().replace(/\s+/g, "_");
}
const __HEADER_CACHE = new Map();
function headerCacheKey_(sheet) {
  return `${sheet.getParent().getId()}::${sheet.getSheetId()}`;
}
function getHeaderMap_(sheet) {
  const key = headerCacheKey_(sheet);
  if (__HEADER_CACHE.has(key)) return __HEADER_CACHE.get(key);
  const columnCount = sheet.getLastColumn();
  if (!columnCount) {
    const empty = {};
    __HEADER_CACHE.set(key, empty);
    return empty;
  }
  const headers = sheet.getRange(1, 1, 1, columnCount).getValues()[0];
  const map = {};
  headers.map(normalizeHeader_).forEach((h, i) => { if (h) map[h] = i; });
  __HEADER_CACHE.set(key, map);
  return map;
}
function ensureHeaderColumns_(sheet, columns) {
  const h = getHeaderMap_(sheet);
  const missing = columns.filter(col => h[normalizeHeader_(col)] === undefined);
  missing.forEach(col => {
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue(col);
  });
  if (missing.length) __HEADER_CACHE.delete(headerCacheKey_(sheet));
  return getHeaderMap_(sheet);
}
function toBool_(v) { return ["TRUE","YES","Y","1"].includes(String(v).toUpperCase()); }
function digitsOnly_(v) { return String(v || "").replace(/\D/g, ""); }

function getAllRowsAsObjects_(sheet) {
  const h = getHeaderMap_(sheet);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getValues();
  const keys = Object.keys(h);
  return rows.map(r => {
    const o = {};
    keys.forEach(k => o[k] = r[h[k]]);
    return o;
  });
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  } else {
    ensureHeaderColumns_(sheet, headers);
  }
  return sheet;
}

function permanentId_(prefix) {
  return `${prefix}-${Utilities.getUuid().replace(/-/g, "").toUpperCase()}`;
}

function safeJson_(value) {
  return JSON.stringify(value, (key, item) => key === "api_key" ? undefined : item);
}

function sha256_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ""), Utilities.Charset.UTF_8);
  return bytes.map(byte => (`0${(byte < 0 ? byte + 256 : byte).toString(16)}`).slice(-2)).join("");
}

function sheetChecksum_(sheet) {
  return sha256_(safeJson_(sheet.getDataRange().getDisplayValues()));
}

function ensureFoundationalSheets_() {
  const hub = getOutreachSs_();
  ensureSheet_(hub, HUB_CONFIGURATION_SHEET_NAME, ["Key", "Value", "Updated At", "Updated By", "App Version"]);
  ensureSheet_(hub, SUBMISSION_JOURNAL_SHEET_NAME, [
    "Journal ID", "Received At", "Submission Type", "Submission Token", "Account ID", "Business", "Payload JSON",
    "Payload Hash", "Status", "Primary Record ID", "Error", "Completed At", "App Version"
  ]);
  ensureSheet_(hub, HUB_AUDIT_SHEET_NAME, [
    "Event ID", "Timestamp", "Action", "Record Type", "Record ID", "Account ID", "Actor", "Source", "Target",
    "Result", "Details", "App Version"
  ]);
  ensureSheet_(hub, INTEGRATION_JOBS_SHEET_NAME, [
    "Job ID", "Created At", "Updated At", "Job Type", "Record Type", "Record ID", "Account ID", "Status",
    "Attempts", "Next Attempt At", "Payload JSON", "Payload Hash", "Last Error", "Completed At", "App Version"
  ]);
  ensureSheet_(hub, IMPORT_BATCHES_SHEET_NAME, [
    "Batch ID", "Created At", "Created By", "Source Name", "Source Hash", "Row Count", "Created Count", "Skipped Count",
    "Error Count", "Status", "Completed At", "App Version"
  ]);
  ensureSheet_(hub, IMPORT_ROWS_SHEET_NAME, [
    "Batch ID", "Source Row", "Account ID", "Business Name", "Email", "City", "Normalized JSON", "Row Hash",
    "Status", "Detail", "Processed At", "App Version"
  ]);
  ensureSheet_(hub, DELIVERIES_SHEET_NAME, [
    "Delivery ID", "Request ID", "Account ID", "Store ID", "Business Name", "Delivery Status", "Requested Date",
    "Delivered At", "Assigned To", "Badger Invoice Number", "Created At", "Updated At", "App Version"
  ]);
  ensureSheet_(hub, DELIVERY_LINES_SHEET_NAME, [
    "Delivery ID", "Request ID", "Account ID", "Line Number", "SKU ID", "SKU Name", "Quantity", "Unit",
    "Bottle Equivalent", "Created At", "App Version"
  ]);
  ensureSheet_(hub, BADGER_INVOICE_LINKS_SHEET_NAME, [
    "Badger Invoice Number", "Account ID", "Badger Customer Name", "Match Method", "Linked At", "Linked By", "Notes", "App Version"
  ]);
  ensureSheet_(hub, BADGER_CUSTOMER_ALIASES_SHEET_NAME, BADGER_CUSTOMER_ALIAS_HEADERS);
  ensureSheet_(hub, BADGER_PAYMENT_REMINDERS_SHEET_NAME, [
    "Reminder ID", "Account ID", "Business Name", "Recipient", "Invoice Numbers", "Outstanding Amount", "Status",
    "Sent At", "Sent By", "Zoho Message ID", "Idempotency Token", "Error", "App Version"
  ]);
}

function setHubConfigurationValue_(key, value, actor) {
  const sheet = getOutreachSs_().getSheetByName(HUB_CONFIGURATION_SHEET_NAME);
  const h = getHeaderMap_(sheet);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const index = rows.findIndex(row => String(row[h.key] || "").trim() === String(key));
  const target = index >= 0 ? index + 2 : sheet.getLastRow() + 1;
  const row = index >= 0 ? rows[index].slice() : Array(sheet.getLastColumn()).fill("");
  row[h.key] = key;
  row[h.value] = value;
  row[h.updated_at] = new Date();
  row[h.updated_by] = actor || "Sturgeon Distribution Hub";
  row[h.app_version] = APP_VERSION;
  sheet.getRange(target, 1, 1, row.length).setValues([row]);
  if (key === HUB_MIGRATION_STATUS_KEY) __HUB_INVENTORY_ACTIVE = null;
}

function appendAudit_(action, recordType, recordId, accountId, actor, source, target, result, details) {
  getOutreachSs_().getSheetByName(HUB_AUDIT_SHEET_NAME).appendRow([
    permanentId_("EVT"), new Date(), action, recordType || "", recordId || "", accountId || "",
    actor || "Sturgeon Distribution Hub", source || "", target || "", result || "Recorded", details || "", APP_VERSION,
  ]);
}

function startSubmissionJournal_(type, token, accountId, business, payload) {
  const sheet = getOutreachSs_().getSheetByName(SUBMISSION_JOURNAL_SHEET_NAME);
  const h = getHeaderMap_(sheet);
  if (sheet.getLastRow() >= 2) {
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    const prior = rows.find(row => String(row[h.submission_token] || "") === String(token || "") && String(row[h.submission_type] || "") === String(type));
    if (prior) return { id:String(prior[h.journal_id] || ""), row:rows.indexOf(prior) + 2, prior_record_id:String(prior[h.primary_record_id] || "") };
  }
  const journalId = permanentId_("JRN");
  const payloadJson = safeJson_(payload);
  sheet.appendRow([
    journalId, new Date(), type, token, accountId || "", business || "", payloadJson, sha256_(payloadJson),
    "Received", "", "", "", APP_VERSION,
  ]);
  return { id:journalId, row:sheet.getLastRow(), prior_record_id:"" };
}

function completeSubmissionJournal_(journal, status, recordId, error) {
  const sheet = getOutreachSs_().getSheetByName(SUBMISSION_JOURNAL_SHEET_NAME);
  const h = getHeaderMap_(sheet);
  sheet.getRange(journal.row, h.status + 1).setValue(status);
  sheet.getRange(journal.row, h.primary_record_id + 1).setValue(recordId || "");
  sheet.getRange(journal.row, h.error + 1).setValue(String(error || "").slice(0, 2000));
  if (status === "Completed") sheet.getRange(journal.row, h.completed_at + 1).setValue(new Date());
}

function enqueueIntegrationJob_(jobType, recordType, recordId, accountId, payload) {
  const sheet = getOutreachSs_().getSheetByName(INTEGRATION_JOBS_SHEET_NAME);
  const h = getHeaderMap_(sheet);
  const payloadJson = safeJson_(payload || {});
  const payloadHash = sha256_(payloadJson);
  if (sheet.getLastRow() >= 2) {
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    const prior = rows.find(row => String(row[h.job_type] || "") === jobType && String(row[h.record_id] || "") === String(recordId) && String(row[h.payload_hash] || "") === payloadHash);
    if (prior) return String(prior[h.job_id] || "");
  }
  const jobId = permanentId_("JOB");
  sheet.appendRow([
    jobId, new Date(), new Date(), jobType, recordType, recordId, accountId || "", "Pending", 0, new Date(),
    payloadJson, payloadHash, "", "", APP_VERSION,
  ]);
  return jobId;
}

function updateIntegrationJob_(jobId, status, error) {
  const sheet = getOutreachSs_().getSheetByName(INTEGRATION_JOBS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;
  const h = getHeaderMap_(sheet);
  const ids = sheet.getRange(2, h.job_id + 1, sheet.getLastRow() - 1, 1).getValues();
  const index = ids.findIndex(row => String(row[0] || "") === String(jobId));
  if (index < 0) return;
  const rowNumber = index + 2;
  const attempts = Number(sheet.getRange(rowNumber, h.attempts + 1).getValue() || 0) + 1;
  sheet.getRange(rowNumber, h.updated_at + 1).setValue(new Date());
  sheet.getRange(rowNumber, h.status + 1).setValue(status);
  sheet.getRange(rowNumber, h.attempts + 1).setValue(attempts);
  sheet.getRange(rowNumber, h.last_error + 1).setValue(String(error || "").slice(0, 2000));
  if (status === "Completed") sheet.getRange(rowNumber, h.completed_at + 1).setValue(new Date());
  else sheet.getRange(rowNumber, h.next_attempt_at + 1).setValue(new Date(Date.now() + Math.min(24, Math.pow(2, attempts)) * 60 * 60 * 1000));
}

function migrationInventorySheetStatus_() {
  const source = getLegacyInventorySs_();
  const hub = getOutreachSs_();
  return Object.values(SHEET_NAMES).map(name => {
    const sourceSheet = source.getSheetByName(name);
    const hubSheet = hub.getSheetByName(name);
    return {
      name:name,
      source_rows:sourceSheet ? sourceSheet.getLastRow() : 0,
      hub_rows:hubSheet ? hubSheet.getLastRow() : 0,
      matches:!!sourceSheet && !!hubSheet && sheetChecksum_(sourceSheet) === sheetChecksum_(hubSheet),
    };
  });
}

function apiInitializeHardenedHub_(p) {
  if (String(p?.confirmation || "") !== "STAGING ONLY") throw new Error("Staging migration confirmation is required.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another migration or write is in progress.");
  try {
    ensureFoundationalSheets_();
    if (isHubInventoryActive_()) return { message:"The hardened staging Hub is already active.", migration_status:HUB_MIGRATION_ACTIVE, sheets:migrationInventorySheetStatus_() };
    const source = getLegacyInventorySs_();
    const hub = getOutreachSs_();
    Object.values(SHEET_NAMES).forEach(name => {
      const sourceSheet = source.getSheetByName(name);
      if (!sourceSheet) throw new Error(`Rollback source is missing ${name}.`);
      const existing = hub.getSheetByName(name);
      if (existing) {
        if (sheetChecksum_(existing) !== sheetChecksum_(sourceSheet)) throw new Error(`${name} already exists in the Hub but does not match the rollback source.`);
        return;
      }
      sourceSheet.copyTo(hub).setName(name);
    });
    const checks = migrationInventorySheetStatus_();
    const failed = checks.filter(item => !item.matches);
    if (failed.length) throw new Error(`Migration verification failed for: ${failed.map(item => item.name).join(", ")}.`);
    ensureAccountIdentityModel_(true);
    setHubConfigurationValue_(HUB_MIGRATION_STATUS_KEY, HUB_MIGRATION_ACTIVE, String(p.staff_name || "Staging administrator"));
    setHubConfigurationValue_("legacy_inventory_spreadsheet_id", LEGACY_INVENTORY_SPREADSHEET_ID, String(p.staff_name || "Staging administrator"));
    setHubConfigurationValue_("badger_tracker_spreadsheet_id", BADGER_TRACKER_SPREADSHEET_ID, String(p.staff_name || "Staging administrator"));
    setHubConfigurationValue_("order_catalog_source", ORDER_CATALOG_SOURCE, String(p.staff_name || "Staging administrator"));
    __OPERATIONAL_SS = hub;
    appendAudit_("INITIALIZE_HARDENED_HUB", "System", "staging-hub", "", String(p.staff_name || "Staging administrator"), LEGACY_INVENTORY_SPREADSHEET_ID, OUTREACH_SPREADSHEET_ID, "Completed", "Inventory tabs copied and checksum verified before cutover.");
    return { message:"The hardened staging Hub is active. The prior Inventory Backend remains unchanged for rollback.", migration_status:HUB_MIGRATION_ACTIVE, sheets:checks };
  } finally {
    lock.releaseLock();
  }
}

// Sales report tabs are built with formulas in the Badger tracker (Sales by Location, Sales by Product,
// Location x Product, fed by Sales Data). The Hub only reads their displayed values; all calculation stays
// in the sheet so this script does not grow with the analysis.
const SALES_REPORT_TABS = [
  { key:"locations", sheet:"Sales by Location", header_row:9 },
  { key:"products", sheet:"Sales by Product", header_row:4 },
  { key:"grid", sheet:"Location x Product", header_row:1 },
];

function salesReportTable_(spreadsheet, tab) {
  const sheet = spreadsheet.getSheetByName(tab.sheet);
  if (!sheet) return { sheet:tab.sheet, missing:true, headers:[], rows:[] };
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < tab.header_row || !lastColumn) return { sheet:tab.sheet, headers:[], rows:[] };
  const values = sheet.getRange(tab.header_row, 1, lastRow - tab.header_row + 1, lastColumn).getDisplayValues();
  let width = values[0].length;
  while (width > 0 && !String(values[0][width - 1] || "").trim()) width -= 1;
  return {
    sheet:tab.sheet,
    headers:values[0].slice(0, width),
    rows:values.slice(1).filter(row => String(row[0] || "").trim()).map(row => row.slice(0, width)),
  };
}

function apiGetSalesReport_() {
  const spreadsheet = SpreadsheetApp.openById(BADGER_TRACKER_SPREADSHEET_ID);
  const report = {};
  SALES_REPORT_TABS.forEach(tab => { report[tab.key] = salesReportTable_(spreadsheet, tab); });
  const settingsSheet = spreadsheet.getSheetByName("Sales by Location");
  const recentDays = settingsSheet ? String(settingsSheet.getRange("B5").getDisplayValue() || "") : "";
  return {
    sales_report:report,
    recent_days:recentDays,
    sheet_url:`https://docs.google.com/spreadsheets/d/${BADGER_TRACKER_SPREADSHEET_ID}/edit`,
    loaded_at:new Date().toISOString(),
  };
}

function apiGetHubSystemStatus_() {
  const active = isHubInventoryActive_();
  return {
    migration_status:active ? HUB_MIGRATION_ACTIVE : "NOT STARTED",
    operational_spreadsheet:active ? "Staging Distribution Hub" : "Staging Inventory Backend",
    inventory_sheets:migrationInventorySheetStatus_(),
    badger_tracker:"Configured (read only)",
    toast_adapter:"Disabled",
    catalog_source:ORDER_CATALOG_SOURCE,
  };
}

function setOutreachDirectoryValidation_(sheet, headerKey, values) {
  const headers = getHeaderMap_(sheet);
  if (headers[headerKey] === undefined) return false;
  const rows = Math.max(1, sheet.getMaxRows() - 1);
  const validation = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, headers[headerKey] + 1, rows, 1).setDataValidation(validation);
  return true;
}

function repairOutreachDirectoryValidations_(directory) {
  return {
    next_email:setOutreachDirectoryValidation_(directory, "next_email", OUTREACH_DIRECTORY_STAGE_VALUES),
    status:setOutreachDirectoryValidation_(directory, "status", OUTREACH_DIRECTORY_STATUS_VALUES),
    outcome:setOutreachDirectoryValidation_(directory, "outcome", OUTREACH_OUTCOME_VALUES),
  };
}

const OUTREACH_MONTHLY_CONTENT_SECTION = "MONTHLY CONTENT";
const OUTREACH_MONTHLY_CONTENT_ROWS = [
  { label:"Month label", note:"Example: October 2026" },
  { label:"Featured cocktail", note:"Cocktail name and one recipe sentence." },
  { label:"Second cocktail", note:"Cocktail name and one recipe sentence." },
  { label:"Tasting offer sentence", note:"Optional; leave blank to omit." },
  { label:"Cocktail-list sentence", note:"Optional invitation to receive cocktail ideas." },
];
const OUTREACH_MONTHLY_CONTENT_SETTINGS = [
  { key:"Monthly content month", label:"Month label" },
  { key:"Monthly content featured cocktail", label:"Featured cocktail" },
  { key:"Monthly content second cocktail", label:"Second cocktail" },
  { key:"Monthly content tasting offer", label:"Tasting offer sentence" },
  { key:"Monthly content cocktail-list offer", label:"Cocktail-list sentence" },
];
const OUTREACH_COCKTAIL_LIST_EDITOR_ROWS = [
  { label:"COCKTAIL LIST EMAIL", note:"Monthly newsletter template; no sales offer or application link." },
  { label:"Cocktail list subject", note:"Example: {{Month}} cocktail ideas from Sturgeon Spirits" },
  { label:"Cocktail list intro", note:"A short non-sales introduction." },
  { label:"Cocktail list featured cocktail", note:"Use {{Featured Cocktail}}." },
  { label:"Cocktail list distillery line", note:"One line about the Oshkosh distillery." },
  { label:"Cocktail list reply-to-order line", note:"Invite a reply to order; do not link to an application." },
];
const OUTREACH_COCKTAIL_LIST_SETTINGS = [
  { key:"Cocktail list subject", label:"Cocktail list subject" },
  { key:"Cocktail list intro", label:"Cocktail list intro" },
  { key:"Cocktail list featured cocktail", label:"Cocktail list featured cocktail" },
  { key:"Cocktail list distillery line", label:"Cocktail list distillery line" },
  { key:"Cocktail list reply-to-order line", label:"Cocktail list reply-to-order line" },
];
// Order-online invite for current customers (2026.10.08.36-APP). The account-form link and the
// address/unsubscribe footer are added by the code, so the template cannot leave them out.
const OUTREACH_CUSTOMER_INVITE_STAGE = "Order online invite";
const OUTREACH_CUSTOMER_INVITE_EDITOR_ROWS = [
  { label:"CUSTOMER ORDER INVITE EMAIL", value:"", note:"Invites current customers to set up online ordering. The account-form link and the address / unsubscribe footer are added automatically." },
  { label:"Customer invite subject", value:"Online ordering is open for {{Business Name}}", note:"Merge fields: {{First Name}}, {{Business Name}}, {{City}}." },
  { label:"Customer invite greeting", value:"Hi {{First Name}},", note:"First line of the email." },
  { label:"Customer invite intro", value:"Thank you for carrying Sturgeon Spirits. You can now place your wholesale orders with us online.", note:"Why you are writing." },
  { label:"Customer invite steps", value:"Setting up takes about five minutes: fill in our short wholesale account form, and we'll send your ordering link as soon as it's approved.", note:"What they do next. The link follows this line." },
  { label:"Customer invite link text", value:"Set up online ordering", note:"The words of the link to the account form." },
  { label:"Customer invite sign-off", value:"Questions? Just reply to this email. Thank you, Sturgeon Spirits", note:"Last line before the footer." },
];
const OUTREACH_CUSTOMER_INVITE_SETTINGS = OUTREACH_CUSTOMER_INVITE_EDITOR_ROWS.slice(1).map(item => ({ key:item.label, label:item.label }));
const OUTREACH_PUBLIC_SITE_SETTINGS = [
  { key:PUBLIC_SITE_URL_SETTING_KEY },
];
const SELL_SHEET_SECTION_VALUES = ["Best seller", "New", "Vodka", "Gin", "Rum", "Liqueur", "Agave", "Whiskey & Brandy", "Squadron Spirits", "Gift boxes", "Bitters", "Canned cocktails", "Hide"];
const SELL_SHEET_EDITOR_SECTION = "SELL SHEET";
const SELL_SHEET_EDITOR_ROWS = [
  { label:"Sell sheet headline", value:"Oshkosh's First Distillery Since 1919", note:"Main headline on the web and printed sell sheet." },
  { label:"Sell sheet price line", value:"Where patience pays", note:"Shown under the headline; live prices appear only to invited visitors or staff." },
  { label:"Sell sheet story heading", value:"Rooted in Tradition, Driven by Curiosity", note:"Story-section heading." },
  { label:"Sell sheet story", value:"For three years, we've been getting up early, working hard, and trusting the process right here in Oshkosh. We respect the old ways, but we never stop experimenting with new flavor profiles. Put our local craft spirits into your arsenal.", note:"Karl can update the timing or copy here." },
  { label:"Sell sheet unique heading", value:"As Unique As We Are", note:"Flavor-list heading." },
  { label:"Sell sheet flavors line", value:"Choose from over 40 additional flavors and spirits available.", note:"Flavor-list introduction." },
  { label:"Sell sheet infusion line", value:"Imagine a custom infusion only available at your establishment.", note:"Flavor-list introduction." },
  { label:"Sell sheet cans line", value:"Mix flavors within a case. Ask about 5-gallon corny kegs of our cocktails.", note:"Shown only when canned-cocktail SKUs exist." },
  { label:"Sell sheet contact", value:"2663 Oregon Street, Oshkosh, Wisconsin · sturgeonspirits.com · sales@sturgeonspirits.com · (920) 267-5192", note:"Contact block." },
  { label:"Sell sheet footer", value:"Distilled and bottled in Oshkosh, Wisconsin", note:"Printed and web footer." },
];

function ensureOutreachMonthlyContent_() {
  const hub = getOutreachSs_();
  const editor = hub.getSheetByName("Email Editor");
  const settings = hub.getSheetByName("Campaign Settings");
  if (!editor || !settings) throw new Error("Email Editor and Campaign Settings are required for monthly outreach content.");

  const editorValues = editor.getRange(1, 1, Math.max(1, editor.getLastRow()), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  let sectionRow = editorValues.findIndex(value => value === OUTREACH_MONTHLY_CONTENT_SECTION) + 1;
  const rowsByLabel = new Map();
  if (!sectionRow) {
    sectionRow = editor.getLastRow() + 1;
    const values = [[OUTREACH_MONTHLY_CONTENT_SECTION, "", "Shared monthly content for outreach templates."]]
      .concat(OUTREACH_MONTHLY_CONTENT_ROWS.map(item => [item.label, "", item.note]));
    editor.getRange(sectionRow, 1, values.length, values[0].length).setValues(values);
    editor.getRange(sectionRow, 1, 1, values[0].length).setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff");
    OUTREACH_MONTHLY_CONTENT_ROWS.forEach((item, index) => rowsByLabel.set(item.label, sectionRow + index + 1));
  } else {
    OUTREACH_MONTHLY_CONTENT_ROWS.forEach(item => {
      const row = editorValues.findIndex((value, index) => index + 1 > sectionRow && value === item.label) + 1;
      if (row) rowsByLabel.set(item.label, row);
    });
    const missing = OUTREACH_MONTHLY_CONTENT_ROWS.filter(item => !rowsByLabel.has(item.label));
    if (missing.length) {
      const start = editor.getLastRow() + 1;
      const values = missing.map(item => [item.label, "", item.note]);
      editor.getRange(start, 1, values.length, values[0].length).setValues(values);
      missing.forEach((item, index) => rowsByLabel.set(item.label, start + index));
    }
  }

  const settingKeys = settings.getRange(2, 1, Math.max(1, settings.getLastRow() - 1), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  const missingSettings = OUTREACH_MONTHLY_CONTENT_SETTINGS.filter(item => !settingKeys.includes(item.key));
  if (missingSettings.length) {
    const values = missingSettings.map(item => [item.key, `='Email Editor'!B${rowsByLabel.get(item.label)}`]);
    settings.getRange(settings.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
  }
  const refreshedEditorValues = editor.getRange(1, 1, Math.max(1, editor.getLastRow()), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  const cocktailRowsByLabel = new Map();
  OUTREACH_COCKTAIL_LIST_EDITOR_ROWS.forEach(item => {
    const row = refreshedEditorValues.indexOf(item.label) + 1;
    if (row) cocktailRowsByLabel.set(item.label, row);
  });
  const missingCocktailRows = OUTREACH_COCKTAIL_LIST_EDITOR_ROWS.filter(item => !cocktailRowsByLabel.has(item.label));
  if (missingCocktailRows.length) {
    const start = editor.getLastRow() + 1;
    const values = missingCocktailRows.map(item => [item.label, "", item.note]);
    editor.getRange(start, 1, values.length, values[0].length).setValues(values);
    editor.getRange(start, 1, 1, values[0].length).setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff");
    missingCocktailRows.forEach((item, index) => cocktailRowsByLabel.set(item.label, start + index));
  }
  const allSettingKeys = settings.getRange(2, 1, Math.max(1, settings.getLastRow() - 1), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  const missingCocktailSettings = OUTREACH_COCKTAIL_LIST_SETTINGS.filter(item => !allSettingKeys.includes(item.key));
  if (missingCocktailSettings.length) {
    const values = missingCocktailSettings.map(item => [item.key, `='Email Editor'!B${cocktailRowsByLabel.get(item.label)}`]);
    settings.getRange(settings.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
  }
  const invite = ensureEditorBlockWithSettings_(editor, settings, OUTREACH_CUSTOMER_INVITE_EDITOR_ROWS, OUTREACH_CUSTOMER_INVITE_SETTINGS);
  const refreshedSettingKeys = settings.getRange(2, 1, Math.max(1, settings.getLastRow() - 1), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  const missingPublicSiteSettings = OUTREACH_PUBLIC_SITE_SETTINGS.filter(item => !refreshedSettingKeys.includes(item.key));
  if (missingPublicSiteSettings.length) {
    settings.getRange(settings.getLastRow() + 1, 1, missingPublicSiteSettings.length, 2)
      .setValues(missingPublicSiteSettings.map(item => [item.key, ""]));
  }
  return {
    section_row:sectionRow,
    editor_rows:Object.fromEntries(rowsByLabel),
    added_settings:missingSettings.map(item => item.key),
    cocktail_list_editor_rows:Object.fromEntries(cocktailRowsByLabel),
    cocktail_list_added_settings:missingCocktailSettings.map(item => item.key),
    public_site_added_settings:missingPublicSiteSettings.map(item => item.key),
    customer_invite_editor_rows:invite.editor_rows,
    customer_invite_added_settings:invite.added_settings,
  };
}

/**
 * Appends any missing rows of an Email Editor block (label, starting value, note) and links
 * each missing Campaign Settings key to its editor cell. Never moves or overwrites existing
 * cells, so an edited template is kept.
 */
function ensureEditorBlockWithSettings_(editor, settings, rows, settingItems) {
  const labels = editor.getRange(1, 1, Math.max(1, editor.getLastRow()), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  const rowsByLabel = new Map();
  rows.forEach(item => {
    const row = labels.indexOf(item.label) + 1;
    if (row) rowsByLabel.set(item.label, row);
  });
  const missing = rows.filter(item => !rowsByLabel.has(item.label));
  if (missing.length) {
    const start = editor.getLastRow() + 1;
    const values = missing.map(item => [item.label, item.value || "", item.note || ""]);
    editor.getRange(start, 1, values.length, values[0].length).setValues(values);
    if (missing[0] === rows[0]) editor.getRange(start, 1, 1, values[0].length).setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff");
    missing.forEach((item, index) => rowsByLabel.set(item.label, start + index));
  }
  const keys = settings.getRange(2, 1, Math.max(1, settings.getLastRow() - 1), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  const missingSettings = settingItems.filter(item => !keys.includes(item.key));
  if (missingSettings.length) {
    settings.getRange(settings.getLastRow() + 1, 1, missingSettings.length, 2)
      .setValues(missingSettings.map(item => [item.key, `='Email Editor'!B${rowsByLabel.get(item.label)}`]));
  }
  return { editor_rows:Object.fromEntries(rowsByLabel), added_settings:missingSettings.map(item => item.key) };
}

function ensureSellSheetStructure_() {
  const skuSheet = getSheet_(SHEET_NAMES.SKUS);
  const skuHeaders = ensureHeaderColumns_(skuSheet, ["sell_sheet_section"]);
  const validation = SpreadsheetApp.newDataValidation().requireValueInList(SELL_SHEET_SECTION_VALUES, true).setAllowInvalid(false).build();
  skuSheet.getRange(2, skuHeaders.sell_sheet_section + 1, Math.max(1, skuSheet.getMaxRows() - 1), 1).setDataValidation(validation);
  const editor = getOutreachSs_().getSheetByName("Email Editor");
  if (!editor) throw new Error("Email Editor is required for sell-sheet content.");
  const labels = editor.getRange(1, 1, Math.max(1, editor.getLastRow()), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  let sectionRow = labels.indexOf(SELL_SHEET_EDITOR_SECTION) + 1;
  if (!sectionRow) {
    sectionRow = editor.getLastRow() + 1;
    editor.getRange(sectionRow, 1, 1, 3).setValues([[SELL_SHEET_EDITOR_SECTION, "", "Editable content for sell-sheet.html."]]);
    editor.getRange(sectionRow, 1, 1, 3).setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff");
  }
  const refreshed = editor.getRange(1, 1, Math.max(1, editor.getLastRow()), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  const missing = SELL_SHEET_EDITOR_ROWS.filter(item => !refreshed.includes(item.label));
  if (missing.length) editor.getRange(editor.getLastRow() + 1, 1, missing.length, 3).setValues(missing.map(item => [item.label, item.value, item.note]));
  return { section_row:sectionRow, sku_column:"sell_sheet_section", added_editor_rows:missing.map(item => item.label) };
}

function sellSheetCopy_() {
  const values = new Map(SELL_SHEET_EDITOR_ROWS.map(item => [item.label, item.value]));
  const editor = getOutreachSs_().getSheetByName("Email Editor");
  if (editor && editor.getLastRow()) editor.getRange(1, 1, editor.getLastRow(), Math.max(2, editor.getLastColumn())).getDisplayValues().forEach(row => {
    const label = String(row[0] || "").trim();
    if (values.has(label) && String(row[1] || "").trim()) values.set(label, String(row[1]).trim());
  });
  return { headline:values.get("Sell sheet headline"), price_line:values.get("Sell sheet price line"), story_heading:values.get("Sell sheet story heading"), story:values.get("Sell sheet story"), unique_heading:values.get("Sell sheet unique heading"), flavors_line:values.get("Sell sheet flavors line"), infusion_line:values.get("Sell sheet infusion line"), cans_line:values.get("Sell sheet cans line"), contact:values.get("Sell sheet contact"), footer:values.get("Sell sheet footer") };
}

function repairHubStructure_() {
  ensureFoundationalSheets_();
  const engagement = getOutreachSs_().getSheetByName(OUTREACH_ENGAGEMENT_SHEET_NAME);
  if (engagement) ensureHeaderColumns_(engagement, ["Account ID", "Target", "Stage"]);
  getInboundRepliesSheet_(true);
  const identity = ensureAccountIdentityModel_(true);
  const directory = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const headers = getHeaderMap_(directory);
  const directoryValidations = repairOutreachDirectoryValidations_(directory);
  if (headers.priority !== undefined && directory.getLastRow() > 1) {
    const priorityRange = directory.getRange(2, headers.priority + 1, directory.getLastRow() - 1, 1);
    const priorityValues = priorityRange.getValues();
    let changed = false;
    priorityValues.forEach(row => {
      if (String(row[0] || "").trim().toLowerCase() === "medium") {
        row[0] = "Normal";
        changed = true;
      }
    });
    if (changed) priorityRange.setValues(priorityValues);
  }
  identity.directory_validations = directoryValidations;
  identity.monthly_content = ensureOutreachMonthlyContent_();
  identity.sell_sheet = ensureSellSheetStructure_();
  return identity;
}

function apiRepairHubStructure_(p) {
  if (!p) throw new Error("Missing repair request.");
  requireFields_(p, ["staff_name"]);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another migration or write is in progress.");
  try {
    const identity = repairHubStructure_();
    const failures = (identity.backfill_results || []).filter(item => !item.ok);
    return {
      message:failures.length
        ? `Hub structure repaired, but Account ID backfill failed on: ${failures.map(item => `${item.sheet} (${item.error})`).join("; ")}.`
        : "Hub structure repaired.",
      repaired_at:new Date().toISOString(),
      accounts:identity.rows.length,
      backfill_results:identity.backfill_results || [],
      directory_validations:identity.directory_validations || {},
    };
  } finally {
    lock.releaseLock();
  }
}

function repairHubStructureNightly() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another migration or write is in progress.");
  try {
    const identity = repairHubStructure_();
    console.log(JSON.stringify({ event:"hub_structure_repair", accounts:identity.rows.length, backfill_results:identity.backfill_results || [] }));
  } finally {
    bumpReadCacheVersion_();
    lock.releaseLock();
  }
}

function repairHubStructure() {
  try {
    const result = apiRepairHubStructure_({ staff_name:"Karl (editor)", authenticated_staff_role:"admin" });
    Logger.log(JSON.stringify(result));
    return result;
  } finally {
    bumpReadCacheVersion_();
  }
}

function installNightlyHubStructureRepair() {
  const handler = "repairHubStructureNightly";
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === handler)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(3).create();
  return { message:"Nightly Hub structure repair installed." };
}

function compressedText_(payload) {
  const text = JSON.stringify(payload);
  if (text.length < 50000) return text;
  const packed = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(text, "application/json")).getBytes());
  return JSON.stringify({ ok:true, version:APP_VERSION, gzip_b64:packed });
}

// ---------------------------------------------------------------------------
// Drive response relay. Google's web-app response handoff to Netlify stalls or
// returns 404 even when this script finishes in seconds. When the staff proxy
// sends relay_id, the response text is ALSO written to one of a fixed set of
// Drive "slot" files, which the proxy reads directly with a service account.
// The proxy uses whichever copy arrives first. Nothing is executed twice.
// Run setupDriveRelay() once; see PROJECT_STATUS.md for the Netlify settings.
// ---------------------------------------------------------------------------
const RELAY_SLOT_COUNT = 32;
const RELAY_SLOT_IDS_PROPERTY = "RELAY_SLOT_IDS";
let __RELAY_SLOT_IDS = null;

// Must match relaySlotIndex() in netlify/lib/drive-relay.js exactly.
function relaySlotIndex_(relayId) {
  let hash = 0;
  const text = String(relayId || "");
  for (let index = 0; index < text.length; index += 1) hash = (Math.imul(hash, 31) + text.charCodeAt(index)) >>> 0;
  return hash % RELAY_SLOT_COUNT;
}

function relaySlotIds_() {
  if (__RELAY_SLOT_IDS) return __RELAY_SLOT_IDS;
  try { __RELAY_SLOT_IDS = JSON.parse(PropertiesService.getScriptProperties().getProperty(RELAY_SLOT_IDS_PROPERTY) || "[]"); }
  catch (_) { __RELAY_SLOT_IDS = []; }
  return __RELAY_SLOT_IDS;
}

function relayedOutput_(e, text) {
  const relayId = String(e?.parameter?.relay_id || "");
  if (/^[A-Za-z0-9-]{20,80}$/.test(relayId)) {
    const ids = relaySlotIds_();
    if (ids.length === RELAY_SLOT_COUNT) {
      try {
        DriveApp.getFileById(ids[relaySlotIndex_(relayId)]).setContent(JSON.stringify({ relay_id:relayId, written_at:new Date().toISOString(), body:text }));
      } catch (error) {
        console.warn("Drive relay write failed: " + String(error && error.message || error));
      }
    }
  }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor. Creates the relay folder, 32 slot files and a manifest. */
function setupDriveRelay() {
  const props = PropertiesService.getScriptProperties();
  let ids = [];
  try { ids = JSON.parse(props.getProperty(RELAY_SLOT_IDS_PROPERTY) || "[]"); } catch (_) {}
  let folder;
  if (ids.length === RELAY_SLOT_COUNT) {
    folder = DriveApp.getFileById(ids[0]).getParents().next();
  } else {
    folder = DriveApp.createFolder("Distribution Hub Relay (do not edit)");
    ids = [];
    for (let index = 0; index < RELAY_SLOT_COUNT; index += 1) {
      ids.push(folder.createFile(`relay-slot-${String(index).padStart(2, "0")}.json`, "{}", "application/json").getId());
    }
    props.setProperty(RELAY_SLOT_IDS_PROPERTY, JSON.stringify(ids));
  }
  const manifestName = "relay-manifest.json";
  const existing = folder.getFilesByName(manifestName);
  const manifest = existing.hasNext() ? existing.next() : folder.createFile(manifestName, "{}", "application/json");
  manifest.setContent(JSON.stringify({ slots:ids }));
  __RELAY_SLOT_IDS = ids;
  const result = {
    folder_url:folder.getUrl(),
    RELAY_MANIFEST_FILE_ID:manifest.getId(),
    next_steps:"Share this folder (Viewer) with the service account email, then set GOOGLE_SA_CLIENT_EMAIL, GOOGLE_SA_PRIVATE_KEY and RELAY_MANIFEST_FILE_ID in Netlify.",
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function readJsonBody_(e) {
  try { return e?.postData?.contents ? JSON.parse(e.postData.contents) : {}; }
  catch (err) { return { __parse_error__: String(err) }; }
}
function requireFields_(obj, fields) {
  const missing = fields.filter(f => obj[f] === undefined || obj[f] === null || obj[f] === "");
  if (missing.length) throw publicError_(`Missing required field(s): ${missing.join(", ")}`);
}
// Actions the public customer proxy may call. Their callers see only messages written for them
// (thrown with publicError_); anything else is logged and replaced with a fixed message.
const PUBLIC_ACTIONS = new Set(["listSkus", "submitCustomerApplication", "submitOnlineOrderRequest"]);
const PUBLIC_ERROR_MESSAGE = "The request could not be processed.";
function publicError_(message) {
  const error = new Error(message);
  error.public_message = true;
  return error;
}
function getApiKey_() {
  return PropertiesService.getScriptProperties().getProperty("API_KEY") || "";
}
function assertAuthorized_(e, body) {
  if (!REQUIRE_API_KEY) return;
  const apiKey = (e?.parameter?.api_key) || (body?.api_key) || "";
  const expected = getApiKey_();
  if (!expected) throw new Error("Server missing API_KEY (set Script Properties).");
  if (String(apiKey) !== String(expected)) throw new Error("Unauthorized (bad API key).");
}

function doGet(e) {
  return handle_(e, null, true);
}
function doPost(e) {
  const body = readJsonBody_(e);
  return handle_(e, body);
}
function handle_(e, body, isGet) {
  const action = (e?.parameter?.action) || (body?.action) || "";
  let invalidateReadCache = false;
  try {
    assertAuthorized_(e, body);
    if (!action) {
      return json_({ ok:true, service:"sturgeon-distribution-hub", version:APP_VERSION, actions:["initData","listSkus","sellSheet","addSkuToStore","upsertProduct","submitCounts","createReorder","managerGrid","salesSinceCount","updateStoreContacts","outreachDashboard","outreachRecord","outreachSendStatus","outreachNewsletterContacts","outreachCampaigns","outreachCampaign","previewOutreachCampaign","createOutreachCampaign","updateOutreachCampaignRecipient","setOutreachCampaignRecipientExclusion","setOutreachCampaignRecipientExclusions","approveOutreachCampaign","reopenOutreachCampaign","reconcileCampaignSends","rebuildCampaignRecipients","sendOutreachCampaignBatch","scheduleOutreachCampaign","cancelOutreachCampaignSchedule","saveOutreachDraft","sendOutreachEmail","sendOutreachTestEmail","updateOutreachOutcome","logOutreachContact","updateOutreachBusiness","updateOutreachPrograms","createOutreachBusiness","importOutreachBusinesses","recalculateOutreachMiles","backfillEngagementDetails","upsertNewsletterContact","submitCustomerApplication","submitOnlineOrderRequest","customerWorkQueue","customerAccountIndex","linkBadgerInvoice","syncBadgerStatus","markBadgerInvoicePayment","recordBadgerCheck","resolvePaymentReminder","badgerReconcilePreview","applyBadgerReconcile","previewBadgerPaymentReminder","sendBadgerPaymentReminder","previewBadgerInvoice","createBadgerInvoice","adoptBadgerInvoice","failBadgerInvoiceCreation","updateCustomerApplication","updateOnlineOrderRequest","hubSystemStatus","salesReport","inboundReplies","resolveInboundReply","checkInboundReplies","initializeHardenedHub","repairHubStructure","reconcileIntegrations"] });
    }

    // A link or image tag can trigger a GET, so only read actions are accepted that way.
    if (isGet && !READ_ACTIONS.has(action)) throw new Error("This action must be sent as POST.");
    invalidateReadCache = !READ_ACTIONS.has(action);
    let res;
    switch (action) {
      case "initData": res = apiGetInitData_((e?.parameter?.store_id) || (body?.store_id) || "", false, String((e?.parameter?.refresh) || (body?.refresh) || "") === "1"); break;
      case "listSkus": res = apiListSkus_(); break;
      case "sellSheet": res = apiSellSheet_(body || {}); break;
      case "addSkuToStore": res = apiAddSkuToStore_(body); break;
      case "upsertProduct": res = apiUpsertProduct_(body); break;
      case "submitCounts": res = apiSubmitCounts_(body); break;
      case "createReorder": res = apiCreateReorder_(body); break;
      case "managerGrid": res = apiGetManagerGrid_(); break;
      case "salesSinceCount": res = apiGetSalesSinceCount_((e?.parameter?.store_id) || (body?.store_id) || ""); break;
      case "updateStoreContacts": res = apiUpdateStoreContacts_(body); break;
      case "outreachDashboard": res = apiGetOutreachDashboard_(Object.assign({}, e?.parameter || {}, body || {})); break;
      case "outreachRecord": res = apiGetOutreachRecord_(body); break;
      case "recordEmailEngagement": res = apiRecordEmailEngagement_(body); break;
      case "outreachSendStatus": res = apiGetOutreachSendStatus_(); break;
      case "outreachNewsletterContacts": res = { newsletter_contacts:newsletterContacts_() }; break;
      case "outreachCampaigns": res = apiGetOutreachCampaigns_(); break;
      case "outreachCampaign": res = apiGetOutreachCampaign_(body); break;
      case "previewOutreachCampaign": res = apiPreviewOutreachCampaign_(body); break;
      case "createOutreachCampaign": res = apiCreateOutreachCampaign_(body); break;
      case "updateOutreachCampaignRecipient": res = apiUpdateOutreachCampaignRecipient_(body); break;
      case "setOutreachCampaignRecipientExclusion": res = apiSetOutreachCampaignRecipientExclusion_(body); break;
      case "setOutreachCampaignRecipientExclusions": res = apiSetOutreachCampaignRecipientExclusions_(body); break;
      case "approveOutreachCampaign": res = apiApproveOutreachCampaign_(body); break;
      case "reopenOutreachCampaign": res = apiReopenOutreachCampaign_(body); break;
      case "reconcileCampaignSends": res = apiReconcileCampaignSends_(body); break;
      case "rebuildCampaignRecipients": res = apiRebuildCampaignRecipients_(body); break;
      case "sendOutreachCampaignBatch": res = apiSendOutreachCampaignBatch_(body); break;
      case "scheduleOutreachCampaign": res = apiScheduleOutreachCampaign_(body); break;
      case "cancelOutreachCampaignSchedule": res = apiCancelOutreachCampaignSchedule_(body); break;
      case "saveOutreachDraft": res = apiSaveOutreachDraft_(body); break;
      case "sendOutreachEmail": res = apiSendOutreachEmail_(body, false); break;
      case "sendOutreachTestEmail": res = apiSendOutreachEmail_(body, true); break;
      case "updateOutreachOutcome": res = apiUpdateOutreachOutcome_(body); break;
      case "logOutreachContact": res = apiLogOutreachContact_(body); break;
      case "updateOutreachBusiness": res = apiUpdateOutreachBusiness_(body); break;
      case "updateOutreachPrograms": res = apiUpdateOutreachPrograms_(body); break;
      case "createOutreachBusiness": res = apiCreateOutreachBusiness_(body); break;
      case "importOutreachBusinesses": res = apiImportOutreachBusinesses_(body); break;
      case "backfillEngagementDetails": res = apiBackfillEngagementDetails_(body); break;
      case "recalculateOutreachMiles": res = apiRecalculateOutreachMiles_(body); break;
      case "upsertNewsletterContact": res = apiUpsertNewsletterContact_(body); break;
      case "submitCustomerApplication": res = apiSubmitCustomerApplication_(body); break;
      case "submitOnlineOrderRequest": res = apiSubmitOnlineOrderRequest_(body); break;
      case "customerWorkQueue": res = apiGetCustomerWorkQueue_(Object.assign({}, e?.parameter || {}, body || {})); break;
      case "customerAccountIndex": res = apiGetCustomerAccountIndex_(Object.assign({}, e?.parameter || {}, body || {})); break;
      case "linkBadgerInvoice": res = apiLinkBadgerInvoice_(body); break;
      case "syncBadgerStatus": res = apiSyncBadgerStatus_(body); invalidateReadCache = false; break;
      case "markBadgerInvoicePayment": res = apiMarkBadgerInvoicePayment_(body); break;
      case "recordBadgerCheck": res = apiRecordBadgerCheck_(body); break;
      case "resolvePaymentReminder": res = apiResolvePaymentReminder_(body); break;
      case "badgerReconcilePreview": res = apiBadgerReconcilePreview_(); break;
      case "applyBadgerReconcile": res = apiApplyBadgerReconcile_(body); break;
      case "previewBadgerPaymentReminder": res = apiPreviewBadgerPaymentReminder_(body); break;
      case "sendBadgerPaymentReminder": res = apiSendBadgerPaymentReminder_(body); break;
      case "previewBadgerInvoice": res = apiPreviewBadgerInvoice_(body); break;
      case "createBadgerInvoice": res = apiCreateBadgerInvoice_(body); break;
      case "adoptBadgerInvoice": res = apiAdoptBadgerInvoice_(body); break;
      case "failBadgerInvoiceCreation": res = apiFailBadgerInvoiceCreation_(body); break;
      case "updateCustomerApplication": res = apiUpdateCustomerApplication_(body); break;
      case "updateOnlineOrderRequest": res = apiUpdateOnlineOrderRequest_(body); break;
      case "hubSystemStatus": res = apiGetHubSystemStatus_(); break;
      case "salesReport": res = apiGetSalesReport_(); break;
      case "inboundReplies": res = apiGetInboundReplies_(); break;
      case "resolveInboundReply": res = apiResolveInboundReply_(body); break;
      case "checkInboundReplies": res = apiCheckInboundReplies_(); break;
      case "initializeHardenedHub": res = apiInitializeHardenedHub_(body); break;
      case "repairHubStructure": res = apiRepairHubStructure_(body); break;
      case "reconcileIntegrations": res = apiReconcileIntegrations_(body); break;
      default:
        invalidateReadCache = false;
        throw new Error(`Unknown action: ${action}`);
    }

    const payload = Object.assign({ ok:true, version:APP_VERSION }, res);
    // Large read responses stall intermittently in Google's web-app response handoff.
    // When the staff proxy asks (gz=1), send big payloads gzip+base64; the proxy unpacks them.
    const text = READ_ACTIONS.has(action) && String(e?.parameter?.gz || "") === "1" ? compressedText_(payload) : JSON.stringify(payload);
    return relayedOutput_(e, text);
  } catch (err) {
    const detail = err?.message ? err.message : String(err);
    if (PUBLIC_ACTIONS.has(action) && !err?.public_message) {
      console.error(`Public ${action} failed: ${detail}`);
      return relayedOutput_(e, JSON.stringify({ ok:false, version:APP_VERSION, error:PUBLIC_ERROR_MESSAGE }));
    }
    return relayedOutput_(e, JSON.stringify({ ok:false, version:APP_VERSION, error:detail }));
  } finally {
    if (invalidateReadCache) {
      try { bumpReadCacheVersion_(); }
      catch (error) { console.warn("Read cache invalidation failed: " + String(error && error.message || error)); }
    }
  }
}

function apiGetInitData_(store_id, _cache_bypass, forceRefresh) {
  if (!store_id && !_cache_bypass) return cachedReadPayload_("inventory_stores", () => apiGetInitData_("", true), !!forceRefresh);
  const startedAt = Date.now();
  const trackedAccountIds = inventoryTrackedAccountIds_();
  const stores = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.STORES))
    .filter(s => inventoryStoreAllowed_(s, trackedAccountIds))
    .map(s => Object.assign({
      store_id:String(s.store_id || ""),
      store_name:String(s.store_name || ""),
      route:String(s.route||"")
    }, storeContactFields_(s)))
    .sort((a,b)=>a.store_name.localeCompare(b.store_name));

  if (!store_id) return { stores, lines: [], performance:{ total_ms:Date.now() - startedAt, stages:{ stores_read_ms:Date.now() - startedAt } } };
  assertInventoryStoreAllowed_(store_id);

  const skuRows = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.SKUS));
  const skuMap = new Map();
  skuRows.forEach(s => {
    if (!toBool_(s.active)) return;
    skuMap.set(String(s.sku_id).trim(), {
      sku_name: s.sku_name,
      upc: digitsOnly_(s.upc),
      size: s.size,
      units_per_case: Number(s.units_per_case || 12),
    });
  });

  const lines = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.INVENTORY))
    .filter(r => String(r.store_id) === String(store_id))
    .map(r => {
      const sku = skuMap.get(String(r.sku_id).trim()) || {};
      return {
        sku_id: String(r.sku_id),
        sku_name: String(sku.sku_name || r.sku_id || ""),
        upc: String(sku.upc || ""),
        size: String(sku.size || ""),
        units_per_case: Number(sku.units_per_case || 12),
        on_hand_units: Number(r.on_hand_units||0),
        par_level_units: Number(r.par_level_units||0),
        reorder_point_units: Number(r.reorder_point_units||0),
      };
    })
    .sort((a,b)=>a.sku_name.localeCompare(b.sku_name));

  return { stores, lines, performance:{ total_ms:Date.now() - startedAt, stages:{ store_lines_read_ms:Date.now() - startedAt } } };
}

function apiListSkus_() {
  const toastMap = new Map();
  const toastSheet = getOutreachSs_().getSheetByName(TOAST_ITEM_MAP_SHEET_NAME);
  if (toastSheet && toastSheet.getLastRow() >= 2) {
    getAllRowsAsObjects_(toastSheet).forEach(item => {
      if (!toBool_(item.active)) return;
      const skuId = String(item.sturgeon_sku_id || "").trim();
      if (!skuId || toastMap.has(skuId)) return;
      toastMap.set(skuId, {
        external_item_id:String(item.toast_item_guid || ""),
        stock_status:String(item.stock_status || "Not connected"),
        toast_item_name:String(item.toast_item_name || ""),
      });
    });
  }
  const map = new Map();
  getAllRowsAsObjects_(getSheet_(SHEET_NAMES.SKUS)).forEach(s=>{
    if (!toBool_(s.active)) return;
    const id = String(s.sku_id||"").trim();
    if (!id) return;
    const toast = toastMap.get(id) || {};
    // Toast Stock (bottles, from the weekly Toast count) marks a product out of stock at zero; the optional
    // "Out of Stock" checkbox still forces it out. The count itself is never sent to the public order page.
    const stockText = String(s.toast_stock ?? "").trim();
    const stock = stockText === "" ? null : Number(stockText);
    const hasStock = stock !== null && Number.isFinite(stock);
    const outOfStock = toBool_(firstPresent_(s, ["out_of_stock", "out_of_stock?"])) || (hasStock && stock <= 0);
    map.set(id,{
      sku_id:id,
      sku_name:s.sku_name,
      upc:digitsOnly_(s.upc),
      size:s.size,
      units_per_case:Number(s.units_per_case||12),
      catalog_source:ORDER_CATALOG_SOURCE,
      availability_status:outOfStock ? "Out of stock" : hasStock ? "In stock" : "Staff will confirm availability",
      out_of_stock:outOfStock,
      external_item_id:String(toast.external_item_id || ""),
      toast_mapping_status:toast.external_item_id ? "Mapped; adapter disabled" : "Not mapped",
    });
  });
  return {
    catalog_source:ORDER_CATALOG_SOURCE,
    availability_source:"Toast Stock column in SKUs (weekly Toast count) and Out of Stock checkboxes; staff confirms availability",
    skus:Array.from(map.values()).sort((a,b)=>String(a.sku_name||"").localeCompare(String(b.sku_name||""))),
  };
}

function sellSheetSectionForSku_(sku) {
  const explicit = String(sku.sell_sheet_section || "").trim();
  if (explicit) return explicit;
  const key = `${sku.sku_id || ""} ${sku.sku_name || ""} ${sku.price_tier || ""}`.toLowerCase();
  if (/gift|box/.test(key)) return "Gift boxes";
  if (/canned|cocktail/.test(key)) return "Canned cocktails";
  if (/bitter/.test(key)) return "Bitters";
  if (/squadron|spitfire|mustang|hellcat|flying fortress/.test(key)) return "Squadron Spirits";
  if (/bourbon|whiskey|whisky|brandy/.test(key)) return "Whiskey & Brandy";
  if (/osh.?gave|agave/.test(key)) return "Agave";
  if (/^stur-liq-|liqueur|amaretto|coffee|pumpkin|limoncello|triple sec|creme|curacao/.test(key)) return "Liqueur";
  if (/\brum\b|banana|coconut|pineapple|mango/.test(key)) return "Rum";
  if (/\bgin\b|blood orange|lavender|rhubarb|rosemary|sage|thyme/.test(key)) return "Gin";
  if (/vodka|river run|bacon|basil|black pepper|blackberry|candy cane|cinnamon|cranberry|cucumber|dill|cherry|garlic|habanero|jalapeño|jalapeno|pear|raspberry|sweet tea/.test(key)) return "Vodka";
  return "Other spirits";
}

function sellSheetCustomerPriceMap_(customerRows, accountId) {
  const values = new Map();
  const conflicts = new Set();
  (customerRows || []).forEach(row => {
    if (!toBool_(row.active) || String(row.account_id || "").trim() !== String(accountId || "").trim()) return;
    const skuId = String(row.sku_id || "").trim();
    const cents = badgerMoneyToCents_(firstPresent_(row, ["price", "unit_price", "wholesale_price"]));
    if (!skuId || !(cents > 0)) return;
    if (values.has(skuId) && values.get(skuId) !== cents) conflicts.add(skuId); else values.set(skuId, cents);
  });
  conflicts.forEach(skuId => values.delete(skuId));
  values.conflicts = conflicts;
  return values;
}

// This endpoint is reached only through Netlify's sell-sheet function, which decides whether prices may be included.
// Do not add wholesale prices to apiListSkus_ or another public catalog response.
function apiSellSheet_(p) {
  const includePrices = p && p.include_prices === true && p.sell_sheet_proxy === true;
  const accountId = includePrices ? String(p.account_id || "").trim() : "";
  const skuRows = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.SKUS));
  const tiers = includePrices ? priceTierCents_() : null;
  const customerSheet = includePrices && accountId ? getSs_().getSheetByName(CUSTOMER_PRICES_SHEET_NAME) : null;
  const customerPrices = customerSheet && customerSheet.getLastRow() >= 2 ? sellSheetCustomerPriceMap_(getAllRowsAsObjects_(customerSheet), accountId) : new Map();
  const sections = new Map();
  skuRows.forEach(sku => {
    if (!toBool_(sku.active)) return;
    const skuId = String(sku.sku_id || "").trim();
    if (!skuId) return;
    const section = sellSheetSectionForSku_(sku);
    if (section === "Hide") return;
    const stockText = String(sku.toast_stock ?? "").trim();
    const stock = stockText === "" ? null : Number(stockText);
    const outOfStock = toBool_(firstPresent_(sku, ["out_of_stock", "out_of_stock?"])) || (Number.isFinite(stock) && stock <= 0);
    const item = {
      sku_id:skuId, name:String(sku.sku_name || skuId), size:String(sku.size || ""),
      abv:Number(sku.proof || 0) > 0 ? Number(sku.proof) / 2 : null,
      units_per_case:Number(sku.units_per_case || 0) || null,
      availability:outOfStock ? "Currently out" : Number.isFinite(stock) ? "In stock" : "Staff will confirm availability",
      out_of_stock:outOfStock,
    };
    if (includePrices) {
      if (customerPrices.conflicts && customerPrices.conflicts.has(skuId)) item.price_note = "Ask us for your price";
      else item.price_cents = customerPrices.has(skuId) ? customerPrices.get(skuId) : skuWholesaleCents_(sku, tiers);
    }
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section).push(item);
  });
  const order = ["New", "Best seller", "Vodka", "Gin", "Rum", "Liqueur", "Agave", "Whiskey & Brandy", "Squadron Spirits", "Gift boxes", "Bitters", "Canned cocktails", "Other spirits"];
  return {
    access:{ prices:includePrices, account_specific:!!accountId },
    copy:sellSheetCopy_(),
    sections:order.filter(section => sections.has(section)).map(section => ({ section:section, products:sections.get(section).sort((a,b) => a.name.localeCompare(b.name)) })),
  };
}

function apiAddSkuToStoreUnlocked_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["store_id","sku_id"]);
  assertInventoryStoreAllowed_(p.store_id);

  const sh = getSheet_(SHEET_NAMES.INVENTORY);
  const h = getHeaderMap_(sh);
  const rows = getAllRowsAsObjects_(sh);

  if (rows.some(r => String(r.store_id)===String(p.store_id) && String(r.sku_id)===String(p.sku_id)))
    return { message:"SKU already exists for store." };

  const row = Array(sh.getLastColumn()).fill("");
  row[h.store_id]=p.store_id;
  row[h.sku_id]=p.sku_id;
  row[h.on_hand_units]=Number(p.on_hand_units||0);
  row[h.par_level_units]=Number(p.par_level_units||0);
  row[h.reorder_point_units]=Number(p.reorder_point_units||0);
  sh.appendRow(row);

  return { message:"Added SKU to store." };
}

function apiUpsertProductUnlocked_(p) {
  if (!p || !p.sku) throw new Error("Missing sku");
  requireFields_(p.sku, ["sku_id","sku_name"]);

  const sh = getSheet_(SHEET_NAMES.SKUS);
  const h = getHeaderMap_(sh);
  const rows = getAllRowsAsObjects_(sh);

  const id = String(p.sku.sku_id).trim();
  const idx = rows.findIndex(r => String(r.sku_id).trim() === id);

  const row = Array(sh.getLastColumn()).fill("");
  row[h.sku_id]=id;
  row[h.upc]=digitsOnly_(p.sku.upc);
  row[h.sku_name]=sheetSafeText_(p.sku.sku_name, 150, "SKU name");
  row[h.size]=sheetSafeText_(p.sku.size, 50, "Size");
  row[h.units_per_case]=Number(p.sku.units_per_case||12);
  row[h.active]=!!p.sku.active;

  if (idx>=0) sh.getRange(idx+2,1,1,row.length).setValues([row]);
  else sh.appendRow(row);

  if (p.addToStore) {
    apiAddSkuToStoreUnlocked_({
      store_id:p.store_id,
      sku_id:id,
      on_hand_units:p.inventory?.on_hand_units,
      par_level_units:p.inventory?.par_level_units,
      reorder_point_units:p.inventory?.reorder_point_units
    });
  }

  return { message:"Product saved." };
}

const COUNT_LOG_EXTRA_HEADERS = ["shelf_units", "back_units", "expected_system_units", "submission_token"];

function countSubmissionAlreadyRecorded_(counts, h, token) {
  if (!token || h.submission_token === undefined || counts.getLastRow() < 2) return false;
  const tokens = counts.getRange(2, h.submission_token + 1, counts.getLastRow() - 1, 1).getValues();
  return tokens.some(row => String(row[0] || "") === token);
}

function apiSubmitCountsUnlocked_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["store_id","rep"]);
  assertInventoryStoreAllowed_(p.store_id);
  if (!Array.isArray(p.items) || !p.items.length) throw new Error("Missing items[]");
  if (p.items.length > 500) throw new Error("Too many items in one count submission.");

  const storeId = String(p.store_id);
  const token = sheetSafeText_(p.submission_token || "", 100, "Submission token");
  const counts = getSheet_(SHEET_NAMES.COUNTS);
  const ch = ensureHeaderColumns_(counts, COUNT_LOG_EXTRA_HEADERS);

  // A retry after a dropped connection resends the same token. If those rows are already in the
  // Counts log, the first attempt finished: report success without writing anything twice.
  if (countSubmissionAlreadyRecorded_(counts, ch, token)) {
    return { message:"These counts were already recorded. Nothing was submitted twice.", submitted:0, duplicate:true, changed_since_load:[] };
  }

  const inv = getSheet_(SHEET_NAMES.INVENTORY);
  const ih = getHeaderMap_(inv);
  const rows = getAllRowsAsObjects_(inv);
  const rowIndexBySku = new Map();
  rows.forEach((row, index) => {
    if (String(row.store_id) === storeId) rowIndexBySku.set(String(row.sku_id), index);
  });

  const ts = new Date();
  const rep = sheetSafeText_(p.rep, 100, "Rep");
  const seen = new Set();
  const logRows = [];
  const inventoryUpdates = [];
  const changedSinceLoad = [];
  const width = counts.getLastColumn();

  p.items.forEach(it => {
    const skuId = String(it?.sku_id || "").trim();
    if (!skuId) throw new Error("Each counted item needs a SKU.");
    if (seen.has(skuId)) throw new Error(`SKU ${skuId} appears twice in this count.`);
    seen.add(skuId);
    const after = Number(it.counted);
    if (!Number.isInteger(after) || after < 0) throw new Error(`Count for ${skuId} must be a whole number of bottles.`);
    const shelf = it.shelf === undefined || it.shelf === "" ? "" : Math.max(0, Math.floor(Number(it.shelf) || 0));
    const back = it.back === undefined || it.back === "" ? "" : Math.max(0, Math.floor(Number(it.back) || 0));
    const index = rowIndexBySku.has(skuId) ? rowIndexBySku.get(skuId) : -1;
    const before = index >= 0 ? Number(rows[index].on_hand_units || 0) : 0;
    const expected = it.expected_on_hand === undefined || it.expected_on_hand === null || it.expected_on_hand === ""
      ? ""
      : Number(it.expected_on_hand);
    if (expected !== "" && Number.isFinite(expected) && expected !== before) {
      changedSinceLoad.push({ sku_id:skuId, expected_on_hand:expected, current_on_hand:before });
    }

    const logRow = Array(width).fill("");
    logRow[0] = ts; logRow[1] = storeId; logRow[2] = rep; logRow[3] = skuId;
    logRow[4] = before; logRow[5] = after; logRow[6] = after - before;
    logRow[7] = sheetSafeText_(it.notes, 500, "Notes");
    logRow[ch.shelf_units] = shelf;
    logRow[ch.back_units] = back;
    logRow[ch.expected_system_units] = expected;
    logRow[ch.submission_token] = token;
    logRows.push(logRow);

    // A count always sets on-hand inventory; the old "updateInventory" flag is ignored.
    if (index >= 0) inventoryUpdates.push({ index, after });
  });

  // Inventory first, then the Counts log: the log carries the submission token, so a request that
  // stops between the two writes is simply redone on retry (the inventory values are the same).
  if (inventoryUpdates.length) {
    const columns = [
      { key:"on_hand_units", value:update => update.after },
      { key:"last_count_date", value:() => ts },
      { key:"last_count_units", value:update => update.after },
    ].filter(column => ih[column.key] !== undefined);
    const first = Math.min(...inventoryUpdates.map(update => update.index));
    const last = Math.max(...inventoryUpdates.map(update => update.index));
    const byIndex = new Map(inventoryUpdates.map(update => [update.index, update]));
    columns.forEach(column => {
      const values = [];
      for (let i = first; i <= last; i++) {
        const update = byIndex.get(i);
        values.push([update ? column.value(update) : rows[i][column.key]]);
      }
      inv.getRange(first + 2, ih[column.key] + 1, values.length, 1).setValues(values);
    });
  }

  counts.getRange(counts.getLastRow() + 1, 1, logRows.length, width).setValues(logRows);

  const changedText = changedSinceLoad.length
    ? ` ${changedSinceLoad.length} item${changedSinceLoad.length === 1 ? "'s" : "s'"} system number changed while you were counting (${changedSinceLoad.map(item => `${item.sku_id}: ${item.expected_on_hand} → ${item.current_on_hand}`).join("; ")}). Your counts were recorded against the current number.`
    : "";
  return { message:`Submitted ${logRows.length} count${logRows.length === 1 ? "" : "s"}.${changedText}`, submitted:logRows.length, duplicate:false, changed_since_load:changedSinceLoad };
}

function apiCreateReorderUnlocked_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["store_id","rep"]);
  assertInventoryStoreAllowed_(p.store_id);

  const inv = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.INVENTORY))
    .filter(r => String(r.store_id)===String(p.store_id));

  const skuMap = new Map();
  getAllRowsAsObjects_(getSheet_(SHEET_NAMES.SKUS)).forEach(s=>{
    skuMap.set(String(s.sku_id).trim(), Number(s.units_per_case||12));
  });

  const out=[];
  const ts=new Date();

  inv.forEach(r=>{
    const onHand = Number(r.on_hand_units||0);
    const rp = Number(r.reorder_point_units||0);
    const par = Number(r.par_level_units||0);

    if (onHand > rp) return;
    const need = Math.max(0, par - onHand);
    if (!need) return;

    const cases = Math.ceil(need / (skuMap.get(String(r.sku_id)) || 12));
    out.push([ts,p.store_id,p.rep,r.sku_id,need,cases,"Below RP",p.notes||"","OPEN"]);
  });

  const sh=getSheet_(SHEET_NAMES.REORDERS);
  if (out.length)
    sh.getRange(sh.getLastRow()+1,1,out.length,out[0].length).setValues(out);

  return { created: out.length };
}

function apiUpdateStoreContactsUnlocked_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["store_id"]);
  assertInventoryStoreAllowed_(p.store_id);

  const sh = getSheet_(SHEET_NAMES.STORES);
  const h = ensureHeaderColumns_(sh, ["manager_name", "assistant_manager_name"]);
  const rows = getAllRowsAsObjects_(sh);
  const storeId = String(p.store_id || "");
  const idx = rows.findIndex(r => String(r.store_id) === storeId);
  if (idx < 0) throw new Error("Store not found.");

  const managerName = sheetSafeText_(p.manager_name, 100, "Manager name");
  const assistantManagerName = sheetSafeText_(p.assistant_manager_name, 100, "Assistant manager name");
  const rowNum = idx + 2;
  sh.getRange(rowNum, h.manager_name + 1).setValue(managerName);
  sh.getRange(rowNum, h.assistant_manager_name + 1).setValue(assistantManagerName);

  return {
    message: "Store contacts saved.",
    store_id: storeId,
    manager_name: managerName,
    assistant_manager_name: assistantManagerName,
  };
}

function withInventoryWriteLock_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another inventory update is in progress. Try again in a moment.");
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function apiAddSkuToStore_(p) { return withInventoryWriteLock_(() => apiAddSkuToStoreUnlocked_(p)); }
function apiUpsertProduct_(p) { return withInventoryWriteLock_(() => apiUpsertProductUnlocked_(p)); }
function apiSubmitCounts_(p) { return withInventoryWriteLock_(() => apiSubmitCountsUnlocked_(p)); }
function apiCreateReorder_(p) { return withInventoryWriteLock_(() => apiCreateReorderUnlocked_(p)); }
function apiUpdateStoreContacts_(p) { return withInventoryWriteLock_(() => apiUpdateStoreContactsUnlocked_(p)); }

function apiGetManagerGrid_() {
  const trackedAccountIds = inventoryTrackedAccountIds_();
  const stores = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.STORES))
    .filter(s => inventoryStoreAllowed_(s, trackedAccountIds))
    .map(s => Object.assign({
      store_id: String(s.store_id || ""),
      store_name: String(s.store_name || ""),
      route: String(s.route || "")
    }, storeContactFields_(s)))
    .sort((a, b) => a.store_name.localeCompare(b.store_name));

  const skuRows = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.SKUS))
    .filter(s => toBool_(s.active))
    .map(s => ({
      sku_id: String(s.sku_id || "").trim(),
      sku_name: String(s.sku_name || ""),
      size: String(s.size || ""),
      units_per_case: Number(s.units_per_case || 12)
    }))
    .filter(s => s.sku_id)
    .sort((a, b) => a.sku_name.localeCompare(b.sku_name));

  const inventoryRows = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.INVENTORY));
  const storeMap = new Map(stores.map(s => [s.store_id, s]));
  const skuMap = new Map(skuRows.map(s => [s.sku_id, s]));

  const cellMap = new Map();
  const lastCountByStore = new Map();
  inventoryRows.forEach(r => {
    const storeId = String(r.store_id || "");
    const skuId = String(r.sku_id || "").trim();
    if (!storeMap.has(storeId) || !skuMap.has(skuId)) return;

    const counted = r.last_count_date instanceof Date ? r.last_count_date : (r.last_count_date ? new Date(r.last_count_date) : null);
    if (counted && !isNaN(counted.getTime()) && (!lastCountByStore.has(storeId) || counted > lastCountByStore.get(storeId))) {
      lastCountByStore.set(storeId, counted);
    }

    const onHand = Number(r.on_hand_units || 0);
    const par = Number(r.par_level_units || 0);
    const rp = Number(r.reorder_point_units || 0);

    cellMap.set(`${storeId}__${skuId}`, {
      on_hand_units: onHand,
      par_level_units: par,
      reorder_point_units: rp,
      needs_attention: onHand <= rp,
      below_par: onHand < par,
    });
  });

  const rows = stores.map(store => {
    let needsCount = 0;
    let belowParCount = 0;

    const cells = skuRows.map(sku => {
      const cell = cellMap.get(`${store.store_id}__${sku.sku_id}`) || {
        on_hand_units: 0,
        par_level_units: 0,
        reorder_point_units: 0,
        needs_attention: true,
        below_par: false,
      };

      if (cell.needs_attention) needsCount++;
      else if (cell.below_par) belowParCount++;

      return {
        sku_id: sku.sku_id,
        on_hand_units: cell.on_hand_units,
        par_level_units: cell.par_level_units,
        reorder_point_units: cell.reorder_point_units,
        needs_attention: cell.needs_attention,
        below_par: cell.below_par,
      };
    });

    return {
      store_id: store.store_id,
      store_name: store.store_name,
      route: store.route,
      manager_name: store.manager_name,
      assistant_manager_name: store.assistant_manager_name,
      last_count_date: lastCountByStore.has(store.store_id) ? lastCountByStore.get(store.store_id).toISOString() : "",
      needs_count: needsCount,
      below_par_count: belowParCount,
      ok_count: Math.max(0, skuRows.length - needsCount - belowParCount),
      cells,
    };
  });

  return {
    stores: rows,
    skus: skuRows,
  };
}

function firstPresent_(obj, keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  return "";
}

function storeContactFields_(store) {
  return {
    manager_name: String(firstPresent_(store, ["manager_name", "manager", "store_manager", "manager_contact"]) || ""),
    assistant_manager_name: String(firstPresent_(store, ["assistant_manager_name", "asst_manager_name", "assistant_manager", "assistant_mgr", "asst_manager", "assistant"]) || ""),
  };
}

function getLatestCountMap_() {
  const sh = getSheet_(SHEET_NAMES.COUNTS);
  if (sh.getLastRow() < 2) return new Map();

  const h = getHeaderMap_(sh);
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const latest = new Map();

  values.forEach(row => {
    const obj = {};
    Object.keys(h).forEach(key => obj[key] = row[h[key]]);

    const ts = firstPresent_(obj, ["timestamp", "ts", "count_date", "date"]) || row[0];
    const storeId = String(firstPresent_(obj, ["store_id", "store"]) || row[1] || "");
    const skuId = String(firstPresent_(obj, ["sku_id", "sku"]) || row[3] || "").trim();
    const counted = Number(firstPresent_(obj, ["after", "after_units", "counted", "counted_units", "count_units"]) || row[5] || 0);
    const rep = String(firstPresent_(obj, ["rep", "staff"]) || row[2] || "");
    const notes = String(firstPresent_(obj, ["notes", "note"]) || row[7] || "");
    if (!storeId || !skuId) return;

    const countDate = ts instanceof Date ? ts : new Date(ts);
    const dateMs = countDate instanceof Date && !isNaN(countDate.getTime()) ? countDate.getTime() : 0;
    const key = `${storeId}__${skuId}`;
    const prior = latest.get(key);
    if (prior && prior.date_ms > dateMs) return;

    latest.set(key, {
      store_id: storeId,
      sku_id: skuId,
      last_count_units: counted,
      last_count_date: countDate instanceof Date && !isNaN(countDate.getTime()) ? countDate : "",
      last_count_rep: rep,
      last_count_notes: notes,
      date_ms: dateMs,
    });
  });

  return latest;
}

function apiGetSalesSinceCount_(store_id) {
  requireFields_({ store_id }, ["store_id"]);
  assertInventoryStoreAllowed_(store_id);

  const skuRows = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.SKUS));
  const skuMap = new Map();
  skuRows.forEach(s => {
    if (!toBool_(s.active)) return;
    const skuId = String(s.sku_id || "").trim();
    if (!skuId) return;
    skuMap.set(skuId, {
      sku_name: String(s.sku_name || skuId),
      upc: digitsOnly_(s.upc),
      size: String(s.size || ""),
      units_per_case: Number(s.units_per_case || 12),
    });
  });

  const latestCounts = getLatestCountMap_();
  const inventoryRows = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.INVENTORY))
    .filter(r => String(r.store_id) === String(store_id));

  const lines = inventoryRows.map(r => {
    const skuId = String(r.sku_id || "").trim();
    const sku = skuMap.get(skuId) || {};
    const current = Number(r.on_hand_units || 0);
    const latest = latestCounts.get(`${store_id}__${skuId}`);

    const fallbackUnits =
      r.last_count_units !== undefined && r.last_count_units !== null && r.last_count_units !== ""
        ? Number(r.last_count_units || 0)
        : null;
    const fallbackDate = r.last_count_date || "";
    const lastCountUnits = latest ? latest.last_count_units : fallbackUnits;
    const lastCountDate = latest ? latest.last_count_date : fallbackDate;
    const hasLastCount = lastCountUnits !== null && lastCountUnits !== undefined && lastCountUnits !== "";
    const sold = hasLastCount ? Math.max(0, Number(lastCountUnits || 0) - current) : null;

    return {
      sku_id: skuId,
      sku_name: String(sku.sku_name || skuId),
      upc: String(sku.upc || ""),
      size: String(sku.size || ""),
      units_per_case: Number(sku.units_per_case || 12),
      current_on_hand_units: current,
      last_count_units: hasLastCount ? Number(lastCountUnits || 0) : null,
      last_count_date: lastCountDate,
      last_count_rep: latest ? latest.last_count_rep : "",
      sold_since_last_count: sold,
      no_count: !hasLastCount,
    };
  }).sort((a, b) => {
    const soldA = a.sold_since_last_count === null ? -1 : a.sold_since_last_count;
    const soldB = b.sold_since_last_count === null ? -1 : b.sold_since_last_count;
    if (soldA !== soldB) return soldB - soldA;
    return String(a.sku_name || "").localeCompare(String(b.sku_name || ""));
  });

  const totalSold = lines.reduce((sum, line) => sum + Math.max(0, Number(line.sold_since_last_count || 0)), 0);
  const countedSkus = lines.filter(line => !line.no_count).length;

  return {
    store_id,
    lines,
    summary: {
      total_sold_units: totalSold,
      counted_skus: countedSkus,
      total_skus: lines.length,
    }
  };
}

function normalizeBusinessKey_(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function accountIdentityFromRows_(rows) {
  const identity = { by_id:new Map(), by_row:new Map(), by_email:new Map(), by_business_city:new Map(), rows:rows };
  rows.forEach((row, index) => {
    const accountId = String(row.account_id || "").trim();
    const sourceRow = index + 2;
    const business = String(outreachValue_(row, ["business", "business_name"]) || "").trim();
    const email = String(outreachValue_(row, ["email", "email_address"]) || "").trim().toLowerCase();
    const city = String(outreachValue_(row, ["city", "town"]) || "").trim();
    const record = { account_id:accountId, source_row:sourceRow, business:business, email:email, city:city, row:row };
    if (accountId) identity.by_id.set(accountId, record);
    identity.by_row.set(sourceRow, record);
    if (email) {
      if (!identity.by_email.has(email)) identity.by_email.set(email, []);
      identity.by_email.get(email).push(record);
    }
    const businessCity = `${normalizeBusinessKey_(business)}::${normalizeBusinessKey_(city)}`;
    if (business && !identity.by_business_city.has(businessCity)) identity.by_business_city.set(businessCity, []);
    if (business) identity.by_business_city.get(businessCity).push(record);
  });
  return identity;
}

function accountIdentityLookup_() {
  return accountIdentityFromRows_(getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME)));
}

function findIdentityMatch_(identity, accountId, business, email, city) {
  const requestedId = String(accountId || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedBusiness = normalizeBusinessKey_(business);
  const normalizedCity = normalizeBusinessKey_(city);
  if (requestedId && identity.by_id.has(requestedId)) {
    const record = identity.by_id.get(requestedId);
    const emailMatches = normalizedEmail && record.email === normalizedEmail;
    const businessMatches = normalizedBusiness && normalizeBusinessKey_(record.business) === normalizedBusiness;
    if (emailMatches || businessMatches) return { record:record, status:"Account ID verified" };
    return { record:null, status:"Account ID needs staff review" };
  }
  if (normalizedEmail && identity.by_email.has(normalizedEmail)) {
    const matches = identity.by_email.get(normalizedEmail).filter(record => !normalizedBusiness || normalizeBusinessKey_(record.business) === normalizedBusiness);
    if (matches.length === 1) return { record:matches[0], status:"Email and business matched" };
  }
  const businessCity = `${normalizedBusiness}::${normalizedCity}`;
  if (normalizedBusiness && normalizedCity && identity.by_business_city.has(businessCity)) {
    const matches = identity.by_business_city.get(businessCity);
    if (matches.length === 1) return { record:matches[0], status:"Business and city matched" };
  }
  return { record:null, status:"Needs staff match" };
}

function backfillAccountIdsInSheet_(sheet, identity, options) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const h = ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER]);
  const rowCount = sheet.getLastRow() - 1;
  // Read the full rows for matching, but write back only the Account ID column so
  // existing validation, formulas, and unrelated cells are never rewritten.
  const rows = sheet.getRange(2, 1, rowCount, sheet.getLastColumn()).getValues();
  const accountIdValues = rows.map(row => [row[h.account_id]]);
  const businessKey = (options?.business_keys || ["business", "business_name"]).find(key => h[key] !== undefined);
  const emailKey = (options?.email_keys || ["email", "primary_email", "intended_recipient"]).find(key => h[key] !== undefined);
  const cityKey = (options?.city_keys || ["city", "delivery_city"]).find(key => h[key] !== undefined);
  let changed = 0;
  rows.forEach((row, index) => {
    if (String(row[h.account_id] || "").trim()) return;
    const sourceRow = h.source_row !== undefined ? Number(row[h.source_row] || 0) : 0;
    let match = sourceRow ? identity.by_row.get(sourceRow) : null;
    if (!match) {
      const result = findIdentityMatch_(identity, "", businessKey ? row[h[businessKey]] : "", emailKey ? row[h[emailKey]] : "", cityKey ? row[h[cityKey]] : "");
      match = result.record;
    }
    if (!match || !match.account_id) return;
    accountIdValues[index][0] = match.account_id;
    changed += 1;
  });
  if (changed) sheet.getRange(2, h.account_id + 1, rowCount, 1).setValues(accountIdValues);
  return changed;
}

function ensureAccountIdentityModel_(lockHeld) {
  let lock = null;
  if (!lockHeld) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) throw new Error("Another account update is in progress.");
  }
  try {
    const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const h = ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER, "Record Created At", "Record Updated At"]);
    if (sheet.getLastRow() >= 2) {
      const rowCount = sheet.getLastRow() - 1;
      const rows = sheet.getRange(2, 1, rowCount, sheet.getLastColumn()).getValues();
      const businessKey = h.business_name !== undefined ? "business_name" : (h.business !== undefined ? "business" : "");
      // Only the Account ID and Record Created At columns are written back.
      const accountIdValues = rows.map(row => [row[h.account_id]]);
      const createdAtValues = rows.map(row => [row[h.record_created_at]]);
      let idsChanged = false;
      let createdChanged = false;
      const now = new Date();
      const seenAccountIds = new Set();
      rows.forEach((row, index) => {
        if (!businessKey || !String(row[h[businessKey]] || "").trim()) return;
        if (!String(accountIdValues[index][0] || "").trim()) {
          accountIdValues[index][0] = permanentId_("ACC");
          idsChanged = true;
        }
        const accountId = String(accountIdValues[index][0] || "").trim();
        if (seenAccountIds.has(accountId)) throw new Error(`Duplicate Account ID found on directory row ${index + 2}. Correct it before continuing.`);
        seenAccountIds.add(accountId);
        if (!createdAtValues[index][0]) {
          createdAtValues[index][0] = now;
          createdChanged = true;
        }
      });
      if (idsChanged) sheet.getRange(2, h.account_id + 1, rowCount, 1).setValues(accountIdValues);
      if (createdChanged) sheet.getRange(2, h.record_created_at + 1, rowCount, 1).setValues(createdAtValues);
    }
    const identity = accountIdentityFromRows_(getAllRowsAsObjects_(sheet));
    const backfillResults = [];
    [
      [OUTREACH_DRAFTS_SHEET_NAME, {}],
      [OUTREACH_PROGRAMS_SHEET_NAME, {}],
      [OUTREACH_ENGAGEMENT_SHEET_NAME, {}],
      [OUTREACH_ACTIVITY_SHEET_NAME, { business_keys:["business"], email_keys:["intended_recipient"] }],
      [CUSTOMER_APPLICATIONS_SHEET_NAME, { business_keys:["business_name", "legal_business_name"], email_keys:["primary_email"], city_keys:["delivery_city"] }],
      [ONLINE_ORDER_REQUESTS_SHEET_NAME, { business_keys:["business_name"], email_keys:["email"] }],
      [NEWSLETTER_CONTACTS_SHEET_NAME, { business_keys:["source_business", "organization"], email_keys:["email"] }],
    ].forEach(([sheetName, options]) => {
      // Each related tab is independent: one bad tab is reported, not fatal.
      try {
        const filled = backfillAccountIdsInSheet_(getOutreachSs_().getSheetByName(sheetName), identity, options);
        backfillResults.push({ sheet:sheetName, filled:filled, ok:true });
      } catch (error) {
        const message = String(error && error.message || error);
        console.warn(JSON.stringify({ event:"account_id_backfill_failed", sheet:sheetName, error:message }));
        backfillResults.push({ sheet:sheetName, filled:0, ok:false, error:message });
      }
    });
    const refreshed = accountIdentityFromRows_(getAllRowsAsObjects_(sheet));
    refreshed.backfill_results = backfillResults;
    return refreshed;
  } finally {
    if (lock) lock.releaseLock();
  }
}

function setDirectoryField_(row, headers, aliases, value) {
  const key = aliases.map(normalizeHeader_).find(alias => headers[alias] !== undefined);
  if (key !== undefined) row[headers[key]] = value;
}

function directoryRowFromBusiness_(sheet, p, accountId, now) {
  const h = getHeaderMap_(sheet);
  const row = Array(sheet.getLastColumn()).fill("");
  setDirectoryField_(row, h, ["Account ID"], accountId);
  setDirectoryField_(row, h, ["Business Name", "Business"], String(p.business_name || p.business || "").trim());
  setDirectoryField_(row, h, ["Contact Person", "Contact"], String(p.contact || p.contact_name || "").trim());
  setDirectoryField_(row, h, ["Email"], String(p.email || "").trim().toLowerCase());
  setDirectoryField_(row, h, ["Phone Number", "Phone"], String(p.phone || "").trim());
  setDirectoryField_(row, h, ["Street Address", "Address"], String(p.address || p.street_address || "").trim());
  setDirectoryField_(row, h, ["City"], String(p.city || "").trim());
  setDirectoryField_(row, h, ["State"], String(p.state || "WI").trim().toUpperCase());
  setDirectoryField_(row, h, ["Zip Code", "ZIP"], String(p.postal_code || p.zip || "").trim());
  setDirectoryField_(row, h, ["Next Email"], String(p.next_email || "Initial"));
  setDirectoryField_(row, h, ["Status"], String(p.status || (p.email ? "Not contacted" : "Needs email")));
  setDirectoryField_(row, h, ["Priority"], String(p.priority || "Normal"));
  setDirectoryField_(row, h, ["Do Not Email"], toBool_(p.do_not_email));
  setDirectoryField_(row, h, ["Craft-Spirit Fit (1–5)", "Craft-Spirit Fit (1-5)"], String(p.craft_spirit_fit || ""));
  setDirectoryField_(row, h, ["Rating Basis"], String(p.rating_basis || ""));
  const manualMiles = String(p.miles_source || "").trim().toLowerCase() === "manual";
  const zipMiles = manualMiles ? outreachMiles_(p.miles) : milesForZip_(p.postal_code || p.zip);
  setDirectoryField_(row, h, ["Miles"], zipMiles === null ? "" : zipMiles);
  setDirectoryField_(row, h, ["Miles Source"], manualMiles ? "manual" : zipMiles === null ? "" : "zip");
  setDirectoryField_(row, h, ["Lead Source"], String(p.lead_source || "Sturgeon Distribution Hub"));
  setDirectoryField_(row, h, ["Email Confidence"], String(p.email_confidence || (p.email ? "Needs verification" : "")));
  setDirectoryField_(row, h, ["Relationship"], String(p.relationship || "Prospect"));
  setDirectoryField_(row, h, ["Notes"], String(p.notes || ""));
  setDirectoryField_(row, h, ["Record Created At"], now);
  setDirectoryField_(row, h, ["Record Updated At"], now);
  return row;
}

function sheetSafeText_(value, maxLength, label) {
  const text = publicText_(value, maxLength, label);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function validateBusinessInput_(p) {
  const business = sheetSafeText_(p.business_name || p.business, 160, "Business name");
  if (!business) throw new Error("Business name is required.");
  const email = publicEmail_(p.email, "Email", false);
  const fit = String(p.craft_spirit_fit || "").trim();
  if (fit && (!Number.isInteger(Number(fit)) || Number(fit) < 1 || Number(fit) > 5)) throw new Error("Craft-spirit fit must be from 1 to 5.");
  const miles = String(p.miles ?? "").trim();
  if (miles && (!Number.isFinite(Number(miles)) || Number(miles) < 0 || Number(miles) > 1000)) throw new Error("Miles must be from 0 to 1000.");
  return {
    business_name:business,
    contact:sheetSafeText_(p.contact || p.contact_name, 120, "Contact"),
    email:email,
    phone:sheetSafeText_(p.phone, 40, "Phone"),
    address:sheetSafeText_(p.address || p.street_address, 180, "Address"),
    city:sheetSafeText_(p.city, 100, "City"),
    state:sheetSafeText_(p.state || "WI", 2, "State").toUpperCase(),
    postal_code:sheetSafeText_(p.postal_code || p.zip, 10, "ZIP code"),
    craft_spirit_fit:fit,
    rating_basis:sheetSafeText_(p.rating_basis, 1000, "Rating basis"),
    miles:miles,
    miles_source:String(p.miles_source || "").trim().toLowerCase() === "manual" ? "manual" : "",
    lead_source:sheetSafeText_(p.lead_source || "Sturgeon Distribution Hub", 200, "Lead source"),
    email_confidence:sheetSafeText_(p.email_confidence || (email ? "Needs verification" : ""), 80, "Email confidence"),
    relationship:sheetSafeText_(p.relationship || "Prospect", 80, "Relationship"),
    priority:(() => {
      const priority = sheetSafeText_(p.priority || "Normal", 40, "Priority");
      if (!["High", "Normal", "Low"].includes(priority)) throw new Error("Priority must be High, Normal, or Low.");
      return priority;
    })(),
    status:sheetSafeText_(p.status || (email ? "Not contacted" : "Needs email"), 80, "Status"),
    next_email:sheetSafeText_(p.next_email || "Initial", 80, "Next email"),
    notes:sheetSafeText_(p.notes, 4000, "Notes"),
    do_not_email:toBool_(p.do_not_email),
  };
}

function duplicateBusiness_(identity, p) {
  const email = String(p.email || "").trim().toLowerCase();
  if (email && identity.by_email.has(email)) return identity.by_email.get(email)[0];
  const key = `${normalizeBusinessKey_(p.business_name)}::${normalizeBusinessKey_(p.city)}`;
  const matches = identity.by_business_city.get(key) || [];
  return matches.length ? matches[0] : null;
}

function apiCreateOutreachBusiness_(p) {
  if (!p) throw new Error("Missing business.");
  const input = validateBusinessInput_(p);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another directory update is in progress.");
  try {
    const identity = accountIdentityLookup_();
    const duplicate = duplicateBusiness_(identity, input);
    if (duplicate) throw new Error(`A matching business already exists: ${duplicate.business}.`);
    const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const accountId = permanentId_("ACC");
    const now = new Date();
    sheet.appendRow(directoryRowFromBusiness_(sheet, input, accountId, now));
    appendAudit_("CREATE_BUSINESS", "Account", accountId, accountId, String(p.staff_name || "Staff"), "Sturgeon Distribution Hub", OUTREACH_SHEET_NAME, "Completed", `Created ${input.business_name}.`);
    return { message:"Business added to the directory.", account_id:accountId, source_row:sheet.getLastRow() };
  } finally {
    lock.releaseLock();
  }
}

function apiImportOutreachBusinesses_(p) {
  if (!p || !Array.isArray(p.rows) || !p.rows.length) throw new Error("Choose a CSV containing at least one business.");
  if (p.rows.length > 500) throw new Error("Import no more than 500 businesses at a time.");
  const sourceName = publicText_(p.source_name || "CSV import", 200, "Source name");
  const staffName = publicText_(p.staff_name || "Staff", 120, "Staff name");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another directory import is in progress.");
  try {
    const directory = getOutreachSheet_(OUTREACH_SHEET_NAME);
    let identity = accountIdentityFromRows_(getAllRowsAsObjects_(directory));
    const batches = getOutreachSs_().getSheetByName(IMPORT_BATCHES_SHEET_NAME);
    const importRows = getOutreachSs_().getSheetByName(IMPORT_ROWS_SHEET_NAME);
    const batchId = permanentId_("IMP");
    const sourceJson = safeJson_(p.rows);
    const sourceHash = sha256_(sourceJson);
    let created = 0;
    let skipped = 0;
    let errors = 0;
    // Collect rows in memory and write them in one batch per sheet; per-row appendRow calls made
    // imports of a few dozen businesses exceed the web request time limit.
    const directoryWidth = directory.getLastColumn();
    const directoryStartRow = directory.getLastRow() + 1;
    const pendingDirectoryRows = [];
    const importLogRows = [];
    p.rows.forEach((raw, index) => {
      let accountId = "";
      let status = "Error";
      let detail = "";
      let normalizedForLog = {
        business_name:String(raw.business_name || raw.business || "").slice(0, 160),
        email:String(raw.email || "").slice(0, 200),
        city:String(raw.city || "").slice(0, 100),
      };
      try {
        const input = validateBusinessInput_(Object.assign({}, raw, { priority:String(raw.priority || "").trim().toLowerCase() === "medium" ? "Normal" : raw.priority, lead_source:raw.lead_source || sourceName }));
        normalizedForLog = input;
        const duplicate = duplicateBusiness_(identity, input);
        if (duplicate) {
          accountId = duplicate.account_id;
          status = "Skipped duplicate";
          detail = `Matched ${duplicate.business}`;
          skipped += 1;
        } else {
          accountId = permanentId_("ACC");
          pendingDirectoryRows.push({ values:directoryRowFromBusiness_(directory, input, accountId, new Date()), log_index:importLogRows.length });
          status = "Created";
          detail = "Added to directory";
          created += 1;
          const createdRecord = {
            account_id:accountId,
            source_row:directoryStartRow + pendingDirectoryRows.length - 1,
            business:input.business_name,
            email:String(input.email || "").toLowerCase(),
            city:String(input.city || ""),
          };
          identity.by_id.set(accountId, createdRecord);
          if (createdRecord.email) {
            const emailMatches = identity.by_email.get(createdRecord.email) || [];
            emailMatches.push(createdRecord);
            identity.by_email.set(createdRecord.email, emailMatches);
          }
          const businessCityKey = `${normalizeBusinessKey_(createdRecord.business)}::${normalizeBusinessKey_(createdRecord.city)}`;
          const businessMatches = identity.by_business_city.get(businessCityKey) || [];
          businessMatches.push(createdRecord);
          identity.by_business_city.set(businessCityKey, businessMatches);
        }
      } catch (error) {
        errors += 1;
        detail = String(error.message || error).slice(0, 1000);
      }
      const normalizedJson = safeJson_(normalizedForLog);
      importLogRows.push([batchId, index + 2, accountId, raw.business_name || raw.business || "", raw.email || "", raw.city || "", normalizedJson, sha256_(normalizedJson), status, detail, new Date(), APP_VERSION]);
    });
    if (pendingDirectoryRows.length) {
      try {
        directory.getRange(directoryStartRow, 1, pendingDirectoryRows.length, directoryWidth).setValues(pendingDirectoryRows.map(item => item.values));
      } catch (batchError) {
        // A single invalid cell (for example a data-validation rule) rejects the whole batch.
        // Fall back to row-by-row so valid businesses still import and each failure is logged.
        console.warn("Directory batch import failed; retrying row by row: " + String(batchError && batchError.message || batchError));
        pendingDirectoryRows.forEach(item => {
          try {
            directory.appendRow(item.values);
          } catch (rowError) {
            const logRow = importLogRows[item.log_index];
            logRow[8] = "Error";
            logRow[9] = String(rowError && rowError.message || rowError).slice(0, 1000);
            created -= 1;
            errors += 1;
          }
        });
      }
    }
    if (importLogRows.length) importRows.getRange(importRows.getLastRow() + 1, 1, importLogRows.length, importLogRows[0].length).setValues(importLogRows);
    batches.appendRow([batchId, new Date(), staffName, sourceName, sourceHash, p.rows.length, created, skipped, errors, errors ? "Completed with errors" : "Completed", new Date(), APP_VERSION]);
    appendAudit_("IMPORT_BUSINESSES", "Import Batch", batchId, "", staffName, sourceName, OUTREACH_SHEET_NAME, errors ? "Completed with errors" : "Completed", `${created} created; ${skipped} skipped; ${errors} errors.`);
    return { message:`Import complete: ${created} created, ${skipped} skipped, ${errors} errors.`, batch_id:batchId, created:created, skipped:skipped, errors:errors };
  } finally {
    lock.releaseLock();
  }
}

function apiRecalculateOutreachMiles_(p) {
  if (String(p?.authenticated_staff_role || "").trim().toLowerCase() !== "admin") throw new Error("This action requires an administrator role.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another directory update is in progress. Try again in a moment.");
  try {
    const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const h = ensureHeaderColumns_(sheet, ["Miles Source"]); // Structural change occurs only in this admin action.
    const zipKey = ["zip", "zip_code", "postal_code"].find(key => h[key] !== undefined);
    const milesKey = ["miles", "distance", "distance_miles"].find(key => h[key] !== undefined);
    if (!zipKey || !milesKey) throw new Error("Distribution Directory and Leads needs Zip Code and Miles columns.");
    const rowCount = Math.max(0, sheet.getLastRow() - 1);
    const counts = { updated:0, manual_kept:0, no_zip:0, unknown_zip:0 };
    if (!rowCount) return Object.assign({ message:"No directory rows to recalculate." }, counts);
    const directoryRows = sheet.getRange(2, 1, rowCount, sheet.getLastColumn()).getValues();
    const nextMiles = directoryRows.map(row => [row[h[milesKey]]]);
    const nextSources = directoryRows.map(row => [row[h.miles_source]]);
    directoryRows.forEach((row, index) => {
      if (String(row[h.miles_source] || "").trim().toLowerCase() === "manual") {
        counts.manual_kept += 1;
        return;
      }
      const zip = normalizeZip_(row[h[zipKey]]);
      if (!zip) {
        counts.no_zip += 1;
        nextMiles[index][0] = "";
        nextSources[index][0] = "";
        return;
      }
      const miles = milesForZip_(zip);
      if (miles === null) {
        counts.unknown_zip += 1;
        nextMiles[index][0] = "";
        nextSources[index][0] = "";
        return;
      }
      if (String(row[h[milesKey]]) !== String(miles) || String(row[h.miles_source] || "").trim().toLowerCase() !== "zip") counts.updated += 1;
      nextMiles[index][0] = miles;
      nextSources[index][0] = "zip";
    });
    // The two columns may not be adjacent in an existing sheet; each is one batched column write, never per-cell writes.
    sheet.getRange(2, h[milesKey] + 1, rowCount, 1).setValues(nextMiles);
    sheet.getRange(2, h.miles_source + 1, rowCount, 1).setValues(nextSources);
    const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
    appendAudit_("RECALCULATE_OUTREACH_MILES", "Distribution Directory and Leads", "", "", actor, ZIP_CENTROIDS_SHEET_NAME, OUTREACH_SHEET_NAME, "Completed", `${counts.updated} updated; ${counts.manual_kept} manual kept; ${counts.no_zip} no ZIP; ${counts.unknown_zip} unknown ZIP.`);
    return Object.assign({ message:`Mileage recalculated: ${counts.updated} updated; ${counts.manual_kept} manual kept; ${counts.no_zip} no ZIP; ${counts.unknown_zip} unknown ZIP.` }, counts);
  } finally {
    lock.releaseLock();
  }
}

function recalculateOutreachMiles() {
  try {
    const result = apiRecalculateOutreachMiles_({ staff_name:"Karl (editor)", authenticated_staff_role:"admin" });
    Logger.log(JSON.stringify(result));
    return result;
  } finally {
    bumpReadCacheVersion_();
  }
}

function outreachValue_(row, keys) {
  return firstPresent_(row, keys);
}

function outreachDate_(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? "" : date;
}

function outreachStatusLower_(record) {
  return String(record.status || "").trim().toLowerCase();
}

function isDoNotContact_(record) {
  const status = outreachStatusLower_(record);
  return record.do_not_email || status === "do not contact" || status === "not interested";
}

function isSentOutreach_(record) {
  return ["sent", "follow-up due", "follow-up sent", "replied", "interested", "reactivation sent"]
    .includes(outreachStatusLower_(record));
}

function isReadyOutreach_(record) {
  const status = outreachStatusLower_(record);
  const queue = String(record.queue || "").trim().toLowerCase();
  return !!record.email && !isDoNotContact_(record)
    && (["not contacted", "review", "approved", "use reactivation"].includes(status) || ["review", "approved"].includes(queue));
}

function isDueOutreach_(record, endOfToday) {
  if (isDoNotContact_(record)) return false;
  const status = outreachStatusLower_(record);
  const followUp = outreachDate_(record.next_follow_up);
  return status === "follow-up due"
    || status === "reactivation due"
    || (!!followUp && followUp.getTime() <= endOfToday.getTime());
}

function outreachPriorityScore_(record) {
  const priority = String(record.priority || "").trim().toLowerCase();
  let score = 0;
  if (["high", "1", "a"].includes(priority)) score += 30;
  else if (["normal", "medium", "2", "b"].includes(priority)) score += 20;
  else if (priority) score += 10;
  if (record.top_50) score += 12;
  if (String(record.email_confidence || "").toLowerCase().includes("high")) score += 4;
  if (record.next_follow_up) score += 2;
  return score;
}

function outreachMiles_(value) {
  if (value === "" || value === null || value === undefined) return null;
  const miles = Number(value);
  return Number.isFinite(miles) ? miles : null;
}

function normalizeZip_(value) {
  const text = String(value === null || value === undefined ? "" : value).trim().replace(/\.0+$/, "");
  const digits = (text.match(/\d+/) || [""])[0].slice(0, 5);
  return digits ? digits.padStart(5, "0") : "";
}

function zipCentroidMap_() {
  if (__ZIP_CENTROID_MAP) return __ZIP_CENTROID_MAP;
  const cache = CacheService.getScriptCache();
  const cacheKey = "hub_zip_centroids_v2";
  try {
    const cached = JSON.parse(cache.get(cacheKey) || "null");
    if (cached && typeof cached === "object" && Object.values(cached).every(item => item && typeof item === "object")) {
      __ZIP_CENTROID_MAP = new Map(Object.entries(cached));
      return __ZIP_CENTROID_MAP;
    }
  } catch (error) {
    console.warn("ZIP centroid cache read failed: " + String(error && error.message || error));
  }
  const sheet = getOutreachSs_().getSheetByName(ZIP_CENTROIDS_SHEET_NAME);
  const map = new Map();
  if (!sheet || sheet.getLastRow() < 2) return (__ZIP_CENTROID_MAP = map);
  const headers = getHeaderMap_(sheet);
  const zipIndex = headers.zip;
  const milesIndex = headers.miles_from_distillery;
  const latitudeIndex = headers.latitude;
  const longitudeIndex = headers.longitude;
  if (zipIndex === undefined || milesIndex === undefined || latitudeIndex === undefined || longitudeIndex === undefined) {
    throw new Error("ZIP Centroids needs ZIP, Latitude, Longitude, and Miles From Distillery columns.");
  }
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().forEach(row => {
    const zip = normalizeZip_(row[zipIndex]);
    const miles = outreachMiles_(row[milesIndex]);
    const latitude = Number(row[latitudeIndex]);
    const longitude = Number(row[longitudeIndex]);
    if (!zip || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    map.set(zip, {
      city:String(headers.city === undefined ? "" : row[headers.city] || "").trim(),
      latitude:latitude,
      longitude:longitude,
      miles_from_distillery:miles,
    });
  });
  __ZIP_CENTROID_MAP = map;
  try {
    cache.put(cacheKey, JSON.stringify(Object.fromEntries(map)), 21600);
  } catch (error) {
    // CacheService has a small value limit; the in-request map remains authoritative.
    console.warn("ZIP centroid cache write failed: " + String(error && error.message || error));
  }
  return map;
}

function milesForZip_(zip) {
  const normalized = normalizeZip_(zip);
  if (!normalized) return null;
  const centroid = zipCentroidMap_().get(normalized);
  return centroid ? outreachMiles_(centroid.miles_from_distillery) : null;
}

function zipCentroidForZip_(zip) {
  const normalized = normalizeZip_(zip);
  return normalized ? (zipCentroidMap_().get(normalized) || null) : null;
}

function milesBetweenCoordinates_(from, to) {
  if (!from || !to || !Number.isFinite(from.latitude) || !Number.isFinite(from.longitude) || !Number.isFinite(to.latitude) || !Number.isFinite(to.longitude)) return null;
  const radians = degrees => degrees * Math.PI / 180;
  const earthMiles = 3958.7613;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(earthMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function directoryMilesSource_(row) {
  return String(outreachValue_(row, ["miles_source"]) || "").trim().toLowerCase();
}

function setDirectoryMilesFromZip_(values, headers, zip) {
  const sourceKey = headers.miles_source !== undefined ? "miles_source" : "";
  if (sourceKey && String(values[headers[sourceKey]] || "").trim().toLowerCase() === "manual") return { updated:false, source:"manual", miles:outreachMiles_(values[headers.miles]) };
  const milesKey = ["miles", "distance", "distance_miles"].find(key => headers[key] !== undefined);
  if (!milesKey) return { updated:false, source:"", miles:null };
  const miles = milesForZip_(zip);
  values[headers[milesKey]] = miles === null ? "" : miles;
  if (sourceKey) values[headers[sourceKey]] = miles === null ? "" : "zip";
  return { updated:true, source:miles === null ? "" : "zip", miles:miles };
}

function outreachWeeklyExclusionReasons_(record) {
  const reasons = [];
  const status = outreachStatusLower_(record);
  const outcome = String(record.outcome || "").trim().toLowerCase();
  const relationship = String(record.relationship || "").trim().toLowerCase();
  const confidence = String(record.email_confidence || "").trim().toLowerCase();
  const nextEmail = String(record.next_email || "").trim().toLowerCase();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(record.email || "").trim());

  if (Number(record.craft_spirit_fit) !== 5) reasons.push("Craft-spirit fit is not 5");
  if (record.miles === null) reasons.push("Distance is missing");
  else if (record.miles < 0 || record.miles > 15) reasons.push("More than 15 miles from Oshkosh");
  if (!validEmail) reasons.push("Valid email is missing");
  if (!["confirmed", "published", "supplied"].includes(confidence)) reasons.push("Email is not verified");
  if (relationship !== "prospect") reasons.push("Not an initial prospect");
  if (status !== "not contacted") reasons.push("Already contacted or not ready");
  if (nextEmail && nextEmail !== "initial") reasons.push("Next email is not the initial message");
  if (record.last_emailed) reasons.push("Email was already sent");
  if (record.do_not_email || ["bad address", "unsubscribed", "not interested", "do not contact"].includes(outcome)) {
    reasons.push("Excluded from email");
  }
  return reasons;
}

function outreachActivityMap_() {
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  const rows = getAllRowsAsObjects_(sheet);
  const activity = new Map();
  rows.forEach(row => {
    const business = String(outreachValue_(row, ["business"]) || "").trim();
    if (!business) return;
    const accountId = String(row.account_id || "").trim();
    const keys = [`business:${business.toLowerCase()}`];
    if (accountId) keys.unshift(`account:${accountId}`);
    const item = {
      timestamp: outreachValue_(row, ["timestamp"]),
      stage: String(outreachValue_(row, ["message_stage", "stage"]) || ""),
      result: String(outreachValue_(row, ["result"]) || ""),
      detail: String(outreachValue_(row, ["error/detail", "error_detail", "detail"]) || ""),
      subject: String(outreachValue_(row, ["subject"]) || ""),
      message_id: String(outreachValue_(row, ["message_id"]) || ""),
      delivered_to: String(outreachValue_(row, ["delivered_to"]) || ""),
      idempotency_token: String(outreachValue_(row, ["idempotency_token"]) || ""),
    };
    keys.forEach(key => {
      if (!activity.has(key)) activity.set(key, []);
      activity.get(key).push(item);
    });
  });
  activity.forEach(items => items.sort((a, b) => {
    const aDate = outreachDate_(a.timestamp);
    const bDate = outreachDate_(b.timestamp);
    return (bDate ? bDate.getTime() : 0) - (aDate ? aDate.getTime() : 0);
  }));
  return activity;
}

function getOutreachCampaignSettings_() {
  if (__OUTREACH_CAMPAIGN_SETTINGS) return __OUTREACH_CAMPAIGN_SETTINGS;
  const cache = CacheService.getScriptCache();
  const cacheKey = "hub_outreach_campaign_settings_v1";
  try {
    const cached = JSON.parse(cache.get(cacheKey) || "null");
    if (cached && typeof cached === "object") {
      __OUTREACH_CAMPAIGN_SETTINGS = cached;
      return __OUTREACH_CAMPAIGN_SETTINGS;
    }
  } catch (error) {
    console.warn("Outreach campaign-settings cache read failed: " + String(error && error.message || error));
  }
  const sheet = getOutreachSheet_("Campaign Settings");
  const values = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), 2).getValues();
  __OUTREACH_CAMPAIGN_SETTINGS = values.reduce((settings, row) => {
    if (row[0]) settings[String(row[0])] = row[1];
    return settings;
  }, {});
  try {
    cache.put(cacheKey, JSON.stringify(__OUTREACH_CAMPAIGN_SETTINGS), 300);
  } catch (error) {
    console.warn("Outreach campaign-settings cache write failed: " + String(error && error.message || error));
  }
  return __OUTREACH_CAMPAIGN_SETTINGS;
}

function outreachMonthlyContentValues_(row, settings, hasRecentBadgerInvoice) {
  const stage = String(outreachValue_(row, ["next_email", "stage"]) || "Initial").trim();
  const relationship = String(outreachValue_(row, ["relationship"]) || "").trim().toLowerCase();
  const tastingOffer = stage === "Reactivation" || relationship !== "prospect" || hasRecentBadgerInvoice
    ? ""
    : String(settings["Monthly content tasting offer"] || "");
  return {
    "Month": String(settings["Monthly content month"] || ""),
    "Featured Cocktail": String(settings["Monthly content featured cocktail"] || ""),
    "Second Cocktail": String(settings["Monthly content second cocktail"] || ""),
    "Tasting Offer": tastingOffer,
    "Cocktail List Offer": String(settings["Monthly content cocktail-list offer"] || ""),
  };
}

function outreachRecentBadgerInvoiceAccountIds_() {
  if (__OUTREACH_RECENT_BADGER_INVOICE_ACCOUNT_IDS) return __OUTREACH_RECENT_BADGER_INVOICE_ACCOUNT_IDS;
  try {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const directoryRows = getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME));
    const accountIds = new Set(directoryRows.map(row => String(row.account_id || "").trim()).filter(Boolean));
    const accountsByBusiness = new Map();
    directoryRows.forEach(row => {
      const key = normalizeCustomerMatchKey_(outreachValue_(row, ["business", "business_name"]));
      const accountId = String(row.account_id || "").trim();
      if (!key || !accountId) return;
      if (!accountsByBusiness.has(key)) accountsByBusiness.set(key, new Set());
      accountsByBusiness.get(key).add(accountId);
    });
    const orderAccountsByInvoice = new Map();
    const ordersSheet = getOutreachSs_().getSheetByName(ONLINE_ORDER_REQUESTS_SHEET_NAME);
    if (ordersSheet && ordersSheet.getLastRow() > 1) {
      getAllRowsAsObjects_(ordersSheet).forEach(order => {
        const invoiceKey = normalizeBadgerInvoiceNumber_(order.badger_invoice_number);
        const accountId = String(order.account_id || "").trim();
        if (!invoiceKey || !accountId) return;
        if (!orderAccountsByInvoice.has(invoiceKey)) orderAccountsByInvoice.set(invoiceKey, new Set());
        orderAccountsByInvoice.get(invoiceKey).add(accountId);
      });
    }
    const aliases = readBadgerCustomerAliases_();
    const locationsByInvoiceName = new Map();
    cachedBadgerLocationNames_(false).forEach(item => {
      const invoiceKey = normalizeCustomerMatchKey_(item.invoice_name);
      const publicKey = normalizeCustomerMatchKey_(item.public_name);
      if (!invoiceKey || !publicKey) return;
      if (!locationsByInvoiceName.has(invoiceKey)) locationsByInvoiceName.set(invoiceKey, new Set());
      locationsByInvoiceName.get(invoiceKey).add(publicKey);
    });
    const links = readBadgerInvoiceLinks_();
    const recent = new Set();
    // How each account was matched: "strong" (explicit link, order link or learned alias) or
    // "name" (Badger location name or business name only). The order-online invite adds
    // people on this basis: strong matches always, name-only matches only on a row whose
    // Relationship shows customer history. A name shared by two Directory accounts matches neither.
    const strong = new Set();
    const nameOnly = new Map();
    let unplaced = 0;
    cachedBadgerInvoices_(false).forEach(invoice => {
      const invoiceDate = outreachDate_(invoice.invoice_date);
      if (!invoiceDate || invoiceDate.getTime() < cutoff.getTime() || invoice.is_void) return;
      const invoiceKey = normalizeBadgerInvoiceNumber_(invoice.invoice_number);
      const explicit = links.get(invoiceKey);
      if (["void", "ignored"].includes(String(explicit?.match_method || "").trim().toLowerCase())) return;
      let accountId = String(explicit?.account_id || "").trim();
      const ordered = orderAccountsByInvoice.get(invoiceKey) || new Set();
      if (!accountId && ordered.size > 1) return;
      if (!accountId && ordered.size === 1) accountId = Array.from(ordered)[0];
      const customerKey = normalizeCustomerMatchKey_(invoice.customer_name);
      const strongMatch = !!accountId;
      if (!accountId && customerKey) {
        const exactAlias = aliases.by_name.get(canonicalBadgerAliasName_(invoice.customer_name));
        const looseAliasAccounts = Array.from(aliases.by_key.get(customerKey) || []);
        if (exactAlias && !exactAlias.ambiguous) accountId = String(exactAlias.account_id || "").trim();
        else if (looseAliasAccounts.length === 1) accountId = String(looseAliasAccounts[0] || "").trim();
      }
      const aliasMatch = !strongMatch && !!accountId;
      if (!accountId && customerKey) {
        const locationKeys = locationsByInvoiceName.get(customerKey) || new Set();
        if (locationKeys.size === 1) {
          const candidates = Array.from(accountsByBusiness.get(Array.from(locationKeys)[0]) || []);
          if (candidates.length === 1) accountId = candidates[0];
        }
      }
      if (!accountId && customerKey) {
        const candidates = Array.from(accountsByBusiness.get(customerKey) || []);
        if (candidates.length === 1) accountId = candidates[0];
      }
      if (accountId && accountIds.has(accountId)) {
        recent.add(accountId);
        if (strongMatch || aliasMatch) strong.add(accountId);
        else nameOnly.set(accountId, String(invoice.customer_name || ""));
      } else {
        unplaced += 1;
      }
    });
    strong.forEach(accountId => nameOnly.delete(accountId));
    __OUTREACH_RECENT_BADGER_MATCHES = { strong:strong, name_only:nameOnly, unplaced_invoices:unplaced };
    __OUTREACH_RECENT_BADGER_INVOICE_ACCOUNT_IDS = recent;
    return recent;
  } catch (error) {
    console.warn("Badger invoice lookup failed for outreach tasting eligibility; suppressing tasting offers: " + String(error && error.message || error));
    __OUTREACH_RECENT_BADGER_INVOICE_LOOKUP_FAILED = true;
    __OUTREACH_RECENT_BADGER_INVOICE_ACCOUNT_IDS = new Set();
    return __OUTREACH_RECENT_BADGER_INVOICE_ACCOUNT_IDS;
  }
}

function outreachHasRecentBadgerInvoice_(accountId) {
  const id = String(accountId || "").trim();
  const recent = outreachRecentBadgerInvoiceAccountIds_();
  return __OUTREACH_RECENT_BADGER_INVOICE_LOOKUP_FAILED || (!!id && recent.has(id));
}

function outreachRowsMatchingCell_(sheet, headerNames, value) {
  const target = String(value || "").trim();
  if (!sheet || !target || sheet.getLastRow() < 2) return [];
  const headers = getHeaderMap_(sheet);
  const headerName = headerNames.map(normalizeHeader_).find(name => headers[name] !== undefined);
  if (headerName === undefined) return [];
  const matches = sheet.getRange(2, headers[headerName] + 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(target)
    .matchCase(false)
    .matchEntireCell(true)
    .findAll();
  const keys = Object.keys(headers);
  return matches.map(match => {
    const values = sheet.getRange(match.getRow(), 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = {};
    keys.forEach(key => row[key] = values[headers[key]]);
    row.__source_row = match.getRow();
    return row;
  });
}

function apiRecordEmailEngagement_(p) {
  if (!p || String(p.event_type || "") !== "click") throw new Error("Only click engagement may be recorded.");
  const target = String(p.target || "").trim();
  if (!["sell_sheet", "application"].includes(target)) throw new Error("Unknown email-link target.");
  const accountId = String(p.account_id || "").trim();
  if (!accountId) throw new Error("Missing account ID.");
  const directory = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const accountRows = outreachRowsMatchingCell_(directory, ["account_id", "Account ID"], accountId);
  if (!accountRows.length) throw new Error("Account not found.");
  const engagement = getOutreachSs_().getSheetByName(OUTREACH_ENGAGEMENT_SHEET_NAME);
  if (!engagement) throw new Error("Email Engagement tab is missing. Run repairHubStructure first.");
  const headers = getHeaderMap_(engagement);
  const directoryRow = accountRows[0];
  const now = new Date();
  const recentDuplicate = outreachRowsMatchingCell_(engagement, ["account_id", "Account ID"], accountId).some(row => {
    if (String(row.event_type || "").trim().toLowerCase() !== "click") return false;
    if (headers.target !== undefined && String(row.target || "").trim() !== target) return false;
    const eventAt = outreachDate_(row.event_at);
    return !!eventAt && now.getTime() - eventAt.getTime() >= 0 && now.getTime() - eventAt.getTime() < 5000;
  });
  if (recentDuplicate) return { recorded:false, duplicate:true };
  const sentAt = outreachDate_(outreachValue_(directoryRow, ["last_emailed"]));
  const possibleScanner = !!sentAt && now.getTime() - sentAt.getTime() >= 0 && now.getTime() - sentAt.getTime() < 60000;
  const values = Array(engagement.getLastColumn()).fill("");
  const set = (key, value) => { if (headers[key] !== undefined) values[headers[key]] = value; };
  set("event_id", permanentId_("ENG"));
  set("business_name", outreachValue_(directoryRow, ["business", "business_name"]));
  set("email", outreachValue_(directoryRow, ["email", "email_address"]));
  set("message_stage", String(p.stage || "").trim());
  set("account_id", accountId);
  set("source_row", directoryRow.__source_row || "");
  set("event_type", "click");
  set("event_at", now);
  set("source", "Email link");
  set("target", target);
  set("stage", String(p.stage || "").trim());
  set("link_url", target === "sell_sheet" ? "Sell sheet" : "Customer application");
  set("confidence", possibleScanner ? "Possible link scanner" : "Signed link");
  set("app_version", APP_VERSION);
  engagement.appendRow(values);
  if (target === "application" && !possibleScanner) {
    sendCustomerApplicationClickNotification_(directoryRow, directory, String(p.stage || "").trim());
  }
  return { recorded:true };
}

function sendCustomerApplicationClickNotification_(account, directorySheet, stage) {
  const accountId = String(account.account_id || "").trim();
  const business = String(outreachValue_(account, ["business", "business_name"]) || "Unknown business").trim();
  const email = String(outreachValue_(account, ["email", "email_address"]) || "").trim();
  const sourceRow = Number(account.__source_row || 0);
  const reviewUrl = sourceRow
    ? `https://docs.google.com/spreadsheets/d/${OUTREACH_SPREADSHEET_ID}/edit#gid=${directorySheet.getSheetId()}&range=A${sourceRow}`
    : `https://docs.google.com/spreadsheets/d/${OUTREACH_SPREADSHEET_ID}/edit#gid=${directorySheet.getSheetId()}`;
  const stageText = stage || "Not specified";
  const lines = [
    "A recipient opened the wholesale customer application from a tracked outreach link.",
    "",
    `Business: ${business}`,
    `Account ID: ${accountId}`,
    `Email: ${email || "Not available"}`,
    `Outreach stage: ${stageText}`,
    "",
    `Review the customer record: ${reviewUrl}`,
  ];
  const html = [
    "<p>A recipient opened the wholesale customer application from a tracked outreach link.</p>",
    "<ul>",
    `<li><strong>Business:</strong> ${escapeOutreachHtml_(business)}</li>`,
    `<li><strong>Account ID:</strong> ${escapeOutreachHtml_(accountId)}</li>`,
    `<li><strong>Email:</strong> ${escapeOutreachHtml_(email || "Not available")}</li>`,
    `<li><strong>Outreach stage:</strong> ${escapeOutreachHtml_(stageText)}</li>`,
    "</ul>",
    `<p><a href="${escapeOutreachHtml_(reviewUrl)}">Review the customer record</a></p>`,
  ].join("");
  try {
    const message = {
      to: CUSTOMER_APPLICATION_NOTIFICATION_EMAIL,
      name: "Sturgeon Distribution Hub",
      subject: `Wholesale application opened: ${business}`,
      body: lines.join("\n"),
      htmlBody: html,
    };
    if (email) message.replyTo = email;
    MailApp.sendEmail(message);
  } catch (error) {
    // Click tracking must continue even if an optional staff alert cannot be delivered.
    console.warn("Customer application click notification failed: " + String(error && error.message || error));
  }
}

function apiBackfillEngagementDetails_(p) {
  const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another update is in progress. Try again in a moment.");
  try {
    const directory = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const bySourceRow = new Map(getAllRowsAsObjects_(directory).map((row, index) => [String(index + 2), row]));
    const engagement = getOutreachSs_().getSheetByName(OUTREACH_ENGAGEMENT_SHEET_NAME);
    if (!engagement || engagement.getLastRow() < 2) return { message:"No engagement rows to backfill.", updated:0 };
    const h = getHeaderMap_(engagement);
    if (["business_name", "email", "account_id", "source_row"].some(key => h[key] === undefined)) throw new Error("Run Repair Hub Structure before backfilling engagement details.");
    const range = engagement.getRange(2, 1, engagement.getLastRow() - 1, engagement.getLastColumn());
    const values = range.getValues();
    let updated = 0;
    values.forEach(row => {
      const source = bySourceRow.get(String(row[h.source_row] || "").trim());
      if (!source) return;
      let changed = false;
      const fill = (key, value) => { if (!String(row[h[key]] || "").trim() && value) { row[h[key]] = value; changed = true; } };
      fill("business_name", outreachValue_(source, ["business", "business_name"]));
      fill("email", outreachValue_(source, ["email", "email_address"]));
      fill("account_id", source.account_id);
      if (changed) updated += 1;
    });
    if (updated) range.setValues(values);
    appendAudit_("BACKFILL_ENGAGEMENT_DETAILS", "Email Engagement", "", "", actor, OUTREACH_ENGAGEMENT_SHEET_NAME, OUTREACH_SHEET_NAME, "Completed", `${updated} engagement rows updated.`);
    return { message:`${updated} engagement rows updated.`, updated:updated };
  } finally { lock.releaseLock(); }
}

function backfillEngagementDetails() {
  try {
    const result = apiBackfillEngagementDetails_({ staff_name:"Karl (editor)", authenticated_staff_role:"admin" });
    Logger.log(JSON.stringify(result));
    return result;
  } finally {
    bumpReadCacheVersion_();
  }
}

function outreachTargetedActivityMap_(accountId, business) {
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  const accountRows = outreachRowsMatchingCell_(sheet, ["account_id", "Account ID"], accountId);
  const rows = accountRows.length ? accountRows : outreachRowsMatchingCell_(sheet, ["business", "Business Name"], business);
  const activity = new Map();
  rows.forEach(row => {
    const rowBusiness = String(outreachValue_(row, ["business"]) || "").trim();
    if (!rowBusiness) return;
    const rowAccountId = String(row.account_id || "").trim();
    const keys = [`business:${rowBusiness.toLowerCase()}`];
    if (rowAccountId) keys.unshift(`account:${rowAccountId}`);
    const item = {
      timestamp:outreachValue_(row, ["timestamp"]),
      stage:String(outreachValue_(row, ["message_stage", "stage"]) || ""),
      result:String(outreachValue_(row, ["result"]) || ""),
      detail:String(outreachValue_(row, ["error/detail", "error_detail", "detail"]) || ""),
      subject:String(outreachValue_(row, ["subject"]) || ""),
      message_id:String(outreachValue_(row, ["message_id"]) || ""),
      delivered_to:String(outreachValue_(row, ["delivered_to"]) || ""),
      idempotency_token:String(outreachValue_(row, ["idempotency_token"]) || ""),
    };
    keys.forEach(key => {
      if (!activity.has(key)) activity.set(key, []);
      activity.get(key).push(item);
    });
  });
  activity.forEach(items => items.sort((a, b) => {
    const aDate = outreachDate_(a.timestamp);
    const bDate = outreachDate_(b.timestamp);
    return (bDate ? bDate.getTime() : 0) - (aDate ? aDate.getTime() : 0);
  }));
  return activity;
}

function outreachTargetedRows_(sheet, accountId, sourceRow) {
  const accountRows = outreachRowsMatchingCell_(sheet, ["account_id", "Account ID"], accountId);
  return accountRows.length
    ? accountRows
    : outreachRowsMatchingCell_(sheet, ["source_row", "Source Row"], sourceRow);
}

function outreachTargetedDraftMap_(accountId, sourceRow) {
  const sheet = getOutreachDraftSheet_(false);
  const drafts = new Map();
  outreachTargetedRows_(sheet, accountId, sourceRow).forEach(row => {
    const rowSourceRow = Number(row.source_row || 0);
    const rowAccountId = String(row.account_id || "").trim();
    const stage = String(row.message_stage || "Initial").trim();
    if (!rowSourceRow && !rowAccountId) return;
    const draft = {
      subject:String(row.subject || "").trim(),
      body_text:String(row.body_text || "").trim(),
      updated_at:row.updated_at || "",
      updated_by:String(row.updated_by || ""),
    };
    if (rowAccountId) drafts.set(outreachDraftKey_(rowAccountId, stage), draft);
    if (rowSourceRow) drafts.set(outreachDraftKey_(rowSourceRow, stage), draft);
  });
  return drafts;
}

function outreachTargetedProgramMap_(accountId, sourceRow) {
  const sheet = getOutreachSs_().getSheetByName(OUTREACH_PROGRAMS_SHEET_NAME);
  const programs = new Map();
  outreachTargetedRows_(sheet, accountId, sourceRow).forEach(row => {
    const rowSourceRow = Number(row.source_row || 0);
    const rowAccountId = String(row.account_id || "").trim();
    if (!rowSourceRow && !rowAccountId) return;
    const program = {
      newsletter_status:String(row.newsletter_status || "Not invited"),
      newsletter_consent_source:String(row.newsletter_consent_source || ""),
      newsletter_status_date:row.newsletter_status_date || "",
      ordering_status:String(row.ordering_status || "Not offered"),
      ordering_customer_id:String(row.ordering_customer_id || ""),
      ordering_invite_date:row.ordering_invite_date || "",
      ordering_portal_url:String(row.ordering_portal_url || ""),
      notes:String(row.notes || ""),
      updated_at:row.updated_at || "",
    };
    if (rowAccountId) programs.set(rowAccountId, program);
    if (rowSourceRow) programs.set(rowSourceRow, program);
  });
  return programs;
}

function outreachTargetedEngagementMap_(accountId, sourceRow) {
  const sheet = getOutreachSs_().getSheetByName(OUTREACH_ENGAGEMENT_SHEET_NAME);
  const engagement = new Map();
  outreachTargetedRows_(sheet, accountId, sourceRow).forEach(row => {
    const rowSourceRow = Number(row.source_row || 0);
    const rowAccountId = String(row.account_id || "").trim();
    const key = rowAccountId || rowSourceRow;
    if (!key) return;
    if (!engagement.has(key)) {
      engagement.set(key, { open_count:0, last_opened:"", click_count:0, last_clicked:"", last_click_target:"", reply_count:0, bounce_count:0, source:"" });
    }
    const summary = engagement.get(key);
    const eventType = String(row.event_type || "").trim().toLowerCase();
    const eventAt = outreachDate_(row.event_at);
    const newest = (current, candidate) => {
      const currentDate = outreachDate_(current);
      if (!candidate) return current;
      return !currentDate || candidate.getTime() > currentDate.getTime() ? candidate : current;
    };
    if (eventType === "open") { summary.open_count += 1; summary.last_opened = newest(summary.last_opened, eventAt); }
    else if (eventType === "click") {
      summary.click_count += 1;
      const latestClick = newest(summary.last_clicked, eventAt);
      if (latestClick !== summary.last_clicked && row.target) summary.last_click_target = String(row.target);
      summary.last_clicked = latestClick;
    }
    else if (eventType === "reply") summary.reply_count += 1;
    else if (eventType === "bounce") summary.bounce_count += 1;
    if (row.source) summary.source = String(row.source);
  });
  return engagement;
}

function outreachDraftKey_(identityKey, stage) {
  return `${String(identityKey || "").trim()}::${String(stage || "Initial").trim().toLowerCase()}`;
}

function getOutreachDraftSheet_(createIfMissing) {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(OUTREACH_DRAFTS_SHEET_NAME);
  if (sheet) return sheet;
  if (!createIfMissing) return sheet;

  sheet = ss.insertSheet(OUTREACH_DRAFTS_SHEET_NAME);
  const headers = [["Draft Key", "Account ID", "Source Row", "Business Name", "Email", "Message Stage", "Subject", "Body Text", "Updated At", "Updated By", "App Version"]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers)
    .setFontWeight("bold")
    .setBackground("#e5e7eb")
    .setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 170);
  sheet.setColumnWidth(2, 90);
  sheet.setColumnWidth(3, 240);
  sheet.setColumnWidth(4, 220);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 320);
  sheet.setColumnWidth(7, 520);
  sheet.setColumnWidth(8, 160);
  sheet.setColumnWidth(9, 190);
  sheet.setColumnWidth(10, 120);
  sheet.getRange("F:G").setWrap(true).setVerticalAlignment("top");
  return sheet;
}

function outreachDraftMap_() {
  const sheet = getOutreachDraftSheet_(false);
  const drafts = new Map();
  if (!sheet || sheet.getLastRow() < 2) return drafts;
  getAllRowsAsObjects_(sheet).forEach(row => {
    const sourceRow = Number(row.source_row || 0);
    const accountId = String(row.account_id || "").trim();
    const stage = String(row.message_stage || "Initial").trim();
    if (!sourceRow && !accountId) return;
    const draft = {
      subject: String(row.subject || "").trim(),
      body_text: String(row.body_text || "").trim(),
      updated_at: row.updated_at || "",
      updated_by: String(row.updated_by || ""),
    };
    if (accountId) drafts.set(outreachDraftKey_(accountId, stage), draft);
    if (sourceRow) drafts.set(outreachDraftKey_(sourceRow, stage), draft);
  });
  return drafts;
}

function getOutreachProgramSheet_(createIfMissing) {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(OUTREACH_PROGRAMS_SHEET_NAME);
  if (sheet) {
    ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER]);
    return sheet;
  }
  if (!createIfMissing) return sheet;

  sheet = ss.insertSheet(OUTREACH_PROGRAMS_SHEET_NAME);
  const headers = [[
    "Program Key", "Account ID", "Source Row", "Business Name", "Email",
    "Newsletter Status", "Newsletter Consent Source", "Newsletter Status Date",
    "Ordering Status", "Ordering Customer ID", "Ordering Invite Date", "Ordering Portal URL",
    "Updated At", "Updated By", "Notes", "App Version"
  ]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers)
    .setFontWeight("bold")
    .setBackground("#e5e7eb")
    .setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  [150, 90, 240, 220, 150, 240, 150, 150, 170, 150, 280, 160, 190, 320, 120]
    .forEach((width, index) => sheet.setColumnWidth(index + 1, width));
  sheet.getRange("F:F").setWrap(true).setVerticalAlignment("top");
  sheet.getRange("N:N").setWrap(true).setVerticalAlignment("top");
  return sheet;
}

function outreachProgramMap_() {
  const sheet = getOutreachProgramSheet_(false);
  const programs = new Map();
  if (!sheet || sheet.getLastRow() < 2) return programs;
  getAllRowsAsObjects_(sheet).forEach(row => {
    const sourceRow = Number(row.source_row || 0);
    const accountId = String(row.account_id || "").trim();
    if (!sourceRow && !accountId) return;
    const program = {
      newsletter_status: String(row.newsletter_status || "Not invited"),
      newsletter_consent_source: String(row.newsletter_consent_source || ""),
      newsletter_status_date: row.newsletter_status_date || "",
      ordering_status: String(row.ordering_status || "Not offered"),
      ordering_customer_id: String(row.ordering_customer_id || ""),
      ordering_invite_date: row.ordering_invite_date || "",
      ordering_portal_url: String(row.ordering_portal_url || ""),
      notes: String(row.notes || ""),
      updated_at: row.updated_at || "",
    };
    if (accountId) programs.set(accountId, program);
    if (sourceRow) programs.set(sourceRow, program);
  });
  return programs;
}

function outreachEngagementMap_() {
  const sheet = getOutreachSs_().getSheetByName(OUTREACH_ENGAGEMENT_SHEET_NAME);
  const engagement = new Map();
  if (!sheet || sheet.getLastRow() < 2) return engagement;
  getAllRowsAsObjects_(sheet).forEach(row => {
    const sourceRow = Number(row.source_row || 0);
    const accountId = String(row.account_id || "").trim();
    const keys = accountId ? [accountId, sourceRow].filter(Boolean) : [sourceRow];
    if (!keys.length) return;
    const primaryKey = keys[0];
    if (!engagement.has(primaryKey)) {
      engagement.set(primaryKey, {
        open_count:0,
        last_opened:"",
        click_count:0,
        last_clicked:"",
        last_click_target:"",
        reply_count:0,
        bounce_count:0,
        source:"",
      });
    }
    const summary = engagement.get(primaryKey);
    keys.forEach(key => engagement.set(key, summary));
    const eventType = String(row.event_type || "").trim().toLowerCase();
    const eventAt = outreachDate_(row.event_at);
    const newest = (current, candidate) => {
      const currentDate = outreachDate_(current);
      if (!candidate) return current;
      return !currentDate || candidate.getTime() > currentDate.getTime() ? candidate : current;
    };
    if (eventType === "open") {
      summary.open_count += 1;
      summary.last_opened = newest(summary.last_opened, eventAt);
    } else if (eventType === "click") {
      summary.click_count += 1;
      const latestClick = newest(summary.last_clicked, eventAt);
      if (latestClick !== summary.last_clicked && row.target) summary.last_click_target = String(row.target);
      summary.last_clicked = latestClick;
    } else if (eventType === "reply") summary.reply_count += 1;
    else if (eventType === "bounce") summary.bounce_count += 1;
    if (row.source) summary.source = String(row.source);
  });
  return engagement;
}

function newsletterContacts_() {
  const sheet = getOutreachSs_().getSheetByName(NEWSLETTER_CONTACTS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return getAllRowsAsObjects_(sheet).filter(row => row.email).map(row => ({
    contact_id:String(row.contact_id || ""),
    account_id:String(row.account_id || ""),
    name:String(row.name || ""),
    email:String(row.email || ""),
    organization:String(row.organization || ""),
    relationship_type:String(row.relationship_type || "Other"),
    status:String(row.status || "Candidate"),
    consent_source:String(row.consent_source || ""),
    consent_date:row.consent_date || "",
    source_row:row.source_row || "",
    source_business:String(row.source_business || ""),
    topics:String(row.topics || ""),
    notes:String(row.notes || ""),
    updated_at:row.updated_at || "",
  })).sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));
}

function outreachRecentSendIndex_() {
  if (__OUTREACH_RECENT_SEND_INDEX) return __OUTREACH_RECENT_SEND_INDEX;
  const index = new Map();
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return (__OUTREACH_RECENT_SEND_INDEX = index);
  getAllRowsAsObjects_(sheet).forEach(row => {
    const recipient = String(outreachValue_(row, ["intended_recipient", "delivered_to", "email", "email_address"]) || "").trim().toLowerCase();
    const result = String(outreachValue_(row, ["result"]) || "").toUpperCase();
    if (!recipient || !result.includes("SENT") || result.includes("TEST")) return;
    const stage = String(outreachValue_(row, ["message_stage", "stage"]) || "").trim();
    const kind = stage === OUTREACH_COCKTAIL_LIST_STAGE ? "cocktail" : "sales";
    const entry = index.get(recipient) || { sales_sent_at:"", cocktail_sent_at:"", sales_undated:false, cocktail_undated:false };
    const sentAt = outreachDate_(outreachValue_(row, ["timestamp", "sent_at"]));
    if (!sentAt) entry[`${kind}_undated`] = true; // An unknown send time is unsafe to repeat.
    else if (!entry[`${kind}_sent_at`] || sentAt.getTime() > entry[`${kind}_sent_at`].getTime()) entry[`${kind}_sent_at`] = sentAt;
    index.set(recipient, entry);
  });
  return (__OUTREACH_RECENT_SEND_INDEX = index);
}

function outreachNoteRecentSend_(email, kind, sentAt) {
  // Do not create a partial index: when no cooldown check has needed it, a later lookup must still read Activity Log.
  if (!__OUTREACH_RECENT_SEND_INDEX) return;
  const recipient = String(email || "").trim().toLowerCase();
  const normalizedKind = kind === "cocktail" ? "cocktail" : "sales";
  const date = outreachDate_(sentAt) || new Date();
  if (!recipient) return;
  const entry = __OUTREACH_RECENT_SEND_INDEX.get(recipient) || { sales_sent_at:"", cocktail_sent_at:"", sales_undated:false, cocktail_undated:false };
  if (!entry[`${normalizedKind}_sent_at`] || date.getTime() > entry[`${normalizedKind}_sent_at`].getTime()) entry[`${normalizedKind}_sent_at`] = date;
  __OUTREACH_RECENT_SEND_INDEX.set(recipient, entry);
}

function outreachRecentSendToEmail_(email, stagePredicate, days, now) {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return false;
  const cutoff = new Date(now || new Date());
  cutoff.setDate(cutoff.getDate() - Number(days || 0));
  const entry = outreachRecentSendIndex_().get(target);
  if (!entry) return false;
  return ["sales", "cocktail"].some(kind => {
    const stage = kind === "cocktail" ? OUTREACH_COCKTAIL_LIST_STAGE : "Sales outreach";
    if (!stagePredicate(stage)) return false;
    return entry[`${kind}_undated`] || (!!entry[`${kind}_sent_at`] && entry[`${kind}_sent_at`].getTime() >= cutoff.getTime());
  });
}

function outreachCrossSendCooldownReason_(email, sendingCocktailList) {
  const recentlySent = outreachRecentSendToEmail_(email,
    stage => sendingCocktailList ? stage !== OUTREACH_COCKTAIL_LIST_STAGE : stage === OUTREACH_COCKTAIL_LIST_STAGE,
    OUTREACH_COCKTAIL_LIST_GAP_DAYS);
  return recentlySent ? `Another ${sendingCocktailList ? "sales outreach email" : "cocktail list email"} was sent within the last ${OUTREACH_COCKTAIL_LIST_GAP_DAYS} days` : "";
}

function cocktailListMessage_(record, settings) {
  if (!String(settings["Physical mailing address"] || "").trim()) throw new Error("Physical mailing address is required before previewing or creating a Cocktail list campaign.");
  const values = Object.assign({
    "First Name":String(record.contact || record.name || "there").trim().split(/\s+/)[0] || "there",
    "Business Name":outreachDisplayBusinessName_(record.business || record.organization || ""),
    "Physical Address":String(settings["Physical mailing address"] || ""),
  }, outreachMonthlyContentValues_({ next_email:OUTREACH_COCKTAIL_LIST_STAGE, relationship:"" }, settings, true));
  values["Tasting Offer"] = "";
  const rendered = key => renderOutreachTemplate_(String(settings[key] || ""), values, true);
  const body = ["Cocktail list intro", "Cocktail list featured cocktail", "Cocktail list distillery line", "Cocktail list reply-to-order line"]
    .map(key => rendered(key)).filter(Boolean).map(line => `<p>${line}</p>`).join("");
  const footer = `<p>${escapeOutreachHtml_(values["Physical Address"])}</p><p>Reply stop to unsubscribe.</p>`;
  return {
    stage:OUTREACH_COCKTAIL_LIST_STAGE,
    subject:renderOutreachTemplate_(String(settings["Cocktail list subject"] || ""), values, false),
    body_text:outreachHtmlToPlainText_(body),
    html:body + footer,
    footer_html:footer,
  };
}

function outreachSegmentTemplateKey_(segment) {
  const value = String(segment || "").trim().toUpperCase();
  if (value.indexOf("A ") === 0) return "A";
  if (value.indexOf("B ") === 0) return "B";
  if (value.indexOf("D1") === 0 || value.indexOf("D2") === 0) return "D";
  return "C";
}

function escapeOutreachHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function outreachDisplayBusinessName_(value) {
  const text = String(value || "").trim();
  if (!text || text !== text.toUpperCase()) return text;
  return text.split(/\s+/).map(word => {
    if (/^(EAA|HQ|BP|VFW|LLC|USA|II|III|IV|TJ'S|T&O)$/i.test(word)) return word.toUpperCase();
    if (/^X-GOLF$/i.test(word)) return "X-Golf";
    const normalized = word.toLowerCase().replace(/(^|[-\/&])([a-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase());
    return normalized.replace(/'([a-z])/g, (match, letter, index, source) =>
      `'${letter === "s" && index + match.length === source.length ? "s" : letter.toUpperCase()}`
    );
  }).join(" ");
}

function renderOutreachTemplate_(template, values, htmlMode) {
  return String(template || "").replace(/{{\s*([^}]+?)\s*}}/g, (_, key) => {
    const value = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : "";
    const safeHtml = key === "Sell Sheet Link" || key === "Website Footer";
    return htmlMode && !safeHtml ? escapeOutreachHtml_(value) : String(value);
  });
}

function outreachTemplateParts_(template) {
  const source = String(template || "");
  const marker = "{{Sell Sheet Link}}";
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return { body:source, footer:"" };
  return {
    body: source.slice(0, markerIndex),
    footer: source.slice(markerIndex),
  };
}

function outreachHtmlToPlainText_(html) {
  return String(html || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function outreachPlainTextToHtml_(text) {
  return String(text || "").trim().split(/\n{2,}/).filter(Boolean).map(block =>
    `<p>${escapeOutreachHtml_(block).replace(/\n/g, "<br>")}</p>`
  ).join("");
}

function outreachTrackingSignature_(target, accountId, stage, secret) {
  const bytes = Utilities.computeHmacSha256Signature(`${target}\n${accountId}\n${stage}`, secret);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "");
}

function outreachTrackingUrl_(target, accountId, stage, settings, extras, testMode) {
  const baseUrl = String(settings["Tracking base URL"] || "").trim();
  const secret = PropertiesService.getScriptProperties().getProperty("TRACKING_LINK_SECRET") || "";
  if (!/^https:\/\/\S+$/i.test(baseUrl) || !secret || !accountId) return "";
  const params = Object.assign({ t:target, a:accountId, s:stage, k:outreachTrackingSignature_(target, accountId, stage, secret) }, extras || {});
  if (testMode) params.x = "test";
  return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${Object.keys(params).map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key] || "")}`).join("&")}`;
}

function outreachMessage_(row, settings, draft, testMode) {
  const stage = String(outreachValue_(row, ["next_email", "stage"]) || "Initial");
  let keys;
  if (stage === "Reactivation") keys = ["Reactivation subject", "Reactivation HTML"];
  else if (stage === "Follow-up 1") keys = ["Follow-up 1 subject", "Follow-up 1 HTML"];
  else if (stage === "Follow-up 2") keys = ["Follow-up 2 subject", "Follow-up 2 HTML"];
  else {
    const segment = outreachSegmentTemplateKey_(outreachValue_(row, ["segment"]));
    keys = [`Segment ${segment} subject`, `Segment ${segment} HTML`];
  }

  const contact = String(outreachValue_(row, ["contact", "contact_name", "contact_person"]) || "").trim();
  const sellSheet = String(settings["Wholesale sell-sheet URL"] || "").trim();
  const applicationUrl = String(settings["Customer application URL"] || "").trim();
  const website = String(settings["Website URL"] || "").trim();
  const logo = String(settings["Logo URL"] || "").trim();
  const accountId = String(row.account_id || "").trim();
  const business = String(outreachValue_(row, ["business", "business_name"]) || "").trim();
  const email = String(outreachValue_(row, ["email", "email_address"]) || "").trim();
  const trackedSellSheet = outreachTrackingUrl_("sell_sheet", accountId, stage, settings, null, testMode);
  const directApplication = /^https:\/\/\S+$/i.test(applicationUrl)
    ? `${applicationUrl}${applicationUrl.includes("?") ? "&" : "?"}account_id=${encodeURIComponent(accountId)}&business=${encodeURIComponent(business)}&email=${encodeURIComponent(email)}`
    : "";
  const trackedApplication = outreachTrackingUrl_("application", accountId, stage, settings, { business:business, email:email }, testMode);
  const applicationSentence = stage === "Reactivation"
    ? `If you'd like to set up online ordering with us, <a href="${escapeOutreachHtml_(trackedApplication || directApplication)}">complete our short wholesale account form</a>. It takes about five minutes.`
    : `If you would like to get the account setup started, <a href="${escapeOutreachHtml_(trackedApplication || directApplication)}">complete our short wholesale customer application</a>.`;
  const applicationLink = (trackedApplication || directApplication)
    ? `<p>${applicationSentence}</p>`
    : "";
  const template = String(settings[keys[1]] || "");
  // Only pay for the Badger lookup when the subject or body actually uses the offer. When it is not used,
  // pass "has recent invoice" so the value stays blank rather than defaulting to the offer text.
  const needsTastingOffer = /\{\{\s*Tasting Offer\s*\}\}/i.test(`${String(settings[keys[0]] || "")}\n${template}`);
  const values = Object.assign({
    "First Name": contact ? contact.split(/\s+/)[0] : "there",
    "Business Name": outreachDisplayBusinessName_(outreachValue_(row, ["business", "business_name"]) || "your business"),
    "City": String(outreachValue_(row, ["city"]) || ""),
    "Segment": String(outreachValue_(row, ["segment"]) || ""),
    "Wave": String(outreachValue_(row, ["wave"]) || ""),
    "Relationship": String(outreachValue_(row, ["relationship"]) || "Prospect"),
    "Last Order": String(outreachValue_(row, ["last_order"]) || ""),
    "Physical Address": String(settings["Physical mailing address"] || ""),
    "Website Footer": website && logo
      ? `<a href="${escapeOutreachHtml_(website)}"><img src="${escapeOutreachHtml_(logo)}" alt="Sturgeon Spirits"></a>`
      : "",
    "Sell Sheet Link": (sellSheet ? `<p><a href="${escapeOutreachHtml_(trackedSellSheet || sellSheet)}">View our current wholesale sell sheet</a></p>` : "") + applicationLink,
  }, outreachMonthlyContentValues_(row, settings, needsTastingOffer ? outreachHasRecentBadgerInvoice_(accountId) : true));
  const parts = outreachTemplateParts_(template);
  const templateSubject = renderOutreachTemplate_(settings[keys[0]], values, false);
  const templateBodyHtml = renderOutreachTemplate_(parts.body, values, true);
  const footerHtml = renderOutreachTemplate_(parts.footer, values, true);
  const draftBody = String(draft?.body_text || "").trim();
  return {
    stage: stage,
    subject: String(draft?.subject || "").trim() || templateSubject,
    body_text: draftBody || outreachHtmlToPlainText_(templateBodyHtml),
    html: draftBody ? outreachPlainTextToHtml_(draftBody) + footerHtml : templateBodyHtml + footerHtml,
    footer_html: footerHtml,
    has_saved_draft: !!draft,
    draft_updated_at: draft?.updated_at || "",
  };
}

function outreachFieldLabel_(key) {
  return String(key || "")
    .replace(/[_\-\/]+/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function outreachFields_(row) {
  return Object.keys(row).map(key => ({
    key: key,
    label: outreachFieldLabel_(key),
    value: row[key],
  })).filter(field => field.value !== "" && field.value !== null && field.value !== undefined);
}

const OUTREACH_EDITABLE_FIELD_KEYS = {
  contact: ["contact", "contact_name", "contact_person", "first_name"],
  email: ["email", "email_address"],
  phone: ["phone", "phone_number", "telephone"],
  website: ["website", "website_url", "url"],
  address: ["address", "street", "street_address", "address_1"],
  city: ["city", "town"],
  state: ["state"],
  postal_code: ["zip", "zip_code", "postal_code"],
  craft_spirit_fit: ["craft-spirit_fit_(1–5)", "craft-spirit_fit_(1-5)", "craft_spirit_fit", "craft_spirit_fit_(1–5)"],
  priority: ["priority"],
  miles: ["miles", "distance", "distance_miles"],
  rating_basis: ["rating_basis"],
  email_confidence: ["email_confidence"],
};

function outreachEditableFields_(row) {
  const editable = {};
  Object.keys(OUTREACH_EDITABLE_FIELD_KEYS).forEach(canonical => {
    const actual = OUTREACH_EDITABLE_FIELD_KEYS[canonical].find(key => Object.prototype.hasOwnProperty.call(row, key));
    if (actual) editable[canonical] = actual;
  });
  return editable;
}

function outreachRecord_(row, sourceRow, activityMap, settings, draftMap, programMap, engagementMap) {
  const business = String(outreachValue_(row, ["business", "business_name"]) || "").trim();
  const contact = String(outreachValue_(row, ["contact", "contact_name", "contact_person", "first_name"]) || "").trim();
  const status = String(outreachValue_(row, ["status"]) || "Not contacted").trim();
  const relationship = String(outreachValue_(row, ["relationship"]) || "").trim();
  const accountId = String(row.account_id || "").trim();
  const messageStage = String(outreachValue_(row, ["next_email", "stage"]) || "Initial").trim();
  const draft = draftMap.get(outreachDraftKey_(accountId || sourceRow, messageStage)) || draftMap.get(outreachDraftKey_(sourceRow, messageStage));
  const message = outreachMessage_(row, settings, draft);
  const city = String(outreachValue_(row, ["city", "town"]) || "").trim();
  const state = String(outreachValue_(row, ["state"]) || "").trim();
  const postalCode = String(outreachValue_(row, ["zip", "zip_code", "postal_code"]) || "").trim();
  const street = String(outreachValue_(row, ["address", "street", "street_address", "address_1"]) || "").trim();
  const address = [street, city, state, postalCode].filter(Boolean).join(", ");
  const loggedActivity = (activityMap.get(`account:${accountId}`) || activityMap.get(`business:${business.toLowerCase()}`) || []).slice();
  const sourceMessageId = String(outreachValue_(row, ["message_id", "zoho_message_id"]) || "").trim();
  const sourceLastEmailed = outreachValue_(row, ["last_emailed", "last_email"]);
  if (sourceLastEmailed && !loggedActivity.some(item => item.message_id && item.message_id === sourceMessageId)) {
    loggedActivity.push({
      timestamp:sourceLastEmailed,
      stage:messageStage === "Initial" ? "Initial" : "Prior outreach",
      result:"SOURCE LEAD SENT",
      detail:"Historical send recorded on the source lead.",
      message_id:sourceMessageId,
      delivered_to:String(outreachValue_(row, ["email", "email_address"]) || "").trim(),
    });
  }
  loggedActivity.sort((a, b) => recordTimestamp_(b.timestamp) - recordTimestamp_(a.timestamp));
  const record = {
    account_id: accountId,
    source_row: sourceRow,
    business: business,
    display_business: outreachDisplayBusinessName_(business),
    contact: contact,
    email: String(outreachValue_(row, ["email", "email_address"]) || "").trim(),
    phone: String(outreachValue_(row, ["phone", "phone_number", "telephone"]) || "").trim(),
    website: String(outreachValue_(row, ["website", "website_url", "url"]) || "").trim(),
    address: address,
    city: city,
    state: state,
    postal_code: postalCode,
    queue: String(outreachValue_(row, ["queue", "queue?"]) || "").trim(),
    next_email: String(outreachValue_(row, ["next_email"]) || "").trim(),
    status: status,
    priority: String(outreachValue_(row, ["priority"]) || "").trim(),
    last_emailed: outreachValue_(row, ["last_emailed", "last_email"]),
    message_id: sourceMessageId,
    next_follow_up: outreachValue_(row, ["next_follow-up", "next_follow_up"]),
    outcome: String(outreachValue_(row, ["outcome"]) || "").trim(),
    notes: String(outreachValue_(row, ["notes"]) || "").trim(),
    do_not_email: toBool_(outreachValue_(row, ["do_not_email", "do_not_contact"])),
    segment: String(outreachValue_(row, ["segment"]) || "").trim(),
    wave: String(outreachValue_(row, ["wave"]) || "").trim(),
    top_50: toBool_(outreachValue_(row, ["top50", "top_50", "top_50?"])),
    craft_spirit_fit: Number(outreachValue_(row, ["craft-spirit_fit_(1–5)", "craft-spirit_fit_(1-5)", "craft_spirit_fit", "craft_spirit_fit_(1–5)"]) || 0),
    rating_basis: String(outreachValue_(row, ["rating_basis"]) || "").trim(),
    miles: outreachMiles_(outreachValue_(row, ["miles", "distance", "distance_miles"])),
    county: String(outreachValue_(row, ["county"]) || "").trim(),
    license: String(outreachValue_(row, ["license"]) || "").trim(),
    lead_source: String(outreachValue_(row, ["lead_source"]) || "").trim(),
    email_source_url: String(outreachValue_(row, ["email_source_url"]) || "").trim(),
    email_confidence: String(outreachValue_(row, ["email_confidence"]) || "").trim(),
    relationship: relationship,
    last_order: outreachValue_(row, ["last_order"]),
    order_count: outreachValue_(row, ["order_count"]),
    lifetime_invoiced: outreachValue_(row, ["lifetime_invoiced"]),
    customer_source: String(outreachValue_(row, ["customer_source"]) || "").trim(),
    editable_fields: outreachEditableFields_(row),
    fields: outreachFields_(row),
    subject: message.subject || `A Wisconsin spirits option for ${outreachDisplayBusinessName_(business)}`,
    body_text: message.body_text,
    preview_html: message.html,
    message_footer_html: message.footer_html,
    has_saved_draft: message.has_saved_draft,
    draft_updated_at: message.draft_updated_at,
    programs: programMap.get(accountId) || programMap.get(sourceRow) || {
      newsletter_status:"Not invited",
      newsletter_consent_source:"",
      newsletter_status_date:"",
      ordering_status:"Not offered",
      ordering_customer_id:"",
      ordering_invite_date:"",
      ordering_portal_url:"",
      notes:"",
      updated_at:"",
    },
    email_engagement: engagementMap.get(accountId) || engagementMap.get(sourceRow) || {
      open_count:0,
      last_opened:"",
      click_count:0,
      last_clicked:"",
      last_click_target:"",
      reply_count:0,
      bounce_count:0,
      source:"Not connected",
    },
    activity: loggedActivity.slice(0, 10),
  };
  record.weekly_exclusion_reasons = outreachWeeklyExclusionReasons_(record);
  record.weekly_eligible = record.weekly_exclusion_reasons.length === 0;
  return record;
}

function outreachSlimRecord_(row, sourceRow, draftMap, programMap, engagementMap) {
  const accountId = String(row.account_id || "").trim();
  const stage = String(outreachValue_(row, ["next_email", "stage"]) || "Initial").trim();
  const program = programMap.get(accountId) || programMap.get(sourceRow) || {};
  const engagement = engagementMap.get(accountId) || engagementMap.get(sourceRow) || {};
  const searchText = [
    outreachValue_(row, ["address", "street", "street_address", "address_1"]),
    outreachValue_(row, ["zip", "zip_code", "postal_code"]),
    outreachValue_(row, ["county"]),
    outreachValue_(row, ["license"]),
    outreachValue_(row, ["segment"]),
    outreachValue_(row, ["wave"]),
    outreachValue_(row, ["lead_source"]),
    outreachValue_(row, ["website", "website_url", "url"]),
    String(outreachValue_(row, ["notes"]) || "").slice(0, 200),
  ].map(value => String(value || "").trim()).filter(Boolean).join(" ").toLowerCase();
  const record = {
    account_id:accountId,
    source_row:sourceRow,
    business:String(outreachValue_(row, ["business", "business_name"]) || "").trim(),
    display_business:outreachDisplayBusinessName_(outreachValue_(row, ["business", "business_name"]) || ""),
    contact:String(outreachValue_(row, ["contact", "contact_name", "contact_person", "first_name"]) || "").trim(),
    email:String(outreachValue_(row, ["email", "email_address"]) || "").trim(),
    phone:String(outreachValue_(row, ["phone", "phone_number", "telephone"]) || "").trim(),
    city:String(outreachValue_(row, ["city", "town"]) || "").trim(),
    state:String(outreachValue_(row, ["state"]) || "").trim(),
    status:String(outreachValue_(row, ["status"]) || "Not contacted").trim(),
    next_email:stage,
    priority:String(outreachValue_(row, ["priority"]) || "").trim(),
    next_follow_up:outreachValue_(row, ["next_follow-up", "next_follow_up"]),
    last_emailed:outreachValue_(row, ["last_emailed", "last_email"]),
    outcome:String(outreachValue_(row, ["outcome"]) || "").trim(),
    do_not_email:toBool_(outreachValue_(row, ["do_not_email", "do_not_contact"])),
    segment:String(outreachValue_(row, ["segment"]) || "").trim(),
    wave:String(outreachValue_(row, ["wave"]) || "").trim(),
    top_50:toBool_(outreachValue_(row, ["top50", "top_50", "top_50?"])),
    craft_spirit_fit:Number(outreachValue_(row, ["craft-spirit_fit_(1–5)", "craft-spirit_fit_(1-5)", "craft_spirit_fit", "craft_spirit_fit_(1–5)"]) || 0),
    miles:outreachMiles_(outreachValue_(row, ["miles", "distance", "distance_miles"])),
    county:String(outreachValue_(row, ["county"]) || "").trim(),
    email_confidence:String(outreachValue_(row, ["email_confidence"]) || "").trim(),
    relationship:String(outreachValue_(row, ["relationship"]) || "").trim(),
    newsletter_status:String(program.newsletter_status || "Not invited"),
    ordering_status:String(program.ordering_status || "Not offered"),
    opened:Number(engagement.open_count || 0) > 0,
    clicked:Number(engagement.click_count || 0) > 0,
    search_text:searchText,
    has_saved_draft:draftMap.has(outreachDraftKey_(accountId || sourceRow, stage)),
    // Used only while assembling the server-side Today queue; omitted from slim JSON.
    queue:String(outreachValue_(row, ["queue", "queue?"]) || "").trim(),
  };
  record.weekly_exclusion_reasons = outreachWeeklyExclusionReasons_(record);
  record.weekly_eligible = record.weekly_exclusion_reasons.length === 0;
  return record;
}

function outreachSlimPayload_(record) {
  const fields = [
    "account_id", "source_row", "business", "display_business", "contact", "email", "phone", "city", "state",
    "status", "next_email", "priority", "next_follow_up", "last_emailed", "outcome", "do_not_email", "segment",
    "wave", "top_50", "craft_spirit_fit", "miles", "county", "email_confidence", "relationship", "newsletter_status",
    "ordering_status", "opened", "clicked", "search_text", "weekly_eligible",
    "weekly_exclusion_reasons", "has_saved_draft",
  ];
  return fields.reduce((payload, field) => {
    payload[field] = record[field];
    return payload;
  }, {});
}

function apiGetOutreachDashboard_(p) {
  const forceRefresh = String(p?.refresh || "") === "1";
  if (String(p?.slim || "") === "1" && !p?._cache_bypass) {
    // A forced refresh still goes through the cache helper so the fresh build is saved even if
    // the browser request times out; the next normal load then shows current data.
    return cachedReadPayload_("outreach_slim", () => apiGetOutreachDashboard_(Object.assign({}, p, { _cache_bypass:true })), forceRefresh);
  }
  const slim = String(p?.slim || "") === "1";
  const startedAt = Date.now();
  const timings = {};
  let stageStartedAt = startedAt;
  const mark = name => {
    const now = Date.now();
    timings[name] = now - stageStartedAt;
    stageStartedAt = now;
  };
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rows = getAllRowsAsObjects_(sheet);
  mark("directory_read_ms");
  let activityMap = new Map();
  let records;
  if (slim) {
    const draftMap = outreachDraftMap_();
    const programMap = outreachProgramMap_();
    const engagementMap = outreachEngagementMap_();
    mark("supporting_tabs_ms");
    records = rows.map((row, index) => outreachSlimRecord_(row, index + 2, draftMap, programMap, engagementMap))
      .filter(record => record.business);
  } else {
    activityMap = outreachActivityMap_();
    mark("activity_read_ms");
    const settings = getOutreachCampaignSettings_();
    const draftMap = outreachDraftMap_();
    const programMap = outreachProgramMap_();
    const engagementMap = outreachEngagementMap_();
    mark("supporting_tabs_ms");
    records = rows.map((row, index) => outreachRecord_(row, index + 2, activityMap, settings, draftMap, programMap, engagementMap))
      .filter(record => record.business);
  }
  mark("record_build_ms");

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const due = records.filter(record => isDueOutreach_(record, endOfToday));
  const ready = records.filter(isReadyOutreach_)
    .sort((a, b) => outreachPriorityScore_(b) - outreachPriorityScore_(a));
  const sent = records.filter(isSentOutreach_)
    .sort((a, b) => {
      const aDate = outreachDate_(a.last_emailed);
      const bDate = outreachDate_(b.last_emailed);
      return (bDate ? bDate.getTime() : 0) - (aDate ? aDate.getTime() : 0);
    });
  const waiting = sent.filter(record => ["sent", "follow-up sent", "reactivation sent"].includes(outreachStatusLower_(record)));
  const weeklyReady = records.filter(record => record.weekly_eligible);
  const today = due.concat(ready.filter(record => !due.some(item => item.source_row === record.source_row)))
    .slice(0, 30);
  const directory = records.slice().sort((a, b) => String(a.business).localeCompare(String(b.business)));
  const mailer = cachedOutreachMailerStatus_() || {
    can_send:false,
    test_send_available:false,
    detail:"Sending status is loading separately.",
    pending:true,
  };
  mark("summary_build_ms");

  const totalMs = Date.now() - startedAt;
  console.log(JSON.stringify({
    event:"outreach_dashboard_timing",
    total_ms:totalMs,
    stages:timings,
    directory_rows:rows.length,
    activity_businesses:activityMap.size,
  }));

  return {
    can_send: mailer.can_send,
    test_send_available: mailer.test_send_available,
    send_configuration_detail: mailer.detail,
    send_status_pending:!!mailer.pending,
    today: slim ? today.map(record => record.source_row) : today,
    directory: slim ? directory.map(outreachSlimPayload_) : directory,
    sent: slim ? sent.slice(0, 50).map(record => record.source_row) : sent.slice(0, 50),
    newsletter_contacts: [],
    performance: { total_ms:totalMs, stages:timings },
    summary: {
      due_today: due.length,
      total_businesses: directory.length,
      waiting: waiting.length,
      weekly_ready: weeklyReady.length,
    },
  };
}

function apiGetOutreachRecord_(p) {
  if (!p) throw new Error("Missing body");
  const startedAt = Date.now();
  const timings = {};
  let stageStartedAt = startedAt;
  const mark = name => {
    const now = Date.now();
    timings[name] = now - stageStartedAt;
    stageStartedAt = now;
  };
  requireFields_(p, ["source_row"]);
  const sourceRow = Number(p.source_row);
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  if (!Number.isInteger(sourceRow) || sourceRow < 2 || sourceRow > sheet.getLastRow()) {
    throw new Error("Business row not found.");
  }

  const headers = getHeaderMap_(sheet);
  const values = sheet.getRange(sourceRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = {};
  Object.keys(headers).forEach(key => row[key] = values[headers[key]]);
  mark("directory_row_ms");
  const accountId = String(row.account_id || "").trim();
  const business = String(outreachValue_(row, ["business", "business_name"]) || "").trim();
  const requestedAccountId = String(p.account_id || "").trim();
  if (requestedAccountId && accountId !== requestedAccountId) {
    throw new Error("Account identity changed. Refresh and try again.");
  }

  const activityMap = outreachTargetedActivityMap_(accountId, business);
  mark("activity_lookup_ms");
  const draftMap = outreachTargetedDraftMap_(accountId, sourceRow);
  mark("draft_lookup_ms");
  const programMap = outreachTargetedProgramMap_(accountId, sourceRow);
  mark("program_lookup_ms");
  const engagementMap = outreachTargetedEngagementMap_(accountId, sourceRow);
  mark("engagement_lookup_ms");
  const settings = getOutreachCampaignSettings_();
  mark("settings_ms");

  const record = outreachRecord_(
    row,
    sourceRow,
    activityMap,
    settings,
    draftMap,
    programMap,
    engagementMap
  );
  mark("record_build_ms");
  if (!record.business) throw new Error("Business row is empty.");
  console.log(JSON.stringify({
    event:"outreach_record_timing",
    total_ms:Date.now() - startedAt,
    stages:timings,
    source_row:sourceRow,
  }));
  return { record:record, performance:{ total_ms:Date.now() - startedAt, stages:timings } };
}

// Campaigns are immutable recipient/message snapshots.  They make bulk review
// possible without changing a source lead or sending anything at creation time.
function outreachCampaignSheets_() {
  const ss = getOutreachSs_();
  return {
    campaigns: ensureSheet_(ss, OUTREACH_CAMPAIGNS_SHEET_NAME, [
      "Campaign ID", "Campaign Name", "Audience", "Status", "Recipient Count", "Audience Checksum",
      "Unsegmented Count", "Created At", "Created By", "Approved At", "Approved By", "Approval Token",
      "Last Batch At", "Sent Count", "Blocked Count", "App Version", "Criteria",
      "Scheduled Send At", "Scheduled By", "Schedule Status", "Schedule Detail"
    ]),
    recipients: ensureSheet_(ss, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, [
      "Campaign ID", "Source Row", "Account ID", "Business Name", "Recipient Email", "Contact", "City", "ZIP", "Miles", "Priority",
      "Email Confidence", "Segment", "Wave", "Message Stage", "Subject", "Body Text", "HTML", "Content Checksum",
      "Status", "Result Detail", "Zoho Message ID", "Sent At", "Idempotency Token", "App Version", "Newsletter Contact ID"
    ]),
  };
}

function outreachCampaignRow_(sheet, campaignId) {
  const h = getHeaderMap_(sheet);
  if (sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const index = values.findIndex(row => String(row[h.campaign_id] || "") === String(campaignId || ""));
  return index < 0 ? null : { row:index + 2, values:values[index], headers:h };
}

function campaignRecipientRows_(sheet, campaignId) {
  const h = getHeaderMap_(sheet);
  if (sheet.getLastRow() < 2) return [];
  const matches = sheet.getRange(2, h.campaign_id + 1, sheet.getLastRow() - 1, 1).createTextFinder(String(campaignId || ""))
    .matchEntireCell(true).findAll();
  if (!matches.length) return [];
  // Read the block spanning all matches once instead of one getRange per recipient
  // (a 100+ recipient campaign took 100+ separate sheet reads).
  const rows = matches.map(match => match.getRow());
  const first = Math.min.apply(null, rows);
  const last = Math.max.apply(null, rows);
  const wanted = new Set(rows);
  return sheet.getRange(first, 1, last - first + 1, sheet.getLastColumn()).getValues()
    .map((values, index) => ({ row:first + index, values:values, headers:h }))
    .filter(item => wanted.has(item.row));
}

function campaignRecipientSummaryRows_(sheet) {
  const h = getHeaderMap_(sheet);
  if (sheet.getLastRow() < 2) return [];
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
  const campaignIds = range.offset(0, h.campaign_id, range.getNumRows(), 1).getValues();
  const statuses = range.offset(0, h.status, range.getNumRows(), 1).getValues();
  return campaignIds.map((item, index) => ({ campaign_id:String(item[0] || ""), status:String(statuses[index][0] || "") }));
}

function campaignStoredCriteria_(value) {
  try {
    const criteria = JSON.parse(String(value || ""));
    return criteria && typeof criteria === "object" && (criteria.campaign_type === "cocktail_list" || criteria.campaign_type === "customer_invite" || (criteria.center && Number.isFinite(Number(criteria.radius_miles)))) ? criteria : null;
  } catch (error) {
    return null;
  }
}

function campaignCriteriaText_(value, maxLength, label) {
  const text = publicText_(value || "", maxLength, label).toLowerCase();
  return text.replace(/^'/, "");
}

function campaignCenterForCriteria_(type, value) {
  const centroidMap = zipCentroidMap_();
  if (type === "distillery") {
    const centroid = zipCentroidForZip_("54902");
    if (!centroid) throw new Error("ZIP Centroids is missing the distillery ZIP (54902).");
    return { type:"distillery", label:"Distillery (54902)", zip:"54902", latitude:centroid.latitude, longitude:centroid.longitude };
  }
  if (type === "zip") {
    const zip = normalizeZip_(value);
    const centroid = zipCentroidForZip_(zip);
    if (!centroid) throw new Error("Campaign center ZIP must be in the ZIP Centroids tab.");
    return { type:"zip", label:`ZIP ${zip}`, zip:zip, latitude:centroid.latitude, longitude:centroid.longitude };
  }
  if (type === "city") {
    const city = campaignCriteriaText_(value, 80, "Campaign center city");
    if (!city) throw new Error("Enter a campaign center city.");
    const matches = Array.from(centroidMap.entries()).filter(([, centroid]) => String(centroid.city || "").trim().toLowerCase() === city);
    if (!matches.length) throw new Error("Campaign center city was not found in ZIP Centroids. Use a ZIP instead.");
    const latitude = matches.reduce((sum, [, centroid]) => sum + Number(centroid.latitude), 0) / matches.length;
    const longitude = matches.reduce((sum, [, centroid]) => sum + Number(centroid.longitude), 0) / matches.length;
    return { type:"city", label:matches[0][1].city || value, zip:"", latitude:latitude, longitude:longitude };
  }
  throw new Error("Campaign center must be Distillery, ZIP, or city.");
}

function campaignCriteriaFromRequest_(p) {
  const source = p?.criteria && typeof p.criteria === "object" ? p.criteria : (p || {});
  const centerType = String(source.center_type || source.center?.type || "distillery").trim().toLowerCase();
  const centerValue = String(source.center_value || source.center?.zip || source.center?.label || "").trim();
  const radius = source.radius_miles === undefined || String(source.radius_miles).trim() === "" ? 15 : Number(source.radius_miles);
  const minFit = source.min_fit === undefined || String(source.min_fit).trim() === "" ? 5 : Number(source.min_fit);
  const maxRecipientsText = String(source.max_recipients ?? "").trim();
  const maxRecipients = maxRecipientsText === "" ? null : Number(maxRecipientsText);
  const stage = String(source.stage || "Initial").trim();
  const campaignType = String(source.campaign_type || "sales_outreach").trim().toLowerCase();
  const sourceCampaignId = String(source.source_campaign_id || "").trim();
  const stages = ["Initial", "Follow-up 1", "Follow-up 2", "Nurture check-in"];
  if (maxRecipients !== null && (!Number.isInteger(maxRecipients) || maxRecipients < 1 || maxRecipients > 5000)) throw new Error("Campaign maximum recipients must be from 1 to 5,000.");
  if (campaignType === "cocktail_list") return { schema:3, campaign_type:"cocktail_list", stage:OUTREACH_COCKTAIL_LIST_STAGE, max_recipients:maxRecipients, filters:{} };
  if (campaignType === "customer_invite") return { schema:3, campaign_type:"customer_invite", stage:OUTREACH_CUSTOMER_INVITE_STAGE, max_recipients:maxRecipients, filters:{} };
  if (campaignType !== "sales_outreach") throw new Error("Campaign type must be Sales outreach, Cocktail list, or Current customers.");
  if (!Number.isFinite(radius) || radius < 0 || radius > 1000) throw new Error("Campaign radius must be from 0 to 1,000 miles.");
  if (!Number.isInteger(minFit) || minFit < 1 || minFit > 5) throw new Error("Campaign minimum fit must be from 1 to 5.");
  if (!stages.includes(stage)) throw new Error("Campaign stage must be Initial, Follow-up 1, Follow-up 2, or Nurture check-in.");
  return {
    schema:3,
    campaign_type:"sales_outreach",
    stage:stage,
    source_campaign_id:sourceCampaignId,
    center:campaignCenterForCriteria_(centerType, centerValue),
    radius_miles:radius,
    min_fit:minFit,
    filters:{
      city:campaignCriteriaText_(source.city, 80, "Campaign city filter"),
      county:campaignCriteriaText_(source.county, 80, "Campaign county filter"),
      segment:campaignCriteriaText_(source.segment, 80, "Campaign segment filter"),
      wave:campaignCriteriaText_(source.wave, 80, "Campaign wave filter"),
    },
    max_recipients:maxRecipients,
  };
}

function campaignAudienceLabel_(criteria) {
  if (criteria?.campaign_type === "customer_invite") return `Current customers · order online invite${criteria?.max_recipients ? ` · first ${criteria.max_recipients}` : ""}`;
  if (criteria?.campaign_type === "cocktail_list") return `Cocktail list · subscribed newsletter contacts${criteria?.max_recipients ? ` · first ${criteria.max_recipients}` : ""}`;
  const stage = String(criteria?.stage || "Initial");
  const center = criteria?.center?.label || "selected center";
  const filters = criteria?.filters || {};
  const suffix = [criteria?.source_campaign_id && `recipients of ${criteria.source_campaign_id}`, filters.city && `city ${filters.city}`, filters.county && `county ${filters.county}`, filters.segment && `segment ${filters.segment}`, filters.wave && `wave ${filters.wave}`, criteria.max_recipients && `first ${criteria.max_recipients}`].filter(Boolean);
  const audience = stage === "Initial" ? "Initial prospects" : `${stage} due`;
  return `${audience} · fit ≥${criteria.min_fit} · ≤${criteria.radius_miles} mi of ${center}${suffix.length ? ` · ${suffix.join(" · ")}` : ""}`;
}

function campaignDistanceForCriteria_(record, criteria) {
  return milesBetweenCoordinates_(zipCentroidForZip_(record?.postal_code), criteria?.center);
}

function campaignCriteriaFailures_(record, criteria) {
  if (!criteria) return [];
  if (criteria.campaign_type === "cocktail_list" || criteria.campaign_type === "customer_invite") return [];
  const failures = [];
  const miles = campaignDistanceForCriteria_(record, criteria);
  if (miles === null || miles > Number(criteria.radius_miles)) failures.push("distance");
  if (Number(record.craft_spirit_fit || 0) < Number(criteria.min_fit)) failures.push("fit");
  const filters = criteria.filters || {};
  if (filters.city && String(record.city || "").trim().toLowerCase() !== filters.city) failures.push("city");
  if (filters.county && String(record.county || "").trim().toLowerCase() !== filters.county) failures.push("county");
  if (filters.segment && String(record.segment || "").trim().toLowerCase() !== filters.segment) failures.push("segment");
  if (filters.wave && String(record.wave || "").trim().toLowerCase() !== filters.wave) failures.push("wave");
  return failures;
}

function campaignDirectoryRecord_(row, sourceRow) {
  return {
    source_row:sourceRow,
    account_id:String(row.account_id || "").trim(),
    business:String(outreachValue_(row, ["business", "business_name"]) || "").trim(),
    contact:String(outreachValue_(row, ["contact", "contact_name", "contact_person", "first_name"]) || "").trim(),
    email:String(outreachValue_(row, ["email", "email_address"]) || "").trim(),
    city:String(outreachValue_(row, ["city", "town"]) || "").trim(),
    postal_code:String(outreachValue_(row, ["zip", "zip_code", "postal_code"]) || "").trim(),
    status:String(outreachValue_(row, ["status"]) || "Not contacted").trim(),
    next_email:String(outreachValue_(row, ["next_email", "stage"]) || "Initial").trim(),
    next_follow_up:outreachValue_(row, ["next_follow-up", "next_follow_up"]),
    priority:String(outreachValue_(row, ["priority"]) || "").trim(),
    last_emailed:outreachValue_(row, ["last_emailed", "last_email"]),
    message_id:String(outreachValue_(row, ["message_id", "zoho_message_id"]) || "").trim(),
    outcome:String(outreachValue_(row, ["outcome"]) || "").trim(),
    do_not_email:toBool_(outreachValue_(row, ["do_not_email", "do_not_contact"])),
    segment:String(outreachValue_(row, ["segment"]) || "").trim(),
    wave:String(outreachValue_(row, ["wave"]) || "").trim(),
    county:String(outreachValue_(row, ["county"]) || "").trim(),
    craft_spirit_fit:Number(outreachValue_(row, ["craft-spirit_fit_(1–5)", "craft-spirit_fit_(1-5)", "craft_spirit_fit", "craft_spirit_fit_(1–5)"]) || 0),
    email_confidence:String(outreachValue_(row, ["email_confidence"]) || "").trim(),
    relationship:String(outreachValue_(row, ["relationship"]) || "").trim(),
    activity:[],
    directory_row:row,
  };
}

function newsletterCocktailListEligibility_(record) {
  const reasons = [];
  const email = String(record.email || "").trim().toLowerCase();
  const directoryStatus = String(record.directory_status || "").trim().toLowerCase();
  const directoryOutcome = String(record.directory_outcome || "").trim().toLowerCase();
  const programStatus = String(record.program_newsletter_status || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reasons.push("Recipient email is invalid");
  if (String(record.newsletter_status || "").trim() !== "Subscribed") reasons.push("Newsletter contact is not subscribed");
  // Activating an application ticks Do Not Email to stop sales outreach to a customer.
  // An active customer who subscribed to the Cocktail list still receives it; any
  // recorded opt-out (status, outcome, newsletter or program) still excludes them.
  const activeCustomer = directoryStatus === "existing customer" && String(record.program_ordering_status || "").trim().toLowerCase() === "active";
  const optOut = ["do not contact", "unsubscribed", "bad address", "not interested"];
  if ((record.do_not_email && !activeCustomer) || optOut.includes(directoryStatus) || optOut.includes(directoryOutcome)) reasons.push("Business is excluded from email");
  if (["unsubscribed", "declined"].includes(programStatus)) reasons.push("Account program excludes newsletter email");
  const cooldown = outreachCrossSendCooldownReason_(email, true);
  if (cooldown) reasons.push(cooldown);
  if (outreachRecentSendToEmail_(email, stage => stage === OUTREACH_COCKTAIL_LIST_STAGE, OUTREACH_COCKTAIL_LIST_GAP_DAYS)) {
    reasons.push(`A cocktail list email was sent within the last ${OUTREACH_COCKTAIL_LIST_GAP_DAYS} days`);
  }
  return reasons;
}

function cocktailListContactIndex_() {
  if (__OUTREACH_COCKTAIL_LIST_CONTACT_INDEX) return __OUTREACH_COCKTAIL_LIST_CONTACT_INDEX;
  const directory = getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME)).map((row, index) => Object.assign({ __source_row:index + 2 }, row));
  const byAccount = new Map(directory.map(row => [String(row.account_id || "").trim(), row]).filter(([key]) => key));
  const byEmail = new Map(directory.map(row => [String(outreachValue_(row, ["email", "email_address"]) || "").trim().toLowerCase(), row]).filter(([key]) => key));
  const contacts = newsletterContacts_();
  return (__OUTREACH_COCKTAIL_LIST_CONTACT_INDEX = {
    contacts:contacts,
    contacts_by_id:new Map(contacts.map(contact => [String(contact.contact_id || ""), contact]).filter(([key]) => key)),
    // An address with any Unsubscribed or Declined row is treated as opted out, even
    // if another row for the same address says Subscribed.
    opted_out_emails:new Set(contacts.filter(contact => ["unsubscribed", "declined"].includes(String(contact.status || "").trim().toLowerCase()))
      .map(contact => String(contact.email || "").trim().toLowerCase()).filter(Boolean)),
    directory_by_account:byAccount,
    directory_by_email:byEmail,
    programs:outreachProgramMap_(),
  });
}

function cocktailListRecordFromContact_(contact, index) {
  const directoryRow = index.directory_by_account.get(contact.account_id) || index.directory_by_email.get(String(contact.email || "").trim().toLowerCase()) || {};
  const sourceRow = Number(directoryRow.__source_row || contact.source_row || 0);
  const program = index.programs.get(String(contact.account_id || "").trim()) || index.programs.get(sourceRow) || {};
  return {
    newsletter_contact_id:contact.contact_id,
    source_row:sourceRow,
    account_id:contact.account_id || String(directoryRow.account_id || "").trim(),
    business:contact.organization || contact.source_business || contact.name || contact.email,
    contact:contact.name,
    email:contact.email,
    city:String(outreachValue_(directoryRow, ["city", "town"]) || ""),
    postal_code:String(outreachValue_(directoryRow, ["zip", "zip_code", "postal_code"]) || ""),
    priority:"", email_confidence:"", segment:"", wave:"", campaign_miles:"",
    next_email:OUTREACH_COCKTAIL_LIST_STAGE,
    newsletter_status:index.opted_out_emails && index.opted_out_emails.has(String(contact.email || "").trim().toLowerCase()) ? "Unsubscribed" : contact.status,
    do_not_email:toBool_(outreachValue_(directoryRow, ["do_not_email", "do_not_contact"])),
    directory_status:String(outreachValue_(directoryRow, ["status"]) || ""),
    directory_outcome:String(outreachValue_(directoryRow, ["outcome"]) || ""),
    program_newsletter_status:String(program.newsletter_status || ""),
    program_ordering_status:String(program.ordering_status || ""),
  };
}

function campaignCocktailListRecords_(criteria) {
  const index = cocktailListContactIndex_();
  const seen = new Set();
  const settings = getOutreachCampaignSettings_();
  const records = index.contacts.map(contact => {
    const record = cocktailListRecordFromContact_(contact, index);
    const message = cocktailListMessage_(record, settings);
    return Object.assign(record, { subject:message.subject, body_text:message.body_text, preview_html:message.html, footer_html:message.footer_html });
  }).filter(record => {
    const email = String(record.email || "").trim().toLowerCase();
    if (seen.has(email) || newsletterCocktailListEligibility_(record).length) return false;
    seen.add(email);
    return true;
  });
  return criteria.max_recipients === null ? records : records.slice(0, criteria.max_recipients);
}

function liveCocktailListRecipient_(newsletterContactId) {
  const index = cocktailListContactIndex_();
  const contact = index.contacts_by_id.get(String(newsletterContactId || ""));
  if (!contact) throw new Error("Newsletter contact no longer exists.");
  return cocktailListRecordFromContact_(contact, index);
}

// ---------- Order-online invite for current customers (2026.10.08.36-APP) ----------
// Audience: Directory rows whose Relationship is Current customer / Customer or whose Status is
// Existing customer, plus any Directory account with a non-void Badger invoice in the last 12
// months. Each address gets the invite once. Directory outreach stages are never changed.
const OUTREACH_CUSTOMER_RELATIONSHIPS = ["current customer", "customer", "existing customer"];
// Relationships that show the business has bought from us before (2026.10.08.37-APP). A Badger
// invoice matched by business name alone counts only for these rows; on a Prospect row the same
// name could be a different business (two bars both called "Village Inn").
const OUTREACH_CUSTOMER_HISTORY_RELATIONSHIPS = OUTREACH_CUSTOMER_RELATIONSHIPS.concat(["lapsed customer", "win-back due"]);
let __CUSTOMER_INVITE_SENT_EMAILS = null;

/**
 * Why a row counts as a current customer ("" if it does not). badger is { strong:Set, name_only:Map }.
 * A strong invoice match (explicit link, order link or learned alias) always counts; a match by
 * business name alone counts only when the row's Relationship already shows customer history.
 */
function customerInviteReason_(record, badger) {
  const relationship = String(record.relationship || "").trim().toLowerCase();
  const status = String(record.status || "").trim().toLowerCase();
  if (OUTREACH_CUSTOMER_RELATIONSHIPS.includes(relationship)) return String(record.relationship).trim();
  if (status === "existing customer") return "Existing customer";
  if (record.account_id && badger.strong.has(record.account_id)) return "Badger invoice in the last 12 months";
  if (record.account_id && badger.name_only.has(record.account_id) && OUTREACH_CUSTOMER_HISTORY_RELATIONSHIPS.includes(relationship)) {
    return `${String(record.relationship).trim()} with a Badger invoice in the last 12 months (matched by business name; Relationship may need updating)`;
  }
  return "";
}

function customerInviteIsCustomer_(record, badger) {
  return !!customerInviteReason_(record, badger);
}

/** Addresses that already received the invite (Activity Log, real sends only). */
function customerInviteSentEmails_() {
  if (__CUSTOMER_INVITE_SENT_EMAILS) return __CUSTOMER_INVITE_SENT_EMAILS;
  const sent = new Set();
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  if (sheet && sheet.getLastRow() >= 2) {
    getAllRowsAsObjects_(sheet).forEach(row => {
      const stage = String(outreachValue_(row, ["message_stage", "stage"]) || "").trim();
      const result = String(outreachValue_(row, ["result"]) || "").toUpperCase();
      const email = String(outreachValue_(row, ["intended_recipient", "delivered_to", "email", "email_address"]) || "").trim().toLowerCase();
      if (stage === OUTREACH_CUSTOMER_INVITE_STAGE && email && result.includes("SENT") && !result.includes("TEST")) sent.add(email);
    });
  }
  return (__CUSTOMER_INVITE_SENT_EMAILS = sent);
}

/**
 * Recent Badger customers for the invite: { strong, name_only, unplaced_invoices }. "Strong"
 * accounts (explicit invoice link, order link or learned alias) join the audience; a match by
 * business or location name alone joins only on a row with customer history (see customerInviteReason_).
 */
function customerInviteBadgerMatches_() {
  outreachRecentBadgerInvoiceAccountIds_();
  // A silent empty set would quietly drop every invoice-only customer from the audience.
  if (__OUTREACH_RECENT_BADGER_INVOICE_LOOKUP_FAILED || !__OUTREACH_RECENT_BADGER_MATCHES) throw new Error("Badger invoices could not be read, so customers found only through recent invoices would be missed. Try again in a few minutes.");
  return __OUTREACH_RECENT_BADGER_MATCHES;
}

function customerInviteEligibility_(record) {
  const reasons = [];
  const email = String(record.email || "").trim().toLowerCase();
  const status = String(record.status || "").trim().toLowerCase();
  const outcome = String(record.outcome || "").trim().toLowerCase();
  const confidence = String(record.email_confidence || "").trim().toLowerCase();
  const optOut = ["do not contact", "not interested", "unsubscribed", "bad address"];
  if (!email) reasons.push("No email on file");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reasons.push("Recipient email is invalid");
  if (record.do_not_email) reasons.push("Do Not Email is ticked");
  if (optOut.includes(status) || optOut.includes(outcome)) reasons.push("Business is excluded from email");
  if (String(record.program_ordering_status || "").trim().toLowerCase() === "active") reasons.push("Already set up for online ordering");
  if (email && customerInviteSentEmails_().has(email)) reasons.push("Invite already sent");
  if (confidence && !["confirmed", "published", "supplied"].includes(confidence)) reasons.push("Recipient email is not verified");
  const cooldown = email ? outreachCrossSendCooldownReason_(email, false) : "";
  if (cooldown) reasons.push(cooldown);
  return reasons;
}

function customerInviteRecord_(row, sourceRow, programs) {
  const record = campaignDirectoryRecord_(row, sourceRow);
  const program = programs.get(record.account_id) || programs.get(sourceRow) || {};
  record.program_ordering_status = String(program.ordering_status || "");
  record.next_email = OUTREACH_CUSTOMER_INVITE_STAGE;
  return record;
}

/**
 * The fixed tail of every invite: the link to the wholesale account form, the sign-off, the
 * physical address and the unsubscribe line. It is kept out of the editable body, and every
 * path (freeze, staff edit, rebuild) re-attaches it, so an edited invite never loses its link.
 * Built only from the account, business and email that are frozen on the recipient row.
 */
function customerInviteFooterHtml_(record, settings) {
  if (!String(settings["Physical mailing address"] || "").trim()) throw new Error("Physical mailing address is required before previewing or creating an order-online invite.");
  const accountId = String(record.account_id || "").trim();
  const business = String(record.business || "").trim();
  const email = String(record.email || "").trim();
  const applicationUrl = String(settings["Customer application URL"] || "").trim();
  const tracked = outreachTrackingUrl_("application", accountId, OUTREACH_CUSTOMER_INVITE_STAGE, settings, { business:business, email:email }, false);
  const direct = /^https:\/\/\S+$/i.test(applicationUrl)
    ? `${applicationUrl}${applicationUrl.includes("?") ? "&" : "?"}account_id=${encodeURIComponent(accountId)}&business=${encodeURIComponent(business)}&email=${encodeURIComponent(email)}`
    : "";
  const link = tracked || direct;
  if (!link) throw new Error("Set Customer application URL in Campaign Settings before creating an order-online invite.");
  const values = customerInviteValues_(record);
  const linkText = escapeOutreachHtml_(String(settings["Customer invite link text"] || "").trim() || "Set up online ordering");
  const signOff = renderOutreachTemplate_(String(settings["Customer invite sign-off"] || ""), values, true).trim();
  return `<p><a href="${escapeOutreachHtml_(link)}">${linkText}</a></p>`
    + (signOff ? `<p>${signOff}</p>` : "")
    + `<p>${escapeOutreachHtml_(String(settings["Physical mailing address"] || ""))}</p><p>Reply stop to unsubscribe.</p>`;
}

function customerInviteValues_(record) {
  return {
    "First Name":String(record.contact || "").trim().split(/\s+/)[0] || "there",
    "Business Name":outreachDisplayBusinessName_(String(record.business || "").trim() || "your business"),
    "City":String(record.city || ""),
  };
}

function customerInviteMessage_(record, settings) {
  const footer = customerInviteFooterHtml_(record, settings);
  const values = customerInviteValues_(record);
  const subject = renderOutreachTemplate_(String(settings["Customer invite subject"] || ""), values, false).trim();
  if (!subject) throw new Error("Fill in the CUSTOMER ORDER INVITE EMAIL block in the Email Editor (run repairHubStructure() once to add it).");
  const line = key => renderOutreachTemplate_(String(settings[key] || ""), values, true).trim();
  const body = ["Customer invite greeting", "Customer invite intro", "Customer invite steps"].map(line).filter(Boolean).map(text => `<p>${text}</p>`).join("");
  return { stage:OUTREACH_CUSTOMER_INVITE_STAGE, subject:subject, body_text:outreachHtmlToPlainText_(body), html:body + footer, footer_html:footer };
}

/** Eligible current customers, one per address, with each rendered message; plus counts of who was left out and why. */
function campaignCustomerInviteSelection_(criteria) {
  const badger = customerInviteBadgerMatches_();
  const programs = outreachProgramMap_();
  const settings = getOutreachCampaignSettings_();
  const excluded = {};
  const excludedNames = {};
  const leaveOut = (reason, record) => {
    excluded[reason] = (excluded[reason] || 0) + 1;
    if (!excludedNames[reason]) excludedNames[reason] = [];
    if (excludedNames[reason].length < 25) excludedNames[reason].push(String(record.business || record.email || `Row ${record.source_row}`));
  };
  const seen = new Set();
  const records = [];
  getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME)).forEach((row, index) => {
    const record = customerInviteRecord_(row, index + 2, programs);
    record.invite_reason = customerInviteReason_(record, badger);
    if (!record.invite_reason) {
      // Matched to a Badger invoice by name only on a row with no customer history (e.g. Prospect):
      // possibly a different business with the same name, so it is not invited. Linking the invoice
      // in Orders & Accounts makes it a strong match.
      if (record.account_id && badger.name_only.has(record.account_id)) leaveOut("Possible customer: Badger invoice matched by name only", record);
      return;
    }
    const reasons = customerInviteEligibility_(record);
    const email = String(record.email || "").trim().toLowerCase();
    if (!reasons.length && seen.has(email)) reasons.push("Another customer row has the same email");
    if (reasons.length) { leaveOut(reasons[0], record); return; }
    seen.add(email);
    const message = customerInviteMessage_(record, settings);
    records.push(Object.assign(record, { subject:message.subject, body_text:message.body_text, preview_html:message.html, footer_html:message.footer_html }));
  });
  records.sort((a, b) => String(a.business).localeCompare(String(b.business)));
  const warnings = [];
  if (badger.unplaced_invoices) warnings.push(`${badger.unplaced_invoices} recent Badger invoice(s) match no Directory account and cannot be invited; link them in Orders & Accounts.`);
  let syncFresh = true;
  try { syncFresh = !!badgerSyncState_().is_fresh; } catch (error) { syncFresh = false; }
  if (!syncFresh) warnings.push("Badger status sync is not fresh, so customers with the newest invoices may be missing. Sync Badger status first.");
  return { records:criteria && criteria.max_recipients ? records.slice(0, criteria.max_recipients) : records, excluded:excluded, excluded_names:excludedNames, warnings:warnings };
}

/** The current Directory row behind a frozen invite recipient, with the same rules applied. */
function liveCustomerInviteRecipient_(sourceRow) {
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(sourceRow || 0);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error("Customer row no longer exists.");
  const headers = getHeaderMap_(sheet);
  const raw = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = {}; Object.keys(headers).forEach(key => row[key] = raw[headers[key]]);
  const record = customerInviteRecord_(row, rowNumber, outreachProgramMap_());
  // Read Badger only when Relationship / Status do not already qualify the row, so a Badger read
  // failure during a send blocks only the invoice-only customers, not every recipient.
  const noBadger = { strong:new Set(), name_only:new Map() };
  const isCustomer = customerInviteIsCustomer_(record, noBadger) || customerInviteIsCustomer_(record, customerInviteBadgerMatches_());
  const reasons = isCustomer ? customerInviteEligibility_(record) : ["No longer a current customer"];
  return { record:record, reasons:reasons };
}

// An Initial prospect email, or an order-online invite: either means the address must never get
// the Initial "introducing Sturgeon Spirits" email (an invited customer is not a prospect).
function initialSentActivityRow_(row) {
  const result = String(outreachValue_(row, ["result", "send_status", "status"]) || "").toUpperCase();
  const stage = String(outreachValue_(row, ["stage", "message_stage", "next_email"]) || "").trim().toLowerCase();
  return (stage === "initial" || stage === OUTREACH_CUSTOMER_INVITE_STAGE.toLowerCase()) && result.indexOf("SENT") >= 0 && result.indexOf("TEST") < 0;
}

function campaignInitialSentEmailSet_(directoryRecords) {
  const sentEmails = new Set((directoryRecords || [])
    .filter(record => record.last_emailed)
    .map(record => String(record.email || "").trim().toLowerCase())
    .filter(Boolean));
  const activitySheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  if (!activitySheet || activitySheet.getLastRow() < 2) return sentEmails;
  getAllRowsAsObjects_(activitySheet).forEach(row => {
    if (!initialSentActivityRow_(row)) return;
    ["intended_recipient", "delivered_to", "email", "email_address"].forEach(key => {
      const email = String(outreachValue_(row, [key]) || "").trim().toLowerCase();
      if (email) sentEmails.add(email);
    });
  });
  return sentEmails;
}

function campaignSourceRows_(campaignId) {
  if (!campaignId) return null;
  const sheets = outreachCampaignSheets_();
  if (!outreachCampaignRow_(sheets.campaigns, campaignId)) throw new Error("Selected source campaign was not found.");
  return new Set(campaignRecipientRows_(sheets.recipients, campaignId)
    .map(item => Number(item.values[item.headers.source_row] || 0))
    .filter(Number.isInteger));
}

function campaignDirectoryStageSelection_(criteria) {
  const leadSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const stage = String(criteria.stage || "Initial");
  const directoryRecords = getAllRowsAsObjects_(leadSheet).map((row, index) => campaignDirectoryRecord_(row, index + 2));
  const initialSentEmails = campaignInitialSentEmailSet_(directoryRecords);
  const activityMap = stage === "Initial" ? null : outreachActivityMap_();
  const sourceRows = campaignSourceRows_(criteria.source_campaign_id);
  const candidateRows = directoryRecords
    .filter(record => record.next_email.toLowerCase() === stage.toLowerCase())
    .filter(record => stage !== "Initial" || record.relationship.toLowerCase() === "prospect")
    .filter(record => !sourceRows || sourceRows.has(record.source_row));
  const seenEmails = new Set();
  const eligible = candidateRows.map(record => {
    if (activityMap) {
      record.activity = activityMap.get(`account:${record.account_id}`) || activityMap.get(`business:${record.business.toLowerCase()}`) || [];
    }
    record.campaign_miles = campaignDistanceForCriteria_(record, criteria);
    return record;
  }).filter(record => {
    // Preview and freeze both use directory fields only for eligibility; rendered messages are intentionally deferred to freeze.
    const eligibilityOptions = stage === "Initial" ? { skip_legacy_pilot:true, initial_sent_emails:initialSentEmails } : { skip_legacy_pilot:true };
    if (outreachSendEligibility_(record, eligibilityOptions).length || campaignCriteriaFailures_(record, criteria).length) return false;
    const email = String(record.email || "").trim().toLowerCase();
    if (seenEmails.has(email)) return false;
    seenEmails.add(email);
    return true;
  }).sort((a, b) => Number(a.campaign_miles) - Number(b.campaign_miles) || outreachPriorityScore_(b) - outreachPriorityScore_(a) || String(a.business).localeCompare(String(b.business)));
  return { records:criteria.max_recipients === null ? eligible : eligible.slice(0, criteria.max_recipients), initial_sent_emails:initialSentEmails };
}

function campaignDirectoryInitialSelection_(criteria) {
  return campaignDirectoryStageSelection_(Object.assign({}, criteria, { stage:String(criteria?.stage || "Initial") }));
}

function campaignDirectoryInitialRecords_(criteria) {
  return campaignDirectoryStageSelection_(criteria).records;
}

function campaignEligibleInitialRecords_(criteria) {
  const stage = String(criteria.stage || "Initial");
  const selection = campaignDirectoryStageSelection_(criteria);
  const directoryRecords = selection.records;
  if (!directoryRecords.length) return { records:[], preview_count:0, removed_by_duplicate_checks:0 };
  const activityMap = outreachActivityMap_();
  const settings = getOutreachCampaignSettings_();
  const draftMap = outreachDraftMap_();
  const programMap = outreachProgramMap_();
  const engagementMap = outreachEngagementMap_();
  const records = directoryRecords.map(directoryRecord => {
    const record = outreachRecord_(directoryRecord.directory_row, directoryRecord.source_row, activityMap, settings, draftMap, programMap, engagementMap);
    record.campaign_miles = directoryRecord.campaign_miles;
    return record;
  }).filter(record => {
    const reasons = stage === "Initial"
      ? outreachSendEligibility_(record, { initial_sent_emails:selection.initial_sent_emails })
      : outreachSendEligibility_(record, {});
    return !reasons.length;
  });
  return { records:records, preview_count:directoryRecords.length, removed_by_duplicate_checks:directoryRecords.length - records.length };
}

function campaignRecipientSnapshotValues_(sheet, campaignId, record) {
  const h = getHeaderMap_(sheet);
  const values = Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
  const checksum = sha256_([record.source_row, record.account_id, record.business, record.email, record.subject, record.body_text].join("|"));
  set("campaign_id", campaignId); set("source_row", record.source_row || ""); set("account_id", record.account_id);
  set("business_name", record.business); set("recipient_email", record.email); set("contact", record.contact);
  set("city", record.city); set("zip", record.postal_code || ""); set("miles", record.campaign_miles === null || record.campaign_miles === undefined ? "" : record.campaign_miles); set("priority", record.priority);
  set("email_confidence", record.email_confidence); set("segment", record.segment); set("wave", record.wave);
  set("message_stage", record.next_email); set("newsletter_contact_id", record.newsletter_contact_id || "");
  set("subject", record.subject); set("body_text", record.body_text); set("html", record.preview_html);
  if (record.footer_html) set("footer_html", record.footer_html);
  set("content_checksum", checksum); set("status", "Ready for review"); set("idempotency_token", `${campaignId}-${record.newsletter_contact_id || record.source_row}`); set("app_version", APP_VERSION);
  return values;
}

function campaignAudienceChecksum_(audience, recipients, criteriaValue) {
  return sha256_([String(audience || ""), String(criteriaValue || "")].concat(recipients.map(item => {
    const h = item.headers;
    return `${item.values[h.source_row]}|${item.values[h.recipient_email]}|${item.values[h.content_checksum]}`;
  })).join("\n"));
}

function campaignRecipientCityFallbacks_(recipients) {
  const fallback = { by_account:new Map(), by_source_row:new Map() };
  const missingCity = recipients.some(item => !String(item.values[item.headers.city] || "").trim());
  if (!missingCity) return fallback;
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const headers = getHeaderMap_(sheet);
  if (sheet.getLastRow() < 2 || headers.city === undefined) return fallback;
  // One directory data read per campaign load, then recipient rows resolve from maps.
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().forEach((values, index) => {
    const city = String(values[headers.city] || "").trim();
    if (!city) return;
    const sourceRow = index + 2;
    fallback.by_source_row.set(sourceRow, city);
    const accountId = headers.account_id === undefined ? "" : String(values[headers.account_id] || "").trim();
    if (accountId) fallback.by_account.set(accountId, city);
  });
  return fallback;
}

function campaignObject_(campaign, recipients, includeRecipients) {
  const h = campaign.headers;
  const value = key => campaign.values[h[key]];
  const cityFallbacks = includeRecipients ? campaignRecipientCityFallbacks_(recipients) : { by_account:new Map(), by_source_row:new Map() };
  const recipientObjects = recipients.map(item => {
    const rh = item.headers;
    const get = key => item.values[rh[key]];
    const sourceRow = Number(get("source_row") || 0);
    const accountId = String(get("account_id") || "");
    const storedCity = String(get("city") || "").trim();
    return {
      source_row:sourceRow, account_id:accountId,
      business:String(get("business_name") || ""), email:String(get("recipient_email") || ""),
      contact:String(get("contact") || ""), city:storedCity || cityFallbacks.by_account.get(accountId) || cityFallbacks.by_source_row.get(sourceRow) || "", postal_code:String(get("zip") || ""), miles:outreachMiles_(get("miles")), priority:String(get("priority") || ""),
      email_confidence:String(get("email_confidence") || ""), segment:String(get("segment") || ""), wave:String(get("wave") || ""),
      subject:String(get("subject") || ""), body_text:String(get("body_text") || ""), preview_html:String(get("html") || ""),
      content_checksum:String(get("content_checksum") || ""), status:String(get("status") || ""),
      result_detail:String(get("result_detail") || ""), message_id:String(get("zoho_message_id") || ""),
      sent_at:get("sent_at") || "", idempotency_token:String(get("idempotency_token") || ""),
    };
  });
  const counts = recipientObjects.reduce((all, item) => { all[item.status || "Unknown"] = (all[item.status || "Unknown"] || 0) + 1; return all; }, {});
  const result = {
    campaign_id:String(value("campaign_id") || ""), name:String(value("campaign_name") || ""), audience:String(value("audience") || ""),
    status:String(value("status") || ""), recipient_count:Number(value("recipient_count") || recipientObjects.length),
    audience_checksum:String(value("audience_checksum") || ""), unsegmented_count:Number(value("unsegmented_count") || 0),
    created_at:value("created_at") || "", created_by:String(value("created_by") || ""), approved_at:value("approved_at") || "",
    approved_by:String(value("approved_by") || ""), sent_count:Number(value("sent_count") || 0), blocked_count:Number(value("blocked_count") || 0),
    counts:counts,
    criteria:campaignStoredCriteria_(value("criteria")),
    scheduled_send_at:value("scheduled_send_at") || "", scheduled_by:String(value("scheduled_by") || ""),
    schedule_status:String(value("schedule_status") || ""), schedule_detail:String(value("schedule_detail") || ""),
  };
  if (includeRecipients) {
    result.recipients = recipientObjects;
    result.approval_token = String(value("approval_token") || "");
  }
  return result;
}

function apiGetOutreachCampaigns_() {
  const startedAt = Date.now();
  const sheets = outreachCampaignSheets_();
  const h = getHeaderMap_(sheets.campaigns);
  if (sheets.campaigns.getLastRow() < 2) return { campaigns:[], performance:{ total_ms:Date.now() - startedAt, stages:{ campaign_read_ms:Date.now() - startedAt } } };
  const recipientHeaders = getHeaderMap_(sheets.recipients);
  const recipientCount = Math.max(0, sheets.recipients.getLastRow() - 1);
  const recipientIds = recipientCount ? sheets.recipients.getRange(2, recipientHeaders.campaign_id + 1, recipientCount, 1).getValues() : [];
  const recipientStatuses = recipientCount ? sheets.recipients.getRange(2, recipientHeaders.status + 1, recipientCount, 1).getValues() : [];
  const listHeaders = { campaign_id:0, status:1 };
  const allRecipients = recipientIds.map((id, index) => ({
    row:index + 2,
    values:[id[0], recipientStatuses[index]?.[0] || ""],
    headers:listHeaders,
  }));
  const campaigns = sheets.campaigns.getRange(2, 1, sheets.campaigns.getLastRow() - 1, sheets.campaigns.getLastColumn()).getValues()
    .map((values, index) => ({ row:index + 2, values:values, headers:h }))
    .reverse().map(campaign => campaignObject_(campaign, allRecipients.filter(item => String(item.values[item.headers.campaign_id] || "") === String(campaign.values[h.campaign_id] || "")), false));
  return { campaigns:campaigns, performance:{ total_ms:Date.now() - startedAt, stages:{ campaign_read_ms:Date.now() - startedAt } } };
}

function apiGetOutreachCampaign_(p) {
  const startedAt = Date.now();
  const sheets = outreachCampaignSheets_();
  const campaign = outreachCampaignRow_(sheets.campaigns, p?.campaign_id);
  if (!campaign) throw new Error("Campaign not found.");
  return { campaign:campaignObject_(campaign, campaignRecipientRows_(sheets.recipients, p.campaign_id), true), performance:{ total_ms:Date.now() - startedAt, stages:{ campaign_recipient_read_ms:Date.now() - startedAt } } };
}

function writeCampaignRecipientRows_(sheet, recipients) {
  if (!recipients.length) return;
  const sorted = recipients.slice().sort((a, b) => a.row - b.row);
  let group = [];
  const writeGroup = () => {
    if (!group.length) return;
    sheet.getRange(group[0].row, 1, group.length, group[0].values.length).setValues(group.map(item => item.values));
    group = [];
  };
  sorted.forEach(item => {
    if (group.length && item.row !== group[group.length - 1].row + 1) writeGroup();
    group.push(item);
  });
  writeGroup();
}

function campaignDirectoryRow_(sheet, headers, recipient) {
  const rh = recipient.headers;
  const accountId = String(recipient.values[rh.account_id] || "").trim();
  const sourceRow = Number(recipient.values[rh.source_row] || 0);
  const matched = accountId ? outreachRowsMatchingCell_(sheet, ["account_id", "Account ID"], accountId) : [];
  if (matched.length) return { row:Number(matched[0].__source_row), values:matched[0] };
  if (!Number.isInteger(sourceRow) || sourceRow < 2 || sourceRow > sheet.getLastRow()) return null;
  const raw = sheet.getRange(sourceRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = {};
  Object.keys(headers).forEach(key => values[key] = raw[headers[key]]);
  return { row:sourceRow, values:values };
}

function campaignAcceptedActivity_(accountId, recipientToken) {
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  const rows = outreachRowsMatchingCell_(sheet, ["idempotency_token", "Idempotency Token"], recipientToken);
  return rows.map(row => {
    const sentAt = outreachDate_(outreachValue_(row, ["timestamp", "sent_at"]));
    return {
      account_id:String(outreachValue_(row, ["account_id", "Account ID"]) || "").trim(),
      result:String(outreachValue_(row, ["result"]) || "").trim(),
      message_id:String(outreachValue_(row, ["message_id", "zoho_message_id", "Message ID"]) || "").trim(),
      sent_at:sentAt,
    };
  }).filter(row => {
    const result = row.result.toUpperCase();
    return row.account_id === String(accountId || "").trim()
      && result.includes("APP SENT")
      && !result.includes("TEST")
      && !!row.message_id
      && !!row.sent_at;
  }).sort((a, b) => b.sent_at.getTime() - a.sent_at.getTime())[0] || null;
}

function updateCampaignDeliveryCounts_(campaign, recipients) {
  const h = campaign.headers;
  campaign.values[h.sent_count] = recipients.filter(item => ["Sent", "Sent - needs recording"].includes(String(item.values[item.headers.status] || ""))).length;
  campaign.values[h.blocked_count] = recipients.filter(item => String(item.values[item.headers.status] || "") === "Blocked").length;
  campaign.values[h.app_version] = APP_VERSION;
}

function reconcileBlockedCampaignSends_(sheets, campaign, recipients, staffName, requestedToken) {
  const leadSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const leadHeaders = getHeaderMap_(leadSheet);
  const settings = getOutreachCampaignSettings_();
  const criteria = campaignStoredCriteria_(campaign.values[campaign.headers.criteria]);
  const campaignStage = String(campaignStoredCriteria_(campaign.values[campaign.headers.criteria])?.stage || "Initial");
  const cocktailList = criteria?.campaign_type === "cocktail_list" || criteria?.campaign_type === "customer_invite";
  const changed = [];
  let reconciled = 0;
  let unmatched = 0;
  recipients.filter(item => {
    const status = String(item.values[item.headers.status] || "");
    const token = String(item.values[item.headers.idempotency_token] || "");
    return status === "Blocked" || (requestedToken && token === String(requestedToken) && status === "Ready to send");
  }).forEach(item => {
    const rh = item.headers;
    const accountId = String(item.values[rh.account_id] || "").trim();
    const token = String(item.values[rh.idempotency_token] || "").trim();
    const activity = campaignAcceptedActivity_(accountId, token);
    if (!activity) { unmatched += 1; return; }
    if (cocktailList) {
      item.values[rh.status] = "Sent";
      item.values[rh.result_detail] = "Reconciled from Activity Log: Zoho accepted.";
      item.values[rh.zoho_message_id] = activity.message_id;
      item.values[rh.sent_at] = activity.sent_at;
      item.values[rh.app_version] = APP_VERSION;
      changed.push(item);
      reconciled += 1;
      return;
    }
    const directory = campaignDirectoryRow_(leadSheet, leadHeaders, item);
    if (!directory) { unmatched += 1; return; }
    const record = {
      account_id:String(directory.values.account_id || accountId),
      business:String(outreachValue_(directory.values, ["business", "business_name"]) || item.values[rh.business_name] || ""),
      email:String(outreachValue_(directory.values, ["email", "email_address"]) || item.values[rh.recipient_email] || ""),
    };
    advanceOutreachSend_(leadSheet, directory.row, record, campaignStage, activity.message_id, activity.sent_at, settings);
    item.values[rh.status] = "Sent";
    item.values[rh.result_detail] = "Reconciled from Activity Log: Zoho accepted.";
    item.values[rh.zoho_message_id] = activity.message_id;
    item.values[rh.sent_at] = activity.sent_at;
    item.values[rh.app_version] = APP_VERSION;
    changed.push(item);
    reconciled += 1;
  });
  writeCampaignRecipientRows_(sheets.recipients, changed);
  updateCampaignDeliveryCounts_(campaign, recipients);
  sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
  appendAudit_("RECONCILE_CAMPAIGN_SENDS", "Campaign", String(campaign.values[campaign.headers.campaign_id] || ""), "", staffName, OUTREACH_ACTIVITY_SHEET_NAME, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, "Completed", `${reconciled} reconciled; ${unmatched} checked records without a matching accepted Activity Log record.`);
  return { reconciled:reconciled, blocked_without_match:unmatched, sent_count:Number(campaign.values[campaign.headers.sent_count] || 0), blocked_count:Number(campaign.values[campaign.headers.blocked_count] || 0), recipients:recipients };
}

function apiReconcileCampaignSends_(p) {
  requireFields_(p || {}, ["campaign_id"]);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    const counts = reconcileBlockedCampaignSends_(sheets, campaign, campaignRecipientRows_(sheets.recipients, p.campaign_id), authenticatedActor_(p, "Sturgeon Distribution Hub"), p.idempotency_token);
    const recipientStatuses = counts.recipients.map(item => ({
      idempotency_token:String(item.values[item.headers.idempotency_token] || ""),
      business:String(item.values[item.headers.business_name] || ""),
      status:String(item.values[item.headers.status] || ""),
    }));
    const remaining = recipientStatuses.filter(item => item.status === "Ready to send").length;
    return {
      message:`${counts.reconciled} blocked recipient(s) reconciled from Activity Log. No email was sent.`,
      reconciled:counts.reconciled,
      blocked_without_match:counts.blocked_without_match,
      sent_count:counts.sent_count,
      blocked_count:counts.blocked_count,
      remaining:remaining,
      recipient_statuses:recipientStatuses,
    };
  } finally {
    lock.releaseLock();
  }
}

function reconcileBlockedCampaignSends() {
  try {
    const result = apiReconcileCampaignSends_({ campaign_id:"CMP-89758BA7F1B2483F84E59782BEFEAD39", staff_name:"Karl (editor)" });
    Logger.log(JSON.stringify(result));
    return result;
  } finally {
    bumpReadCacheVersion_();
  }
}

function campaignDirectoryRows_(sheet) {
  const headers = getHeaderMap_(sheet);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues()
    .map((values, index) => {
      const row = {};
      Object.keys(headers).forEach(key => row[key] = values[headers[key]]);
      return { row:index + 2, values:row };
    });
  const byAccount = new Map();
  const bySource = new Map();
  rows.forEach(item => {
    const accountId = String(item.values.account_id || "").trim();
    if (accountId && !byAccount.has(accountId)) byAccount.set(accountId, item);
    bySource.set(item.row, item);
  });
  return { by_account:byAccount, by_source:bySource };
}

function campaignEditedRecipientTokenSet_() {
  const auditSheet = getOutreachSheet_(HUB_AUDIT_SHEET_NAME);
  if (auditSheet.getLastRow() < 2) return new Set();
  return new Set(getAllRowsAsObjects_(auditSheet)
    .filter(row => String(outreachValue_(row, ["action"]) || "") === "EDIT_OUTREACH_CAMPAIGN_RECIPIENT")
    .map(row => String(outreachValue_(row, ["record_id", "Record ID"]) || "").trim())
    .filter(Boolean));
}

function campaignRecipientChecksum_(recipient) {
  const rh = recipient.headers;
  return sha256_([
    recipient.values[rh.source_row], recipient.values[rh.account_id], recipient.values[rh.business_name], recipient.values[rh.recipient_email],
    recipient.values[rh.subject], recipient.values[rh.body_text],
  ].join("|"));
}

function apiRebuildCampaignRecipients_(p) {
  requireFields_(p || {}, ["campaign_id"]);
  const batchSize = Number(p.rebuild_batch_size || 25);
  const batchOffset = Number(p.rebuild_offset || 0);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) throw new Error("Rebuild batch size must be between 1 and 25.");
  if (!Number.isInteger(batchOffset) || batchOffset < 0) throw new Error("Rebuild batch offset must be zero or greater.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    const ch = campaign.headers;
    if (String(campaign.values[ch.status] || "") !== "Review") throw new Error("Campaign must be in Review before unsent emails can be rebuilt.");
    const staffName = authenticatedActor_(p, "Sturgeon Distribution Hub");
    const recipients = campaignRecipientRows_(sheets.recipients, p.campaign_id);
    const reconciliation = batchOffset === 0
      ? reconcileBlockedCampaignSends_(sheets, campaign, recipients, staffName)
      : { reconciled:0, blocked_without_match:0 };
    const leadSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const directory = campaignDirectoryRows_(leadSheet);
    const settings = getOutreachCampaignSettings_();
    const draftMap = outreachDraftMap_();
    const criteria = campaignStoredCriteria_(campaign.values[ch.criteria]);
    const campaignStage = String(campaignStoredCriteria_(campaign.values[ch.criteria])?.stage || "Initial");
    const cocktailList = criteria?.campaign_type === "cocktail_list";
    const customerInvite = criteria?.campaign_type === "customer_invite";
    const editedRecipientTokens = campaignEditedRecipientTokenSet_();
    const readyRecipients = recipients.filter(item => String(item.values[item.headers.status] || "") === "Ready for review");
    const rebuildRecipients = readyRecipients.slice(batchOffset, batchOffset + batchSize);
    if (!rebuildRecipients.length) {
      return { message:"No additional unsent campaign emails need rebuilding.", rebuilt:0, rebuilt_with_edits_kept:0, skipped:0, reconciled:reconciliation.reconciled, processed:0, remaining:0 };
    }
    const changed = [];
    let rebuilt = 0;
    let rebuiltWithEditsKept = 0;
    let skipped = 0;
    rebuildRecipients.forEach(item => {
      const rh = item.headers;
      if (customerInvite) {
        let live;
        try { live = liveCustomerInviteRecipient_(item.values[rh.source_row]); }
        catch (error) { live = null; }
        if (!live || live.reasons.length || live.record.business !== String(item.values[rh.business_name] || "") || String(live.record.email || "").trim().toLowerCase() !== String(item.values[rh.recipient_email] || "").trim().toLowerCase()) {
          item.values[rh.result_detail] = `Skipped — customer row changed or is no longer eligible${live && live.reasons.length ? ` (${live.reasons.join("; ")})` : ""}.`;
          item.values[rh.app_version] = APP_VERSION;
          changed.push(item);
          skipped += 1;
          return;
        }
        const message = customerInviteMessage_(live.record, settings);
        if (editedRecipientTokens.has(String(item.values[rh.idempotency_token] || ""))) {
          // The edited text is kept; the footer (link, sign-off, address) is always re-attached.
          item.values[rh.html] = outreachPlainTextToHtml_(String(item.values[rh.body_text] || "")) + String(message.footer_html || "");
          rebuiltWithEditsKept += 1;
        } else {
          item.values[rh.subject] = message.subject;
          item.values[rh.body_text] = message.body_text;
          item.values[rh.html] = message.html;
          rebuilt += 1;
        }
        if (rh.footer_html !== undefined) item.values[rh.footer_html] = String(message.footer_html || "");
        item.values[rh.content_checksum] = campaignRecipientChecksum_(item);
        if (rh.message_stage !== undefined) item.values[rh.message_stage] = OUTREACH_CUSTOMER_INVITE_STAGE;
        item.values[rh.result_detail] = "Rebuilt with current order-online invite template.";
        item.values[rh.app_version] = APP_VERSION;
        changed.push(item);
        return;
      }
      if (cocktailList) {
        let record;
        try {
          record = liveCocktailListRecipient_(rh.newsletter_contact_id === undefined ? "" : item.values[rh.newsletter_contact_id]);
        } catch (error) {
          item.values[rh.result_detail] = "Skipped — newsletter contact changed.";
          item.values[rh.app_version] = APP_VERSION;
          changed.push(item);
          skipped += 1;
          return;
        }
        if (record.business !== String(item.values[rh.business_name] || "") || record.email.toLowerCase() !== String(item.values[rh.recipient_email] || "").trim().toLowerCase() || newsletterCocktailListEligibility_(record).length) {
          item.values[rh.result_detail] = "Skipped — newsletter contact changed or is no longer eligible.";
          item.values[rh.app_version] = APP_VERSION;
          changed.push(item);
          skipped += 1;
          return;
        }
        const message = cocktailListMessage_(record, settings);
        if (editedRecipientTokens.has(String(item.values[rh.idempotency_token] || ""))) {
          item.values[rh.html] = outreachPlainTextToHtml_(String(item.values[rh.body_text] || "")) + String(message.footer_html || "");
          if (rh.footer_html !== undefined) item.values[rh.footer_html] = String(message.footer_html || "");
          rebuiltWithEditsKept += 1;
        } else {
          item.values[rh.subject] = message.subject;
          item.values[rh.body_text] = message.body_text;
          item.values[rh.html] = message.html;
          if (rh.footer_html !== undefined) item.values[rh.footer_html] = String(message.footer_html || "");
          rebuilt += 1;
        }
        item.values[rh.content_checksum] = campaignRecipientChecksum_(item);
        if (rh.message_stage !== undefined) item.values[rh.message_stage] = OUTREACH_COCKTAIL_LIST_STAGE;
        item.values[rh.result_detail] = "Rebuilt with current Cocktail list template.";
        item.values[rh.app_version] = APP_VERSION;
        changed.push(item);
        return;
      }
      const accountId = String(item.values[rh.account_id] || "").trim();
      const sourceRow = Number(item.values[rh.source_row] || 0);
      const current = directory.by_account.get(accountId) || directory.by_source.get(sourceRow);
      const currentBusiness = String(outreachValue_(current?.values || {}, ["business", "business_name"]) || "").trim();
      const currentEmail = String(outreachValue_(current?.values || {}, ["email", "email_address"]) || "").trim().toLowerCase();
      if (!current || currentBusiness !== String(item.values[rh.business_name] || "").trim() || currentEmail !== String(item.values[rh.recipient_email] || "").trim().toLowerCase()) {
        item.values[rh.result_detail] = "Skipped — directory changed.";
        item.values[rh.app_version] = APP_VERSION;
        changed.push(item);
        skipped += 1;
        return;
      }
      const currentStage = String(outreachValue_(current.values, ["next_email", "stage"]) || "Initial").trim();
      if (currentStage.toLowerCase() !== campaignStage.toLowerCase()) {
        item.values[rh.result_detail] = "Skipped — outreach stage changed.";
        item.values[rh.app_version] = APP_VERSION;
        changed.push(item);
        skipped += 1;
        return;
      }
      const source = Object.assign({}, current.values, { next_email:campaignStage, stage:campaignStage });
      const draft = draftMap.get(outreachDraftKey_(accountId || current.row, campaignStage)) || draftMap.get(outreachDraftKey_(current.row, campaignStage));
      const message = outreachMessage_(source, settings, draft, false);
      if (editedRecipientTokens.has(String(item.values[rh.idempotency_token] || ""))) {
        item.values[rh.html] = outreachPlainTextToHtml_(String(item.values[rh.body_text] || "")) + String(message.footer_html || "");
        if (rh.footer_html !== undefined) item.values[rh.footer_html] = String(message.footer_html || "");
        rebuiltWithEditsKept += 1;
      } else {
        item.values[rh.subject] = message.subject;
        item.values[rh.body_text] = message.body_text;
        item.values[rh.html] = message.html;
        if (rh.footer_html !== undefined) item.values[rh.footer_html] = String(message.footer_html || "");
        rebuilt += 1;
      }
      item.values[rh.content_checksum] = campaignRecipientChecksum_(item);
      if (rh.message_stage !== undefined) item.values[rh.message_stage] = campaignStage;
      item.values[rh.result_detail] = "Rebuilt with current template.";
      item.values[rh.app_version] = APP_VERSION;
      changed.push(item);
    });
    writeCampaignRecipientRows_(sheets.recipients, changed);
    campaign.values[ch.audience_checksum] = campaignAudienceChecksum_(campaign.values[ch.audience], recipients, campaign.values[ch.criteria]);
    campaign.values[ch.status] = "Review";
    campaign.values[ch.approved_at] = "";
    campaign.values[ch.approved_by] = "";
    campaign.values[ch.approval_token] = "";
    updateCampaignDeliveryCounts_(campaign, recipients);
    sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
    const remaining = Math.max(0, readyRecipients.length - batchOffset - rebuildRecipients.length);
    appendAudit_("REBUILD_CAMPAIGN_RECIPIENTS", "Campaign", p.campaign_id, "", staffName, OUTREACH_SHEET_NAME, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, "Review", `${rebuilt} rebuilt; ${rebuiltWithEditsKept} rebuilt with edits kept; ${skipped} skipped — directory changed; ${reconciliation.reconciled} reconciled; ${remaining} rebuild recipients remain.`);
    return {
      message:`${rebuilt} rebuilt; ${rebuiltWithEditsKept} rebuilt with edits kept; ${skipped} skipped; ${reconciliation.reconciled} reconciled; ${remaining} remain. Campaign remains in Review and must be approved again.`,
      rebuilt:rebuilt,
      rebuilt_with_edits_kept:rebuiltWithEditsKept,
      skipped:skipped,
      reconciled:reconciliation.reconciled,
      processed:rebuildRecipients.length,
      remaining:remaining,
    };
  } finally {
    lock.releaseLock();
  }
}

function rebuildUnsentCampaignEmails() {
  try {
    const campaignId = "CMP-89758BA7F1B2483F84E59782BEFEAD39";
    const results = [];
    let offset = 0;
    while (true) {
      const result = apiRebuildCampaignRecipients_({ campaign_id:campaignId, staff_name:"Karl (editor)", rebuild_batch_size:25, rebuild_offset:offset });
      results.push(result);
      Logger.log(JSON.stringify(result));
      if (!Number(result.remaining || 0) || !Number(result.processed || 0)) break;
      offset += Number(result.processed);
    }
    return results;
  } finally {
    bumpReadCacheVersion_();
  }
}

function campaignRecipientFooterHtml_(recipient, settings, draftMap) {
  const rh = recipient.headers;
  const stored = rh.footer_html === undefined ? "" : String(recipient.values[rh.footer_html] || "");
  if (stored) return stored;
  if (String(recipient.values[rh.message_stage] || "") === OUTREACH_CUSTOMER_INVITE_STAGE) {
    return customerInviteFooterHtml_({ account_id:recipient.values[rh.account_id], business:recipient.values[rh.business_name], email:recipient.values[rh.recipient_email], contact:recipient.values[rh.contact] }, settings);
  }
  if (String(recipient.values[rh.message_stage] || "") === OUTREACH_COCKTAIL_LIST_STAGE) {
    return `<p>${escapeOutreachHtml_(String(settings["Physical mailing address"] || ""))}</p><p>Reply stop to unsubscribe.</p>`;
  }
  const sourceRow = Number(recipient.values[rh.source_row] || 0);
  const leadSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  if (!Number.isInteger(sourceRow) || sourceRow < 2 || sourceRow > leadSheet.getLastRow()) return "";
  const headers = getHeaderMap_(leadSheet);
  const values = leadSheet.getRange(sourceRow, 1, 1, leadSheet.getLastColumn()).getValues()[0];
  const source = {};
  Object.keys(headers).forEach(key => source[key] = values[headers[key]]);
  const stage = String(outreachValue_(source, ["next_email", "stage"]) || "Initial").trim();
  const accountId = String(source.account_id || "").trim();
  const draft = draftMap.get(outreachDraftKey_(accountId || sourceRow, stage)) || draftMap.get(outreachDraftKey_(sourceRow, stage));
  return String(outreachMessage_(source, settings, draft).footer_html || "");
}

function apiSetOutreachCampaignRecipientExclusion_(p) {
  requireFields_(p || {}, ["campaign_id", "idempotency_token"]);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    if (String(campaign.values[campaign.headers.status] || "") !== "Review") throw new Error("Only a campaign in Review can change recipient exclusions.");
    const recipient = campaignRecipientRows_(sheets.recipients, p.campaign_id)
      .find(item => String(item.values[item.headers.idempotency_token] || "") === String(p.idempotency_token || ""));
    if (!recipient) throw new Error("Campaign recipient not found.");
    const rh = recipient.headers;
    if (["Sent", "Sent - needs recording"].includes(String(recipient.values[rh.status] || ""))) throw new Error("Sent recipients cannot be excluded or restored.");
    const exclude = p.exclude === true;
    const reason = publicText_(p.reason || "", 500, "Exclusion reason");
    if (exclude && !reason) throw new Error("Provide a reason before excluding a recipient.");
    recipient.values[rh.status] = exclude ? "Excluded" : "Ready for review";
    recipient.values[rh.result_detail] = exclude ? `Excluded from this campaign: ${reason}` : "Restored for campaign review.";
    recipient.values[rh.app_version] = APP_VERSION;
    sheets.recipients.getRange(recipient.row, 1, 1, recipient.values.length).setValues([recipient.values]);
    appendAudit_(exclude ? "EXCLUDE_OUTREACH_CAMPAIGN_RECIPIENT" : "RESTORE_OUTREACH_CAMPAIGN_RECIPIENT", "Campaign recipient", String(p.idempotency_token), String(recipient.values[rh.account_id] || ""), authenticatedActor_(p, "Sturgeon Distribution Hub"), OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, OUTREACH_CAMPAIGNS_SHEET_NAME, exclude ? "Excluded" : "Review", `${recipient.values[rh.business_name]}${exclude ? `: ${reason}` : ""}`);
    return { message:exclude ? "Recipient excluded from this campaign. No email was sent." : "Recipient restored for campaign review. No email was sent.", status:String(recipient.values[rh.status] || "") };
  } finally {
    lock.releaseLock();
  }
}

function apiSetOutreachCampaignRecipientExclusions_(p) {
  requireFields_(p || {}, ["campaign_id"]);
  const tokens = Array.from(new Set((p.idempotency_tokens || []).map(String).filter(Boolean)));
  if (!tokens.length) throw new Error("Select at least one recipient to exclude.");
  if (tokens.length > 500) throw new Error("Exclude no more than 500 recipients at once.");
  const reason = publicText_(p.reason || "", 500, "Exclusion reason");
  if (!reason) throw new Error("Provide one reason before excluding recipients.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    if (String(campaign.values[campaign.headers.status] || "") !== "Review") throw new Error("Only a campaign in Review can change recipient exclusions.");
    const selected = campaignRecipientRows_(sheets.recipients, p.campaign_id)
      .filter(item => tokens.includes(String(item.values[item.headers.idempotency_token] || "")));
    if (selected.length !== tokens.length) throw new Error("One or more selected recipients are no longer in this campaign.");
    if (selected.some(item => ["Sent", "Sent - needs recording"].includes(String(item.values[item.headers.status] || "")))) throw new Error("Sent recipients cannot be excluded.");
    selected.forEach(item => {
      item.values[item.headers.status] = "Excluded";
      item.values[item.headers.result_detail] = `Excluded from this campaign: ${reason}`;
    });
    selected.forEach(item => {
      const rh = item.headers;
      const statusColumn = rh.status + 1;
      const detailColumn = rh.result_detail + 1;
      if (detailColumn === statusColumn + 1) {
        sheets.recipients.getRange(item.row, statusColumn, 1, 2).setValues([[item.values[rh.status], item.values[rh.result_detail]]]);
      } else {
        sheets.recipients.getRange(item.row, statusColumn).setValue(item.values[rh.status]);
        sheets.recipients.getRange(item.row, detailColumn).setValue(item.values[rh.result_detail]);
      }
    });
    const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
    appendAudit_("BULK_EXCLUDE_OUTREACH_CAMPAIGN_RECIPIENTS", "Campaign", p.campaign_id, "", actor, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, OUTREACH_CAMPAIGNS_SHEET_NAME, "Excluded", `${selected.length} recipients: ${reason}`);
    return { message:`${selected.length} recipients excluded from this campaign. No email was sent.`, excluded:selected.length };
  } finally { lock.releaseLock(); }
}

function apiUpdateOutreachCampaignRecipient_(p) {
  requireFields_(p || {}, ["campaign_id", "idempotency_token", "subject", "body_text", "content_checksum"]);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    const ch = campaign.headers;
    if (String(campaign.values[ch.status] || "") !== "Review") throw new Error("Only a campaign in Review can be edited.");
    const recipient = campaignRecipientRows_(sheets.recipients, p.campaign_id)
      .find(item => String(item.values[item.headers.idempotency_token] || "") === String(p.idempotency_token || ""));
    if (!recipient) throw new Error("Campaign recipient not found.");
    const rh = recipient.headers;
    if (String(recipient.values[rh.status] || "") !== "Ready for review") throw new Error("Only an unsent recipient returned to review can be edited.");
    if (String(recipient.values[rh.content_checksum] || "") !== String(p.content_checksum || "")) throw new Error("This email was changed elsewhere. Refresh the campaign before editing it.");
    const subject = publicText_(p.subject, 500, "Email subject");
    const bodyText = publicText_(p.body_text, 20000, "Email message");
    if (!subject || !bodyText) throw new Error("Email subject and message are required.");
    const footerHtml = campaignRecipientFooterHtml_(recipient, getOutreachCampaignSettings_(), outreachDraftMap_());
    const checksum = sha256_([recipient.values[rh.source_row], recipient.values[rh.account_id], recipient.values[rh.business_name], recipient.values[rh.recipient_email], subject, bodyText].join("|"));
    recipient.values[rh.subject] = subject;
    recipient.values[rh.body_text] = bodyText;
    recipient.values[rh.html] = outreachPlainTextToHtml_(bodyText) + footerHtml;
    if (rh.footer_html !== undefined) recipient.values[rh.footer_html] = footerHtml;
    recipient.values[rh.content_checksum] = checksum;
    recipient.values[rh.app_version] = APP_VERSION;
    sheets.recipients.getRange(recipient.row, 1, 1, recipient.values.length).setValues([recipient.values]);
    const recipients = campaignRecipientRows_(sheets.recipients, p.campaign_id);
    campaign.values[ch.audience_checksum] = campaignAudienceChecksum_(campaign.values[ch.audience], recipients, campaign.values[ch.criteria]);
    campaign.values[ch.app_version] = APP_VERSION;
    sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
    appendAudit_("EDIT_OUTREACH_CAMPAIGN_RECIPIENT", "Campaign recipient", String(p.idempotency_token), String(recipient.values[rh.account_id] || ""), authenticatedActor_(p, "Sturgeon Distribution Hub"), OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, OUTREACH_CAMPAIGNS_SHEET_NAME, "Review", `Edited ${recipient.values[rh.business_name]}.`);
    return { message:"Campaign email saved. No email was sent.", content_checksum:checksum, audience_checksum:String(campaign.values[ch.audience_checksum] || "") };
  } finally {
    lock.releaseLock();
  }
}

function apiPreviewOutreachCampaign_(p) {
  const criteria = campaignCriteriaFromRequest_(p);
  const invite = criteria.campaign_type === "customer_invite" ? campaignCustomerInviteSelection_(criteria) : null;
  const records = invite ? invite.records : criteria.campaign_type === "cocktail_list" ? campaignCocktailListRecords_(criteria) : campaignDirectoryInitialRecords_(criteria);
  return {
    criteria:criteria,
    excluded:invite ? invite.excluded : undefined,
    excluded_names:invite ? invite.excluded_names : undefined,
    warnings:invite ? invite.warnings : undefined,
    audience:campaignAudienceLabel_(criteria),
    recipient_count:records.length,
    recipients:records.map(record => ({
      source_row:record.source_row,
      business:record.business,
      city:record.city,
      postal_code:record.postal_code,
      miles_from_center:record.campaign_miles,
      craft_spirit_fit:record.craft_spirit_fit || "",
      status:record.status,
      invite_reason:record.invite_reason || "",
      email:record.email,
      last_emailed:record.last_emailed,
    })),
  };
}

function apiCreateOutreachCampaign_(p) {
  if (p?.preview_confirmed !== true) throw new Error("Preview the campaign audience and confirm it before creating a campaign.");
  const criteria = campaignCriteriaFromRequest_(p);
  const name = publicText_(p?.campaign_name || (criteria.campaign_type === "cocktail_list" ? "Cocktail list" : criteria.campaign_type === "customer_invite" ? "Order online invite" : "Initial prospect campaign"), 120, "Campaign name");
  const audience = campaignAudienceLabel_(criteria);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const eligibility = criteria.campaign_type === "cocktail_list"
      ? { records:campaignCocktailListRecords_(criteria), preview_count:0, removed_by_duplicate_checks:0 }
      : criteria.campaign_type === "customer_invite"
        ? { records:campaignCustomerInviteSelection_(criteria).records, preview_count:0, removed_by_duplicate_checks:0 }
        : campaignEligibleInitialRecords_(criteria);
    const eligible = eligibility.records;
    if (!eligible.length) throw new Error(criteria.campaign_type === "cocktail_list" ? "No subscribed newsletter contacts are eligible for a cocktail list campaign."
      : criteria.campaign_type === "customer_invite" ? "No current customers are eligible for an order-online invite." : "No eligible initial prospects are available for a campaign.");
    const campaignId = permanentId_("CMP");
    const recipientRows = eligible.map(record => campaignRecipientSnapshotValues_(sheets.recipients, campaignId, record));
    const recipientHeaders = getHeaderMap_(sheets.recipients);
    const criteriaJson = JSON.stringify(criteria);
    const audienceChecksum = campaignAudienceChecksum_(audience, recipientRows.map(values => ({ values:values, headers:recipientHeaders })), criteriaJson);
    const unsegmentedCount = ["cocktail_list", "customer_invite"].includes(criteria.campaign_type) ? 0 : eligible.filter(record => !String(record.segment || "").trim()).length;
    const campaignHeaders = getHeaderMap_(sheets.campaigns);
    if (sheets.campaigns.getLastRow() >= 2) {
      const matching = sheets.campaigns.getRange(2, 1, sheets.campaigns.getLastRow() - 1, sheets.campaigns.getLastColumn()).getValues()
        .find(row => ["Review", "Approved"].includes(String(row[campaignHeaders.status] || "")) && String(row[campaignHeaders.audience_checksum] || "") === audienceChecksum);
      if (matching) {
        return { message:"A matching active campaign already exists. No duplicate was created.", campaign_id:String(matching[campaignHeaders.campaign_id]), recipient_count:Number(matching[campaignHeaders.recipient_count] || eligible.length), audience_checksum:audienceChecksum, unsegmented_count:Number(matching[campaignHeaders.unsegmented_count] || unsegmentedCount), preview_recipient_count:eligibility.preview_count, removed_by_duplicate_checks:eligibility.removed_by_duplicate_checks, already_exists:true };
      }
    }
    sheets.recipients.getRange(sheets.recipients.getLastRow() + 1, 1, recipientRows.length, recipientRows[0].length).setValues(recipientRows);
    const campaignValues = Array(sheets.campaigns.getLastColumn()).fill("");
    const setCampaign = (key, value) => { if (campaignHeaders[key] !== undefined) campaignValues[campaignHeaders[key]] = value; };
    setCampaign("campaign_id", campaignId); setCampaign("campaign_name", name); setCampaign("audience", audience); setCampaign("status", "Review");
    setCampaign("recipient_count", eligible.length); setCampaign("audience_checksum", audienceChecksum); setCampaign("unsegmented_count", unsegmentedCount);
    setCampaign("created_at", new Date()); setCampaign("created_by", authenticatedActor_(p, "Sturgeon Distribution Hub"));
    setCampaign("sent_count", 0); setCampaign("blocked_count", 0); setCampaign("app_version", APP_VERSION); setCampaign("criteria", criteriaJson);
    sheets.campaigns.getRange(sheets.campaigns.getLastRow() + 1, 1, 1, campaignValues.length).setValues([campaignValues]);
    appendAudit_("CREATE_OUTREACH_CAMPAIGN", "Campaign", campaignId, "", authenticatedActor_(p, "Sturgeon Distribution Hub"), OUTREACH_SHEET_NAME, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, "Review", `${eligible.length} frozen recipients; ${audience}.`);
    return { message:"Campaign created for review. No email was sent.", campaign_id:campaignId, recipient_count:eligible.length, audience_checksum:audienceChecksum, unsegmented_count:unsegmentedCount, preview_recipient_count:eligibility.preview_count, removed_by_duplicate_checks:eligibility.removed_by_duplicate_checks };
  } finally { lock.releaseLock(); }
}

function apiApproveOutreachCampaign_(p) {
  requireFields_(p || {}, ["campaign_id", "audience_checksum", "staff_name"]);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    const h = campaign.headers;
    if (String(campaign.values[h.status] || "") !== "Review") throw new Error("Only a campaign awaiting review can be approved.");
    if (String(campaign.values[h.audience_checksum] || "") !== String(p.audience_checksum || "")) throw new Error("Campaign recipients changed. Refresh and review again.");
    const recipients = campaignRecipientRows_(sheets.recipients, p.campaign_id);
    if (Number(p.recipient_count || 0) !== recipients.length) throw new Error("Recipient count confirmation does not match this campaign.");
    const criteria = campaignStoredCriteria_(campaign.values[h.criteria]);
    const unsegmented = ["cocktail_list", "customer_invite"].includes(criteria?.campaign_type) ? 0 : recipients.filter(item => !String(item.values[item.headers.segment] || "").trim()).length;
    if (unsegmented && p.confirm_unsegmented !== true) throw new Error(`${unsegmented} recipients have no segment. Confirm the default template before approval.`);
    const token = Utilities.getUuid().replace(/-/g, "");
    const now = new Date();
    campaign.values[h.status] = "Approved"; campaign.values[h.approved_at] = now; campaign.values[h.approved_by] = authenticatedActor_(p, "Sturgeon Distribution Hub"); campaign.values[h.approval_token] = token;
    clearCampaignSchedule_(campaign, "");
    campaign.values[h.app_version] = APP_VERSION;
    sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
    recipients.filter(item => String(item.values[item.headers.status] || "") === "Ready for review").forEach(item => {
      item.values[item.headers.status] = "Ready to send";
      item.values[item.headers.app_version] = APP_VERSION;
      sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
    });
    appendAudit_("APPROVE_OUTREACH_CAMPAIGN", "Campaign", p.campaign_id, "", authenticatedActor_(p, "Sturgeon Distribution Hub"), OUTREACH_CAMPAIGNS_SHEET_NAME, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, "Approved", `${recipients.length} recipients approved.`);
    return { message:"Campaign approved. No email was sent.", approval_token:token, recipient_count:recipients.length };
  } finally { lock.releaseLock(); }
}

function apiReopenOutreachCampaign_(p) {
  requireFields_(p || {}, ["campaign_id", "staff_name"]);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    const ch = campaign.headers;
    const campaignStatus = String(campaign.values[ch.status] || "");
    if (!["Review", "Approved", "Complete with blocks"].includes(campaignStatus)) {
      throw new Error(`This campaign is ${campaignStatus || "not in a reopenable state"} and cannot be reopened.`);
    }
    const recipients = campaignRecipientRows_(sheets.recipients, p.campaign_id);
    const acceptedTokens = new Set(outreachActivityRows_().filter(row => {
      const result = String(row.result || "").toUpperCase();
      return row.idempotency_token && result.includes("SENT") && !result.includes("TEST");
    }).map(row => String(row.idempotency_token)));
    const reopenable = recipients.filter(item => {
      const rh = item.headers;
      const status = String(item.values[rh.status] || "");
      if (status === "Ready to send") return true;
      return status === "Blocked"
        && !String(item.values[rh.zoho_message_id] || "").trim()
        && !acceptedTokens.has(String(item.values[rh.idempotency_token] || ""));
    });
    if (!reopenable.length) {
      throw new Error(campaignStatus === "Review"
        ? "Nothing to reopen. Every unsent recipient is already editable, and any blocked recipient with a recorded accepted send was left alone."
        : "There are no unsent campaign recipients to reopen.");
    }
    const leadSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const leadHeaders = getHeaderMap_(leadSheet);
    let correctedSubjects = 0;
    let reopenedBlocked = 0;
    reopenable.forEach(item => {
      const rh = item.headers;
      const wasBlocked = String(item.values[rh.status] || "") === "Blocked";
      const sourceRow = Number(item.values[rh.source_row] || 0);
      const source = sourceRow >= 2 && sourceRow <= leadSheet.getLastRow()
        ? leadSheet.getRange(sourceRow, 1, 1, leadSheet.getLastColumn()).getValues()[0] : null;
      const city = source && leadHeaders.city !== undefined ? String(source[leadHeaders.city] || "").trim().toLowerCase() : "";
      const currentSubject = String(item.values[rh.subject] || "");
      if (city && city !== "oshkosh" && currentSubject.includes("made here in Oshkosh")) {
        item.values[rh.subject] = currentSubject.replace("made here in Oshkosh", "made in Oshkosh");
        item.values[rh.content_checksum] = sha256_([item.values[rh.source_row], item.values[rh.account_id], item.values[rh.business_name], item.values[rh.recipient_email], item.values[rh.subject], item.values[rh.body_text]].join("|"));
        correctedSubjects += 1;
      }
      item.values[item.headers.status] = "Ready for review";
      item.values[item.headers.result_detail] = wasBlocked
        ? `Reopened after block: ${String(item.values[item.headers.result_detail] || "").slice(0, 300)}`
        : "Reopened for edits before delivery.";
      item.values[item.headers.app_version] = APP_VERSION;
      sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
      if (wasBlocked) reopenedBlocked += 1;
    });
    const updatedRecipients = campaignRecipientRows_(sheets.recipients, p.campaign_id);
    campaign.values[ch.audience_checksum] = campaignAudienceChecksum_(campaign.values[ch.audience], updatedRecipients, campaign.values[ch.criteria]);
    campaign.values[ch.status] = "Review";
    campaign.values[ch.approved_at] = "";
    campaign.values[ch.approved_by] = "";
    campaign.values[ch.approval_token] = "";
    if (CAMPAIGN_SCHEDULE_ACTIVE_STATUSES.includes(String(campaign.values[ch.schedule_status] || ""))) clearCampaignSchedule_(campaign, "Cancelled", "Cancelled because the campaign was reopened for edits.");
    campaign.values[ch.app_version] = APP_VERSION;
    sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
    appendAudit_("REOPEN_OUTREACH_CAMPAIGN", "Campaign", p.campaign_id, "", authenticatedActor_(p, "Sturgeon Distribution Hub"), OUTREACH_CAMPAIGNS_SHEET_NAME, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, "Review", `${reopenable.length} recipients reopened (${reopenedBlocked} previously blocked); ${correctedSubjects} non-Oshkosh subjects corrected; sent and excluded recipients were unchanged.`);
    return { message:`${reopenable.length} recipients reopened (${reopenedBlocked} previously blocked); ${correctedSubjects} non-Oshkosh subjects corrected. No email was sent.`, recipient_count:reopenable.length, reopened_blocked:reopenedBlocked, corrected_subjects:correctedSubjects };
  } finally { lock.releaseLock(); }
}

function apiSendOutreachCampaignBatch_(p) {
  requireFields_(p || {}, ["campaign_id", "approval_token", "staff_name"]);
  const requestedSize = Number(p.batch_size || 10);
  if (!Number.isInteger(requestedSize) || requestedSize < 1 || requestedSize > 20) throw new Error("Batch size must be between 1 and 20.");
  // Optional wall-clock stop used by the scheduler so a trigger run never starts a recipient near Apps Script's 6-minute limit.
  const deadlineAt = Number(p.deadline_at || 0);
  const startedAt = Date.now();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error("Another outreach send is in progress. Wait a moment and try again.");
  const lockMs = Date.now() - startedAt;
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    const ch = campaign.headers;
    if (String(campaign.values[ch.status] || "") !== "Approved") throw new Error("Campaign must be approved before delivery.");
    if (String(campaign.values[ch.approval_token] || "") !== String(p.approval_token || "")) throw new Error("Campaign approval is not valid. Refresh and review again.");
    const campaignCriteria = campaignStoredCriteria_(campaign.values[ch.criteria]);
    const campaignStage = String(campaignCriteria?.stage || "Initial");
    const recipients = campaignRecipientRows_(sheets.recipients, p.campaign_id)
      .filter(item => String(item.values[item.headers.status] || "") === "Ready to send").slice(0, requestedSize);
    if (!recipients.length) return { message:"No campaign recipients are waiting to send.", sent:0, blocked:0, remaining:0, results:[] };
    const leadSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const leadHeaders = getHeaderMap_(leadSheet);
    const staffName = authenticatedActor_(p, "Sturgeon Distribution Hub");
    const results = []; let sent = 0; let blocked = 0;
    for (const item of recipients) {
      if (deadlineAt && Date.now() > deadlineAt) break;
      const rh = item.headers;
      const sourceRow = Number(item.values[rh.source_row] || 0);
      let result = null;
      let mailerAttempted = false;
      const recipientStartedAt = Date.now();
      const timing = { lock_ms:lockMs };
      const recipientName = String(item.values[rh.business_name] || "");
      try {
        if (campaignCriteria?.campaign_type === "customer_invite") {
          const live = liveCustomerInviteRecipient_(sourceRow);
          const record = live.record;
          if (record.business !== recipientName || String(record.email || "").toLowerCase() !== String(item.values[rh.recipient_email] || "").toLowerCase()) throw new Error("Customer or recipient changed after review.");
          if (rh.message_stage !== undefined && String(item.values[rh.message_stage] || "") !== OUTREACH_CUSTOMER_INVITE_STAGE) throw new Error("Frozen recipient type does not match this campaign.");
          const token = String(item.values[rh.idempotency_token] || "");
          const prior = acceptedOutreachSendForToken_(token);
          // A send already accepted for this token is recovered, not blocked as "Invite already sent".
          if (!prior && live.reasons.length) throw new Error(live.reasons.join("; "));
          mailerAttempted = !prior;
          result = prior || callOutreachMailer_({ action:"sendCustomerEmail", idempotency_token:token, account_id:record.account_id,
            source_row:sourceRow, business:record.business, recipient:record.email, message_stage:OUTREACH_CUSTOMER_INVITE_STAGE,
            subject:String(item.values[rh.subject] || ""), html:String(item.values[rh.html] || ""), requested_by:staffName });
          if (!result.accepted || !String(result.message_id || "").trim()) throw new Error("Zoho did not return a verified message ID.");
          const sentAt = result.sent_at ? new Date(result.sent_at) : new Date();
          const acceptedAt = isNaN(sentAt.getTime()) ? new Date() : sentAt;
          outreachNoteRecentSend_(record.email, "sales", acceptedAt);
          customerInviteSentEmails_().add(String(record.email || "").trim().toLowerCase());
          item.values[rh.status] = "Sent"; item.values[rh.result_detail] = result.idempotent ? "Previously accepted and recovered." : "Zoho accepted delivery.";
          item.values[rh.zoho_message_id] = String(result.message_id); item.values[rh.sent_at] = acceptedAt; item.values[rh.app_version] = APP_VERSION;
          sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
          sent += 1; results.push({ source_row:sourceRow, business:record.business, status:"Sent", message_id:String(result.message_id) });
          continue;
        }
        if (campaignCriteria?.campaign_type === "cocktail_list") {
          const record = liveCocktailListRecipient_(rh.newsletter_contact_id === undefined ? "" : item.values[rh.newsletter_contact_id]);
          if (record.business !== recipientName || record.email.toLowerCase() !== String(item.values[rh.recipient_email] || "").toLowerCase()) throw new Error("Newsletter contact or recipient changed after review.");
          if (rh.message_stage !== undefined && String(item.values[rh.message_stage] || "") !== OUTREACH_COCKTAIL_LIST_STAGE) throw new Error("Frozen recipient type does not match this campaign.");
          const reasons = newsletterCocktailListEligibility_(record);
          if (reasons.length) throw new Error(reasons.join("; "));
          const token = String(item.values[rh.idempotency_token] || "");
          const prior = acceptedOutreachSendForToken_(token);
          mailerAttempted = !prior;
          result = prior || callOutreachMailer_({ action:"sendNewsletterEmail", idempotency_token:token, account_id:record.account_id,
            newsletter_contact_id:record.newsletter_contact_id, business:record.business, recipient:record.email, message_stage:OUTREACH_COCKTAIL_LIST_STAGE,
            subject:String(item.values[rh.subject] || ""), html:String(item.values[rh.html] || ""), requested_by:staffName });
          if (!result.accepted || !String(result.message_id || "").trim()) throw new Error("Zoho did not return a verified message ID.");
          const sentAt = result.sent_at ? new Date(result.sent_at) : new Date();
          const acceptedAt = isNaN(sentAt.getTime()) ? new Date() : sentAt;
          outreachNoteRecentSend_(record.email, "cocktail", acceptedAt);
          item.values[rh.status] = "Sent"; item.values[rh.result_detail] = result.idempotent ? "Previously accepted and recovered." : "Zoho accepted delivery.";
          item.values[rh.zoho_message_id] = String(result.message_id); item.values[rh.sent_at] = acceptedAt; item.values[rh.app_version] = APP_VERSION;
          sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
          sent += 1; results.push({ source_row:sourceRow, business:record.business, status:"Sent", message_id:String(result.message_id) });
          continue;
        }
        if (!Number.isInteger(sourceRow) || sourceRow < 2 || sourceRow > leadSheet.getLastRow()) throw new Error("Source lead no longer exists.");
        const raw = leadSheet.getRange(sourceRow, 1, 1, leadSheet.getLastColumn()).getValues()[0];
        const current = {}; Object.keys(leadHeaders).forEach(key => current[key] = raw[leadHeaders[key]]);
        timing.row_read_ms = Date.now() - recipientStartedAt;
        const record = campaignSendLightweightRecord_(current, sourceRow);
        if (record.business !== String(item.values[rh.business_name] || "") || record.email.toLowerCase() !== String(item.values[rh.recipient_email] || "").toLowerCase()) throw new Error("Business or recipient changed after review.");
        if (String(record.next_email || "").trim().toLowerCase() !== campaignStage.toLowerCase()) throw new Error("Outreach stage changed after review.");
        if (rh.message_stage !== undefined && String(item.values[rh.message_stage] || "").trim().toLowerCase() !== campaignStage.toLowerCase()) throw new Error("Frozen recipient stage does not match this campaign.");
        const criteriaFailures = campaignCriteriaFailures_(record, campaignCriteria);
        if (criteriaFailures.length) {
          const status = criteriaFailures.includes("distance") ? "Excluded — out of area"
            : criteriaFailures.includes("fit") ? "Excluded — below fit"
            : "Excluded — no longer matches criteria";
          item.values[rh.status] = status;
          item.values[rh.result_detail] = `Excluded at send time: ${criteriaFailures.join("; ")}.`;
          item.values[rh.app_version] = APP_VERSION;
          sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
          results.push({ source_row:sourceRow, business:record.business, status:status, detail:criteriaFailures.join("; ") });
          continue;
        }
        const token = String(item.values[rh.idempotency_token] || "");
        const prior = acceptedOutreachSendForToken_(token);
        if (campaignStage === "Initial" && !prior && (initialSentActivityForRecipient_(record.email) || initialSentDirectoryEmailElsewhere_(record.email, sourceRow))) {
          throw new Error("An initial email was already sent to this address on another directory row.");
        }
        const reasons = outreachSendEligibility_(record, { skip_legacy_pilot:true });
        if (reasons.length) throw new Error(reasons.join("; "));
        mailerAttempted = !prior;
        result = prior || callOutreachMailer_({ action:"sendAppEmail", idempotency_token:token, account_id:record.account_id,
          source_row:sourceRow, business:record.business, recipient:record.email, message_stage:campaignStage,
          subject:String(item.values[rh.subject] || ""), html:String(item.values[rh.html] || ""), requested_by:staffName });
        timing.mailer_ms = Date.now() - recipientStartedAt - timing.row_read_ms;
        if (!result.accepted || !String(result.message_id || "").trim()) throw new Error("Zoho did not return a verified message ID.");
        const sentAt = result.sent_at ? new Date(result.sent_at) : new Date();
        const acceptedAt = isNaN(sentAt.getTime()) ? new Date() : sentAt;
        outreachNoteRecentSend_(record.email, "sales", acceptedAt);
        finalizeOutreachSend_(leadSheet, sourceRow, record, campaignStage, String(result.message_id), acceptedAt, staffName, token, raw);
        timing.finalize_ms = Date.now() - recipientStartedAt - timing.row_read_ms - timing.mailer_ms;
        item.values[rh.status] = "Sent"; item.values[rh.result_detail] = result.idempotent ? "Previously accepted and recovered." : "Zoho accepted delivery.";
        item.values[rh.zoho_message_id] = String(result.message_id); item.values[rh.sent_at] = acceptedAt; item.values[rh.app_version] = APP_VERSION;
        sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
        sent += 1; results.push({ source_row:sourceRow, business:record.business, status:"Sent", message_id:String(result.message_id) });
      } catch (error) {
        if (result?.accepted && String(result.message_id || "").trim()) {
          const acceptedAt = result.sent_at ? new Date(result.sent_at) : new Date();
          item.values[rh.status] = "Sent - needs recording";
          item.values[rh.result_detail] = `Zoho accepted; recording failed: ${String(error.message || error).slice(0, 1500)}`;
          item.values[rh.zoho_message_id] = String(result.message_id);
          item.values[rh.sent_at] = isNaN(acceptedAt.getTime()) ? new Date() : acceptedAt;
          item.values[rh.app_version] = APP_VERSION;
          sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
          appendAudit_("SEND_OUTREACH_EMAIL_PARTIAL", "Campaign recipient", String(item.values[rh.idempotency_token] || ""), String(item.values[rh.account_id] || ""), staffName, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, OUTREACH_SHEET_NAME, "Needs recovery", `Message ${result.message_id}; ${String(error.message || error)}`);
          sent += 1; results.push({ source_row:sourceRow, business:String(item.values[rh.business_name] || ""), status:"Sent - needs recording", message_id:String(result.message_id) });
          continue;
        }
        item.values[rh.status] = "Blocked"; item.values[rh.result_detail] = String(error.message || error).slice(0, 2000); item.values[rh.app_version] = APP_VERSION;
        sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
        blocked += 1; results.push({ source_row:sourceRow, business:String(item.values[rh.business_name] || ""), status:"Blocked", detail:String(error.message || error), mailer_attempted:mailerAttempted });
        if (p.continue_after_block !== true) break; // Manual batches pause for review; the explicit continue run skips uncertain recipients without retrying them.
      } finally {
        timing.total_ms = Date.now() - recipientStartedAt;
        console.log(JSON.stringify({ event:"outreach_campaign_send_timing", campaign_id:p.campaign_id, source_row:sourceRow, business:recipientName, stages:timing }));
      }
    }
    const allRecipientStatuses = campaignRecipientSummaryRows_(sheets.recipients)
      .filter(item => item.campaign_id === String(p.campaign_id));
    const remaining = allRecipientStatuses.filter(item => item.status === "Ready to send").length;
    const needsRecording = allRecipientStatuses.filter(item => item.status === "Sent - needs recording").length;
    const sentTotal = allRecipientStatuses.filter(item => ["Sent", "Sent - needs recording"].includes(item.status)).length;
    const blockedTotal = allRecipientStatuses.filter(item => item.status === "Blocked").length;
    campaign.values[ch.last_batch_at] = new Date(); campaign.values[ch.sent_count] = sentTotal;
    campaign.values[ch.blocked_count] = blockedTotal; campaign.values[ch.app_version] = APP_VERSION;
    if (!remaining) {
      campaign.values[ch.status] = needsRecording ? "Complete with recording warnings" : blockedTotal ? "Complete with blocks" : "Complete";
      if (CAMPAIGN_SCHEDULE_ACTIVE_STATUSES.includes(String(campaign.values[ch.schedule_status] || ""))) {
        clearCampaignSchedule_(campaign, "Done", `Finished ${campaignScheduleTimeLabel_(new Date())}: every approved recipient has been sent or skipped.`);
      }
    }
    sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
    appendAudit_("SEND_OUTREACH_CAMPAIGN_BATCH", "Campaign", p.campaign_id, "", staffName, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, OUTREACH_ACTIVITY_SHEET_NAME, blocked ? "Stopped for review" : "Completed", `${sent} sent; ${blocked} blocked; ${remaining} remaining.`);
    return { message:blocked && p.continue_after_block !== true ? "Batch stopped for review after a blocked recipient." : `Batch complete: ${sent} sent; ${blocked} blocked; ${needsRecording} need recording.`, sent:sent, blocked:blocked, needs_recording:needsRecording, remaining:remaining, results:results };
  } finally { lock.releaseLock(); }
}

// ---------- Inbound reply checker (2026.10.09.38-APP) ----------
// Every 15 minutes the Hub asks the Distribution Outreach mailer for new sales@ Inbox messages,
// keeps the ones that come from businesses and contacts we email, sorts what fixed rules can
// sort, and lists each in the Replies view with a respond-by time. Replies the rules cannot
// sort are left as "Needs reading" for the sort-inbound-replies Claude skill
// (.claude/skills/sort-inbound-replies), which fills in the category, summary and respond-by.
// The Hub makes no AI calls. Only the safe stops happen without a click: a person's reply
// pauses that business's follow-ups, a plain "stop" reply unsubscribes, and a hard bounce marks
// the address bad. Everything else is a suggestion staff confirm.
const INBOUND_REPLIES_SHEET_NAME = "Inbound Replies";
const INBOUND_REPLY_HEADERS = [
  "Reply ID", "Received At", "From", "From Name", "Subject", "Reply Text", "Account ID", "Source Row", "Business",
  "Relationship", "Matched By", "Last Sent Stage", "Last Sent At", "Category", "Summary", "Suggested Outcome", "Priority",
  "Respond By", "Auto Action", "Classifier", "Status", "Handled At", "Handled By", "Handled Note", "Zoho Message ID",
  "Zoho Folder ID", "Thread ID", "App Version", "Outcome Logged",
];
const INBOUND_REPLY_CHECK_HANDLER = "runInboundReplyCheck";
const INBOUND_REPLY_LOOKBACK_DAYS = 14;
const INBOUND_REPLY_RUN_BUDGET_MS = 4 * 60 * 1000;
const INBOUND_REPLY_SINCE_PROPERTY = "INBOUND_REPLY_SINCE_MS";
const INBOUND_REPLY_LAST_RUN_PROPERTY = "INBOUND_REPLY_LAST_RUN";
const INBOUND_REPLY_RUNNING_CACHE_KEY = "inbound_reply_check_running";
const INBOUND_REPLY_OWN_ADDRESSES = ["sales@sturgeonspirits.com", "karl@sturgeonspirits.com"];
const INBOUND_REPLY_FREE_MAIL_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "rocketmail.com", "outlook.com", "hotmail.com", "live.com",
  "msn.com", "aol.com", "icloud.com", "me.com", "mac.com", "comcast.net", "att.net", "sbcglobal.net", "charter.net",
  "spectrum.net", "frontier.com", "frontiernet.net", "tds.net", "protonmail.com", "proton.me", "gmx.com", "mail.com",
  "zoho.com", "verizon.net", "bellsouth.net", "earthlink.net", "netzero.net", "juno.com", "centurylink.net",
];
// Category → suggested Directory outcome and how soon to answer.
const INBOUND_REPLY_CATEGORY_RULES = {
  "Order or reorder":    { outcome:"",                    respond:"today" },
  "Interested":          { outcome:"Interested",          respond:"today" },
  "Schedule tasting":    { outcome:"Schedule tasting",    respond:"today" },
  "Question":            { outcome:"",                    respond:"soon" },
  "Wants cocktail list": { outcome:"Wants cocktail list", respond:"soon" },
  "Wrong contact":       { outcome:"Wrong contact",       respond:"soon" },
  "Follow up later":     { outcome:"Follow up later",     respond:"optional" },
  "Not interested":      { outcome:"Not interested",      respond:"optional" },
  "Unsubscribe":         { outcome:"Unsubscribed",        respond:"none" },
  "Bounce":              { outcome:"Bad address",         respond:"none" },
  "Out of office":       { outcome:"",                    respond:"none" },
  "Other":               { outcome:"",                    respond:"soon" },
  "Needs reading":       { outcome:"",                    respond:"soon" },
};
const INBOUND_REPLY_PRIORITY_LABELS = { today:"Respond today", soon:"Respond soon", optional:"Optional reply", none:"No reply needed" };
// Only these matches are certain enough to change a Directory row without a click. A match by company
// email domain or by subject line is listed as a possible match and changes nothing.
const INBOUND_REPLY_STRONG_MATCHES = ["Sender email", "Alternate email in notes", "Address we emailed", "Newsletter contact", "Bounce for address"];
// Statuses a person's reply moves to "Replied" so no automatic follow-up goes out after a real answer.
const INBOUND_REPLY_PAUSABLE_STATUSES = ["sent", "follow-up due", "follow-up sent", "reactivation sent", "reactivation due"];

function getInboundRepliesSheet_(create) {
  const ss = getOutreachSs_();
  const sheet = ss.getSheetByName(INBOUND_REPLIES_SHEET_NAME);
  if (sheet) { ensureHeaderColumns_(sheet, INBOUND_REPLY_HEADERS); return sheet; }
  return create ? ensureSheet_(ss, INBOUND_REPLIES_SHEET_NAME, INBOUND_REPLY_HEADERS) : null;
}

function installInboundReplyChecker() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === INBOUND_REPLY_CHECK_HANDLER)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(INBOUND_REPLY_CHECK_HANDLER).timeBased().everyMinutes(15).create();
  getInboundRepliesSheet_(true);
  // Respond-by times use the project's time zone (business days and hours, no holiday calendar).
  const timeZone = Session.getScriptTimeZone();
  const zoneNote = timeZone === "America/Chicago" ? "" : ` Warning: this project's time zone is ${timeZone}; set it to America/Chicago in Project Settings so respond-by times are right.`;
  return { message:`Reply checker installed. It reads new sales@ Inbox messages every 15 minutes.${zoneNote}` };
}

function inboundReplyCheckerInstalled_() {
  try { return ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === INBOUND_REPLY_CHECK_HANDLER); }
  catch (error) { return null; }
}

function runInboundReplyCheck() {
  try { checkInboundReplies_("Schedule"); }
  catch (error) { console.error(`Inbound reply check failed: ${String(error && error.message || error)}`); }
}

/** Removes quoted history so only the sender's new text is classified and stored. */
function stripQuotedReply_(text) {
  const source = String(text || "").replace(/\r/g, "");
  const lines = source.split("\n");
  const cutPatterns = [
    /^\s*-{2,}\s*(original message|forwarded message)/i,
    /^\s*-{2,}\s*on .+wrote\s*-{2,}\s*$/i,
    /^\s*on .{6,200}wrote:\s*$/i,
    /^\s*on .{6,200}$/i, // "On Tue, Oct 7, 2026 at 3:32 PM Sturgeon Spirits <" followed by "sales@...> wrote:"
    /^\s*from:\s.*(@|<).*/i, // Outlook header block: From: name <address> followed by Sent: / Date:
    /^\s*_{5,}\s*$/,
    /^\s*={3,}\s*(forwarded|original) message\s*={3,}/i,
  ];
  let end = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*>/.test(line)) { end = i; break; }
    const matched = cutPatterns.some((pattern, index) => {
      if (!pattern.test(line)) return false;
      if (index === 3) return /^.{0,120}wrote:\s*$/i.test(lines[i + 1] || "");
      if (index === 4) return lines.slice(i + 1, i + 5).some(next => /^\s*(sent|date):\s/i.test(next));
      return true;
    });
    if (matched) { end = i; break; }
  }
  // When nothing new remains, return "" rather than our own quoted email.
  return lines.slice(0, end).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Outside text written to a cell: trimmed to length, and never read by Sheets as a formula. */
function inboundReplyCellText_(value, maxLength) {
  const text = String(value || "").slice(0, maxLength);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function inboundReplyEmails_(value) {
  const found = String(value || "").toLowerCase().match(/[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [];
  return Array.from(new Set(found));
}

/** A delivery report: from a mail daemon, or a bounce-style subject that is not a person's "Re:". */
function inboundReplyIsBounce_(message) {
  const from = String(message.from_address || "").toLowerCase();
  const subject = String(message.subject || "");
  if (/^(mailer-daemon|postmaster|mail-daemon|mailerdaemon)@/.test(from)) return true;
  if (/^\s*(re|aw|sv)\s*:/i.test(subject)) return false;
  return /(undeliver|delivery status notification|delivery has failed|mail delivery (failed|failure|subsystem)|returned mail|failure notice|could not be delivered|delivery failure)/i.test(subject);
}

/** The report's own text, before the copy of our original message it usually quotes. */
function inboundReplyBounceHead_(text) {
  const body = String(text || "");
  const marker = body.search(/^\s*(-{2,}\s*(original|forwarded) message|original message|received:\s|return-path:\s|content-type:\s*message\/rfc822|message-id:\s)/im);
  return marker > 0 ? body.slice(0, marker) : body;
}

/**
 * "hard": the address does not exist (enhanced status 5.1.x or the usual user-unknown wording);
 * "blocked": the receiving server refused our mail (5.7.x policy/DMARC/spam, full mailbox) — the address may be fine;
 * "delayed": still being retried; "unknown": anything else. Only "hard" may mark an address bad.
 */
function inboundReplyBounceKind_(text) {
  const head = inboundReplyBounceHead_(text);
  if (/^\s*action:\s*delayed/im.test(head) || /^\s*status:\s*4\./im.test(head) || /(has been delayed|delivery (is |has been )?delayed|will (be )?retr(y|ied)|still trying|has not yet been delivered)/i.test(head)) return "delayed";
  if (/(\b5\.7\.\d{1,3}\b|\b5\.2\.2\b|\b552\b|\bdmarc\b|\bspam|blocked|blacklist|blocklist|reputation|mailbox (is )?full|over quota|out of storage|message rejected)/i.test(head)) return "blocked";
  if (/\b5\.1\.\d{1,3}\b/.test(head) || /^\s*status:\s*5\.1\./im.test(head) || /(does not exist|doesn't exist|user unknown|unknown user|no such (user|recipient|mailbox)|mailbox (not found|unavailable|does not exist)|address rejected|recipient (address )?rejected|invalid recipient|recipient not found|account (has been )?disabled|address couldn't be found|could not be found)/i.test(head)) return "hard";
  return "unknown";
}

/** A sign-off line that may follow a one-word reply: "Sent from my iPhone", "Thanks", a name, a phone or email. */
function inboundReplySignoffLine_(line) {
  const text = String(line || "").trim();
  if (/^(sent from my .{0,40}|get outlook for .{0,20}|sent (via|with|from) .{0,40}|thanks?( you| so much)?[.!]*|thank you[.!]*|cheers[.!]*|(kind |best )?regards[.!,]*|best( wishes)?[.!,]*|sincerely[.!,]*|-{1,2}|—)$/i.test(text)) return true;
  if (/^[+()\d\s.\-]{7,20}$/.test(text)) return true;
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(text)) return true;
  if (/^(www\.|https?:\/\/)\S+$/i.test(text)) return true;
  const words = text.split(/\s+/);
  return words.length <= 3 && words.every(word => /^[A-Z][A-Za-z.'&\-]*,?$/.test(word));
}

/** True when the reply's first line passes the test and every other line is only a sign-off. */
function inboundReplyIsOnly_(replyText, firstLineTest) {
  const lines = String(replyText || "").split("\n").map(line => line.trim()).filter(Boolean);
  if (!lines.length || !firstLineTest(lines[0])) return false;
  return lines.slice(1).every(inboundReplySignoffLine_);
}

/** A reply that is only "stop" (the outreach footer's opt-out). "Stop by Friday" or "Unsubscribe … can you send pricing?" go to the skill. */
function inboundReplyIsStop_(replyText) {
  return inboundReplyIsOnly_(replyText, line => {
    const normalized = line.toLowerCase().replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ").trim();
    return /^(please )?(stop|unsubscribe|opt out|remove|remove me|stop emailing( me)?|stop sending( me)?( emails)?|take me off( your| this| the)?( email| mailing)?( list)?|remove me from( your| this| the)?( email| mailing)?( list)?)( please| thanks| thank you)?$/.test(normalized);
  });
}

function inboundReplyIsCocktails_(replyText) {
  return inboundReplyIsOnly_(replyText, line => /^\W*cocktails?\W*$/i.test(line));
}

function inboundReplyLooksAutomatic_(message, detail) {
  return !!(detail && detail.automatic)
    || /^(automatic reply|auto(matic)?[- ]?(reply|response)|out of (the )?office|ooo\b|away from (the )?office|on vacation|autoreply)/i.test(String(message.subject || "").trim());
}

/** Everything the matcher needs, read once per run. */
function inboundReplyIndex_() {
  const settings = getOutreachCampaignSettings_();
  const own = new Set(INBOUND_REPLY_OWN_ADDRESSES.concat([settings["Sender address"], settings["Test recipient"]].map(value => String(value || "").trim().toLowerCase())).filter(Boolean));
  // The Inbox is karl@'s whole mailbox; only mail addressed to sales@ (the outreach sender) is considered.
  const sales = new Set(["sales@sturgeonspirits.com", String(settings["Sender address"] || "").trim().toLowerCase()].filter(Boolean));
  const ownDomains = new Set(Array.from(own).map(address => address.split("@")[1]).filter(Boolean));
  const records = getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME)).map((row, index) => ({
    source_row:index + 2,
    account_id:String(row.account_id || "").trim(),
    business:String(outreachValue_(row, ["business", "business_name"]) || "").trim(),
    email:String(outreachValue_(row, ["email", "email_address"]) || "").trim().toLowerCase(),
    relationship:String(row.relationship || "").trim(),
    status:String(row.status || "").trim(),
    last_emailed:outreachDate_(row.last_emailed),
    notes:String(row.notes || ""),
  }));
  const byEmail = new Map();
  const byDomain = new Map();
  const remember = (map, key, record) => { if (!map.has(key)) map.set(key, []); if (!map.get(key).includes(record)) map.get(key).push(record); };
  records.forEach(record => {
    if (record.email) remember(byEmail, record.email, record);
    const alternates = Array.from(record.notes.matchAll(/alt(?:ernate)?\.?\s*e-?mail\s*:?\s*([^\s,;|()]+@[^\s,;|()]+)/gi)).map(match => match[1].toLowerCase().replace(/[.]+$/, ""));
    alternates.forEach(email => remember(byEmail, email, record));
    [record.email].concat(alternates).forEach(email => {
      const domain = email.split("@")[1] || "";
      if (domain && !INBOUND_REPLY_FREE_MAIL_DOMAINS.includes(domain) && !ownDomains.has(domain)) remember(byDomain, domain, record);
    });
  });
  const byAccount = new Map(records.filter(record => record.account_id).map(record => [record.account_id, record]));
  const sends = new Map();
  const subjects = new Map();
  const activity = getOutreachSs_().getSheetByName(OUTREACH_ACTIVITY_SHEET_NAME);
  if (activity && activity.getLastRow() > 1) {
    getAllRowsAsObjects_(activity).forEach(row => {
      const result = String(outreachValue_(row, ["result"]) || "").toUpperCase();
      if (!result.includes("SENT") || result.includes("TEST")) return;
      const email = String(outreachValue_(row, ["intended_recipient", "delivered_to", "email"]) || "").trim().toLowerCase();
      const at = outreachDate_(outreachValue_(row, ["timestamp", "sent_at"]));
      const send = { email:email, account_id:String(row.account_id || "").trim(), stage:String(outreachValue_(row, ["message_stage", "stage"]) || "").trim(), subject:String(row.subject || "").trim(), at:at };
      if (email) {
        const prior = sends.get(email);
        if (!prior || (at && (!prior.at || at.getTime() > prior.at.getTime()))) sends.set(email, send);
      }
      const subjectKey = send.subject.toLowerCase().replace(/\s+/g, " ").trim();
      if (subjectKey) {
        // Remember every account a subject went to: a subject shared by several businesses identifies none.
        const prior = subjects.get(subjectKey) || { send:null, accounts:new Set() };
        if (send.account_id) prior.accounts.add(send.account_id);
        if (!prior.send || (at && (!prior.send.at || at.getTime() > prior.send.at.getTime()))) prior.send = send;
        subjects.set(subjectKey, prior);
      }
    });
  }
  const newsletter = new Map(newsletterContacts_().map(contact => [String(contact.email || "").trim().toLowerCase(), contact]));
  return { own:own, sales:sales, records:records, byEmail:byEmail, byDomain:byDomain, byAccount:byAccount, sends:sends, subjects:subjects, newsletter:newsletter };
}

function inboundReplyPickRecord_(candidates, index, email) {
  if (!candidates || !candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const sent = email ? index.sends.get(email) : null;
  const bySend = sent && candidates.find(record => record.account_id && record.account_id === sent.account_id);
  if (bySend) return bySend;
  return candidates.slice().sort((a, b) => (b.last_emailed ? b.last_emailed.getTime() : 0) - (a.last_emailed ? a.last_emailed.getTime() : 0))[0];
}

/** Which business (and which of our emails) a message answers, or null when it is not a reply to us. */
function matchInboundReply_(message, index, detailText) {
  const from = String(message.from_address || "").toLowerCase();
  if (!from || index.own.has(from)) return null;
  const isBounce = inboundReplyIsBounce_(message);
  // Bounces go to the envelope sender; every other message must be addressed (To or Cc) to sales@.
  if (!isBounce && !(message.to_addresses || []).some(address => index.sales.has(String(address).toLowerCase()))) return null;
  const isReply = /^\s*(re|aw|sv)\s*:/i.test(String(message.subject || ""));
  if (isBounce) {
    const addresses = inboundReplyEmails_(detailText || message.summary).filter(email => !index.own.has(email) && !/^(mailer-daemon|postmaster)@/.test(email));
    const bounced = addresses.find(email => index.byEmail.has(email) || index.sends.has(email) || index.newsletter.has(email));
    if (!bounced) return null;
    const send = index.sends.get(bounced);
    const record = inboundReplyPickRecord_(index.byEmail.get(bounced), index, bounced) || (send && index.byAccount.get(send.account_id)) || null;
    return { record:record, email:bounced, matched_by:"Bounce for address", send:send || null, newsletter:index.newsletter.get(bounced) || null, bounce:true };
  }
  const send = index.sends.get(from) || null;
  const direct = inboundReplyPickRecord_(index.byEmail.get(from), index, from);
  if (direct) return { record:direct, email:from, matched_by:direct.email === from ? "Sender email" : "Alternate email in notes", send:send || index.sends.get(direct.email) || null, newsletter:index.newsletter.get(from) || null };
  if (send && index.byAccount.get(send.account_id)) return { record:index.byAccount.get(send.account_id), email:from, matched_by:"Address we emailed", send:send, newsletter:index.newsletter.get(from) || null };
  const contact = index.newsletter.get(from);
  if (contact) {
    const record = contact.account_id ? index.byAccount.get(String(contact.account_id)) || null : null;
    return { record:record, email:from, matched_by:"Newsletter contact", send:send, newsletter:contact };
  }
  // Possible matches below: listed for staff, never applied automatically.
  if (!isReply) return null;
  const domain = from.split("@")[1] || "";
  const domainRecords = index.byDomain.get(domain) || [];
  const domainAccounts = new Set(domainRecords.map(record => record.account_id || `row-${record.source_row}`));
  if (domainRecords.length && domainAccounts.size === 1) {
    return { record:domainRecords[0], email:from, matched_by:"Same company email domain", send:index.sends.get(domainRecords[0].email) || null, newsletter:null };
  }
  const subjectKey = String(message.subject || "").replace(/^\s*((re|aw|sv|fw|fwd)\s*:\s*)+/i, "").toLowerCase().replace(/\s+/g, " ").trim();
  const subjectEntry = subjectKey ? index.subjects.get(subjectKey) : null;
  if (subjectEntry && subjectEntry.send && subjectEntry.accounts.size === 1) {
    return { record:index.byAccount.get(subjectEntry.send.account_id) || null, email:from, matched_by:"Reply to our subject line", send:subjectEntry.send, newsletter:null };
  }
  return { record:null, email:from, matched_by:"Reply to sales@ (no business match)", send:null, newsletter:null };
}

function inboundReplyBusinessDayAt_(from, addDays, hour) {
  const date = new Date(from.getTime());
  let added = 0;
  while (added < addDays || date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) added += 1;
  }
  date.setHours(hour, 0, 0, 0);
  return date;
}

/** Respond-by time: same business day for hot replies that arrive by 3 PM, otherwise the next business day. */
function inboundReplyRespondBy_(category, received) {
  const rule = INBOUND_REPLY_CATEGORY_RULES[category] || INBOUND_REPLY_CATEGORY_RULES["Needs reading"];
  const at = received instanceof Date && !isNaN(received.getTime()) ? received : new Date();
  if (rule.respond === "today") {
    const weekday = at.getDay() !== 0 && at.getDay() !== 6;
    if (weekday && at.getHours() < 15) { const sameDay = new Date(at.getTime()); sameDay.setHours(17, 0, 0, 0); return sameDay; }
    return inboundReplyBusinessDayAt_(at, 1, 12);
  }
  if (rule.respond === "soon") return inboundReplyBusinessDayAt_(at, 1, 17);
  return null;
}

/**
 * Writes back only the cells that changed in a row read with getValues(). Rewriting the whole row would
 * turn apostrophe-protected text ('=…, '+1 920…) into live formulas and overwrite cells another writer
 * (staff, the skill) changed in the meantime.
 */
function writeChangedRowCells_(sheet, rowNumber, originalValues, values) {
  values.forEach((value, index) => {
    const before = originalValues[index];
    const same = value instanceof Date && before instanceof Date ? value.getTime() === before.getTime() : value === before;
    if (!same) sheet.getRange(rowNumber, index + 1).setValue(value);
  });
}

/** Writes Status "Replied" and clears Next Follow-Up so no automatic follow-up goes out after a person's answer. */
function pauseOutreachFollowUpsForReply_(record, receivedAt, summary) {
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return "";
  try {
    const h = getHeaderMap_(sheet);
    const range = sheet.getRange(record.source_row, 1, 1, sheet.getLastColumn());
    const values = range.getValues()[0];
    const originalValues = values.slice();
    if (h.account_id !== undefined && String(values[h.account_id] || "").trim() !== record.account_id) return "";
    const status = String(h.status !== undefined ? values[h.status] : "").trim().toLowerCase();
    if (!INBOUND_REPLY_PAUSABLE_STATUSES.includes(status)) return "";
    if (h.status !== undefined) values[h.status] = "Replied";
    if (h["next_follow-up"] !== undefined) values[h["next_follow-up"]] = "";
    else if (h.next_follow_up !== undefined) values[h.next_follow_up] = "";
    if (h.notes !== undefined) {
      const note = `${Utilities.formatDate(receivedAt, Session.getScriptTimeZone(), "yyyy-MM-dd")} - Email reply received${summary ? `: ${summary}` : ""} (follow-ups paused automatically)`;
      const prior = String(values[h.notes] || "").trim();
      values[h.notes] = prior ? `${prior}\n${note}` : note;
    }
    if (h.record_updated_at !== undefined) values[h.record_updated_at] = new Date();
    writeChangedRowCells_(sheet, record.source_row, originalValues, values);
    return "Follow-ups paused (status Replied)";
  } finally {
    lock.releaseLock();
  }
}

function recordInboundReplyEngagement_(match, eventType, receivedAt) {
  const sheet = getOutreachSs_().getSheetByName(OUTREACH_ENGAGEMENT_SHEET_NAME);
  if (!sheet || !match.record) return;
  const headers = getHeaderMap_(sheet);
  const values = Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (headers[key] !== undefined) values[headers[key]] = value; };
  set("event_id", permanentId_("ENG"));
  set("business_name", match.record.business);
  set("email", match.email);
  set("account_id", match.record.account_id);
  set("source_row", match.record.source_row);
  set("event_type", eventType);
  set("event_at", receivedAt);
  set("source", "Inbox reply checker");
  set("message_stage", match.send ? match.send.stage : "");
  set("stage", match.send ? match.send.stage : "");
  set("confidence", "Inbox message");
  set("app_version", APP_VERSION);
  sheet.appendRow(values);
}

/**
 * The safe stops, applied without a click: { text, applied }. Only strong matches change a Directory row.
 * "applied" says whether the stop actually took effect, so a failed opt-out is never filed as handled.
 */
function applyInboundReplySafeStops_(match, classification, receivedAt) {
  const actions = [];
  const record = match.record;
  const actor = "Reply checker";
  if (!INBOUND_REPLY_STRONG_MATCHES.includes(match.matched_by)) {
    return { text:record ? "Possible match - not applied" : "", applied:false };
  }
  if (classification.category === "Bounce") {
    // Only an address that does not exist is marked bad; blocked, delayed and unclear reports change nothing.
    if (classification.bounce_kind !== "hard") return { text:"", applied:false };
    let applied = false;
    if (record && record.email && record.email === match.email) {
      try {
        apiUpdateOutreachOutcome_({ source_row:record.source_row, business:record.business, account_id:record.account_id, outcome:"Bad address", staff_name:actor, notes:`Email to ${match.email} bounced (applied automatically by the reply checker).` });
        actions.push("Marked Bad address");
        applied = true;
      } catch (error) { actions.push(`Bad address not applied: ${String(error.message || error)}`); }
    }
    if (match.newsletter && unsubscribeNewsletterContactByEmail_(match.email, actor)) { actions.push("Newsletter contact unsubscribed (bounced)"); if (!record) applied = true; }
    return { text:actions.join("; "), applied:applied };
  }
  if (classification.category === "Unsubscribe" && classification.classifier === "Rules") {
    let directoryApplied = false;
    if (record) {
      try {
        apiUpdateOutreachOutcome_({ source_row:record.source_row, business:record.business, account_id:record.account_id, outcome:"Unsubscribed", staff_name:actor, notes:`Replied "stop" from ${match.email} (applied automatically by the reply checker).` });
        actions.push("Unsubscribed (Do Not Email ticked)");
        directoryApplied = true;
      } catch (error) { actions.push(`Unsubscribe not applied: ${String(error.message || error)}`); }
    }
    const newsletterApplied = unsubscribeNewsletterContactByEmail_(match.email, actor);
    if (newsletterApplied) actions.push("Newsletter contact unsubscribed");
    if (!actions.length) actions.push("Nothing found to unsubscribe automatically");
    // With a Directory row, that row must be unsubscribed; otherwise the newsletter contact must be.
    return { text:actions.join("; "), applied:record ? directoryApplied : newsletterApplied };
  }
  if (!record || classification.category === "Out of office" || classification.no_pause) return { text:"", applied:false };
  const text = pauseOutreachFollowUpsForReply_(record, receivedAt, classification.summary);
  return { text:text, applied:!!text };
}

/** Status, priority and respond-by once the safe stops have run. */
function inboundReplyOutcomeFields_(classification, stops, receivedAt) {
  const rule = INBOUND_REPLY_CATEGORY_RULES[classification.category] || INBOUND_REPLY_CATEGORY_RULES["Needs reading"];
  const review = label => ({ status:"New", priority:label, respond_by:inboundReplyBusinessDayAt_(receivedAt, 1, 17) });
  const handled = { status:"Handled", priority:INBOUND_REPLY_PRIORITY_LABELS.none, respond_by:"" };
  if (classification.category === "Unsubscribe") return classification.classifier === "Rules" && stops.applied ? handled : review("Confirm unsubscribe");
  if (classification.category === "Bounce") {
    if (classification.bounce_kind === "delayed") return handled;
    return classification.bounce_kind === "hard" && stops.applied ? handled : review("Review bounce");
  }
  if (rule.respond === "none") return handled;
  return { status:"New", priority:INBOUND_REPLY_PRIORITY_LABELS[rule.respond], respond_by:inboundReplyRespondBy_(classification.category, receivedAt) || "" };
}

/** Zoho IDs are 19-digit numbers; written with a leading apostrophe they stay exact text instead of a rounded double. */
function inboundReplyIdText_(value) {
  const text = String(value || "").trim();
  return text ? `'${text}` : "";
}

/** Writes named cells of one Inbound Replies row (never the whole row). */
function setInboundReplyCells_(sheet, rowNumber, changes) {
  const h = getHeaderMap_(sheet);
  Object.keys(changes).forEach(key => { if (h[key] !== undefined) sheet.getRange(rowNumber, h[key] + 1).setValue(changes[key]); });
}

// ---------- Outcome tracking and learned alt emails (2026.10.10.40-APP) ----------
/** A reply answered from Zoho whose business still has no outcome recorded from it. */
function inboundReplyNeedsOutcome_(row) {
  return String(row.status || "").trim() === "Handled"
    && /^Answered in Zoho/i.test(String(row.handled_note || "").trim())
    && !String(row.outcome_logged || "").trim()
    && Number(row.source_row || 0) > 0;
}

/**
 * The Notes line to add when an outcome is logged from a reply sent from another address, or "".
 * Never for bounces, mail daemons, our own domain, the business's own email or an address already in Notes.
 */
function inboundReplyAltEmailLine_(reply, directoryEmail, priorNotes, dateText) {
  const from = String(reply.from || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(from)) return "";
  if (String(reply.category || "").trim() === "Bounce") return "";
  if (/^(mailer-daemon|postmaster|mail-daemon|mailerdaemon)@/.test(from)) return "";
  if (from.endsWith("@sturgeonspirits.com")) return "";
  if (from === String(directoryEmail || "").trim().toLowerCase()) return "";
  if (String(priorNotes || "").toLowerCase().includes(from)) return "";
  const name = String(reply.from_name || "").replace(/[\r\n]+/g, " ").trim();
  const label = name && name.toLowerCase() !== from ? ` (${name}, from an email reply)` : " (from an email reply)";
  return `${dateText} - Alt email: ${from}${label}`;
}

/**
 * Records an outcome on the business's replies: the reply it was logged from (handled if still open) and every
 * reply of that account waiting for an outcome. Writes only status and Outcome Logged cells.
 * Returns the record of replyId, or null.
 */
function recordInboundReplyOutcome_(accountId, outcome, staffName, replyId) {
  const sheet = getInboundRepliesSheet_(false);
  if (!sheet || !accountId) return null;
  const now = new Date();
  const logged = inboundReplyCellText_(`${outcome} · ${Utilities.formatDate(now, Session.getScriptTimeZone(), "MMM d")} · ${staffName}`, 200);
  let selected = null;
  outreachRowsMatchingCell_(sheet, ["account_id", "Account ID"], accountId).forEach(row => {
    const isTarget = !!replyId && String(row.reply_id || "") === String(replyId);
    if (!isTarget && !inboundReplyNeedsOutcome_(row)) return;
    const changes = { outcome_logged:logged };
    if (isTarget && String(row.status || "").trim() === "New") {
      Object.assign(changes, { status:"Handled", handled_at:now, handled_by:inboundReplyCellText_(staffName, 120), handled_note:inboundReplyCellText_(`Outcome: ${outcome}`, 500) });
    }
    setInboundReplyCells_(sheet, row.__source_row, changes);
    if (isTarget) selected = inboundReplyRecord_(Object.assign({}, row, changes), row.__source_row);
  });
  if (replyId && !selected) throw new Error("That reply belongs to a different business.");
  return selected;
}

// ---------- Replies answered from Zoho (2026.10.10.39-APP) ----------
const INBOUND_REPLY_ANSWER_SKIP_CATEGORIES = ["Bounce", "Unsubscribe"];
const INBOUND_REPLY_ANSWER_SKIP_PRIORITIES = ["Confirm unsubscribe", "Review bounce"];
const INBOUND_REPLY_ANSWER_LOOKBACK_DAYS = 30;

/** Whether a reply row can be closed by an email sent from Zoho (bounces and unsubscribes need a decision in the Hub). */
function inboundReplyAnswerable_(row) {
  return String(row.status || "").trim() === "New"
    && !!String(row.thread_id || "").trim()
    && !INBOUND_REPLY_ANSWER_SKIP_CATEGORIES.includes(String(row.category || "").trim())
    && !INBOUND_REPLY_ANSWER_SKIP_PRIORITIES.includes(String(row.priority || "").trim());
}

/**
 * The sent message that answered a reply: same thread, sent from sales@, after the reply arrived (the original
 * outreach email is in the same thread but earlier, so it never counts). Earliest such message, or null.
 */
function inboundReplyAnsweredBy_(row, sentRows, senderSet) {
  if (!inboundReplyAnswerable_(row)) return null;
  const thread = String(row.thread_id || "").trim();
  const received = outreachDate_(row.received_at);
  if (!received) return null;
  // A reply reopened by staff is only closed again by a message sent after the reopen.
  const reopened = /^Reopened/i.test(String(row.handled_note || "").trim()) ? outreachDate_(row.handled_at) : null;
  const after = Math.max(received.getTime(), reopened ? reopened.getTime() : 0);
  const answers = (sentRows || []).filter(sent => String(sent.thread_id || "") === thread
    && senderSet.has(String(sent.from_address || "").trim().toLowerCase())
    && Number(sent.sent_ms) > after);
  answers.sort((a, b) => Number(a.sent_ms) - Number(b.sent_ms));
  return answers[0] || null;
}

/** Closes open replies that were answered from Zoho. Returns { answered, scan_capped }. */
function closeAnsweredInboundReplies_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return { answered:0, scan_capped:false };
  const rows = getAllRowsAsObjects_(sheet).map((row, index) => Object.assign(row, { __row:index + 2 })).filter(inboundReplyAnswerable_);
  if (!rows.length) return { answered:0, scan_capped:false };
  const floor = Date.now() - INBOUND_REPLY_ANSWER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const oldest = Math.min.apply(null, rows.map(row => { const date = outreachDate_(row.received_at); return date ? date.getTime() : Date.now(); }));
  const threadIds = Array.from(new Set(rows.map(row => String(row.thread_id).trim())));
  const listing = callOutreachMailer_({ action:"listSentInThreads", since_ms:Math.max(oldest, floor), thread_ids:threadIds });
  const settings = getOutreachCampaignSettings_();
  const senderSet = new Set(["sales@sturgeonspirits.com", String(settings["Sender address"] || "").trim().toLowerCase()].filter(Boolean));
  let answered = 0;
  rows.forEach(row => {
    const sent = inboundReplyAnsweredBy_(row, listing.rows || [], senderSet);
    if (!sent) return;
    // Re-find the row by Reply ID in case rows moved since they were read.
    const current = outreachRowsMatchingCell_(sheet, ["reply_id", "Reply ID"], String(row.reply_id || ""));
    if (!current.length || String(current[0].status || "").trim() !== "New") return;
    const sentAt = new Date(Number(sent.sent_ms));
    const label = Utilities.formatDate(sentAt, Session.getScriptTimeZone(), "MMM d h:mm a");
    setInboundReplyCells_(sheet, current[0].__source_row, {
      status:"Handled",
      handled_at:sentAt,
      handled_by:"Reply checker",
      handled_note:`Answered in Zoho ${label}`,
    });
    appendAudit_("CLOSE_INBOUND_REPLY_ANSWERED", "Reply", String(row.reply_id || ""), String(row.account_id || ""), "Reply checker", INBOUND_REPLIES_SHEET_NAME, INBOUND_REPLIES_SHEET_NAME, "Completed", `Answered in Zoho ${label} (message ${sent.message_id})`);
    answered += 1;
  });
  return { answered:answered, scan_capped:!!listing.scan_capped };
}

function inboundReplyStoredIds_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return new Set();
  const h = getHeaderMap_(sheet);
  if (h.zoho_message_id === undefined) return new Set();
  return new Set(sheet.getRange(2, h.zoho_message_id + 1, sheet.getLastRow() - 1, 1).getValues().map(row => String(row[0] || "").trim()).filter(Boolean));
}

function setInboundReplyLastRun_(value) {
  PropertiesService.getScriptProperties().setProperty(INBOUND_REPLY_LAST_RUN_PROPERTY, JSON.stringify(value));
}

function inboundReplyLastRun_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(INBOUND_REPLY_LAST_RUN_PROPERTY) || "null"); }
  catch (error) { return null; }
}

/** Reads new Inbox messages through the mailer and catalogues the replies. Safe to run repeatedly. */
function checkInboundReplies_(trigger) {
  const cache = CacheService.getScriptCache();
  if (cache.get(INBOUND_REPLY_RUNNING_CACHE_KEY)) return { message:"A reply check is already running. Try again in a few minutes.", running:true };
  cache.put(INBOUND_REPLY_RUNNING_CACHE_KEY, "1", 360);
  const started = Date.now();
  const properties = PropertiesService.getScriptProperties();
  const sinceMs = Number(properties.getProperty(INBOUND_REPLY_SINCE_PROPERTY) || 0) || (started - INBOUND_REPLY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const summary = { at:new Date().toISOString(), trigger:trigger, checked:0, added:0, auto_actions:0, skipped:0, answered:0, scan_capped:false, error:"", more_available:false };
  try {
    const listing = callOutreachMailer_({ action:"listInboxMessages", since_ms:sinceMs });
    const messages = (listing.messages || []).filter(message => message && message.message_id).sort((a, b) => Number(a.received_ms || 0) - Number(b.received_ms || 0));
    summary.checked = messages.length;
    summary.more_available = !!listing.more_available;
    const sheet = getInboundRepliesSheet_(true);
    const stored = inboundReplyStoredIds_(sheet);
    const index = inboundReplyIndex_();
    let checkpoint = sinceMs;
    const advance = receivedMs => {
      // Saved after every message, so a failure part-way never re-reads (or re-applies) earlier ones.
      checkpoint = Math.max(checkpoint, receivedMs || 0);
      properties.setProperty(INBOUND_REPLY_SINCE_PROPERTY, String(checkpoint));
    };
    const readMessage = message => {
      try { return callOutreachMailer_({ action:"getInboxMessage", message_id:message.message_id, folder_id:message.folder_id }); }
      catch (error) { return { text:String(message.summary || ""), automatic:false, bulk:false, header_error:true, text_truncated:false, read_error:String(error.message || error) }; }
    };
    for (const message of messages) {
      if (Date.now() - started > INBOUND_REPLY_RUN_BUDGET_MS) { summary.more_available = true; break; }
      const messageId = String(message.message_id);
      const receivedMs = Number(message.received_ms || 0);
      if (stored.has(messageId)) { advance(receivedMs); continue; }
      let detail = null;
      let match = matchInboundReply_(message, index, "");
      if (!match && inboundReplyIsBounce_(message)) {
        detail = readMessage(message);
        match = matchInboundReply_(message, index, detail.text);
      }
      if (!match) { summary.skipped += 1; advance(receivedMs); continue; }
      if (!detail) detail = readMessage(message);
      // A mailing-list or newsletter message from a matched address is not a reply.
      if (detail.bulk && !match.bounce) { summary.skipped += 1; advance(receivedMs); continue; }
      const receivedAt = new Date(receivedMs || Date.now());
      const replyText = stripQuotedReply_(detail.text || message.summary || "");
      let classification;
      if (match.bounce) {
        const kind = inboundReplyBounceKind_(detail.text);
        const wording = { hard:"bounced: the address does not exist", blocked:"was refused by the receiving server (policy, spam filter or full mailbox); the address may still be good", delayed:"was delayed; the server is still trying", unknown:"could not be delivered; read the bounce message" }[kind];
        classification = { category:"Bounce", summary:`Email to ${match.email} ${wording}.`, classifier:"Rules", bounce_kind:kind };
      } else if (inboundReplyIsStop_(replyText)) {
        classification = { category:"Unsubscribe", summary:"Asked to stop receiving emails.", classifier:"Rules" };
      } else if (inboundReplyIsCocktails_(replyText)) {
        classification = { category:"Wants cocktail list", summary:'Replied "cocktails".', classifier:"Rules" };
      } else if (inboundReplyLooksAutomatic_(message, detail)) {
        classification = { category:"Out of office", summary:"Automatic reply.", classifier:"Rules" };
      } else {
        // Left for the sort-inbound-replies skill. It still pauses follow-ups, unless the headers could
        // not be read (it might be an automatic reply).
        classification = { category:"Needs reading", summary:"", classifier:"Awaiting skill", no_pause:!!detail.header_error };
      }
      const rule = INBOUND_REPLY_CATEGORY_RULES[classification.category] || INBOUND_REPLY_CATEGORY_RULES["Needs reading"];
      const record = match.record || {};
      // 1) Catalogue the reply under the script lock, re-checking that no other run stored it first.
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(15000)) { summary.more_available = true; break; }
      let rowNumber = 0;
      try {
        if (outreachRowsMatchingCell_(sheet, ["zoho_message_id", "Zoho Message ID"], messageId).length) { stored.add(messageId); advance(receivedMs); continue; }
        const h = getHeaderMap_(sheet);
        const values = Array(sheet.getLastColumn()).fill("");
        const set = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
        set("reply_id", permanentId_("RPL"));
        set("received_at", receivedAt);
        set("from", inboundReplyCellText_(match.email, 200));
        set("from_name", inboundReplyCellText_(message.from_name, 200));
        set("subject", inboundReplyCellText_(message.subject, 500));
        const body = replyText || "(No new text above the quoted message.)";
        set("reply_text", inboundReplyCellText_(`${body.slice(0, 8000)}${detail.text_truncated ? "\n[Message truncated]" : ""}${detail.read_error ? "\n[Full message could not be read; showing Zoho's summary]" : ""}`, 8200));
        set("account_id", record.account_id || String(match.newsletter?.account_id || ""));
        set("source_row", record.source_row || "");
        set("business", record.business || String(match.newsletter?.organization || ""));
        set("relationship", record.relationship || "");
        set("matched_by", match.matched_by);
        set("last_sent_stage", match.send ? match.send.stage : "");
        set("last_sent_at", match.send && match.send.at ? match.send.at : "");
        set("category", classification.category);
        set("summary", inboundReplyCellText_(classification.summary || "", 700));
        // Only a bounce saying the address does not exist suggests "Bad address".
        set("suggested_outcome", classification.category === "Bounce" && classification.bounce_kind !== "hard" ? "" : rule.outcome);
        set("priority", INBOUND_REPLY_PRIORITY_LABELS[rule.respond]);
        set("auto_action", "Pending automatic changes");
        set("classifier", classification.classifier);
        set("status", "New");
        set("zoho_message_id", inboundReplyIdText_(messageId));
        set("zoho_folder_id", inboundReplyIdText_(message.folder_id));
        set("thread_id", inboundReplyIdText_(message.thread_id));
        set("app_version", APP_VERSION);
        sheet.appendRow(values);
        rowNumber = sheet.getLastRow();
      } finally {
        lock.releaseLock();
      }
      stored.add(messageId);
      summary.added += 1;
      // 2) Side effects, then the row's final status. If this part fails the row stays New with
      //    "Pending automatic changes", which staff see; the message is never processed twice.
      const automaticReply = classification.category === "Bounce" || classification.category === "Out of office";
      if (!automaticReply) recordInboundReplyEngagement_(match, "reply", receivedAt);
      else if (classification.category === "Bounce") recordInboundReplyEngagement_(match, "bounce", receivedAt);
      const stops = applyInboundReplySafeStops_(match, classification, receivedAt);
      if (stops.applied) summary.auto_actions += 1;
      const fields = inboundReplyOutcomeFields_(classification, stops, receivedAt);
      const handled = fields.status === "Handled";
      setInboundReplyCells_(sheet, rowNumber, {
        auto_action:inboundReplyCellText_(stops.text, 500),
        status:fields.status,
        priority:fields.priority,
        respond_by:fields.respond_by,
        handled_at:handled ? new Date() : "",
        handled_by:handled ? "Reply checker" : "",
        handled_note:handled ? "No reply needed" : "",
      });
      advance(receivedMs);
    }
    // Close replies answered from Zoho, if the run still has time. A failure here never fails the check.
    if (Date.now() - started < INBOUND_REPLY_RUN_BUDGET_MS) {
      try {
        const closed = closeAnsweredInboundReplies_(sheet);
        summary.answered = closed.answered;
        summary.scan_capped = closed.scan_capped;
      } catch (error) {
        console.error(`Closing answered replies failed: ${String(error && error.message || error)}`);
      }
    }
    if (summary.added || summary.auto_actions || summary.answered) bumpReadCacheVersion_();
  } catch (error) {
    summary.error = String(error && error.message || error).slice(0, 500);
    throw error;
  } finally {
    summary.duration_ms = Date.now() - started;
    setInboundReplyLastRun_(summary);
    cache.remove(INBOUND_REPLY_RUNNING_CACHE_KEY);
  }
  return {
    message:`Checked ${summary.checked} new Inbox message(s): ${summary.added} repl${summary.added === 1 ? "y" : "ies"} added${summary.auto_actions ? `, ${summary.auto_actions} applied automatically` : ""}${summary.answered ? `, ${summary.answered} answered in Zoho` : ""}.${summary.more_available ? " More messages are waiting; they are picked up on the next check." : ""}${summary.scan_capped ? " The Sent folder scan hit its limit; some answers may not be seen." : ""}`,
    last_run:summary,
  };
}

function inboundReplyRecord_(row, rowNumber) {
  const iso = value => { const date = outreachDate_(value); return date ? date.toISOString() : ""; };
  return {
    row:rowNumber,
    reply_id:String(row.reply_id || ""),
    received_at:iso(row.received_at),
    from:String(row.from || ""),
    from_name:String(row.from_name || ""),
    subject:String(row.subject || ""),
    reply_text:String(row.reply_text || ""),
    account_id:String(row.account_id || ""),
    source_row:Number(row.source_row || 0) || null,
    business:String(row.business || ""),
    relationship:String(row.relationship || ""),
    matched_by:String(row.matched_by || ""),
    last_sent_stage:String(row.last_sent_stage || ""),
    last_sent_at:iso(row.last_sent_at),
    category:String(row.category || ""),
    summary:String(row.summary || ""),
    suggested_outcome:String(row.suggested_outcome || ""),
    priority:String(row.priority || ""),
    respond_by:iso(row.respond_by),
    auto_action:String(row.auto_action || ""),
    classifier:String(row.classifier || ""),
    status:String(row.status || "New"),
    handled_at:iso(row.handled_at),
    handled_by:String(row.handled_by || ""),
    handled_note:String(row.handled_note || ""),
    outcome_logged:String(row.outcome_logged || ""),
    needs_outcome:inboundReplyNeedsOutcome_(row),
    zoho_message_id:String(row.zoho_message_id || ""),
  };
}

/** Zoho Mail's web address for the configured data center (https://mail.zoho.com/api → https://mail.zoho.com/zm/). */
function inboundReplyZohoWebUrl_() {
  let api = "";
  try { api = String(getOutreachCampaignSettings_()["Zoho Mail API URL"] || ""); } catch (error) { api = ""; }
  const origin = (api.match(/^https:\/\/mail\.zoho\.[a-z.]+/i) || ["https://mail.zoho.com"])[0];
  return `${origin}/zm/`;
}

/** Replies for the Replies view: every open reply plus the last 30 days of handled ones. */
function apiGetInboundReplies_() {
  const sheet = getInboundRepliesSheet_(false);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const replies = !sheet || sheet.getLastRow() < 2 ? [] : getAllRowsAsObjects_(sheet)
    .map((row, index) => inboundReplyRecord_(row, index + 2))
    .filter(reply => reply.reply_id && (reply.status === "New" || reply.needs_outcome || (Date.parse(reply.received_at) || 0) >= cutoff));
  replies.sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
  const now = Date.now();
  const open = replies.filter(reply => reply.status === "New");
  return {
    replies:replies,
    counts:{
      open:open.length,
      needs_outcome:replies.filter(reply => reply.needs_outcome).length,
      respond_today:open.filter(reply => reply.priority === INBOUND_REPLY_PRIORITY_LABELS.today).length,
      overdue:open.filter(reply => reply.respond_by && Date.parse(reply.respond_by) < now).length,
    },
    last_run:inboundReplyLastRun_(),
    checker_installed:inboundReplyCheckerInstalled_(),
    awaiting_skill:open.filter(reply => reply.category === "Needs reading").length,
    mailer_configured:outreachMailerConfigured_(),
    zoho_mail_url:inboundReplyZohoWebUrl_(),
  };
}

/** Marks a reply handled or dismissed (or reopens it). Identified by Reply ID, never by row alone. */
function resolveInboundReply_(replyId, status, staffName, note, expectedAccountId) {
  const allowed = ["Handled", "Dismissed", "New"];
  if (!allowed.includes(status)) throw new Error("Choose Handled, Dismissed or New.");
  const sheet = getInboundRepliesSheet_(false);
  if (!sheet) throw new Error("No replies have been recorded yet.");
  const rows = outreachRowsMatchingCell_(sheet, ["reply_id", "Reply ID"], String(replyId || "").trim());
  if (!rows.length) throw new Error("Reply not found. Refresh and try again.");
  const rowNumber = rows[0].__source_row;
  if (expectedAccountId !== undefined && String(rows[0].account_id || "").trim() !== String(expectedAccountId || "").trim()) {
    throw new Error("That reply belongs to a different business.");
  }
  // Only the four status cells are written; the rest of the row (outside text, the skill's cells) is untouched.
  // Reopening records when and by whom, so "Answered in Zoho" only closes it again for a newer sent message.
  const changes = {
    status:status,
    handled_at:new Date(),
    handled_by:inboundReplyCellText_(staffName, 120),
    handled_note:status === "New" ? inboundReplyCellText_(`Reopened by ${staffName}`, 500) : inboundReplyCellText_(note, 500),
  };
  setInboundReplyCells_(sheet, rowNumber, changes);
  return inboundReplyRecord_(Object.assign({}, rows[0], changes), rowNumber);
}

function apiResolveInboundReply_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["reply_id", "status"]);
  const staffName = authenticatedActor_(p, "Staff");
  if (p.no_outcome) {
    // An answered reply that needs no outcome: only Outcome Logged is written.
    const sheet = getInboundRepliesSheet_(false);
    const rows = sheet ? outreachRowsMatchingCell_(sheet, ["reply_id", "Reply ID"], String(p.reply_id || "").trim()) : [];
    if (!rows.length) throw new Error("Reply not found. Refresh and try again.");
    const changes = { outcome_logged:inboundReplyCellText_(`No outcome needed · ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMM d")} · ${staffName}`, 200) };
    setInboundReplyCells_(sheet, rows[0].__source_row, changes);
    const record = inboundReplyRecord_(Object.assign({}, rows[0], changes), rows[0].__source_row);
    appendAudit_("RESOLVE_INBOUND_REPLY", "Reply", record.reply_id, record.account_id, staffName, INBOUND_REPLIES_SHEET_NAME, INBOUND_REPLIES_SHEET_NAME, "Completed", "No outcome needed");
    return { message:"Marked as needing no outcome.", reply:record };
  }
  const reply = resolveInboundReply_(p.reply_id, String(p.status), staffName, publicText_(p.note || "", 500, "Note"));
  appendAudit_("RESOLVE_INBOUND_REPLY", "Reply", reply.reply_id, reply.account_id, staffName, INBOUND_REPLIES_SHEET_NAME, INBOUND_REPLIES_SHEET_NAME, "Completed", reply.status);
  return { message:`Reply marked ${reply.status === "New" ? "open" : reply.status.toLowerCase()}.`, reply:reply };
}

// "Check now" from the Hub starts a one-time background run, so a slow Inbox or classification
// never runs into the web request's time limit. The Replies view refreshes to show the result.
const INBOUND_REPLY_CHECK_NOW_HANDLER = "runInboundReplyCheckNow";

function runInboundReplyCheckNow() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === INBOUND_REPLY_CHECK_NOW_HANDLER)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  try { checkInboundReplies_("Staff"); }
  catch (error) { console.error(`Inbound reply check failed: ${String(error && error.message || error)}`); }
}

function apiCheckInboundReplies_() {
  if (!outreachMailerConfigured_()) throw new Error("The Distribution Outreach mailer is not configured, so the Inbox cannot be read.");
  if (CacheService.getScriptCache().get(INBOUND_REPLY_RUNNING_CACHE_KEY)) return { message:"A reply check is already running. Refresh in a minute.", started:false };
  const pending = ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === INBOUND_REPLY_CHECK_NOW_HANDLER);
  if (!pending) ScriptApp.newTrigger(INBOUND_REPLY_CHECK_NOW_HANDLER).timeBased().after(1000).create();
  return { message:"Checking the Inbox now. Refresh the Replies view in a minute.", started:true };
}

// ---------- Scheduled campaign sends (2026.10.03.19-APP) ----------
// An approved campaign can carry a send time. A five-minute trigger sends due campaigns in small locked
// batches through apiSendOutreachCampaignBatch_, so every manual-send guard (approval token, frozen stage,
// live eligibility, replies, opt-outs, duplicate tokens) still applies to each recipient.
const CAMPAIGN_SCHEDULE_HANDLER = "runScheduledOutreachCampaigns";
const CAMPAIGN_SCHEDULE_ACTIVE_STATUSES = ["Scheduled", "Sending"];
const CAMPAIGN_SCHEDULE_BATCH_SIZE = 5;
const CAMPAIGN_SCHEDULE_RUN_BUDGET_MS = 4 * 60 * 1000;
const CAMPAIGN_SCHEDULE_MAX_DAYS_AHEAD = 30;

function installOutreachCampaignScheduler() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === CAMPAIGN_SCHEDULE_HANDLER)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(CAMPAIGN_SCHEDULE_HANDLER).timeBased().everyMinutes(5).create();
  return { message:"Scheduled campaign sender installed. It checks for due campaigns every five minutes." };
}

function campaignSchedulerInstalled_() {
  try {
    return ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === CAMPAIGN_SCHEDULE_HANDLER);
  } catch (error) {
    return null; // Unknown (for example, missing trigger scope); the UI shows no warning rather than a false one.
  }
}

function campaignScheduleValidation_(value, now) {
  const reference = now instanceof Date ? now : new Date();
  const sendAt = value instanceof Date ? value : new Date(String(value || ""));
  if (!String(value || "").trim() || isNaN(sendAt.getTime())) return { error:"Choose a valid send date and time." };
  if (sendAt.getTime() < reference.getTime() + 60 * 1000) return { error:"Choose a send time at least one minute from now. To send right away, use Send remaining." };
  if (sendAt.getTime() > reference.getTime() + CAMPAIGN_SCHEDULE_MAX_DAYS_AHEAD * 86400000) return { error:`Choose a send time within ${CAMPAIGN_SCHEDULE_MAX_DAYS_AHEAD} days.` };
  return { send_at:sendAt };
}

function campaignScheduleIsDue_(campaign, now) {
  if (String(campaign?.status || "") !== "Approved") return false;
  if (!CAMPAIGN_SCHEDULE_ACTIVE_STATUSES.includes(String(campaign?.schedule_status || ""))) return false;
  const sendAt = campaign.scheduled_send_at instanceof Date ? campaign.scheduled_send_at : new Date(String(campaign?.scheduled_send_at || ""));
  return !isNaN(sendAt.getTime()) && sendAt.getTime() <= (now instanceof Date ? now : new Date()).getTime();
}

// A recipient blocked before the mailer was called (a logged reply, opt-out, stage change, and so on) is a
// normal skip. A block after a mailer attempt means delivery failed or is uncertain, so the schedule pauses.
function campaignScheduleUnsafeBlocks_(results) {
  return (results || []).filter(item => item && item.status === "Blocked" && item.mailer_attempted === true);
}

function campaignScheduleTimeLabel_(date) {
  return Utilities.formatDate(date, "America/Chicago", "EEE MMM d, h:mm a") + " CT";
}

function clearCampaignSchedule_(campaign, status, detail) {
  const h = campaign.headers;
  if (h.schedule_status === undefined) return;
  campaign.values[h.schedule_status] = status || "";
  if (h.schedule_detail !== undefined) campaign.values[h.schedule_detail] = detail || "";
  if (!status) {
    if (h.scheduled_send_at !== undefined) campaign.values[h.scheduled_send_at] = "";
    if (h.scheduled_by !== undefined) campaign.values[h.scheduled_by] = "";
  }
}

function campaignScheduleState_(campaign) {
  const h = campaign.headers;
  const value = key => (h[key] === undefined ? "" : campaign.values[h[key]]);
  return {
    campaign_id:String(value("campaign_id") || ""), status:String(value("status") || ""),
    approval_token:String(value("approval_token") || ""), scheduled_send_at:value("scheduled_send_at") || "",
    scheduled_by:String(value("scheduled_by") || ""), schedule_status:String(value("schedule_status") || ""),
  };
}

function updateCampaignSchedule_(campaignId, mutate) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, campaignId);
    if (!campaign) throw new Error("Campaign not found.");
    const outcome = mutate(campaign);
    campaign.values[campaign.headers.app_version] = APP_VERSION;
    sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
    return outcome;
  } finally { lock.releaseLock(); }
}

function apiScheduleOutreachCampaign_(p) {
  requireFields_(p || {}, ["campaign_id", "approval_token", "send_at", "staff_name"]);
  const check = campaignScheduleValidation_(p.send_at, new Date());
  if (check.error) throw new Error(check.error);
  const staffName = authenticatedActor_(p, "Sturgeon Distribution Hub");
  const label = campaignScheduleTimeLabel_(check.send_at);
  updateCampaignSchedule_(p.campaign_id, campaign => {
    const h = campaign.headers;
    if (String(campaign.values[h.status] || "") !== "Approved") throw new Error("Approve the campaign before scheduling it.");
    if (String(campaign.values[h.approval_token] || "") !== String(p.approval_token || "")) throw new Error("Campaign approval is not valid. Refresh and review again.");
    if (String(campaign.values[h.schedule_status] || "") === "Sending") throw new Error("This campaign is sending on its schedule now. Cancel the schedule first to change it.");
    const ready = campaignRecipientRows_(outreachCampaignSheets_().recipients, p.campaign_id)
      .filter(item => String(item.values[item.headers.status] || "") === "Ready to send").length;
    if (!ready) throw new Error("No approved recipients are waiting to send.");
    campaign.values[h.scheduled_send_at] = check.send_at;
    campaign.values[h.scheduled_by] = staffName;
    campaign.values[h.schedule_status] = "Scheduled";
    campaign.values[h.schedule_detail] = `Scheduled by ${staffName} for ${label}; ${ready} recipient${ready === 1 ? "" : "s"} waiting.`;
  });
  appendAudit_("SCHEDULE_OUTREACH_CAMPAIGN", "Campaign", p.campaign_id, "", staffName, OUTREACH_CAMPAIGNS_SHEET_NAME, OUTREACH_CAMPAIGNS_SHEET_NAME, "Scheduled", label);
  const installed = campaignSchedulerInstalled_();
  return {
    message:`Scheduled for ${label}. No email was sent now.${installed === false ? " Warning: the scheduled sender is not installed; run installOutreachCampaignScheduler() in Apps Script or this will not send." : ""}`,
    scheduled_send_at:check.send_at.toISOString(), scheduler_installed:installed,
  };
}

function apiCancelOutreachCampaignSchedule_(p) {
  requireFields_(p || {}, ["campaign_id", "staff_name"]);
  const staffName = authenticatedActor_(p, "Sturgeon Distribution Hub");
  updateCampaignSchedule_(p.campaign_id, campaign => {
    const status = String(campaign.values[campaign.headers.schedule_status] || "");
    if (![...CAMPAIGN_SCHEDULE_ACTIVE_STATUSES, "Paused"].includes(status)) throw new Error("This campaign has no active schedule.");
    clearCampaignSchedule_(campaign, "Cancelled", `Cancelled by ${staffName} at ${campaignScheduleTimeLabel_(new Date())}. Remaining recipients stay approved and can be sent manually or rescheduled.`);
  });
  appendAudit_("CANCEL_OUTREACH_CAMPAIGN_SCHEDULE", "Campaign", p.campaign_id, "", staffName, OUTREACH_CAMPAIGNS_SHEET_NAME, OUTREACH_CAMPAIGNS_SHEET_NAME, "Cancelled", "");
  return { message:"Schedule cancelled. No further scheduled email will be sent for this campaign." };
}

function runScheduledOutreachCampaigns() {
  const startedAt = Date.now();
  const deadlineAt = startedAt + CAMPAIGN_SCHEDULE_RUN_BUDGET_MS;
  const sheets = outreachCampaignSheets_();
  const h = getHeaderMap_(sheets.campaigns);
  if (sheets.campaigns.getLastRow() < 2 || h.schedule_status === undefined) return { runs:[] };
  const now = new Date();
  const due = sheets.campaigns.getRange(2, 1, sheets.campaigns.getLastRow() - 1, sheets.campaigns.getLastColumn()).getValues()
    .map((values, index) => campaignScheduleState_({ row:index + 2, values:values, headers:h }))
    .filter(state => campaignScheduleIsDue_(state, now))
    .sort((a, b) => new Date(a.scheduled_send_at).getTime() - new Date(b.scheduled_send_at).getTime());
  const runs = [];
  for (const state of due) {
    if (Date.now() > deadlineAt) break;
    runs.push(runScheduledCampaign_(state.campaign_id, deadlineAt));
  }
  if (runs.some(run => run.sent || run.skipped || run.state !== "Sending")) bumpReadCacheVersion_();
  console.log(JSON.stringify({ event:"outreach_campaign_schedule_run", due:due.length, runs:runs, total_ms:Date.now() - startedAt }));
  return { runs:runs };
}

function runScheduledCampaign_(campaignId, deadlineAt) {
  let sent = 0;
  let skipped = 0;
  const finish = (state, detail) => {
    try {
      updateCampaignSchedule_(campaignId, campaign => {
        // Never overwrite a cancellation or reopen that landed while this run was sending.
        if (!CAMPAIGN_SCHEDULE_ACTIVE_STATUSES.includes(String(campaign.values[campaign.headers.schedule_status] || ""))) return;
        clearCampaignSchedule_(campaign, state, detail);
      });
    } catch (error) {
      console.warn(`Campaign schedule state could not be saved for ${campaignId}: ${String(error.message || error)}`);
    }
    if (state !== "Sending") appendAudit_("SCHEDULED_OUTREACH_CAMPAIGN_" + state.toUpperCase(), "Campaign", campaignId, "", "Scheduled sender", OUTREACH_CAMPAIGNS_SHEET_NAME, OUTREACH_CAMPAIGNS_SHEET_NAME, state, detail);
    return { campaign_id:campaignId, state:state, sent:sent, skipped:skipped, detail:detail };
  };
  let state;
  try {
    state = updateCampaignSchedule_(campaignId, campaign => {
      const current = campaignScheduleState_(campaign);
      if (!campaignScheduleIsDue_(current, new Date())) return null;
      if (current.schedule_status === "Scheduled") {
        campaign.values[campaign.headers.schedule_status] = "Sending";
        campaign.values[campaign.headers.schedule_detail] = `Started ${campaignScheduleTimeLabel_(new Date())}.`;
      }
      return current;
    });
  } catch (error) {
    return { campaign_id:campaignId, state:"Waiting", sent:0, skipped:0, detail:String(error.message || error) };
  }
  if (!state) return { campaign_id:campaignId, state:"Not due", sent:0, skipped:0, detail:"" };
  const actor = `Scheduled send (${state.scheduled_by || "staff"})`;
  while (Date.now() < deadlineAt) {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, campaignId);
    const current = campaign ? campaignScheduleState_(campaign) : null;
    if (!current || current.status !== "Approved" || current.schedule_status !== "Sending") {
      return { campaign_id:campaignId, state:"Stopped", sent:sent, skipped:skipped, detail:"Schedule cancelled, reopened, or completed during the run." };
    }
    let res;
    try {
      res = apiSendOutreachCampaignBatch_({ campaign_id:campaignId, approval_token:current.approval_token, batch_size:CAMPAIGN_SCHEDULE_BATCH_SIZE,
        continue_after_block:true, staff_name:actor, deadline_at:deadlineAt });
    } catch (error) {
      const message = String(error.message || error);
      // A busy lock is not a failure: a staff action or manual send holds it. The next run continues.
      if (/in progress/i.test(message)) return finish("Sending", `Waiting for another send to finish; ${sent} sent this run. Continues on the next run.`);
      return finish("Paused", `Paused at ${campaignScheduleTimeLabel_(new Date())}: ${message.slice(0, 500)}`);
    }
    const unsafe = campaignScheduleUnsafeBlocks_(res.results);
    sent += Number(res.sent || 0);
    skipped += Math.max(0, Number(res.blocked || 0) - unsafe.length);
    if (unsafe.length) {
      return finish("Paused", `Paused at ${campaignScheduleTimeLabel_(new Date())} after ${unsafe[0].business}: ${String(unsafe[0].detail || "").slice(0, 300)}. Delivery may be uncertain; open the campaign and check before resuming. ${sent} sent, ${skipped} skipped this run.`);
    }
    if (!Number(res.remaining || 0)) {
      return finish("Done", `Finished ${campaignScheduleTimeLabel_(new Date())}. ${sent} sent and ${skipped} skipped in the final run; see the recipient list for the full result.`);
    }
    if (!(res.results || []).length) break; // Deadline reached before another recipient started.
  }
  return finish("Sending", `Sending: ${sent} sent and ${skipped} skipped in the latest run; continues automatically every five minutes.`);
}

function outreachStatusForOutcome_(outcome) {
  const map = {
    "Interested": "Interested",
    "Schedule tasting": "Interested",
    "Tasting visit": "Interested",
    "Wants cocktail list": "Nurture",
    "Follow up later": "Follow-up due",
    "Visit in person": "Interested",
    "Wrong contact": "Needs email",
    "Bad address": "Needs email",
    "Not interested": "Not interested",
    "Unsubscribed": "Do not contact",
  };
  return map[outcome] || "Replied";
}

const OUTREACH_OUTCOME_VALUES = [
  "Interested", "Schedule tasting", "Tasting visit", "Wants cocktail list", "Follow up later", "Visit in person",
  "Wrong contact", "Bad address", "Not interested", "Unsubscribed",
];
const OUTREACH_DIRECTORY_STAGE_VALUES = ["Initial", "Follow-up 1", "Follow-up 2", "Nurture check-in", "Reactivation", "Complete"];
const OUTREACH_DIRECTORY_STATUS_VALUES = [
  "Not contacted", "Sent", "Follow-up due", "Follow-up sent", "Replied", "Interested", "Not interested", "Bad address",
  "Do not contact", "Needs email", "Verify email", "Send error", "Existing customer", "Reactivation due", "Reactivation sent",
  "Use reactivation", "Nurture",
];
const OUTREACH_FOLLOW_UP_OUTCOMES = new Set(["Interested", "Schedule tasting", "Follow up later", "Visit in person"]);
const NURTURE_CHECK_IN_DUPLICATE_COOLDOWN_DAYS = 60;

function outreachIsCocktailListOutcome_(outcome) {
  return String(outcome || "").trim().toLowerCase() === "wants cocktail list";
}

function upsertNewsletterFromCocktailReply_(record, outcomeDate) {
  const sheet = getNewsletterContactsSheet_(true);
  const h = getHeaderMap_(sheet);
  const email = String(record.email || "").trim().toLowerCase();
  if (!email) throw new Error("A cocktail-list reply needs an email address.");
  const values = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const match = values.findIndex(row => String(row[h.email] || "").trim().toLowerCase() === email);
  const row = match >= 0 ? values[match].slice() : Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  const relationship = String(record.relationship || "").trim().toLowerCase() === "customer" ? "Customer" : "Prospect";
  const now = outcomeDate || new Date();
  set("contact_id", String(row[h.contact_id] || "") || Utilities.getUuid());
  set("account_id", String(record.account_id || "").trim());
  set("name", String(record.contact || "").trim());
  set("email", email);
  set("organization", String(record.business || "").trim());
  set("relationship_type", relationship);
  set("status", "Subscribed");
  set("consent_source", 'Replied "cocktails" to outreach email');
  set("consent_date", now);
  set("source_row", record.source_row || "");
  set("source_business", String(record.business || "").trim());
  set("topics", "Monthly cocktail ideas");
  set("updated_at", now);
  set("updated_by", "Outreach outcome");
  set("app_version", APP_VERSION);
  sheet.getRange(match >= 0 ? match + 2 : sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  return { contact_id:String(row[h.contact_id] || ""), created:match < 0 };
}

function unsubscribeNewsletterContactByEmail_(email, actor) {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return false;
  const sheet = getOutreachSs_().getSheetByName(NEWSLETTER_CONTACTS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return false;
  const h = getHeaderMap_(sheet);
  if (h.email === undefined || h.status === undefined) return false;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const now = new Date();
  const matching = values.map((row, index) => ({ row:row, index:index })).filter(item => String(item.row[h.email] || "").trim().toLowerCase() === target);
  if (!matching.length) return false;
  matching.forEach(item => {
    item.row[h.status] = "Unsubscribed";
    if (h.updated_at !== undefined) item.row[h.updated_at] = now;
    if (h.updated_by !== undefined) item.row[h.updated_by] = actor || "Outreach outcome";
    if (h.app_version !== undefined) item.row[h.app_version] = APP_VERSION;
  });
  matching.forEach(item => sheet.getRange(item.index + 2, 1, 1, item.row.length).setValues([item.row]));
  return true;
}

function appendOutreachActivity_(record, outcome, notes) {
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  const h = ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER]);
  const row = Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  set("timestamp", new Date());
  set("account_id", record.account_id || "");
  set("business", record.business);
  set("intended_recipient", record.email);
  set("message_stage", "OUTCOME");
  set("subject", "Staff follow-up outcome");
  set("result", outcome);
  set("error/detail", notes || "Logged in Sturgeon Distribution Hub");
  set("error_detail", notes || "Logged in Sturgeon Distribution Hub");
  set("delivered_to", "");
  set("mailer_version", APP_VERSION);
  sheet.appendRow(row);
}

function appendOutreachDraftActivity_(record, stage, subject) {
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  const h = ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER]);
  const row = Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  set("timestamp", new Date());
  set("account_id", record.account_id || "");
  set("business", record.business);
  set("intended_recipient", record.email);
  set("message_stage", stage);
  set("subject", subject);
  set("result", "DRAFT SAVED");
  set("error/detail", "Saved in Sturgeon Distribution Hub; no email sent.");
  set("error_detail", "Saved in Sturgeon Distribution Hub; no email sent.");
  set("delivered_to", "");
  set("mailer_version", APP_VERSION);
  sheet.appendRow(row);
}

function apiSaveOutreachDraft_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["source_row", "business", "message_stage", "subject", "body_text"]);

  const subject = publicText_(p.subject, 200, "Subject");
  const bodyText = publicText_(p.body_text, 20000, "Message");
  if (!subject) throw new Error("Subject is required.");
  if (!bodyText) throw new Error("Message is required.");

  const leadsSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(p.source_row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > leadsSheet.getLastRow()) throw new Error("Business row not found.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another draft update is in progress. Try again in a moment.");
  try {
    const h = getHeaderMap_(leadsSheet);
    const values = leadsSheet.getRange(rowNumber, 1, 1, leadsSheet.getLastColumn()).getValues()[0];
    const current = {};
    Object.keys(h).forEach(key => current[key] = values[h[key]]);
    const currentBusiness = String(outreachValue_(current, ["business", "business_name"]) || "").trim();
    const currentEmail = String(outreachValue_(current, ["email", "email_address"]) || "").trim();
    const accountId = String(current.account_id || "").trim();
    const currentStage = String(outreachValue_(current, ["next_email", "stage"]) || "Initial").trim();
    if (currentBusiness !== String(p.business || "").trim()) throw new Error("Business row changed. Refresh and try again.");
    if (p.email && currentEmail !== String(p.email).trim()) throw new Error("Contact email changed. Refresh and try again.");
    if (p.account_id && accountId !== String(p.account_id).trim()) throw new Error("Account identity changed. Refresh and try again.");
    if (currentStage.toLowerCase() !== String(p.message_stage || "").trim().toLowerCase()) {
      throw new Error("Email stage changed. Refresh before saving this draft.");
    }

    const sheet = getOutreachDraftSheet_(true);
    const headers = getHeaderMap_(sheet);
    const key = outreachDraftKey_(accountId || rowNumber, currentStage);
    const now = new Date();
    const updatedBy = authenticatedActor_(p, "Sturgeon Distribution Hub");
    const rowValues = Array(sheet.getLastColumn()).fill("");
    const set = (name, value) => { if (headers[name] !== undefined) rowValues[headers[name]] = value; };
    set("draft_key", key);
    set("account_id", accountId);
    set("source_row", rowNumber);
    set("business_name", currentBusiness);
    set("email", currentEmail);
    set("message_stage", currentStage);
    set("subject", subject);
    set("body_text", bodyText);
    set("updated_at", now);
    set("updated_by", updatedBy);
    set("app_version", APP_VERSION);

    let targetRow = sheet.getLastRow() + 1;
    if (sheet.getLastRow() >= 2) {
      const keyColumn = headers.draft_key + 1;
      const keys = sheet.getRange(2, keyColumn, sheet.getLastRow() - 1, 1).getValues();
      const match = keys.findIndex(row => String(row[0] || "") === key);
      if (match >= 0) targetRow = match + 2;
    }
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    appendOutreachDraftActivity_({ account_id:accountId, business:currentBusiness, email:currentEmail }, currentStage, subject);
    appendAudit_("SAVE_OUTREACH_DRAFT", "Account", accountId, accountId, updatedBy, OUTREACH_SHEET_NAME, OUTREACH_DRAFTS_SHEET_NAME, "Completed", currentStage);
    return { message:"Email draft saved.", account_id:accountId, source_row:rowNumber, updated_at:now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function outreachMailerProperties_() {
  const properties = PropertiesService.getScriptProperties();
  return {
    url:String(properties.getProperty("OUTREACH_MAILER_URL") || "").trim(),
    secret:String(properties.getProperty("OUTREACH_MAILER_SHARED_SECRET") || "").trim(),
  };
}

function outreachMailerConfigured_() {
  const config = outreachMailerProperties_();
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.url) && config.secret.length >= 24;
}

const OUTREACH_MAILER_STATUS_CACHE_KEY = "outreach_mailer_status_v1";

function cachedOutreachMailerStatus_() {
  const cached = CacheService.getScriptCache().get(OUTREACH_MAILER_STATUS_CACHE_KEY);
  if (!cached) return null;
  try { return JSON.parse(cached); }
  catch (error) { return null; }
}

function outreachMailerStatus_() {
  const cached = cachedOutreachMailerStatus_();
  if (cached) return cached;
  let status;
  if (!outreachMailerConfigured_()) {
    status = { can_send:false, test_send_available:false, detail:"Mailer URL or shared secret is not configured." };
    CacheService.getScriptCache().put(OUTREACH_MAILER_STATUS_CACHE_KEY, JSON.stringify(status), 60);
    return status;
  }
  try {
    const result = callOutreachMailer_({ action:"appMailerStatus" });
    status = {
      can_send:!!result.can_send,
      test_send_available:!!result.test_send_available,
      detail:String(result.detail || ""),
    };
  } catch (error) {
    status = { can_send:false, test_send_available:false, detail:String(error.message || error) };
  }
  CacheService.getScriptCache().put(OUTREACH_MAILER_STATUS_CACHE_KEY, JSON.stringify(status), status.can_send || status.test_send_available ? 60 : 15);
  return status;
}

function apiGetOutreachSendStatus_() {
  return outreachMailerStatus_();
}

function callOutreachMailer_(payload) {
  const config = outreachMailerProperties_();
  if (!outreachMailerConfigured_()) throw new Error("Direct sending is not configured. Set OUTREACH_MAILER_URL and OUTREACH_MAILER_SHARED_SECRET in the Inventory Backend Script Properties.");
  const response = UrlFetchApp.fetch(config.url, {
    method:"post",
    contentType:"application/json",
    payload:JSON.stringify(Object.assign({}, payload, { service_token:config.secret })),
    muteHttpExceptions:true,
    followRedirects:true,
  });
  let result;
  try { result = JSON.parse(response.getContentText() || "{}"); }
  catch (error) { throw new Error("The Distribution Outreach mailer returned an unreadable response."); }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !result.ok) {
    throw new Error(result?.error || `The Distribution Outreach mailer failed with HTTP ${response.getResponseCode()}.`);
  }
  return result;
}

function outreachActivityRows_() {
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER, "Message ID", "Idempotency Token"]);
  return getAllRowsAsObjects_(sheet);
}

function acceptedOutreachSendForToken_(token) {
  const normalized = String(token || "").trim();
  if (!normalized) return null;
  const sheet = getOutreachSs_().getSheetByName(OUTREACH_ACTIVITY_SHEET_NAME);
  if (sheet) ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER, "Message ID", "Idempotency Token"]);
  const row = outreachRowsMatchingCell_(sheet, ["idempotency_token", "Idempotency Token"], normalized).reverse().find(item => {
    const result = String(outreachValue_(item, ["result"]) || "").toUpperCase();
    return result.indexOf("SENT") >= 0 && result.indexOf("TEST") < 0;
  });
  return row ? {
    accepted:true,
    message_id:String(outreachValue_(row, ["message_id", "zoho_message_id", "Message ID"]) || ""),
    sent_at:outreachValue_(row, ["timestamp", "sent_at"]) || new Date(),
    idempotent:true,
  } : null;
}

// Campaign delivery has already frozen the email subject and HTML. Build only
// the current directory fields needed for safety checks; do not render a draft
// or load Activity, Drafts, Programs, or Engagement for one recipient.
function campaignSendLightweightRecord_(row, sourceRow) {
  return {
    account_id:String(row.account_id || "").trim(),
    source_row:sourceRow,
    business:String(outreachValue_(row, ["business", "business_name"]) || "").trim(),
    email:String(outreachValue_(row, ["email", "email_address"]) || "").trim(),
    postal_code:String(outreachValue_(row, ["zip", "zip_code", "postal_code"]) || "").trim(),
    city:String(outreachValue_(row, ["city", "town"]) || "").trim(),
    county:String(outreachValue_(row, ["county"]) || "").trim(),
    segment:String(outreachValue_(row, ["segment"]) || "").trim(),
    wave:String(outreachValue_(row, ["wave"]) || "").trim(),
    craft_spirit_fit:Number(outreachValue_(row, ["craft-spirit_fit_(1–5)", "craft-spirit_fit_(1-5)", "craft_spirit_fit", "craft_spirit_fit_(1–5)"]) || 0),
    status:String(outreachValue_(row, ["status"]) || "Not contacted").trim(),
    outcome:String(outreachValue_(row, ["outcome"]) || "").trim(),
    do_not_email:toBool_(outreachValue_(row, ["do_not_email", "do_not_contact"])),
    email_confidence:String(outreachValue_(row, ["email_confidence"]) || "").trim(),
    last_emailed:outreachValue_(row, ["last_emailed", "last_email"]),
    message_id:String(outreachValue_(row, ["message_id", "zoho_message_id"]) || "").trim(),
    next_email:String(outreachValue_(row, ["next_email", "stage"]) || "Initial").trim(),
    next_follow_up:outreachValue_(row, ["next_follow-up", "next_follow_up"]),
    activity:[],
  };
}

function legacyPilotSent_(record) {
  if (!__LEGACY_PILOT_SENT_BY_EMAIL) {
    __LEGACY_PILOT_SENT_BY_EMAIL = new Map();
    const sheet = getOutreachSs_().getSheetByName(OUTREACH_PILOT_SHEET_NAME);
    if (sheet && sheet.getLastRow() >= 2) getAllRowsAsObjects_(sheet).forEach(row => {
      const email = String(outreachValue_(row, ["email", "intended_recipient"]) || "").trim().toLowerCase();
      const business = String(outreachValue_(row, ["business", "business_name"]) || "").trim().toLowerCase();
      const status = String(outreachValue_(row, ["send_status", "status"]) || "").trim().toUpperCase();
      const messageId = String(outreachValue_(row, ["message_id", "zoho_message_id"]) || "").trim();
      const sentAt = outreachValue_(row, ["sent_at", "sent_timestamp"]);
      if (!email || !(status.indexOf("SENT") === 0 || !!messageId || !!sentAt)) return;
      const businesses = __LEGACY_PILOT_SENT_BY_EMAIL.get(email) || new Set();
      businesses.add(business);
      __LEGACY_PILOT_SENT_BY_EMAIL.set(email, businesses);
    });
  }
  const businesses = __LEGACY_PILOT_SENT_BY_EMAIL.get(String(record.email || "").trim().toLowerCase());
  return !!businesses && (businesses.has("") || businesses.has(String(record.business || "").trim().toLowerCase()));
}

function initialSentActivityForRecipient_(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  const headers = getHeaderMap_(sheet);
  const recipientHeader = headers.intended_recipient !== undefined ? "intended_recipient" : headers.delivered_to !== undefined ? "delivered_to" : "";
  if (!recipientHeader) return false;
  // One TextFinder lookup avoids rebuilding the Activity Log during delivery.
  return outreachRowsMatchingCell_(sheet, [recipientHeader], normalized).some(initialSentActivityRow_);
}

function initialSentDirectoryEmailElsewhere_(email, sourceRow) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  return outreachRowsMatchingCell_(sheet, ["email", "email_address"], normalized)
    .some(row => Number(row.__source_row) !== Number(sourceRow) && !!outreachValue_(row, ["last_emailed", "last_email"]));
}

function outreachStageIsDue_(record, now) {
  const dueAt = outreachDate_(record.next_follow_up);
  const endOfToday = new Date(now || new Date());
  endOfToday.setHours(23, 59, 59, 999);
  return !!dueAt && dueAt.getTime() <= endOfToday.getTime();
}

function outreachRecentStageSend_(record, stage, cooldownDays, now) {
  const cutoff = new Date(now || new Date());
  cutoff.setDate(cutoff.getDate() - Number(cooldownDays || 0));
  return (record.activity || []).some(item => {
    const result = String(item.result || "").toUpperCase();
    if (String(item.stage || "").trim().toLowerCase() !== String(stage || "").trim().toLowerCase() || result.indexOf("SENT") < 0 || result.indexOf("TEST") >= 0) return false;
    const sentAt = outreachDate_(item.timestamp);
    // An undated activity row is unsafe to repeat; retain the previous fail-closed behavior.
    return !sentAt || sentAt.getTime() >= cutoff.getTime();
  });
}

function outreachSendEligibility_(record, options) {
  const reasons = [];
  const email = String(record.email || "").trim().toLowerCase();
  const stage = String(record.next_email || "Initial").trim();
  const status = outreachStatusLower_(record);
  const outcome = String(record.outcome || "").trim().toLowerCase();
  const confidence = String(record.email_confidence || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reasons.push("Recipient email is invalid");
  if (record.do_not_email || ["do not contact", "not interested", "unsubscribed"].includes(status) || ["bad address", "unsubscribed", "not interested", "do not contact"].includes(outcome)) reasons.push("Business is excluded from email");
  if (outreachIsCocktailListOutcome_(outcome)) reasons.push("Recipient receives the cocktail list instead of sales outreach");
  const crossSendCooldown = outreachCrossSendCooldownReason_(email, false);
  if (crossSendCooldown) reasons.push(crossSendCooldown);
  if (confidence && !["confirmed", "published", "supplied"].includes(confidence)) reasons.push("Recipient email is not verified");
  const sentForStage = (record.activity || []).some(item => {
    const result = String(item.result || "").toUpperCase();
    return String(item.stage || "").trim().toLowerCase() === stage.toLowerCase() && result.indexOf("SENT") >= 0 && result.indexOf("TEST") < 0;
  });
  if (stage === "Nurture check-in") {
    if (outreachRecentStageSend_(record, stage, NURTURE_CHECK_IN_DUPLICATE_COOLDOWN_DAYS)) reasons.push(`${stage} was sent within the last ${NURTURE_CHECK_IN_DUPLICATE_COOLDOWN_DAYS} days`);
  } else if (sentForStage) reasons.push(`${stage} was already sent`);
  if (stage === "Initial") {
    if (options?.initial_sent_emails?.has(email)) reasons.push("An initial email was already sent to this address");
    if (record.last_emailed || record.message_id || (!options?.skip_legacy_pilot && legacyPilotSent_(record))) reasons.push("An initial email was already sent");
    if (!["not contacted", "review", "approved"].includes(status)) reasons.push("Business is not eligible for initial outreach");
  } else if (stage === "Follow-up 1" || stage === "Follow-up 2") {
    if (!["follow-up due", "sent", "follow-up sent"].includes(status)) reasons.push("Follow-up is not due");
    if (!outreachStageIsDue_(record)) reasons.push("Follow-up date has not arrived");
  } else if (stage === "Nurture check-in") {
    if (status !== "nurture") reasons.push("Nurture check-in is not due");
    if (!outreachStageIsDue_(record)) reasons.push("Nurture check-in date has not arrived");
  } else if (stage === "Reactivation") {
    if (!["reactivation due", "use reactivation"].includes(status)) reasons.push("Reactivation is not due");
  } else {
    reasons.push("Email stage is not sendable");
  }
  return Array.from(new Set(reasons));
}

function outreachNextStage_(stage) {
  if (stage === "Initial") return "Follow-up 1";
  if (stage === "Follow-up 1") return "Follow-up 2";
  if (stage === "Follow-up 2" || stage === "Nurture check-in") return "Nurture check-in";
  return "Complete";
}

function outreachAddDays_(date, days) {
  const value = new Date(date.getTime());
  value.setDate(value.getDate() + Number(days || 0));
  return value;
}

function advanceOutreachSend_(sheet, rowNumber, record, stage, messageId, sentAt, settings, existingValues) {
  const h = getHeaderMap_(sheet);
  const values = existingValues || sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  const setCell = (keys, value) => {
    const key = keys.find(candidate => h[candidate] !== undefined);
    if (key) values[h[key]] = value;
  };
  settings = settings || getOutreachCampaignSettings_();
  const nextStage = outreachNextStage_(stage);
  const followUpDays = nextStage === "Nurture check-in"
    ? Number(settings["Nurture check-in days"] || 90)
    : stage === "Initial"
      ? Number(settings["Follow-up days"] || 7)
      : Number(settings["Second follow-up days"] || 7);
  setCell(["queue", "queue?"], false);
  setCell(["next_email", "stage"], nextStage);
  setCell(["status"], nextStage === "Nurture check-in" ? "Nurture" : stage === "Initial" ? "Sent" : stage === "Reactivation" ? "Reactivation sent" : "Follow-up sent");
  setCell(["last_emailed", "last_email"], sentAt);
  setCell(["next_follow-up", "next_follow_up"], nextStage === "Complete" ? "" : outreachAddDays_(sentAt, followUpDays));
  setCell(["message_id", "zoho_message_id"], messageId || "");
  setCell(["record_updated_at"], new Date());
  sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
  return nextStage;
}

function finalizeOutreachSend_(sheet, rowNumber, record, stage, messageId, sentAt, staffName, idempotencyToken, existingValues) {
  const nextStage = advanceOutreachSend_(sheet, rowNumber, record, stage, messageId, sentAt, null, existingValues);
  appendAudit_("SEND_OUTREACH_EMAIL", "Account", record.account_id, record.account_id, staffName, OUTREACH_DRAFTS_SHEET_NAME, OUTREACH_ACTIVITY_SHEET_NAME, "Completed", `${stage}; message ${messageId || "accepted without message ID"}; token ${idempotencyToken}`);
  return nextStage;
}

function apiSendOutreachEmail_(p, testMode) {
  if (!p) throw new Error("Missing send request.");
  requireFields_(p, ["source_row", "business", "message_stage", "idempotency_token", "staff_name"]);
  const token = String(p.idempotency_token || "").trim();
  if (!/^[A-Za-z0-9_-]{20,160}$/.test(token)) throw new Error("A valid idempotency token is required.");
  const rowNumber = Number(p.source_row);
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error("Business row not found.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another outreach send is in progress. Wait a moment and try again.");
  let accepted = false;
  let acceptedMessageId = "";
  try {
    const h = getHeaderMap_(sheet);
    const values = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    const current = {};
    Object.keys(h).forEach(key => current[key] = values[h[key]]);
    const activityMap = outreachActivityMap_();
    const settings = getOutreachCampaignSettings_();
    const draftMap = outreachDraftMap_();
    const record = outreachRecord_(current, rowNumber, activityMap, settings, draftMap, outreachProgramMap_(), outreachEngagementMap_());
    const stage = String(record.next_email || "Initial").trim();
    if (record.business !== String(p.business || "").trim()) throw new Error("Business row changed. Refresh and try again.");
    if (p.email && record.email.toLowerCase() !== String(p.email).trim().toLowerCase()) throw new Error("Recipient changed. Refresh and try again.");
    if (p.account_id && record.account_id !== String(p.account_id).trim()) throw new Error("Account identity changed. Refresh and try again.");
    if (stage.toLowerCase() !== String(p.message_stage || "").trim().toLowerCase()) throw new Error("Email stage changed. Refresh and try again.");
    if (!record.has_saved_draft) throw new Error("Save the reviewed subject and message before sending.");
    if (String(p.subject || "").trim() !== record.subject || String(p.body_text || "").trim() !== record.body_text) throw new Error("The reviewed draft changed. Save it again before sending.");

    let result = !testMode ? acceptedOutreachSendForToken_(token) : null;
    if (!result) {
      // A test is delivered only to Karl and never changes the prospect's send
      // status. Real sends still require a valid, verified, eligible recipient.
      const reasons = testMode ? [] : outreachSendEligibility_(record);
      if (reasons.length) throw new Error(reasons.join("; ") + ".");
      const testDraft = draftMap.get(outreachDraftKey_(record.account_id || rowNumber, stage)) || draftMap.get(outreachDraftKey_(rowNumber, stage));
      const html = testMode ? outreachMessage_(current, settings, testDraft, true).html : record.preview_html;
      result = callOutreachMailer_({
        action:testMode ? "sendAppTestEmail" : "sendAppEmail",
        idempotency_token:token,
        account_id:record.account_id,
        source_row:rowNumber,
        business:record.business,
        recipient:record.email,
        message_stage:stage,
        subject:record.subject,
        html:html,
        requested_by:publicText_(p.staff_name, 120, "Staff name"),
      });
    }
    if (!result.accepted) throw new Error("Zoho did not accept the email.");
    accepted = true;
    acceptedMessageId = String(result.message_id || "");
    if (result.partial_failure) {
      appendAudit_("SEND_OUTREACH_EMAIL_PARTIAL", "Account", record.account_id, record.account_id, String(p.staff_name || "Staff"), "Distribution Outreach", OUTREACH_ACTIVITY_SHEET_NAME, "Needs recovery", String(result.partial_failure));
    }
    if (testMode) return { message:"Test email accepted by Zoho. The business was not marked sent.", test:true, message_id:acceptedMessageId, idempotent:!!result.idempotent };
    const sentAt = result.sent_at ? new Date(result.sent_at) : new Date();
    const nextStage = finalizeOutreachSend_(sheet, rowNumber, record, stage, acceptedMessageId, isNaN(sentAt.getTime()) ? new Date() : sentAt, publicText_(p.staff_name, 120, "Staff name"), token);
    return { message:"Email accepted by Zoho and recorded.", accepted:true, message_id:acceptedMessageId, next_stage:nextStage, idempotent:!!result.idempotent };
  } catch (error) {
    if (accepted) {
      appendAudit_("SEND_OUTREACH_EMAIL_PARTIAL", "Account", String(p.account_id || ""), String(p.account_id || ""), String(p.staff_name || "Staff"), OUTREACH_ACTIVITY_SHEET_NAME, OUTREACH_SHEET_NAME, "Needs recovery", `Zoho accepted message ${acceptedMessageId || "without ID"}; ${String(error.message || error)}`);
      throw new Error(`Zoho accepted the email${acceptedMessageId ? ` (${acceptedMessageId})` : ""}, but follow-up recording needs recovery. Do not resend; retry with the same review window.`);
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function apiUpdateOutreachOutcome_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["source_row", "business", "outcome"]);

  const outcome = String(p.outcome || "").trim();
  if (!OUTREACH_OUTCOME_VALUES.includes(outcome)) throw new Error("Unsupported outcome.");
  const followUpText = String(p.next_follow_up || "").trim();
  if (OUTREACH_FOLLOW_UP_OUTCOMES.has(outcome) && !followUpText) {
    throw new Error(`Choose a next follow-up date for “${outcome}.”`);
  }
  const followUpDate = followUpText ? new Date(`${followUpText}T12:00:00`) : null;
  if (followUpText && isNaN(followUpDate.getTime())) throw new Error("Next follow-up date is invalid.");

  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(p.source_row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error("Lead row not found.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another outreach update is in progress.");
  try {
    const h = getHeaderMap_(sheet);
    const rowRange = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn());
    const values = rowRange.getValues()[0];
    const originalValues = values.slice();
    const current = {};
    Object.keys(h).forEach(key => current[key] = values[h[key]]);
    const currentBusiness = String(outreachValue_(current, ["business", "business_name"]) || "").trim();
    const currentEmail = String(outreachValue_(current, ["email", "email_address"]) || "").trim();
    const accountId = String(current.account_id || "").trim();
    if (currentBusiness !== String(p.business || "").trim()) throw new Error("Lead changed in the sheet. Refresh and try again.");
    if (p.email && currentEmail !== String(p.email).trim()) throw new Error("Contact email changed in the sheet. Refresh and try again.");
    if (p.account_id && accountId !== String(p.account_id).trim()) throw new Error("Account identity changed. Refresh and try again.");

    const setRowValue = (keys, value) => {
      const key = keys.find(candidate => h[candidate] !== undefined);
      if (key) values[h[key]] = value;
    };
    setRowValue(["status"], outreachStatusForOutcome_(outcome));
    setRowValue(["outcome"], outcome);
    setRowValue(["record_updated_at"], new Date());
    if (followUpDate) setRowValue(["next_follow-up", "next_follow_up"], followUpDate);
    if (["Not interested", "Unsubscribed"].includes(outcome)) setRowValue(["do_not_email", "do_not_contact"], true);
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    const priorNotes = String(outreachValue_(current, ["notes"]) || "").trim();
    // Logged from a reply sent from another address: remember that address so later replies match this business.
    let altLine = "";
    if (p.reply_id) {
      try {
        const repliesSheet = getInboundRepliesSheet_(false);
        const found = repliesSheet ? outreachRowsMatchingCell_(repliesSheet, ["reply_id", "Reply ID"], String(p.reply_id).trim()) : [];
        if (found.length && String(found[0].account_id || "").trim() === accountId) altLine = inboundReplyAltEmailLine_(found[0], currentEmail, priorNotes, today);
      } catch (error) { console.warn(`Alt email not learned from reply ${p.reply_id}: ${String(error.message || error)}`); }
    }
    const newNoteLines = [p.notes ? `${today} - ${String(p.notes).trim()}` : "", altLine].filter(Boolean);
    if (newNoteLines.length) setRowValue(["notes"], [priorNotes].concat(newNoteLines).filter(Boolean).join("\n"));

    if (h.outcome !== undefined) {
      sheet.getRange(rowNumber, h.outcome + 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(OUTREACH_OUTCOME_VALUES, true).setAllowInvalid(false).build()
      );
    }
    writeChangedRowCells_(sheet, rowNumber, originalValues, values);

    if (outreachIsCocktailListOutcome_(outcome)) {
      upsertNewsletterFromCocktailReply_({
        account_id:accountId,
        source_row:rowNumber,
        business:currentBusiness,
        contact:String(outreachValue_(current, ["contact", "contact_name", "contact_person", "first_name"]) || "").trim(),
        email:currentEmail,
        relationship:String(outreachValue_(current, ["relationship"]) || "").trim(),
      }, new Date());
    }
    if (outcome === "Unsubscribed") unsubscribeNewsletterContactByEmail_(currentEmail, String(p.staff_name || "Outreach outcome"));

    appendOutreachActivity_({ account_id:accountId, business:currentBusiness, email:currentEmail }, outcome, String(p.notes || ""));
    appendAudit_("UPDATE_OUTREACH_OUTCOME", "Account", accountId, accountId, String(p.staff_name || "Staff"), OUTREACH_SHEET_NAME, OUTREACH_SHEET_NAME, "Completed", outcome);
    // The reply it was logged from is handled, and every reply of this business waiting for an outcome gets it.
    let reply = null;
    try { reply = recordInboundReplyOutcome_(accountId, outcome, String(p.staff_name || "Staff"), p.reply_id || ""); }
    catch (error) { console.warn(`Outcome saved; replies not updated: ${String(error.message || error)}`); }
    const altEmail = altLine ? (altLine.match(/Alt email: (\S+)/) || [])[1] || "" : "";
    return { message:altEmail ? `Outcome saved. ${altEmail} added as an alternate email.` : "Outcome saved.", account_id:accountId, source_row:rowNumber, status:outreachStatusForOutcome_(outcome), reply:reply, alt_email_added:altEmail };
  } finally {
    lock.releaseLock();
  }
}

function apiLogOutreachContact_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["source_row", "business", "contact_date", "channel", "staff_name"]);
  const channels = ["In person", "Phone", "Email outside app", "Event/tasting", "Other"];
  const channel = String(p.channel || "").trim();
  if (!channels.includes(channel)) throw new Error("Choose a listed contact channel.");
  const contactDateText = String(p.contact_date || "").trim();
  const contactDate = new Date(`${contactDateText}T12:00:00`);
  if (isNaN(contactDate.getTime())) throw new Error("Contact date is invalid.");
  const outcome = String(p.outcome || "").trim();
  if (outcome && !OUTREACH_OUTCOME_VALUES.includes(outcome)) throw new Error("Unsupported outcome.");
  const followUpText = String(p.next_follow_up || "").trim();
  if (outcome && OUTREACH_FOLLOW_UP_OUTCOMES.has(outcome) && !followUpText) throw new Error(`Choose a next follow-up date for “${outcome}.”`);
  const followUpDate = followUpText ? new Date(`${followUpText}T12:00:00`) : null;
  if (followUpText && isNaN(followUpDate.getTime())) throw new Error("Next follow-up date is invalid.");
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(p.source_row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error("Lead row not found. Add the business before logging contact.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another outreach update is in progress.");
  try {
    const h = getHeaderMap_(sheet);
    const range = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn());
    const values = range.getValues()[0];
    const originalValues = values.slice();
    const current = {}; Object.keys(h).forEach(key => current[key] = values[h[key]]);
    const business = String(outreachValue_(current, ["business", "business_name"]) || "").trim();
    const email = String(outreachValue_(current, ["email", "email_address"]) || "").trim();
    const accountId = String(current.account_id || "").trim();
    if (business !== String(p.business || "").trim()) throw new Error("Lead changed in the sheet. Refresh and try again.");
    const set = (keys, value) => { const key = keys.find(key => h[key] !== undefined); if (key) values[h[key]] = value; };
    const notes = publicText_(p.notes || "", 4000, "Notes");
    const contactPerson = publicText_(p.contact_person || "", 120, "Contact person");
    const noteDetail = [channel, contactPerson && `with ${contactPerson}`, notes].filter(Boolean).join(" — ");
    let automaticFollowUpText = "";
    if (outcome) {
      set(["status"], outreachStatusForOutcome_(outcome));
      set(["outcome"], outcome);
      if (followUpDate) set(["next_follow-up", "next_follow_up"], followUpDate);
      if (["Not interested", "Unsubscribed"].includes(outcome)) set(["do_not_email", "do_not_contact"], true);
    }
    if (channel === "Email outside app") {
      set(["last_emailed"], contactDate);
      const nextKey = ["next_email"].find(key => h[key] !== undefined);
      if (nextKey && String(values[h[nextKey]] || "").trim().toLowerCase() === "initial") values[h[nextKey]] = "Follow-up 1";
      if (!outcome) {
        const settings = getOutreachCampaignSettings_();
        const followUpDays = Number(settings["Follow-up days"] || 7);
        const automaticFollowUp = new Date(contactDate);
        automaticFollowUp.setDate(automaticFollowUp.getDate() + (Number.isFinite(followUpDays) ? followUpDays : 7));
        set(["status"], "Sent");
        set(["next_follow-up", "next_follow_up"], automaticFollowUp);
        automaticFollowUpText = Utilities.formatDate(automaticFollowUp, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
    }
    const priorNotes = String(outreachValue_(current, ["notes"]) || "").trim();
    const datedNote = `${Utilities.formatDate(contactDate, Session.getScriptTimeZone(), "yyyy-MM-dd")} — ${noteDetail || "Contact logged"}`;
    set(["notes"], priorNotes ? `${priorNotes}\n${datedNote}` : datedNote);
    set(["record_updated_at"], new Date());
    writeChangedRowCells_(sheet, rowNumber, originalValues, values);
    if (outcome && outreachIsCocktailListOutcome_(outcome)) {
      upsertNewsletterFromCocktailReply_({
        account_id:accountId,
        source_row:rowNumber,
        business:business,
        contact:String(outreachValue_(current, ["contact", "contact_name", "contact_person", "first_name"]) || "").trim(),
        email:email,
        relationship:String(outreachValue_(current, ["relationship"]) || "").trim(),
      }, contactDate);
    }
    if (outcome === "Unsubscribed") unsubscribeNewsletterContactByEmail_(email, String(p.staff_name || "Outreach contact log"));
    const activity = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
    const ah = ensureHeaderColumns_(activity, [ACCOUNT_ID_HEADER]);
    const activityRow = Array(activity.getLastColumn()).fill("");
    const activitySet = (key, value) => { if (ah[key] !== undefined) activityRow[ah[key]] = value; };
    activitySet("timestamp", contactDate); activitySet("account_id", accountId); activitySet("business", business);
    activitySet("intended_recipient", email); activitySet("message_stage", channel); activitySet("subject", "Staff contact log");
    activitySet("result", "CONTACT LOGGED"); activitySet("error/detail", noteDetail); activitySet("error_detail", noteDetail);
    activitySet("staff", String(p.staff_name)); activitySet("mailer_version", APP_VERSION);
    activity.appendRow(activityRow);
    appendAudit_("LOG_OUTREACH_CONTACT", "Account", accountId, accountId, String(p.staff_name), OUTREACH_SHEET_NAME, OUTREACH_ACTIVITY_SHEET_NAME, "Completed", `${channel}${outcome ? `; ${outcome}` : ""}`);
    if (outcome) {
      try { recordInboundReplyOutcome_(accountId, outcome, String(p.staff_name || "Staff"), ""); }
      catch (error) { console.warn(`Contact logged; replies not updated: ${String(error.message || error)}`); }
    }
    return { message:"Contact logged.", account_id:accountId, source_row:rowNumber, status:outcome ? outreachStatusForOutcome_(outcome) : (channel === "Email outside app" ? "Sent" : String(outreachValue_(current, ["status"]) || "")), next_follow_up:followUpText || automaticFollowUpText };
  } finally { lock.releaseLock(); }
}

function apiUpdateOutreachBusiness_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["source_row", "business"]);
  if (!p.updates || typeof p.updates !== "object" || Array.isArray(p.updates)) throw new Error("Missing updates.");

  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(p.source_row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error("Business row not found.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another update is in progress. Try again in a moment.");
  try {
    const h = getHeaderMap_(sheet);
    const values = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    const current = {};
    Object.keys(h).forEach(key => current[key] = values[h[key]]);
    const currentBusiness = String(outreachValue_(current, ["business", "business_name"]) || "").trim();
    const currentEmail = String(outreachValue_(current, ["email", "email_address"]) || "").trim();
    const accountId = String(current.account_id || "").trim();
    if (currentBusiness !== String(p.business || "").trim()) throw new Error("Business row changed. Refresh and try again.");
    if (p.original_email && currentEmail !== String(p.original_email).trim()) throw new Error("Contact information changed. Refresh and try again.");
    if (p.account_id && accountId !== String(p.account_id).trim()) throw new Error("Account identity changed. Refresh and try again.");

    const changed = [];
    let milesEditedManually = false;
    let zipChanged = false;
    Object.keys(p.updates).forEach(canonical => {
      if (!Object.prototype.hasOwnProperty.call(OUTREACH_EDITABLE_FIELD_KEYS, canonical)) return;
      const actualKey = OUTREACH_EDITABLE_FIELD_KEYS[canonical].find(key => h[key] !== undefined);
      if (!actualKey) return;
      const value = String(p.updates[canonical] ?? "").trim();
      if (canonical === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("Enter a valid email address.");
      if (canonical === "craft_spirit_fit" && value && (!Number.isFinite(Number(value)) || Number(value) < 1 || Number(value) > 5)) {
        throw new Error("Craft-spirit fit must be between 1 and 5.");
      }
      if (canonical === "priority" && !["High", "Normal", "Low"].includes(value)) {
        throw new Error("Priority must be High, Normal, or Low.");
      }
      if (canonical === "miles" && value && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
        throw new Error("Miles must be zero or greater.");
      }
      if (canonical === "email_confidence" && value && !["Confirmed", "Published", "Supplied", "Needs verification"].includes(value)) {
        throw new Error("Choose a listed email confidence.");
      }
      if (String(current[actualKey] ?? "").trim() === value) return;
      values[h[actualKey]] = value;
      if (canonical === "miles") milesEditedManually = true;
      if (canonical === "postal_code") zipChanged = true;
      changed.push(outreachFieldLabel_(canonical));
    });

    if (milesEditedManually) {
      if (h.miles_source === undefined) throw new Error("Run Recalculate miles from ZIP once before saving a manual mileage override.");
      values[h.miles_source] = "manual";
    } else if (zipChanged) {
      const zipKey = OUTREACH_EDITABLE_FIELD_KEYS.postal_code.find(key => h[key] !== undefined);
      const result = setDirectoryMilesFromZip_(values, h, zipKey ? values[h[zipKey]] : "");
      if (result.updated) changed.push("Miles from ZIP");
    }

    const additionalNote = String(p.additional_note || "").trim();
    if (additionalNote) {
      const notesKey = ["notes"].find(key => h[key] !== undefined);
      if (!notesKey) throw new Error("The directory does not have a Notes column.");
      const priorNotes = String(current[notesKey] || "").trim();
      const datedNote = `${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd")} - ${additionalNote}`;
      values[h[notesKey]] = priorNotes ? `${priorNotes}\n${datedNote}` : datedNote;
      changed.push("Notes");
    }

    if (!changed.length) return { message:"No contact changes to save.", source_row:rowNumber, changed:[] };
    if (h.record_updated_at !== undefined) values[h.record_updated_at] = new Date();
    sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
    appendOutreachActivity_(
      { account_id:accountId, business:currentBusiness, email:String(p.updates.email || currentEmail) },
      "CONTACT UPDATED",
      `Updated ${changed.join(", ")}`
    );
    appendAudit_("UPDATE_BUSINESS", "Account", accountId, accountId, String(p.staff_name || "Staff"), OUTREACH_SHEET_NAME, OUTREACH_SHEET_NAME, "Completed", changed.join(", "));
    return { message:"Contact information saved.", account_id:accountId, source_row:rowNumber, changed:changed };
  } finally {
    lock.releaseLock();
  }
}

function apiUpdateOutreachPrograms_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["source_row", "business", "newsletter_status", "ordering_status"]);

  const newsletterStatuses = ["Not invited", "Candidate", "Invite planned", "Invited", "Subscribed", "Declined", "Unsubscribed"];
  const orderingStatuses = ["Not offered", "Candidate", "Invite planned", "Invited", "Active", "Paused"];
  const newsletterStatus = String(p.newsletter_status || "").trim();
  const orderingStatus = String(p.ordering_status || "").trim();
  if (!newsletterStatuses.includes(newsletterStatus)) throw new Error("Choose a listed newsletter status.");
  if (!orderingStatuses.includes(orderingStatus)) throw new Error("Choose a listed online-ordering status.");

  const consentSource = String(p.newsletter_consent_source || "").trim();
  const newsletterDate = String(p.newsletter_status_date || "").trim();
  if (newsletterStatus === "Subscribed" && (!consentSource || !newsletterDate)) {
    throw new Error("A subscribed newsletter contact needs a consent source and status date.");
  }

  const leadsSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(p.source_row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > leadsSheet.getLastRow()) throw new Error("Business row not found.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another program update is in progress. Try again in a moment.");
  try {
    const leadHeaders = getHeaderMap_(leadsSheet);
    const leadValues = leadsSheet.getRange(rowNumber, 1, 1, leadsSheet.getLastColumn()).getValues()[0];
    const current = {};
    Object.keys(leadHeaders).forEach(key => current[key] = leadValues[leadHeaders[key]]);
    const currentBusiness = String(outreachValue_(current, ["business", "business_name"]) || "").trim();
    const currentEmail = String(outreachValue_(current, ["email", "email_address"]) || "").trim();
    const accountId = String(current.account_id || "").trim();
    if (currentBusiness !== String(p.business || "").trim()) throw new Error("Business row changed. Refresh and try again.");
    if (p.email && currentEmail !== String(p.email).trim()) throw new Error("Contact email changed. Refresh and try again.");
    if (p.account_id && accountId !== String(p.account_id).trim()) throw new Error("Account identity changed. Refresh and try again.");

    const sheet = getOutreachProgramSheet_(true);
    const h = getHeaderMap_(sheet);
    const programKey = `account::${accountId || rowNumber}`;
    const now = new Date();
    const updatedBy = authenticatedActor_(p, "Sturgeon Distribution Hub");
    const values = Array(sheet.getLastColumn()).fill("");
    const set = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
    set("program_key", programKey);
    set("account_id", accountId);
    set("source_row", rowNumber);
    set("business_name", currentBusiness);
    set("email", currentEmail);
    set("newsletter_status", newsletterStatus);
    set("newsletter_consent_source", consentSource);
    set("newsletter_status_date", newsletterDate ? new Date(`${newsletterDate}T12:00:00`) : "");
    set("ordering_status", orderingStatus);
    set("ordering_customer_id", String(p.ordering_customer_id || "").trim());
    set("ordering_invite_date", p.ordering_invite_date ? new Date(`${p.ordering_invite_date}T12:00:00`) : "");
    set("ordering_portal_url", String(p.ordering_portal_url || "").trim());
    set("updated_at", now);
    set("updated_by", updatedBy);
    set("notes", String(p.notes || "").trim());
    set("app_version", APP_VERSION);

    let targetRow = sheet.getLastRow() + 1;
    if (sheet.getLastRow() >= 2) {
      const keyColumn = h.program_key + 1;
      const keys = sheet.getRange(2, keyColumn, sheet.getLastRow() - 1, 1).getValues();
      const match = keys.findIndex(row => String(row[0] || "") === programKey);
      if (match >= 0) targetRow = match + 2;
    }
    sheet.getRange(targetRow, 1, 1, values.length).setValues([values]);

    const activitySheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
    const activityHeaders = ensureHeaderColumns_(activitySheet, [ACCOUNT_ID_HEADER]);
    const activityRow = Array(activitySheet.getLastColumn()).fill("");
    const setActivity = (key, value) => { if (activityHeaders[key] !== undefined) activityRow[activityHeaders[key]] = value; };
    setActivity("timestamp", now);
    setActivity("account_id", accountId);
    setActivity("business", currentBusiness);
    setActivity("intended_recipient", currentEmail);
    setActivity("message_stage", "PROGRAMS");
    setActivity("subject", "Optional program plan updated");
    setActivity("result", "PROGRAM PLAN SAVED");
    setActivity("error/detail", `Newsletter: ${newsletterStatus}; Online ordering: ${orderingStatus}; no action sent.`);
    setActivity("error_detail", `Newsletter: ${newsletterStatus}; Online ordering: ${orderingStatus}; no action sent.`);
    setActivity("mailer_version", APP_VERSION);
    activitySheet.appendRow(activityRow);
    appendAudit_("UPDATE_ACCOUNT_PROGRAMS", "Account", accountId, accountId, updatedBy, OUTREACH_SHEET_NAME, OUTREACH_PROGRAMS_SHEET_NAME, "Completed", `Newsletter: ${newsletterStatus}; ordering: ${orderingStatus}`);

    return { message:"Program plan saved.", account_id:accountId, source_row:rowNumber, updated_at:now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function getNewsletterContactsSheet_(createIfMissing) {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(NEWSLETTER_CONTACTS_SHEET_NAME);
  if (sheet) {
    ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER]);
    return sheet;
  }
  if (!createIfMissing) return sheet;
  sheet = ss.insertSheet(NEWSLETTER_CONTACTS_SHEET_NAME);
  const headers = [["Contact ID", "Account ID", "Name", "Email", "Organization", "Relationship Type", "Status", "Consent Source", "Consent Date", "Source Row", "Source Business", "Topics", "Notes", "Updated At", "Updated By", "App Version"]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers).setFontWeight("bold").setBackground("#e5e7eb").setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  return sheet;
}

function apiUpsertNewsletterContact_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["email", "relationship_type", "status"]);
  const email = String(p.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  const relationships = ["Customer", "Prospect", "Vendor", "Banker", "Distributor", "Community", "Partner", "Other"];
  const statuses = ["Candidate", "Invite planned", "Invited", "Subscribed", "Declined", "Unsubscribed"];
  if (!relationships.includes(String(p.relationship_type))) throw new Error("Choose a listed relationship.");
  if (!statuses.includes(String(p.status))) throw new Error("Choose a listed newsletter status.");
  if (p.status === "Subscribed" && (!String(p.consent_source || "").trim() || !p.consent_date)) {
    throw new Error("A subscribed contact needs a consent source and consent date.");
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another newsletter update is in progress. Try again in a moment.");
  try {
    const sheet = getNewsletterContactsSheet_(true);
    const h = getHeaderMap_(sheet);
    const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    const requestedId = String(p.contact_id || "").trim();
    let targetRow = 0;
    rows.forEach((row, index) => {
      const rowId = String(row[h.contact_id] || "");
      const rowEmail = String(row[h.email] || "").trim().toLowerCase();
      if (requestedId && rowId === requestedId) targetRow = index + 2;
      else if (!requestedId && rowEmail === email) throw new Error("That email is already on the newsletter list. Open the existing contact to edit it.");
    });
    const contactId = requestedId || Utilities.getUuid();
    const now = new Date();
    const values = Array(sheet.getLastColumn()).fill("");
    const set = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
    set("contact_id", contactId);
    set("account_id", String(p.account_id || "").trim());
    set("name", String(p.name || "").trim());
    set("email", email);
    set("organization", String(p.organization || "").trim());
    set("relationship_type", String(p.relationship_type));
    set("status", String(p.status));
    set("consent_source", String(p.consent_source || "").trim());
    set("consent_date", p.consent_date ? new Date(`${p.consent_date}T12:00:00`) : "");
    set("source_row", p.source_row || "");
    set("source_business", String(p.source_business || "").trim());
    set("topics", String(p.topics || "").trim());
    set("notes", String(p.notes || "").trim());
    set("updated_at", now);
    set("updated_by", authenticatedActor_(p, "Sturgeon Distribution Hub"));
    set("app_version", APP_VERSION);
    sheet.getRange(targetRow || sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
    return { message:"Newsletter contact saved.", contact_id:contactId, updated_at:now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function publicText_(value, maxLength, label) {
  const text = String(value ?? "").trim();
  if (text.length > maxLength) throw publicError_(`${label} is too long.`);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

// Netlify sets authenticated_staff_name only after validating a Zoho session.
// Browser-provided staff_name is retained solely as a compatibility fallback for
// older operational records; the deployed Hub always supplies the trusted value.
function authenticatedActor_(p, fallback) {
  return publicText_(p?.authenticated_staff_name || p?.staff_name || fallback || "Sturgeon Distribution Hub", 120, "Staff name");
}

function publicEmail_(value, label, required) {
  const email = publicText_(value, 200, label).toLowerCase();
  if (required && !email) throw publicError_(`${label} is required.`);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw publicError_(`Enter a valid ${label.toLowerCase()}.`);
  return email;
}

function publicSubmissionId_(prefix) {
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  const suffix = Utilities.getUuid().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${prefix}-${date}-${suffix}`;
}

function getCustomerApplicationsSheet_(createIfMissing) {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(CUSTOMER_APPLICATIONS_SHEET_NAME);
  if (sheet) {
    ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER, "Account Link Status", "Inventory Tracking", "Inventory Store ID", "Inventory Route", "Data Sync Status"]);
    return sheet;
  }
  if (!createIfMissing) return sheet;
  sheet = ss.insertSheet(CUSTOMER_APPLICATIONS_SHEET_NAME);
  const headers = [[
    "Application ID", "Submitted At", "Workflow Status", "Legal Business Name", "Business Name", "Business Type", "Website",
    "Seller Permit Number",
    "Primary Contact Name", "Primary Contact Title", "Primary Email", "Primary Phone", "Ordering Email",
    "AP Contact Name", "AP Email", "Invoice Preference", "Delivery Address 1", "Delivery Address 2", "Delivery City",
    "Delivery State", "Delivery ZIP", "Delivery Window", "Delivery Instructions", "Billing Same", "Billing Address 1",
    "Billing City", "Billing State", "Billing ZIP", "Product Interests", "Expected Order Frequency", "Referral Source", "Notes",
    "Authorized Name", "Authorized Title", "Attested", "Newsletter Opt In", "Newsletter Consent At", "Submission Token", "App Version",
    "Account ID", "Account Link Status", "Inventory Tracking", "Inventory Store ID", "Inventory Route", "Data Sync Status"
  ]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers).setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff").setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  sheet.getRange("A:AM").setVerticalAlignment("top");
  sheet.getRange("Z:AI").setWrap(true);
  return sheet;
}

function getOnlineOrderRequestsSheet_(createIfMissing) {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(ONLINE_ORDER_REQUESTS_SHEET_NAME);
  if (sheet) {
    ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER, "Account Link Status", "Catalog Source", "Integration Status", "Badger Match Status", "Badger Customer Name", "Badger Invoice Date", "Badger Amount", "Delivered At"]);
    return sheet;
  }
  if (!createIfMissing) return sheet;
  sheet = ss.insertSheet(ONLINE_ORDER_REQUESTS_SHEET_NAME);
  const headers = [[
    "Request ID", "Submitted At", "Workflow Status", "Verification Status", "Business Name", "Customer ID", "Contact Name",
    "Email", "Phone", "PO Number", "Requested Delivery Date", "Delivery Window", "Delivery Instructions", "Notes",
    "Line Count", "Requested Cases", "Requested Bottles", "Bottle Equivalent", "Submission Token", "App Version",
    "Account ID", "Account Link Status", "Catalog Source", "Integration Status", "Badger Match Status", "Badger Customer Name", "Badger Invoice Date", "Badger Amount", "Delivered At"
  ]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers).setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff").setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  sheet.getRange("A:T").setVerticalAlignment("top");
  sheet.getRange("M:N").setWrap(true);
  return sheet;
}

function getOnlineOrderLinesSheet_(createIfMissing) {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(ONLINE_ORDER_LINES_SHEET_NAME);
  if (sheet) {
    ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER, "Catalog Source", "External Item ID"]);
    return sheet;
  }
  if (!createIfMissing) return sheet;
  sheet = ss.insertSheet(ONLINE_ORDER_LINES_SHEET_NAME);
  const headers = [["Request ID", "Account ID", "Line Number", "SKU ID", "SKU Name", "Quantity", "Unit", "Units Per Case", "Bottle Equivalent", "Catalog Source", "External Item ID", "App Version"]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers).setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff").setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  return sheet;
}

function existingSubmissionByToken_(sheet, token, idHeader) {
  if (!token || !sheet || sheet.getLastRow() < 2) return "";
  const h = getHeaderMap_(sheet);
  const idKey = normalizeHeader_(idHeader);
  if (h.submission_token === undefined || h[idKey] === undefined) return "";
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const match = values.find(row => String(row[h.submission_token] || "") === token);
  return match ? String(match[h[idKey]] || "") : "";
}

function upsertNewsletterFromApplication_(application) {
  if (!application.newsletter_opt_in) return;
  const sheet = getNewsletterContactsSheet_(true);
  const h = getHeaderMap_(sheet);
  const email = String(application.primary_email || "").trim().toLowerCase();
  const values = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const match = values.findIndex(row => String(row[h.email] || "").trim().toLowerCase() === email);
  // Any Unsubscribed or Declined row for this address counts, not just the first row.
  const optedOut = values.some(row => String(row[h.email] || "").trim().toLowerCase() === email && ["unsubscribed", "declined"].includes(String(row[h.status] || "").trim().toLowerCase()));
  const now = new Date();
  const row = match >= 0 ? values[match].slice() : Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  const fill = (key, value) => { if (h[key] !== undefined && !String(row[h[key]] || "").trim()) row[h[key]] = value; };
  const note = `Application ${application.application_id}`;
  if (match >= 0) {
    // The public form does not prove who owns the address, so it never re-subscribes
    // an address that unsubscribed or declined, and never replaces the name, business
    // or account already on file. A Candidate/Invited contact who opts in becomes
    // Subscribed; an existing subscription keeps its original consent record. Staff
    // can re-subscribe from the Hub after confirming with the customer.
    const current = String(row[h.status] || "").trim();
    fill("contact_id", Utilities.getUuid()); // a Cocktail list send needs one
    fill("account_id", application.account_id || "");
    fill("name", application.primary_contact_name);
    fill("organization", application.business_name || application.legal_business_name);
    fill("relationship_type", "Customer");
    const kept = optedOut;
    if (!kept && current !== "Subscribed") {
      set("status", "Subscribed");
      set("consent_source", "Customer application form; option preselected and could be unchecked");
      set("consent_date", now);
      fill("topics", "Products, cocktails, distillery updates");
    }
    const existingNotes = String(row[h.notes] || "").trim();
    const addition = kept ? `${note} asked to subscribe; left ${current || "unchanged"} because this address opted out (the public form cannot re-subscribe an address)` : note;
    set("notes", existingNotes ? `${existingNotes}; ${addition}` : addition);
  } else {
    set("contact_id", Utilities.getUuid());
    set("account_id", application.account_id || "");
    set("name", application.primary_contact_name);
    set("email", email);
    set("organization", application.business_name || application.legal_business_name);
    set("relationship_type", "Customer");
    set("status", "Subscribed");
    set("consent_source", "Customer application form; option preselected and could be unchecked");
    set("consent_date", now);
    set("topics", "Products, cocktails, distillery updates");
    set("notes", note);
  }
  set("updated_at", now);
  set("updated_by", "customer application form");
  set("app_version", APP_VERSION);
  sheet.getRange(match >= 0 ? match + 2 : sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

function resolvePublicAccount_(claimedAccountId, business, email, city, lockHeld) {
  const identity = accountIdentityLookup_();
  return findIdentityMatch_(identity, claimedAccountId, business, email, city);
}

function sendCustomerApplicationNotification_(application, sheet, rowNumber) {
  const business = application.business_name || application.legal_business_name;
  const reviewUrl = `https://docs.google.com/spreadsheets/d/${OUTREACH_SPREADSHEET_ID}/edit#gid=${sheet.getSheetId()}&range=A${rowNumber}`;
  const subject = `New wholesale application: ${business}`;
  const lines = [
    "A new wholesale customer application is ready for review.",
    "",
    `Application ID: ${application.application_id}`,
    `Business: ${business}`,
    `Legal business name: ${application.legal_business_name}`,
    `Contact: ${application.primary_contact_name}`,
    `Email: ${application.primary_email}`,
    `Phone: ${application.primary_phone}`,
    `Newsletter: ${application.newsletter_opt_in ? "Yes" : "No"}`,
    "",
    `Review the application: ${reviewUrl}`,
  ];
  const html = [
    "<p>A new wholesale customer application is ready for review.</p>",
    "<ul>",
    `<li><strong>Application ID:</strong> ${escapeOutreachHtml_(application.application_id)}</li>`,
    `<li><strong>Business:</strong> ${escapeOutreachHtml_(business)}</li>`,
    `<li><strong>Legal business name:</strong> ${escapeOutreachHtml_(application.legal_business_name)}</li>`,
    `<li><strong>Contact:</strong> ${escapeOutreachHtml_(application.primary_contact_name)}</li>`,
    `<li><strong>Email:</strong> ${escapeOutreachHtml_(application.primary_email)}</li>`,
    `<li><strong>Phone:</strong> ${escapeOutreachHtml_(application.primary_phone)}</li>`,
    `<li><strong>Newsletter:</strong> ${application.newsletter_opt_in ? "Yes" : "No"}</li>`,
    "</ul>",
    `<p><a href="${escapeOutreachHtml_(reviewUrl)}">Review this application in the staging sheet</a></p>`,
  ].join("");

  try {
    MailApp.sendEmail({
      to: CUSTOMER_APPLICATION_NOTIFICATION_EMAIL,
      replyTo: application.primary_email,
      name: "Sturgeon Distribution Hub",
      subject: subject,
      body: lines.join("\n"),
      htmlBody: html,
    });
    return { status:"Sent", sent_at:new Date(), error:"" };
  } catch (error) {
    return { status:"Send error", sent_at:"", error:String(error).slice(0, 500) };
  }
}

function apiSubmitCustomerApplication_(p) {
  if (!p) throw publicError_("Missing form data.");
  if (String(p.form_trap || "").trim()) return { message:"Application received.", application_id:"RECEIVED" };
  requireFields_(p, ["legal_business_name", "business_type", "seller_permit_number", "primary_contact_name", "primary_email", "primary_phone", "delivery_address_1", "delivery_city", "delivery_state", "delivery_zip", "authorized_name", "authorized_title", "submission_token"]);
  if (!toBool_(p.attested)) throw publicError_("Authorization is required.");

  const application = {
    legal_business_name:publicText_(p.legal_business_name, 160, "Legal business name"),
    business_name:publicText_(p.business_name, 160, "Business name"),
    business_type:publicText_(p.business_type, 80, "Business type"),
    website:publicText_(p.website, 300, "Website"),
    seller_permit_number:publicText_(p.seller_permit_number, 30, "Seller permit number"),
    primary_contact_name:publicText_(p.primary_contact_name, 120, "Primary contact name"),
    primary_contact_title:publicText_(p.primary_contact_title, 100, "Primary contact title"),
    primary_email:publicEmail_(p.primary_email, "Primary email", true),
    primary_phone:publicText_(p.primary_phone, 40, "Primary phone"),
    ordering_email:publicEmail_(p.ordering_email || p.primary_email, "Ordering email", true),
    ap_contact_name:publicText_(p.ap_contact_name, 120, "Accounts payable contact"),
    ap_email:publicEmail_(p.ap_email, "Accounts payable email", false),
    invoice_preference:publicText_(p.invoice_preference, 60, "Invoice preference"),
    delivery_address_1:publicText_(p.delivery_address_1, 180, "Delivery address"),
    delivery_address_2:publicText_(p.delivery_address_2, 120, "Delivery address details"),
    delivery_city:publicText_(p.delivery_city, 100, "Delivery city"),
    delivery_state:publicText_(p.delivery_state, 2, "Delivery state").toUpperCase(),
    delivery_zip:publicText_(p.delivery_zip, 10, "Delivery ZIP code"),
    delivery_window:publicText_(p.delivery_window, 160, "Delivery window"),
    delivery_instructions:publicText_(p.delivery_instructions, 1000, "Delivery instructions"),
    billing_same:toBool_(p.billing_same),
    billing_address_1:publicText_(p.billing_address_1, 180, "Billing address"),
    billing_city:publicText_(p.billing_city, 100, "Billing city"),
    billing_state:publicText_(p.billing_state, 2, "Billing state").toUpperCase(),
    billing_zip:publicText_(p.billing_zip, 10, "Billing ZIP code"),
    product_interests:(Array.isArray(p.product_interests) ? p.product_interests : [p.product_interests]).filter(Boolean).map(value => publicText_(value, 80, "Product interest")).join(", "),
    expected_order_frequency:publicText_(p.expected_order_frequency, 80, "Expected order frequency"),
    referral_source:publicText_(p.referral_source, 160, "Referral source"),
    notes:publicText_(p.notes, 2000, "Notes"),
    authorized_name:publicText_(p.authorized_name, 120, "Authorized name"),
    authorized_title:publicText_(p.authorized_title, 100, "Authorized title"),
    newsletter_opt_in:toBool_(p.newsletter_opt_in),
    claimed_account_id:publicText_(p.account_id, 80, "Account ID"),
    submission_token:publicText_(p.submission_token, 120, "Submission token"),
  };
  if (!application.billing_same && (!application.billing_address_1 || !application.billing_city || !application.billing_state || !application.billing_zip)) {
    throw publicError_("Complete the billing address or mark it the same as delivery.");
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw publicError_("Another application is being recorded. Try again in a moment.");
  let journal = null;
  try {
    const sheet = getCustomerApplicationsSheet_(true);
    ensureHeaderColumns_(sheet, ["Notification Status", "Notification Sent At", "Notification Error", ACCOUNT_ID_HEADER, "Account Link Status", "Data Sync Status"]);
    const priorId = existingSubmissionByToken_(sheet, application.submission_token, "Application ID");
    if (priorId) return { message:"Application already received.", application_id:priorId };
    const link = resolvePublicAccount_(application.claimed_account_id, application.business_name || application.legal_business_name, application.primary_email, application.delivery_city, true);
    application.account_id = link.record ? link.record.account_id : "";
    application.account_link_status = link.status;
    journal = startSubmissionJournal_("Customer application", application.submission_token, application.account_id, application.business_name || application.legal_business_name, p);
    if (journal.prior_record_id) return { message:"Application already received.", application_id:journal.prior_record_id };
    const h = getHeaderMap_(sheet);
    const now = new Date();
    application.application_id = publicSubmissionId_("APP");
    const row = Array(sheet.getLastColumn()).fill("");
    const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
    set("application_id", application.application_id);
    set("submitted_at", now);
    set("workflow_status", "New");
    Object.keys(application).forEach(key => set(key, application[key]));
    set("account_id", application.account_id);
    set("account_link_status", application.account_link_status);
    set("data_sync_status", "Normalized record saved");
    set("attested", true);
    set("newsletter_consent_at", application.newsletter_opt_in ? now : "");
    set("app_version", APP_VERSION);
    sheet.appendRow(row);
    upsertNewsletterFromApplication_(application);
    const applicationRow = sheet.getLastRow();
    const notificationJob = enqueueIntegrationJob_("APPLICATION_NOTIFICATION", "Application", application.application_id, application.account_id, {
      application_id:application.application_id,
      business:application.business_name || application.legal_business_name,
      email:application.primary_email,
    });
    const notification = sendCustomerApplicationNotification_(application, sheet, applicationRow);
    sheet.getRange(applicationRow, h.notification_status + 1, 1, 3).setValues([[
      notification.status,
      notification.sent_at,
      notification.error,
    ]]);
    updateIntegrationJob_(notificationJob, notification.status === "Sent" ? "Completed" : "Retry", notification.error);
    completeSubmissionJournal_(journal, "Completed", application.application_id, "");
    appendAudit_("SUBMIT_APPLICATION", "Application", application.application_id, application.account_id, "Public customer form", "Customer application", CUSTOMER_APPLICATIONS_SHEET_NAME, "Completed", application.account_link_status);
    return { message:"Application received for review.", application_id:application.application_id, account_link_status:application.account_link_status };
  } catch (error) {
    if (journal) completeSubmissionJournal_(journal, "Needs recovery", "", error.message || error);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function rowsWithSource_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const h = getHeaderMap_(sheet);
  const keys = Object.keys(h);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().map((row, index) => {
    const record = { source_row:index + 2 };
    keys.forEach(key => { record[key] = row[h[key]]; });
    return record;
  });
}

function customerApplicationRecord_(row) {
  const businessName = String(row.business_name || row.legal_business_name || "").trim();
  return {
    source_row:row.source_row,
    application_id:String(row.application_id || ""),
    account_id:String(row.account_id || ""),
    account_link_status:String(row.account_link_status || "Needs staff match"),
    submitted_at:row.submitted_at || "",
    workflow_status:String(row.workflow_status || "New"),
    legal_business_name:String(row.legal_business_name || ""),
    business_name:businessName,
    business_type:String(row.business_type || ""),
    website:String(row.website || ""),
    seller_permit_number:String(row.seller_permit_number || ""),
    primary_contact_name:String(row.primary_contact_name || ""),
    primary_contact_title:String(row.primary_contact_title || ""),
    primary_email:String(row.primary_email || ""),
    primary_phone:String(row.primary_phone || ""),
    ordering_email:String(row.ordering_email || ""),
    ap_contact_name:String(row.ap_contact_name || ""),
    ap_email:String(row.ap_email || ""),
    invoice_preference:String(row.invoice_preference || ""),
    delivery_address_1:String(row.delivery_address_1 || ""),
    delivery_address_2:String(row.delivery_address_2 || ""),
    delivery_city:String(row.delivery_city || ""),
    delivery_state:String(row.delivery_state || ""),
    delivery_zip:String(row.delivery_zip || ""),
    delivery_window:String(row.delivery_window || ""),
    delivery_instructions:String(row.delivery_instructions || ""),
    billing_same:toBool_(row.billing_same),
    billing_address_1:String(row.billing_address_1 || ""),
    billing_city:String(row.billing_city || ""),
    billing_state:String(row.billing_state || ""),
    billing_zip:String(row.billing_zip || ""),
    product_interests:String(row.product_interests || ""),
    expected_order_frequency:String(row.expected_order_frequency || ""),
    referral_source:String(row.referral_source || ""),
    customer_notes:String(row.notes || ""),
    authorized_name:String(row.authorized_name || ""),
    authorized_title:String(row.authorized_title || ""),
    newsletter_opt_in:toBool_(row.newsletter_opt_in),
    notification_status:String(row.notification_status || ""),
    customer_id:String(row.customer_id || ""),
    assigned_to:String(row.assigned_to || ""),
    staff_notes:String(row.staff_notes || ""),
    review_updated_at:row.review_updated_at || "",
    review_updated_by:String(row.review_updated_by || ""),
    inventory_tracking:toBool_(row.inventory_tracking),
    inventory_store_id:String(row.inventory_store_id || ""),
    inventory_route:String(row.inventory_route || ""),
    data_sync_status:String(row.data_sync_status || ""),
  };
}

function onlineOrderRecord_(row, linesByRequest) {
  const requestId = String(row.request_id || "");
  return {
    source_row:row.source_row,
    request_id:requestId,
    account_id:String(row.account_id || ""),
    account_link_status:String(row.account_link_status || "Needs staff match"),
    submitted_at:row.submitted_at || "",
    workflow_status:String(row.workflow_status || "New"),
    verification_status:String(row.verification_status || "Needs review"),
    business_name:String(row.business_name || ""),
    customer_id:String(row.customer_id || ""),
    contact_name:String(row.contact_name || ""),
    email:String(row.email || ""),
    phone:String(row.phone || ""),
    po_number:String(row.po_number || ""),
    requested_delivery_date:row.requested_delivery_date || "",
    delivery_window:String(row.delivery_window || ""),
    delivery_instructions:String(row.delivery_instructions || ""),
    customer_notes:String(row.notes || ""),
    line_count:Number(row.line_count || 0),
    requested_cases:Number(row.requested_cases || 0),
    requested_bottles:Number(row.requested_bottles || 0),
    bottle_equivalent:Number(row.bottle_equivalent || 0),
    notification_status:String(row.notification_status || ""),
    badger_invoice_number:String(row.badger_invoice_number || ""),
    invoice_status:String(row.invoice_status || "Not started"),
    delivery_status:String(row.delivery_status || "Not scheduled"),
    assigned_to:String(row.assigned_to || ""),
    staff_notes:String(row.staff_notes || ""),
    review_updated_at:row.review_updated_at || "",
    review_updated_by:String(row.review_updated_by || ""),
    catalog_source:String(row.catalog_source || ORDER_CATALOG_SOURCE),
    integration_status:String(row.integration_status || "Pending review"),
    badger_match_status:String(row.badger_match_status || "Not checked"),
    badger_customer_name:String(row.badger_customer_name || ""),
    badger_invoice_date:row.badger_invoice_date || "",
    badger_amount:row.badger_amount || "",
    delivered_at:row.delivered_at || "",
    lines:linesByRequest.get(requestId) || [],
  };
}

function recordTimestamp_(value) {
  const date = value ? new Date(value) : null;
  return date && !isNaN(date.getTime()) ? date.getTime() : 0;
}

function getCustomerWorkflowLogSheet_() {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(CUSTOMER_WORKFLOW_LOG_SHEET_NAME);
  if (sheet) {
    ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER]);
    return sheet;
  }
  sheet = ss.insertSheet(CUSTOMER_WORKFLOW_LOG_SHEET_NAME);
  const headers = [["Timestamp", "Record Type", "Record ID", "Account ID", "Business", "Previous Status", "New Status", "Updated By", "Details", "App Version"]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers).setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff");
  sheet.setFrozenRows(1);
  return sheet;
}

function appendCustomerWorkflowLog_(recordType, recordId, accountId, business, previousStatus, newStatus, updatedBy, details) {
  const sheet = getCustomerWorkflowLogSheet_();
  const h = getHeaderMap_(sheet);
  const row = Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  set("timestamp", new Date()); set("record_type", recordType); set("record_id", recordId); set("account_id", accountId || "");
  set("business", business); set("previous_status", previousStatus); set("new_status", newStatus); set("updated_by", updatedBy);
  set("details", details || ""); set("app_version", APP_VERSION);
  sheet.appendRow(row);
}

function findRecordRow_(sheet, idKey, idValue) {
  const h = getHeaderMap_(sheet);
  if (h[idKey] === undefined || sheet.getLastRow() < 2) return 0;
  const values = sheet.getRange(2, h[idKey] + 1, sheet.getLastRow() - 1, 1).getValues();
  const index = values.findIndex(row => String(row[0] || "") === String(idValue || ""));
  return index < 0 ? 0 : index + 2;
}

function orderOperationalStatuses_(order) {
  const statuses = [];
  if (String(order.workflow_status || "") === "New") statuses.push("New");
  if (!["New", "Cancelled", "Completed"].includes(String(order.workflow_status || ""))
      && !["Invoice received", "Invoice delivered", "Paid", "Cancelled"].includes(String(order.invoice_status || ""))) statuses.push("Awaiting invoice");
  if (String(order.workflow_status || "") === "Ready for delivery"
      || (["Invoice received", "Invoice delivered"].includes(String(order.invoice_status || "")) && String(order.delivery_status || "") !== "Delivered")) statuses.push("Ready");
  if (String(order.delivery_status || "") === "Delivered" || String(order.workflow_status || "") === "Completed") statuses.push("Delivered");
  return statuses;
}

function accountHistoryItem_(timestamp, type, title, detail, id, status) {
  return { timestamp:timestamp || "", type:type, title:title, detail:detail || "", id:id || "", status:status || "" };
}

const BADGER_INVOICE_CACHE_PREFIX = "hub_badger_invoices_v1";
const BADGER_INVOICE_CACHE_TTL_SECONDS = 900;
const BADGER_INVOICE_CACHE_CHUNK_SIZE = 80000;

function badgerUrl_(method, path) {
  const normalizedMethod = String(method || "").toUpperCase();
  const normalizedPath = String(path || "");
  const allowed = (normalizedMethod === "POST" && new Set(["/Login/Authenticate", "/Api/invoice/Paged", "/Api/Invoice/Paged/orderorinvoicenumber", "/api/invoice"]).has(normalizedPath))
    || (normalizedMethod === "GET" && (/^\/api\/invoice\/\d+$/.test(normalizedPath) || /^\/api\/customer\/\d+$/.test(normalizedPath) || /^\/api\/invoice\/validateforcreate\?number=\d{4}&date=\d{4}-\d{2}-\d{2}$/.test(normalizedPath)));
  if (!allowed) throw new Error("Badger request method or path is not allow-listed.");
  return `${BADGER_BASE_URL}${normalizedPath}`;
}

function badgerCookieHeader_(headers) {
  const rawCookies = headers["Set-Cookie"] || headers["set-cookie"] || [];
  const values = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
  const cookies = values.flatMap(value => String(value || "").match(/(?:^|,\s*)([^;,\s]+=[^;,\s]+)/g) || [])
    .map(value => value.replace(/^,\s*/, "").trim())
    .filter(Boolean);
  return [...new Set(cookies)].join("; ");
}

function badgerSession_(forceRefresh) {
  const cache = CacheService.getScriptCache();
  if (forceRefresh) cache.remove(BADGER_SESSION_CACHE_KEY);
  const cached = cache.get(BADGER_SESSION_CACHE_KEY);
  if (cached) return cached;
  const properties = PropertiesService.getScriptProperties();
  const username = String(properties.getProperty("BADGER_USERNAME") || "").trim();
  const password = String(properties.getProperty("BADGER_PASSWORD") || "");
  if (!username || !password) throw new Error("Badger login requires BADGER_USERNAME and BADGER_PASSWORD Script Properties.");
  const response = UrlFetchApp.fetch(badgerUrl_("POST", "/Login/Authenticate"), {
    method:"post",
    contentType:"application/json",
    payload:JSON.stringify({ username:username, password:password }),
    muteHttpExceptions:true,
    followRedirects:false,
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 400) throw new Error(`Badger login was rejected (HTTP ${status}).`);
  try {
    const payload = JSON.parse(response.getContentText());
    if (payload && payload.isSuccess === false) throw new Error("Badger login was rejected.");
  } catch (error) {
    if (String(error && error.message || error) === "Badger login was rejected.") throw error;
  }
  const cookieHeader = badgerCookieHeader_(response.getAllHeaders());
  if (!cookieHeader) throw new Error("Badger login did not return a session cookie.");
  cache.put(BADGER_SESSION_CACHE_KEY, cookieHeader, BADGER_SESSION_TTL_SECONDS);
  return cookieHeader;
}

function testBadgerLogin() {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const response = UrlFetchApp.fetch(badgerUrl_("POST", "/Api/invoice/Paged"), {
    method:"post",
    contentType:"application/json",
    payload:JSON.stringify({
      pageSize:500, page:0, sorts:[], filters:[],
      parameters:{ rangeStart:"2024-01-01T00:00:00-06:00", rangeEnd:`${today}T23:59:59-06:00`, status:"All" },
    }),
    headers:{ Cookie:badgerSession_() },
    muteHttpExceptions:true,
    followRedirects:false,
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error(`Badger invoice probe failed (HTTP ${status}).`);
  let payload;
  try { payload = JSON.parse(response.getContentText()); } catch (_) { throw new Error("Badger invoice probe returned invalid JSON."); }
  const page = payload && payload.data;
  if (!page || !Number.isFinite(Number(page.totalCount)) || !Array.isArray(page.data)) throw new Error("Badger invoice probe returned an unexpected response shape.");
  console.log(JSON.stringify({ totalCount:Number(page.totalCount), invoiceNumbers:page.data.slice(0, 5).map(item => String(item.number || "")).filter(Boolean) }));
}

function readBadgerInvoices_() {
  const sheet = getOutreachSs_().getSheetByName(BADGER_STATUS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return readBadgerTrackerFallbackInvoices_();
  return getAllRowsAsObjects_(sheet).map(row => {
    const amount = firstPresent_(row, ["amount", "dollar_amount", "total_due"]) || "";
    const paidDate = firstPresent_(row, ["paid_date"]) || "";
    const isVoid = /^(true|yes|y|1)$/i.test(String(firstPresent_(row, ["void", "is_void"]) || "").trim());
    return {
      invoice_number:String(firstPresent_(row, ["invoice_#", "invoice_number", "invoice_no", "invoice"]) || ""),
      badger_id:String(firstPresent_(row, ["badger_id", "id"]) || ""),
      customer_id:String(firstPresent_(row, ["customer_id"]) || ""),
      invoice_date:firstPresent_(row, ["date", "invoice_date"]) || "",
      customer_name:String(firstPresent_(row, ["bill-to", "bill_to", "bill_to_name", "customer_name", "customer"]) || ""),
      amount:amount,
      amount_cents:badgerMoneyToCents_(amount),
      paid_date:paidDate,
      is_paid:!!paidDate,
      is_void:isVoid,
      is_closed:!!paidDate || isVoid,
      modified_date:firstPresent_(row, ["modified"]) || "",
      synced_at:firstPresent_(row, ["synced_at"]) || "",
    };
  });
}

function readBadgerTrackerFallbackInvoices_() {
  const sheet = SpreadsheetApp.openById(BADGER_TRACKER_SPREADSHEET_ID).getSheetByName("Invoices");
  if (!sheet || sheet.getLastRow() < 2) return [];
  return getAllRowsAsObjects_(sheet).map(row => ({
    invoice_number:String(firstPresent_(row, ["invoice_#", "invoice_number", "invoice_no"]) || ""),
    invoice_date:firstPresent_(row, ["invoice_date", "date"]) || "", customer_name:String(firstPresent_(row, ["customer_name", "customer"]) || ""),
    amount:firstPresent_(row, ["amount_due", "amount", "total"]) || "", amount_cents:badgerMoneyToCents_(firstPresent_(row, ["amount_due", "amount", "total"]) || ""),
    is_paid:false, is_void:false, is_closed:false, payment_status:"Unknown", invoice_status:"Unknown",
  }));
}

function getBadgerInvoiceStatusSheet_() {
  return ensureSheet_(getOutreachSs_(), BADGER_STATUS_SHEET_NAME, ["Invoice #", "Badger ID", "Customer ID", "Bill-To", "Date", "Amount", "Paid Date", "Void", "Modified", "Synced At", "App Version"]);
}

function getBadgerSyncLogSheet_() {
  return ensureSheet_(getOutreachSs_(), BADGER_SYNC_LOG_SHEET_NAME, ["Synced At", "Result", "Invoice Count", "Details", "App Version"]);
}

function appendBadgerSyncLog_(result, invoiceCount, details) {
  getBadgerSyncLogSheet_().appendRow([new Date(), result, Number(invoiceCount || 0), String(details || ""), APP_VERSION]);
}

function badgerSyncState_() {
  const sheet = getOutreachSs_().getSheetByName(BADGER_SYNC_LOG_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return { last_good_sync_at:"", is_fresh:false };
  const h = getHeaderMap_(sheet);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const good = rows.map(row => ({ synced_at:row[h.synced_at], result:String(row[h.result] || ""), invoice_count:Number(row[h.invoice_count] || 0) }))
    .filter(item => item.result === "Succeeded" && outreachDate_(item.synced_at))
    .sort((a, b) => recordTimestamp_(b.synced_at) - recordTimestamp_(a.synced_at))[0];
  const timestamp = good ? outreachDate_(good.synced_at) : null;
  const statusSheet = getOutreachSs_().getSheetByName(BADGER_STATUS_SHEET_NAME);
  const rowCountMatches = !!good && !!statusSheet && Math.max(0, statusSheet.getLastRow() - 1) === good.invoice_count;
  return { last_good_sync_at:timestamp ? timestamp.toISOString() : "", is_fresh:!!timestamp && Date.now() - timestamp.getTime() <= BADGER_SYNC_MAX_AGE_MS && rowCountMatches };
}

function badgerPaymentMarks_() {
  const sheet = SpreadsheetApp.openById(BADGER_TRACKER_SPREADSHEET_ID).getSheetByName("Invoices");
  if (!sheet || sheet.getLastRow() < 2) throw new Error("The live Badger tracker Invoices tab is unavailable.");
  const byInvoice = new Map();
  getAllRowsAsObjects_(sheet).forEach(row => {
    const invoiceKey = normalizeBadgerInvoiceNumber_(firstPresent_(row, ["invoice_#", "invoice_number", "invoice_no"]));
    if (!invoiceKey) return;
    byInvoice.set(invoiceKey, { paid_to_me:/^(true|yes|y|1)$/i.test(String(firstPresent_(row, ["paid_to_me", "paid"]) || "").trim()), submitted:String(firstPresent_(row, ["submitted"]) || "").trim() });
  });
  return byInvoice;
}

function getBadgerInvoicePaymentLogSheet_() {
  return ensureSheet_(getOutreachSs_(), BADGER_PAYMENT_LOG_SHEET_NAME, ["Log ID", "Action", "Invoice #", "Old Paid to Me", "New Paid to Me", "Old Submitted", "New Submitted", "Staff", "At", "Check #", "Check Date", "Undone Log ID", "App Version"]);
}

function activeBadgerPaymentMarkInvoiceKeys_() {
  const sheet = getBadgerInvoicePaymentLogSheet_();
  if (sheet.getLastRow() < 2) return new Set();
  const h = getHeaderMap_(sheet);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const undone = new Set(rows.map(row => String(row[h.undone_log_id] || "")).filter(Boolean));
  return new Set(rows.filter(row => String(row[h.action] || "") !== "UNDO_BADGER_PAYMENT" && !undone.has(String(row[h.log_id] || "")))
    .map(row => normalizeBadgerInvoiceNumber_(row[h["invoice_#"]])).filter(Boolean));
}

function badgerTrackerInvoice_(invoiceNumber) {
  const sheet = SpreadsheetApp.openById(BADGER_TRACKER_SPREADSHEET_ID).getSheetByName("Invoices");
  if (!sheet || sheet.getLastRow() < 2) throw new Error("The live Badger tracker Invoices tab is unavailable.");
  const h = getHeaderMap_(sheet);
  if (h.paid_to_me === undefined || h.submitted === undefined) throw new Error("The live tracker is missing Paid to Me or Submitted columns.");
  const key = normalizeBadgerInvoiceNumber_(invoiceNumber);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const index = rows.findIndex(row => normalizeBadgerInvoiceNumber_(row[h["invoice_#"]]) === key);
  if (index < 0) throw new Error(`Invoice ${invoiceNumber} is not in the live Badger tracker.`);
  return { sheet:sheet, headers:h, row:rows[index], row_number:index + 2, invoice_number:String(rows[index][h["invoice_#"]] || invoiceNumber) };
}

function writeBadgerPaymentMark_(invoiceNumber, paidToMe, submitted, action, actor, checkNumber, checkDate, undoneLogId) {
  const tracker = badgerTrackerInvoice_(invoiceNumber);
  const oldPaid = tracker.row[tracker.headers.paid_to_me];
  const oldSubmitted = tracker.row[tracker.headers.submitted];
  if (tracker.headers.submitted === tracker.headers.paid_to_me + 1) tracker.sheet.getRange(tracker.row_number, tracker.headers.paid_to_me + 1, 1, 2).setValues([[!!paidToMe, submitted]]);
  else { tracker.sheet.getRange(tracker.row_number, tracker.headers.paid_to_me + 1).setValue(!!paidToMe); tracker.sheet.getRange(tracker.row_number, tracker.headers.submitted + 1).setValue(submitted); }
  const verified = tracker.sheet.getRange(tracker.row_number, tracker.headers.paid_to_me + 1, 1, 1).getValue();
  if (/^(true|yes|1)$/i.test(String(verified)) !== !!paidToMe) throw new Error("Badger tracker did not retain the payment mark.");
  const log = getBadgerInvoicePaymentLogSheet_(); const h = getHeaderMap_(log); const row = Array(log.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  set("log_id", permanentId_("BPL")); set("action", action); set("invoice_#", tracker.invoice_number); set("old_paid_to_me", oldPaid); set("new_paid_to_me", !!paidToMe); set("old_submitted", oldSubmitted); set("new_submitted", submitted); set("staff", actor); set("at", new Date()); set("check_#", checkNumber || ""); set("check_date", checkDate || ""); set("undone_log_id", undoneLogId || ""); set("app_version", APP_VERSION); log.appendRow(row);
  appendAudit_(action, "Invoice", tracker.invoice_number, "", actor, BADGER_TRACKER_SPREADSHEET_ID, BADGER_PAYMENT_LOG_SHEET_NAME, "Completed", `${oldPaid}/${oldSubmitted} → ${!!paidToMe}/${submitted}`);
}

// All invoices are validated from one tracker snapshot before any mutation.  This
// keeps multi-invoice checks/reconciliation atomic from the application's view and
// avoids one network round-trip, log append, and audit row per invoice.
function writeBadgerPaymentMarksBatch_(updates, action, actor, checkNumber, checkDate) {
  if (!Array.isArray(updates) || !updates.length) return { count:0, invoice_numbers:[] };
  const sheet = SpreadsheetApp.openById(BADGER_TRACKER_SPREADSHEET_ID).getSheetByName("Invoices");
  if (!sheet || sheet.getLastRow() < 2) throw new Error("The live Badger tracker Invoices tab is unavailable.");
  const h = getHeaderMap_(sheet);
  if (h.paid_to_me === undefined || h.submitted === undefined || h["invoice_#"] === undefined) throw new Error("The live tracker is missing Invoice #, Paid to Me, or Submitted columns.");
  const rowCount = sheet.getLastRow() - 1;
  const rows = sheet.getRange(2, 1, rowCount, sheet.getLastColumn()).getValues();
  const byInvoice = new Map();
  rows.forEach((row, index) => {
    const key = normalizeBadgerInvoiceNumber_(row[h["invoice_#"]]);
    if (key) byInvoice.set(key, { row:row, row_number:index + 2, invoice_number:String(row[h["invoice_#"]] || "") });
  });
  const seen = new Set();
  const prepared = updates.map(update => {
    const key = normalizeBadgerInvoiceNumber_(update.invoice_number);
    if (!key || seen.has(key)) throw new Error("Choose each Badger invoice only once.");
    seen.add(key);
    const tracker = byInvoice.get(key);
    if (!tracker) throw new Error(`Invoice ${update.invoice_number} is not in the live Badger tracker.`);
    if (update.require_owed && (!/^(true|yes|1)$/i.test(String(tracker.row[h.paid_to_me])) || String(tracker.row[h.submitted] || "").trim().toLowerCase() !== "no")) {
      throw new Error(`Invoice ${tracker.invoice_number} is not currently owed to Badger.`);
    }
    return Object.assign(tracker, {
      old_paid_to_me:tracker.row[h.paid_to_me], old_submitted:tracker.row[h.submitted],
      paid_to_me:!!update.paid_to_me, submitted:String(update.submitted || ""), undone_log_id:String(update.undone_log_id || ""),
    });
  }).sort((a, b) => a.row_number - b.row_number);
  const blocks = [];
  prepared.forEach(item => {
    const prior = blocks[blocks.length - 1];
    if (prior && prior[prior.length - 1].row_number + 1 === item.row_number) prior.push(item);
    else blocks.push([item]);
  });
  blocks.forEach(block => {
    const firstRow = block[0].row_number;
    if (h.submitted === h.paid_to_me + 1) {
      sheet.getRange(firstRow, h.paid_to_me + 1, block.length, 2).setValues(block.map(item => [item.paid_to_me, item.submitted]));
    } else {
      sheet.getRange(firstRow, h.paid_to_me + 1, block.length, 1).setValues(block.map(item => [item.paid_to_me]));
      sheet.getRange(firstRow, h.submitted + 1, block.length, 1).setValues(block.map(item => [item.submitted]));
    }
  });
  const log = getBadgerInvoicePaymentLogSheet_();
  ensureHeaderColumns_(log, ["Error"]);
  const logHeaders = getHeaderMap_(log); const at = new Date();
  const logRows = prepared.map(item => {
    const row = Array(log.getLastColumn()).fill("");
    const set = (key, value) => { if (logHeaders[key] !== undefined) row[logHeaders[key]] = value; };
    set("log_id", permanentId_("BPL")); set("action", action); set("invoice_#", item.invoice_number); set("old_paid_to_me", item.old_paid_to_me); set("new_paid_to_me", item.paid_to_me); set("old_submitted", item.old_submitted); set("new_submitted", item.submitted); set("staff", actor); set("at", at); set("check_#", checkNumber || ""); set("check_date", checkDate || ""); set("undone_log_id", item.undone_log_id); set("app_version", APP_VERSION);
    return row;
  });
  const appendBatchLog = error => {
    if (error && logHeaders.error !== undefined) logRows.forEach(row => { row[logHeaders.error] = error; });
    log.getRange(log.getLastRow() + 1, 1, logRows.length, log.getLastColumn()).setValues(logRows);
    appendAudit_(action, "Badger payment batch", prepared.map(item => item.invoice_number).join(", "), "", actor, BADGER_TRACKER_SPREADSHEET_ID, BADGER_PAYMENT_LOG_SHEET_NAME, error ? "Verify failed" : "Completed", error || `${prepared.length} invoice(s) updated in one batch.`);
  };
  const firstPaymentColumn = Math.min(h.paid_to_me, h.submitted);
  let verifyFailed = false;
  try {
    const verified = sheet.getRange(2, firstPaymentColumn + 1, rowCount, Math.abs(h.paid_to_me - h.submitted) + 1).getValues();
    verifyFailed = prepared.some(item => {
      const verifiedRow = verified[item.row_number - 2];
      return /^(true|yes|1)$/i.test(String(verifiedRow[h.paid_to_me - firstPaymentColumn])) !== item.paid_to_me
        || String(verifiedRow[h.submitted - firstPaymentColumn] || "").trim() !== item.submitted;
    });
  } catch (error) { appendBatchLog("verify failed"); throw new Error("Badger tracker verification failed after the update."); }
  if (verifyFailed) { appendBatchLog("verify failed"); throw new Error("Badger tracker did not retain every payment mark."); }
  appendBatchLog("");
  return { count:prepared.length, invoice_numbers:prepared.map(item => item.invoice_number) };
}

function apiMarkBadgerInvoicePayment_(p) {
  const invoiceNumber = publicText_(p?.invoice_number || "", 80, "Invoice number");
  const mode = publicText_(p?.mode || "", 40, "Payment mode");
  const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another payment update is in progress. Try again shortly.");
  try {
    const tracker = badgerTrackerInvoice_(invoiceNumber);
    if (mode === "paid_badger") writeBadgerPaymentMark_(invoiceNumber, true, "N/A", "MARK_BADGER_PAID", actor);
    else if (mode === "paid_me") writeBadgerPaymentMark_(invoiceNumber, true, "No", "MARK_PAID_TO_STURGEON", actor);
    // The tracker said the customer paid Sturgeon directly, but they have not. Clear Paid to Me
    // (and the pass-through flag) so the invoice returns to Customer owes. Undo restores both.
    else if (mode === "not_paid") writeBadgerPaymentMark_(invoiceNumber, false, "", "MARK_CUSTOMER_NOT_PAID", actor);
    else if (mode === "undo") {
      const log = getBadgerInvoicePaymentLogSheet_();
      const h = getHeaderMap_(log);
      const rows = log.getLastRow() < 2 ? [] : log.getRange(2, 1, log.getLastRow() - 1, log.getLastColumn()).getValues();
      const undone = new Set(rows.map(row => String(row[h.undone_log_id] || "")).filter(Boolean));
      const prior = rows.map(row => ({ row:row, id:String(row[h.log_id] || ""), action:String(row[h.action] || ""), invoice:String(row[h["invoice_#"]] || "") }))
        .reverse().find(item => item.action !== "UNDO_BADGER_PAYMENT" && !undone.has(item.id) && normalizeBadgerInvoiceNumber_(item.invoice) === normalizeBadgerInvoiceNumber_(invoiceNumber));
      if (!prior) throw new Error("No prior payment mark is available to undo for this invoice.");
      writeBadgerPaymentMark_(invoiceNumber, /^(true|yes|1)$/i.test(String(prior.row[h.old_paid_to_me] || "")), prior.row[h.old_submitted], "UNDO_BADGER_PAYMENT", actor, "", "", prior.id);
    }
    else throw new Error("Choose a supported payment action.");
  } finally { lock.releaseLock(); }
  bumpReadCacheVersion_(); clearBadgerInvoiceCache_();
  return { message:"Badger payment mark updated." };
}

function apiRecordBadgerCheck_(p) {
  const invoices = Array.isArray(p?.invoice_numbers) ? p.invoice_numbers.map(value => publicText_(value, 80, "Invoice number")).filter(Boolean) : [];
  const checkNumber = publicText_(p?.check_number || "", 120, "Check number");
  const checkDate = publicText_(p?.check_date || "", 40, "Check date");
  const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  if (!invoices.length || !checkNumber || !checkDate) throw new Error("Select invoices and enter the check number and date.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another payment update is in progress. Try again shortly.");
  try {
    writeBadgerPaymentMarksBatch_(invoices.map(invoiceNumber => ({ invoice_number:invoiceNumber, paid_to_me:true, submitted:"Yes", require_owed:true })), "RECORD_BADGER_CHECK", actor, checkNumber, checkDate);
  }
  finally { lock.releaseLock(); }
  bumpReadCacheVersion_(); clearBadgerInvoiceCache_();
  return { message:`Recorded Badger check for ${invoices.length} invoice(s).` };
}

function badgerReconcileGroups_() {
  const marks = badgerPaymentMarks_(); const groups = { paid_not_marked:[], paid_check_no:[], unpaid_review:[], missing_tracker:[] };
  const links = readBadgerInvoiceLinks_();
  readBadgerInvoices_().forEach(invoice => {
    const key = normalizeBadgerInvoiceNumber_(invoice.invoice_number); const mark = marks.get(key);
    if (String(links.get(key)?.match_method || "").trim().toLowerCase() === "void") return;
    if (!mark) { groups.missing_tracker.push(invoice); return; }
    const submitted = String(mark.submitted || "").trim().toLowerCase();
    if (invoice.is_paid && !mark.paid_to_me) groups.paid_not_marked.push(invoice);
    else if (invoice.is_paid && submitted === "no") groups.paid_check_no.push(invoice);
    else if (!invoice.is_closed && mark.paid_to_me && submitted && submitted !== "no" && submitted !== "n/a") groups.unpaid_review.push(invoice);
  });
  return groups;
}

function apiBadgerReconcilePreview_() { return { groups:badgerReconcileGroups_() }; }

function apiApplyBadgerReconcile_(p) {
  const group = publicText_(p?.group || "", 40, "Reconcile group"); const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  if (!new Set(["paid_not_marked", "paid_check_no"]).has(group)) throw new Error("This group requires manual review; it cannot be applied automatically.");
  let invoices = []; const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another payment update is in progress. Try again shortly.");
  try {
    invoices = badgerReconcileGroups_()[group] || [];
    writeBadgerPaymentMarksBatch_(invoices.map(invoice => ({ invoice_number:invoice.invoice_number, paid_to_me:true, submitted:group === "paid_not_marked" ? "N/A" : "Yes" })), "RECONCILE_BADGER_PAYMENT", actor);
  }
  finally { lock.releaseLock(); }
  bumpReadCacheVersion_(); clearBadgerInvoiceCache_(); return { message:`Applied ${invoices.length} reconciliation update(s).`, count:invoices.length };
}

function badgerResponseNeedsSessionRefresh_(method, path, status, responseText) {
  // A create is never replayed: after its immediately preceding validation GET,
  // an unreadable or unusual response is an unknown outcome, not a retry signal.
  if (String(method || "").toUpperCase() === "POST" && String(path || "") === "/api/invoice") return false;
  if (status === 401 || (status >= 300 && status < 400)) return true;
  try {
    const payload = JSON.parse(responseText);
    const errors = Array.isArray(payload?.errors) ? payload.errors : [];
    return payload?.isAuthorized === false && !errors.length && payload?.hasErrors !== true;
  } catch (_) { return true; }
}

function badgerRequest_(path, options) {
  const requestOptions = Object.assign({}, options || {});
  const method = String(requestOptions.method || "get").toUpperCase();
  const url = badgerUrl_(method, path);
  const send = forceRefresh => UrlFetchApp.fetch(url, Object.assign({}, requestOptions, { method:method.toLowerCase(), headers:Object.assign({}, requestOptions.headers || {}, { Cookie:badgerSession_(forceRefresh) }), muteHttpExceptions:true, followRedirects:false }));
  let response = send(false);
  const status = response.getResponseCode();
  const requiresRefresh = badgerResponseNeedsSessionRefresh_(method, path, status, response.getContentText());
  if (requiresRefresh) response = send(true);
  return response;
}

function fetchBadgerInvoices_() {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const invoices = [];
  let totalCount = null;
  for (let page = 0; page < 100; page += 1) {
    const response = badgerRequest_("/Api/invoice/Paged", { method:"post", contentType:"application/json", payload:JSON.stringify({ pageSize:500, page:page, sorts:[], filters:[], parameters:{ rangeStart:"2024-01-01T00:00:00-06:00", rangeEnd:`${today}T23:59:59-06:00`, status:"All" } }) });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error(`Badger invoice sync failed (HTTP ${response.getResponseCode()}).`);
    let payload;
    try { payload = JSON.parse(response.getContentText()); } catch (_) { throw new Error("Badger invoice sync returned invalid JSON."); }
    const data = payload && payload.data;
    const count = Number(data && data.totalCount);
    if (!data || !Number.isInteger(count) || count < 0 || !Array.isArray(data.data)) throw new Error("Badger invoice sync returned an unexpected response shape.");
    if (totalCount === null) totalCount = count;
    if (totalCount !== count) throw new Error("Badger invoice count changed during synchronization; no status data was written.");
    data.data.forEach(invoice => {
      if (!invoice || !String(invoice.id || "").trim() || !String(invoice.number || "").trim()) throw new Error("Badger invoice sync returned an incomplete invoice record.");
      invoices.push(invoice);
    });
    if (invoices.length === totalCount) return invoices;
    if (!data.data.length || invoices.length > totalCount) throw new Error("Badger invoice sync returned an incomplete page sequence.");
  }
  throw new Error("Badger invoice sync exceeded the safe page limit.");
}

function syncBadgerStatus_(actor) {
  let invoices;
  try { invoices = fetchBadgerInvoices_(); }
  catch (error) {
    const failedLock = LockService.getScriptLock();
    if (failedLock.tryLock(10000)) {
      try { appendBadgerSyncLog_("Failed", 0, error && error.message || String(error)); }
      finally { failedLock.releaseLock(); }
    }
    throw error;
  }
  const syncedAt = new Date();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another Badger status write is in progress. Try again shortly.");
  try {
    const sheet = getBadgerInvoiceStatusSheet_();
    const headers = ["Invoice #", "Badger ID", "Customer ID", "Bill-To", "Date", "Amount", "Paid Date", "Void", "Modified", "Synced At", "App Version"];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (invoices.length) sheet.getRange(2, 1, invoices.length, headers.length).setValues(invoices.map(invoice => [String(invoice.number || ""), String(invoice.id || ""), String(invoice.customerId || ""), String(invoice.billToName || ""), invoice.date || "", invoice.dollarAmount || "", invoice.paidDate || "", !!invoice.isVoid, invoice.modifiedDate || "", syncedAt, APP_VERSION]));
    const extraRows = sheet.getLastRow() - invoices.length - 1;
    if (extraRows > 0) sheet.getRange(invoices.length + 2, 1, extraRows, headers.length).clearContent();
    appendBadgerSyncLog_("Succeeded", invoices.length, `Synced by ${String(actor || "staff")}.`);
  } finally { lock.releaseLock(); }
  bumpReadCacheVersion_();
  clearBadgerInvoiceCache_();
  return { message:`Badger status synchronized: ${invoices.length} invoices.`, invoice_count:invoices.length, synced_at:syncedAt.toISOString() };
}

function apiSyncBadgerStatus_(p) {
  return syncBadgerStatus_(authenticatedActor_(p, "Sturgeon Distribution Hub"));
}

function badgerMoneyToCents_(value) {
  const normalized = String(value ?? "").replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

function badgerMoneyLabel_(cents) {
  return `$${(Math.max(0, Number(cents) || 0) / 100).toFixed(2)}`;
}

function badgerInvoicePaymentState_(isFresh, isClosed, paidToMe, submitted) {
  if (!isFresh) return "Unknown";
  if (isClosed) return "Closed";
  if (!paidToMe) return "Customer owes";
  const submittedValue = String(submitted || "").trim().toLowerCase();
  if (submittedValue === "no") return "Owed to Badger";
  if (submittedValue === "yes") return "Check sent";
  return "Awaiting Badger";
}

function cachedBadgerInvoices_(bypassCache) {
  const cache = CacheService.getScriptCache();
  const manifestKey = `${BADGER_INVOICE_CACHE_PREFIX}:manifest`;
  if (!bypassCache) {
    try {
      const manifest = JSON.parse(cache.get(manifestKey) || "null");
      if (manifest && Number.isInteger(manifest.parts) && manifest.parts > 0) {
        let serialized = "";
        for (let index = 0; index < manifest.parts; index += 1) {
          const chunk = cache.get(`${BADGER_INVOICE_CACHE_PREFIX}:part:${index}`);
          if (chunk === null) { serialized = ""; break; }
          serialized += chunk;
        }
        if (serialized) return JSON.parse(serialized);
      }
    } catch (error) {
      console.warn("Badger invoice cache read failed: " + String(error && error.message || error));
    }
  }

  const invoices = readBadgerInvoices_();
  if (!bypassCache) cacheBadgerInvoices_(invoices, cache);
  return invoices;
}

function cacheBadgerInvoices_(invoices, cache) {
  const targetCache = cache || CacheService.getScriptCache();
  try {
    const serialized = JSON.stringify(invoices);
    const chunks = serialized.match(new RegExp(`[\\s\\S]{1,${BADGER_INVOICE_CACHE_CHUNK_SIZE}}`, "g")) || ["[]"];
    chunks.forEach((chunk, index) => targetCache.put(`${BADGER_INVOICE_CACHE_PREFIX}:part:${index}`, chunk, BADGER_INVOICE_CACHE_TTL_SECONDS));
    targetCache.put(`${BADGER_INVOICE_CACHE_PREFIX}:manifest`, JSON.stringify({ parts:chunks.length }), BADGER_INVOICE_CACHE_TTL_SECONDS);
  } catch (error) {
    console.warn("Badger invoice cache write failed: " + String(error && error.message || error));
  }
}

function clearBadgerInvoiceCache_() {
  const cache = CacheService.getScriptCache();
  const manifestKey = `${BADGER_INVOICE_CACHE_PREFIX}:manifest`;
  try { cache.remove(BADGER_LOCATION_NAMES_CACHE_KEY); } catch (_) {}
  try { cache.remove(`${BADGER_INVOICE_CACHE_PREFIX}:current_prices`); } catch (_) {}
  try {
    const manifest = JSON.parse(cache.get(manifestKey) || "null");
    cache.remove(manifestKey);
    if (manifest && Number.isInteger(manifest.parts) && manifest.parts > 0) {
      for (let index = 0; index < manifest.parts; index += 1) cache.remove(`${BADGER_INVOICE_CACHE_PREFIX}:part:${index}`);
    }
  } catch (error) {
    console.warn("Badger invoice cache clear failed: " + String(error && error.message || error));
  }
}

function badgerVolumeUnitOfMeasureId_(volume) {
  const normalized = String(volume || "").toLowerCase().replace(/\s/g, "");
  return ({ "750ml":3, "375ml":5, "1.75l":20, "1750ml":20, "1500ml":2, "200ml":25, "100ml":26, "50ml":19 })[normalized] || "";
}

// ---------- Toast stock import (2026.10.04.20-APP) ----------
// Save Toast's 86 Report CSV (Reports > Menus > 86 Report, threshold 9999) into the "Toast 86 Reports" Drive folder.
// An hourly trigger (installToastStockImport) reads the newest unread report and writes each SKU's toast_stock and
// toast_stock_date, matching the SKU's toast_item_name exactly (case and spacing ignored). Nothing else in SKUs changes.
const TOAST_REPORT_FOLDER_ID = "1kwjhWWg4KONWlcl-FmQ8oXeR9De6e5d_";
const TOAST_STOCK_LAST_FILE_PROPERTY = "TOAST_STOCK_LAST_FILE";
const TOAST_STOCK_GROUPS = ["750 ml", "375 ml", "box sets"]; // Toast 86 Report "Group Name" values that are wholesale products

function installToastStockImport() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === "importLatestToastStockReport")
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("importLatestToastStockReport").timeBased().everyHours(1).create();
  return { message:"Toast stock import installed. It checks the Toast 86 Reports folder every hour." };
}

function toastItemKey_(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function parseToast86Report_(csvText) {
  const rows = Utilities.parseCsv(String(csvText || "").replace(/^﻿/, ""));
  if (!rows.length) throw new Error("The Toast report is empty.");
  const header = rows[0].map(cell => String(cell || "").trim().toLowerCase());
  const col = name => header.indexOf(name);
  const itemCol = col("item name"); const qtyCol = col("quantity remaining"); const groupCol = col("group name"); const menuCol = col("menu name");
  if (itemCol < 0 || qtyCol < 0) throw new Error("This does not look like a Toast 86 Report (missing Item Name or Quantity Remaining).");
  return rows.slice(1).filter(row => String(row[itemCol] || "").trim()).map(row => ({
    menu:menuCol < 0 ? "" : String(row[menuCol] || "").trim(),
    group:groupCol < 0 ? "" : String(row[groupCol] || "").trim(),
    item:String(row[itemCol] || "").trim(),
    quantity:Number(row[qtyCol]),
  }));
}

// Pure: decides the new stock for each SKU row. skuRows are objects from SKUs; reportRows from parseToast86Report_.
function toastStockUpdates_(skuRows, reportRows) {
  const stock = new Map();
  (reportRows || []).forEach(row => {
    const key = toastItemKey_(row.item);
    if (key && Number.isFinite(row.quantity) && !stock.has(key)) stock.set(key, row.quantity);
  });
  const mapped = new Set();
  const updates = [];
  const missing = [];
  const cleared = [];
  (skuRows || []).forEach((sku, index) => {
    const key = toastItemKey_(sku.toast_item_name);
    if (!key) return;
    mapped.add(key);
    if (stock.has(key)) updates.push({ index:index, sku_id:String(sku.sku_id || ""), stock:stock.get(key) });
    else { missing.push(String(sku.sku_id || "")); cleared.push({ index:index, sku_id:String(sku.sku_id || "") }); }
  });
  const groups = new Set(TOAST_STOCK_GROUPS);
  const unmapped = Array.from(new Set((reportRows || [])
    .filter(row => groups.has(String(row.group || "").trim().toLowerCase()) && !mapped.has(toastItemKey_(row.item)))
    .map(row => row.item)));
  return { updates:updates, cleared:cleared, missing_in_report:missing, unmapped_toast_items:unmapped };
}

function importLatestToastStockReport() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { message:"Another update is running; the Toast import will try again next hour." };
  try {
    const files = [];
    const iterator = DriveApp.getFolderById(TOAST_REPORT_FOLDER_ID).getFiles();
    while (iterator.hasNext()) {
      const file = iterator.next();
      if (/\.csv$/i.test(file.getName()) || /csv/i.test(file.getMimeType())) files.push(file);
    }
    if (!files.length) return { message:"No Toast 86 Report CSV is in the folder yet." };
    files.sort((a, b) => b.getDateCreated().getTime() - a.getDateCreated().getTime());
    const latest = files[0];
    const props = PropertiesService.getScriptProperties();
    const marker = `${latest.getId()}:${latest.getLastUpdated().getTime()}`;
    if (props.getProperty(TOAST_STOCK_LAST_FILE_PROPERTY) === marker) return { message:`Already imported ${latest.getName()}.` };

    const report = parseToast86Report_(latest.getBlob().getDataAsString("ISO-8859-1"));
    const nameDate = latest.getName().match(/(\d{4})[_-](\d{2})[_-](\d{2})/);
    const reportDate = nameDate ? `${nameDate[1]}-${nameDate[2]}-${nameDate[3]}` : Utilities.formatDate(latest.getDateCreated(), "America/Chicago", "yyyy-MM-dd");

    const sheet = getSheet_(SHEET_NAMES.SKUS);
    const h = getHeaderMap_(sheet);
    ["toast_item_name", "toast_stock", "toast_stock_date"].forEach(key => {
      if (h[key] === undefined) throw new Error(`SKUs is missing the ${key} column.`);
    });
    const skuRows = getAllRowsAsObjects_(sheet);
    const result = toastStockUpdates_(skuRows, report);
    if (skuRows.length) {
      const stockRange = sheet.getRange(2, h.toast_stock + 1, skuRows.length, 1);
      const dateRange = sheet.getRange(2, h.toast_stock_date + 1, skuRows.length, 1);
      const stockValues = stockRange.getValues();
      const dateValues = dateRange.getValues();
      result.updates.forEach(update => { stockValues[update.index][0] = update.stock; dateValues[update.index][0] = reportDate; });
      // A mapped SKU missing from the newest report has unknown stock: clear it (never assume zero) so the order page
      // shows "Staff will confirm availability" instead of an old "In stock".
      result.cleared.forEach(item => { stockValues[item.index][0] = ""; dateValues[item.index][0] = ""; });
      stockRange.setValues(stockValues);
      dateRange.setValues(dateValues);
    }
    props.setProperty(TOAST_STOCK_LAST_FILE_PROPERTY, marker);
    bumpReadCacheVersion_();
    const detail = `${latest.getName()}: ${result.updates.length} SKUs updated; ${result.missing_in_report.length} mapped SKUs not in the report, stock cleared (${result.missing_in_report.slice(0, 20).join(", ")}); ${result.unmapped_toast_items.length} Toast bottles with no SKU (${result.unmapped_toast_items.slice(0, 20).join(", ")}).`;
    appendAudit_("IMPORT_TOAST_STOCK", "SKUs", latest.getId(), "", "Toast stock import", "Toast 86 Report", SHEET_NAMES.SKUS, "Completed", detail);
    console.log(JSON.stringify({ event:"toast_stock_import", file:latest.getName(), updated:result.updates.length, missing:result.missing_in_report, unmapped:result.unmapped_toast_items }));
    return { message:detail, updated:result.updates.length, missing_in_report:result.missing_in_report, unmapped_toast_items:result.unmapped_toast_items };
  } finally { lock.releaseLock(); }
}

// Wholesale pricing lives with the products (2026.10.04.20-APP). Each active SKU row has a price_tier and an
// optional wholesale_price override; the tier amounts are one row each on the Price Tiers tab, and account-specific
// deals are rows on the Customer Prices tab. All three are in the operational inventory workbook beside SKUs.
function priceTierCents_() {
  const sheet = getSs_().getSheetByName(PRICE_TIERS_SHEET_NAME);
  const tiers = new Map();
  tiers.conflicts = [];
  if (!sheet || sheet.getLastRow() < 2) return tiers;
  const conflicts = new Set();
  getAllRowsAsObjects_(sheet).forEach(row => {
    const tier = String(row.tier || "").trim().toLowerCase();
    const cents = badgerMoneyToCents_(firstPresent_(row, ["price", "wholesale_price", "unit_price"]));
    if (!tier || !(cents > 0)) return;
    if (tiers.has(tier) && tiers.get(tier) !== cents) conflicts.add(tier); else tiers.set(tier, cents);
  });
  // Two rows for one tier with different prices: price nothing in that tier, so invoices block until the tab is fixed.
  conflicts.forEach(tier => tiers.delete(tier));
  tiers.conflicts = Array.from(conflicts);
  return tiers;
}

function skuWholesaleCents_(sku, tiers) {
  const override = badgerMoneyToCents_(sku.wholesale_price);
  if (override > 0) return override;
  return tiers.get(String(sku.price_tier || "").trim().toLowerCase()) || 0;
}

function skuInvoiceVolume_(sku) {
  // invoice_volume lets a product invoice at a different Badger size than it is sold as (gift boxes: 5 x 100 mL sold, 500 mL invoiced).
  return String(sku.invoice_volume || sku.size || "").trim();
}

function skuPriceRow_(sku, cents, accountId) {
  const size = skuInvoiceVolume_(sku);
  return {
    sku_id:String(sku.sku_id || "").trim(), description:String(sku.sku_name || "").trim(), unit_price_cents:cents,
    volume:size, unit_of_measure_id:Number(badgerVolumeUnitOfMeasureId_(size) || 0), proof:Number(sku.proof || 0),
    beverage_class:"Spirit", account_id:String(accountId || "").trim(), updated_at:"",
  };
}

// Active Customer Prices rows that repeat one SKU + account with different prices. Keys are "sku_id|account_id".
function customerPriceConflicts_(customerRows) {
  const seen = new Map(); const conflicts = new Set();
  (customerRows || []).forEach(row => {
    if (!toBool_(row.active)) return;
    const key = `${String(row.sku_id || "").trim()}|${String(row.account_id || "").trim()}`;
    const cents = badgerMoneyToCents_(firstPresent_(row, ["price", "unit_price", "wholesale_price"]));
    if (seen.has(key) && seen.get(key) !== cents) conflicts.add(key); else seen.set(key, cents);
  });
  return conflicts;
}

function wholesalePriceRows_(skuRows, tierCents, customerRows) {
  const activeSkus = new Map();
  const rows = [];
  (skuRows || []).forEach(sku => {
    const skuId = String(sku.sku_id || "").trim();
    if (!skuId || !toBool_(sku.active)) return;
    activeSkus.set(skuId, sku);
    const cents = skuWholesaleCents_(sku, tierCents);
    if (cents > 0) rows.push(skuPriceRow_(sku, cents, ""));
  });
  const conflicts = customerPriceConflicts_(customerRows);
  const added = new Set();
  (customerRows || []).forEach(row => {
    if (!toBool_(row.active)) return;
    const sku = activeSkus.get(String(row.sku_id || "").trim());
    const accountId = String(row.account_id || "").trim();
    const key = `${String(row.sku_id || "").trim()}|${accountId}`;
    if (!sku || !accountId || added.has(key)) return;
    // A conflicting deal gets a zero price so this account's invoice blocks instead of silently using one row or the tier.
    const cents = conflicts.has(key) ? 0 : badgerMoneyToCents_(firstPresent_(row, ["price", "unit_price", "wholesale_price"]));
    if (cents > 0 || conflicts.has(key)) { rows.push(skuPriceRow_(sku, cents, accountId)); added.add(key); }
  });
  return rows;
}

// Lists catalog problems a person must fix: active products that cannot be priced or invoiced, SKU tiers that are not
// on the Price Tiers tab (for example after a tier is renamed there), and duplicate Price Tiers or Customer Prices rows
// with different prices. not_stock_tracked is information, not a problem: active products with no Toast item (bitters
// are Toast modifiers) show "Staff will confirm availability". Run checkWholesaleCatalog() from the Apps Script editor.
function wholesaleCatalogProblems_(skuRows, tierCents, customerRows) {
  const problems = { unknown_tier:[], no_price:[], no_proof:[], no_invoice_unit:[],
    tier_conflicts:(tierCents.conflicts || []).slice(), customer_price_conflicts:Array.from(customerPriceConflicts_(customerRows)), not_stock_tracked:[] };
  (skuRows || []).forEach(sku => {
    const id = String(sku.sku_id || "").trim();
    if (!id) return;
    const tier = String(sku.price_tier || "").trim();
    if (tier && !tierCents.has(tier.toLowerCase()) && !(tierCents.conflicts || []).includes(tier.toLowerCase()) && !(badgerMoneyToCents_(sku.wholesale_price) > 0)) problems.unknown_tier.push(`${id} (${tier})`);
    if (!toBool_(sku.active)) return;
    if (!(skuWholesaleCents_(sku, tierCents) > 0)) problems.no_price.push(id);
    if (!(Number(sku.proof) > 0)) problems.no_proof.push(id);
    if (!badgerVolumeUnitOfMeasureId_(skuInvoiceVolume_(sku))) problems.no_invoice_unit.push(`${id} (${skuInvoiceVolume_(sku) || "no size"})`);
    if (!String(sku.toast_item_name || "").trim()) problems.not_stock_tracked.push(id);
  });
  return problems;
}

function checkWholesaleCatalog() {
  const customerSheet = getSs_().getSheetByName(CUSTOMER_PRICES_SHEET_NAME);
  const customerRows = customerSheet && customerSheet.getLastRow() >= 2 ? getAllRowsAsObjects_(customerSheet) : [];
  const problems = wholesaleCatalogProblems_(getAllRowsAsObjects_(getSheet_(SHEET_NAMES.SKUS)), priceTierCents_(), customerRows);
  console.log(JSON.stringify(problems, null, 2));
  return problems;
}

function badgerCurrentPrices_(bypassCache) {
  const cache = CacheService.getScriptCache(); const cacheKey = `${BADGER_INVOICE_CACHE_PREFIX}:current_prices`;
  if (!bypassCache) {
    try { const cached = JSON.parse(cache.get(cacheKey) || "null"); if (Array.isArray(cached)) return cached; } catch (_) {}
  }
  const customerSheet = getSs_().getSheetByName(CUSTOMER_PRICES_SHEET_NAME);
  const customerRows = customerSheet && customerSheet.getLastRow() >= 2 ? getAllRowsAsObjects_(customerSheet) : [];
  const rows = wholesalePriceRows_(getAllRowsAsObjects_(getSheet_(SHEET_NAMES.SKUS)), priceTierCents_(), customerRows);
  try { cache.put(cacheKey, JSON.stringify(rows), BADGER_INVOICE_CACHE_TTL_SECONDS); } catch (_) {}
  return rows;
}

function badgerPriceForOrderLine_(prices, accountId, line) {
  const candidates = prices.filter(price => price.sku_id === String(line.sku_id || ""));
  return candidates.find(price => price.account_id === String(accountId || "")) || candidates.find(price => !price.account_id) || null;
}

function getBadgerInvoiceCreationsSheet_() {
  return ensureSheet_(getOutreachSs_(), BADGER_INVOICE_CREATIONS_SHEET_NAME, ["Request ID", "Invoice #", "Customer ID", "Total Cents", "Fingerprint", "Status", "Badger Invoice ID", "Staff", "At", "Error", "App Version"]);
}

function badgerInvoiceCreationRows_(requestId) {
  const sheet = getBadgerInvoiceCreationsSheet_(); const h = getHeaderMap_(sheet);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return rows.map((row, index) => ({ row:row, row_number:index + 2, request_id:String(row[h.request_id] || ""), invoice_number:String(row[h["invoice_#"]] || ""), customer_id:String(row[h.customer_id] || ""), total_cents:Number(row[h.total_cents] || 0), fingerprint:String(row[h.fingerprint] || ""), status:String(row[h.status] || ""), badger_invoice_id:String(row[h.badger_invoice_id] || ""), at:row[h.at] || "", error:String(row[h.error] || "") })).filter(item => !requestId || item.request_id === String(requestId));
}

function badgerJson_(path, options, label) {
  const response = badgerRequest_(path, options || {}); const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error(`${label || "Badger request"} failed (HTTP ${status}).`);
  try { return JSON.parse(response.getContentText()); } catch (_) { throw new Error(`${label || "Badger request"} returned invalid JSON.`); }
}

function badgerRemoteInvoiceByNumber_(invoiceNumber) {
  const payload = badgerJson_("/Api/Invoice/Paged/orderorinvoicenumber", { method:"post", contentType:"application/json", payload:JSON.stringify({ pageSize:20, page:0, sorts:[], filters:[], parameters:{ value:String(invoiceNumber || "") } }) }, "Badger invoice lookup");
  const rows = Array.isArray(payload?.data?.data) ? payload.data.data : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  const key = normalizeBadgerInvoiceNumber_(invoiceNumber);
  return rows.find(row => normalizeBadgerInvoiceNumber_(row.number || row.invoiceNumber || row.invoice_number) === key) || null;
}

function badgerRemoteInvoiceDetails_(invoiceId) {
  if (!/^\d+$/.test(String(invoiceId || ""))) throw new Error("Badger invoice ID is invalid.");
  const payload = badgerJson_(`/api/invoice/${invoiceId}`, { method:"get" }, "Badger invoice confirmation");
  return payload?.data || payload;
}

function badgerValidationError_(payload) {
  const data = payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
  if (data?.isSuccess === true && data?.hasErrors !== true) return "";
  const errors = Array.isArray(data?.errors) ? data.errors : Array.isArray(payload?.errors) ? payload.errors : [];
  return String(errors[0] || "number taken — preview again");
}

function badgerValidateInvoiceNumber_(invoiceNumber, date) {
  if (!/^SS\d{4}$/.test(String(invoiceNumber || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw new Error("Proposed Badger invoice number or date is invalid.");
  const orderNumber = String(invoiceNumber).slice(2);
  const payload = badgerJson_(`/api/invoice/validateforcreate?number=${orderNumber}&date=${date}`, { method:"get" }, "Badger invoice-number validation");
  const error = badgerValidationError_(payload);
  if (error) throw new Error(error);
  return true;
}

function badgerOrderForInvoice_(requestId) {
  const sheet = getOnlineOrderRequestsSheet_(false);
  if (!sheet) throw new Error("Online Order Requests sheet is missing.");
  const rowNumber = findRecordRow_(sheet, "request_id", requestId);
  if (!rowNumber) throw new Error("Order request not found.");
  const h = getHeaderMap_(sheet); const row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  const raw = Object.keys(h).reduce((item, key) => { item[key] = row[h[key]]; return item; }, { source_row:rowNumber });
  const lines = rowsWithSource_(getOnlineOrderLinesSheet_(false)).filter(line => String(line.request_id || "") === String(requestId || ""));
  return { sheet:sheet, headers:h, row_number:rowNumber, order:onlineOrderRecord_(raw, new Map([[String(requestId || ""), lines]])) };
}

function badgerCustomerIdForAccount_(accountId, account) {
  const directory = getOutreachSheet_(OUTREACH_SHEET_NAME); const directoryRow = getAllRowsAsObjects_(directory).find(row => String(row.account_id || "") === String(accountId || "")) || {};
  const override = String(directoryRow.badger_customer_id || "").trim();
  if (/^\d+$/.test(override)) return override;
  const paymentAccount = account || currentBadgerPaymentAccount_(accountId, false);
  const match = (paymentAccount.invoices || []).filter(invoice => invoice.badger_match_status === "Matched" && /^\d+$/.test(String(invoice.customer_id || "")))
    .sort((a, b) => recordTimestamp_(b.invoice_date) - recordTimestamp_(a.invoice_date))[0];
  if (!match) throw new Error("Create this customer in Badger (or invoice them once by hand) first.");
  return String(match.customer_id);
}

function badgerNextInvoiceNumber_() {
  const highest = readBadgerInvoices_().map(invoice => /^SS(\d{4})$/.exec(normalizeBadgerInvoiceNumber_(invoice.invoice_number))).filter(Boolean).map(match => Number(match[1])).reduce((max, number) => Math.max(max, number), 0);
  if (highest >= 9999) throw new Error("No four-digit Badger invoice number remains.");
  return `SS${String(highest + 1).padStart(4, "0")}`;
}

function badgerBillToCustomer_(customer) {
  const source = customer || {};
  return {
    id:source.id || "", billToName:String(source.name || source.billToName || "").trim(),
    billToResellerNumber:String(source.resellerNumber || source.billToResellerNumber || "").trim(),
    billToAddressLine1:String(source.addressLine1 || source.billToAddressLine1 || "").trim(),
    billToAddressLine2:String(source.addressLine2 || source.billToAddressLine2 || "").trim(),
    billToCity:String(source.city || source.billToCity || "").trim(),
    billToPostalCode:String(source.postalCode || source.billToPostalCode || "").trim(),
    email:String(source.email || "").trim(), phone:String(source.phone || "").trim(),
  };
}

function badgerInvoiceDraft_(requestId, p, skipValidation, accountSnapshot) {
  const source = badgerOrderForInvoice_(requestId); const order = source.order;
  if (String(order.workflow_status || "") !== "Confirmed") throw new Error("Only Confirmed orders can create a Badger invoice.");
  if (String(order.badger_invoice_number || "").trim()) throw new Error("This order already has a Badger invoice.");
  if (!String(order.account_id || "").trim()) throw new Error("Link this order to an account before creating a Badger invoice.");
  const account = accountSnapshot || currentBadgerPaymentAccount_(order.account_id, false);
  const customerId = badgerCustomerIdForAccount_(order.account_id, account);
  const customer = badgerJson_(`/api/customer/${customerId}`, { method:"get" }, "Badger customer lookup");
  const customerData = badgerBillToCustomer_(customer?.data || customer);
  if (!customerData.billToName || !customerData.billToAddressLine1) throw new Error("Badger customer needs a name and address before this invoice can be previewed.");
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const date = String(p?.date || today).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invoice date must use YYYY-MM-DD.");
  // Always a fresh catalog read: a price, tier or proof fixed in the inventory workbook must reach preview and create at once.
  const prices = badgerCurrentPrices_(true); const overrides = new Map((Array.isArray(p?.lines) ? p.lines : []).map(line => [String(line.sku_id || ""), line]));
  const blocked = [];
  const lines = (order.lines || []).map(line => {
    const price = badgerPriceForOrderLine_(prices, order.account_id, line); const override = overrides.get(String(line.sku_id || "")) || {};
    if (!price) { blocked.push(String(line.sku_name || line.sku_id || "product")); return null; }
    const requested = Number(override.quantity !== undefined ? override.quantity : (line.quantity || 0)); const bottles = /case/i.test(String(line.unit || "")) ? requested * Number(line.units_per_case || 0) : requested;
    const cents = override.unit_price === undefined ? price.unit_price_cents : badgerMoneyToCents_(override.unit_price);
    if (!(bottles > 0) || !(cents > 0) || !(price.unit_of_measure_id > 0) || !(price.proof > 0)) { blocked.push(String(line.sku_name || line.sku_id || "product")); return null; }
    return { sku_id:String(line.sku_id || ""), quantity:bottles, description:price.description, unit_price_cents:cents, unitPrice:cents / 100, unitOfMeasureId:price.unit_of_measure_id, beverageClass:price.beverage_class, alcoholProof:price.proof };
  }).filter(Boolean);
  if (blocked.length) throw new Error(`Each product needs an active SKU row with a size, a price (price tier or wholesale price, with no conflicting duplicate Price Tiers or Customer Prices rows), and proof before invoicing: ${blocked.join(", ")}.`);
  const number = String((skipValidation && p?.invoice_number) || badgerNextInvoiceNumber_()).trim();
  if (!skipValidation) badgerValidateInvoiceNumber_(number, date);
  const total_cents = lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unit_price_cents), 0);
  const fingerprint = sha256_([customerId, number, date].concat(lines.slice().sort((a, b) => a.sku_id.localeCompare(b.sku_id)).map(line => `${line.sku_id}:${line.quantity}:${line.unit_price_cents}:${line.unitOfMeasureId}:${line.alcoholProof}`)).join("|"));
  const directory = getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME)).find(row => String(row.account_id || "") === String(order.account_id || "")) || {};
  const warnings = [];
  const badgerAddress = [customerData.billToAddressLine1, customerData.billToCity, customerData.billToPostalCode].filter(Boolean).join("|");
  const directoryAddress = [directory.street_address || directory.address, directory.city, directory.zip_code || directory.zip].filter(Boolean).join("|");
  if (badgerAddress && directoryAddress && normalizeCustomerMatchKey_(badgerAddress) !== normalizeCustomerMatchKey_(directoryAddress)) warnings.push("Badger bill-to address differs from the Directory.");
  try {
    const lastInvoice = (account.invoices || []).filter(invoice => /^\d+$/.test(String(invoice.badger_id || ""))).sort((a, b) => recordTimestamp_(b.invoice_date) - recordTimestamp_(a.invoice_date))[0];
    if (lastInvoice) {
      const priorLines = badgerRemoteInvoiceDetails_(lastInvoice.badger_id).lines || [];
      lines.forEach(line => {
        const prior = priorLines.find(item => normalizeCustomerMatchKey_(item.description) === normalizeCustomerMatchKey_(line.description));
        if (prior && badgerMoneyToCents_(prior.unitPrice ?? prior.unit_price) !== line.unit_price_cents) warnings.push(`Price differs from this account's last invoice for ${line.description}.`);
      });
    }
  } catch (error) { console.warn("Could not compare Badger invoice prices: " + String(error?.message || error)); }
  if (!badgerSyncState_().is_fresh) warnings.push("Badger status sync is not fresh.");
  return { source:source, order:order, customer_id:customerId, customer:customerData, date:date, invoice_number:number, order_number:number.slice(2), lines:lines, total_cents:total_cents, total:badgerMoneyLabel_(total_cents), draft_fingerprint:fingerprint, warnings:warnings };
}

function badgerInvoiceMatchesDraft_(invoice, draft) {
  if (!invoice || !draft) return false;
  const remoteCustomerId = String(invoice.customerId || invoice.customer_id || invoice.billToCustomerId || invoice.billToId || "");
  const remoteTotal = badgerMoneyToCents_(invoice.totalDue ?? invoice.total_due ?? invoice.dollarAmount ?? invoice.amount);
  return remoteCustomerId === String(draft.customer_id) && remoteTotal === Number(draft.total_cents);
}

function writeBadgerInvoiceCreation_(draft, status, actor, badgerInvoiceId, error) {
  const sheet = getBadgerInvoiceCreationsSheet_(); const h = getHeaderMap_(sheet); const row = Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  set("request_id", draft.order.request_id); set("invoice_#", draft.invoice_number); set("customer_id", draft.customer_id); set("total_cents", draft.total_cents); set("fingerprint", draft.draft_fingerprint); set("status", status); set("badger_invoice_id", badgerInvoiceId || ""); set("staff", actor); set("at", new Date()); set("error", error || ""); set("app_version", APP_VERSION);
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function updateBadgerInvoiceCreation_(sheet, rowNumber, status, actor, badgerInvoiceId, error) {
  const h = getHeaderMap_(sheet);
  const set = (key, value) => { if (h[key] !== undefined) sheet.getRange(rowNumber, h[key] + 1).setValue(value); };
  set("status", status); set("badger_invoice_id", badgerInvoiceId || ""); set("staff", actor); set("at", new Date()); set("error", error || ""); set("app_version", APP_VERSION);
}

function linkCreatedBadgerInvoiceToOrder_(draft, invoice, actor) {
  const sheet = draft.source.sheet; const h = draft.source.headers; const rowNumber = draft.source.row_number;
  const set = (key, value) => { if (h[key] !== undefined) sheet.getRange(rowNumber, h[key] + 1).setValue(value); };
  set("badger_invoice_number", draft.invoice_number); set("invoice_status", "Invoice received"); set("integration_status", "Synchronized"); set("badger_match_status", "Matched"); set("badger_customer_name", String(invoice.billToName || invoice.customerName || draft.customer.billToName || "")); set("badger_invoice_date", draft.date); set("badger_amount", badgerMoneyLabel_(draft.total_cents)); set("review_updated_at", new Date()); set("review_updated_by", actor);
  appendCustomerWorkflowLog_("Order", draft.order.request_id, draft.order.account_id, draft.order.business_name, draft.order.workflow_status, draft.order.workflow_status, actor, `Created Badger invoice ${draft.invoice_number}.`);
  appendAudit_("CREATE_BADGER_INVOICE", "Order", draft.order.request_id, draft.order.account_id, actor, ONLINE_ORDER_REQUESTS_SHEET_NAME, BADGER_INVOICE_CREATIONS_SHEET_NAME, "Completed", `${draft.invoice_number}; ${draft.total}`);
}

function apiPreviewBadgerInvoice_(p) {
  const requestId = publicText_(p?.request_id || "", 80, "Request ID");
  const pending = badgerInvoiceCreationRows_(requestId).filter(item => item.status === "PENDING").sort((a, b) => recordTimestamp_(b.at) - recordTimestamp_(a.at))[0];
  const draft = badgerInvoiceDraft_(requestId, pending ? Object.assign({}, p, { invoice_number:pending.invoice_number }) : p, !!pending);
  if (pending) {
    const remote = badgerRemoteInvoiceByNumber_(pending.invoice_number);
    if (badgerInvoiceMatchesDraft_(remote, draft)) return Object.assign({}, draft, { pending_creation_id:pending.row_number, adoptable_invoice:{ badger_invoice_id:String(remote.id || remote.invoiceId || ""), invoice_number:pending.invoice_number } });
    return Object.assign({}, draft, { pending_creation:{ at:pending.at, error:String(pending.error || ""), invoice_number:pending.invoice_number } });
  }
  return draft;
}

function apiCreateBadgerInvoice_(p) {
  const requestId = publicText_(p?.request_id || "", 80, "Request ID");
  const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  const fingerprint = publicText_(p?.draft_fingerprint || "", 128, "Draft fingerprint");
  if (p?.reviewed !== true) throw new Error("Review the invoice and confirm the checkbox before creating it.");
  if (!/^[a-f0-9]{64}$/i.test(fingerprint)) throw new Error("Preview the invoice again before creating it.");
  const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) throw new Error("Another invoice action is in progress. Try again shortly.");
  try {
    if (badgerInvoiceCreationRows_(requestId).some(item => item.status === "PENDING")) throw new Error("A Badger invoice creation is already pending for this order.");
    const draft = badgerInvoiceDraft_(requestId, p, false);
    if (draft.draft_fingerprint !== fingerprint) throw new Error("Invoice changed — preview again.");
    // The second validation is intentional: a number is never auto-bumped after preview.
    badgerValidateInvoiceNumber_(draft.invoice_number, draft.date);
    const pendingRow = writeBadgerInvoiceCreation_(draft, "PENDING", actor, "", "Awaiting Badger confirmation.");
    const creationSheet = getBadgerInvoiceCreationsSheet_();
    try {
      const badgerDate = Utilities.formatDate(new Date(`${draft.date}T00:00:00`), "America/Chicago", "yyyy-MM-dd'T'HH:mm:ssXXX");
      const result = badgerJson_("/api/invoice", { method:"post", contentType:"application/json", payload:JSON.stringify({ date:badgerDate, orderNumber:draft.order_number, customerId:Number(draft.customer_id), billToName:draft.customer.billToName || "", billToAddressLine1:draft.customer.billToAddressLine1 || "", billToAddressLine2:draft.customer.billToAddressLine2 || "", billToCity:draft.customer.billToCity || "", billToPostalCode:draft.customer.billToPostalCode || "", billToResellerNumber:draft.customer.billToResellerNumber || "", lines:draft.lines.map(line => ({ quantity:line.quantity, description:line.description, unitPrice:line.unitPrice, unitOfMeasureId:line.unitOfMeasureId, beverageClass:"Spirit", alcoholProof:line.alcoholProof })) }) }, "Badger invoice create");
      const created = badgerRemoteInvoiceByNumber_(draft.invoice_number) || result?.data || result;
      const badgerInvoiceId = String(created?.id || created?.invoiceId || "");
      const confirmed = badgerInvoiceId ? badgerRemoteInvoiceDetails_(badgerInvoiceId) : created;
      if (!badgerInvoiceMatchesDraft_(confirmed, draft)) throw new Error("Badger did not confirm the created invoice total and customer.");
      updateBadgerInvoiceCreation_(creationSheet, pendingRow, "CREATED", actor, badgerInvoiceId, "");
      linkCreatedBadgerInvoiceToOrder_(draft, confirmed, actor);
      bumpReadCacheVersion_(); clearBadgerInvoiceCache_();
      return { message:`Created Badger invoice ${draft.invoice_number}.`, invoice_number:draft.invoice_number, badger_invoice_id:badgerInvoiceId };
    } catch (error) {
      updateBadgerInvoiceCreation_(creationSheet, pendingRow, "PENDING", actor, "", String(error?.message || error).slice(0, 1000));
      throw new Error("Invoice may have been created — check before retrying.");
    }
  } finally { lock.releaseLock(); }
}

function apiAdoptBadgerInvoice_(p) {
  const requestId = publicText_(p?.request_id || "", 80, "Request ID"); const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) throw new Error("Another invoice action is in progress. Try again shortly.");
  try {
    const pending = badgerInvoiceCreationRows_(requestId).filter(item => item.status === "PENDING").sort((a, b) => b.row_number - a.row_number)[0];
    if (!pending) throw new Error("No pending Badger invoice creation is available to adopt.");
    const draft = badgerInvoiceDraft_(requestId, { invoice_number:pending.invoice_number }, true); const remote = badgerRemoteInvoiceByNumber_(pending.invoice_number);
    if (!badgerInvoiceMatchesDraft_(remote, draft)) throw new Error("Badger does not have a matching invoice to adopt.");
    const id = String(remote.id || remote.invoiceId || ""); const confirmed = id ? badgerRemoteInvoiceDetails_(id) : remote;
    if (!badgerInvoiceMatchesDraft_(confirmed, draft)) throw new Error("Badger does not have a matching invoice to adopt.");
    updateBadgerInvoiceCreation_(getBadgerInvoiceCreationsSheet_(), pending.row_number, "CREATED", actor, id, "Adopted after pending create."); linkCreatedBadgerInvoiceToOrder_(draft, confirmed, actor); bumpReadCacheVersion_(); clearBadgerInvoiceCache_();
    return { message:`Adopted Badger invoice ${draft.invoice_number}.`, invoice_number:draft.invoice_number };
  } finally { lock.releaseLock(); }
}

function apiFailBadgerInvoiceCreation_(p) {
  const requestId = publicText_(p?.request_id || "", 80, "Request ID"); const reason = publicText_(p?.reason || "", 1000, "Failure reason"); const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  if (!reason) throw new Error("A failure reason is required.");
  const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) throw new Error("Another invoice action is in progress. Try again shortly.");
  try {
    const pending = badgerInvoiceCreationRows_(requestId).filter(item => item.status === "PENDING").sort((a, b) => b.row_number - a.row_number)[0];
    if (!pending || Date.now() - recordTimestamp_(pending.at) < 24 * 60 * 60 * 1000) throw new Error("Only a pending creation older than 24 hours can be marked failed.");
    if (badgerRemoteInvoiceByNumber_(pending.invoice_number)) throw new Error("Badger has this invoice; adopt it instead of marking the creation failed.");
    updateBadgerInvoiceCreation_(getBadgerInvoiceCreationsSheet_(), pending.row_number, "FAILED", actor, "", reason); bumpReadCacheVersion_(); return { message:"Pending Badger invoice creation marked failed." };
  } finally { lock.releaseLock(); }
}

function normalizeBadgerInvoiceNumber_(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const BADGER_CUSTOMER_NAME_SUFFIXES = new Set(["llc", "inc", "incorporated", "co", "corp", "corporation", "company", "ltd"]);

// Loose customer-name key: ignores case, punctuation, spacing, a leading "The", and trailing
// entity suffixes, so "Cujak's Wine andSpirits" and "Cujaks Wine and Spirits" compare equal.
function normalizeCustomerMatchKey_(value) {
  const words = String(value || "").toLowerCase().replace(/&/g, " and ").replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && BADGER_CUSTOMER_NAME_SUFFIXES.has(words[words.length - 1])) words.pop();
  if (words.length > 1 && words[0] === "the") words.shift();
  return words.join("");
}

const BADGER_LOCATION_NAMES_CACHE_KEY = "hub_badger_location_names_v1";

function readBadgerLocationNames_() {
  const sheet = SpreadsheetApp.openById(BADGER_TRACKER_SPREADSHEET_ID).getSheetByName("Location_Directory");
  if (!sheet || sheet.getLastRow() < 2) return [];
  return getAllRowsAsObjects_(sheet).map(row => ({
    invoice_name:String(firstPresent_(row, ["invoice_name"]) || "").trim(),
    public_name:String(firstPresent_(row, ["public_name"]) || "").trim(),
  })).filter(item => item.invoice_name && item.public_name);
}

function cachedBadgerLocationNames_(bypassCache) {
  const cache = CacheService.getScriptCache();
  if (!bypassCache) {
    try {
      const cached = cache.get(BADGER_LOCATION_NAMES_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (error) {
      console.warn("Badger location-name cache read failed: " + String(error && error.message || error));
    }
  }
  const names = readBadgerLocationNames_();
  try {
    const serialized = JSON.stringify(names);
    if (serialized.length < 90000) cache.put(BADGER_LOCATION_NAMES_CACHE_KEY, serialized, BADGER_INVOICE_CACHE_TTL_SECONDS);
  } catch (error) {
    console.warn("Badger location-name cache write failed: " + String(error && error.message || error));
  }
  return names;
}

function getBadgerCustomerAliasesSheet_() {
  return ensureSheet_(getOutreachSs_(), BADGER_CUSTOMER_ALIASES_SHEET_NAME, BADGER_CUSTOMER_ALIAS_HEADERS);
}

// Returns learned aliases two ways:
// - by_name: exact customer name (only case, apostrophes, punctuation and spacing ignored) → account
// - by_key: loose key (also ignores "The" and LLC/Inc./Co./Corp.) → set of accounts
// An exact-name alias always wins. A loose key is used only when it points to a single account.
function readBadgerCustomerAliases_() {
  const aliases = { by_name:new Map(), by_key:new Map() };
  const sheet = getOutreachSs_().getSheetByName(BADGER_CUSTOMER_ALIASES_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return aliases;
  const h = getHeaderMap_(sheet);
  if (h.account_id === undefined || (h.badger_customer_name === undefined && h.normalized_key === undefined)) return aliases;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().forEach(values => {
    const customerName = h.badger_customer_name === undefined ? "" : String(values[h.badger_customer_name] || "").trim();
    const key = normalizeCustomerMatchKey_(customerName) || (h.normalized_key === undefined ? "" : String(values[h.normalized_key] || "").trim());
    const accountId = String(values[h.account_id] || "").trim();
    if (!key || !accountId) return;
    const canonicalName = canonicalBadgerAliasName_(customerName);
    if (canonicalName) {
      const existing = aliases.by_name.get(canonicalName);
      if (existing && existing.account_id !== accountId) aliases.by_name.set(canonicalName, { ambiguous:true });
      else if (!existing) aliases.by_name.set(canonicalName, { account_id:accountId });
    }
    if (!aliases.by_key.has(key)) aliases.by_key.set(key, new Set());
    aliases.by_key.get(key).add(accountId);
  });
  return aliases;
}

function canonicalBadgerAliasName_(value) {
  return String(value || "").toLowerCase().replace(/[\u2019`']/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// Remembers "Badger customer name → Account ID" so future invoices for that customer match on their own.
// Caller must hold the script lock.
function upsertBadgerCustomerAlias_(customerName, accountId, source, actor) {
  const key = normalizeCustomerMatchKey_(customerName);
  if (!key || !accountId) return false;
  const sheet = getBadgerCustomerAliasesSheet_();
  const h = getHeaderMap_(sheet);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const matchingRows = rows.map((row, index) => ({ row:row, index:index })).filter(item => {
    const row = item.row;
    const rowName = h.badger_customer_name === undefined ? "" : row[h.badger_customer_name];
    const rowKey = normalizeCustomerMatchKey_(rowName) || (h.normalized_key === undefined ? "" : String(row[h.normalized_key] || "").trim());
    return rowKey === key;
  });
  // Update the row for this exact customer name if there is one; otherwise add a new row.
  // Loose-key neighbours for other accounts are kept, so a staff correction is always learned and
  // the reader treats that loose key as ambiguous instead of guessing.
  const canonicalName = canonicalBadgerAliasName_(customerName);
  const sameName = matchingRows.find(item => canonicalBadgerAliasName_(h.badger_customer_name === undefined ? "" : item.row[h.badger_customer_name]) === canonicalName);
  const existingIndex = (sameName || {}).index;
  const values = Number.isInteger(existingIndex) ? rows[existingIndex].slice() : Array(sheet.getLastColumn()).fill("");
  const set = (column, value) => { if (h[column] !== undefined) values[h[column]] = value; };
  set("badger_customer_name", sheetSafeText_(customerName, 200, "Badger customer name"));
  set("normalized_key", key);
  set("account_id", accountId);
  set("source", source);
  set("linked_at", new Date());
  set("linked_by", actor);
  set("app_version", APP_VERSION);
  sheet.getRange(Number.isInteger(existingIndex) ? existingIndex + 2 : sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
  return true;
}

function readBadgerInvoiceLinks_() {
  const sheet = getOutreachSs_().getSheetByName(BADGER_INVOICE_LINKS_SHEET_NAME);
  const byInvoice = new Map();
  if (!sheet || sheet.getLastRow() < 2) return byInvoice;
  const headers = getHeaderMap_(sheet);
  if (headers.badger_invoice_number === undefined || headers.account_id === undefined) return byInvoice;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().forEach((values, index) => {
    const invoiceNumber = String(values[headers.badger_invoice_number] || "").trim();
    const accountId = String(values[headers.account_id] || "").trim();
    const key = normalizeBadgerInvoiceNumber_(invoiceNumber);
    if (!key) return;
    byInvoice.set(key, {
      row:index + 2,
      invoice_number:invoiceNumber,
      account_id:accountId,
      customer_name:headers.badger_customer_name === undefined ? "" : String(values[headers.badger_customer_name] || ""),
      match_method:headers.match_method === undefined ? "Manual link" : String(values[headers.match_method] || "Manual link"),
      notes:headers.notes === undefined ? "" : String(values[headers.notes] || ""),
      linked_at:headers.linked_at === undefined ? "" : values[headers.linked_at],
      linked_by:headers.linked_by === undefined ? "" : String(values[headers.linked_by] || ""),
    });
  });
  return byInvoice;
}

function getBadgerInvoiceLinksSheet_() {
  return ensureSheet_(getOutreachSs_(), BADGER_INVOICE_LINKS_SHEET_NAME, [
    "Badger Invoice Number", "Account ID", "Badger Customer Name", "Match Method", "Linked At", "Linked By", "Notes", "App Version",
    "Void Prior Account ID", "Void Prior Match Method", "Void Prior Notes", "Void Prior Linked At", "Void Prior Linked By"
  ]);
}

function apiGetCustomerAccountIndex_(p) {
  const cacheBypass = !!p?._cache_bypass;
  if (!cacheBypass) return cachedReadPayload_("customer_account_index", () => apiGetCustomerAccountIndex_({ _cache_bypass:true }));
  const accounts = accountIdentityFromRows_(getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME))).rows
    .map(row => ({
      account_id:String(row.account_id || "").trim(),
      business_name:String(outreachValue_(row, ["business", "business_name"]) || "").trim(),
      city:String(outreachValue_(row, ["city", "town"]) || "").trim(),
    }))
    .filter(item => item.account_id && item.business_name)
    .sort((a, b) => a.business_name.localeCompare(b.business_name))
    .map(({ account_id, business_name, city }) => ({ account_id, business_name, city }));
  return { accounts:accounts };
}

function apiLinkBadgerInvoice_(p) {
  requireFields_(p || {}, ["invoice_number", "staff_name"]);
  const invoiceNumber = publicText_(p.invoice_number, 120, "Badger invoice number");
  const invoiceKey = normalizeBadgerInvoiceNumber_(invoiceNumber);
  const mode = String(p.mode || "link").trim().toLowerCase();
  const accountId = publicText_(p.account_id || "", 120, "Account ID");
  if (!invoiceKey) throw new Error("Enter a valid Badger invoice number.");
  if (!["link", "ignore", "void", "restore"].includes(mode)) throw new Error("Choose link, ignore, void, or restore for this invoice.");
  if (mode === "link" && !accountId) throw new Error("Choose an existing account before linking this invoice.");
  const voidReason = mode === "void" ? publicText_(p.notes || "", 1000, "Void reason") : "";
  if (mode === "void" && !voidReason) throw new Error("Enter why this invoice is void.");
  let invoice = cachedBadgerInvoices_(false).find(item => normalizeBadgerInvoiceNumber_(item.invoice_number) === invoiceKey);
  if (!invoice) {
    const refreshed = readBadgerInvoices_();
    cacheBadgerInvoices_(refreshed);
    invoice = refreshed.find(item => normalizeBadgerInvoiceNumber_(item.invoice_number) === invoiceKey);
  }
  if (!invoice) throw new Error("That invoice was not found in the Badger Invoice Tracker.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another invoice update is in progress. Try again in a moment.");
  try {
    const sheet = getBadgerInvoiceLinksSheet_();
    const h = getHeaderMap_(sheet);
    const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    const existingIndex = rows.findIndex(row => normalizeBadgerInvoiceNumber_(row[h.badger_invoice_number]) === invoiceKey);
    if (mode === "restore") {
      const restoredMethod = existingIndex < 0 ? "" : String(rows[existingIndex][h.match_method] || "").trim().toLowerCase();
      if (!["ignored", "void"].includes(restoredMethod)) throw new Error("Only an ignored or voided invoice can be restored.");
      if (restoredMethod === "void") {
        const values = rows[existingIndex].slice();
        const priorMethod = String(values[h.void_prior_match_method] || "").trim();
        if (priorMethod) {
          const restore = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
          restore("account_id", values[h.void_prior_account_id] || "");
          restore("match_method", priorMethod);
          restore("notes", values[h.void_prior_notes] || "");
          restore("linked_at", values[h.void_prior_linked_at] || "");
          restore("linked_by", values[h.void_prior_linked_by] || "");
          restore("void_prior_account_id", ""); restore("void_prior_match_method", ""); restore("void_prior_notes", ""); restore("void_prior_linked_at", ""); restore("void_prior_linked_by", "");
          restore("app_version", APP_VERSION);
          sheet.getRange(existingIndex + 2, 1, 1, values.length).setValues([values]);
          appendAudit_("RESTORE_BADGER_INVOICE", "Invoice", String(invoice.invoice_number || invoiceNumber), String(values[h.account_id] || ""), authenticatedActor_(p, "Sturgeon Distribution Hub"), BADGER_TRACKER_SPREADSHEET_ID, BADGER_INVOICE_LINKS_SHEET_NAME, "Restored prior link", priorMethod);
          bumpReadCacheVersion_();
          return { message:`Invoice ${invoice.invoice_number || invoiceNumber} restored to its prior ${priorMethod} link.`, invoice_number:String(invoice.invoice_number || invoiceNumber) };
        }
      }
      sheet.deleteRow(existingIndex + 2);
      appendAudit_("RESTORE_BADGER_INVOICE", "Invoice", String(invoice.invoice_number || invoiceNumber), "", authenticatedActor_(p, "Sturgeon Distribution Hub"), BADGER_TRACKER_SPREADSHEET_ID, BADGER_INVOICE_LINKS_SHEET_NAME, "Restored", invoice.customer_name || "Badger customer");
      bumpReadCacheVersion_();
      return { message:`Invoice ${invoice.invoice_number || invoiceNumber} restored to matching review.`, invoice_number:String(invoice.invoice_number || invoiceNumber) };
    }
    let account = null;
    if (mode === "link") {
      account = accountIdentityLookup_().by_id.get(accountId);
      if (!account) throw new Error("That Account ID is not in the Distribution Directory.");
    }
    const values = existingIndex >= 0 ? rows[existingIndex].slice() : Array(sheet.getLastColumn()).fill("");
    const set = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
    const priorMatchMethod = String(values[h.match_method] || "").trim();
    const wasVoid = priorMatchMethod.toLowerCase() === "void";
    if (mode === "void" && !wasVoid) {
      set("void_prior_account_id", values[h.account_id] || "");
      set("void_prior_match_method", priorMatchMethod);
      set("void_prior_notes", values[h.notes] || "");
      set("void_prior_linked_at", values[h.linked_at] || "");
      set("void_prior_linked_by", values[h.linked_by] || "");
    }
    if (mode !== "void") {
      set("void_prior_account_id", ""); set("void_prior_match_method", ""); set("void_prior_notes", ""); set("void_prior_linked_at", ""); set("void_prior_linked_by", "");
    }
    set("badger_invoice_number", invoice.invoice_number || invoiceNumber);
    set("account_id", mode === "link" ? accountId : "");
    set("badger_customer_name", invoice.customer_name || "");
    set("match_method", mode === "link" ? "Manual link" : mode === "void" ? "Void" : "Ignored");
    set("linked_at", new Date());
    set("linked_by", authenticatedActor_(p, "Sturgeon Distribution Hub"));
    set("notes", mode === "void" ? voidReason : publicText_(p.notes || "", 1000, "Invoice-link notes"));
    set("app_version", APP_VERSION);
    sheet.getRange(existingIndex >= 0 ? existingIndex + 2 : sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
    bumpReadCacheVersion_();
    if (mode === "void") {
      appendAudit_("VOID_BADGER_INVOICE", "Invoice", String(invoice.invoice_number || invoiceNumber), "", authenticatedActor_(p, "Sturgeon Distribution Hub"), BADGER_TRACKER_SPREADSHEET_ID, BADGER_INVOICE_LINKS_SHEET_NAME, "Voided", voidReason);
      return { message:`Invoice ${invoice.invoice_number || invoiceNumber} marked void in the Hub. It no longer counts toward balances, reminders, or pass-through checks.`, invoice_number:String(invoice.invoice_number || invoiceNumber) };
    }
    const ignored = mode === "ignore";
    const learned = !ignored && upsertBadgerCustomerAlias_(invoice.customer_name || "", accountId, "Staff invoice link", authenticatedActor_(p, "Sturgeon Distribution Hub"));
    appendAudit_(ignored ? "IGNORE_BADGER_INVOICE" : "LINK_BADGER_INVOICE", "Invoice", String(invoice.invoice_number || invoiceNumber), ignored ? "" : accountId, authenticatedActor_(p, "Sturgeon Distribution Hub"), BADGER_TRACKER_SPREADSHEET_ID, BADGER_INVOICE_LINKS_SHEET_NAME, ignored ? "Ignored" : "Linked", ignored ? (invoice.customer_name || "Badger customer") : `${invoice.customer_name || "Badger customer"} → ${account.business}`);
    return ignored
      ? { message:`Invoice ${invoice.invoice_number || invoiceNumber} marked as not a Directory account.`, invoice_number:String(invoice.invoice_number || invoiceNumber) }
      : { message:`Invoice ${invoice.invoice_number || invoiceNumber} linked to ${account.business}.${learned ? ` Future invoices for ${invoice.customer_name} will match automatically.` : ""}`, invoice_number:String(invoice.invoice_number || invoiceNumber), account_id:accountId, learned_customer_name:learned };
  } finally {
    lock.releaseLock();
  }
}

function buildCustomerAccounts_(applications, orders, bypassBadgerCache) {
  const identity = accountIdentityFromRows_(getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME)));
  const programs = outreachProgramMap_();
  const activityRows = outreachActivityRows_();
  const workflowRows = rowsWithSource_(getOutreachSs_().getSheetByName(CUSTOMER_WORKFLOW_LOG_SHEET_NAME));
  const deliveryRows = rowsWithSource_(getOutreachSs_().getSheetByName(DELIVERIES_SHEET_NAME));
  const deliveryLineRows = rowsWithSource_(getOutreachSs_().getSheetByName(DELIVERY_LINES_SHEET_NAME));
  const trackedAccountIds = inventoryTrackedAccountIds_();
  const activeStores = isHubInventoryActive_()
    ? getAllRowsAsObjects_(getSheet_(SHEET_NAMES.STORES)).filter(row => inventoryStoreAllowed_(row, trackedAccountIds) && row.account_id)
    : [];
  const storeByAccount = new Map(activeStores.map(row => [String(row.account_id || ""), row]));
  const reorderRows = isHubInventoryActive_() ? getAllRowsAsObjects_(getSheet_(SHEET_NAMES.REORDERS)) : [];
  const badgerSync = badgerSyncState_();
  let badgerInvoices = [];
  try {
    badgerInvoices = cachedBadgerInvoices_(!!bypassBadgerCache);
    if (bypassBadgerCache) cacheBadgerInvoices_(badgerInvoices);
  } catch (err) {
    console.warn("Badger invoice history was unavailable: " + String(err && err.message || err));
  }
  let paymentMarks = new Map();
  let paymentMarksAvailable = false;
  try { paymentMarks = badgerPaymentMarks_(); paymentMarksAvailable = true; }
  catch (err) { console.warn("Badger payment marks were unavailable: " + String(err && err.message || err)); }
  let activePaymentMarkKeys = new Set();
  try { activePaymentMarkKeys = activeBadgerPaymentMarkInvoiceKeys_(); }
  catch (err) { console.warn("Badger payment-mark history was unavailable: " + String(err && err.message || err)); }
  const pendingRemindersByAccount = new Map();
  try {
    badgerPaymentReminderHistory_().filter(item => String(item.status || "").toUpperCase() === "PENDING").forEach(item => {
      if (!pendingRemindersByAccount.has(item.account_id)) pendingRemindersByAccount.set(item.account_id, []);
      pendingRemindersByAccount.get(item.account_id).push(item);
    });
  } catch (err) { console.warn("Badger reminder history was unavailable: " + String(err && err.message || err)); }
  const badgerStatusIsFresh = badgerSync.is_fresh && paymentMarksAvailable;
  const paymentReminderMinAgeDays = paymentReminderMinAgeDays_();
  const explicitInvoiceLinks = readBadgerInvoiceLinks_();
  const customerAliases = readBadgerCustomerAliases_();
  let locationNames = [];
  try {
    locationNames = cachedBadgerLocationNames_(!!bypassBadgerCache);
  } catch (err) {
    console.warn("Badger Location_Directory was unavailable: " + String(err && err.message || err));
  }
  const accountsByMatchKey = new Map();
  identity.rows.forEach(row => {
    const businessKey = normalizeCustomerMatchKey_(outreachValue_(row, ["business", "business_name"]));
    const accountId = String(row.account_id || "").trim();
    if (!businessKey || !accountId) return;
    if (!accountsByMatchKey.has(businessKey)) accountsByMatchKey.set(businessKey, new Set());
    accountsByMatchKey.get(businessKey).add(accountId);
  });
  const locationPublicKeysByInvoiceKey = new Map();
  locationNames.forEach(item => {
    const invoiceKey = normalizeCustomerMatchKey_(item.invoice_name);
    const publicKey = normalizeCustomerMatchKey_(item.public_name);
    if (!invoiceKey || !publicKey) return;
    if (!locationPublicKeysByInvoiceKey.has(invoiceKey)) locationPublicKeysByInvoiceKey.set(invoiceKey, new Set());
    locationPublicKeysByInvoiceKey.get(invoiceKey).add(publicKey);
  });
  const orderAccountsByInvoice = new Map();
  orders.forEach(order => {
    const invoiceKey = normalizeBadgerInvoiceNumber_(order.badger_invoice_number);
    const accountId = String(order.account_id || "").trim();
    if (!invoiceKey || !accountId) return;
    if (!orderAccountsByInvoice.has(invoiceKey)) orderAccountsByInvoice.set(invoiceKey, new Set());
    orderAccountsByInvoice.get(invoiceKey).add(accountId);
  });
  const invoicesByAccount = new Map();
  const assignedInvoiceAccounts = new Map();
  const conflictingOrderInvoiceKeys = new Set(Array.from(orderAccountsByInvoice.entries())
    .filter(([, accountIds]) => accountIds.size > 1)
    .map(([invoiceKey]) => invoiceKey));
  const unmatchedBadgerInvoices = [];
  const ignoredBadgerInvoices = [];
  const voidedBadgerInvoices = [];
  const ignoredInvoiceKeys = new Set();
  badgerInvoices.forEach(invoice => {
    const invoiceKey = normalizeBadgerInvoiceNumber_(invoice.invoice_number);
    const explicit = explicitInvoiceLinks.get(invoiceKey);
    const orderedAccounts = orderAccountsByInvoice.get(invoiceKey) || new Set();
    // Badger cannot delete an invoice created in error, so staff void it in the Hub. A voided
    // invoice is kept out of every ledger, balance, reminder, and pass-through check.
    if (String(explicit?.match_method || "").trim().toLowerCase() === "void") {
      ignoredInvoiceKeys.add(invoiceKey);
      voidedBadgerInvoices.push(Object.assign({}, invoice, { match_method:"Void", void_reason:explicit.notes || "", voided_by:explicit.linked_by || "", voided_at:explicit.linked_at || "" }));
      return;
    }
    if (String(explicit?.match_method || "").trim().toLowerCase() === "ignored") {
      ignoredInvoiceKeys.add(invoiceKey);
      ignoredBadgerInvoices.push(Object.assign({}, invoice, { match_method:"Ignored" }));
      return;
    }
    // Match order: manual invoice link → order link → learned customer name → Badger location name → business name.
    let accountId = explicit?.account_id || "";
    let matchMethod = accountId ? "Manual link" : "";
    let ambiguous = false;
    let staleReason = accountId && !identity.by_id.has(accountId) ? "Linked Account ID is no longer in the directory" : "";
    if (!accountId && orderedAccounts.size > 1) {
      unmatchedBadgerInvoices.push(Object.assign({}, invoice, { match_reason:"Orders on more than one account reference this invoice." }));
      return;
    }
    if (!accountId && orderedAccounts.size === 1) {
      accountId = Array.from(orderedAccounts)[0];
      matchMethod = "Linked order";
    }
    const customerKey = normalizeCustomerMatchKey_(invoice.customer_name);
    const exactAlias = customerAliases.by_name.get(canonicalBadgerAliasName_(invoice.customer_name));
    const looseAliasAccounts = customerKey ? Array.from(customerAliases.by_key.get(customerKey) || []) : [];
    let learnedAccountId = "";
    let learnedMethod = "";
    if (exactAlias) {
      if (exactAlias.ambiguous) ambiguous = true;
      else { learnedAccountId = exactAlias.account_id; learnedMethod = "Learned customer name"; }
    } else if (looseAliasAccounts.length === 1) {
      learnedAccountId = looseAliasAccounts[0];
      learnedMethod = "Learned customer name (similar spelling)";
    } else if (looseAliasAccounts.length > 1) {
      ambiguous = true;
    }
    if (!accountId && learnedAccountId) {
      if (identity.by_id.has(learnedAccountId)) {
        accountId = learnedAccountId;
        matchMethod = learnedMethod;
      } else {
        staleReason = "The learned Account ID for this customer name is no longer in the directory";
      }
    }
    if (!accountId && !staleReason && customerKey && locationPublicKeysByInvoiceKey.has(customerKey)) {
      const locationKeys = locationPublicKeysByInvoiceKey.get(customerKey);
      if (locationKeys.size !== 1) {
        ambiguous = true;
      } else {
        const candidates = Array.from(accountsByMatchKey.get(Array.from(locationKeys)[0]) || []);
        if (candidates.length === 1) {
          accountId = candidates[0];
          matchMethod = "Badger location name";
        } else if (candidates.length > 1) ambiguous = true;
      }
    }
    if (!accountId && !staleReason && customerKey) {
      const candidates = Array.from(accountsByMatchKey.get(customerKey) || []);
      if (candidates.length === 1) {
        accountId = candidates[0];
        matchMethod = "Business name";
      } else if (candidates.length > 1) ambiguous = true;
    }
    if (!accountId || !identity.by_id.has(accountId)) {
      unmatchedBadgerInvoices.push(Object.assign({}, invoice, {
        match_reason:staleReason || (ambiguous ? "More than one account could match" : "No account match"),
      }));
      return;
    }
    if (!invoicesByAccount.has(accountId)) invoicesByAccount.set(accountId, []);
    assignedInvoiceAccounts.set(invoiceKey, accountId);
    const paymentMark = paymentMarks.get(invoiceKey) || { paid_to_me:false, submitted:"" };
    const status = badgerInvoicePaymentState_(badgerStatusIsFresh, invoice.is_closed, paymentMark.paid_to_me, paymentMark.submitted);
    invoicesByAccount.get(accountId).push(Object.assign({}, invoice, {
      account_id:accountId,
      match_method:matchMethod,
      invoice_status:status,
      payment_status:status,
      badger_match_status:"Matched",
      has_payment_mark:activePaymentMarkKeys.has(invoiceKey),
    }));
  });
  const now = new Date();
  const accounts = [];

  identity.rows.forEach((row, index) => {
    const accountId = String(row.account_id || "").trim();
    if (!accountId) return;
    const business = String(outreachValue_(row, ["business", "business_name"]) || "").trim();
    const email = String(outreachValue_(row, ["email", "email_address"]) || "").trim();
    const apEmail = String(outreachValue_(row, ["ap_email", "accounts_payable_email", "accounts_payable_contact_email"]) || "").trim();
    const relationship = String(outreachValue_(row, ["relationship"]) || "").trim();
    const directoryStatus = String(outreachValue_(row, ["status"]) || "").trim();
    const accountApplications = applications.filter(item => item.account_id === accountId);
    const accountOrders = orders.filter(item => item.account_id === accountId);
    const linkedInvoices = (invoicesByAccount.get(accountId) || []).slice();
    const program = programs.get(accountId) || programs.get(index + 2) || {};
    const isCustomer = accountApplications.some(item => ["Approved", "Account active"].includes(item.workflow_status))
      || accountOrders.length > 0
      || String(program.ordering_status || "") === "Active"
      || /customer/i.test(relationship)
      || /existing customer/i.test(directoryStatus)
      || linkedInvoices.length > 0;
    if (!isCustomer) return;

    const store = storeByAccount.get(accountId) || null;
    const accountDeliveries = deliveryRows.filter(item => String(item.account_id || "") === accountId).map(delivery => Object.assign({}, delivery, {
      lines:deliveryLineRows.filter(line => String(line.delivery_id || "") === String(delivery.delivery_id || "")),
    }));
    const accountActivity = activityRows.filter(item => String(item.account_id || "") === accountId
      || (!item.account_id && String(item.business || "").trim().toLowerCase() === business.toLowerCase()));
    const accountWorkflow = workflowRows.filter(item => String(item.account_id || "") === accountId);
    const accountReorders = store ? reorderRows.filter(item => String(item.store_id || "") === String(store.store_id || "")) : [];
    const orderInvoices = accountOrders.filter(order => order.badger_invoice_number || order.invoice_status !== "Not started").map(order => ({
      request_id:order.request_id,
      invoice_number:order.badger_invoice_number,
      invoice_status:order.invoice_status,
      badger_match_status:order.badger_match_status,
      invoice_date:order.badger_invoice_date,
      amount:order.badger_amount,
      customer_name:order.badger_customer_name,
    }));
    // An invoice created from an Online request is one business event. Preserve
    // that request ID on the Badger record so every invoice/payment view can
    // lead staff back to the originating request without inventing a request
    // for invoices that predate the Hub.
    const invoices = linkedInvoices.map(invoice => {
      const invoiceKey = normalizeBadgerInvoiceNumber_(invoice.invoice_number);
      const sourceOrder = accountOrders.find(order => normalizeBadgerInvoiceNumber_(order.badger_invoice_number) === invoiceKey);
      return sourceOrder ? Object.assign({}, invoice, { request_id:sourceOrder.request_id, online_request:true }) : invoice;
    });
    orderInvoices.forEach(item => {
      const invoiceKey = normalizeBadgerInvoiceNumber_(item.invoice_number);
      const assignedAccountId = assignedInvoiceAccounts.get(invoiceKey);
      if (ignoredInvoiceKeys.has(invoiceKey) || conflictingOrderInvoiceKeys.has(invoiceKey) || (assignedAccountId && assignedAccountId !== accountId)) return;
      if (!invoiceKey || !invoices.some(invoice => normalizeBadgerInvoiceNumber_(invoice.invoice_number) === invoiceKey)) invoices.push(Object.assign({}, item, { invoice_status:"Unknown", payment_status:"Unknown" }));
    });
    // Only the parsed Badger records decide whether money is still outstanding.
    // Order-side workflow fields can be stale and must not trigger customer email.
    const unpaidInvoices = invoices.filter(item => item.badger_match_status === "Matched" && item.invoice_status === "Customer owes");
    const owedToBadgerInvoices = invoices.filter(item => item.badger_match_status === "Matched" && item.invoice_status === "Owed to Badger");
    const paymentReminderCutoff = Date.now() - paymentReminderMinAgeDays * 24 * 60 * 60 * 1000;
    const paymentReminderEligibleInvoices = badgerStatusIsFresh ? unpaidInvoices.filter(item => {
      const invoiceDate = outreachDate_(item.invoice_date);
      return invoiceDate && invoiceDate.getTime() < paymentReminderCutoff;
    }) : [];
    const outstandingBalanceCents = unpaidInvoices.reduce((total, item) => total + Number(item.amount_cents || 0), 0);
    const owedToBadgerCents = owedToBadgerInvoices.reduce((total, item) => total + Number(item.amount_cents || 0), 0);
    const operational = new Set();
    accountApplications.forEach(item => { if (item.workflow_status === "New") operational.add("New"); });
    accountOrders.forEach(order => orderOperationalStatuses_(order).forEach(status => operational.add(status)));
    if (paymentReminderEligibleInvoices.length) operational.add("Payment due");
    const followUp = outreachDate_(outreachValue_(row, ["next_follow-up", "next_follow_up"]));
    if ((followUp && followUp.getTime() <= now.getTime()) || directoryStatus.toLowerCase() === "follow-up due" || accountReorders.some(item => String(item.status || "OPEN").toUpperCase() === "OPEN")) operational.add("Reorder due");
    if (store) operational.add("Inventory-counted");
    const history = [];
    accountApplications.forEach(item => history.push(accountHistoryItem_(item.submitted_at, "Application", `Application ${item.workflow_status}`, item.staff_notes || item.customer_notes, item.application_id, item.workflow_status)));
    accountOrders.forEach(item => history.push(accountHistoryItem_(item.submitted_at, "Order", `Order ${item.workflow_status}`, `${item.line_count || item.lines.length} products; invoice ${item.invoice_status}; delivery ${item.delivery_status}`, item.request_id, item.workflow_status)));
    invoices.forEach(item => history.push(accountHistoryItem_(item.invoice_date, "Invoice", `Invoice ${item.invoice_number || "recorded"}`, `Amount ${item.amount || "not recorded"}; ${item.payment_status || item.invoice_status || "status not recorded"}${item.match_method ? `; ${item.match_method}` : ""}`, item.invoice_number, item.payment_status || item.invoice_status)));
    accountDeliveries.forEach(item => history.push(accountHistoryItem_(item.delivered_at || item.updated_at || item.created_at, "Delivery", `Delivery ${item.delivery_status || "recorded"}`, `${item.lines.length} product lines; invoice ${item.badger_invoice_number || "not recorded"}`, item.delivery_id, item.delivery_status)));
    accountActivity.forEach(item => history.push(accountHistoryItem_(item.timestamp, "Outreach", String(item.result || item.message_stage || "Activity"), String(item.error_detail || item["error/detail"] || ""), item.message_id, item.result)));
    accountWorkflow.forEach(item => history.push(accountHistoryItem_(item.timestamp, String(item.record_type || "Workflow"), `${item.previous_status || ""} → ${item.new_status || ""}`, item.details, item.record_id, item.new_status)));
    accountReorders.forEach(item => history.push(accountHistoryItem_(item.timestamp || item.created_at, "Inventory reorder", `Reorder ${item.status || "OPEN"}`, `${item.sku_id || "SKU"}: ${item.needed_units || item.need || ""} units`, item.sku_id, item.status || "OPEN")));
    history.sort((a, b) => recordTimestamp_(b.timestamp) - recordTimestamp_(a.timestamp));
    accounts.push({
      account_id:accountId,
      source_row:index + 2,
      business_name:business,
      contact_name:String(outreachValue_(row, ["contact", "contact_name", "contact_person"]) || ""),
      email:email,
      ap_email:apEmail,
      phone:String(outreachValue_(row, ["phone", "phone_number"]) || ""),
      city:String(outreachValue_(row, ["city"]) || ""),
      relationship:relationship,
      directory_status:directoryStatus,
      next_follow_up:outreachValue_(row, ["next_follow-up", "next_follow_up"]),
      last_emailed:outreachValue_(row, ["last_emailed", "last_email"]),
      inventory_tracking:!!store,
      inventory_store_id:store ? String(store.store_id || "") : "",
      operational_statuses:Array.from(operational),
      primary_status:["Payment due", "New", "Awaiting invoice", "Ready", "Delivered", "Reorder due", "Inventory-counted"].find(status => operational.has(status)) || "Account active",
      applications:accountApplications,
      orders:accountOrders,
      invoices:invoices,
      unpaid_invoices:unpaidInvoices,
      payment_reminder_eligible_invoices:paymentReminderEligibleInvoices,
      outstanding_balance_cents:outstandingBalanceCents,
      outstanding_balance:badgerMoneyLabel_(outstandingBalanceCents),
      owed_to_badger_invoices:owedToBadgerInvoices,
      owed_to_badger_cents:owedToBadgerCents,
      owed_to_badger:badgerMoneyLabel_(owedToBadgerCents),
      badger_last_good_sync_at:badgerSync.last_good_sync_at,
      badger_status_fresh:badgerStatusIsFresh,
      pending_payment_reminders:pendingRemindersByAccount.get(accountId) || [],
      deliveries:accountDeliveries,
      reorders:accountReorders,
      history:history,
    });
  });
  return {
    accounts:accounts.sort((a, b) => String(a.business_name || "").localeCompare(String(b.business_name || ""))),
    unmatched_badger_invoices:unmatchedBadgerInvoices.sort((a, b) => recordTimestamp_(b.invoice_date) - recordTimestamp_(a.invoice_date)),
    ignored_badger_invoices:ignoredBadgerInvoices.sort((a, b) => recordTimestamp_(b.invoice_date) - recordTimestamp_(a.invoice_date)),
    voided_badger_invoices:voidedBadgerInvoices.sort((a, b) => recordTimestamp_(b.invoice_date) - recordTimestamp_(a.invoice_date)),
    badger_sync:{ last_good_sync_at:badgerSync.last_good_sync_at, is_fresh:badgerStatusIsFresh },
  };
}

function apiGetCustomerWorkQueue_(p) {
  const forceRefresh = String(p?.refresh || "") === "1";
  // A forced refresh rebuilds and saves to the cache even if the browser stops waiting.
  if (!p?._cache_bypass) return cachedReadPayload_("customer_work_queue", () => apiGetCustomerWorkQueue_({ _cache_bypass:true, _refresh_sources:forceRefresh }), forceRefresh);
  const startedAt = Date.now();
  const timings = {};
  let stageStartedAt = startedAt;
  const mark = name => {
    const now = Date.now();
    timings[name] = now - stageStartedAt;
    stageStartedAt = now;
  };
  const applicationSheet = getCustomerApplicationsSheet_(false);
  const orderSheet = getOnlineOrderRequestsSheet_(false);
  const lineSheet = getOnlineOrderLinesSheet_(false);
  mark("sheet_lookup_ms");

  const linesByRequest = new Map();
  rowsWithSource_(lineSheet).forEach(row => {
    const requestId = String(row.request_id || "");
    if (!requestId) return;
    if (!linesByRequest.has(requestId)) linesByRequest.set(requestId, []);
    linesByRequest.get(requestId).push({
      line_number:Number(row.line_number || 0),
      account_id:String(row.account_id || ""),
      sku_id:String(row.sku_id || ""),
      sku_name:String(row.sku_name || ""),
      quantity:Number(row.quantity || 0),
      unit:String(row.unit || ""),
      units_per_case:Number(row.units_per_case || 0),
      bottle_equivalent:Number(row.bottle_equivalent || 0),
      catalog_source:String(row.catalog_source || ORDER_CATALOG_SOURCE),
      external_item_id:String(row.external_item_id || ""),
    });
  });
  mark("order_lines_read_ms");

  const applications = rowsWithSource_(applicationSheet).map(customerApplicationRecord_)
    .filter(record => record.application_id)
    .sort((a, b) => recordTimestamp_(b.submitted_at) - recordTimestamp_(a.submitted_at));
  const orders = rowsWithSource_(orderSheet).map(row => onlineOrderRecord_(row, linesByRequest))
    .filter(record => record.request_id)
    .sort((a, b) => recordTimestamp_(b.submitted_at) - recordTimestamp_(a.submitted_at));
  mark("application_order_read_ms");
  orders.forEach(order => order.operational_statuses = orderOperationalStatuses_(order));
  applications.forEach(application => application.operational_statuses = application.workflow_status === "New" ? ["New"] : (application.inventory_tracking ? ["Inventory-counted"] : []));
  const ledger = buildCustomerAccounts_(applications, orders, !!p?._refresh_sources || String(p?.refresh || "") === "1");
  const accounts = ledger.accounts;
  const invoicesByNumber = new Map();
  accounts.forEach(account => (account.invoices || []).forEach(invoice => {
    const invoiceKey = normalizeBadgerInvoiceNumber_(invoice.invoice_number);
    if (invoiceKey) invoicesByNumber.set(invoiceKey, invoice);
  }));
  // Retain the billing state on the originating web request as well as the
  // invoice ledger. Existing invoices without a web request are not altered.
  orders.forEach(order => {
    const invoice = invoicesByNumber.get(normalizeBadgerInvoiceNumber_(order.badger_invoice_number));
    if (invoice) order.badger_payment_status = invoice.payment_status || invoice.invoice_status || "Unknown";
  });
  mark("account_build_ms");
  const activeApplicationStatuses = ["New", "Reviewing", "Needs information"];
  const activeOrderStatuses = ["New", "Reviewing", "Confirmed", "Invoicing", "Ready for delivery"];

  const totalMs = Date.now() - startedAt;
  console.log(JSON.stringify({
    event:"customer_work_queue_timing",
    total_ms:totalMs,
    stages:timings,
    applications:applications.length,
    orders:orders.length,
    accounts:accounts.length,
    unmatched_badger_invoices:ledger.unmatched_badger_invoices.length,
  }));

  return {
    applications:applications,
    orders:orders,
    accounts:accounts,
    unmatched_badger_invoices:ledger.unmatched_badger_invoices,
    ignored_badger_invoices:ledger.ignored_badger_invoices,
    voided_badger_invoices:ledger.voided_badger_invoices,
    summary:{
      new_applications:applications.filter(record => record.workflow_status === "New").length,
      active_applications:applications.filter(record => activeApplicationStatuses.includes(record.workflow_status)).length,
      new_orders:orders.filter(record => record.workflow_status === "New").length,
      active_orders:orders.filter(record => activeOrderStatuses.includes(record.workflow_status)).length,
      invoice_needed:orders.filter(record => ["Confirmed", "Invoicing"].includes(record.workflow_status) && ["Not started", "Ready for Badger"].includes(record.invoice_status)).length,
      integration_attention:orders.filter(record => ["Needs retry", "Badger invoice not found", "Needs account match"].includes(record.integration_status)).length,
      customer_accounts:accounts.length,
      unmatched_badger_invoices:ledger.unmatched_badger_invoices.length,
      ignored_badger_invoices:ledger.ignored_badger_invoices.length,
      voided_badger_invoices:ledger.voided_badger_invoices.length,
      // Legacy unpaid_* summary names now intentionally mean reminder-eligible,
      // not merely open, so callers cannot accidentally treat a new invoice as due.
      unpaid_accounts:accounts.filter(record => (record.payment_reminder_eligible_invoices || []).length > 0).length,
      unpaid_invoices:accounts.reduce((total, record) => total + (record.payment_reminder_eligible_invoices || []).length, 0),
      unpaid_balance_cents:accounts.reduce((total, record) => total + (record.payment_reminder_eligible_invoices || []).reduce((sum, invoice) => sum + Number(invoice.amount_cents || 0), 0), 0),
      open_unpaid_accounts:accounts.filter(record => (record.unpaid_invoices || []).length > 0).length,
      open_unpaid_invoices:accounts.reduce((total, record) => total + (record.unpaid_invoices || []).length, 0),
      open_unpaid_balance_cents:accounts.reduce((total, record) => total + Number(record.outstanding_balance_cents || 0), 0),
      payment_due_accounts:accounts.filter(record => (record.payment_reminder_eligible_invoices || []).length > 0).length,
      payment_due_invoices:accounts.reduce((total, record) => total + (record.payment_reminder_eligible_invoices || []).length, 0),
      payment_due_balance_cents:accounts.reduce((total, record) => total + (record.payment_reminder_eligible_invoices || []).reduce((sum, invoice) => sum + Number(invoice.amount_cents || 0), 0), 0),
      owed_to_badger_accounts:accounts.filter(record => (record.owed_to_badger_invoices || []).length > 0).length,
      owed_to_badger_invoices:accounts.reduce((total, record) => total + (record.owed_to_badger_invoices || []).length, 0),
      owed_to_badger_cents:accounts.reduce((total, record) => total + Number(record.owed_to_badger_cents || 0), 0),
      badger_last_good_sync_at:ledger.badger_sync.last_good_sync_at,
      badger_status_fresh:ledger.badger_sync.is_fresh,
      reorder_due:accounts.filter(record => record.operational_statuses.includes("Reorder due")).length,
    },
    performance:{ total_ms:totalMs, stages:timings },
  };
}

function getBadgerPaymentRemindersSheet_() {
  return ensureSheet_(getOutreachSs_(), BADGER_PAYMENT_REMINDERS_SHEET_NAME, [
    "Reminder ID", "Account ID", "Business Name", "Recipient", "Invoice Numbers", "Outstanding Amount", "Status",
    "Sent At", "Sent By", "Zoho Message ID", "Idempotency Token", "Error", "App Version", "Subject", "HTML"
  ]);
}

function badgerPaymentReminderHistory_(accountId) {
  const sheet = getBadgerPaymentRemindersSheet_();
  if (sheet.getLastRow() < 2) return [];
  const h = getHeaderMap_(sheet);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().map((row, index) => ({
    row_number:index + 2,
    reminder_id:String(row[h.reminder_id] || ""),
    account_id:String(row[h.account_id] || ""),
    recipient:String(row[h.recipient] || "").trim().toLowerCase(),
    invoice_numbers:String(row[h.invoice_numbers] || ""),
    outstanding_amount:Number(row[h.outstanding_amount] || 0),
    status:String(row[h.status] || ""),
    sent_at:row[h.sent_at],
    sent_by:String(row[h.sent_by] || ""),
    zoho_message_id:String(row[h.zoho_message_id] || ""),
    idempotency_token:String(row[h.idempotency_token] || ""),
    error:String(row[h.error] || ""),
    subject:String(row[h.subject] || ""),
    html:String(row[h.html] || ""),
  })).filter(row => !accountId || row.account_id === String(accountId));
}

function paymentReminderRecipients_(account) {
  const seen = new Set();
  return [account.ap_email, account.email].map(value => publicEmail_(value || "", "Recipient", false))
    .filter(email => email && !seen.has(email) && (seen.add(email), true));
}

function paymentReminderCooldown_(accountId) {
  const history = badgerPaymentReminderHistory_(accountId);
  const pending = history.filter(item => String(item.status || "").toUpperCase() === "PENDING" && item.sent_at)
    .sort((a, b) => recordTimestamp_(b.sent_at) - recordTimestamp_(a.sent_at))[0];
  if (pending) return { eligible:false, pending:true, last_sent_at:"", next_eligible_at:"", pending_token:pending.idempotency_token };
  const sent = history.filter(item => /^(SENT|APP SENT)$/i.test(item.status) && item.sent_at);
  if (!sent.length) return { eligible:true, last_sent_at:"", next_eligible_at:"" };
  const latest = sent.sort((a, b) => recordTimestamp_(b.sent_at) - recordTimestamp_(a.sent_at))[0];
  const lastSentAt = outreachDate_(latest.sent_at);
  if (!lastSentAt) return { eligible:true, last_sent_at:"", next_eligible_at:"" };
  const nextEligibleAt = new Date(lastSentAt);
  nextEligibleAt.setDate(nextEligibleAt.getDate() + BADGER_PAYMENT_REMINDER_MIN_DAYS);
  return {
    eligible:nextEligibleAt.getTime() <= Date.now(),
    last_sent_at:lastSentAt.toISOString(),
    next_eligible_at:nextEligibleAt.toISOString(),
  };
}

function paymentReminderMinAgeDays_() {
  const configured = Number(getHubConfigurationValue_(BADGER_PAYMENT_REMINDER_MIN_AGE_CONFIG_KEY));
  return Number.isFinite(configured) && configured >= 0 && configured <= 365 ? configured : BADGER_PAYMENT_REMINDER_DEFAULT_MIN_AGE_DAYS;
}

function paymentReminderEligibleInvoices_(account) {
  if (!account.badger_status_fresh) throw new Error("Badger status is stale or unavailable. Sync Badger status before preparing a reminder.");
  const minAgeDays = paymentReminderMinAgeDays_();
  const cutoff = Date.now() - minAgeDays * 24 * 60 * 60 * 1000;
  return (account.unpaid_invoices || []).filter(item => {
    const invoiceDate = outreachDate_(item.invoice_date);
    return item.badger_match_status === "Matched" && item.invoice_status === "Customer owes" && invoiceDate && invoiceDate.getTime() < cutoff;
  });
}

function paymentReminderContent_(account) {
  const invoices = paymentReminderEligibleInvoices_(account);
  const amountCents = invoices.reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);
  if (!invoices.length || amountCents <= 0) throw new Error("This account has no matched unpaid Badger invoices to remind.");
  const invoiceNumbers = invoices.map(item => String(item.invoice_number || "").trim()).filter(Boolean);
  if (!invoiceNumbers.length) throw new Error("The matched unpaid invoice record is missing an invoice number.");
  const total = badgerMoneyLabel_(amountCents);
  const recipientName = String(account.contact_name || account.business_name || "there").trim();
  const invoiceText = invoiceNumbers.join(", ");
  const subject = `Payment reminder: ${total} outstanding`;
  const bodyText = [
    `Hello ${recipientName},`,
    "",
    `Our records show ${total} outstanding for Badger invoice${invoiceNumbers.length === 1 ? "" : "s"} ${invoiceText}.`,
    "Please let us know if payment has already been sent or if you need a copy of an invoice.",
    "",
    "Thank you,",
    "Sturgeon Spirits",
  ].join("\n");
  const html = `<p>Hello ${escapeOutreachHtml_(recipientName)},</p><p>Our records show <strong>${escapeOutreachHtml_(total)}</strong> outstanding for Badger invoice${invoiceNumbers.length === 1 ? "" : "s"} ${escapeOutreachHtml_(invoiceText)}.</p><p>Please let us know if payment has already been sent or if you need a copy of an invoice.</p><p>Thank you,<br>Sturgeon Spirits</p>`;
  const fingerprint = sha256_(invoices.map(item => `${String(item.invoice_number || "").trim()}:${Number(item.amount_cents || 0)}`).sort().join("|"));
  return { invoices:invoices, invoice_numbers:invoiceNumbers, outstanding_amount_cents:amountCents, outstanding_amount:total, content_fingerprint:fingerprint, subject:subject, body_text:bodyText, html:html, min_age_days:paymentReminderMinAgeDays_() };
}

function currentBadgerPaymentAccount_(accountId, refresh) {
  const queue = apiGetCustomerWorkQueue_({ _cache_bypass:true, _refresh_sources:!!refresh, refresh:refresh ? "1" : "" });
  const account = (queue.accounts || []).find(item => String(item.account_id || "") === String(accountId || ""));
  if (!account) throw new Error("Customer account was not found. Refresh Accounts and try again.");
  return account;
}

function apiPreviewBadgerPaymentReminder_(p) {
  const accountId = publicText_(p?.account_id || "", 120, "Account ID");
  if (!accountId) throw new Error("Account ID is required.");
  const account = currentBadgerPaymentAccount_(accountId, String(p?.refresh || "") === "1");
  const content = paymentReminderContent_(account);
  const recipients = paymentReminderRecipients_(account);
  if (!recipients.length) throw new Error("This account has no valid accounts-payable or customer email address for a payment reminder.");
  const cooldown = paymentReminderCooldown_(account.account_id);
  return Object.assign({
    account_id:account.account_id,
    business_name:account.business_name,
    recipient_options:recipients,
    cooldown:cooldown,
    payment_reminders_enabled:paymentRemindersEnabled_(),
    payment_reminder_min_age_days:paymentReminderMinAgeDays_(),
    reminder_interval_days:BADGER_PAYMENT_REMINDER_MIN_DAYS,
  }, content);
}

function apiSendBadgerPaymentReminder_(p) {
  const accountId = publicText_(p?.account_id || "", 120, "Account ID");
  const recipient = publicEmail_(p?.recipient || "", "Recipient", true);
  const token = publicText_(p?.idempotency_token || "", 160, "Idempotency token");
  const fingerprint = publicText_(p?.content_fingerprint || "", 128, "Reminder fingerprint");
  const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  if (!accountId) throw new Error("Account ID is required.");
  if (!/^[A-Za-z0-9_-]{20,160}$/.test(token)) throw new Error("A valid idempotency token is required.");
  if (!/^[a-f0-9]{64}$/i.test(fingerprint)) throw new Error("A valid reminder fingerprint is required. Refresh and review the reminder again.");
  if (!paymentRemindersEnabled_()) throw new Error("Payment reminders are disabled in Hub Configuration.");
  const account = currentBadgerPaymentAccount_(accountId, true);
  const recipientOptions = paymentReminderRecipients_(account);
  if (!recipientOptions.includes(recipient)) throw new Error("Recipient is no longer an approved accounts-payable or customer email for this account. Refresh and review the reminder again.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another reminder send is in progress. Wait a moment and try again.");
  try {
    const prior = badgerPaymentReminderHistory_(accountId).filter(item => item.idempotency_token === token && /^(SENT|APP SENT)$/i.test(item.status))[0];
    if (prior) return { accepted:true, idempotent:true, reminder_id:prior.reminder_id, message_id:prior.zoho_message_id, sent_at:prior.sent_at };
    const pendingForToken = badgerPaymentReminderHistory_(accountId).filter(item => item.idempotency_token === token && String(item.status || "").toUpperCase() === "PENDING")[0];
    if (pendingForToken) throw new Error("This reminder may have been sent — refresh before retrying.");
    const cooldown = paymentReminderCooldown_(accountId);
    if (cooldown.pending) throw new Error("A reminder may have been sent recently — refresh before retrying.");
    if (!cooldown.eligible) throw new Error(`A payment reminder was already sent within the ${BADGER_PAYMENT_REMINDER_MIN_DAYS}-day interval. It can be sent again after ${Utilities.formatDate(new Date(cooldown.next_eligible_at), Session.getScriptTimeZone(), "MMM d, yyyy")}.`);
    const content = paymentReminderContent_(account);
    if (content.content_fingerprint !== fingerprint) throw new Error("The invoice balance changed after preview. Refresh and review the reminder again.");
    const sheet = getBadgerPaymentRemindersSheet_();
    const h = getHeaderMap_(sheet);
    const reminderId = permanentId_("PAY");
    const pendingRow = sheet.getLastRow() + 1;
    const row = Array(sheet.getLastColumn()).fill("");
    const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
    set("reminder_id", reminderId); set("account_id", account.account_id); set("business_name", account.business_name); set("recipient", recipient); set("invoice_numbers", content.invoice_numbers.join(", ")); set("outstanding_amount", content.outstanding_amount_cents); set("status", "PENDING"); set("sent_at", new Date()); set("sent_by", actor); set("idempotency_token", token); set("error", "Awaiting Zoho confirmation."); set("app_version", APP_VERSION); set("subject", content.subject); set("html", content.html);
    sheet.appendRow(row);
    let result;
    try {
      result = callOutreachMailer_({
        action:"sendPaymentReminder", idempotency_token:token, account_id:account.account_id, business:account.business_name,
        recipient:recipient, invoice_numbers:content.invoice_numbers, outstanding_amount_cents:content.outstanding_amount_cents,
        subject:content.subject, html:content.html, requested_by:actor,
      });
    } catch (error) {
      sheet.getRange(pendingRow, h.error + 1).setValue(String(error && error.message || error));
      throw new Error("The reminder may have been sent — refresh before retrying.");
    }
    if (!result.accepted || !String(result.message_id || "").trim()) {
      sheet.getRange(pendingRow, h.error + 1).setValue("Zoho did not return a confirmed message ID.");
      throw new Error("The reminder may have been sent — refresh before retrying.");
    }
    sheet.getRange(pendingRow, h.status + 1).setValue("SENT"); sheet.getRange(pendingRow, h.sent_at + 1).setValue(new Date()); sheet.getRange(pendingRow, h.sent_by + 1).setValue(actor); sheet.getRange(pendingRow, h.zoho_message_id + 1).setValue(String(result.message_id)); sheet.getRange(pendingRow, h.error + 1).setValue("Zoho accepted delivery."); sheet.getRange(pendingRow, h.app_version + 1).setValue(APP_VERSION);
    appendAudit_("SEND_BADGER_PAYMENT_REMINDER", "Account", account.account_id, account.account_id, actor, BADGER_TRACKER_SPREADSHEET_ID, BADGER_PAYMENT_REMINDERS_SHEET_NAME, "Completed", `${content.invoice_numbers.join(", ")}; ${content.outstanding_amount}; Zoho ${String(result.message_id)}`);
    bumpReadCacheVersion_();
    return { accepted:true, idempotent:!!result.idempotent, message_id:String(result.message_id), sent_at:new Date().toISOString(), outstanding_amount:content.outstanding_amount };
  } finally {
    lock.releaseLock();
  }
}

function apiResolvePaymentReminder_(p) {
  const reminderId = publicText_(p?.reminder_id || "", 120, "Reminder ID");
  const resolution = publicText_(p?.resolution || "", 20, "Resolution").toLowerCase();
  const reason = publicText_(p?.reason || "", 1000, "Resolution reason");
  const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) throw new Error("Another reminder update is in progress. Try again shortly.");
  try {
  const sheet = getBadgerPaymentRemindersSheet_(); const h = getHeaderMap_(sheet);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const index = rows.findIndex(row => String(row[h.reminder_id] || "") === reminderId);
  if (index < 0 || String(rows[index][h.status] || "").toUpperCase() !== "PENDING") throw new Error("Only a pending reminder can be resolved.");
  const rowNumber = index + 2;
  if (resolution === "failed") {
    if (!reason) throw new Error("A failure reason is required.");
    sheet.getRange(rowNumber, h.status + 1).setValue("FAILED"); sheet.getRange(rowNumber, h.error + 1).setValue(reason); sheet.getRange(rowNumber, h.sent_by + 1).setValue(actor); bumpReadCacheVersion_(); return { message:"Pending reminder marked failed." };
  }
  if (resolution !== "retry") throw new Error("Choose retry or failed.");
  if (Date.now() - recordTimestamp_(rows[index][h.sent_at]) > 24 * 60 * 60 * 1000) throw new Error("A pending reminder may be retried only within 24 hours; mark it failed with a reason instead.");
  const account = currentBadgerPaymentAccount_(String(rows[index][h.account_id] || ""), true);
  const stillOwed = new Set((account.unpaid_invoices || []).map(item => String(item.invoice_number || "").trim()));
  if (String(rows[index][h.invoice_numbers] || "").split(/,\s*/).some(invoice => !stillOwed.has(invoice))) throw new Error("This reminder is no longer current; mark it failed with a reason instead.");
  const result = callOutreachMailer_({ action:"sendPaymentReminder", idempotency_token:String(rows[index][h.idempotency_token] || ""), account_id:String(rows[index][h.account_id] || ""), business:String(rows[index][h.business_name] || ""), recipient:String(rows[index][h.recipient] || ""), invoice_numbers:String(rows[index][h.invoice_numbers] || "").split(/,\s*/).filter(Boolean), outstanding_amount_cents:Number(rows[index][h.outstanding_amount] || 0), subject:String(rows[index][h.subject] || ""), html:String(rows[index][h.html] || ""), requested_by:actor });
  if (!result.accepted || !String(result.message_id || "")) throw new Error("Mailer did not confirm this reminder; it remains pending.");
  sheet.getRange(rowNumber, h.status + 1).setValue("SENT"); sheet.getRange(rowNumber, h.sent_at + 1).setValue(new Date()); sheet.getRange(rowNumber, h.sent_by + 1).setValue(actor); sheet.getRange(rowNumber, h.zoho_message_id + 1).setValue(String(result.message_id)); sheet.getRange(rowNumber, h.error + 1).setValue("Zoho accepted delivery."); bumpReadCacheVersion_(); return { accepted:true, message:"Pending reminder resolved as sent." };
  } finally { lock.releaseLock(); }
}

function makeStoreId_(business, accountId) {
  const words = String(business || "STORE").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const prefix = words.slice(0, 3).map(word => word.slice(0, 4)).join("-") || "STORE";
  return `${prefix}-${String(accountId || "").replace(/[^A-Z0-9]/gi, "").slice(-6).toUpperCase()}`.slice(0, 40);
}

function ensureInventoryStoreForApplication_(application, customerId, trackInventory, requestedStoreId, route) {
  const accountId = String(application.account_id || "");
  if (!trackInventory) {
    if (!isHubInventoryActive_()) return "";
    const inactiveSheet = getSheet_(SHEET_NAMES.STORES);
    const inactiveHeaders = ensureHeaderColumns_(inactiveSheet, ["account_id", "customer_id", "manager_name", "assistant_manager_name"]);
    const inactiveRows = getAllRowsAsObjects_(inactiveSheet);
    const inactiveIndex = inactiveRows.findIndex(row => accountId && String(row.account_id || "") === accountId);
    if (inactiveIndex >= 0) inactiveSheet.getRange(inactiveIndex + 2, inactiveHeaders.active + 1).setValue(false);
    return "";
  }
  if (!isHubInventoryActive_()) throw new Error("Initialize the hardened staging Hub before enabling inventory tracking.");
  const sheet = getSheet_(SHEET_NAMES.STORES);
  const h = ensureHeaderColumns_(sheet, ["account_id", "customer_id", "manager_name", "assistant_manager_name"]);
  const rows = getAllRowsAsObjects_(sheet);
  const existingIndex = rows.findIndex(row => String(row.account_id || "") === accountId);
  const storeId = publicText_(requestedStoreId || (existingIndex >= 0 ? rows[existingIndex].store_id : makeStoreId_(application.business_name, accountId)), 80, "Inventory store ID");
  const conflict = rows.find(row => String(row.store_id || "") === storeId && String(row.account_id || "") !== accountId);
  if (conflict) throw new Error("That inventory store ID is already used by another account.");
  const target = existingIndex >= 0 ? existingIndex + 2 : sheet.getLastRow() + 1;
  const values = existingIndex >= 0
    ? sheet.getRange(target, 1, 1, sheet.getLastColumn()).getValues()[0]
    : Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
  set("store_id", storeId);
  set("store_name", application.business_name);
  set("route", String(route || "Unassigned"));
  set("active", true);
  set("account_id", accountId);
  set("customer_id", customerId);
  sheet.getRange(target, 1, 1, values.length).setValues([values]);
  return storeId;
}

function publicSiteUrl_(settings) {
  const configured = String(settings?.[PUBLIC_SITE_URL_SETTING_KEY] || "").trim();
  const match = configured.match(/^https:\/\/([^\s\/?#]+)(?:[\/?#].*)?$/i);
  return match ? `https://${match[1]}` : PUBLIC_SITE_URL_FALLBACK;
}

function hasConfiguredPublicSiteUrl_(settings) {
  return publicSiteUrl_(settings) !== PUBLIC_SITE_URL_FALLBACK || String(settings?.[PUBLIC_SITE_URL_SETTING_KEY] || "").trim() === PUBLIC_SITE_URL_FALLBACK;
}

function rewritePublicSiteUrls() {
  const settings = getOutreachCampaignSettings_();
  if (!hasConfiguredPublicSiteUrl_(settings)) return { changed:0, unchanged:0 };
  const publicSiteUrl = publicSiteUrl_(settings);
  const sheet = getOutreachProgramSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) return { changed:0, unchanged:0 };
  const headers = getHeaderMap_(sheet);
  if (headers.ordering_portal_url === undefined) return { changed:0, unchanged:0 };
  const values = sheet.getRange(2, headers.ordering_portal_url + 1, sheet.getLastRow() - 1, 1).getValues();
  let changed = 0;
  let unchanged = 0;
  values.forEach((row, index) => {
    const current = String(row[0] || "").trim();
    const legacy = current.match(/^https:\/\/distribution-hub\.netlify\.app(?=[:\/?#]|$)(.*)$/i);
    if (!legacy) { unchanged += 1; return; }
    const rewritten = `${publicSiteUrl}${legacy[1] || ""}`;
    if (rewritten === current) { unchanged += 1; return; }
    sheet.getRange(index + 2, headers.ordering_portal_url + 1).setValue(rewritten);
    changed += 1;
  });
  return { changed:changed, unchanged:unchanged };
}

function upsertActiveAccountProgram_(account, customerId, applicationId, staffName) {
  const sheet = getOutreachProgramSheet_(true);
  const h = getHeaderMap_(sheet);
  const key = `account::${account.account_id}`;
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const index = rows.findIndex(row => String(row[h.program_key] || "") === key || String(row[h.account_id] || "") === account.account_id);
  const values = index >= 0 ? rows[index].slice() : Array(sheet.getLastColumn()).fill("");
  const set = (name, value) => { if (h[name] !== undefined) values[h[name]] = value; };
  const now = new Date();
  set("program_key", key); set("account_id", account.account_id); set("source_row", account.source_row);
  set("business_name", account.business); set("email", account.email); set("ordering_status", "Active");
  set("ordering_customer_id", customerId); set("ordering_invite_date", now);
  const settings = getOutreachCampaignSettings_();
  set("ordering_portal_url", `${publicSiteUrl_(settings)}/order.html?account_id=${encodeURIComponent(account.account_id)}&customer_id=${encodeURIComponent(customerId || "")}`);
  set("updated_at", now); set("updated_by", staffName); set("notes", `Activated from application ${applicationId}`); set("app_version", APP_VERSION);
  sheet.getRange(index >= 0 ? index + 2 : sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
}

function synchronizeApplicationAccount_(application, p, staffName) {
  const identity = accountIdentityLookup_();
  let account = String(p.account_id || application.account_id || "") ? identity.by_id.get(String(p.account_id || application.account_id || "")) : null;
  if (!account) {
    const match = findIdentityMatch_(identity, "", application.business_name, application.primary_email, application.delivery_city);
    account = match.record;
  }
  if (!account) {
    const directory = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const accountId = permanentId_("ACC");
    directory.appendRow(directoryRowFromBusiness_(directory, {
      business_name:application.business_name,
      contact:application.primary_contact_name,
      email:application.primary_email,
      phone:application.primary_phone,
      address:application.delivery_address_1,
      city:application.delivery_city,
      state:application.delivery_state,
      postal_code:application.delivery_zip,
      relationship:"Current customer",
      status:"Existing customer",
      do_not_email:true,
      lead_source:`Customer application ${application.application_id}`,
      notes:`Created from approved application ${application.application_id}`,
    }, accountId, new Date()));
    account = accountIdentityFromRows_(getAllRowsAsObjects_(directory)).by_id.get(accountId);
  }
  const directory = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const h = getHeaderMap_(directory);
  const row = directory.getRange(account.source_row, 1, 1, directory.getLastColumn()).getValues()[0];
  const set = (aliases, value, overwrite) => {
    const key = aliases.map(normalizeHeader_).find(alias => h[alias] !== undefined);
    if (key === undefined) return;
    if (overwrite || !String(row[h[key]] || "").trim()) row[h[key]] = value;
  };
  set(["Business Name", "Business"], application.business_name, false);
  set(["Contact Person", "Contact"], application.primary_contact_name, false);
  set(["Email"], application.primary_email, false);
  set(["Phone Number", "Phone"], application.primary_phone, false);
  set(["Street Address", "Address"], application.delivery_address_1, false);
  set(["City"], application.delivery_city, false); set(["State"], application.delivery_state, false); set(["Zip Code", "ZIP"], application.delivery_zip, false);
  set(["Relationship"], "Current customer", true); set(["Status"], "Existing customer", true); set(["Do Not Email"], true, true);
  set(["Customer Source"], `Application ${application.application_id}`, true); set(["Record Updated At"], new Date(), true);
  directory.getRange(account.source_row, 1, 1, row.length).setValues([row]);
  account = accountIdentityFromRows_(getAllRowsAsObjects_(directory)).by_id.get(account.account_id);
  const customerId = publicText_(p.customer_id, 80, "Customer ID");
  upsertActiveAccountProgram_(account, customerId, application.application_id, staffName);
  const storeId = ensureInventoryStoreForApplication_(Object.assign({}, application, { account_id:account.account_id }), customerId, toBool_(p.inventory_tracking), p.inventory_store_id, p.inventory_route);
  appendAudit_("ACTIVATE_ACCOUNT", "Application", application.application_id, account.account_id, staffName, CUSTOMER_APPLICATIONS_SHEET_NAME, OUTREACH_SHEET_NAME, "Completed", `Customer ID ${customerId}; inventory store ${storeId || "not enabled"}.`);
  return { account_id:account.account_id, account_link_status:"Linked and active", inventory_store_id:storeId, data_sync_status:storeId ? "Directory, ordering and inventory store synchronized" : "Directory and ordering synchronized" };
}

function findBadgerInvoice_(invoiceNumber, bypassCache) {
  const normalized = String(invoiceNumber || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normalized) return null;
  const match = invoices => invoices.find(invoice =>
    String(invoice.invoice_number || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === normalized
  ) || null;
  const cachedMatch = match(cachedBadgerInvoices_(!!bypassCache));
  if (cachedMatch || bypassCache) return cachedMatch;

  const refreshed = cachedBadgerInvoices_(true);
  cacheBadgerInvoices_(refreshed);
  return match(refreshed);
}

function reconcileBadgerForOrder_(sheet, rowNumber, h, invoiceNumber, bypassCache) {
  const set = (key, value) => { if (h[key] !== undefined) sheet.getRange(rowNumber, h[key] + 1).setValue(value); };
  if (!String(invoiceNumber || "").trim()) {
    set("badger_match_status", "Not checked");
    return { matched:false, status:"Not checked" };
  }
  const match = findBadgerInvoice_(invoiceNumber, bypassCache);
  if (!match) {
    set("badger_match_status", "Pending parser import");
    set("integration_status", "Badger invoice not found");
    return { matched:false, status:"Pending parser import" };
  }
  set("badger_match_status", "Matched"); set("badger_customer_name", match.customer_name);
  set("badger_invoice_date", match.invoice_date); set("badger_amount", match.amount); set("integration_status", "Synchronized");
  return { matched:true, status:"Matched", invoice:match };
}

function upsertDeliveryForOrder_(order, lines, staffName) {
  const sheet = getOutreachSs_().getSheetByName(DELIVERIES_SHEET_NAME);
  const h = getHeaderMap_(sheet);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const index = rows.findIndex(row => String(row[h.request_id] || "") === order.request_id);
  const values = index >= 0 ? rows[index].slice() : Array(sheet.getLastColumn()).fill("");
  const deliveryId = index >= 0 ? String(values[h.delivery_id] || permanentId_("DLV")) : permanentId_("DLV");
  const set = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
  const now = new Date();
  set("delivery_id", deliveryId); set("request_id", order.request_id); set("account_id", order.account_id); set("store_id", order.store_id || "");
  set("business_name", order.business_name); set("delivery_status", order.delivery_status); set("requested_date", order.requested_delivery_date || "");
  if (order.delivery_status === "Delivered" && !values[h.delivered_at]) set("delivered_at", now);
  set("assigned_to", order.assigned_to || staffName); set("badger_invoice_number", order.badger_invoice_number || "");
  if (index < 0) set("created_at", now); set("updated_at", now); set("app_version", APP_VERSION);
  sheet.getRange(index >= 0 ? index + 2 : sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);

  const lineSheet = getOutreachSs_().getSheetByName(DELIVERY_LINES_SHEET_NAME);
  const lh = getHeaderMap_(lineSheet);
  const existing = lineSheet.getLastRow() < 2 ? [] : lineSheet.getRange(2, 1, lineSheet.getLastRow() - 1, lineSheet.getLastColumn()).getValues();
  const existingKeys = new Set(existing.map(row => `${row[lh.request_id]}::${row[lh.line_number]}`));
  const newRows = lines.filter(line => !existingKeys.has(`${order.request_id}::${line.line_number}`)).map(line => {
    const row = Array(lineSheet.getLastColumn()).fill("");
    const setLine = (key, value) => { if (lh[key] !== undefined) row[lh[key]] = value; };
    setLine("delivery_id", deliveryId); setLine("request_id", order.request_id); setLine("account_id", order.account_id); setLine("line_number", line.line_number);
    setLine("sku_id", line.sku_id); setLine("sku_name", line.sku_name); setLine("quantity", line.quantity); setLine("unit", line.unit);
    setLine("bottle_equivalent", line.bottle_equivalent); setLine("created_at", now); setLine("app_version", APP_VERSION);
    return row;
  });
  if (newRows.length) lineSheet.getRange(lineSheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  return deliveryId;
}

function apiUpdateCustomerApplication_(p) {
  if (!p) throw new Error("Missing application update.");
  requireFields_(p, ["application_id", "workflow_status", "staff_name"]);
  const statuses = ["New", "Reviewing", "Needs information", "Approved", "Account active", "Declined"];
  const status = String(p.workflow_status || "");
  if (!statuses.includes(status)) throw new Error("Choose a listed application status.");
  const staffName = publicText_(p.staff_name, 120, "Staff name");
  const applicationId = publicText_(p.application_id, 80, "Application ID");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another customer update is in progress. Try again in a moment.");
  try {
    const sheet = getCustomerApplicationsSheet_(false);
    if (!sheet) throw new Error("Customer Applications sheet is missing.");
    ensureHeaderColumns_(sheet, ["Customer ID", "Assigned To", "Staff Notes", "Review Updated At", "Review Updated By", ACCOUNT_ID_HEADER, "Account Link Status", "Inventory Tracking", "Inventory Store ID", "Inventory Route", "Data Sync Status"]);
    const rowNumber = findRecordRow_(sheet, "application_id", applicationId);
    if (!rowNumber) throw new Error("Application not found.");
    const h = getHeaderMap_(sheet);
    const row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    const previousStatus = String(row[h.workflow_status] || "New");
    const business = String(row[h.business_name] || row[h.legal_business_name] || "");
    const customerId = publicText_(p.customer_id, 80, "Customer ID");
    if (status === "Account active" && !customerId) throw new Error("Customer ID is required before activating an account.");
    const set = (key, value) => { if (h[key] !== undefined) sheet.getRange(rowNumber, h[key] + 1).setValue(value); };
    set("workflow_status", status);
    set("customer_id", customerId);
    set("assigned_to", publicText_(p.assigned_to, 120, "Assigned to"));
    set("staff_notes", publicText_(p.staff_notes, 4000, "Staff notes"));
    set("inventory_tracking", toBool_(p.inventory_tracking));
    set("inventory_store_id", publicText_(p.inventory_store_id, 80, "Inventory store ID"));
    set("inventory_route", publicText_(p.inventory_route, 120, "Inventory route"));
    set("review_updated_at", new Date());
    set("review_updated_by", staffName);
    let accountId = publicText_(p.account_id || (h.account_id !== undefined ? row[h.account_id] : ""), 80, "Account ID");
    let sync = null;
    if (status === "Account active") {
      const record = customerApplicationRecord_(Object.assign({ source_row:rowNumber }, Object.keys(h).reduce((item, key) => {
        item[key] = row[h[key]];
        return item;
      }, {})));
      sync = synchronizeApplicationAccount_(record, Object.assign({}, p, { customer_id:customerId, account_id:accountId }), staffName);
      accountId = sync.account_id;
      set("account_id", accountId);
      set("account_link_status", sync.account_link_status);
      set("inventory_store_id", sync.inventory_store_id || "");
      set("data_sync_status", sync.data_sync_status);
    } else if (accountId) {
      const identity = accountIdentityLookup_();
      if (!identity.by_id.has(accountId)) throw new Error("The selected Account ID does not exist in the directory.");
      set("account_id", accountId);
      set("account_link_status", "Linked by staff");
      set("data_sync_status", "Application linked; account not yet activated");
    }
    appendCustomerWorkflowLog_("Application", applicationId, accountId, business, previousStatus, status, staffName, `Customer ID: ${customerId}; inventory tracking: ${toBool_(p.inventory_tracking) ? "yes" : "no"}`);
    appendAudit_("UPDATE_APPLICATION", "Application", applicationId, accountId, staffName, CUSTOMER_APPLICATIONS_SHEET_NAME, CUSTOMER_APPLICATIONS_SHEET_NAME, "Completed", `${previousStatus} to ${status}`);
    return { message:"Application updated.", application_id:applicationId, account_id:accountId, workflow_status:status, synchronization:sync };
  } finally {
    lock.releaseLock();
  }
}

function apiUpdateOnlineOrderRequest_(p) {
  if (!p) throw new Error("Missing order update.");
  requireFields_(p, ["request_id", "workflow_status", "staff_name"]);
  const statuses = ["New", "Reviewing", "Confirmed", "Invoicing", "Ready for delivery", "Completed", "Cancelled"];
  const invoiceStatuses = ["Not started", "Ready for Badger", "Invoice requested", "Invoice received", "Invoice delivered", "Paid", "Cancelled"];
  const deliveryStatuses = ["Not scheduled", "Scheduled", "Delivered", "Issue"];
  const status = String(p.workflow_status || "");
  const invoiceStatus = String(p.invoice_status || "Not started");
  const deliveryStatus = String(p.delivery_status || "Not scheduled");
  if (!statuses.includes(status)) throw new Error("Choose a listed order status.");
  if (!invoiceStatuses.includes(invoiceStatus)) throw new Error("Choose a listed invoice status.");
  if (!deliveryStatuses.includes(deliveryStatus)) throw new Error("Choose a listed delivery status.");
  const staffName = publicText_(p.staff_name, 120, "Staff name");
  const requestId = publicText_(p.request_id, 80, "Request ID");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another order update is in progress. Try again in a moment.");
  try {
    const sheet = getOnlineOrderRequestsSheet_(false);
    if (!sheet) throw new Error("Online Order Requests sheet is missing.");
    ensureHeaderColumns_(sheet, ["Badger Invoice Number", "Invoice Status", "Delivery Status", "Assigned To", "Staff Notes", "Review Updated At", "Review Updated By", ACCOUNT_ID_HEADER, "Account Link Status", "Integration Status", "Delivered At"]);
    const rowNumber = findRecordRow_(sheet, "request_id", requestId);
    if (!rowNumber) throw new Error("Order request not found.");
    const h = getHeaderMap_(sheet);
    const row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    const previousStatus = String(row[h.workflow_status] || "New");
    const business = String(row[h.business_name] || "");
    let accountId = publicText_(p.account_id || (h.account_id !== undefined ? row[h.account_id] : ""), 80, "Account ID");
    if (accountId) {
      const identity = accountIdentityLookup_();
      if (!identity.by_id.has(accountId)) throw new Error("The selected Account ID does not exist in the directory.");
    }
    const set = (key, value) => { if (h[key] !== undefined) sheet.getRange(rowNumber, h[key] + 1).setValue(value); };
    set("workflow_status", status);
    set("badger_invoice_number", publicText_(p.badger_invoice_number, 80, "Badger invoice number"));
    set("invoice_status", invoiceStatus);
    set("delivery_status", deliveryStatus);
    set("assigned_to", publicText_(p.assigned_to, 120, "Assigned to"));
    set("staff_notes", publicText_(p.staff_notes, 4000, "Staff notes"));
    const requestedDeliveryDate = String(p.requested_delivery_date || "").trim();
    if (requestedDeliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDeliveryDate)) throw new Error("Enter a valid requested delivery date.");
    set("requested_delivery_date", requestedDeliveryDate ? new Date(`${requestedDeliveryDate}T12:00:00`) : "");
    set("review_updated_at", new Date());
    set("review_updated_by", staffName);
    if (accountId) { set("account_id", accountId); set("account_link_status", "Linked by staff"); }
    const badger = reconcileBadgerForOrder_(sheet, rowNumber, h, p.badger_invoice_number);
    const freshRow = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    const fresh = Object.keys(h).reduce((item, key) => { item[key] = freshRow[h[key]]; return item; }, { source_row:rowNumber });
    const order = onlineOrderRecord_(fresh, new Map());
    order.account_id = accountId || order.account_id;
    const orderLines = rowsWithSource_(getOnlineOrderLinesSheet_(false)).filter(line => String(line.request_id || "") === requestId);
    let deliveryId = "";
    if (deliveryStatus !== "Not scheduled") deliveryId = upsertDeliveryForOrder_(order, orderLines, staffName);
    if (deliveryStatus === "Delivered") set("delivered_at", order.delivered_at || new Date());
    set("integration_status", badger.matched ? "Synchronized" : (String(p.badger_invoice_number || "").trim() ? "Badger invoice not found" : (accountId ? "Account linked" : "Needs account match")));
    appendCustomerWorkflowLog_("Order", requestId, accountId, business, previousStatus, status, staffName, `Invoice: ${String(p.badger_invoice_number || "")}; ${invoiceStatus}; Delivery: ${deliveryStatus}`);
    appendAudit_("UPDATE_ORDER", "Order", requestId, accountId, staffName, ONLINE_ORDER_REQUESTS_SHEET_NAME, deliveryId ? DELIVERIES_SHEET_NAME : ONLINE_ORDER_REQUESTS_SHEET_NAME, "Completed", `${previousStatus} to ${status}; Badger ${badger.status}; delivery ${deliveryStatus}`);
    return { message:"Order updated.", request_id:requestId, account_id:accountId, workflow_status:status, badger_match_status:badger.status, delivery_id:deliveryId };
  } finally {
    lock.releaseLock();
  }
}

function onlineOrderVerification_(businessName, customerId, email, claimedAccountId, lockHeld) {
  const directoryMatch = resolvePublicAccount_(claimedAccountId, businessName, email, "", !!lockHeld);
  const matchedAccountId = directoryMatch.record ? directoryMatch.record.account_id : "";
  const sheet = getOutreachProgramSheet_(false);
  const normalizedBusiness = String(businessName || "").trim().toLowerCase();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedId = String(customerId || "").trim().toLowerCase();
  const programMatch = sheet && sheet.getLastRow() >= 2 && getAllRowsAsObjects_(sheet).find(row => {
    if (String(row.ordering_status || "").trim() !== "Active") return false;
    const accountMatch = matchedAccountId && String(row.account_id || "") === matchedAccountId;
    const idMatch = normalizedId && String(row.ordering_customer_id || "").trim().toLowerCase() === normalizedId;
    const emailMatch = normalizedEmail && String(row.email || "").trim().toLowerCase() === normalizedEmail;
    const businessMatch = normalizedBusiness && String(row.business_name || "").trim().toLowerCase() === normalizedBusiness;
    return accountMatch || idMatch || (emailMatch && businessMatch);
  });
  if (programMatch) return { status:"Active account matched", account_id:String(programMatch.account_id || matchedAccountId), account_link_status:"Linked to active account" };

  const applicationSheet = getCustomerApplicationsSheet_(false);
  const applicationMatch = rowsWithSource_(applicationSheet).find(row => {
    if (String(row.workflow_status || "").trim() !== "Account active") return false;
    const idMatch = normalizedId && String(row.customer_id || "").trim().toLowerCase() === normalizedId;
    const applicationEmail = String(row.ordering_email || row.primary_email || "").trim().toLowerCase();
    const applicationBusiness = String(row.business_name || row.legal_business_name || "").trim().toLowerCase();
    return idMatch || (normalizedEmail && applicationEmail === normalizedEmail && normalizedBusiness && applicationBusiness === normalizedBusiness);
  });
  if (applicationMatch) return { status:"Active account matched", account_id:String(applicationMatch.account_id || matchedAccountId), account_link_status:"Linked to active application" };
  return { status:"Needs review", account_id:matchedAccountId, account_link_status:directoryMatch.status };
}

function sendOnlineOrderNotification_(request, lines, sheet, rowNumber) {
  const reviewUrl = `https://docs.google.com/spreadsheets/d/${OUTREACH_SPREADSHEET_ID}/edit#gid=${sheet.getSheetId()}&range=A${rowNumber}`;
  const subject = `New order request: ${request.business_name}`;
  const productLines = lines.map(line => `${line.quantity} ${line.unit.toLowerCase()} - ${line.sku_name}`);
  const plainText = [
    "A new customer order request is ready for review.",
    "",
    `Request ID: ${request.request_id}`,
    `Business: ${request.business_name}`,
    `Contact: ${request.contact_name}`,
    `Email: ${request.email}`,
    `Phone: ${request.phone || "Not provided"}`,
    `Requested delivery date: ${request.requested_delivery_date || "Not specified"}`,
    `Verification: ${request.verification_status}`,
    "",
    "Products:",
  ].concat(productLines, ["", `Review the order: ${reviewUrl}`]);
  const htmlProducts = lines.map(line =>
    `<li>${escapeOutreachHtml_(line.quantity)} ${escapeOutreachHtml_(line.unit.toLowerCase())} - ${escapeOutreachHtml_(line.sku_name)}</li>`
  ).join("");
  const html = [
    "<p>A new customer order request is ready for review.</p>",
    "<ul>",
    `<li><strong>Request ID:</strong> ${escapeOutreachHtml_(request.request_id)}</li>`,
    `<li><strong>Business:</strong> ${escapeOutreachHtml_(request.business_name)}</li>`,
    `<li><strong>Contact:</strong> ${escapeOutreachHtml_(request.contact_name)}</li>`,
    `<li><strong>Email:</strong> ${escapeOutreachHtml_(request.email)}</li>`,
    `<li><strong>Phone:</strong> ${escapeOutreachHtml_(request.phone || "Not provided")}</li>`,
    `<li><strong>Requested delivery date:</strong> ${escapeOutreachHtml_(request.requested_delivery_date || "Not specified")}</li>`,
    `<li><strong>Verification:</strong> ${escapeOutreachHtml_(request.verification_status)}</li>`,
    "</ul>",
    `<p><strong>Products</strong></p><ul>${htmlProducts}</ul>`,
    `<p><a href="${escapeOutreachHtml_(reviewUrl)}">Review this order in the staging sheet</a></p>`,
  ].join("");

  try {
    MailApp.sendEmail({
      to: CUSTOMER_APPLICATION_NOTIFICATION_EMAIL,
      replyTo: request.email,
      name: "Sturgeon Distribution Hub",
      subject: subject,
      body: plainText.join("\n"),
      htmlBody: html,
    });
    return { status:"Sent", sent_at:new Date(), error:"" };
  } catch (error) {
    return { status:"Send error", sent_at:"", error:String(error).slice(0, 500) };
  }
}

function apiSubmitOnlineOrderRequest_(p) {
  if (!p) throw publicError_("Missing order data.");
  if (String(p.form_trap || "").trim()) return { message:"Order request received.", request_id:"RECEIVED" };
  requireFields_(p, ["business_name", "contact_name", "email", "submission_token"]);
  if (!Array.isArray(p.lines) || !p.lines.length) throw publicError_("Choose at least one product.");
  if (p.lines.length > 50) throw publicError_("An order request can contain up to 50 products.");

  const businessName = publicText_(p.business_name, 160, "Business name");
  const claimedAccountId = publicText_(p.account_id, 80, "Account ID");
  const customerId = publicText_(p.customer_id, 60, "Customer ID");
  const contactName = publicText_(p.contact_name, 120, "Contact name");
  const email = publicEmail_(p.email, "Ordering email", true);
  const phone = publicText_(p.phone, 40, "Phone");
  const poNumber = publicText_(p.po_number, 80, "PO number");
  const deliveryDate = publicText_(p.requested_delivery_date, 10, "Requested delivery date");
  const deliveryWindow = publicText_(p.delivery_window, 160, "Delivery window");
  const deliveryInstructions = publicText_(p.delivery_instructions, 1000, "Delivery instructions");
  const notes = publicText_(p.notes, 2000, "Order notes");
  const submissionToken = publicText_(p.submission_token, 120, "Submission token");

  const skuMap = new Map(apiListSkus_().skus.map(sku => [String(sku.sku_id), sku]));
  const lines = p.lines.map((line, index) => {
    const skuId = publicText_(line.sku_id, 120, `Product ${index + 1}`);
    const sku = skuMap.get(skuId);
    if (!sku) throw publicError_(`Product ${index + 1} is not available.`);
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw publicError_(`Product ${index + 1} needs a whole-number quantity from 1 to 999.`);
    const unit = String(line.unit || "");
    if (!["Cases", "Bottles"].includes(unit)) throw publicError_(`Product ${index + 1} has an unsupported unit.`);
    const unitsPerCase = Number(sku.units_per_case || 12);
    return {
      sku_id:skuId,
      sku_name:String(sku.sku_name || skuId),
      quantity:quantity,
      unit:unit,
      units_per_case:unitsPerCase,
      bottle_equivalent:unit === "Cases" ? quantity * unitsPerCase : quantity,
      catalog_source:String(sku.catalog_source || ORDER_CATALOG_SOURCE),
      external_item_id:String(sku.external_item_id || ""),
    };
  });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw publicError_("Another order request is being recorded. Try again in a moment.");
  let journal = null;
  try {
    const requestSheet = getOnlineOrderRequestsSheet_(true);
    ensureHeaderColumns_(requestSheet, ["Notification Status", "Notification Sent At", "Notification Error"]);
    const priorId = existingSubmissionByToken_(requestSheet, submissionToken, "Request ID");
    if (priorId) return { message:"Order request already received.", request_id:priorId };
    const verification = onlineOrderVerification_(businessName, customerId, email, claimedAccountId, true);
    journal = startSubmissionJournal_("Online order", submissionToken, verification.account_id, businessName, p);
    if (journal.prior_record_id) return { message:"Order request already received.", request_id:journal.prior_record_id };
    const lineSheet = getOnlineOrderLinesSheet_(true);
    const h = getHeaderMap_(requestSheet);
    const lineHeaders = getHeaderMap_(lineSheet);
    const requestId = publicSubmissionId_("ORD");
    const now = new Date();
    const totalCases = lines.filter(line => line.unit === "Cases").reduce((sum, line) => sum + line.quantity, 0);
    const totalBottles = lines.filter(line => line.unit === "Bottles").reduce((sum, line) => sum + line.quantity, 0);
    const bottleEquivalent = lines.reduce((sum, line) => sum + line.bottle_equivalent, 0);
    const row = Array(requestSheet.getLastColumn()).fill("");
    const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
    set("request_id", requestId);
    set("submitted_at", now);
    set("workflow_status", "New");
    set("verification_status", verification.status);
    set("account_id", verification.account_id);
    set("account_link_status", verification.account_link_status);
    set("catalog_source", ORDER_CATALOG_SOURCE);
    set("integration_status", verification.account_id ? "Account linked; awaiting staff review" : "Needs account match");
    set("badger_match_status", "Not checked");
    set("business_name", businessName);
    set("customer_id", customerId);
    set("contact_name", contactName);
    set("email", email);
    set("phone", phone);
    set("po_number", poNumber);
    set("requested_delivery_date", deliveryDate ? new Date(`${deliveryDate}T12:00:00`) : "");
    set("delivery_window", deliveryWindow);
    set("delivery_instructions", deliveryInstructions);
    set("notes", notes);
    set("line_count", lines.length);
    set("requested_cases", totalCases);
    set("requested_bottles", totalBottles);
    set("bottle_equivalent", bottleEquivalent);
    set("submission_token", submissionToken);
    set("app_version", APP_VERSION);
    requestSheet.appendRow(row);
    const requestRow = requestSheet.getLastRow();

    const lineRows = lines.map((line, index) => {
      const values = Array(lineSheet.getLastColumn()).fill("");
      const setLine = (key, value) => { if (lineHeaders[key] !== undefined) values[lineHeaders[key]] = value; };
      setLine("request_id", requestId);
      setLine("account_id", verification.account_id);
      setLine("line_number", index + 1);
      setLine("sku_id", line.sku_id);
      setLine("sku_name", line.sku_name);
      setLine("quantity", line.quantity);
      setLine("unit", line.unit);
      setLine("units_per_case", line.units_per_case);
      setLine("bottle_equivalent", line.bottle_equivalent);
      setLine("catalog_source", line.catalog_source);
      setLine("external_item_id", line.external_item_id);
      setLine("app_version", APP_VERSION);
      return values;
    });
    lineSheet.getRange(lineSheet.getLastRow() + 1, 1, lineRows.length, lineRows[0].length).setValues(lineRows);
    const notificationJob = enqueueIntegrationJob_("ORDER_NOTIFICATION", "Order", requestId, verification.account_id, {
      request_id:requestId, business:businessName, email:email,
    });
    const notification = sendOnlineOrderNotification_({
      request_id:requestId,
      business_name:businessName,
      contact_name:contactName,
      email:email,
      phone:phone,
      requested_delivery_date:deliveryDate,
      verification_status:verification.status,
    }, lines, requestSheet, requestRow);
    requestSheet.getRange(requestRow, h.notification_status + 1, 1, 3).setValues([[
      notification.status,
      notification.sent_at,
      notification.error,
    ]]);
    updateIntegrationJob_(notificationJob, notification.status === "Sent" ? "Completed" : "Retry", notification.error);
    completeSubmissionJournal_(journal, "Completed", requestId, "");
    appendAudit_("SUBMIT_ORDER", "Order", requestId, verification.account_id, "Public order form", "Online order", ONLINE_ORDER_REQUESTS_SHEET_NAME, "Completed", verification.account_link_status);
    return { message:"Order request received for confirmation.", request_id:requestId };
  } catch (error) {
    if (journal) completeSubmissionJournal_(journal, "Needs recovery", "", error.message || error);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function apiReconcileIntegrations_(p) {
  if (!p) throw new Error("Missing reconciliation request.");
  requireFields_(p, ["staff_name"]);
  const staffName = publicText_(p.staff_name, 120, "Staff name");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another reconciliation or write is in progress.");
  try {
    const orderSheet = getOnlineOrderRequestsSheet_(false);
    if (!orderSheet || orderSheet.getLastRow() < 2) return { message:"No orders need reconciliation.", checked:0, badger_matches:0, deliveries:0, attention:0 };
    ensureHeaderColumns_(orderSheet, ["Badger Invoice Number", "Invoice Status", "Delivery Status", "Integration Status", "Badger Match Status", "Delivered At"]);
    const h = getHeaderMap_(orderSheet);
    const lineRows = rowsWithSource_(getOnlineOrderLinesSheet_(false));
    const linesByRequest = new Map();
    lineRows.forEach(line => {
      const requestId = String(line.request_id || "");
      if (!linesByRequest.has(requestId)) linesByRequest.set(requestId, []);
      linesByRequest.get(requestId).push(line);
    });
    const rows = rowsWithSource_(orderSheet);
    let badgerMatches = 0;
    let deliveries = 0;
    let attention = 0;
    rows.forEach(raw => {
      const order = onlineOrderRecord_(raw, linesByRequest);
      if (!order.request_id) return;
      const invoice = reconcileBadgerForOrder_(orderSheet, raw.source_row, h, order.badger_invoice_number, true);
      if (invoice.matched) badgerMatches += 1;
      if (order.delivery_status !== "Not scheduled") {
        upsertDeliveryForOrder_(order, order.lines, staffName);
        deliveries += 1;
      }
      const status = invoice.matched
        ? "Synchronized"
        : (order.badger_invoice_number ? "Badger invoice not found" : (order.account_id ? "Account linked" : "Needs account match"));
      orderSheet.getRange(raw.source_row, h.integration_status + 1).setValue(status);
      if (["Badger invoice not found", "Needs account match"].includes(status)) attention += 1;
    });
    appendAudit_("RECONCILE_INTEGRATIONS", "System", "orders", "", staffName, `${ONLINE_ORDER_REQUESTS_SHEET_NAME}; ${BADGER_TRACKER_SPREADSHEET_ID}`, `${DELIVERIES_SHEET_NAME}; ${ONLINE_ORDER_REQUESTS_SHEET_NAME}`, "Completed", `${rows.length} orders checked; ${badgerMatches} Badger matches; ${deliveries} delivery records; ${attention} need attention.`);
    return { message:"Integration reconciliation completed.", checked:rows.length, badger_matches:badgerMatches, deliveries:deliveries, attention:attention };
  } finally {
    lock.releaseLock();
  }
}
