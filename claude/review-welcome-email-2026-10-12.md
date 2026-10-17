# Review handoff: welcome email on approval

Review target: `d8f1af6` (`Approval sets up the customer and drafts a reviewable welcome email with the ordering link`).

Status: **do not deploy yet**. No production systems or Apps Script deployments were changed during this review.

## Required fixes

### P1 — the proxy blocks both new actions

`netlify/functions/inventory.js` adds `previewApplicationWelcome` and
`sendApplicationWelcome` to `STAFF_ACTIONS`, but does not add either action to
`ACTION_AREAS`.

The proxy obtains `area = ACTION_AREAS.get(action)` for every staff request and
returns `STAFF_AREA_FORBIDDEN` when it is absent. Consequently, after approving
an application the browser cannot prepare the welcome-email review, and Send
cannot reach Apps Script.

Add both mappings to the Orders group:

```js
["previewApplicationWelcome", "orders"],
["sendApplicationWelcome", "orders"],
```

## P1 — preserve the real ordering-invite date

`apiUpdateCustomerApplication_` calls `synchronizeApplicationAccount_` for
both `Approved` and `Account active`. That calls `upsertActiveAccountProgram_`,
which unconditionally writes `ordering_invite_date = now`.

The welcome sender correctly writes this field to the actual accepted-send time,
but any later save of the Account active application (for example, a staff-note
edit) overwrites it. The field should remain the time the welcome was sent.

Set `ordering_invite_date` only after a successful welcome send, or have the
synchronization path preserve an existing sent value. Repeated saves should also
avoid rewriting the activation metadata unless an intentional reactivation is
required.

## Verified behavior

- The welcome review UI is wired: Save Approved opens the preview; Not now,
  review, Send, and Send again have event handlers.
- The default copy meets the stated requirements: plain text, Karl Loewenstein
  signature, one-bottle minimum, and Badger payment explanation.
- `sendWelcomeEmail` intentionally bypasses Directory `Do Not Email`, while
  still refusing an invalid, Bad address, Unsubscribed, or Do not contact
  address when it matches the Directory email.
- A recipient differing from the Directory address is supported as requested.
- Reusing `Order online invite` does not interfere with the Initial-stage
  prospect-send guard.
- Header `App version` and `APP_VERSION` both read `2026.10.12.43-APP`.
- The exact revision's Apps Script sources and ESM proxy syntax-check cleanly.

## Remaining verification after the fixes

The feature is not deployed, so no live end-to-end walkthrough was performed.
After fixing the proxy mappings, test in staging:

1. Save an application as Approved and verify the editable review appears.
2. Choose Not now; reopen and verify Review welcome email remains available.
3. Send, verify the returned Zoho message ID, Activity Log entry, application
   send fields, Account active status, and Ordering Invite Date.
4. Reopen and test Send again.
5. Save an Account active application afterward and confirm Ordering Invite
   Date remains the original send time.

Deploy only after those checks, in this order: Outreach mailer, Inventory API,
then Netlify web/proxy.
