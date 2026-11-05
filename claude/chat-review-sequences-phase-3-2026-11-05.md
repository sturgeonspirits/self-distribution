# Chat review: sequences Phase 3 (2026-11-05)

**Chat: read `PROJECT_STATUS.md` first. This is a review, not a build. Read the Phase 3 commit on `codex/work` (Inventory API `.61-APP`, web and staff proxy `.63-WEB`) and write your findings to `claude/chat-review-findings-sequences-phase-3-2026-11-05.md` (severity, file and function, what breaks, suggested fix). Commit and push that file to `codex/work`. Don't change code, don't deploy, and don't touch live sheets.** Claude wrote this while you were out of tokens. After the review, layout polish of the sequence cards is yours if you want it (keep the data and actions as they are).

Live now: `.59` (Phases 2 and 4). The migration ran on 2026-11-05 (4 sequences) and the step check drafted 5 step campaigns, so the live sheets already have the Outreach Sequences tab, Sequence ID / Step on campaigns, and Directory Sequence IDs.

Tests: `node --test tests/*.mjs tests/*.cjs`, 151 pass. New ones are at the end of `tests/sequences.test.mjs` (fake sheets for the writer and the update action).

## What changed

### Server (`apps-script/Code.gs`)

1. **`writeSequencePlan_(plan, actor)`**: the write steps of `migrateCampaignsToSequences()` moved here unchanged, except the Directory pass:
   - an active business gets its sequence;
   - a row a stored sequence lists, but where the business is no longer moving through it, is cleared;
   - a row no sequence lists but still holding a known (stored) Sequence ID is set from its Account ID / email, or cleared;
   - an ID the Hub never wrote is left alone;
   - a missing Sequence ID / Step column now stops with "Run Repair Hub Structure first".
2. **`syncSequences_(actor)`**: the same writes with no deletions, under the script lock. Does nothing until the Sequences tab exists. Returns the plan when nothing new was stored, so the step check doesn't read the sheets twice.
3. **`runSequenceStepCheck(options)`** calls the sync first. A new Initial campaign therefore becomes a sequence at the next daily check (or the next "Build next step"). `options = { sequence_id, actor }`; with no options it behaves as before.
4. **Per-sequence gap**: a stored Gap Days now drives that sequence's due dates in `buildSequencePlan_` (Pass 3), not only the label.
5. **`apiBuildOutreachSequenceStep_`** (POST `buildOutreachSequenceStep`): runs the step check for one sequence and returns a message plus the created campaign. It never approves or sends.
6. **`apiUpdateOutreachSequence_`** (POST `updateOutreachSequence`): name (120 chars) and/or gap (1–90). Writes only those cells and Updated At, under the lock, audited.

### Proxy (`netlify/functions/inventory.js`)

- Both actions are in `STAFF_ACTIONS` and `ACTION_AREAS` (outreach), and not in `GET_READ_ACTIONS`.
- `buildOutreachSequenceStep` is in `SNAPSHOT_ACTIONS`: a single attempt with a 25 s timeout, and the "did not finish, refresh before trying again" message.

### Web (`index.html`)

- Campaigns loads `outreachSequences` after the campaign list, at most every 30 s unless forced. The result is cached per screen.
- Until sequences load, or if they fail or aren't migrated, the list looks exactly as before.
- Once loaded, there is one card per sequence:
  - each step shows its businesses sent, date range and how many are due;
  - each step campaign is a chip that opens the normal review window. Chip states are needs review / N left to send / approved / N sent, plus "separate campaign" for one sent before sequences;
  - badges show due, next due, sending, finished and stopped (stop reasons in the tooltip);
  - buttons: **Build next step** (only when something is due) and **Name and timing** (a new `outreachSequenceDialog`).
- Finished sequences are folded behind a button. Campaigns not in any sequence are listed below under "Other campaigns", with the same card as before (`outreachCampaignCardHtml`).

## What to check

1. **Directory reconciliation.** Can the "known ID, not listed" pass clear a business that is really still active? For example: a member keyed by email on the recipient row whose Directory row has an Account ID, or a business whose only campaign row was deleted. Is the member pass right when `directoryRecordFor` returns the wrong row?
2. **Sync before every check.** Is it safe to store a sequence for an Initial campaign that is still in Review (status Draft)? Its members are "due" for step 1, but the step check skips because the draft exists. After an Initial campaign completes with some recipients never sent, a "— Initial (more)" draft can appear. Is that wanted, or should step 1 never be redrafted?
3. **Time.** On the web path, "Build next step" does sync (full read plus writes), possibly a second plan, then a create. Will it fit in the 25 s proxy window on live data? If not, what should give: skip the sync when nothing is new, or return early and let the task sync do it?
4. **Gap change.** Raising a sequence's gap makes fewer businesses due. Can a draft that is already built end up with businesses the plan no longer counts as due, and does anything break at approval or send?
5. **Web.**
   - Chips use `data-sequence-campaign` inside `#outreachList`'s delegated click handler, ahead of `data-campaign-action`.
   - The list's same-HTML skip (`lastOutreachCampaignsHtml`) now also covers sequence changes.
   - Check phone width (390 px) and the Galaxy Fold (280 px).
   - Is anything in the campaign review window assuming the campaign card is in the list (for example the search/refresh after approve)?
6. **Proxy.** Is `SNAPSHOT_ACTIONS` the right policy for a write that may create a campaign?

## Not in this commit

- What happens to a step draft Karl deletes. Today it's drafted again at the next daily check. Karl hasn't decided between that, snoozing a week, or pausing the sequence.
- Removing a business from a sequence, or ending a sequence by hand.
- The mailer-side Outbox measurement fix (deferred).
