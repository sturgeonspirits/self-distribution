# Chat review: sequences Phases 2 and 4, sending window (2026-11-05)

**Chat: read `PROJECT_STATUS.md` first. This is a review, not a build. Read the commits below on `codex/work` and write your findings to `claude/chat-review-findings-sequences-2026-11-05.md` (severity, file and function, what breaks, suggested fix). Commit and push that file to `codex/work`. Don't change code, don't deploy, and don't touch live sheets. Claude wrote these commits while you were out of tokens, so they haven't had a second review.**

## Commits (all on `codex/work`, after Deploy 1 `89304b7`)

| Commit | Version | What |
|---|---|---|
| `965b598` | Inventory API `.54` | A Zoho Outbox hold is re-checked after 4 minutes (was 10). **Deployed 2026-11-05.** |
| `c20e456` | `.55`, staff proxy `.62` | Sequences Phase 2: storage, `outreachSequences` read, editor-only migration |
| `41b2187` | `.56` | Sequences Phase 4: daily step drafts and their KWTM review tasks |
| `ac1e26b` | `.57` | Sending window (10 am–2 pm Mon–Fri) and a same-run re-check of a held send |

`.55`–`.57` are not deployed. Phase 3 (sequence cards, Create sequence, rename) is not built. That's design work for you, after this review. The full design is in `claude/chat-request-campaign-sequences-2026-11-05.md` (Part B). A read-only run of the plan on live data is in `claude/sequence-migration-preview-2026-11-05.md`.

Tests: `node --test tests/*.mjs tests/*.cjs`, 138 pass. The new ones are in `tests/sequences.test.mjs` and at the end of `tests/send-pacing.test.mjs`.

## What to check

### Phase 2 — `buildSequencePlan_`, `sequenceSourceData_`, migration (`c20e456`, `apps-script/Code.gs`)

1. **Grouping.** Step campaigns are grouped by following `criteria.source_campaign_id` to the root, or by a stored Sequence ID. Oldest campaigns with no criteria count as Initial; their Audience text is read for a follow-up stage. Cocktail list, customer invite, Nurture check-in and Reactivation campaigns stay single. Is any live campaign shape misclassified?
2. **One sequence per business.** The owner is the sequence whose campaign sent the business its Initial email (earliest wins), then the first send of any step, then the first listing. Live case: three businesses blocked in the Sep 23 campaign got Follow-up 1 from "second email campaign -- Oshkosh 2". Is the rule right, and is it stable when run again after migration?
3. **Step and state per business.** The step comes from Activity Log SENT rows (not TEST), matched by Account ID or by intended/delivered address, plus Sent recipient rows. The order is: finished (got the last step), then stopped (any outcome, or a status in `SEQUENCE_STOP_STATUSES`, or Do Not Email), then sending (queued in an Approved campaign), then active. Due = last send + gap days (default 7, Campaign Settings "Sequence gap days"). Look for wrong states: a business whose Activity rows have only an email address, a re-sent step, a Directory row matched by email when two rows share it.
4. **Duplicates.** A never-sent Review/Approved campaign whose whole audience is in another campaign of the same step is proposed for deletion. Live: only "flawed local campaign" (CMP-358C, 31). Could a legitimate unsent campaign be flagged?
5. **`migrateCampaignsToSequences()`** (editor-only):
   - deletes duplicates through `apiDeleteOutreachCampaign_` before taking the script lock;
   - then, under the lock, upserts Outreach Sequences rows (keeping an edited name or gap);
   - writes only the Sequence ID and Step columns of Outreach Campaigns;
   - writes only the Directory Sequence ID column: the active sequence, cleared when finished or stopped.

   Check that it's idempotent, that it can't clobber a concurrent row write (the scheduler and outcome saves hold the same lock), that a run partway through is safe, and that the column writes line up when the Directory has blank or reordered rows.
6. **`sequenceSourceData_`** reads six recipient columns one at a time, plus the whole Activity Log and Directory. Is that acceptable for `outreachSequences` on the time-out-prone app? Phase 3 will call it for the card list.
7. **Wiring.** `repairHubStructure()` now runs `ensureSequenceStructure_()`. `outreachSequences` is in `READ_ACTIONS`, the proxy's `STAFF_ACTIONS`, `GET_READ_ACTIONS`, `CAMPAIGN_READ_ACTIONS` and `ACTION_AREAS` (proxy `.62`). Check that the migration and preview are reachable from no API route.

### Phase 4 — daily step drafts (`41b2187`)

8. **New audience mode `"sequence"`.** It's handled in `campaignCriteriaFromRequest_`, `campaignAudienceLabel_`, `campaignCriteriaFailures_` and `campaignDirectoryStageSelection_`. The pool is the Directory rows whose Sequence ID equals the sequence. Stage and `outreachSendEligibility_` checks are unchanged. Check rebuild, reopen, freeze-time re-checks and the send-time validators. Is there anything else that switches on `audience_mode` or `source_campaign_id` and would mishandle `"sequence"`?
9. **`apiCreateOutreachCampaign_`** sets the Sequence ID and Step columns for sequence campaigns. The columns exist only after `repairHubStructure()`. Is `setCampaign` safe if they're missing?
10. **`sequenceStepDraftActions_` / `runSequenceStepCheck()`.** These run once a day from `runTaskManagerSync()` (at or after 6 am; property `SEQUENCE_STEP_CHECK_LAST_DAY`). They only act on stored sequences. They skip a step that has a Review draft or an Approved campaign with recipients still Ready to send, and otherwise create a Review draft named "<sequence> — <stage>", adding "(more)" if that step already sent. Never approve, schedule or send. Concerns:
    - the time budget inside the hourly sync;
    - a draft Karl deletes being recreated the next day;
    - the plan's "due" (Activity Log + gap) disagreeing with the Directory's follow-up date, in which case creation fails with "none eligible" and is retried daily.
11. **Task sync:**
    - a Review campaign with a Sequence ID gets an immediate "Review and approve '<name>' (N businesses)" task;
    - Directory rows with a Sequence ID get no "Send <stage> …" group task.

    Could a sequence member end up with no reminder at all? For example, if the step check failed, or the business is in a sequence that's Finished but its Directory row still has the Sequence ID.

### Sending window and held-send re-check (`ac1e26b`)

12. **`outreachSendWindow_` / `outreachSendWindowState_`.** Hub Configuration `outreach_send_window`, default `10:00-14:00 Mon-Fri`, Chicago time; `off` disables it; an invalid value falls back to the default. `runScheduledOutreachCampaigns()` sends nothing outside the window and writes the "Waiting for the sending window…" detail only when it changes. Check:
    - the DST-day label;
    - a campaign scheduled for a time outside the window;
    - that one-off sends and "Send up to 2" are really unaffected.
13. **Same-run re-check.** After a batch that sent and was reported held, `runScheduledCampaign_` sleeps 45 s (only if the deadline allows) and calls `outreachClearReleasedOutboxHold_(…, { force:true })`. If the hold is cleared, it `continue`s the loop, so a run can send a second batch. Check:
    - this can't loop more than once per run (`verifiedHold`);
    - pacing (`outreachSendAllowance_`) still caps the burst and the hourly total;
    - `force` correctly bypasses the 4-minute delay and the once-per-run guard;
    - the hold-streak reset on release is acceptable. Every send today was reported held and then released, so the three-in-a-row pause never triggers while Zoho releases mail.

## Context

- Karl's decisions: each sequence step is approved separately; the Hub does the remembering (drafts plus KWTM tasks); old campaigns become part of sequences; email lands late morning to early afternoon, not around the clock.
- The mailer counts the Outbox 1.5 s after each send (`OUTBOX_CHECK_DELAY_MS` in `docs/reference/distribution-outreach/Code.gs`). On 2026-11-05 every Appleton Follow-up 2 send was reported held and went out within about 2 minutes. A mailer-side fix (count only mail older than a minute, or re-count later) was considered and not done. Say if you think it should be.
