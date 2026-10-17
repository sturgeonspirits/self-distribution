# Spreadsheet Tab Map

Version: `2026.09.17.1`

Status: staging only. No production workbook was changed.

## Operational Workbooks

The distribution system has two operational staging workbooks:

1. [Staging Distribution Hub](https://docs.google.com/spreadsheets/d/1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo/edit#gid=917202601) owns accounts, outreach, applications, order requests, deliveries, inventory migration, imports, and audit history.
2. [Staging Badger Invoice Tracker](https://docs.google.com/spreadsheets/d/10KM-L-iAXJ4WQ1HfLWWoGkINsi9tEvVs6J5XiHBsMIQ/edit#gid=917202602) owns the existing PDF parser and invoice output.

Both workbooks have the same `START HERE - TAB MAP` as the first visible tab. The map contains direct links to every tab in both workbooks and identifies who should use each tab.

## Distribution Hub

### Daily Work

- `Distribution Directory and Leads`: master account, contact, prospect, and outreach record.
- `Dashboard`: campaign and outreach summary.
- `Customer Applications`: wholesale applications and staff review state.
- `Online Order Requests`: order headers, account links, invoice, and delivery workflow.
- `Deliveries`: delivery events linked to orders and accounts.
- `Newsletter Contacts`: newsletter recipients, consent, and relationship type.

### Admin And Setup

- `Campaign Settings`: outreach mode, sender, timing, and shared campaign settings.
- `Email Editor`: templates, footer, sell sheet, website, logo, sender name, and title.
- `Campaign Guide`: outreach workflow reference.
- `Account Programs`: newsletter, ordering, and inventory-program status.
- `Toast Item Map`: future Toast-to-SKU mapping; Toast stock is not connected.
- `Apps Script Setup`: deployment and backend recovery notes.

### System Managed

- `Hub Configuration`: workbook IDs, migration state, and integration configuration.
- `Submission Journal`: write-ahead public-submission record.
- `Hub Audit Log`: append-only change history.
- `Integration Jobs`: notification and integration attempts and retries.
- `Import Batches` and `Import Rows`: duplicate-safe import audit records.
- `Activity Log`: outreach sends, tests, outcomes, and Zoho message IDs.
- `Outreach Drafts`: saved custom email subjects and bodies.
- `Email Engagement`: estimated email-open and click events.
- `Online Order Lines`: product lines linked to order requests.
- `Delivery Lines`: product lines linked to deliveries.

### Reference And Transition

- `Historical Sales Data`: historical Badger and customer context.
- `Pilot Review`: read-only transition archive for pilot approvals and send results.

## Badger Invoice Tracker

### Daily Work And Reports

- `Invoices`: invoice-level parser output.
- `Import Errors`: PDFs or rows requiring parser review.
- `Monthly Summary`: monthly invoice and sales reporting.
- `Previous Month`: prior-month reporting reference.

### Admin And System Managed

- `Location_Directory`: maps invoice names to canonical businesses and locations.
- `Diagnostics`: parser troubleshooting information.
- `Invoice Lines`: parser-owned product lines for each invoice.
- `Sheet1`: unused hidden default tab; leave hidden.

### Test Only

- `TEST - Invoices`
- `TEST - Invoice Lines`
- `TEST - Import Errors`
- `TEST - Parser State`
- `TEST - Monthly Summary`

The `TEST - ...` tabs contain staging fixtures and must never be treated as production invoice data.

## Maintenance Rule

Whenever a tab is added, renamed, retired, or changes ownership, update both `START HERE - TAB MAP` tabs and increment this document's version. Never delete a system or legacy tab merely because it is no longer part of daily work; archive and document it first.
