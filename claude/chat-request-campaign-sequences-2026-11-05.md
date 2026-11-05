# Chat request: campaign sequences, plus small outreach fixes (2026-11-05)

**Chat: read `PROJECT_STATUS.md` first. Work on `codex/work`. Commit, then push to `codex/work` (`GIT_TERMINAL_PROMPT=0 git push origin codex/work`) so Claude can review the commit on GitHub. "No deploy" means only this: never push to `codex/distribution-system-foundation` (Netlify production), and don't ask Karl to paste Apps Script. If the push fails for authentication, follow `AGENTS.md` step 4. No changes to live sheet data. Update `PROJECT_STATUS.md` in the same commit as each code change. One commit per phase; stop after each phase for Claude's review. Do not add new spreadsheets; new data goes in tabs or columns of existing sheets. Any new value written to a Directory column with a strict dropdown must be added to that dropdown through `repairHubStructure()`, with a test (see Deploy A blocker, `claude/review-a91bb69-2026-10-03.md`).**

Two deploys:
- **Deploy 1 = Part A** (small fixes, Phase 1). Karl hits these daily.
- **Deploy 2 = Part B** (sequences, Phases 2–4).

Design work (card layout, review windows) is chat's call; Karl judges design by chat, not Claude.

---

## Part A — small fixes (Phase 1)

Inventory API is at `2026.11.05.51-APP` (deployed 2026-11-05: Zoho Outbox holds now make a scheduled campaign wait and continue instead of pausing).

**A1. "Closed" result for a business that has shut down.** Peabody's turned out to be closed, not a bad address.
- New outcome **Closed** in the Log outcome / Record result window and in Log contact's outcome list. Status written: **Closed**.
- Closed blocks every email type wherever Bad address / Unsubscribed / Do not contact already block: sales stages, Cocktail list, customer invites, welcome, payment reminders. It also drops the business from campaign targeting, and it must never turn into Lapsed customer or Win-back due.
- Unlike Bad address, Closed is not a to-do. It must not appear in any "fix the email" queue.
- Add Closed to the Directory Status and Outcome dropdowns via `repairHubStructure()`, with the test that compares code constants against the repaired lists.

**A2. The result window can be used while the business details load.** Today `openOutcomeDialogForRecord` (index.html) disables the buttons and notes while `fetchOutreachRecord` runs, then `openOutcomeDialog` clears the notes and date when it returns. Karl waits every time.
- Open the window ready to use with the list record.
- When the full record arrives, swap it in without clearing anything typed or selected.
- Save works before the load finishes, using the list record's `source_row`, `business` and `email`. `apiUpdateOutreachOutcome_` already refuses with "Lead changed in the sheet" if the row no longer matches, so this is safe.

**A3. Campaign card tells the truth about sending.**
- Replace the outdated approved-campaign note ("Send remaining sends one verified recipient at a time…", index.html ~5023). Since `.50`, Send remaining hands the campaign to the background sender: about 20 an hour, and the page can be closed.
- Show the schedule state and `schedule_detail` (waiting until X / paused because Y) at the **top** of the open campaign, not only next to the schedule controls.
- While a campaign is Scheduled or Sending, refresh the open campaign about once a minute. Karl's screen showed "Scheduled 11:24" when the sheet said Paused.

**A4. No schedule labels on finished campaigns.** "second email campaign -- Oshkosh 2" is Complete (89/89) but still shows a red **Schedule paused** from Oct 20. Clear `schedule_status` when a campaign completes, and don't draw schedule badges on Complete campaigns. Also check that the task manager sync doesn't raise a task for it.

**A5. Sent / finished date on every campaign card.** For example, "Sent Oct 6", or "Sent Oct 17 – Oct 29" when the sends span several days. The data is in the recipients' Sent At values and the campaign's Last Batch At. (Part B's sequence card replaces this for sequences; one-step campaigns keep it.)

**A6. Lift a Zoho hold as soon as the Outbox is empty.** The hold is a fixed hour (`OUTREACH_SEND_HOLD_UNTIL`). On 11/5 Zoho released the held email within minutes, and campaign sending still waited until 12:20.
- When a scheduled run finds a hold, ask the mailer for the Outbox count. The mailer already has `outboxHeldCount_`; add a read-only action. If the count is 0, clear the hold and continue.
- Check at most once per run, and only when at least 10 minutes have passed since the hold started.
- An unknown result (-1) keeps the hold.
- This needs a mailer redeploy. Name the project per `AGENTS.md`.

**A7. Duplicate header columns.** The live **Outreach Campaigns** tab has two "Schedule Detail" columns (U is empty; V is used, because `getHeaderMap_` takes the last one). **Outreach Campaign Recipients** has two "Message Stage" columns (Y, Z). Find what added the duplicates, probably `repairHubStructure_` or an append path, and fix it so it can't recur. Then give Karl a one-time step to remove the empty duplicate safely. Don't delete columns from code.

---

## Part B — sequences: one campaign per list, with steps (Phases 2–4)

### Why

Each email in a series is its own campaign today. Appleton is three cards: "Appleton Campaign" (Initial, Sep 25), "Appleton Campaign - Follow-up 1 - Oct. 13" (sent Oct 6) and "appleton -- follow up 2 -- Nov 5". The Audience line ("Follow-up 1 due · recipients of CMP-…") is text frozen at creation, so it still says "due" after the emails went out. Karl: "the list of the same email list multiple times makes it very hard to understand and manage."

The gaps between steps also run long because every step is manual and Karl forgets to come back. Appleton's real gaps were 11 days and a month, against a planned 7 and 7.

### Karl's decisions (2026-11-05)

1. **Every step is approved separately.** The wording may need adjusting for each step, so a sequence is never approved all at once.
2. **The Hub does the remembering.** When a step comes due, the Hub prepares it and puts a review task in Karl's weekly task manager (KWTM), so nothing depends on him remembering to come back.
3. **Old campaigns become part of the new structure.** A sequence started the old way must show that, for example: Initial and Follow-up 1 sent as separate campaigns, Follow-up 2 sent within the sequence.

### Model

- **Sequence** = one audience + ordered steps: Initial → Follow-up 1 (+7 days) → Follow-up 2 (+7 days). After the last step, a business that hasn't replied moves into the existing Nurture lifecycle (90-day check-ins), as now. The default gap comes from Campaign Settings; it can be changed per sequence when it's created.
- **A step is an ordinary campaign** (the existing Outreach Campaigns row, with its frozen recipients, approval token, review, scheduled and paced sending, and reconcile). The sending machinery doesn't change. It has been reviewed and debugged repeatedly; don't rebuild it.
- **Storage (no new spreadsheet):**
  - New tab **Outreach Sequences** in the Distribution Hub spreadsheet: Sequence ID, Name, Audience description, Criteria (JSON, same schema as campaigns), Step plan (JSON: stage and gap days), Status, Created At/By, Finished At, App Version.
  - **Outreach Campaigns** gets two columns: **Sequence ID** and **Step** (1, 2, 3…).
  - **Distribution Directory and Leads** gets **Sequence ID**: the business's active sequence. Per-business progress stays where it already lives: Next Email, Status, Next follow-up. Match by Account ID, not `source_row` (stale `source_row` caused the Oct 17 Appleton bug).
- **One active sequence per business.** Creating a sequence leaves out businesses already in another active sequence, and says so ("12 are in Oshkosh").
- **Dropping out:** any logged outcome or reply, an opt-out, Bad address or Closed takes that business out of the sequence. Existing eligibility rules (`outreachSendEligibility_`, cross-send gap, Do Not Email) keep applying at freeze and at send.
- **Single-email campaign types** (Cocktail list, ordering-link invites, Nurture check-in) remain one-step campaigns and show in the same list.

### How a step comes due (Phase 4)

- A business is **due for step N** when its step N−1 email went out at least the gap days ago and it is still in the sequence. Base this on the Activity Log send date, not the campaign date.
- Once a day, the Hub checks each running sequence. When businesses are due for the next step, it **builds that step's draft campaign** (status Review) for everyone due, with the step's template, and the sequence shows **Needs review**.
- **KWTM task:** reuse `syncTaskManager_`. The existing `hub-cmp-<campaign>-<stage>` "due for next email" task becomes one task per sequence step: "Review and approve Appleton — Follow-up 2 (54 businesses)", linking straight to the draft. It closes when the step is approved. The existing paused / approved-but-unsent campaign tasks still apply to step campaigns.
- Nothing sends without Karl's approval. After approval he uses Send remaining or a send time, the same as now.
- **Stragglers:** a business that becomes due after the step was frozen (it was blocked earlier, or its previous email was delayed) is shown on the sequence as "3 more due for Follow-up 2" with **Add to this step**. That rebuilds or extends the unapproved draft, or creates a small top-up step campaign if the step was already approved. Never auto-add to an approved campaign.

### Sequence card (Phase 3)

One card per sequence, newest activity first. Running and Needs review at the top; Finished collapsed under a "Finished" heading.

> **Appleton** · 57 businesses · ≤10 mi of Appleton · Running
> Initial — 56 sent Sep 25 *(separate campaign)*
> Follow-up 1 — 56 sent Oct 6 *(separate campaign)*
> Follow-up 2 — 1 of 54 sent, sending (about 20 an hour)
> Replies 3 · Interested 1 · Opted out 2 · Closed/bad address 1

- Each step line opens that step's existing review window (edit, approve, send, schedule), so the per-step workflow doesn't change.
- Show live counts from the Directory and Activity Log, never creation-time audience text.
- Status values: **Draft** (Initial not approved), **Running** (a step is sending, or the next step isn't due yet), **Needs review** (a step draft is waiting for approval), **Paused**, **Finished**.
- **Create campaign** becomes **Create sequence**: area/criteria (asked first, as Karl wants), name, gap days, then the Initial step's draft for review.

### Migration (Phase 2): old campaigns become sequences

- `previewSequenceMigration()` writes nothing and returns the proposed grouping: sequence name, steps (old campaign ID, name, stage, sent count, date range), and each business's current step. Claude reviews it against live data before `migrateCampaignsToSequences()` is run. The migration must be idempotent, so running it twice changes nothing.
- **Grouping:** follow `source_campaign_id` chains in campaign Criteria. A sales Initial campaign with no follow-up campaign starts its own sequence.
- **Each business's step comes from the Activity Log** (APP SENT rows by stage and date), not from which campaign it was in. Old campaign labels aren't reliable: one was named "Initial prospect campaign — Oct 6" but held Follow-up 1 sends.
- Imported steps keep their original campaign IDs and names. They show on the card as "(separate campaign)" with their real dates, so it's clear which steps were sent before sequences existed.
- Expected result from live data on 2026-11-05 (verify, don't hard-code):
  - **Appleton:** CMP-DEB6… Initial 9/25 → CMP-EBA6… Follow-up 1 10/6 → CMP-A89A… Follow-up 2 (sending 11/5). Becomes Finished when Follow-up 2 completes.
  - **Oshkosh (≤15 mi, fit ≥3):** CMP-AA50… Initial 10/6 → CMP-93E1… Follow-up 1 ("second email campaign -- Oshkosh 2", 89 sent, finished 10/29). Follow-up 2 is due. **CMP-358C…** ("flawed local campaign", 31, approved, 0 sent, entirely inside CMP-93E1): soft-delete it with the existing delete path, and list it in the preview.
  - **Fond du Lac:** CMP-0331… Initial 10/20. Follow-up 1 is due.
  - **Sep 23 initial:** CMP-8975… (111; 100 sent, 3 blocked). No follow-up campaign was made from it. Show each business's real step from the Activity Log; some may have had follow-ups sent individually.
- Single-email campaigns (Cocktail list, invites) become one-step entries without a sequence.

### Phases and review

- **Phase 2:** server — Sequences tab, columns, `repairHubStructure` additions, migration preview and migrate, sequence read API. Tests: grouping from chains, step-from-Activity-Log, idempotency, one-active-sequence rule, Closed/opt-out dropout.
- **Phase 3:** web — sequence list and card, Create sequence, step lines opening the existing review window, Finished section.
- **Phase 4:** daily step-due check, auto-built step drafts, straggler top-ups, KWTM tasks.
- Claude reviews each phase before the next one starts. Then one Deploy 2: Inventory API, mailer if it changed, then promote `codex/work`, web last.
