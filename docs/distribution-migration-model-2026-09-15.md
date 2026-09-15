# Distribution Migration Model

Date: 2026-09-15
Status: design gate; not approved for production migration

## Goals and Guardrails

The expanded system should provide one operational view of prospects,
customers, visits, follow-ups, inventory, orders, invoices, delivery, customer
payments, Badger remittances and campaigns.

The following rules are non-negotiable:

1. Preserve the current Stores, SKUs, Inventory, Counts and Reorders workflows.
2. Reuse the bound Badger Invoice Tracker Apps Script parser. Do not build a
   duplicate PDF parser.
3. Preserve source values and provenance before normalizing or merging them.
4. Treat blank legacy status fields as unknown, not false.
5. Test imports repeatedly in staging before any production write.
6. Keep Zoho campaign mode at TEST until a live send is explicitly approved.

## System Boundary

The app becomes the operational interface and canonical relationship layer.
Existing source systems continue to own these responsibilities during the
migration:

| Responsibility | Initial owner | App responsibility |
| --- | --- | --- |
| Parse Badger invoice PDFs | Existing Badger Tracker Apps Script, currently started manually and eligible for a future trigger | Show pending candidates; track parser runs; read output, match accounts/SKUs and track review state |
| Store-level inventory and counts | Existing inventory backend | Preserve behavior and expose it as the Inventory module |
| Zoho message delivery | Existing Zoho mail API workflow | Build approved messages, enforce suppression and record message activity |
| Original historical evidence | Linked Sheets, folders and PDFs | Preserve source IDs, hashes/keys, raw values and import timestamps |
| Cross-source account identity | None | Canonical Accounts, Aliases, Locations and review workflow |

## CRM Operating Model

This is an account-centered distribution CRM. Every prospect and customer has
one canonical Account record and one chronological timeline that connects the
entire relationship:

`Lead -> Contact -> Conversation -> Tasting/Sample -> Sale -> Order -> Badger
Invoice -> Delivery -> Inventory -> Restock Signal -> Reorder`

That sequence is the employee experience, but it must not be stored as one
status value. Several facts can be true at once, so the system uses connected
records:

- Account relationship describes prospect, current customer, win-back, lapsed
  or closed status.
- Contacts identify the people and roles at each account/location.
- Activities record calls, emails, replies, visits, tastings and notes.
- FollowUps place the next electronic or in-person action on an employee's
  Today view.
- Opportunities track the sales conversation and whether it becomes a sale.
- Orders and Badger invoices record what was purchased and billed.
- DeliveryEvents record when product physically reached the location.
- Counts and Inventory record shelf, back stock and observed on-hand units.
- ReorderSignals identify likely restocking needs and support an approved email,
  call or visit.

The Account detail view is the working hub. It should show identity and
contacts, sales likelihood, next action, communication history, opportunity,
orders/invoices, delivery/payment state, products carried, current inventory
and restocking status without requiring employees to open source spreadsheets.

The system should preserve attribution across the chain: which lead source and
outreach produced a conversation, which conversation produced a sale, which
sale matched a Badger invoice, and which delivery/count produced a restock.

## Canonical Records

Every new table must have a durable primary ID, `created_at`, `updated_at`,
`created_by`, `source_system` and `source_record_id` where applicable.

### Schema and Imports

`SchemaVersions`

- `version_id`
- `version_number`
- `applied_at`
- `applied_by`
- `description`
- `code_version`

`ImportBatches`

- `import_batch_id`
- `source_system`
- `source_file_id`
- `source_revision`
- `started_at`
- `completed_at`
- `status`
- `records_read`
- `records_created`
- `records_updated`
- `records_skipped`
- `records_needing_review`
- `error_summary`

`ParserRuns`

- `parser_run_id`
- `invocation_type` (`MANUAL` or `TRIGGER`)
- `started_at`
- `completed_at`
- `status`
- `started_by`
- `candidate_file_count`
- `processed_file_count`
- `skipped_file_count`
- `error_count`
- `tracker_revision`
- `error_summary`

`SourceRecords`

- `source_record_id`
- `import_batch_id`
- `source_file_id`
- `source_tab`
- `source_row_or_item_id`
- `source_payload_json`
- `source_fingerprint`
- `observed_at`

`ImportReview`

- `review_id`
- `import_batch_id`
- `source_record_id`
- `review_type`
- `proposed_entity_type`
- `proposed_entity_id`
- `confidence`
- `reason`
- `status`
- `decision`
- `resolved_by`
- `resolved_at`

### Accounts and People

`Accounts`

- `account_id`
- `account_name`
- `legal_name`
- `account_type`
- `relationship_status`
- `craft_spirit_fit`
- `sales_likelihood_score`
- `sales_likelihood_band`
- `sales_likelihood_reasons`
- `sales_likelihood_rule_version`
- `outreach_priority_score`
- `outreach_priority_band`
- `owner_user_id`
- `route_id`
- `active`
- `do_not_contact`
- `do_not_email`
- `first_order_date`
- `last_order_date`
- `lifetime_invoiced`

`AccountAliases`

- `account_alias_id`
- `account_id`
- `alias_name`
- `alias_type`
- `source_system`
- `source_record_id`

`Locations`

- `location_id`
- `account_id`
- `location_name`
- `street_address`
- `city`
- `state`
- `postal_code`
- `county`
- `latitude`
- `longitude`
- `is_inventory_location`
- `legacy_store_id`
- `active`

`Contacts`

- `contact_id`
- `account_id`
- `location_id`
- `first_name`
- `last_name`
- `role`
- `email`
- `phone`
- `is_primary`
- `email_confidence`
- `do_not_email`
- `active`

Existing manager and assistant manager names should become Contacts with roles
`Manager` and `Assistant Manager`. Keep the legacy store columns during the
transition so the current inventory UI remains compatible.

### Activities, Follow-ups and Sales Pipeline

`Activities`

- `activity_id`
- `account_id`
- `location_id`
- `contact_id`
- `user_id`
- `activity_type`
- `occurred_at`
- `duration_minutes`
- `subject`
- `notes`
- `outcome`
- `products_discussed`
- `items_left`
- `external_message_id`

Activity types include visit, call, email, tasting, sample drop, delivery,
payment contact and internal note.

`FollowUps`

- `follow_up_id`
- `account_id`
- `contact_id`
- `assigned_user_id`
- `due_at`
- `follow_up_type`
- `description`
- `priority`
- `status`
- `completed_at`
- `completion_activity_id`

`Opportunities`

- `opportunity_id`
- `account_id`
- `owner_user_id`
- `stage`
- `estimated_value`
- `expected_close_date`
- `next_action`
- `next_action_due_at`
- `won_order_id`
- `lost_reason`

Recommended stages are qualified, attempted, conversation, tasting/sample,
trial order, won and lost.

### Products, Inventory and Reorders

The existing `SKUs` table remains the product foundation. New invoice and order
items should map to its stable `sku_id` values through `ProductAliases`.

`ProductAliases`

- `product_alias_id`
- `sku_id`
- `source_system`
- `source_description`
- `volume`
- `confidence`
- `approved_by`

Keep the existing `Inventory` table during migration. Add normalized event
tables alongside it:

`CountSessions`

- `count_session_id`
- `location_id`
- `legacy_store_id`
- `user_id`
- `started_at`
- `submitted_at`
- `status`
- `device_class`
- `notes`

`CountItems`

- `count_item_id`
- `count_session_id`
- `sku_id`
- `system_on_hand_units`
- `shelf_units`
- `back_stock_units`
- `counted_units`
- `delta_units`

`counted_units` is derived as shelf plus back stock. Persisting both locations
keeps the mobile counting workflow useful without changing the total used by
the current inventory logic.

`Reorders`

- `reorder_id`
- `account_id`
- `location_id`
- `legacy_store_id`
- `requested_by`
- `requested_at`
- `status`
- `notes`

`ReorderItems`

- `reorder_item_id`
- `reorder_id`
- `sku_id`
- `system_on_hand_units`
- `counted_units`
- `need_units`
- `cases_needed`
- `reason`

`ReorderSignals`

- `reorder_signal_id`
- `account_id`
- `location_id`
- `sku_id`
- `generated_at`
- `signal_type`
- `evidence_summary`
- `last_count_item_id`
- `last_invoice_id`
- `suggested_units`
- `confidence`
- `status`
- `assigned_user_id`
- `resolved_reorder_id`

The existing malformed Reorders sheet must be copied and mapped in staging.
Do not rewrite its production headers in place.

### Orders, Invoices and Reconciliation

`Orders`

- `order_id`
- `account_id`
- `location_id`
- `order_date`
- `status`
- `sales_rep_user_id`
- `source_system`
- `external_order_number`
- `notes`

`OrderItems`

- `order_item_id`
- `order_id`
- `sku_id`
- `quantity_units`
- `unit_price`
- `line_total`

`Invoices`

- `invoice_id`
- `account_id`
- `location_id`
- `order_id`
- `external_invoice_number`
- `invoice_date`
- `amount_due`
- `terms`
- `pdf_file_id`
- `pdf_file_name`
- `parser_source_record_id`
- `parser_status`
- `reconciliation_status`

`InvoiceLines`

- `invoice_line_id`
- `invoice_id`
- `sku_id`
- `source_description`
- `quantity`
- `volume`
- `beverage_class`
- `unit_price`
- `line_total`
- `product_match_status`

`DeliveryEvents`

- `delivery_event_id`
- `invoice_id`
- `delivered_at`
- `delivered_by`
- `evidence_type`
- `notes`

`Payments`

- `payment_id`
- `account_id`
- `received_at`
- `received_by`
- `payment_destination`
- `amount`
- `method`
- `reference_number`
- `notes`

`PaymentAllocations`

- `payment_allocation_id`
- `payment_id`
- `invoice_id`
- `amount`

`BadgerRemittances`

- `remittance_id`
- `submitted_at`
- `submitted_by`
- `amount`
- `check_number`
- `status`
- `notes`

`RemittanceAllocations`

- `remittance_allocation_id`
- `remittance_id`
- `invoice_id`
- `amount`

The three legacy concepts must remain separate:

- Delivered means the physical delivery occurred.
- Paid means customer money was received, either by Sturgeon or directly by
  Badger.
- Submitted means Sturgeon sent the corresponding remittance to Badger.

The system must not infer a Badger remittance when the customer paid Badger
directly. A payment destination of `BADGER_DIRECT` closes the customer balance
without creating a Sturgeon-to-Badger remittance obligation.

### Campaigns and Zoho

`Campaigns`

- `campaign_id`
- `name`
- `segment`
- `mode`
- `status`
- `sender_address`
- `created_by`
- `approved_by`
- `approved_at`

`CampaignTemplates`

- `template_version_id`
- `campaign_id`
- `message_stage`
- `subject_template`
- `html_template`
- `version_number`
- `active`

`CampaignRecipients`

- `campaign_recipient_id`
- `campaign_id`
- `account_id`
- `contact_id`
- `queue_status`
- `suppression_reason`
- `approved_at`

`CampaignMessages`

- `campaign_message_id`
- `campaign_recipient_id`
- `template_version_id`
- `message_purpose`
- `related_reorder_signal_id`
- `zoho_message_id`
- `sent_at`
- `delivery_status`
- `error_detail`
- `activity_id`

`CampaignResponses`

- `campaign_response_id`
- `campaign_message_id`
- `account_id`
- `contact_id`
- `zoho_message_id`
- `zoho_thread_id`
- `received_at`
- `response_channel`
- `response_outcome`
- `response_summary`
- `follow_up_required`
- `activity_id`

Campaign eligibility is evaluated when queued and again immediately before
send. Current customers, do-not-email contacts, invalid/unverified addresses
and completed/blocked outcomes remain suppressed. Win-back and lapsed accounts
must use a reactivation campaign rather than cold-prospect copy.

Response tracking may begin with a fast manual classification after an employee
reads a reply in Zoho, then add inbox synchronization after its permissions and
thread-matching behavior are tested. Both paths must create the same response
and account-activity records.

### Employee Sales Outreach Workflow

The Distribution Directory and Leads behavior becomes the core of the Accounts
and Today views:

1. The employee opens `Accounts` and sees all stores ranked by sales likelihood,
   with visible reasons such as venue fit, relationship, purchase history,
   distance and contact quality.
2. The employee filters by route, territory, relationship, segment, email
   availability, follow-up state or assigned rep.
3. The employee opens a store and sees contacts, past visits, sent messages,
   responses, sales, inventory and the current next action in one timeline.
4. For electronic outreach, the employee selects an approved template, reviews
   the personalized message, sends a test when required and deliberately queues
   the recipient.
5. Zoho sends from `sales@sturgeonspirits.com`; the app records the template
   version, recipient, timestamp, result and Zoho message ID.
6. A reply is recorded or synchronized, classified and added to the account
   timeline. Typical outcomes include interested, needs information, schedule a
   visit, not now, not interested, bad address and unsubscribe.
7. The employee chooses the next action: electronic follow-up, phone call,
   tasting, sample drop, in-person visit or no further contact.
8. The follow-up appears on the assigned employee's Today view and remains open
   until completed or rescheduled.
9. If a visit or order follows, it remains connected to the originating message
   so reporting can show outreach-to-sale results.

Employees must be able to move through this loop without opening the underlying
spreadsheet. The original workbook remains the migration source and behavioral
reference until the app passes parity testing.

### Sale-to-Reorder Workflow

After an employee records a sale, the system keeps the commercial and inventory
records connected:

1. Mark the Opportunity as won and create an Order with product quantities.
2. When the existing Badger parser produces an invoice, propose a match using
   account/location aliases, invoice date, order number, products and amount.
3. Auto-link only a single high-confidence match. Send ambiguous matches to
   ImportReview so the wrong customer or sale is never silently connected.
4. When delivery is confirmed, attach the DeliveryEvent to the invoice and use
   its product quantities as the opening or replenishment evidence for that
   location's inventory history.
5. Continue using physical shelf and back-stock counts as the authoritative
   observed on-hand quantity. Do not assume invoiced quantity still equals
   current inventory after delivery.
6. Generate a ReorderSignal when a count is below par/reorder point, estimated
   bottles sold indicate depletion, a normal reorder interval has passed or an
   employee flags the account for review.
7. Show the evidence behind the signal, including last delivery, last count,
   estimated sales and suggested quantity. An employee reviews it before
   contacting the customer.
8. From the account or Today view, the employee chooses `Ask about reorder`,
   previews an approved Zoho template and deliberately sends the email.
9. Record that message with purpose `REORDER_INQUIRY`, its related signal and
   the Zoho message ID. Set a follow-up date if no response arrives.
10. Classify the response. A positive response creates a proposed Reorder or
    Order for employee confirmation; it does not create or submit an invoice
    automatically.
11. Resolve the signal as ordered, declined, deferred, no response or handled
    in person. Preserve the full sequence in the account timeline.

Reorder inquiry templates may mention products previously carried and ask a
simple question, but internal confidence scores, system counts and uncertain
estimates must not be sent to the customer.

## Source Mapping

| Source | Canonical targets | Important transformation |
| --- | --- | --- |
| Inventory backend `Stores` | Accounts, Locations, Contacts | Preserve `store_id`; add manager roles without removing legacy columns |
| Inventory backend `SKUs` | SKUs, ProductAliases | Preserve every current `sku_id` and UPC |
| Inventory backend `Inventory` | Inventory | Keep operational table unchanged during the first migration |
| Inventory backend `Counts` | CountSessions, CountItems | Group by submission timestamp/store/rep; legacy location split remains unknown |
| Inventory backend `Reorders` | Reorders, ReorderItems | Interpret values by writer contract, not incorrect legacy headers |
| Distribution Directory and Leads | Accounts, Locations, Contacts, Campaigns | Split account identity from campaign state and calculated metrics |
| Distribution Form responses | Activities, FollowUps, Orders/ImportReview | Preserve free text; review ambiguous sale claims |
| Old distribution spreadsheet | Accounts, Contacts, Activities, FollowUps | Carry forward dates within route blocks only when evidence supports it |
| Bar/Restaurant Visits | Activities, FollowUps | Blank date inherits the previous nonblank date within the same visit log |
| Badger Tracker `Invoices` | Invoices, DeliveryEvents, Payments, Remittances | Blank/unchecked lifecycle values import as unknown |
| Badger Tracker `Invoice Lines` | InvoiceLines, ProductAliases | Match description plus volume to SKU; queue uncertain matches |
| Badger Tracker `Location_Directory` | AccountAliases, Locations | Preserve invoice name and public name separately |
| Badger Tracker `Import Errors` | ImportReview | Classify document type before treating it as parser failure |
| First-year reports | Accounts, Orders/Invoices, ImportReview | Use as historical evidence; avoid duplicating Badger transactions |
| Zoho activity | CampaignMessages, Activities | Use Zoho message ID as external idempotency key |

## Identity, Matching and Deduplication

New IDs should be opaque and stable, for example `acct_...`, `contact_...` and
`inv_...`. Legacy IDs remain indexed aliases, not regenerated identifiers.

Account matching should evaluate normalized legal/public name, street address,
city, phone, email domain and known aliases. It should produce a confidence
score and evidence list.

- Exact legacy store ID or approved alias: auto-match.
- Strong name plus address/city agreement: auto-match with audit record.
- Name-only, chain-name or conflicting-address match: manual review.
- No plausible match: create a proposed account pending import policy.

Never merge accounts based only on a similar business name. Chain locations
such as Festival Foods require separate Locations even when they share an
Account parent.

Source fingerprints make imports idempotent. Re-running an unchanged source
must not create duplicate activities, invoices, invoice lines or messages.

## Parser Integration Contract

The existing Badger parser remains bound to the Badger Invoice Tracker and
writes its current output tabs. It currently has no automatic trigger and is
started manually by an operator. After the parser source is inspected and
tested, a trigger may call that same entry point. The expanded system adds a
read-only adapter with these steps:

1. Show the last successful sync time and the count of PDF file IDs that are
   present in the source folder but absent from parser output. Label these as
   `pending candidates`, not failed invoices.
2. Start the existing parser either through the approved trigger or the manual
   fallback in the Badger Tracker. Do not duplicate parser logic.
3. After the parser run completes, read newly processed rows from
   `Invoices` and `Invoice Lines` using source
   file ID plus invoice number as the external key.
4. Store raw rows in `SourceRecords` before transformation.
5. Match invoice customer to Account/Location through approved aliases.
6. Match each line description and volume to an existing SKU.
7. Create canonical invoice records only when idempotency checks pass.
8. Queue uncertain account, product or document-type decisions in
   `ImportReview`.
9. Record the manual run acknowledgement, sync batch and last successfully
   consumed tracker row/revision without changing
   the parser's own bookkeeping.

The visible flow is `Check pending candidates` -> `Run existing parser` ->
`Sync parser output` -> `Review exceptions`. A trigger may perform the parser
run and sync automatically, while the tracker retains a manual fallback. Every
run should use locking, produce a run record and be safe to retry without
duplicating invoices or lines.

Before adapter implementation, inspect and version the bound Apps Script source
to confirm its folder selection, processed-file rules, duplicate detection,
text extraction, parsing patterns, write order and error behavior. That source
review is still required; output-sheet inspection alone is not sufficient.

## Sales Likelihood and Outreach Priority

Keep craft-spirit fit as a stable manual score. Calculate sales likelihood as a
separate, explainable estimate of how likely the store is to buy. Inputs may
include venue fit, account type, relationship, purchase history, product fit,
distance and contact quality. Store the score, band, reasons and rule version.

Calculate outreach priority from sales likelihood plus operational timing:
opportunity stage, last touch, response recency, follow-up due date, route,
assignment and suppression state. This answers who should be contacted next,
which is different from who is most likely to buy eventually.

Queue approval remains a human decision. A high priority score must never send
an email automatically.

## Migration Sequence

1. Snapshot every source with file ID, revision/time, sheet/tab and row count.
2. Copy the inventory backend and Badger Tracker into a staging boundary.
3. Inspect and version the existing Badger parser source.
4. Create SchemaVersions, ImportBatches, SourceRecords and ImportReview first.
5. Import Accounts, Aliases, Locations and Contacts without merging uncertain
   matches.
6. Import Activities and FollowUps from historical sources.
7. Run the existing Badger parser through its staging trigger or manual
   fallback, then consume its output through the adapter and reconcile products.
8. Add payment/remittance events without converting unknown legacy blanks to
   false.
9. Add campaign entities and Zoho TEST-mode integration.
10. Run inventory regression tests and reconciliation totals before proposing a
    production migration.

No production migration should begin until the staging plan's acceptance gates
are satisfied and the owner approves the migration report.
