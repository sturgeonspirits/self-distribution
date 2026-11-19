// Inventory API, part 5 of 12: Campaign sequences: multi-step campaigns, sequence cards, building the next step, the sequence step check.
// The parts load in order 01 to 12 (filePushOrder in .clasp.json); version and change notes are in 01-core.gs.

// ---------- Campaign sequences (2026-11-05, Part B Phase 2) ----------
// A sequence is one audience emailed in ordered steps: Initial, then Follow-up 1, then Follow-up 2. Each step is
// still an ordinary campaign (frozen recipients, its own review and approval, paced sending, reconcile), so the
// sending machinery is unchanged; a sequence only groups the step campaigns and tracks where each business is.
// Phase 2 adds the storage (an "Outreach Sequences" tab, Sequence ID / Step columns on Outreach Campaigns, and a
// Sequence ID column on the Directory), a read view, and a one-time migration that folds existing campaigns in.
// Where a business is in its sequence comes from the Activity Log (what was actually sent), never from campaign
// names: one old campaign was named "Initial prospect campaign" but held Follow-up 1 sends.
const OUTREACH_SEQUENCES_SHEET_NAME = "Outreach Sequences";
const OUTREACH_SEQUENCES_HEADERS = [
  "Sequence ID", "Sequence Name", "Audience", "Criteria", "Step Plan", "Gap Days", "Status",
  "Created At", "Created By", "Migrated From", "Finished At", "Updated At", "App Version",
];
const SEQUENCE_ID_HEADER = "Sequence ID";
const SEQUENCE_STEP_HEADER = "Step";
const SEQUENCE_STEP_STAGES = ["Initial", "Follow-up 1", "Follow-up 2"];
const SEQUENCE_DEFAULT_GAP_DAYS = 7;
const SEQUENCE_GAP_DAYS_SETTING = "Sequence gap days"; // Campaign Settings key; 7 when absent.
const SEQUENCE_MIGRATION_ACTOR = "Sequence migration";
// A Directory status that takes a business out of the automated steps. Any logged outcome does too.
const SEQUENCE_STOP_STATUSES = {
  "replied":"Replied", "interested":"Interested", "not interested":"Not interested", "bad address":"Bad address",
  "closed":"Closed", "do not contact":"Do not contact", "needs email":"Needs email", "verify email":"Verify email",
  "send error":"Send error", "existing customer":"Existing customer", "nurture":"Moved to nurture check-ins",
};

function sequenceStepNumber_(stage) {
  return SEQUENCE_STEP_STAGES.indexOf(String(stage || "").trim()) + 1;
}

function sequenceCampaignStage_(campaign) {
  const stage = String(campaign?.criteria?.stage || "").trim();
  if (stage) return stage;
  // The oldest campaigns have no stored criteria. Only an Audience that is plainly a sales stage counts as one;
  // anything else (a Cocktail list, an ordering-link invite, an unknown label) stays a single campaign.
  const audience = String(campaign?.audience || "").trim();
  const match = audience.match(/^(Follow-up 1|Follow-up 2|Nurture check-in|Reactivation)\b/i);
  if (match) return ["Follow-up 1", "Follow-up 2", "Nurture check-in", "Reactivation"].find(item => item.toLowerCase() === match[1].toLowerCase());
  return /^(Eligible initial prospects|Initial prospects)\b/i.test(audience) ? "Initial" : "";
}

function sequenceIsStepCampaign_(campaign) {
  const type = String(campaign?.criteria?.campaign_type || "");
  return !["cocktail_list", "customer_invite"].includes(type) && sequenceStepNumber_(sequenceCampaignStage_(campaign)) > 0;
}

function sequenceIdForRoot_(rootCampaignId) {
  return `SEQ-${String(rootCampaignId || "").replace(/^CMP-/, "")}`;
}

function sequenceMemberKey_(accountId, email) {
  const account = String(accountId || "").trim();
  if (account) return `account:${account}`;
  const address = String(email || "").trim().toLowerCase();
  return address ? `email:${address}` : "";
}

function sequenceStopReason_(record) {
  if (!record) return "Not in the Directory";
  const outcome = String(record.outcome || "").trim();
  if (outcome) return outcome;
  const status = SEQUENCE_STOP_STATUSES[String(record.status || "").trim().toLowerCase()];
  if (status) return status;
  // Next Email "Complete" ends the sales emails for a business (e.g. outside the area we serve).
  if (String(record.next_email || "").trim().toLowerCase() === "complete") return "Ended early (Next Email set to Complete)";
  if (record.do_not_email) return "Do not email";
  return "";
}

// Default name for a sequence that has no saved name: its area and start date, e.g. "Appleton, Sep 25".
function sequenceDefaultName_(root) {
  const center = root?.criteria?.center;
  const area = !center ? "First prospects" : center.type === "distillery" ? "Oshkosh area" : String(center.label || center.zip || "Area").trim();
  const date = outreachDate_(root?.created_at);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return date ? `${area}, ${months[date.getMonth()]} ${date.getDate()}` : area;
}

// A few sheet cells hold a date as a bare number (Sheets serial days, e.g. 46301.51 = Oct 6, 2026), which
// outreachDate_ would read as milliseconds after 1970. Read small numbers as serial days instead.
function sequenceDate_(value) {
  const number = typeof value === "number" ? value : (typeof value === "string" && /^\d{5}(\.\d+)?$/.test(value.trim()) ? Number(value) : NaN);
  if (Number.isFinite(number) && number > 20000 && number < 100000) return new Date(Math.round((number - 25569) * 86400000));
  return outreachDate_(value);
}

function sequenceDateIso_(value) {
  const date = outreachDate_(value);
  return date ? date.toISOString() : "";
}

/**
 * Builds the sequence view and the migration plan from plain data, with no sheet access, so it can be tested and
 * run on exported data. data: { campaigns, recipients, activity, directory, sequences } (see sequenceSourceData_).
 * options: { now: Date, gap_days: number }.
 */
function buildSequencePlan_(data, options) {
  const now = options?.now instanceof Date ? options.now : new Date();
  const gapDays = Number(options?.gap_days) > 0 ? Number(options.gap_days) : SEQUENCE_DEFAULT_GAP_DAYS;
  const endOfToday = new Date(now.getTime()); endOfToday.setHours(23, 59, 59, 999);
  const stored = new Map((data.sequences || []).map(item => [String(item.sequence_id || ""), item]));
  const campaigns = (data.campaigns || []).filter(item => item.campaign_id && item.status !== CAMPAIGN_DELETED_STATUS);
  const byId = new Map(campaigns.map(item => [item.campaign_id, item]));

  const recipientsByCampaign = new Map();
  (data.recipients || []).forEach(item => {
    if (!recipientsByCampaign.has(item.campaign_id)) recipientsByCampaign.set(item.campaign_id, []);
    recipientsByCampaign.get(item.campaign_id).push(item);
  });
  const activeRecipients = campaignId => (recipientsByCampaign.get(campaignId) || [])
    .filter(item => !["Excluded", CAMPAIGN_DELETED_STATUS].includes(String(item.status || "")));

  // Root of a follow-up chain: follow source_campaign_id while the source is a live step campaign.
  const rootOf = campaign => {
    let current = campaign;
    const seen = new Set();
    while (current && !seen.has(current.campaign_id)) {
      seen.add(current.campaign_id);
      const parent = byId.get(String(current.criteria?.source_campaign_id || ""));
      if (!parent || !sequenceIsStepCampaign_(parent)) return current;
      current = parent;
    }
    return current;
  };

  const singles = [];
  const warnings = [];
  const groups = new Map();
  campaigns.forEach(campaign => {
    if (!sequenceIsStepCampaign_(campaign)) {
      singles.push({ campaign_id:campaign.campaign_id, name:campaign.name, status:campaign.status, stage:sequenceCampaignStage_(campaign),
        campaign_type:String(campaign.criteria?.campaign_type || "sales_outreach"), sent_count:Number(campaign.sent_count || 0) });
      return;
    }
    const root = rootOf(campaign);
    const sequenceId = String(campaign.sequence_id || root.sequence_id || sequenceIdForRoot_(root.campaign_id));
    if (!groups.has(sequenceId)) groups.set(sequenceId, { sequence_id:sequenceId, root:root, campaigns:[] });
    groups.get(sequenceId).campaigns.push(campaign);
  });

  // Every real sales-step send, indexed by account and by address.
  const sends = new Map();
  const addSend = (key, step, at) => {
    if (!key || !step) return;
    if (!sends.has(key)) sends.set(key, []);
    sends.get(key).push({ step:step, at:at });
  };
  (data.activity || []).forEach(row => {
    const result = String(row.result || "").toUpperCase();
    if (!result.includes("SENT") || result.includes("TEST")) return;
    const step = sequenceStepNumber_(row.stage);
    if (!step) return;
    const at = sequenceDate_(row.timestamp);
    // A row with an Account ID counts only for that account; an address-only row is matched by address below,
    // and only when that address belongs to a single business.
    if (String(row.account_id || "").trim()) { addSend(`account:${String(row.account_id).trim()}`, step, at); return; }
    new Set([row.intended_recipient, row.delivered_to].map(address => String(address || "").trim().toLowerCase()).filter(Boolean))
      .forEach(email => addSend(`email:${email}`, step, at));
  });
  // Addresses shared by more than one business (by Account ID) in the Directory or the campaign recipients.
  const accountsByEmail = new Map();
  const noteAddress = (email, account) => {
    const address = String(email || "").trim().toLowerCase();
    if (!address) return;
    if (!accountsByEmail.has(address)) accountsByEmail.set(address, new Set());
    accountsByEmail.get(address).add(String(account || "").trim() || `row:${address}`);
  };
  (data.directory || []).forEach(record => noteAddress(record.email, record.account_id));
  (data.recipients || []).forEach(item => noteAddress(item.recipient_email, item.account_id));
  const sharedAddress = email => (accountsByEmail.get(email)?.size || 0) > 1;

  const directoryByAccount = new Map();
  const directoryByEmail = new Map();
  (data.directory || []).forEach(record => {
    const account = String(record.account_id || "").trim();
    const email = String(record.email || "").trim().toLowerCase();
    if (account) directoryByAccount.set(account, (directoryByAccount.get(account) || []).concat([record]));
    if (email) directoryByEmail.set(email, (directoryByEmail.get(email) || []).concat([record]));
  });
  const directoryRecordFor = member => {
    const byAccount = member.account_id ? directoryByAccount.get(member.account_id) || [] : [];
    if (byAccount.length === 1) return byAccount[0];
    const byEmail = member.email ? (directoryByEmail.get(member.email) || []).filter(record => !member.account_id || !record.account_id || record.account_id === member.account_id) : [];
    return byEmail.length === 1 ? byEmail[0] : null;
  };

  const sequences = [];
  const deletions = [];
  const memberSequences = new Map(); // member key -> [{ sequence_id, last_sent_at }] for active members

  // Pass 1: each sequence's steps, and its never-sent duplicate campaigns.
  groups.forEach(group => {
    const steps = SEQUENCE_STEP_STAGES.map((stage, index) => ({ step:index + 1, stage:stage, campaigns:[] }));
    group.campaigns.forEach(campaign => steps[sequenceStepNumber_(sequenceCampaignStage_(campaign)) - 1].campaigns.push(campaign));
    // An unsent campaign whose whole audience is already in another campaign of the same step is a duplicate.
    steps.forEach(step => step.campaigns.forEach(campaign => {
      if (Number(campaign.sent_count || 0) > 0 || !["Review", "Approved"].includes(campaign.status)) return;
      const mine = activeRecipients(campaign.campaign_id).map(item => sequenceMemberKey_(item.account_id, item.recipient_email)).filter(Boolean);
      if (!mine.length) return;
      const others = new Set();
      step.campaigns.filter(other => other !== campaign && !deletions.some(item => item.campaign_id === other.campaign_id))
        .forEach(other => activeRecipients(other.campaign_id).forEach(item => others.add(sequenceMemberKey_(item.account_id, item.recipient_email))));
      if (mine.every(key => others.has(key))) {
        deletions.push({ campaign_id:campaign.campaign_id, name:campaign.name, sequence_id:group.sequence_id, stage:step.stage,
          reason:`Never sent; all ${mine.length} of its businesses are in another ${step.stage} campaign of this sequence.` });
      }
    }));
    group.steps = steps;
  });
  const deleted = new Set(deletions.map(item => item.campaign_id));

  // Pass 2: a business belongs to one sequence. Old follow-up campaigns sometimes included businesses another
  // campaign had introduced, so the owner is the sequence whose campaign sent the business its Initial email
  // (earliest wins), then the one that sent it anything first, then the one that listed it first.
  const owner = new Map();
  const better = (a, b) => (a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1]);
  groups.forEach(group => group.campaigns.filter(campaign => !deleted.has(campaign.campaign_id)).forEach(campaign => {
    const step = sequenceStepNumber_(sequenceCampaignStage_(campaign));
    activeRecipients(campaign.campaign_id).forEach(item => {
      const key = sequenceMemberKey_(item.account_id, item.recipient_email);
      if (!key) return;
      const sentAt = /^sent/i.test(String(item.status || "")) ? sequenceDate_(item.sent_at) : null;
      const listedAt = sequenceDate_(campaign.created_at);
      const rank = [sentAt ? (step === 1 ? 0 : 1) : 2, (sentAt || listedAt || new Date(8.64e15)).getTime()];
      const current = owner.get(key);
      if (!current || better(rank, current.rank)) owner.set(key, { sequence_id:group.sequence_id, rank:rank });
    });
  }));

  // Pass 3: where each business is in the sequence it belongs to.
  groups.forEach(group => {
    const steps = group.steps;
    const saved = stored.get(group.sequence_id);
    // A gap Karl set on this sequence wins over the Campaign Settings default.
    const sequenceGap = Number(saved?.gap_days) > 0 ? Number(saved.gap_days) : gapDays;
    const live = group.campaigns.filter(campaign => !deleted.has(campaign.campaign_id));
    const members = new Map();
    live.forEach(campaign => {
      const step = sequenceStepNumber_(sequenceCampaignStage_(campaign));
      activeRecipients(campaign.campaign_id).forEach(item => {
        const key = sequenceMemberKey_(item.account_id, item.recipient_email);
        if (!key || owner.get(key)?.sequence_id !== group.sequence_id) return;
        const member = members.get(key) || { key:key, account_id:String(item.account_id || "").trim(), email:String(item.recipient_email || "").trim().toLowerCase(),
          business:String(item.business_name || "").trim(), queued_step:0, recipient_sends:[] };
        if (/^sent/i.test(String(item.status || ""))) member.recipient_sends.push({ step:step, at:sequenceDate_(item.sent_at) });
        if (campaign.status === "Approved" && String(item.status || "") === "Ready to send") member.queued_step = Math.max(member.queued_step, step);
        members.set(key, member);
      });
    });

    const memberRows = [];
    members.forEach(member => {
      const record = directoryRecordFor(member);
      const evidence = []
        .concat(member.account_id ? sends.get(`account:${member.account_id}`) || [] : [])
        .concat(member.email && !sharedAddress(member.email) ? sends.get(`email:${member.email}`) || [] : [])
        .concat(member.recipient_sends);
      // First send of each step (shown on the card) and latest send (a re-sent step restarts the gap).
      const firstSent = {};
      const latestSent = {};
      evidence.forEach(item => {
        const first = firstSent[item.step];
        if (first === undefined || (item.at && (!first || item.at.getTime() < first.getTime()))) firstSent[item.step] = item.at || first || null;
        const latest = latestSent[item.step];
        if (latest === undefined || (item.at && (!latest || item.at.getTime() > latest.getTime()))) latestSent[item.step] = item.at || latest || null;
      });
      const reached = Object.keys(firstSent).map(Number).reduce((max, step) => Math.max(max, step), 0);
      const lastSentAt = reached ? latestSent[reached] : null;
      const stop = sequenceStopReason_(record);
      let state;
      // A business that got the last step is finished (the send itself moves it to Nurture), whatever came after.
      if (reached >= SEQUENCE_STEP_STAGES.length) state = "finished";
      else if (stop) state = "stopped";
      else if (member.queued_step > reached) state = "sending";
      else state = "active";
      const dueAt = state === "active" ? (lastSentAt ? new Date(lastSentAt.getTime() + sequenceGap * 86400000) : now) : null;
      const row = {
        key:member.key, account_id:member.account_id, email:member.email, business:member.business || record?.business || "",
        source_row:record?.source_row || 0, directory_sequence_id:String(record?.sequence_id || ""),
        reached_step:reached, sent:Object.keys(firstSent).map(Number).sort().map(step => ({ step:step, at:firstSent[step] ? firstSent[step].toISOString() : "" })),
        state:state, stop_reason:state === "stopped" ? stop : "", next_step:state === "active" || state === "sending" ? reached + 1 : 0,
        due_at:dueAt ? dueAt.toISOString() : "", due:!!dueAt && dueAt.getTime() <= endOfToday.getTime(),
        last_sent_at:lastSentAt ? lastSentAt.toISOString() : "",
      };
      memberRows.push(row);
      if (["active", "sending"].includes(state)) {
        if (!memberSequences.has(member.key)) memberSequences.set(member.key, []);
        memberSequences.get(member.key).push({ sequence_id:group.sequence_id, last_sent_at:row.last_sent_at, business:row.business });
      }
    });

    const migratedFrom = new Set(String(saved?.migrated_from || "").split(/[,\s]+/).filter(Boolean));
    const stepSummaries = steps.map(step => {
      const stepCampaigns = step.campaigns.filter(campaign => !deleted.has(campaign.campaign_id)).map(campaign => {
        const recipients = recipientsByCampaign.get(campaign.campaign_id) || [];
        const sentDates = recipients.filter(item => /^sent/i.test(String(item.status || ""))).map(item => sequenceDate_(item.sent_at)).filter(Boolean).sort((a, b) => a - b);
        const count = status => recipients.filter(item => String(item.status || "") === status).length;
        return {
          campaign_id:campaign.campaign_id, name:campaign.name, status:campaign.status,
          sent_count:Number(campaign.sent_count || 0), recipient_count:Number(campaign.recipient_count || recipients.length),
          ready_to_send:count("Ready to send"), ready_for_review:count("Ready for review"),
          first_sent_at:sentDates.length ? sentDates[0].toISOString() : "", last_sent_at:sentDates.length ? sentDates[sentDates.length - 1].toISOString() : "",
          schedule_status:String(campaign.schedule_status || ""),
          // Sent the old way, as its own campaign, before sequences existed (or not migrated yet).
          separate_campaign:!saved || migratedFrom.has(campaign.campaign_id),
        };
      });
      const memberDates = memberRows.map(row => row.sent.find(item => item.step === step.step)).filter(Boolean).map(item => item.at).filter(Boolean).sort();
      return {
        step:step.step, stage:step.stage, campaigns:stepCampaigns,
        members_sent:memberRows.filter(row => row.sent.some(item => item.step === step.step)).length,
        first_sent_at:memberDates[0] || "", last_sent_at:memberDates[memberDates.length - 1] || "",
      };
    });

    const counts = memberRows.reduce((all, row) => { all[row.state] = (all[row.state] || 0) + 1; return all; }, {});
    const stopReasons = memberRows.filter(row => row.state === "stopped").reduce((all, row) => { all[row.stop_reason] = (all[row.stop_reason] || 0) + 1; return all; }, {});
    const dueRows = memberRows.filter(row => row.state === "active" && row.due);
    const waitingRows = memberRows.filter(row => row.state === "active" && !row.due);
    const dueByStep = dueRows.reduce((all, row) => { all[row.next_step] = (all[row.next_step] || 0) + 1; return all; }, {});
    const nextDue = waitingRows.map(row => row.due_at).sort()[0] || "";
    const allCampaigns = stepSummaries.reduce((all, step) => all.concat(step.campaigns), []);
    let status;
    if (allCampaigns.some(item => item.status === "Approved" && item.ready_to_send > 0)) status = "Sending";
    else if (allCampaigns.some(item => item.status === "Review")) status = stepSummaries[0].campaigns.every(item => item.status === "Review") ? "Draft" : "Needs review";
    else if (dueRows.length) status = "Next step due";
    else if (waitingRows.length || counts.sending) status = "Waiting";
    else status = "Finished";

    const root = group.root;
    sequences.push({
      sequence_id:group.sequence_id,
      name:String(saved?.name || sequenceDefaultName_(root)),
      audience:String(saved?.audience || root.audience || ""),
      criteria:root.criteria || null,
      root_campaign_id:root.campaign_id,
      gap_days:sequenceGap,
      stored:!!saved,
      status:status,
      member_count:memberRows.length,
      counts:counts, stop_reasons:stopReasons,
      due_by_step:dueByStep, next_due_at:nextDue,
      steps:stepSummaries,
      members:memberRows,
      created_at:sequenceDateIso_(saved?.created_at || root.created_at),
      last_activity_at:memberRows.map(row => row.last_sent_at).filter(Boolean).sort().pop() || "",
    });
  });

  // One active sequence per business: keep the sequence it was emailed from most recently.
  const conflicts = [];
  const activeSequenceFor = new Map();
  memberSequences.forEach((entries, key) => {
    const chosen = entries.slice().sort((a, b) => String(b.last_sent_at).localeCompare(String(a.last_sent_at)))[0];
    activeSequenceFor.set(key, chosen.sequence_id);
    if (entries.length > 1) conflicts.push({ key:key, business:chosen.business, sequences:entries.map(item => item.sequence_id), kept:chosen.sequence_id });
  });
  if (conflicts.length) warnings.push(`${conflicts.length} business${conflicts.length === 1 ? " is" : "es are"} still active in more than one sequence; each is kept in the one it was emailed from most recently.`);

  sequences.sort((a, b) => String(b.last_activity_at || b.created_at).localeCompare(String(a.last_activity_at || a.created_at)));
  return { generated_at:now.toISOString(), gap_days:gapDays, sequences:sequences, singles:singles, deletions:deletions,
    conflicts:conflicts, active_sequence_for:Array.from(activeSequenceFor.entries()), warnings:warnings };
}

/** Reads what buildSequencePlan_ needs from the Hub spreadsheet. */
function sequenceSourceData_() {
  const ss = getOutreachSs_();
  const parse = value => { try { const parsed = JSON.parse(String(value || "")); return parsed && typeof parsed === "object" ? parsed : null; } catch (error) { return null; } };
  const sheets = outreachCampaignSheets_();
  const campaigns = getAllRowsAsObjects_(sheets.campaigns).map(row => ({
    campaign_id:String(row.campaign_id || "").trim(), name:String(row.campaign_name || "").trim(), audience:String(row.audience || "").trim(),
    status:String(row.status || "").trim(), created_at:row.created_at || "", sent_count:Number(row.sent_count || 0), recipient_count:Number(row.recipient_count || 0),
    criteria:parse(row.criteria), schedule_status:String(row.schedule_status || "").trim(),
    sequence_id:String(row.sequence_id || "").trim(), step:Number(row.step || 0),
  }));
  // Read only the six recipient columns needed, one column at a time: the full rows carry each email's body and HTML.
  const rh = getHeaderMap_(sheets.recipients);
  const recipientCount = Math.max(0, sheets.recipients.getLastRow() - 1);
  const column = key => (recipientCount && rh[key] !== undefined ? sheets.recipients.getRange(2, rh[key] + 1, recipientCount, 1).getValues().map(row => row[0]) : []);
  const recipientColumns = {};
  ["campaign_id", "account_id", "business_name", "recipient_email", "status", "sent_at"].forEach(key => { recipientColumns[key] = column(key); });
  const recipients = Array.from({ length:recipientCount }, (_, i) => ({
    campaign_id:String(recipientColumns.campaign_id[i] || "").trim(), account_id:String(recipientColumns.account_id[i] || "").trim(),
    business_name:String(recipientColumns.business_name[i] || "").trim(), recipient_email:String(recipientColumns.recipient_email[i] || "").trim().toLowerCase(),
    status:String(recipientColumns.status[i] || "").trim(), sent_at:recipientColumns.sent_at[i] || "",
  })).filter(item => item.campaign_id);
  const activitySheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  const activity = (activitySheet ? getAllRowsAsObjects_(activitySheet) : []).map(row => ({
    timestamp:outreachValue_(row, ["timestamp"]), stage:String(outreachValue_(row, ["message_stage", "stage"]) || "").trim(),
    result:String(outreachValue_(row, ["result"]) || ""), account_id:String(row.account_id || "").trim(),
    intended_recipient:String(outreachValue_(row, ["intended_recipient", "email"]) || "").trim(), delivered_to:String(outreachValue_(row, ["delivered_to"]) || "").trim(),
  }));
  const directory = getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME)).map((row, index) => {
    const record = campaignDirectoryRecord_(row, index + 2);
    return { source_row:record.source_row, account_id:record.account_id, business:record.business, email:record.email,
      status:record.status, outcome:record.outcome, do_not_email:record.do_not_email, next_email:record.next_email,
      sequence_id:String(row.sequence_id || "").trim() };
  });
  const sequenceSheet = ss.getSheetByName(OUTREACH_SEQUENCES_SHEET_NAME);
  const sequences = sequenceSheet ? getAllRowsAsObjects_(sequenceSheet).map(row => ({
    sequence_id:String(row.sequence_id || "").trim(), name:String(row.sequence_name || "").trim(), audience:String(row.audience || "").trim(),
    gap_days:Number(row.gap_days || 0), status:String(row.status || "").trim(), created_at:row.created_at || "",
    migrated_from:String(row.migrated_from || "").trim(),
  })).filter(item => item.sequence_id) : [];
  return { campaigns:campaigns, recipients:recipients, activity:activity, directory:directory, sequences:sequences };
}

function sequenceGapDays_() {
  const value = Number(getOutreachCampaignSettings_()[SEQUENCE_GAP_DAYS_SETTING]);
  return Number.isInteger(value) && value >= 1 && value <= 90 ? value : SEQUENCE_DEFAULT_GAP_DAYS;
}

/** Adds the sequence tab and columns. Safe to run repeatedly (repairHubStructure_ calls it). */
function ensureSequenceStructure_() {
  const sheets = outreachCampaignSheets_();
  ensureHeaderColumns_(sheets.campaigns, [SEQUENCE_ID_HEADER, SEQUENCE_STEP_HEADER]);
  ensureHeaderColumns_(getOutreachSheet_(OUTREACH_SHEET_NAME), [SEQUENCE_ID_HEADER]);
  ensureSheet_(getOutreachSs_(), OUTREACH_SEQUENCES_SHEET_NAME, OUTREACH_SEQUENCES_HEADERS);
  return { sequences_sheet:OUTREACH_SEQUENCES_SHEET_NAME };
}

/** Staff read: sequences with their steps and counts (no per-business lists; those come with one sequence). */
function apiGetOutreachSequences_(p) {
  const wanted = String(p?.sequence_id || "").trim();
  // Cached like the other Hub reads (a send or save bumps the cache version); "refresh" rebuilds it.
  return cachedReadPayload_(`outreach_sequences${wanted ? `:${wanted}` : ""}`, () => outreachSequencesPayload_(wanted), toBool_(p?.refresh));
}

function outreachSequencesPayload_(wanted) {
  const startedAt = Date.now();
  const data = sequenceSourceData_();
  const readMs = Date.now() - startedAt;
  const plan = buildSequencePlan_(data, { now:new Date(), gap_days:sequenceGapDays_() });
  return {
    performance:{ stages:{ read_ms:readMs, build_ms:Date.now() - startedAt - readMs }, rows:{ campaigns:data.campaigns.length, recipients:data.recipients.length, activity:data.activity.length, directory:data.directory.length } },
    migrated:plan.sequences.some(item => item.stored),
    gap_days:plan.gap_days,
    sequences:plan.sequences.map(item => {
      const copy = Object.assign({}, item);
      if (item.sequence_id !== wanted) delete copy.members;
      return copy;
    }),
    singles:plan.singles,
    pending_deletions:plan.deletions,
    conflicts:plan.conflicts,
    warnings:plan.warnings,
  };
}

/** Plain-text summary of a plan, for the Apps Script log and for Karl to check before migrating. */
function sequencePlanText_(plan) {
  const day = value => (value ? Utilities.formatDate(new Date(value), "America/Chicago", "MMM d") : "");
  const lines = [`Sequences (${plan.sequences.length}); gap between steps ${plan.gap_days} days.`];
  plan.sequences.forEach(sequence => {
    lines.push("", `${sequence.name} [${sequence.sequence_id}] — ${sequence.member_count} businesses — ${sequence.status}`);
    sequence.steps.forEach(step => {
      if (!step.campaigns.length && !step.members_sent) return;
      const range = step.first_sent_at ? ` ${day(step.first_sent_at)}${day(step.last_sent_at) !== day(step.first_sent_at) ? `–${day(step.last_sent_at)}` : ""}` : "";
      const names = step.campaigns.map(item => `"${item.name}" (${item.status}, ${item.sent_count} sent)`).join("; ");
      lines.push(`  ${step.stage}: ${step.members_sent} sent${range}${names ? ` — ${names}` : ""}`);
    });
    const counts = Object.keys(sequence.counts).map(key => `${key} ${sequence.counts[key]}`).join(", ");
    lines.push(`  Businesses: ${counts}`);
    const due = Object.keys(sequence.due_by_step).map(step => `${SEQUENCE_STEP_STAGES[step - 1]} due for ${sequence.due_by_step[step]}`).join(", ");
    if (due) lines.push(`  Due now: ${due}`);
    if (sequence.next_due_at) lines.push(`  Next due: ${day(sequence.next_due_at)}`);
    const stops = Object.keys(sequence.stop_reasons).map(key => `${key} ${sequence.stop_reasons[key]}`).join(", ");
    if (stops) lines.push(`  Stopped: ${stops}`);
  });
  if (plan.deletions.length) {
    lines.push("", "Campaigns to delete (never sent, duplicates):");
    plan.deletions.forEach(item => lines.push(`  "${item.name}" — ${item.reason}`));
  }
  if (plan.singles.length) lines.push("", `Single-email campaigns left as they are: ${plan.singles.length}.`);
  if (plan.conflicts.length) {
    lines.push("", "Businesses active in more than one sequence (kept in the most recently emailed one):");
    plan.conflicts.slice(0, 40).forEach(item => lines.push(`  ${item.business || item.key}: ${item.sequences.join(", ")} → ${item.kept}`));
  }
  plan.warnings.forEach(item => lines.push("", `Note: ${item}`));
  return lines.join("\n");
}

/** Run from the Apps Script editor. Writes nothing; logs what migrateCampaignsToSequences() would do. */
function previewSequenceMigration() {
  const plan = buildSequencePlan_(sequenceSourceData_(), { now:new Date(), gap_days:sequenceGapDays_() });
  const text = sequencePlanText_(plan);
  console.log(text);
  return text;
}

/**
 * Run from the Apps Script editor after checking previewSequenceMigration(). Idempotent: running it again changes
 * nothing that is already right. It (1) deletes the never-sent duplicate campaigns through the normal delete path,
 * (2) writes one Outreach Sequences row per sequence (keeping a name or gap Karl has edited), (3) fills Sequence ID
 * and Step on each step campaign, and (4) sets the Directory Sequence ID of each business still moving through a
 * sequence, clearing it for businesses that finished or stopped. No email is sent and no campaign changes status
 * except the deleted duplicates.
 */
function migrateCampaignsToSequences() {
  ensureSequenceStructure_();
  // One lock for the whole migration: the duplicates are worked out and deleted from the same reading of the
  // sheets, so a draft edited in the meantime can't be deleted on the strength of an older plan.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another campaign update is in progress. Run the migration again in a minute.");
  try {
    __HEADER_CACHE.clear();
    const first = buildSequencePlan_(sequenceSourceData_(), { now:new Date(), gap_days:sequenceGapDays_() });
    const deleted = [];
    first.deletions.forEach(item => {
      deleteOutreachCampaignUnderLock_({ campaign_id:item.campaign_id, staff_name:SEQUENCE_MIGRATION_ACTOR, confirm_delete:true });
      deleted.push(item.name);
    });
    __HEADER_CACHE.clear();
    const plan = deleted.length ? buildSequencePlan_(sequenceSourceData_(), { now:new Date(), gap_days:sequenceGapDays_() }) : first;
    const counts = writeSequencePlan_(plan, SEQUENCE_MIGRATION_ACTOR);
    bumpReadCacheVersion_(["outreach"]);
    appendAudit_("MIGRATE_OUTREACH_SEQUENCES", "Sequence", "", "", SEQUENCE_MIGRATION_ACTOR, OUTREACH_SEQUENCES_SHEET_NAME, OUTREACH_CAMPAIGNS_SHEET_NAME, "Migrated",
      `${plan.sequences.length} sequences (${counts.appended} new); ${counts.campaign_cells} campaign cells; ${counts.directory_cells} Directory cells; deleted ${deleted.length}.`.slice(0, 500));
    const summary = `Migrated ${plan.sequences.length} sequences (${counts.appended} new). Deleted ${deleted.length} duplicate campaign${deleted.length === 1 ? "" : "s"}${deleted.length ? `: ${deleted.join(", ")}` : ""}. Updated ${counts.campaign_cells} campaign cells and ${counts.directory_cells} Directory cells.`;
    console.log(summary + (counts.warnings.length ? "\n\nLeft as is:\n" + counts.warnings.join("\n") : "") + "\n\n" + sequencePlanText_(plan));
    return summary;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Keeps the sequence records current without deleting anything: a new Initial campaign becomes a sequence, a new
 * step campaign gets its Sequence ID and Step, and each business's Directory Sequence ID follows where it is. Runs
 * before every step check. Does nothing until migrateCampaignsToSequences() has created the Outreach Sequences tab.
 */
function syncSequences_(actor) {
  if (!getOutreachSs_().getSheetByName(OUTREACH_SEQUENCES_SHEET_NAME)) return { skipped:"Sequences have not been migrated yet." };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another campaign update is in progress. Try again in a minute.");
  try {
    __HEADER_CACHE.clear();
    const plan = buildSequencePlan_(sequenceSourceData_(), { now:new Date(), gap_days:sequenceGapDays_() });
    const counts = writeSequencePlan_(plan, actor || SEQUENCE_STEP_CHECK_ACTOR);
    const changed = !!(counts.appended || counts.sequence_cells || counts.campaign_cells || counts.directory_cells);
    if (changed) bumpReadCacheVersion_(["outreach"]);
    // The plan is current unless this sync just stored a new sequence (its "stored" flag is now out of date).
    return Object.assign({ changed:changed, plan:counts.appended ? null : plan }, counts);
  } finally {
    lock.releaseLock();
  }
}

/** Writes a plan to the Sequences tab, the campaigns' Sequence ID / Step and the Directory. Caller holds the lock. */
function writeSequencePlan_(plan, actor) {
  {  // (block kept so the steps below read as they did inside migrateCampaignsToSequences)
    const stamp = new Date();
    const ss = getOutreachSs_();

    // (2) Sequences tab.
    const sequenceSheet = ss.getSheetByName(OUTREACH_SEQUENCES_SHEET_NAME);
    const sh = getHeaderMap_(sequenceSheet);
    const width = sequenceSheet.getLastColumn();
    const existing = sequenceSheet.getLastRow() < 2 ? [] : sequenceSheet.getRange(2, 1, sequenceSheet.getLastRow() - 1, width).getValues();
    const rowById = new Map(existing.map((values, index) => [String(values[sh.sequence_id] || ""), index]));
    const appended = [];
    const changedRows = new Set();
    let sequenceCells = 0;
    plan.sequences.forEach(sequence => {
      const index = rowById.get(sequence.sequence_id);
      const values = index === undefined ? new Array(width).fill("") : existing[index];
      const sameValue = (a, b) => (a instanceof Date ? a.getTime() : String(a ?? "")) === (b instanceof Date ? b.getTime() : String(b ?? ""));
      const set = (key, value, keepExisting) => {
        if (sh[key] === undefined) return;
        if (keepExisting && String(values[sh[key]] || "") !== "") return;
        if (sameValue(values[sh[key]], value)) return;
        values[sh[key]] = value;
        if (key !== "updated_at" && key !== "app_version") { sequenceCells += 1; if (index !== undefined) changedRows.add(index); }
      };
      set("sequence_id", sequence.sequence_id);
      set("sequence_name", sequence.name, true);
      set("audience", sequence.audience, true);
      set("criteria", sequence.criteria ? JSON.stringify(sequence.criteria) : "", true);
      set("step_plan", JSON.stringify(SEQUENCE_STEP_STAGES.map((stage, i) => ({ step:i + 1, stage:stage }))), true);
      set("gap_days", sequence.gap_days, true);
      set("status", sequence.status);
      set("created_at", sequence.created_at ? new Date(sequence.created_at) : stamp, true);
      set("created_by", actor || SEQUENCE_MIGRATION_ACTOR, true);
      set("migrated_from", sequence.steps.reduce((all, step) => all.concat(step.campaigns.map(item => item.campaign_id)), []).join(", "), true);
      set("finished_at", sequence.status === "Finished" ? stamp : "", true);
      // Updated At moves only when something else in the row changed, so an idle sync writes nothing here.
      if (index === undefined || changedRows.has(index)) { set("updated_at", stamp); set("app_version", APP_VERSION); }
      if (index === undefined) appended.push(values);
    });
    changedRows.forEach(index => sequenceSheet.getRange(index + 2, 1, 1, width).setValues([existing[index]]));
    if (appended.length) sequenceSheet.getRange(sequenceSheet.getLastRow() + 1, 1, appended.length, width).setValues(appended);

    // (3) Sequence ID and Step on the step campaigns. Only these two columns are written.
    const sheets = outreachCampaignSheets_();
    const ch = getHeaderMap_(sheets.campaigns);
    let campaignCells = 0;
    if (ch.sequence_id === undefined || ch.step === undefined) throw new Error("Run Repair Hub Structure first: Outreach Campaigns has no Sequence ID or Step column.");
    if (sheets.campaigns.getLastRow() > 1) {
      const count = sheets.campaigns.getLastRow() - 1;
      const ids = sheets.campaigns.getRange(2, ch.campaign_id + 1, count, 1).getValues();
      const seqRange = sheets.campaigns.getRange(2, ch.sequence_id + 1, count, 1);
      const stepRange = sheets.campaigns.getRange(2, ch.step + 1, count, 1);
      const seqValues = seqRange.getValues();
      const stepValues = stepRange.getValues();
      const target = new Map();
      plan.sequences.forEach(sequence => sequence.steps.forEach(step => step.campaigns.forEach(item => target.set(item.campaign_id, { sequence_id:sequence.sequence_id, step:step.step }))));
      ids.forEach((id, i) => {
        const goal = target.get(String(id[0] || ""));
        if (!goal) return;
        if (String(seqValues[i][0] || "") !== goal.sequence_id) { seqValues[i][0] = goal.sequence_id; campaignCells += 1; }
        if (Number(stepValues[i][0] || 0) !== goal.step) { stepValues[i][0] = goal.step; campaignCells += 1; }
      });
      if (campaignCells) { seqRange.setValues(seqValues); stepRange.setValues(stepValues); }
    }

    // (4) Directory Sequence ID: the one active sequence of each business, blank once it finished or stopped.
    // A Sequence ID left behind by a sequence the business is no longer moving through (it finished, stopped, or
    // its draft was deleted) is cleared; an ID this Hub never wrote (not a known sequence) is left alone.
    const directory = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const dh = getHeaderMap_(directory);
    let directoryCells = 0;
    const warnings = [];
    if (dh.sequence_id === undefined) throw new Error("Run Repair Hub Structure first: the Directory has no Sequence ID column.");
    if (directory.getLastRow() > 1) {
      const count = directory.getLastRow() - 1;
      const range = directory.getRange(2, dh.sequence_id + 1, count, 1);
      const values = range.getValues();
      const accounts = dh.account_id === undefined ? [] : directory.getRange(2, dh.account_id + 1, count, 1).getValues();
      const emails = dh.email === undefined ? [] : directory.getRange(2, dh.email + 1, count, 1).getValues();
      const active = new Map(plan.active_sequence_for);
      const known = new Set(plan.sequences.map(item => item.sequence_id));
      const sequenceSheetNow = ss.getSheetByName(OUTREACH_SEQUENCES_SHEET_NAME);
      if (sequenceSheetNow) getAllRowsAsObjects_(sequenceSheetNow).forEach(row => { if (row.sequence_id) known.add(String(row.sequence_id).trim()); });
      const touched = new Set();
      const setRow = (i, goal) => { touched.add(i); if (String(values[i][0] || "") !== goal) { values[i][0] = goal; directoryCells += 1; } };
      plan.sequences.forEach(sequence => sequence.members.forEach(member => {
        const i = member.source_row - 2;
        if (!member.source_row || i < 0 || i >= values.length) return;
        const goal = active.get(member.key) || "";
        if (goal) setRow(i, goal);
        else if (!touched.has(i) && known.has(String(values[i][0] || ""))) setRow(i, "");
      }));
      // A row no sequence lists but still holding a known Sequence ID (left over from an older plan). An Account ID
      // match decides it. An address decides it only when exactly one Directory row has that address: when two rows
      // share one, an email-only member can't say which business it is, so the cell is left as it is and a warning
      // is returned for staff (the same rule directoryRecordFor uses in the plan).
      const rowsByEmail = new Map();
      emails.forEach((cell, i) => {
        const email = String(cell[0] || "").trim().toLowerCase();
        if (email) rowsByEmail.set(email, (rowsByEmail.get(email) || 0) + 1);
      });
      values.forEach((cell, i) => {
        const current = String(cell[0] || "");
        if (touched.has(i) || !current || !known.has(current)) return;
        const account = accounts[i] ? String(accounts[i][0] || "").trim() : "";
        const email = emails[i] ? String(emails[i][0] || "").trim().toLowerCase() : "";
        const byAccount = account ? active.get(`account:${account}`) : "";
        if (byAccount) return setRow(i, byAccount);
        const byEmail = email ? active.get(`email:${email}`) : "";
        if (byEmail && rowsByEmail.get(email) > 1) {
          warnings.push(`Directory row ${i + 2} shares ${email} with another row; its Sequence ID (${current}) was left as it is. Give the businesses their own addresses or Account IDs.`);
          return;
        }
        setRow(i, byEmail || "");
      });
      if (directoryCells) range.setValues(values);
    }
    return { sequences:plan.sequences.length, appended:appended.length, sequence_cells:sequenceCells, campaign_cells:campaignCells, directory_cells:directoryCells, warnings:warnings };
  }
}

// ---------- Sequence step check (2026-11-05, Part B Phase 4) ----------
// Once a day (from the hourly task-manager sync, at or after 6 am) the Hub looks at each migrated sequence. When
// businesses are due for the next step and that step has no draft waiting and nothing still sending, it builds the
// step's draft campaign (status Review) for them with the normal create path, so the same stage, send-eligibility
// and duplicate checks apply. Nothing is approved or sent: every step still needs Karl's review and approval, and
// the draft gets a "Review and approve" task in his weekly task manager. Businesses that come due after a step was
// already sent get a smaller "(more)" draft of the same step.
const SEQUENCE_STEP_CHECK_LAST_DAY_PROPERTY = "SEQUENCE_STEP_CHECK_LAST_DAY";
// JSON { day, attempts, message } while today's check keeps failing; cleared by a successful check.
const SEQUENCE_STEP_CHECK_ERROR_PROPERTY = "SEQUENCE_STEP_CHECK_ERROR";
const SEQUENCE_STEP_CHECK_MAX_ATTEMPTS = 3; // per day: a failing check is retried at most three hourly syncs.
const SEQUENCE_STEP_CHECK_HOUR = 6;
const SEQUENCE_STEP_CHECK_ACTOR = "Sequence step check";

function sequenceStoredRow_(sequenceId) {
  const sheet = getOutreachSs_().getSheetByName(OUTREACH_SEQUENCES_SHEET_NAME);
  if (!sheet) return null;
  const row = getAllRowsAsObjects_(sheet).find(item => String(item.sequence_id || "").trim() === String(sequenceId || "").trim());
  return row ? { sequence_id:String(row.sequence_id).trim(), name:String(row.sequence_name || "").trim(), gap_days:Number(row.gap_days || 0) } : null;
}

/** Which step drafts to build, from a plan. Pure: tested without sheets. Only migrated (stored) sequences count. */
function sequenceStepDraftActions_(plan, options) {
  // The first Initial campaign is the one Karl chose. The daily check never drafts Initial again for businesses it
  // left unsent (blocked, removed, or never approved); only "Build next step" pressed on the card does (options.allow_initial).
  const allowInitial = !!(options && options.allow_initial);
  const actions = [];
  (plan.sequences || []).filter(sequence => sequence.stored && sequence.status !== "Finished").forEach(sequence => {
    Object.keys(sequence.due_by_step || {}).map(Number).sort((a, b) => a - b).forEach(step => {
      const stage = SEQUENCE_STEP_STAGES[step - 1];
      if (!stage) return;
      if (step === 1 && !allowInitial) return;
      const campaigns = (sequence.steps[step - 1] || {}).campaigns || [];
      const draft = campaigns.find(item => item.status === "Review");
      const sending = campaigns.find(item => item.status === "Approved" && Number(item.ready_to_send || 0) > 0);
      const base = { sequence_id:sequence.sequence_id, sequence_name:sequence.name, step:step, stage:stage, due_count:Number(sequence.due_by_step[step] || 0) };
      if (draft) actions.push(Object.assign(base, { action:"skip", reason:`"${draft.name}" is already waiting for review` }));
      else if (sending) actions.push(Object.assign(base, { action:"skip", reason:`"${sending.name}" is still sending` }));
      else actions.push(Object.assign(base, { action:"create", campaign_name:`${sequence.name} — ${stage}${campaigns.some(item => Number(item.sent_count || 0) > 0) ? " (more)" : ""}`.slice(0, 120) }));
    });
  });
  return actions;
}

/**
 * Builds the due step drafts now. Safe to run from the editor; the hourly task sync runs it once a day. It first
 * syncs the sequences, so an Initial campaign sent since yesterday is a sequence before its follow-up comes due.
 * options.sequence_id limits it to one sequence (the "Build next step" button); options.actor names who asked.
 */
function runSequenceStepCheck(options) {
  const opts = options && typeof options === "object" ? options : {};
  const actor = String(opts.actor || SEQUENCE_STEP_CHECK_ACTOR);
  const sync = opts.skip_sync ? { skipped:"not needed (sequence already stored)" } : syncSequences_(actor);
  const plan = sync.plan || buildSequencePlan_(sequenceSourceData_(), { now:new Date(), gap_days:sequenceGapDays_() });
  const only = String(opts.sequence_id || "").trim();
  const actions = sequenceStepDraftActions_(plan, { allow_initial:!!only }).filter(action => !only || action.sequence_id === only);
  const results = actions.map(action => {
    if (action.action !== "create") return action;
    try {
      const res = apiCreateOutreachCampaign_({ preview_confirmed:true, staff_name:actor, campaign_name:action.campaign_name,
        criteria:{ audience_mode:"sequence", sequence_id:action.sequence_id, stage:action.stage } });
      return Object.assign({}, action, { result:res.already_exists ? "already exists" : "created", campaign_id:res.campaign_id, recipient_count:res.recipient_count });
    } catch (error) {
      // Usually "none eligible": the Directory's follow-up date has not arrived yet. The next daily check retries.
      return Object.assign({}, action, { result:"not created", error:String(error && error.message || error).slice(0, 300) });
    }
  });
  const created = results.filter(item => item.result === "created");
  if (created.length) {
    bumpReadCacheVersion_(["outreach"]);
    appendAudit_("SEQUENCE_STEP_CHECK", "Sequence", only, "", actor, OUTREACH_SEQUENCES_SHEET_NAME, OUTREACH_CAMPAIGNS_SHEET_NAME, "Drafted",
      created.map(item => `${item.campaign_name} (${item.recipient_count})`).join("; ").slice(0, 500));
  }
  const warnings = sync.warnings || [];
  if (warnings.length) appendAudit_("SEQUENCE_SYNC_WARNING", "Sequence", only, "", actor, OUTREACH_SEQUENCES_SHEET_NAME, OUTREACH_SHEET_NAME, "Left as is", warnings.join(" ").slice(0, 500));
  console.log(JSON.stringify({ event:"sequence_step_check", sequence_id:only, synced:sync.skipped ? sync.skipped : { appended:sync.appended, sequence_cells:sync.sequence_cells, campaign_cells:sync.campaign_cells, directory_cells:sync.directory_cells }, warnings:warnings, results:results }));
  return results;
}

/** "Build next step" on a sequence card: drafts whatever step is due for that sequence now, without waiting for 6 am. */
function apiBuildOutreachSequenceStep_(p) {
  requireFields_(p || {}, ["sequence_id", "staff_name"]);
  const sequenceId = String(p.sequence_id || "").trim();
  if (!/^SEQ-[A-Z0-9-]{1,60}$/i.test(sequenceId)) throw new Error("That sequence was not found. Refresh the campaign list.");
  if (!getOutreachSs_().getSheetByName(OUTREACH_SEQUENCES_SHEET_NAME)) throw new Error("Sequences have not been set up yet. Run migrateCampaignsToSequences() in the Inventory API editor first.");
  const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  // A stored sequence needs no sync first (one full read instead of two plus writes, to stay inside the app's
  // request time). A sequence made from a new Initial campaign today is synced first so it is stored before it is checked.
  const results = runSequenceStepCheck({ sequence_id:sequenceId, actor:actor, skip_sync:!!sequenceStoredRow_(sequenceId) });
  const created = results.filter(item => item.result === "created");
  const skipped = results.filter(item => item.action === "skip");
  const failed = results.filter(item => item.result === "not created");
  let message;
  if (created.length) message = `Draft ready for review: ${created.map(item => `"${item.campaign_name}" (${item.recipient_count} business${Number(item.recipient_count) === 1 ? "" : "es"})`).join(", ")}.`;
  else if (skipped.length) message = `Nothing new to build: ${skipped.map(item => item.reason).join("; ")}.`;
  else if (failed.length) message = `No draft was built: ${failed.map(item => item.error).join("; ")}`;
  else message = "No business in this sequence is due for its next step yet.";
  return { message:message, created:created.map(item => ({ campaign_id:item.campaign_id, campaign_name:item.campaign_name, recipient_count:item.recipient_count, stage:item.stage })), results:results };
}

/** Names of a sequence's step campaigns still waiting for review (status Review). */
function sequenceReviewDrafts_(sequenceId) {
  const sheet = outreachCampaignSheets_().campaigns;
  if (sheet.getLastRow() < 2) return [];
  const h = getHeaderMap_(sheet);
  if (h.sequence_id === undefined) return [];
  const count = sheet.getLastRow() - 1;
  const ids = sheet.getRange(2, h.sequence_id + 1, count, 1).getValues();
  const statuses = sheet.getRange(2, h.status + 1, count, 1).getValues();
  const names = sheet.getRange(2, h.campaign_name + 1, count, 1).getValues();
  return ids.map((cell, i) => String(cell[0] || "").trim() === sequenceId && String(statuses[i][0] || "") === "Review" ? String(names[i][0] || "") : null).filter(Boolean);
}

/** Rename a sequence or change its gap between steps. Writes only those cells of its Outreach Sequences row. */
function apiUpdateOutreachSequence_(p) {
  requireFields_(p || {}, ["sequence_id", "staff_name"]);
  const sequenceId = String(p.sequence_id || "").trim();
  const hasName = p.sequence_name !== undefined && p.sequence_name !== null;
  const hasGap = p.gap_days !== undefined && p.gap_days !== null && String(p.gap_days) !== "";
  if (!hasName && !hasGap) throw new Error("Nothing to change.");
  const name = hasName ? publicText_(p.sequence_name, 120, "Sequence name") : "";
  if (hasName && !name) throw new Error("Enter a sequence name.");
  const gap = hasGap ? Number(p.gap_days) : 0;
  if (hasGap && (!Number.isInteger(gap) || gap < 1 || gap > 90)) throw new Error("Days between steps must be a whole number from 1 to 90.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheet = getOutreachSs_().getSheetByName(OUTREACH_SEQUENCES_SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) throw new Error("That sequence was not found. Refresh the campaign list.");
    const h = getHeaderMap_(sheet);
    const ids = sheet.getRange(2, h.sequence_id + 1, sheet.getLastRow() - 1, 1).getValues();
    const index = ids.findIndex(row => String(row[0] || "").trim() === sequenceId);
    if (index < 0) throw new Error("That sequence was not found. Refresh the campaign list.");
    const row = index + 2;
    const changes = [];
    if (hasName) {
      const previous = String(sheet.getRange(row, h.sequence_name + 1).getValue() || "");
      if (previous !== name) { sheet.getRange(row, h.sequence_name + 1).setValue(name); changes.push(`name "${previous}" → "${name}"`); }
    }
    if (hasGap) {
      const previous = Number(sheet.getRange(row, h.gap_days + 1).getValue() || 0);
      // A draft built under the old gap was frozen with the businesses due then. Approving it after the gap went up
      // would send to businesses the sequence now says are not due, so a longer gap waits until the draft is gone.
      if (gap > (previous || sequenceGapDays_())) {
        const waiting = sequenceReviewDrafts_(sequenceId);
        if (waiting.length) throw new Error(`Delete or send "${waiting[0]}" first: it was built with the shorter gap. A shorter gap can be saved any time.`);
      }
      if (previous !== gap) { sheet.getRange(row, h.gap_days + 1).setValue(gap); changes.push(`gap ${previous || "default"} → ${gap} days`); }
    }
    if (!changes.length) return { message:"Nothing changed.", sequence_id:sequenceId };
    if (h.updated_at !== undefined) sheet.getRange(row, h.updated_at + 1).setValue(new Date());
    bumpReadCacheVersion_(["outreach"]);
    appendAudit_("UPDATE_OUTREACH_SEQUENCE", "Sequence", sequenceId, "", authenticatedActor_(p, "Sturgeon Distribution Hub"), OUTREACH_SEQUENCES_SHEET_NAME, OUTREACH_SEQUENCES_SHEET_NAME, "Updated", changes.join("; ").slice(0, 500));
    return { message:"Sequence saved.", sequence_id:sequenceId, sequence_name:hasName ? name : undefined, gap_days:hasGap ? gap : undefined };
  } finally { lock.releaseLock(); }
}

/** Runs runSequenceStepCheck() at most once per day, at or after 6 am Hub time. Called by the hourly task sync. */
function maybeRunSequenceStepCheck_(now) {
  const at = now instanceof Date ? now : new Date();
  const timeZone = Session.getScriptTimeZone() || "America/Chicago";
  if (Number(Utilities.formatDate(at, timeZone, "H")) < SEQUENCE_STEP_CHECK_HOUR) return { ran:false, reason:"before 6 am" };
  const today = Utilities.formatDate(at, timeZone, "yyyy-MM-dd");
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty(SEQUENCE_STEP_CHECK_LAST_DAY_PROPERTY) === today) return { ran:false, reason:"already ran today" };
  let failure = null;
  try { failure = JSON.parse(properties.getProperty(SEQUENCE_STEP_CHECK_ERROR_PROPERTY) || "null"); } catch (error) { failure = null; }
  const attempts = failure && failure.day === today ? Number(failure.attempts || 0) : 0;
  if (attempts >= SEQUENCE_STEP_CHECK_MAX_ATTEMPTS) return { ran:false, reason:"failed three times today" };
  try {
    const results = runSequenceStepCheck();
    // Done for today only once the check itself ran. A step that could not be drafted is in the results and is
    // tried again tomorrow; it does not make the whole check fail.
    properties.setProperty(SEQUENCE_STEP_CHECK_LAST_DAY_PROPERTY, today);
    properties.deleteProperty(SEQUENCE_STEP_CHECK_ERROR_PROPERTY);
    return { ran:true, results:results };
  } catch (error) {
    // The task sync turns this into a task, so sequence businesses are never left with no reminder at all.
    properties.setProperty(SEQUENCE_STEP_CHECK_ERROR_PROPERTY, JSON.stringify({ day:today, attempts:attempts + 1, message:String(error && error.message || error).slice(0, 300) }));
    throw error;
  }
}

/** Today's step-check failure, if it keeps failing, for the task sync. */
function sequenceStepCheckFailure_(now) {
  try {
    const failure = JSON.parse(PropertiesService.getScriptProperties().getProperty(SEQUENCE_STEP_CHECK_ERROR_PROPERTY) || "null");
    const today = Utilities.formatDate(now instanceof Date ? now : new Date(), Session.getScriptTimeZone() || "America/Chicago", "yyyy-MM-dd");
    return failure && failure.day === today ? failure : null;
  } catch (error) { return null; }
}

// Campaign names are internal labels (the list, review window and follow-up source picker); no email uses them,
// so a campaign can be renamed at any stage except after deletion.
function apiRenameOutreachCampaign_(p) {
  requireFields_(p || {}, ["campaign_id", "campaign_name", "staff_name"]);
  const name = publicText_(p.campaign_name, 120, "Campaign name");
  if (!name) throw new Error("Enter a campaign name.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    const ch = campaign.headers;
    if (String(campaign.values[ch.status] || "") === CAMPAIGN_DELETED_STATUS) throw new Error("A deleted campaign cannot be renamed.");
    const previous = String(campaign.values[ch.campaign_name] || "");
    if (previous === name) return { message:"The name is unchanged.", campaign_name:name };
    // Only the name cell is written, so a rename never races other campaign fields.
    sheets.campaigns.getRange(campaign.row, ch.campaign_name + 1).setValue(name);
    appendAudit_("RENAME_OUTREACH_CAMPAIGN", "Campaign", p.campaign_id, "", authenticatedActor_(p, "Sturgeon Distribution Hub"), OUTREACH_CAMPAIGNS_SHEET_NAME, OUTREACH_CAMPAIGNS_SHEET_NAME, "Renamed", `"${previous}" → "${name}"`.slice(0, 500));
    return { message:"Campaign renamed.", campaign_name:name };
  } finally { lock.releaseLock(); }
}

function apiSendOutreachCampaignBatch_(p) {
  requireFields_(p || {}, ["campaign_id", "approval_token", "staff_name"]);
  const requestedSize = Number(p.batch_size || 10);
  if (!Number.isInteger(requestedSize) || requestedSize < 1 || requestedSize > 20) throw new Error("Batch size must be between 1 and 20.");
  // Optional wall-clock stop used by the scheduler so a trigger run never starts a recipient near Apps Script's 6-minute limit.
  const deadlineAt = Number(p.deadline_at || 0);
  const startedAt = Date.now();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error("Another outreach send is in progress. Wait a moment and try again.");
  const lockMs = Date.now() - startedAt;
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    const ch = campaign.headers;
    if (String(campaign.values[ch.status] || "") !== "Approved") throw new Error("Campaign must be approved before delivery.");
    if (String(campaign.values[ch.approval_token] || "") !== String(p.approval_token || "")) throw new Error("Campaign approval is not valid. Refresh and review again.");
    const campaignCriteria = campaignStoredCriteria_(campaign.values[ch.criteria]);
    const campaignStage = String(campaignCriteria?.stage || "Initial");
    const waiting = campaignRecipientRows_(sheets.recipients, p.campaign_id)
      .filter(item => String(item.values[item.headers.status] || "") === "Ready to send");
    if (!waiting.length) return { message:"No campaign recipients are waiting to send.", sent:0, blocked:0, remaining:0, results:[] };
    const allowance = outreachSendAllowance_(Date.now());
    if (!allowance.allowed) {
      return { message:outreachPacingMessage_(allowance), sent:0, blocked:0, remaining:waiting.length, results:[], paced:true, held:allowance.held,
        next_send_at:new Date(allowance.next_at).toISOString() };
    }
    const recipients = waiting.slice(0, Math.min(requestedSize, allowance.allowed));
    const leadSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const leadHeaders = getHeaderMap_(leadSheet);
    const staffName = authenticatedActor_(p, "Sturgeon Distribution Hub");
    const results = []; let sent = 0; let blocked = 0; let heldInOutbox = 0;
    for (const item of recipients) {
      if (deadlineAt && Date.now() > deadlineAt) break;
      if (heldInOutbox) break; // Zoho is holding mail; send nothing more until it is released.
      const rh = item.headers;
      const sourceRow = Number(item.values[rh.source_row] || 0);
      let result = null;
      let mailerAttempted = false;
      const recipientStartedAt = Date.now();
      const timing = { lock_ms:lockMs };
      const recipientName = String(item.values[rh.business_name] || "");
      try {
        if (campaignCriteria?.campaign_type === "customer_invite") {
          const live = liveCustomerInviteRecipient_(sourceRow);
          const record = live.record;
          if (record.business !== recipientName || String(record.email || "").toLowerCase() !== String(item.values[rh.recipient_email] || "").toLowerCase()) throw new Error("Customer or recipient changed after review.");
          if (rh.message_stage !== undefined && String(item.values[rh.message_stage] || "") !== OUTREACH_CUSTOMER_INVITE_STAGE) throw new Error("Frozen recipient type does not match this campaign.");
          const token = String(item.values[rh.idempotency_token] || "");
          const prior = acceptedOutreachSendForToken_(token);
          // A send already accepted for this token is recovered, not blocked as "Invite already sent".
          if (!prior && live.reasons.length) throw new Error(live.reasons.join("; "));
          mailerAttempted = !prior;
          result = prior || callOutreachMailer_({ action:"sendCustomerEmail", idempotency_token:token, account_id:record.account_id,
            source_row:sourceRow, business:record.business, recipient:record.email, message_stage:OUTREACH_CUSTOMER_INVITE_STAGE,
            subject:String(item.values[rh.subject] || ""), html:String(item.values[rh.html] || ""), requested_by:staffName });
          if (!result.accepted || !String(result.message_id || "").trim()) throw new Error("Zoho did not return a verified message ID.");
          const sentAt = result.sent_at ? new Date(result.sent_at) : new Date();
          const acceptedAt = isNaN(sentAt.getTime()) ? new Date() : sentAt;
          outreachNoteRecentSend_(record.email, "sales", acceptedAt);
          customerInviteSentEmails_().add(String(record.email || "").trim().toLowerCase());
          if (record.account_id) customerInviteSentAccounts_().add(String(record.account_id).trim());
          try {
            // The invite carried their own ordering link, so the account is now set up for online ordering.
            upsertActiveAccountProgram_({ account_id:record.account_id, source_row:sourceRow, business:record.business, email:record.email },
              record.ordering_customer_id || "", "order-online invite", staffName, { business:record.business, email:record.email, contact:record.contact, invite_date:acceptedAt });
          } catch (programError) {
            appendAudit_("CUSTOMER_INVITE_PROGRAM_PARTIAL", "Account", record.account_id, record.account_id, staffName, "Distribution Outreach", "Outreach Programs", "Needs recovery", `Invite sent but ordering status not saved: ${String(programError.message || programError)}`);
          }
          item.values[rh.status] = "Sent"; item.values[rh.result_detail] = outreachAcceptedDetail_(result);
          heldInOutbox = Math.max(heldInOutbox, Number(result.held_in_outbox || 0));
          item.values[rh.zoho_message_id] = String(result.message_id); item.values[rh.sent_at] = acceptedAt; item.values[rh.app_version] = APP_VERSION;
          sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
          sent += 1; results.push({ source_row:sourceRow, business:record.business, status:"Sent", message_id:String(result.message_id) });
          continue;
        }
        if (campaignCriteria?.campaign_type === "cocktail_list") {
          const record = liveCocktailListRecipient_(rh.newsletter_contact_id === undefined ? "" : item.values[rh.newsletter_contact_id]);
          if (record.business !== recipientName || record.email.toLowerCase() !== String(item.values[rh.recipient_email] || "").toLowerCase()) throw new Error("Newsletter contact or recipient changed after review.");
          if (rh.message_stage !== undefined && String(item.values[rh.message_stage] || "") !== OUTREACH_COCKTAIL_LIST_STAGE) throw new Error("Frozen recipient type does not match this campaign.");
          const reasons = newsletterCocktailListEligibility_(record);
          if (reasons.length) throw new Error(reasons.join("; "));
          const token = String(item.values[rh.idempotency_token] || "");
          const prior = acceptedOutreachSendForToken_(token);
          mailerAttempted = !prior;
          result = prior || callOutreachMailer_({ action:"sendNewsletterEmail", idempotency_token:token, account_id:record.account_id,
            newsletter_contact_id:record.newsletter_contact_id, business:record.business, recipient:record.email, message_stage:OUTREACH_COCKTAIL_LIST_STAGE,
            subject:String(item.values[rh.subject] || ""), html:String(item.values[rh.html] || ""), requested_by:staffName });
          if (!result.accepted || !String(result.message_id || "").trim()) throw new Error("Zoho did not return a verified message ID.");
          const sentAt = result.sent_at ? new Date(result.sent_at) : new Date();
          const acceptedAt = isNaN(sentAt.getTime()) ? new Date() : sentAt;
          outreachNoteRecentSend_(record.email, "cocktail", acceptedAt);
          item.values[rh.status] = "Sent"; item.values[rh.result_detail] = outreachAcceptedDetail_(result);
          heldInOutbox = Math.max(heldInOutbox, Number(result.held_in_outbox || 0));
          item.values[rh.zoho_message_id] = String(result.message_id); item.values[rh.sent_at] = acceptedAt; item.values[rh.app_version] = APP_VERSION;
          sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
          sent += 1; results.push({ source_row:sourceRow, business:record.business, status:"Sent", message_id:String(result.message_id) });
          continue;
        }
        if (!Number.isInteger(sourceRow) || sourceRow < 2 || sourceRow > leadSheet.getLastRow()) throw new Error("Source lead no longer exists.");
        const raw = leadSheet.getRange(sourceRow, 1, 1, leadSheet.getLastColumn()).getValues()[0];
        const current = {}; Object.keys(leadHeaders).forEach(key => current[key] = raw[leadHeaders[key]]);
        timing.row_read_ms = Date.now() - recipientStartedAt;
        const record = campaignSendLightweightRecord_(current, sourceRow);
        if (record.business !== String(item.values[rh.business_name] || "") || record.email.toLowerCase() !== String(item.values[rh.recipient_email] || "").toLowerCase()) throw new Error("Business or recipient changed after review.");
        if (String(record.next_email || "").trim().toLowerCase() !== campaignStage.toLowerCase()) throw new Error("Outreach stage changed after review.");
        if (rh.message_stage !== undefined && String(item.values[rh.message_stage] || "").trim().toLowerCase() !== campaignStage.toLowerCase()) throw new Error("Frozen recipient stage does not match this campaign.");
        const criteriaFailures = campaignCriteriaFailures_(record, campaignCriteria);
        if (criteriaFailures.length) {
          const status = criteriaFailures.includes("distance") ? "Excluded — out of area"
            : criteriaFailures.includes("fit") ? "Excluded — below fit"
            : "Excluded — no longer matches criteria";
          item.values[rh.status] = status;
          item.values[rh.result_detail] = `Excluded at send time: ${criteriaFailures.join("; ")}.`;
          item.values[rh.app_version] = APP_VERSION;
          sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
          results.push({ source_row:sourceRow, business:record.business, status:status, detail:criteriaFailures.join("; ") });
          continue;
        }
        const token = String(item.values[rh.idempotency_token] || "");
        const prior = acceptedOutreachSendForToken_(token);
        if (campaignStage === "Initial" && !prior && (initialSentActivityForRecipient_(record.email) || initialSentDirectoryEmailElsewhere_(record.email, sourceRow))) {
          throw new Error("An initial email was already sent to this address on another directory row.");
        }
        const reasons = outreachSendEligibility_(record, { skip_legacy_pilot:true });
        if (reasons.length) throw new Error(reasons.join("; "));
        mailerAttempted = !prior;
        result = prior || callOutreachMailer_({ action:"sendAppEmail", idempotency_token:token, account_id:record.account_id,
          source_row:sourceRow, business:record.business, recipient:record.email, message_stage:campaignStage,
          subject:String(item.values[rh.subject] || ""), html:String(item.values[rh.html] || ""), requested_by:staffName });
        timing.mailer_ms = Date.now() - recipientStartedAt - timing.row_read_ms;
        if (!result.accepted || !String(result.message_id || "").trim()) throw new Error("Zoho did not return a verified message ID.");
        const sentAt = result.sent_at ? new Date(result.sent_at) : new Date();
        const acceptedAt = isNaN(sentAt.getTime()) ? new Date() : sentAt;
        outreachNoteRecentSend_(record.email, "sales", acceptedAt);
        finalizeOutreachSend_(leadSheet, sourceRow, record, campaignStage, String(result.message_id), acceptedAt, staffName, token, raw);
        timing.finalize_ms = Date.now() - recipientStartedAt - timing.row_read_ms - timing.mailer_ms;
        item.values[rh.status] = "Sent"; item.values[rh.result_detail] = outreachAcceptedDetail_(result);
          heldInOutbox = Math.max(heldInOutbox, Number(result.held_in_outbox || 0));
        item.values[rh.zoho_message_id] = String(result.message_id); item.values[rh.sent_at] = acceptedAt; item.values[rh.app_version] = APP_VERSION;
        sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
        sent += 1; results.push({ source_row:sourceRow, business:record.business, status:"Sent", message_id:String(result.message_id) });
      } catch (error) {
        if (result?.accepted && String(result.message_id || "").trim()) {
          const acceptedAt = result.sent_at ? new Date(result.sent_at) : new Date();
          item.values[rh.status] = "Sent - needs recording";
          item.values[rh.result_detail] = `Zoho accepted; recording failed: ${String(error.message || error).slice(0, 1500)}`;
          item.values[rh.zoho_message_id] = String(result.message_id);
          item.values[rh.sent_at] = isNaN(acceptedAt.getTime()) ? new Date() : acceptedAt;
          item.values[rh.app_version] = APP_VERSION;
          sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
          appendAudit_("SEND_OUTREACH_EMAIL_PARTIAL", "Campaign recipient", String(item.values[rh.idempotency_token] || ""), String(item.values[rh.account_id] || ""), staffName, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, OUTREACH_SHEET_NAME, "Needs recovery", `Message ${result.message_id}; ${String(error.message || error)}`);
          sent += 1; results.push({ source_row:sourceRow, business:String(item.values[rh.business_name] || ""), status:"Sent - needs recording", message_id:String(result.message_id) });
          continue;
        }
        item.values[rh.status] = "Blocked"; item.values[rh.result_detail] = String(error.message || error).slice(0, 2000); item.values[rh.app_version] = APP_VERSION;
        sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
        blocked += 1; results.push({ source_row:sourceRow, business:String(item.values[rh.business_name] || ""), status:"Blocked", detail:String(error.message || error), mailer_attempted:mailerAttempted });
        if (p.continue_after_block !== true) break; // Manual batches pause for review; the explicit continue run skips uncertain recipients without retrying them.
      } finally {
        timing.total_ms = Date.now() - recipientStartedAt;
        console.log(JSON.stringify({ event:"outreach_campaign_send_timing", campaign_id:p.campaign_id, source_row:sourceRow, business:recipientName, stages:timing }));
      }
    }
    const allRecipientStatuses = campaignRecipientSummaryRows_(sheets.recipients)
      .filter(item => item.campaign_id === String(p.campaign_id));
    const remaining = allRecipientStatuses.filter(item => item.status === "Ready to send").length;
    const needsRecording = allRecipientStatuses.filter(item => item.status === "Sent - needs recording").length;
    const sentTotal = allRecipientStatuses.filter(item => ["Sent", "Sent - needs recording"].includes(item.status)).length;
    const blockedTotal = allRecipientStatuses.filter(item => item.status === "Blocked").length;
    campaign.values[ch.last_batch_at] = new Date(); campaign.values[ch.sent_count] = sentTotal;
    campaign.values[ch.blocked_count] = blockedTotal; campaign.values[ch.app_version] = APP_VERSION;
    if (!remaining) {
      campaign.values[ch.status] = needsRecording ? "Complete with recording warnings" : blockedTotal ? "Complete with blocks" : "Complete";
      // A completed campaign has no active schedule. Clear stale Paused/Scheduled/Sending labels too, so it
      // cannot show a red schedule badge or create a task after all recipients are resolved.
      clearCampaignSchedule_(campaign, "", "");
    }
    sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
    appendAudit_("SEND_OUTREACH_CAMPAIGN_BATCH", "Campaign", p.campaign_id, "", staffName, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, OUTREACH_ACTIVITY_SHEET_NAME, heldInOutbox ? "Held by Zoho" : blocked ? "Stopped for review" : "Completed", `${sent} sent; ${blocked} blocked; ${remaining} remaining.${heldInOutbox ? ` Zoho is holding ${heldInOutbox} in the Outbox.` : ""}`);
    if (heldInOutbox) {
      const holdMessage = `Zoho accepted the last email but is holding ${heldInOutbox} in the Outbox: the account's hourly sending limit was reached. Campaign sending waits an hour; scheduled campaigns and Send remaining then continue on their own.`;
      return { message:holdMessage, sent:sent, blocked:blocked, needs_recording:needsRecording, remaining:remaining, results:results, held:true, held_in_outbox:heldInOutbox };
    }
    return { message:blocked && p.continue_after_block !== true ? "Batch stopped for review after a blocked recipient." : `Batch complete: ${sent} sent; ${blocked} blocked; ${needsRecording} need recording.`, sent:sent, blocked:blocked, needs_recording:needsRecording, remaining:remaining, results:results };
  } finally { lock.releaseLock(); }
}

