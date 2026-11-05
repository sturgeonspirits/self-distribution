# Sequence migration preview — live data, 2026-11-05

Read-only. Built by running `buildSequencePlan_` (Inventory API `.59-APP`) on the live Outreach Campaigns, Outreach Campaign Recipients, Activity Log and Directory sheets (Directory re-read at about 3:20 pm CT, after the Sep 23 cleanup). Nothing was written by the preview. `previewSequenceMigration()` in the Apps Script editor produces the same report once `.59` is deployed; `migrateCampaignsToSequences()` would apply it.

Earlier check against the Directory: for every business still moving through a sequence, the computed next step equals its Next Email column.

Sep 23: Karl ended the 67 prospects outside the area (Next Email set to Complete) on 2026-11-05; the 26 within 15 miles continue (Wendt's on the Lake has since closed).

```
Sequences (4); gap between steps 7 days.

Appleton, Sep 25 [SEQ-DEB6B8A99E494CBD8EE2F1324CB15C83] — 56 businesses — Sending
  Initial: 56 sent Sep 25 — "Appleton Campaign" (Complete, 56 sent)
  Follow-up 1: 56 sent Oct 6 — "Appleton Campaign - Follow-up 1 - Oct. 13" (Complete, 56 sent)
  Follow-up 2: 3 sent Nov 5 — "appleton -- follow up 2 -- Nov 5" (Approved, 3 sent)
  Businesses: sending 35, stopped 18, finished 3
  Stopped: Moved to nurture check-ins 16, Bad address 2

Oshkosh area, Oct 6 [SEQ-AA50FC966AA449B68431585CF4D0D210] — 107 businesses — Next step due
  Initial: 107 sent Oct 6 — "Initial prospect campaign — oshkosh 2. Oct 6, 2026" (Complete, 107 sent)
  Follow-up 1: 86 sent Oct 20–Oct 29 — "second email campaign -- Oshkosh 2" (Complete, 89 sent)
  Businesses: active 96, stopped 11
  Due now: Follow-up 1 due for 12, Follow-up 2 due for 84
  Stopped: Bad address 6, Schedule tasting 2, Visit in person 1, Interested 1, Follow up later 1

First prospects, Sep 23 [SEQ-89758BA7F1B2483F84E59782BEFEAD39] — 100 businesses — Next step due
  Initial: 100 sent Sep 23–Sep 24 — "Initial prospect campaign — Sep 23, 2026" (Complete with blocks, 100 sent)
  Follow-up 1: 4 sent Oct 17–Oct 29
  Businesses: active 25, stopped 75
  Due now: Follow-up 1 due for 21, Follow-up 2 due for 4
  Stopped: Bad address 4, Interested 2, Closed 1, Ended early (Next Email set to Complete) 67, Not interested 1

Fond Du Lac, Oct 20 [SEQ-033141653524489BB11F683A6E72D670] — 54 businesses — Next step due
  Initial: 54 sent Oct 20 — "Initial prospect campaign — Fond du lac" (Complete, 54 sent)
  Businesses: active 44, stopped 10
  Due now: Follow-up 1 due for 44
  Stopped: Bad address 7, Replied 1, Not interested 1, Interested 1

Campaigns to delete (never sent, duplicates):
  "Initial prospect campaign — flawed local campaign. Oct 17, 2026" — Never sent; all 31 of its businesses are in another Follow-up 1 campaign of this sequence.

```

## What the first daily step check would draft (after migration)

Each is a draft campaign in Review; nothing is approved or sent. Each gets a "Review and approve" task in the weekly task manager.

```
create | Oshkosh area, Oct 6 — Follow-up 1 (more) | 12 
create | Oshkosh area, Oct 6 — Follow-up 2 | 84 
create | First prospects, Sep 23 — Follow-up 1 | 21 
create | First prospects, Sep 23 — Follow-up 2 | 4 
create | Fond Du Lac, Oct 20 — Follow-up 1 | 44 
```

Appleton is skipped while its Follow-up 2 is still sending. The final recipient count of each draft is decided by the normal eligibility checks when it is built, so it can be a little lower than the due count.
