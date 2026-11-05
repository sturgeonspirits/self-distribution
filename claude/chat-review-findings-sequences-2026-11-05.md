# Review findings: sequences, sending window, and held-send re-check (2026-11-05)

Scope: read-only review of `965b598`, `c20e456`, `41b2187`, and `ac1e26b`. No live sheets, deployment, or application source were changed.

## P1 — legacy non-sales campaigns can be migrated as sales sequences

- **File/function:** `apps-script/Code.gs`, `sequenceCampaignStage_()` / `sequenceIsStepCampaign_()` (around lines 5187–5199).
- **What breaks:** A historical campaign with no usable `criteria` is treated as `Initial` unless its Audience starts with Follow-up 1, Follow-up 2, Nurture check-in, or Reactivation. Legacy Cocktail list and customer-invite audience labels therefore become sales-sequence roots. Migration can create an inappropriate sequence, assign IDs, and later make daily step drafts for it. The requirement is that Cocktail list and customer invite campaigns always remain single campaigns.
- **Suggested fix:** Detect those legacy audience labels explicitly (including `Cocktail list` and `Current customers · order online invite`) before defaulting to Initial; conservatively classify an unrecognized criteria-less campaign as a single rather than a sales step. Add fixtures for every historical campaign shape.

## P1 — a re-sent step is treated as if it happened at its first send

- **File/function:** `apps-script/Code.gs`, `buildSequencePlan_()` (around lines 5381–5403).
- **What breaks:** `firstSent[step]` retains the earliest Activity/recipient send. `lastSentAt` is then set to that earliest send for the highest completed step. A business that is re-sent Follow-up 1 yesterday after an earlier Follow-up 1 can be drafted for Follow-up 2 from the old date, rather than waiting the configured gap after yesterday's actual delivery.
- **Suggested fix:** Preserve both the first and latest send per step. Use the latest valid send of the highest reached step for `last_sent_at` and `due_at`; retain the first send separately only where the card needs a first-send display. Add a regression fixture for a re-sent Follow-up 1.

## P1 — an Activity row matched only by a shared email advances every matching account

- **File/function:** `apps-script/Code.gs`, `buildSequencePlan_()` send evidence assembly (around lines 5285–5303 and 5383–5393).
- **What breaks:** Activity sends are indexed by email and are appended to the evidence of every sequence member with that email, even when each member has a distinct Account ID. Unlike `directoryRecordFor()`, this path has no uniqueness check. One email-only Activity Log row can mark several businesses as having received a step and suppress or prematurely advance their next draft.
- **Suggested fix:** Prefer Account ID whenever it exists. Only use an email-keyed Activity row when that email maps to exactly one relevant Directory/sequence member (or when the Activity Account ID agrees). Surface ambiguous address-only Activity rows as warnings and add a shared-email fixture.

## P1 — migration can delete a campaign from a stale duplicate plan

- **File/function:** `apps-script/Code.gs`, `migrateCampaignsToSequences()` (around lines 5616–5625).
- **What breaks:** The migration calculates `first.deletions`, then calls the normal delete path for each candidate before acquiring its own migration lock. The delete path rechecks only whether the campaign has sent or been attempted; it does not recheck that its entire current audience is still covered by another same-step campaign. A staff member can edit a Review/Approved draft after planning but before deletion, and the migration can retire that no-longer-duplicate draft.
- **Suggested fix:** Acquire the shared script lock before planning and keep it through deletion and writes, or re-read/recompute and revalidate the exact duplicate condition inside the lock immediately before each delete. Keep the normal no-send deletion safeguards as a second defense.

## P1 — next-window time is one hour wrong across a DST transition

- **File/function:** `apps-script/Code.gs`, `outreachSendWindowState_()` (around lines 7055–7074).
- **What breaks:** It calculates `next_open` by adding local-day minutes to an instant. Across the spring or fall clock change, the offset changes but the arithmetic does not. For example, after the Friday window closes before a spring-forward weekend, Monday 10:00 AM Chicago is returned as 11:00 AM; the corresponding fall case is one hour early. The schedule detail is wrong and the scheduler sends at the wrong local time.
- **Suggested fix:** Construct the candidate calendar date and local start time in `America/Chicago`, then convert that civil time to an instant (with an explicit DST-safe helper). Add spring-forward and fall-back weekend tests.

## P1 — a same-run hold re-check can send after the window has closed

- **File/function:** `apps-script/Code.gs`, `runScheduledCampaign_()` (around lines 7147–7178).
- **What breaks:** The window is checked once in `runScheduledOutreachCampaigns()`. If a batch begins near 2:00 PM, reports held, sleeps 45 seconds, and the forced check clears the hold, `continue` starts another batch without checking the window again. That second email can be sent outside the stated 10 AM–2 PM window.
- **Suggested fix:** Check `outreachSendWindowState_(new Date())` before every batch and again after the 45-second wait. When closed, retain `Sending`, write the normal waiting-for-window detail, and return without another batch. Add a test that crosses the closing boundary during the sleep.

## P2 — sequence draft creation silently loses its sequence linkage if repair was skipped

- **File/function:** `apps-script/Code.gs`, `outreachCampaignSheets_()` and `apiCreateOutreachCampaign_()` (around lines 3562–3577 and 4969–4976).
- **What breaks:** The base campaign sheet headers do not include `Sequence ID` or `Step`; `setCampaign()` silently ignores missing headers. If the structure is incomplete, a campaign created in `sequence` mode is a Review campaign with no sequence linkage. That bypasses the sequence-specific task behavior and can lead to repeat drafts.
- **Suggested fix:** Ensure the sequence headers before creating a sequence-mode campaign, or fail clearly with “run repairHubStructure first.” Do not silently create an unlinked sequence step. Add a missing-header test.

## P2 — a failed daily step check leaves sequence businesses with no task until retry

- **File/function:** `apps-script/Code.gs`, `maybeRunSequenceStepCheck_()`, `runTaskManagerSync()`, and `taskManagerHubItems_()` (around lines 5779–5789, 11404–11410, and 11574–11578).
- **What breaks:** The daily property is marked before the check runs. If plan construction or the task check fails, the hourly sync suppresses the normal Directory “Send …” tasks for rows with a Sequence ID, and no Review task exists because no draft was created. The system retries only the next day, without a visible reminder.
- **Suggested fix:** Create a durable sequence-check failure task/alert, or preserve a fallback sequence group task until a Review draft exists. Record completion only after a successful plan run (while retaining per-action error reporting to avoid an hourly retry storm).

## P2 — deleting a due draft is interpreted as a request to recreate it tomorrow

- **File/function:** `apps-script/Code.gs`, `sequenceStepDraftActions_()` / `runSequenceStepCheck()` (around lines 5735–5777).
- **What breaks:** Once Karl deletes a Review draft, the due businesses remain in the stored sequence, so the next daily check creates the same draft again. That makes it impossible to deliberately defer or dismiss a step without changing source data.
- **Suggested fix:** Decide on a product control before deployment: store a per-sequence-step defer/dismiss marker (with an explicit resume action), or make the deletion UI explain that the draft will recur. The current behavior should be deliberate, not implicit.

## P2 — the sequence read is likely to be slow under the same load that already affects campaign reads

- **File/function:** `apps-script/Code.gs`, `sequenceSourceData_()` / `apiGetOutreachSequences_()` (around lines 5493–5565).
- **What breaks:** Each uncached card-list read makes six separate recipient-column calls, then reads the full Activity Log and full Directory. `buildSequencePlan_()` also builds every member before removing members from all but a selected detail response. This can time out or make Phase 3 cards sluggish as the sheets grow.
- **Suggested fix:** Measure a production-sized read before enabling cards. Cache/version a compact sequence projection; batch or maintain a narrow recipient summary; and build full member lists only for the requested sequence. Emit timing data and add a size-budget test.

## P2 — mailer-side Outbox measurement remains the root cause of repeated false holds

- **File/function:** `docs/reference/distribution-outreach/Code.gs`, `outboxHeldCount_()`; consequential handling in `apps-script/Code.gs`, `runScheduledCampaign_()`.
- **What breaks:** The mailer counts the Outbox about 1.5 seconds after every send, when normal mail is known to still be in transit. The new 45-second forced re-check safely recovers and pacing still caps volume, but it consumes scheduler time and repeatedly creates misleading “held” state. Resetting the hold streak on every quick release is reasonable for these transient reports, but it also means those reports never surface as a warning.
- **Suggested fix:** Prefer a mailer-side measurement that ignores only the just-created/very recent Outbox item or rechecks after a meaningful delay, then return a real hold result. Until then, log transient releases distinctly and monitor their count; do not treat the current immediate count as reliable evidence of a Zoho limit.

## Checks with no finding

- `outreachSequences` is read-only in the Inventory API and is wired through the staff proxy's staff, GET-read, campaign-read, and area allowlists. The editor-only migration and preview have no API route.
- Sequence audience selection applies the existing stage and send-eligibility checks at rebuild and send time. One-off email and manual “Send up to 2” paths do not use the scheduler window; scheduled and Send remaining paths do.
- The forced hold check can continue at most once per `runScheduledCampaign_()` invocation (`verifiedHold`), and the existing shared pacing allowance still limits the second batch.
