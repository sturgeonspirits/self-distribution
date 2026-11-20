// Inventory API, part 12 of 12: Weekly task manager sync.
// The parts load in order 01 to 12 (filePushOrder in .clasp.json); version and change notes are in 01-core.gs.

// ---------- Weekly task manager sync (2026.10.29.49-APP) ----------
// Every hour the Hub writes the work waiting for staff into Karl's weekly task manager ("Karl weekly task
// manager" workbook, Tasks tab), the same tab the Sturgeon Secretary writes email tasks into:
//   - each open reply in Outreach > Replies
//   - each personal follow-up (Interested, Replied, Follow up later) whose date falls in the current week
//   - one task per earlier campaign whose businesses are now due for their next email
//   - campaigns left waiting for review, paused, or approved but never sent
//   - new wholesale applications and online orders, one task per next step
// The Hub is the source of truth. A task closes itself once its item clears in the Hub (reply handled or
// answered in Zoho, outcome logged with a new date, follow-up campaign built, order moved on). The task
// manager is never asked to change the Hub: ticking a task done there only hides it.
// Rows are matched by id, by the task manager's carried-over copies (originTaskId), or by a "Hub key:" line
// in the description, so a task Karl carried into a new week, or a hand-made task given that line, is not
// duplicated. A task Karl reopened after the Hub closed it is left alone. Only rows with a hub- id have their
// title and description refreshed; hand-made rows are only ever closed.
const TASK_MANAGER_SPREADSHEET_ID = "1NQKvTSWvpTZ3uRsYWMUPAdOa_bHvsp_VMpc7EX1c_tI"; // "Karl weekly task manager"
const TASK_MANAGER_TASKS_TAB = "Tasks";
const TASK_MANAGER_SYNC_HANDLER = "runTaskManagerSync";
const TASK_MANAGER_SYNC_LAST_RUN_PROPERTY = "TASK_MANAGER_SYNC_LAST_RUN";
const TASK_MANAGER_SYNC_RUNNING_CACHE_KEY = "task_manager_sync_running";
const TASK_MANAGER_KEY_PREFIX = "hub-";
const TASK_MANAGER_KEY_LABEL = "Hub key: ";
const TASK_MANAGER_CLOSED_LABEL = "Closed by the Hub ";
const TASK_MANAGER_CATEGORY = "sales";
const TASK_MANAGER_HUB_URL = "https://distribution.sturgeonspirits.com/";
const TASK_MANAGER_DIRECTORY_QUALITY_URL = "https://distribution.sturgeonspirits.com/?outreach=directory&audience=directory_quality";
const TASK_MANAGER_TASK_HEADERS = ["id", "title", "category", "description", "dayOfWeek", "completed", "weekId",
  "repeatsWeekly", "repeatPattern", "originTaskId", "deleted", "reminderDate", "assignee", "priority", "shiftHours", "updatedAt"];
// Directory statuses whose next step is a campaign email; one task per source campaign covers them.
const TASK_MANAGER_SEQUENCE_STATUSES = ["sent", "follow-up sent", "reactivation sent", "reactivation due", "nurture"];
// Directory statuses whose next step is a person following up; one task per business.
const TASK_MANAGER_PERSONAL_STATUSES = ["interested", "replied", "follow-up due"];
const TASK_MANAGER_ORDER_STEPS = {
  "New": "review", "Reviewing": "review", "Confirmed": "invoice", "Invoicing": "invoice", "Ready for delivery": "deliver",
};

/** Run once from the Apps Script editor: syncs now, then every hour. */
function installTaskManagerSync() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === TASK_MANAGER_SYNC_HANDLER)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(TASK_MANAGER_SYNC_HANDLER).timeBased().everyHours(1).create();
  const result = syncTaskManager_({});
  return { message:`Task manager sync installed; it runs every hour. First run: ${result.created} created, ${result.updated} updated, ${result.closed} closed (${result.open_items} open Hub items).`, result:result };
}

/** Stops the hourly sync. Tasks already written stay in the task manager. */
function removeTaskManagerSync() {
  let removed = 0;
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === TASK_MANAGER_SYNC_HANDLER)
    .forEach(trigger => { ScriptApp.deleteTrigger(trigger); removed += 1; });
  return { message:`Task manager sync stopped (${removed} trigger${removed === 1 ? "" : "s"} removed).` };
}

function runTaskManagerSync() {
  // Once a day, build drafts for sequence steps that came due, so their review tasks are in this same sync.
  try { maybeRunSequenceStepCheck_(new Date()); }
  catch (error) { console.error(`Sequence step check failed: ${String(error && error.message || error)}`); }
  // Once a week, clear hard-bounced addresses and capture the Directory quality report before task reconciliation.
  try { maybeRunDirectoryQualityCheck_(new Date()); }
  catch (error) { console.error(`Directory quality check failed: ${String(error && error.message || error)}`); }
  try { syncTaskManager_({}); }
  catch (error) { console.error(`Task manager sync failed: ${String(error && error.message || error)}`); }
}

/** Shows what the next sync would write, without writing anything. Safe to run from the editor. */
function previewTaskManagerSync() {
  const result = syncTaskManager_({ dryRun:true });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function taskManagerTimeZone_() {
  return Session.getScriptTimeZone() || "America/Chicago";
}

function taskManagerDateKey_(date, timeZone) {
  return Utilities.formatDate(date, timeZone, "yyyy-MM-dd");
}

/** Monday-based week id and 1–7 day number (Monday = 1), matching the task manager. */
function taskManagerSlot_(date, timeZone) {
  const isoDay = Number(Utilities.formatDate(date, timeZone, "u"));
  const noon = new Date(`${taskManagerDateKey_(date, timeZone)}T12:00:00Z`);
  const monday = new Date(noon.getTime() - (isoDay - 1) * 24 * 60 * 60 * 1000);
  return { weekId:monday.toISOString().slice(0, 10), dayOfWeek:isoDay, dateKey:taskManagerDateKey_(date, timeZone) };
}

/** Sunday of the current week, as a date key. Items dated later wait for their own week. */
function taskManagerWeekEndKey_(now, timeZone) {
  const slot = taskManagerSlot_(now, timeZone);
  const sunday = new Date(new Date(`${slot.weekId}T12:00:00Z`).getTime() + 6 * 24 * 60 * 60 * 1000);
  return sunday.toISOString().slice(0, 10);
}

/** The day a task goes on: its own date when that is today or later this week, otherwise today. */
function taskManagerPlacement_(dueDate, now, timeZone) {
  const today = taskManagerDateKey_(now, timeZone);
  const date = outreachDate_(dueDate);
  if (!date || taskManagerDateKey_(date, timeZone) <= today) return taskManagerSlot_(now, timeZone);
  return taskManagerSlot_(date, timeZone);
}

function taskManagerShortDate_(value, timeZone) {
  const date = outreachDate_(value);
  return date ? Utilities.formatDate(date, timeZone, "MMM d") : "";
}

function taskManagerSlug_(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "none";
}

/** Keeps sheet text from being read as a formula. */
function taskManagerCellText_(value) {
  const text = String(value === undefined || value === null ? "" : value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function taskManagerClip_(value, length) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length - 1).trim()}…` : text;
}

/** The newest dated entry in a Directory note ("2026-10-21 - …", which may run over several lines), else the whole note. */
function taskManagerLastNote_(notes) {
  const lines = String(notes || "").split("\n");
  let start = -1;
  lines.forEach((line, index) => { if (/^\s*\d{4}-\d{2}-\d{2}\s+-\s/.test(line)) start = index; });
  return (start === -1 ? lines : lines.slice(start)).join(" ").replace(/\s+/g, " ").trim();
}

function taskManagerContactLine_(parts) {
  const values = parts.map(value => String(value || "").trim()).filter(Boolean);
  return values.length ? `Contact: ${values.join(" · ")}` : "";
}

function taskManagerDescription_(lines, key) {
  return lines.filter(Boolean).concat([`Hub: ${TASK_MANAGER_HUB_URL}`, `${TASK_MANAGER_KEY_LABEL}${key}`]).join("\n");
}

function taskManagerReplyPriority_(label) {
  if (label === INBOUND_REPLY_PRIORITY_LABELS.today) return "high";
  if (label === INBOUND_REPLY_PRIORITY_LABELS.soon || label === "Review bounce") return "medium";
  return "low";
}

/** Everything open in the Hub that belongs on the task list this week, keyed by a stable Hub key. */
function taskManagerHubItems_(now, timeZone) {
  const items = [];
  const weekEnd = taskManagerWeekEndKey_(now, timeZone);
  const todayKey = taskManagerDateKey_(now, timeZone);

  // Replies waiting in Outreach > Replies.
  rowsWithSource_(getInboundRepliesSheet_(false)).forEach(row => {
    const replyId = String(row.reply_id || "").trim();
    if (!replyId || String(row.status || "").trim() !== "New") return;
    const business = String(row.business || "").trim();
    const fromName = String(row.from_name || "").trim();
    const from = String(row.from || "").trim();
    const category = String(row.category || "").trim();
    const isBounce = category === "Bounce";
    const who = business ? outreachDisplayBusinessName_(business) : (from || fromName || "sales@");
    const title = isBounce
      ? `Hub reply: check the bounce for ${who}`
      : `Reply to ${who}: ${taskManagerClip_(row.summary || row.subject || category || "new reply", 70)}`;
    const key = `${TASK_MANAGER_KEY_PREFIX}reply-${replyId}`;
    const received = taskManagerShortDate_(row.received_at, timeZone);
    items.push({
      key:key, kind:"reply", title:title, priority:taskManagerReplyPriority_(String(row.priority || "").trim()),
      slot:taskManagerPlacement_(row.respond_by || row.received_at, now, timeZone),
      description:taskManagerDescription_([
        `${category || "Reply"}${received ? `, received ${received}` : ""}${row.respond_by ? `; respond by ${taskManagerShortDate_(row.respond_by, timeZone)}` : ""}.`,
        row.summary ? String(row.summary) : (row.reply_text ? `They wrote: ${taskManagerClip_(row.reply_text, 220)}` : `Subject: ${taskManagerClip_(row.subject, 120)}`),
        taskManagerContactLine_([fromName && fromName !== from ? fromName : "", from]),
        "Handle it in Outreach > Replies (answering it in Zoho also closes it). This task closes itself.",
      ], key),
    });
  });

  // Directory: personal follow-ups one by one; campaign follow-ups grouped by the campaign that last emailed them.
  const directory = rowsWithSource_(getOutreachSheet_(OUTREACH_SHEET_NAME));
  // This dry report reads the rows already in memory, so each hourly reconciliation reflects staff fixes immediately.
  const directoryQuality = directoryQualityReportFromRows_(directory);
  const qualityRows = new Set();
  Object.keys(directoryQuality.categories).forEach(name => directoryQuality.categories[name].rows.forEach(item => qualityRows.add(item.row)));
  if (qualityRows.size) {
    const key = `${TASK_MANAGER_KEY_PREFIX}directory-quality-${taskManagerSlot_(now, timeZone).weekId}`;
    const breakdown = Object.keys(directoryQuality.categories)
      .map(name => ({ label:directoryQuality.categories[name].label, count:directoryQuality.categories[name].count }))
      .filter(item => item.count)
      .map(item => `${item.label}: ${item.count}`)
      .join("; ");
    items.push({
      key:key, kind:"directory-quality", summary:true, priority:"high",
      title:`Directory: ${qualityRows.size} lead${qualityRows.size === 1 ? "" : "s"} need fixing`,
      slot:taskManagerSlot_(now, timeZone),
      description:taskManagerDescription_([
        breakdown,
        `Open the quality list: ${TASK_MANAGER_DIRECTORY_QUALITY_URL}`,
        "Outreach > Businesses > Who to show: Missing email or name. This task refreshes as the Directory is fixed and closes when every count is zero.",
      ], key),
    });
  }
  const campaignInfo = taskManagerCampaignInfo_();
  const groups = new Map();
  directory.forEach(row => {
    const businessName = String(outreachValue_(row, ["business", "business_name"]) || "").trim();
    if (!businessName) return;
    const record = {
      business:businessName,
      account_id:String(row.account_id || "").trim(),
      source_row:row.source_row,
      status:String(outreachValue_(row, ["status"]) || "").trim(),
      outcome:String(outreachValue_(row, ["outcome"]) || "").trim(),
      next_follow_up:outreachValue_(row, ["next_follow-up", "next_follow_up"]),
      next_email:String(outreachValue_(row, ["next_email", "stage"]) || "").trim(),
      do_not_email:toBool_(outreachValue_(row, ["do_not_email", "do_not_contact"])),
      contact:String(outreachValue_(row, ["contact", "contact_name", "contact_person", "first_name"]) || "").trim(),
      email:String(outreachValue_(row, ["email", "email_address"]) || "").trim(),
      phone:String(outreachValue_(row, ["phone", "phone_number", "telephone"]) || "").trim(),
      city:String(outreachValue_(row, ["city", "town"]) || "").trim(),
      relationship:String(outreachValue_(row, ["relationship"]) || "").trim(),
      notes:String(outreachValue_(row, ["notes"]) || "").trim(),
    };
    if (isDoNotContact_(record)) return;
    const status = record.status.toLowerCase();
    const followUp = outreachDate_(record.next_follow_up);
    const followUpKey = followUp ? taskManagerDateKey_(followUp, timeZone) : "";

    if (TASK_MANAGER_PERSONAL_STATUSES.includes(status)) {
      if (!followUpKey || followUpKey > weekEnd) return;
      const id = record.account_id || `row${record.source_row}`;
      const key = `${TASK_MANAGER_KEY_PREFIX}fu-${id}-${followUpKey}`;
      const display = outreachDisplayBusinessName_(record.business);
      const lastNote = taskManagerLastNote_(record.notes);
      items.push({
        key:key, kind:"follow-up", priority:status === "interested" ? "high" : "medium",
        title:`Follow up with ${display}${record.outcome ? ` (${record.outcome})` : ""}`,
        slot:taskManagerPlacement_(followUp, now, timeZone),
        description:taskManagerDescription_([
          `Follow-up date ${taskManagerShortDate_(followUp, timeZone)}${followUpKey < todayKey ? " (overdue)" : ""}. Status ${record.status}${record.relationship ? `, ${record.relationship.toLowerCase()}` : ""}${record.city ? `, ${record.city}` : ""}.`,
          lastNote ? `Last note: ${taskManagerClip_(lastNote, 220)}` : "",
          taskManagerContactLine_([record.contact, record.email, record.phone]),
          "Log the result in Outreach > Businesses > Log outcome, with the next date if there is one. This task closes itself.",
        ], key),
      });
      return;
    }

    if (!TASK_MANAGER_SEQUENCE_STATUSES.includes(status)) return;
    // A business in a sequence gets its next step drafted by the daily sequence step check, and the draft gets its
    // own "Review and approve" task, so no separate "Send ..." reminder is made for it.
    if (String(row.sequence_id || "").trim()) return;
    const due = status === "reactivation due" || (!!followUpKey && followUpKey <= todayKey);
    if (!due) return;
    const businessKey = record.account_id || `row:${record.source_row}`;
    if (campaignInfo.pending.has(businessKey)) return; // Already in a follow-up campaign awaiting review or sending.
    const last = campaignInfo.lastSent.get(businessKey);
    const stage = record.next_email || (status === "reactivation due" ? "Reactivation" : "Follow-up");
    if (stage.toLowerCase() === "complete") return; // The sequence is finished; nothing left to send.
    const groupKey = `${last ? last.campaign_id : "none"}|${stage}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { campaign:last ? campaignInfo.campaigns.get(last.campaign_id) : null, campaign_id:last ? last.campaign_id : "", stage:stage, records:[], earliest:"" });
    const group = groups.get(groupKey);
    group.records.push(record);
    if (followUpKey && (!group.earliest || followUpKey < group.earliest)) group.earliest = followUpKey;
  });

  groups.forEach(group => {
    const count = group.records.length;
    const name = group.campaign ? group.campaign.name : "";
    const key = `${TASK_MANAGER_KEY_PREFIX}cmp-${group.campaign_id || "none"}-${taskManagerSlug_(group.stage)}`;
    const cities = new Map();
    group.records.forEach(record => { const city = record.city || "No city"; cities.set(city, (cities.get(city) || 0) + 1); });
    const cityText = Array.from(cities.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([city, n]) => `${city} ${n}`).join(", ");
    const businesses = `${count} business${count === 1 ? "" : "es"}`;
    items.push({
      key:key, kind:"campaign-group", summary:true, priority:count >= 20 ? "high" : "medium",
      title:name ? `Send ${group.stage} to '${name}' (${businesses})` : `Send ${group.stage} emails (${businesses})`,
      slot:taskManagerSlot_(now, timeZone),
      description:taskManagerDescription_([
        group.earliest ? `Due since ${taskManagerShortDate_(new Date(`${group.earliest}T12:00:00`), timeZone)}.` : "Due now.",
        cityText ? `Where: ${cityText}.` : "",
        name
          ? `Outreach > Campaigns > Create campaign, stage ${group.stage}, audience: same businesses as '${name}'.`
          : `Outreach > Campaigns > Create campaign, stage ${group.stage}.`,
        "This task closes itself once those businesses are in a new campaign or no longer due.",
      ], key),
    });
  });

  // Campaigns left in review, paused, or approved but never sent.
  campaignInfo.campaigns.forEach(campaign => {
    let state = "";
    let title = "";
    let line = "";
    const remaining = Math.max(0, campaign.recipient_count - campaign.sent_count);
    const ageDays = campaign.created_at ? (now.getTime() - campaign.created_at.getTime()) / 86400000 : 0;
    const approvedDays = campaign.approved_at ? (now.getTime() - campaign.approved_at.getTime()) / 86400000 : ageDays;
    if (campaign.status === "Review" && campaign.sequence_id) {
      // A sequence step the Hub drafted when it came due: ask for review right away, not after a day.
      state = "review";
      title = `Review and approve '${campaign.name}' (${campaign.recipient_count} business${campaign.recipient_count === 1 ? "" : "es"})`;
      line = `Drafted ${taskManagerShortDate_(campaign.created_at, timeZone)} because these businesses are due for this step. Check the wording, then approve and send.`;
    } else if (campaign.status === "Review" && ageDays >= 1) {
      state = "review";
      title = `Review or delete campaign '${campaign.name}' (${campaign.recipient_count})`;
      line = `Created ${taskManagerShortDate_(campaign.created_at, timeZone)} and still waiting for review.`;
    } else if (campaign.status === "Approved" && campaign.schedule_status === "Paused") {
      state = "paused";
      title = `Check and resume paused campaign '${campaign.name}' (${remaining} left)`;
      line = campaign.schedule_detail ? taskManagerClip_(campaign.schedule_detail, 300) : "The scheduled send paused.";
    } else if (campaign.status === "Approved" && !CAMPAIGN_SCHEDULE_ACTIVE_STATUSES.includes(campaign.schedule_status) && remaining > 0 && approvedDays >= 1) {
      state = "unsent";
      title = `Send or delete campaign '${campaign.name}' (${remaining} not sent)`;
      line = `Approved ${taskManagerShortDate_(campaign.approved_at || campaign.created_at, timeZone)}; ${campaign.sent_count} of ${campaign.recipient_count} sent.`;
    }
    if (!state) return;
    const key = `${TASK_MANAGER_KEY_PREFIX}cmprun-${campaign.campaign_id}-${state}`;
    items.push({
      key:key, kind:"campaign", summary:true, priority:"high", title:title, slot:taskManagerSlot_(now, timeZone),
      description:taskManagerDescription_([line, "Open it in Outreach > Campaigns > Review campaign. This task closes itself."], key),
    });
  });

  // Sequences: today's step check failed, so no step was drafted. Say so rather than leave due businesses silent.
  const stepCheckFailure = sequenceStepCheckFailure_(now);
  if (stepCheckFailure) {
    const key = `${TASK_MANAGER_KEY_PREFIX}seqcheck-${stepCheckFailure.day}`;
    items.push({
      key:key, kind:"campaign", summary:true, priority:"high", title:"Sequence step check failed: due follow-ups were not drafted today",
      slot:taskManagerSlot_(now, timeZone),
      description:taskManagerDescription_([taskManagerClip_(stepCheckFailure.message, 300), "Run runSequenceStepCheck() in the Inventory API editor, or tell Claude. This task closes itself after a successful check."], key),
    });
  }

  // Orders & Accounts: new applications and online orders.
  rowsWithSource_(getCustomerApplicationsSheet_(false)).map(customerApplicationRecord_).forEach(application => {
    if (!application.application_id || !["New", "Reviewing"].includes(application.workflow_status)) return;
    const key = `${TASK_MANAGER_KEY_PREFIX}app-${application.application_id}`;
    items.push({
      key:key, kind:"application", priority:"high",
      title:`Review wholesale application: ${application.business_name || application.legal_business_name || application.application_id}`,
      slot:taskManagerPlacement_(application.submitted_at, now, timeZone),
      description:taskManagerDescription_([
        `Submitted ${taskManagerShortDate_(application.submitted_at, timeZone)}${application.business_type ? `, ${application.business_type.toLowerCase()}` : ""}${application.delivery_city ? `, ${application.delivery_city}` : ""}.`,
        taskManagerContactLine_([application.primary_contact_name, application.primary_email, application.primary_phone]),
        "Orders & Accounts > New applications. This task closes itself once the application is approved or declined.",
      ], key),
    });
  });
  rowsWithSource_(getOnlineOrderRequestsSheet_(false)).map(row => onlineOrderRecord_(row, new Map())).forEach(order => {
    const step = TASK_MANAGER_ORDER_STEPS[order.workflow_status];
    if (!order.request_id || !step) return;
    const who = order.business_name || order.contact_name || order.request_id;
    const titles = { review:`Online order from ${who}: review and confirm`, invoice:`Online order from ${who}: invoice in Badger`, deliver:`Online order from ${who}: deliver` };
    const key = `${TASK_MANAGER_KEY_PREFIX}order-${order.request_id}-${step}`;
    const size = [order.requested_cases ? `${order.requested_cases} case${order.requested_cases === 1 ? "" : "s"}` : "", order.requested_bottles ? `${order.requested_bottles} bottle${order.requested_bottles === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ");
    items.push({
      key:key, kind:"order", priority:"high", title:titles[step],
      slot:taskManagerPlacement_(step === "deliver" ? order.requested_delivery_date : order.submitted_at, now, timeZone),
      description:taskManagerDescription_([
        `Submitted ${taskManagerShortDate_(order.submitted_at, timeZone)}${size ? `: ${size}` : ""}${order.requested_delivery_date ? `; delivery wanted ${taskManagerShortDate_(order.requested_delivery_date, timeZone)}` : ""}. Status ${order.workflow_status}.`,
        taskManagerContactLine_([order.contact_name, order.email, order.phone]),
        "Orders & Accounts > New orders. This task closes itself when the order moves to its next step.",
      ], key),
    });
  });

  return items;
}

/** A sheet date that may arrive as a Date, text, or a bare day serial (a few reconciled Sent At cells hold one). */
function taskManagerSheetDate_(value) {
  if (value === "" || value === null || value === undefined) return null;
  const serial = typeof value === "number" ? value : (/^\d{5}(\.\d+)?$/.test(String(value).trim()) ? Number(value) : NaN);
  if (Number.isFinite(serial)) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  const date = outreachDate_(value);
  return date && date.getFullYear() >= 2000 && date.getFullYear() <= 2100 ? date : null;
}

/** Campaign headers plus, per business, the campaign that last emailed it and whether a newer campaign holds it. */
function taskManagerCampaignInfo_() {
  const ss = getOutreachSs_();
  const campaigns = new Map();
  const campaignSheet = ss.getSheetByName(OUTREACH_CAMPAIGNS_SHEET_NAME);
  rowsWithSource_(campaignSheet).forEach(row => {
    const id = String(row.campaign_id || "").trim();
    if (!id) return;
    campaigns.set(id, {
      campaign_id:id,
      name:String(row.campaign_name || id).trim(),
      status:String(row.status || "").trim(),
      schedule_status:String(row.schedule_status || "").trim(),
      schedule_detail:String(row.schedule_detail || "").trim(),
      recipient_count:Number(row.recipient_count || 0),
      sent_count:Number(row.sent_count || 0),
      created_at:outreachDate_(row.created_at) || null,
      approved_at:outreachDate_(row.approved_at) || null,
      sequence_id:String(row.sequence_id || "").trim(),
    });
  });
  const lastSent = new Map();
  const pending = new Set();
  const recipientSheet = ss.getSheetByName(OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME);
  if (recipientSheet && recipientSheet.getLastRow() >= 2) {
    // Only the columns needed; the body and HTML columns make the full sheet slow to read.
    const h = getHeaderMap_(recipientSheet);
    const wanted = ["campaign_id", "source_row", "account_id", "status", "sent_at"];
    const width = Math.max.apply(null, wanted.map(name => h[name] === undefined ? 0 : h[name] + 1));
    const rows = recipientSheet.getRange(2, 1, recipientSheet.getLastRow() - 1, width).getValues();
    rows.forEach(values => {
      const get = name => h[name] === undefined ? "" : values[h[name]];
      const campaignId = String(get("campaign_id") || "").trim();
      const campaign = campaigns.get(campaignId);
      if (!campaign || campaign.status === CAMPAIGN_DELETED_STATUS) return;
      const accountId = String(get("account_id") || "").trim();
      const businessKey = accountId || `row:${String(get("source_row") || "").trim()}`;
      const status = String(get("status") || "").trim();
      if (/^sent/i.test(status)) {
        const sentAt = taskManagerSheetDate_(get("sent_at")) || campaign.approved_at || campaign.created_at;
        const time = sentAt ? sentAt.getTime() : 0;
        const current = lastSent.get(businessKey);
        if (!current || time >= current.time) lastSent.set(businessKey, { campaign_id:campaignId, time:time });
      } else if (["Review", "Approved"].includes(campaign.status) && /^ready/i.test(status)) {
        pending.add(businessKey);
      }
    });
  }
  return { campaigns:campaigns, lastSent:lastSent, pending:pending };
}

/** Hub keys a task row answers to: its id, the id it was carried over from, and any "Hub key:" lines. */
function taskManagerRowKeys_(row) {
  const keys = new Set();
  [row.id, row.originTaskId].forEach(value => {
    const text = String(value || "").trim();
    if (text.indexOf(TASK_MANAGER_KEY_PREFIX) === 0) keys.add(text);
  });
  String(row.description || "").split("\n").forEach(line => {
    const trimmed = line.trim();
    if (trimmed.indexOf(TASK_MANAGER_KEY_LABEL) === 0) keys.add(trimmed.slice(TASK_MANAGER_KEY_LABEL.length).trim());
  });
  return keys;
}

function taskManagerIsTrue_(value) {
  return String(value === true ? "TRUE" : value || "").trim().toUpperCase() === "TRUE";
}

/**
 * Reconciles the Tasks tab with the open Hub items. Never deletes a row; creates missing tasks, refreshes the
 * text of open hub- summary tasks, and closes open tasks whose Hub item has cleared.
 */
function syncTaskManager_(options) {
  const dryRun = !!(options && options.dryRun);
  const cache = CacheService.getScriptCache();
  if (!dryRun) {
    if (cache.get(TASK_MANAGER_SYNC_RUNNING_CACHE_KEY)) return { skipped:"A task manager sync is already running.", created:0, updated:0, closed:0, open_items:0 };
    cache.put(TASK_MANAGER_SYNC_RUNNING_CACHE_KEY, "1", 300);
  }
  try {
    const timeZone = taskManagerTimeZone_();
    const now = options && options.now ? new Date(options.now) : new Date();
    // Any failure reading the Hub throws here, before anything is written, so a bad read never closes tasks.
    const items = taskManagerHubItems_(now, timeZone);
    const byKey = new Map(items.map(item => [item.key, item]));

    const sheet = SpreadsheetApp.openById(TASK_MANAGER_SPREADSHEET_ID).getSheetByName(TASK_MANAGER_TASKS_TAB);
    if (!sheet) throw new Error(`The task manager has no ${TASK_MANAGER_TASKS_TAB} tab.`);
    const width = Math.max(sheet.getLastColumn(), 1);
    const headerRow = sheet.getRange(1, 1, 1, width).getValues()[0].map(value => String(value || "").trim());
    const col = {};
    headerRow.forEach((name, index) => { if (name) col[name] = index; });
    const missing = TASK_MANAGER_TASK_HEADERS.filter(name => col[name] === undefined);
    if (missing.length) throw new Error(`The task manager Tasks tab is missing columns: ${missing.join(", ")}.`);
    const lastRow = sheet.getLastRow();
    const values = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, width).getDisplayValues() : [];

    const matched = new Set();
    const updates = [];
    const stamp = now.getTime();
    const closedOn = Utilities.formatDate(now, timeZone, "MMM d");
    values.forEach((rowValues, index) => {
      const row = {};
      Object.keys(col).forEach(name => { row[name] = rowValues[col[name]]; });
      const keys = taskManagerRowKeys_(row);
      if (!keys.size) return;
      const open = !taskManagerIsTrue_(row.completed) && !taskManagerIsTrue_(row.deleted);
      const liveKeys = Array.from(keys).filter(key => byKey.has(key));
      liveKeys.forEach(key => matched.add(key));
      if (!open) return;
      const description = String(row.description || "");
      if (!liveKeys.length) {
        // Reopened by hand after the Hub closed it: respect that.
        if (description.indexOf(TASK_MANAGER_CLOSED_LABEL) !== -1) return;
        updates.push({ row:index + 2, kind:"close", id:row.id, title:row.title, set:{
          completed:"TRUE",
          description:`${description}${description ? "\n" : ""}${TASK_MANAGER_CLOSED_LABEL}${closedOn}: cleared in the Hub.`,
          updatedAt:stamp,
        } });
        return;
      }
      // Only rows the Hub created get their text refreshed, and only summary tasks whose counts change.
      const item = byKey.get(String(row.id || "").trim());
      if (!item || !item.summary) return;
      if (String(row.title || "") === item.title && description === item.description) return;
      updates.push({ row:index + 2, kind:"update", id:row.id, title:item.title, set:{ title:item.title, description:item.description, updatedAt:stamp } });
    });

    const creates = items.filter(item => !matched.has(item.key));
    const result = {
      dry_run:dryRun,
      ran_at:now.toISOString(),
      open_items:items.length,
      created:creates.length,
      updated:updates.filter(update => update.kind === "update").length,
      closed:updates.filter(update => update.kind === "close").length,
      creates:creates.map(item => ({ id:item.key, title:item.title, week:item.slot.weekId, day:item.slot.dayOfWeek, priority:item.priority })),
      changes:updates.map(update => ({ row:update.row, id:update.id, action:update.kind, title:update.title })),
    };
    if (dryRun) return result;

    updates.forEach(update => {
      Object.keys(update.set).forEach(name => {
        const value = name === "updatedAt" ? update.set[name] : taskManagerCellText_(update.set[name]);
        sheet.getRange(update.row, col[name] + 1).setValue(value);
      });
    });
    if (creates.length) {
      const rows = creates.map(item => {
        const out = new Array(width).fill("");
        const set = (name, value) => { out[col[name]] = value; };
        set("id", item.key);
        set("title", taskManagerCellText_(item.title));
        set("category", TASK_MANAGER_CATEGORY);
        set("description", taskManagerCellText_(item.description));
        set("dayOfWeek", String(item.slot.dayOfWeek));
        set("completed", "FALSE");
        set("weekId", item.slot.weekId);
        set("repeatsWeekly", "FALSE");
        set("repeatPattern", "none");
        set("originTaskId", "");
        set("deleted", "FALSE");
        set("reminderDate", "");
        set("assignee", "");
        set("priority", item.priority || "medium");
        set("shiftHours", "");
        set("updatedAt", stamp);
        return out;
      });
      // Text format first so ids and dates stay text, exactly as the task manager writes them.
      const target = sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, width);
      target.setNumberFormat("@");
      target.setValues(rows);
    }
    const summary = { ran_at:result.ran_at, open_items:result.open_items, created:result.created, updated:result.updated, closed:result.closed };
    PropertiesService.getScriptProperties().setProperty(TASK_MANAGER_SYNC_LAST_RUN_PROPERTY, JSON.stringify(summary));
    if (result.created || result.updated || result.closed) {
      appendAudit_("SYNC_TASK_MANAGER", "System", "task-manager", "", "Task manager sync", OUTREACH_SPREADSHEET_ID, TASK_MANAGER_SPREADSHEET_ID, "Completed",
        `${result.created} created, ${result.updated} updated, ${result.closed} closed; ${result.open_items} open Hub items.`);
    }
    return result;
  } finally {
    if (!dryRun) cache.remove(TASK_MANAGER_SYNC_RUNNING_CACHE_KEY);
  }
}
