# Sturgeon Distribution Hub — Staff Guide

This guide is for day-to-day work in the Hub. It explains what to do in the app; it is not a deployment or spreadsheet-administration guide.

## Start here

1. Go to the Sturgeon Distribution Hub and choose **Sign in with Zoho**.
2. Sign in with your approved Zoho work account.
3. Use the navigation at the top to choose **Inventory**, **Outreach**, or **Orders & Accounts**.

You will see only the areas assigned to you. If a section is missing, or you see “Staff list temporarily unavailable,” ask an administrator to check your **Staff Access** row. Do not use someone else’s login.

## Before you make a change

- Read the existing details and history first. The Hub records who made changes.
- Enter only information you have verified. Do not guess a customer’s price, delivery date, payment state, or opt-out status.
- Use **Refresh** if someone else may have changed the record.
- Do not close a window while its save/send button is working. Wait for the success or error message.
- Never put passwords, API keys, card details, or private credentials in notes.

## Inventory

### Count bottles

1. Choose the **Store**.
2. Choose **Shelf** or **Back** to count that location.
3. Find the product by scrolling, searching by product/SKU/UPC, or choosing **Scan UPC**.
4. Enter the number of bottles. Use the plus/minus controls when they are available.
5. Submit the count when you have finished the location.

Use the filters to focus on **Needs attention** or **Changed** items. The green “Counted, matches” label means the saved count matches the current value.

### Review inventory

- **Sold Since Count** shows bottles sold since the last saved count; it does not replace a physical count.
- **Inventory Summary** is a read-only total across active count locations.
- **Inventory by Location** is useful for comparing stores and finding below-PAR items.

### Add a product or carry an existing SKU

Open **Manager Tools** from Inventory.

- **Add Existing SKU** adds an existing catalog product to the selected store. Enter its starting on-hand count, PAR, and reorder-point amounts.
- **Add New Product** creates the basic SKU. Complete SKU ID, name, size, units per case, and Active status. Set **Add to store?** to **No** when the product is not carried at the selected store.

The new-product form creates the basic SKU and, optionally, a store record. An authorized catalog manager must still complete commercial fields on the SKUs spreadsheet row—especially Proof, price tier/wholesale price, and sell-sheet section—before the product is ready for selling, invoicing, or the sell sheet.

### Reorders and count resets

- Use **Create Reorder** only after reviewing the proposed quantities and notes.
- **Reset Staff Counts** is a management action. Do not use it to correct one mistaken product count; correct that product normally instead.

## Outreach

Outreach is for working prospects and customers, recording contact attempts, and sending only reviewed messages.

### Work a business record

1. Open **Outreach** and find the business using search or the available filters.
2. Open the business record and confirm the contact name, email, business, stage, and recent activity.
3. Record the outcome of the contact attempt and any useful note.
4. Save, then check that the activity/history reflects the change.

Do not email a business marked **Do Not Email**, **Unsubscribed**, **Bad address**, or another opt-out/stop status. If someone asks to stop receiving messages, record the unsubscribe outcome immediately; do not send a follow-up.

### Send a one-to-one outreach email

1. Open the business record and choose the email review action.
2. Check the recipient, subject, and body. Personalize only information you know is correct.
3. Save the reviewed draft.
4. Use **Send test** if a test is appropriate.
5. Use **Send email** only after the final confirmation.

The sell-sheet link, signature, logo, mailing address, and opt-out text are added automatically. Do not try to remove them. The Hub sends one recipient at a time and records the result.

### Create and send a campaign

Campaigns require review before delivery.

1. Choose **Create campaign** and select the campaign type and criteria.
2. Preview the audience. Read the “left out” reasons; correct source data instead of overriding a safety exclusion.
3. Review recipient records and exclusions.
4. Review the rendered message and recipient count.
5. Approve only when the audience and copy are correct.
6. Send a batch or schedule the approved campaign, as appropriate.

If the shared template was changed after a campaign was created, rebuild or refresh the campaign before approval so it uses the intended copy. Never approve a campaign merely to “see what happens.”

### Replies

In **Outreach → Replies**, start with replies marked respond today or overdue.

- Read the original reply before applying an outcome.
- Use **Reply by email** for a normal response.
- Use **Log outcome** when the response changes the business relationship or next step.
- Use **Mark handled** only when the matter is actually complete.
- Treat unsubscribe and bounce records carefully. A hard bounce or stop request should not be emailed again.

## Orders & Accounts

This section is the staff workflow for applications, customer accounts, online order requests, and invoice/payment history.

### Review a new wholesale application

1. Open **Applications** and select the record.
2. Confirm the business/contact details and required information.
3. Set the appropriate application status and save.
4. When an application is approved, review the generated welcome email and ordering link before sending it.

An approved application sets up the account and ordering link. **Account active** means the welcome email has been sent. Do not send a second welcome unless the record explicitly calls for it.

### Process an online order request

1. Open **Online requests** and select the order.
2. Confirm products, quantities, customer details, requested delivery timing, and notes.
3. Update the order status as work progresses and save.
4. Confirm availability, final pricing, terms, and delivery with the customer outside the order form before treating the order as final.

The public order page creates a request only. It does not approve an order, reserve inventory, charge the customer, or confirm delivery.

### Accounts, invoices, and payments

- Open **Accounts** for the customer’s complete order, invoice, delivery, outreach, and reorder history.
- Link a Badger invoice to the correct Directory account only after confirming the customer and invoice match.
- For a new invoice, use **Create Badger invoice** only after checking every line, price, quantity, and date. Tick the review confirmation before creation.
- If the Hub says an invoice may already exist, check Badger and use **Adopt** when it is the same invoice. Do not create a duplicate.
- Mark a payment only when you have verified where it was received. Use **Undo** promptly if a payment mark was entered in error.

## Sell sheet and product information

- The sell sheet lists active SKUs according to their sell-sheet section. **New** and **Best seller** products appear on the first page and remain listed on page two.
- The order form’s **View sell sheet** link opens the public, no-price sell sheet in a new tab; it does not replace an in-progress order.
- Customer-specific prices are available only through a signed customer sell-sheet link or authorized staff access. Do not forward a customer-specific link unless that is intended.
- The SKU value used for the sell sheet is **Proof**, not ABV. The sell sheet displays proof divided by two: enter `42` proof to display `21% ABV`.

## When something looks wrong

1. Refresh the record and make sure you are viewing the correct business, store, or account.
2. Check the record history and any status/error message.
3. Do not work around an error by creating duplicate products, accounts, orders, invoices, or campaigns.
4. Take a screenshot and send the record name/ID, what you were trying to do, and the exact error to an administrator.

For access problems, ask an administrator to review the **Staff Access** tab. For managing staff access itself, use [Staff Access setup and daily use](staff-access-setup.md).

## Quick reference

| Need | Use |
| --- | --- |
| Count a store’s bottles | Inventory → select Store and Shelf/Back → submit count |
| See total stock | Inventory → Inventory Summary |
| Add a new catalog product | Inventory → Manager Tools → Add New Product |
| Add an existing product to one store | Inventory → Manager Tools → Add Existing SKU |
| Contact a prospect | Outreach → open business → review/save/send email |
| Send a campaign | Outreach → Campaigns → preview → review → approve → send/schedule |
| Work an inbound email | Outreach → Replies |
| Review an application | Orders & Accounts → Applications |
| Review a customer order | Orders & Accounts → Online requests |
| View a customer’s history or invoice status | Orders & Accounts → Accounts |
