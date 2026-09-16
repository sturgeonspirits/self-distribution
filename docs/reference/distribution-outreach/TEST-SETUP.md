# Distribution Outreach Pilot Setup

Package version: `2026.09.16.6-PILOT`

## Staging Resources

- [Staging Distribution Directory and Leads](https://docs.google.com/spreadsheets/d/1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo/edit)
- Complete paste-ready mailer: `Code.gs` in this directory
- Complete manifest reference: `appsscript.json` in this directory
- [Wholesale sell sheet](https://drive.google.com/file/d/10ivypHXE9S30gNwV9HDyDTw3jFy8GjM4/view?usp=sharing)

The staging workbook is already configured with:

- Starting mode: `TEST`; real delivery requires a confirmed switch to `PILOT`
- Authenticated Zoho mailbox: `karl@sturgeonspirits.com`
- Visible sender alias: `sales@sturgeonspirits.com`
- Karl-only test recipient: `karl@sturgeonspirits.com`
- Three-candidate `Pilot Review` with separate approval and send-status fields
- Wholesale sell-sheet link in the Email Editor
- Website footer link in the Email Editor
- Editable footer sender name and title in the Email Editor
- Optional public customer-application URL in Campaign Settings

## Install The Complete Test Mailer

1. Open the staging workbook linked above.
2. Choose **Extensions > Apps Script**.
3. Open the existing `Code.gs` file.
4. Select all of that file's contents and replace them with the complete
   `Code.gs` from this directory. Do not append code.
5. Save the Apps Script project and reload the spreadsheet.
6. Choose **Distribution Outreach PILOT > Verify pilot configuration**.

## Connect Karl's Zoho Mailbox

1. In the Zoho API Console, create or use a Self Client for Karl's Zoho
   account.
2. Generate a short-lived authorization code with scopes
   `ZohoMail.accounts.READ,ZohoMail.messages.CREATE`.
3. In the staging spreadsheet, choose **Distribution Outreach PILOT > 1. Connect
   Zoho**.
4. Paste the Client ID, Client Secret and short-lived grant code into the three
   prompts. They are stored in staging Apps Script Properties, not the sheet or
   source code.
5. The script verifies that `karl@sturgeonspirits.com` is the authenticated
   mailbox and that `sales@sturgeonspirits.com` is an available sender alias.

## Send One Controlled Test

1. On `Distribution Directory and Leads`, select a prospect row with a
   supplied, published or confirmed email.
2. Choose **Distribution Outreach PILOT > Send Karl-only test for active lead**.
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
Loewenstein` and `President`. Every template leaves one blank line after the
closing. Change both fields before sending on behalf of a different employee.
The title may be left blank. This does not change the
authenticated Zoho mailbox or the visible `sales@sturgeonspirits.com` sender
alias.

Do not enter a customer-application URL until the Netlify staging page is
publicly reachable and tested. When the setting is blank, initial emails omit
the application link.

The selected prospect is not marked as contacted by a test send. This build
cannot send queued or bulk email.

## Send The Three-Email Pilot

1. Review each candidate on `Pilot Review`. Confirm the business, contact,
   email address and intended message.
2. Change `Pilot Approval` from `Pending review` to `Approved` only for the
   candidate you are ready to contact.
3. Choose **Distribution Outreach PILOT > Enable PILOT mode (real email)** and
   confirm the warning. This enables delivery but sends nothing.
4. Keep the approved candidate's row selected and choose **Send approved pilot
   for selected row**.
5. Read the final dialog, which shows the real business, recipient and subject.
   Choose **Yes** only when they are correct.
6. Confirm `Pilot Review`, the source lead and `Activity Log` all record the
   message ID and send time. Use **Disable pilot mode** whenever real delivery
   should be paused.

The pilot allows no more than three successful real sends. It blocks duplicate
recipients, non-prospects, unverified addresses, prior-contact rows, do-not-email
records and any row that cannot be matched uniquely to its source lead. If the
lead sheet is sorted, the script re-resolves the current row by exact business
and email before sending.

If Zoho accepts an email but a later sheet update fails, `Send Status` becomes
`SENT - REVIEW` with **DO NOT RESEND** in the notes and the Zoho message ID is
preserved.

The source lead uses the existing validated `Sent` status after a successful
pilot delivery. Pilot-specific details remain in `Pilot Review` and `Activity
Log`.

## Before Each Pilot Send

The current sell-sheet PDF was verified with an **Anyone with the link can
view** reader permission on 2026-09-15. When the sell sheet changes, replace the
URL in the pale-yellow `Email Editor!B13` cell and keep the new file publicly
viewable. The mailer reads that cell at send time; no `Code.gs` revision is
needed for a sell-sheet update.
