# Zoho Outreach Test Setup

Package version: `2026.09.15.5-TEST`

## Staging Resources

- [Staging Distribution Directory and Leads](https://docs.google.com/spreadsheets/d/1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo/edit)
- Complete paste-ready mailer: `Code.gs` in this directory
- Complete manifest reference: `appsscript.json` in this directory
- [Wholesale sell sheet](https://drive.google.com/file/d/10ivypHXE9S30gNwV9HDyDTw3jFy8GjM4/view?usp=sharing)

The staging workbook is already configured with:

- Mode: `TEST`
- Authenticated Zoho mailbox: `karl@sturgeonspirits.com`
- Visible sender alias: `sales@sturgeonspirits.com`
- Test recipient: `karl@sturgeonspirits.com`
- Wholesale sell-sheet link in the Email Editor
- Website footer link in the Email Editor
- Editable footer sender name and title in the Email Editor

## Install The Complete Test Mailer

1. Open the staging workbook linked above.
2. Choose **Extensions > Apps Script**.
3. Open the existing `Code.gs` file.
4. Select all of that file's contents and replace them with the complete
   `Code.gs` from this directory. Do not append code.
5. Save the Apps Script project and reload the spreadsheet.
6. Choose **Sturgeon Outreach TEST > Verify test configuration**.

## Connect Karl's Zoho Mailbox

1. In the Zoho API Console, create or use a Self Client for Karl's Zoho
   account.
2. Generate a short-lived authorization code with scopes
   `ZohoMail.accounts.READ,ZohoMail.messages.CREATE`.
3. In the staging spreadsheet, choose **Sturgeon Outreach TEST > 1. Connect
   Zoho**.
4. Paste the Client ID, Client Secret and short-lived grant code into the three
   prompts. They are stored in staging Apps Script Properties, not the sheet or
   source code.
5. The script verifies that `karl@sturgeonspirits.com` is the authenticated
   mailbox and that `sales@sturgeonspirits.com` is an available sender alias.

## Send One Controlled Test

1. On `Distribution Directory and Leads`, select a prospect row with a
   supplied, published or confirmed email.
2. Choose **Sturgeon Outreach TEST > Send test for active row**.
3. The message is personalized from that row but is delivered only to
   `karl@sturgeonspirits.com`.
4. Confirm the From address, subject, formatting, personalization, opt-out text,
   mailing address and sell-sheet link.
5. Confirm an entry appears in `Activity Log` with result `TEST SENT`, a Zoho
   message ID, the prospect under `Intended Recipient`, Karl under `Delivered
   To`, and the current mailer version.

The shared footer website and logo are edited in the pale-yellow `Email
Editor!B15` and `Email Editor!B16` cells. The small logo links to
`https://sturgeonspirits.com/`. No separate text website link is added. The
logo appears in every initial, follow-up and reactivation message without
hardcoding either URL in `Code.gs`.

The footer sender is also editable. `Email Editor!B6` contains the sender name
and `Email Editor!B7` contains the sender title. Karl's defaults are `Karl
Loewenstein` and `President`. Change both fields before sending on behalf of a
different employee. The title may be left blank. This does not change the
authenticated Zoho mailbox or the visible `sales@sturgeonspirits.com` sender
alias.

The selected prospect is not marked as contacted by a test send. This build
cannot send queued or LIVE email.

## Before Any Live Send

The current sell-sheet PDF was verified with an **Anyone with the link can
view** reader permission on 2026-09-15. When the sell sheet changes, replace the
URL in the pale-yellow `Email Editor!B13` cell and keep the new file publicly
viewable. The mailer reads that cell at send time; no `Code.gs` revision is
needed for a sell-sheet update.
