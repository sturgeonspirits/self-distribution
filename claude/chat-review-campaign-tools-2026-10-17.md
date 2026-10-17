# Review request: campaign delete/rename, follow-up source fix, Outreach phone rendering (Claude, 2026-10-17)

Chat: read PROJECT_STATUS.md first.

## Round 2: re-check the P2 fix (`campaignSourceRows_`)

Your round-1 result: one P2, no P1; A, B and C confirmed. P2: ambiguous source matching kept the first Directory match.

Fix (commit after `81e3327` on `codex/work`, `apps-script/Code.gs` only plus tests and status):
- For each source recipient, account ID, then email, then business name are tried in turn.
- A key is used only when exactly one Directory row has it. Fallback (email or name) candidates whose non-empty account ID differs from the recipient's are discarded first.
- If a key matches more than one row, the recipient is not resolved by a weaker key. It is reported as "Matches more than one Directory row (fix the duplicate, then preview again)". No match at all gives "No longer found in the Directory".
- `campaignSourceRows_` now returns `{ rows, unmatched }`. `campaignDirectoryStageSelection_` adds the unmatched names to the preview's left-out list and counts them in `source_group_size`.
- Tests cover a duplicate account ID, a duplicate email, a conflicting account on an email match, a business missing from the Directory, and the preview listing them with none of the duplicate rows substituted in.

Please confirm the P2 is closed. Only report anything new at P1/P2.

## Round 1

Range: `5657851..6ac2754` on `codex/work`. Files: `apps-script/Code.gs`, `index.html`, `netlify/functions/inventory.js`, two test files, `PROJECT_STATUS.md`. `node --test tests/*.mjs tests/*.cjs`: 101 pass.

| Part | Commits | Versions | Deploy state |
| --- | --- | --- | --- |
| A. P2 fix from your last review | `36ed1a8` | web `.50` | **Live** (promoted 2026-10-14). Confirm the fix closes your P2. |
| B. Phone fixes | `ca9ae27`, `265187b`, `8ddec4c`, `9bee65d` | web `.51`–`.53` | **Live** (promoted 2026-10-14 at Karl's request; not reviewed). Post-deploy review. |
| C. Delete and rename campaigns | `10078ca` | Apps Script `2026.10.17.47-APP`, web/proxy `2026.10.17.54-WEB` | **Not deployed.** Review before deploy. |
| D. Follow-ups from an earlier campaign | `6ac2754` | same as C | **Not deployed.** Review before deploy. |

Deploy order for C+D: Karl deploys Apps Script `.47` (it also carries the undeployed `.44`–`.46` changes), then Netlify `.54`. With an older Apps Script, `outreachCampaign` returns no `delete_blocker`, so the Delete button stays hidden; Rename would fail with an unknown action.

## A. Campaign load race — `36ed1a8` (live)

Your P2: `loadOutreachCampaigns()` had no request guard. It now takes `outreachCampaignsLoadRequest` IDs like `loadOutreach()` and drops a superseded response or error. The test in `tests/inventory-counts.test.mjs` runs two loads out of order and fails without the guard.

## B. Phone fixes (live)

- `ca9ae27` (`.51`): the `.49` relabel didn't help Karl, because the button sat at the bottom of the bottle list. `.appNav` is no longer hidden in phone count mode, and the toggle hides only the extra count tools.
- `265187b` (`.52`):
  - Today, Businesses and Sent draw 50 cards at a time, with "Show 50 more (N of M shown)". Any change of view, audience, sort or search starts again at 50; search and counts still cover every record. At 900 records the page was ~321,000 px tall and is now ~19,000.
  - `refreshIcons(root)` now converts only `<i data-lucide>` itself, using `lucide.createElement`/`lucide.icons`. Lucide 0.468's `createIcons()` has no root option and re-replaces every icon on the page, because the SVGs keep `data-lucide`. `createIcons()` remains only as a fallback.
- `9bee65d` (`.53`): Campaigns draws the newest 10 (the server already sends newest first) with "Show older campaigns"; leaving the view resets it. Karl has only ~6 campaigns, so this changed nothing for him.
- **Outcome on Karl's Android Chrome:** the glitch persisted after `.53`. With his session on desktop Chrome, the real Campaigns DOM was complete and correct, and Firefox on his phone draws it fine. The glitch is treated as Chrome on that phone and is parked. You don't need to chase it; flag anything in B that is wrong or risky.

Please check B:
- Every `refreshIcons()` caller still gets its icons converted, including dialogs and anything rendered outside `#outreachList`.
- Anything that relied on finding a card that is now past the first 50 (scroll-to-record, deep links, the selection used by bulk actions).

## C. Delete and rename campaigns — `10078ca` (not deployed)

Karl wants to delete campaigns made in error and rename campaigns.

**Delete** (`deleteOutreachCampaign`: POST, outreach area, requires `confirm_delete:true`):
- `campaignDeleteBlocker_` allows deletion only when all of these hold:
  - status is Review or Approved, and `schedule_status` is not Sending;
  - `sent_count` is 0;
  - every recipient is Ready for review, Ready to send or Excluded;
  - no recipient has a Zoho message ID or sent time;
  - no idempotency token has an accepted, non-test SENT row in the activity log (the same rule reopen uses).
- It is a soft delete under the script lock:
  - campaign and recipients are set to `Deleted`, and recipient rows are written in contiguous runs;
  - the approval token is cleared and any schedule is set to Cancelled;
  - rows are kept, and `DELETE_OUTREACH_CAMPAIGN` is audited.
- `apiGetOutreachCampaigns_` leaves Deleted campaigns out. The duplicate-audience check only matches Review/Approved, so the same audience can be created again.
- Every other campaign action already requires Review or Approved: approve, edit, exclude, rebuild, reopen, schedule, the scheduler and send. A deleted campaign therefore can't be used.
- `apiGetOutreachCampaign_` returns `delete_blocker`, computed without the activity-log check, which the delete itself re-runs under the lock. The review window shows "Delete campaign" at the bottom only when `delete_blocker === ""`.

**Rename** (`renameOutreachCampaign`):
- Allowed in any status except Deleted.
- The name goes through `publicText_` (120 characters, formula-safe), only the name cell is written, and `RENAME_OUTREACH_CAMPAIGN` is audited.
- Campaign names never appear in email; they are used only in the list, the review window and the follow-up source picker.
- The review window has a Campaign name box with Save name; Enter also saves.

Please check C:
- Can any path leave a Deleted campaign sendable, or delete one that had a send attempt? Consider the scheduler between batches, a Blocked recipient whose mailer was attempted, and "Sent - needs recording".
- Is there anything else that reads campaign or recipient status and would mishandle `Deleted`? Examples: `campaignSourceRows_` (handled), reconcile, Email Engagement, reply matching.
- The proxy lists and `ACTION_AREAS`, and that both actions are POST-only.

## D. Follow-ups from an earlier campaign — `6ac2754` (not deployed)

Karl tried to send a second email to his Appleton group. The create window reset the filters to 15 mi of the distillery and fit 5, and even widened to 500 mi / fit 3 the preview found 0.

Live data, checked read-only on 2026-10-17, explained it:
- Appleton had already received Follow-up 1 on 2026-10-06, in a campaign misnamed "Initial prospect campaign — Oct 6, 2026".
- **Real bug:** `campaignSourceRows_` used the stored `source_row` values, which had gone stale. The Directory was re-ordered, and all 57 Appleton rows now point at other businesses.
- The send path was safe throughout: `apiSendOutreachCampaignBatch_` blocks when the row's business or email differs from the frozen recipient.

Changes:
- `campaignSourceRows_(campaignId, directoryRecords)` resolves the businesses the source campaign **sent** to by account ID, then email (case-insensitive), then business name, against the current Directory. If the source never sent, it uses its recipients minus Excluded and Deleted.
- **Same-businesses mode:**
  - `use_source_audience` gives `audience_mode:"source"`. Only the stage check and `outreachSendEligibility_` apply; `campaignCriteriaFailures_` returns `[]`, at preview, freeze and send.
  - Center, radius and fit are copied from the source campaign (or distillery/1000/1 for a non-sales source), so `campaignStoredCriteria_` still accepts the criteria and labels still read sensibly.
  - The review subtitle reads "same businesses as …" and skips area warnings.
- **Create window:**
  - Choosing a source ticks "Same businesses as that campaign" (the default) and hides the 8 `data-campaign-filter` fields.
  - Stage moves to the source's next email, and the name becomes "<source> — <stage>" unless one was typed.
  - Unticking shows the filters, prefilled from the source campaign's criteria.
- **Left-out reasons:**
  - `campaignDirectoryStageSelection_` tallies why each candidate was dropped, with up to 8 names per reason: due for a different email (source groups only), sequence complete, not a prospect (source groups only), "Not due yet (due <date>)", other eligibility reasons, criteria failures, duplicate address, over the maximum.
  - The preview returns these as `excluded`/`excluded_names` plus `source_group_size`, and the UI shows them for sales campaigns as it already did for customer invites.
- The preview now calls `campaignDirectoryStageSelection_` directly instead of the `campaignDirectoryInitialRecords_` wrapper. Four pinned structure assertions were updated to the new code, with the same intent.

Please check D:
- Identity matching when a business has a duplicate account ID, a changed email, or two Directory rows with the same name. The first match wins; is that acceptable, or should it refuse?
- Same-businesses mode at send time: confirm `campaignCriteriaFailures_` returning `[]` can't let anyone through who isn't due for the stage (the `next_email === stage` check and send eligibility still run).
- Stored criteria with `audience_mode:"source"` and copied radius/fit: any reader that would misinterpret them, such as the review window, reopen or rebuild.
- Left-out tallies for an Initial campaign over the whole Directory could be large (e.g. many "Recipient email is invalid"). Is the summary line acceptable, or should it be capped?

## Live findings for Karl (no code change)

- Two Follow-up 1 campaigns were approved today from `CMP-AA50FC96`. The 31-recipient "Initial prospect campaign — Oct 17, 2026" sits entirely inside "second email campaign -- Oshkosh 2" (89 recipients, scheduled for 2026-10-20 10:33 CDT). Duplicates are blocked at send by "Outreach stage changed after review".
- The 89 include 3 businesses whose initial came from the 2026-09-24 campaign: Gardina's Restaurant, Jerry's Tavern LLC and Oshkosh Arena.

Report findings at P1/P2 only (P3 only if trivial), with file and line for each.
