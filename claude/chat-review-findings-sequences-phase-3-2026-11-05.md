# Review findings: sequences Phase 3 (2026-11-05)

Scope: read-only review of `3c5b1e7` (Inventory API `.61-APP`, page and staff proxy `.63-WEB`), including its preceding sequence fixes on `codex/work`. No live sheets, deployment, or application source were changed.

## P1 — reconciliation can assign a sequence to every Directory row that shares an address

- **File/function:** `apps-script/Code.gs`, `writeSequencePlan_()` Directory “known ID, not listed” pass (around lines 5779–5814).
- **What breaks:** A recipient with no Account ID is represented in `active_sequence_for` by `email:<address>`. If two Directory rows share that address, `directoryRecordFor()` correctly declines to choose either row, but the later reconciliation pass does not preserve that ambiguity. It tries the account key and then the email key for *each* row, so it writes the same active Sequence ID to both rows. Those businesses can be suppressed from normal follow-up tasks, included in the wrong sequence state, or have one of them silently omitted later by the campaign duplicate-email guard.
- **Suggested fix:** Build `Directory rows by email` in this writer and use email fallback only when it identifies exactly one Directory row and exactly one active member. Prefer an Account ID match; otherwise leave the existing cell unchanged and emit a reconciliation warning for staff. Add a writer fixture with an email-only recipient and two Directory rows sharing its address.

## P1 — increasing Gap Days does not stop an already-built step campaign from sending early

- **File/function:** `apps-script/Code.gs`, `apiUpdateOutreachSequence_()` and the sequence-mode approval/send paths (`apiApproveOutreachCampaign_()` / `apiSendOutreachCampaignBatch_()`).
- **What breaks:** Changing a stored gap correctly changes the next sequence plan, but a Review draft already frozen before the change remains eligible for approval. The approval and freeze-time send validation check the Directory stage and normal eligibility, not whether the business is still due under the sequence's current Gap Days. Raising a gap can therefore show “not due” on the card while the older draft is approved and sends anyway.
- **Suggested fix:** On a gap change, either reopen/rebuild outstanding sequence Review drafts or mark them stale. More defensively, re-evaluate sequence due state at approval and send time for `audience_mode:"sequence"`, excluding/removing recipients that are no longer due and requiring a fresh review checksum when the audience changes. Add a regression test that raises the gap after a draft is created.

## P2 — “Build next step” repeats heavyweight reads and full-column writes inside a 24-second request

- **File/function:** `apps-script/Code.gs`, `syncSequences_()` / `writeSequencePlan_()` / `runSequenceStepCheck()` (around lines 5703–5890); `netlify/functions/inventory.js`, `SNAPSHOT_ACTIONS` policy (lines 77–90 and 313–337).
- **What breaks:** A card action first reads the full campaign, recipient, Activity Log, Directory, and sequence data; even when nothing changes, it writes the existing sequence rows plus full campaign Sequence ID, Step, and Directory Sequence ID columns. If it appended a sequence, it reads the full plan again, then creates a campaign. The proxy actually grants this snapshot request 24 seconds (`SEND_UPSTREAM_TIMEOUT_MS`), not the stated 25. On the time-out-prone app, the write can complete after the browser reports failure, leaving the user unsure whether a draft exists.
- **Suggested fix:** Do not call `setValues` for unchanged ranges; make the single-sequence action first check whether that sequence already has a stored plan and skip the global sync when it does. If a new sequence must be synced, return an explicit “sync started/refresh” outcome or move the sync to the scheduled task. Keep the single-attempt snapshot policy—it is correct for a write that can create a draft—but give it a sequence-specific timeout message and refresh instruction.

## P2 — an incomplete Initial campaign can be automatically redrafted as “Initial (more)”

- **File/function:** `apps-script/Code.gs`, `buildSequencePlan_()` / `sequenceStepDraftActions_()` (around lines 5407–5454 and 5841–5857).
- **What breaks:** A new Initial campaign is stored as a sequence even while it is in Review; that is safe because its existing Review draft blocks a new step. Once that campaign completes with recipients never sent, however, those members remain active at step 1. With no Review or actively sending Initial campaign left, the daily check can create `“<sequence> — Initial (more)”`. This can repeatedly resurface blocked or deliberately omitted initial recipients without an explicit decision to retry them.
- **Suggested fix:** Confirm the desired product rule before release. If the first campaign is authoritative, never auto-draft Initial again; leave unsent recipients visible as a review/reopen task. If retries are intended, create a clearly labeled retry flow that includes only transient failures and requires explicit staff confirmation.

## P2 — a manually deleted unapproved Initial campaign leaves the Directory hidden from normal reminders until the next sync

- **File/function:** `apps-script/Code.gs`, `syncSequences_()` and `taskManagerHubItems_()` sequence suppression.
- **What breaks:** Sync assigns Directory Sequence IDs as soon as an Initial Review campaign is stored. If staff then delete that unsent campaign, there is no campaign Review task and the normal Directory campaign-group task is suppressed while the IDs remain. The next daily sync clears them, but the due businesses can be silent for nearly a day.
- **Suggested fix:** Clear sequence membership during campaign deletion when its sequence has no other active campaign, or have task sync retain a fallback “Initial campaign was deleted” task until reconciliation has run. Add a deletion-to-task-sync regression test.

## Checks with no finding

- The delegated chip handler runs before normal campaign actions and opens the existing campaign-review flow by ID; that flow does not require the original campaign card to remain in the list.
- The rendered HTML contains sequence state, so the existing same-HTML skip still redraws when sequence data changes.
- The cards’ 92px/remaining-column step grid, wrapping chips, and two-column actions at narrow widths fit the 390px and 280px layouts in source review; no overflow-specific issue found.
- The new actions are staff-scoped, POST-only, and mapped to the Outreach area. A single-attempt snapshot policy is the right retry policy for a potentially campaign-creating write.
