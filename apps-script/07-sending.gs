// Inventory API, part 7 of 12: Sending: scheduled campaign sends, the sending window, send pacing, single emails, outcomes, contact log, business and program edits, newsletter contacts.
// The parts load in order 01 to 12 (filePushOrder in .clasp.json); version and change notes are in 01-core.gs.

// ---------- Scheduled campaign sends (2026.10.03.19-APP) ----------
// An approved campaign can carry a send time. A five-minute trigger sends due campaigns in small locked
// batches through apiSendOutreachCampaignBatch_, so every manual-send guard (approval token, frozen stage,
// live eligibility, replies, opt-outs, duplicate tokens) still applies to each recipient.
const CAMPAIGN_SCHEDULE_HANDLER = "runScheduledOutreachCampaigns";
const CAMPAIGN_SCHEDULE_ACTIVE_STATUSES = ["Scheduled", "Sending"];
const CAMPAIGN_SCHEDULE_BATCH_SIZE = 2; // Per five-minute run; the send budget (outreachSendAllowance_) has the final say.
const CAMPAIGN_SCHEDULE_RUN_BUDGET_MS = 4 * 60 * 1000;
const CAMPAIGN_SCHEDULE_MAX_DAYS_AHEAD = 30;

function installOutreachCampaignScheduler() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === CAMPAIGN_SCHEDULE_HANDLER)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(CAMPAIGN_SCHEDULE_HANDLER).timeBased().everyMinutes(5).create();
  return { message:"Scheduled campaign sender installed. It checks for due campaigns every five minutes." };
}

function campaignSchedulerInstalled_() {
  try {
    return ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === CAMPAIGN_SCHEDULE_HANDLER);
  } catch (error) {
    return null; // Unknown (for example, missing trigger scope); the UI shows no warning rather than a false one.
  }
}

function campaignScheduleValidation_(value, now) {
  const reference = now instanceof Date ? now : new Date();
  const sendAt = value instanceof Date ? value : new Date(String(value || ""));
  if (!String(value || "").trim() || isNaN(sendAt.getTime())) return { error:"Choose a valid send date and time." };
  if (sendAt.getTime() < reference.getTime() + 60 * 1000) return { error:"Choose a send time at least one minute from now. To send right away, use Send remaining." };
  if (sendAt.getTime() > reference.getTime() + CAMPAIGN_SCHEDULE_MAX_DAYS_AHEAD * 86400000) return { error:`Choose a send time within ${CAMPAIGN_SCHEDULE_MAX_DAYS_AHEAD} days.` };
  return { send_at:sendAt };
}

function campaignScheduleIsDue_(campaign, now) {
  if (String(campaign?.status || "") !== "Approved") return false;
  if (!CAMPAIGN_SCHEDULE_ACTIVE_STATUSES.includes(String(campaign?.schedule_status || ""))) return false;
  const sendAt = campaign.scheduled_send_at instanceof Date ? campaign.scheduled_send_at : new Date(String(campaign?.scheduled_send_at || ""));
  return !isNaN(sendAt.getTime()) && sendAt.getTime() <= (now instanceof Date ? now : new Date()).getTime();
}

// A recipient blocked before the mailer was called (a logged reply, opt-out, stage change, and so on) is a
// normal skip. A block after a mailer attempt means delivery failed or is uncertain, so the schedule pauses.
function campaignScheduleUnsafeBlocks_(results) {
  return (results || []).filter(item => item && item.status === "Blocked" && item.mailer_attempted === true);
}

function campaignScheduleTimeLabel_(date) {
  return Utilities.formatDate(date, "America/Chicago", "EEE MMM d, h:mm a") + " CT";
}

function clearCampaignSchedule_(campaign, status, detail) {
  const h = campaign.headers;
  if (h.schedule_status === undefined) return;
  campaign.values[h.schedule_status] = status || "";
  if (h.schedule_detail !== undefined) campaign.values[h.schedule_detail] = detail || "";
  if (!status) {
    if (h.scheduled_send_at !== undefined) campaign.values[h.scheduled_send_at] = "";
    if (h.scheduled_by !== undefined) campaign.values[h.scheduled_by] = "";
  }
}

function campaignScheduleState_(campaign) {
  const h = campaign.headers;
  const value = key => (h[key] === undefined ? "" : campaign.values[h[key]]);
  return {
    campaign_id:String(value("campaign_id") || ""), status:String(value("status") || ""),
    approval_token:String(value("approval_token") || ""), scheduled_send_at:value("scheduled_send_at") || "",
    scheduled_by:String(value("scheduled_by") || ""), schedule_status:String(value("schedule_status") || ""),
  };
}

function updateCampaignSchedule_(campaignId, mutate) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, campaignId);
    if (!campaign) throw new Error("Campaign not found.");
    const outcome = mutate(campaign);
    campaign.values[campaign.headers.app_version] = APP_VERSION;
    sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
    return outcome;
  } finally { lock.releaseLock(); }
}

function apiScheduleOutreachCampaign_(p) {
  const startNow = p?.start_now === true;
  requireFields_(p || {}, startNow ? ["campaign_id", "approval_token", "staff_name"] : ["campaign_id", "approval_token", "send_at", "staff_name"]);
  // "Send remaining" hands the campaign to the paced scheduler, starting now, instead of sending from the browser.
  const check = startNow ? { send_at:new Date() } : campaignScheduleValidation_(p.send_at, new Date());
  if (check.error) throw new Error(check.error);
  const staffName = authenticatedActor_(p, "Sturgeon Distribution Hub");
  const label = campaignScheduleTimeLabel_(check.send_at);
  updateCampaignSchedule_(p.campaign_id, campaign => {
    const h = campaign.headers;
    if (String(campaign.values[h.status] || "") !== "Approved") throw new Error("Approve the campaign before scheduling it.");
    if (String(campaign.values[h.approval_token] || "") !== String(p.approval_token || "")) throw new Error("Campaign approval is not valid. Refresh and review again.");
    if (String(campaign.values[h.schedule_status] || "") === "Sending") throw new Error(startNow ? "This campaign is already sending on its own; it continues every five minutes." : "This campaign is sending on its schedule now. Cancel the schedule first to change it.");
    const ready = campaignRecipientRows_(outreachCampaignSheets_().recipients, p.campaign_id)
      .filter(item => String(item.values[item.headers.status] || "") === "Ready to send").length;
    if (!ready) throw new Error("No approved recipients are waiting to send.");
    campaign.values[h.scheduled_send_at] = check.send_at;
    campaign.values[h.scheduled_by] = staffName;
    campaign.values[h.schedule_status] = "Scheduled";
    campaign.values[h.schedule_detail] = `Scheduled by ${staffName} for ${label}; ${ready} recipient${ready === 1 ? "" : "s"} waiting.`;
  });
  appendAudit_("SCHEDULE_OUTREACH_CAMPAIGN", "Campaign", p.campaign_id, "", staffName, OUTREACH_CAMPAIGNS_SHEET_NAME, OUTREACH_CAMPAIGNS_SHEET_NAME, "Scheduled", label);
  const installed = campaignSchedulerInstalled_();
  return {
    message:startNow ? `${(() => { const w = outreachSendWindowState_(new Date()); return w.open ? "Sending started." : `Queued: it starts when the sending window opens${w.next_open ? ` (${campaignScheduleTimeLabel_(w.next_open)})` : ""}.`; })()} The Hub sends about ${outreachHourlyLimit_()} an hour during the sending window (${outreachSendWindowState_(new Date()).label}) on its own; you can close this page.${installed === false ? " Warning: the scheduled sender is not installed; run installOutreachCampaignScheduler() in Apps Script or this will not send." : ""}` : `Scheduled for ${label}. No email was sent now.${installed === false ? " Warning: the scheduled sender is not installed; run installOutreachCampaignScheduler() in Apps Script or this will not send." : ""}`,
    scheduled_send_at:check.send_at.toISOString(), scheduler_installed:installed,
  };
}

function apiCancelOutreachCampaignSchedule_(p) {
  requireFields_(p || {}, ["campaign_id", "staff_name"]);
  const staffName = authenticatedActor_(p, "Sturgeon Distribution Hub");
  updateCampaignSchedule_(p.campaign_id, campaign => {
    const status = String(campaign.values[campaign.headers.schedule_status] || "");
    if (![...CAMPAIGN_SCHEDULE_ACTIVE_STATUSES, "Paused"].includes(status)) throw new Error("This campaign has no active schedule.");
    clearCampaignSchedule_(campaign, "Cancelled", `Cancelled by ${staffName} at ${campaignScheduleTimeLabel_(new Date())}. Remaining recipients stay approved and can be sent manually or rescheduled.`);
  });
  appendAudit_("CANCEL_OUTREACH_CAMPAIGN_SCHEDULE", "Campaign", p.campaign_id, "", staffName, OUTREACH_CAMPAIGNS_SHEET_NAME, OUTREACH_CAMPAIGNS_SHEET_NAME, "Cancelled", "");
  return { message:"Schedule cancelled. No further scheduled email will be sent for this campaign." };
}

// ---------- Sending window (2026-11-05) ----------
// Campaign email should land late morning to early afternoon, before bars and restaurants get busy, not whenever the
// pacer allows. Scheduled campaigns and Send remaining send only inside this window (Hub time, America/Chicago);
// outside it they wait and say when the next window opens. A one-off email and "Send up to 2" are not limited.
// Hub Configuration "outreach_send_window", e.g. "10:00-14:00 Mon-Fri" (days: Mon..Sun, ranges or lists), or "off".
const OUTREACH_SEND_WINDOW_CONFIG_KEY = "outreach_send_window";
const OUTREACH_SEND_WINDOW_DEFAULT = "10:00-14:00 Mon-Fri";
const OUTREACH_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function outreachSendWindow_() {
  const raw = String(getHubConfigurationValue_(OUTREACH_SEND_WINDOW_CONFIG_KEY) || "").trim() || OUTREACH_SEND_WINDOW_DEFAULT;
  if (/^off$/i.test(raw)) return null;
  const parse = text => {
    const match = String(text || "").match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*(.*)$/);
    if (!match) return null;
    const start = Number(match[1]) * 60 + Number(match[2]);
    const end = Number(match[3]) * 60 + Number(match[4]);
    if (!(start >= 0 && end <= 24 * 60 && start < end)) return null;
    const days = new Set();
    const spec = String(match[5] || "").trim() || "Mon-Sun";
    for (const part of spec.split(/[,\s]+/).filter(Boolean)) {
      const range = part.split("-").map(item => OUTREACH_WEEKDAYS.findIndex(day => day.toLowerCase() === item.slice(0, 3).toLowerCase()));
      if (range.some(index => index < 0) || range.length > 2) return null;
      if (range.length === 1) days.add(range[0] + 1);
      else for (let d = range[0]; ; d = (d + 1) % 7) { days.add(d + 1); if (d === range[1]) break; }
    }
    return days.size ? { start:start, end:end, days:days, text:text } : null;
  };
  return parse(raw) || parse(OUTREACH_SEND_WINDOW_DEFAULT);
}

function outreachWindowWaitingDetail_(sendWindow) {
  return `Waiting for the sending window (${sendWindow.label})${sendWindow.next_open ? `; next opens ${campaignScheduleTimeLabel_(sendWindow.next_open)}` : ""}. Continues on its own.`;
}

/** Whether campaign sends may go now, and if not, when the window next opens (approximate across a DST change). */
function outreachSendWindowState_(now, sendWindow) {
  const at = now instanceof Date ? now : new Date();
  const window = sendWindow === undefined ? outreachSendWindow_() : sendWindow;
  if (!window) return { open:true, next_open:null, label:"any time" };
  const timeZone = "America/Chicago";
  const day = Number(Utilities.formatDate(at, timeZone, "u")); // 1 = Monday
  const minute = Number(Utilities.formatDate(at, timeZone, "H")) * 60 + Number(Utilities.formatDate(at, timeZone, "m"));
  const hhmm = value => { const h = Math.floor(value / 60); const m = value % 60; return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`; };
  const dayList = Array.from(window.days).sort((a, b) => a - b).map(d => OUTREACH_WEEKDAYS[d - 1]).join(", ");
  const label = `${hhmm(window.start)}–${hhmm(window.end)}, ${dayList}`;
  if (window.days.has(day) && minute >= window.start && minute < window.end) return { open:true, next_open:null, label:label };
  for (let ahead = 0; ahead <= 7; ahead += 1) {
    const candidate = ((day - 1 + ahead) % 7) + 1;
    if (!window.days.has(candidate)) continue;
    if (ahead === 0 && minute >= window.start) continue;
    const minutes = ahead * 1440 + window.start - minute;
    // Adding local minutes is off by an hour across a daylight-saving change; correct it against Chicago time.
    let nextOpen = new Date(at.getTime() + minutes * 60000);
    const localStart = Number(Utilities.formatDate(nextOpen, timeZone, "H")) * 60 + Number(Utilities.formatDate(nextOpen, timeZone, "m"));
    let drift = window.start - localStart;
    if (drift > 720) drift -= 1440;
    if (drift < -720) drift += 1440;
    nextOpen = new Date(nextOpen.getTime() + drift * 60000);
    return { open:false, next_open:nextOpen, label:label };
  }
  return { open:false, next_open:null, label:label };
}

function runScheduledOutreachCampaigns() {
  const startedAt = Date.now();
  const deadlineAt = startedAt + CAMPAIGN_SCHEDULE_RUN_BUDGET_MS;
  const sheets = outreachCampaignSheets_();
  const h = getHeaderMap_(sheets.campaigns);
  if (sheets.campaigns.getLastRow() < 2 || h.schedule_status === undefined) return { runs:[] };
  const now = new Date();
  const rowValues = sheets.campaigns.getRange(2, 1, sheets.campaigns.getLastRow() - 1, sheets.campaigns.getLastColumn()).getValues();
  const due = rowValues
    .map((values, index) => Object.assign(campaignScheduleState_({ row:index + 2, values:values, headers:h }), { schedule_detail:h.schedule_detail === undefined ? "" : String(values[h.schedule_detail] || "") }))
    .filter(state => campaignScheduleIsDue_(state, now))
    .sort((a, b) => new Date(a.scheduled_send_at).getTime() - new Date(b.scheduled_send_at).getTime());
  const runs = [];
  const sendWindow = outreachSendWindowState_(now);
  if (!sendWindow.open) {
    // Outside the sending window: nothing sends. Say when it resumes (written only when the text changes).
    const detail = outreachWindowWaitingDetail_(sendWindow);
    due.forEach(state => {
      try {
        if (state.schedule_detail !== detail && h.schedule_detail !== undefined) {
          updateCampaignSchedule_(state.campaign_id, campaign => { campaign.values[campaign.headers.schedule_detail] = detail; });
        }
      } catch (error) { console.warn(`Schedule detail not updated for ${state.campaign_id}: ${String(error.message || error)}`); }
      runs.push({ campaign_id:state.campaign_id, state:"Window closed", sent:0, skipped:0, detail:detail });
    });
    console.log(JSON.stringify({ event:"outreach_campaign_schedule_run", due:due.length, runs:runs, window_closed:true }));
    return { runs:runs };
  }
  const holdCheck = { outbox_hold_checked:false };
  for (const state of due) {
    if (Date.now() > deadlineAt) break;
    runs.push(runScheduledCampaign_(state.campaign_id, deadlineAt, holdCheck));
  }
  if (runs.some(run => run.sent || run.skipped || run.state !== "Sending")) {
    bumpReadCacheVersion_(["outreach"]);
    rebuildReadCaches_(["outreach"]); // so the next Outreach load doesn't wait for a rebuild (.84)
  }
  console.log(JSON.stringify({ event:"outreach_campaign_schedule_run", due:due.length, runs:runs, total_ms:Date.now() - startedAt }));
  return { runs:runs };
}

function runScheduledCampaign_(campaignId, deadlineAt, holdCheck) {
  let sent = 0;
  let skipped = 0;
  const finish = (state, detail) => {
    try {
      updateCampaignSchedule_(campaignId, campaign => {
        // Never overwrite a cancellation or reopen that landed while this run was sending.
        if (!CAMPAIGN_SCHEDULE_ACTIVE_STATUSES.includes(String(campaign.values[campaign.headers.schedule_status] || ""))) return;
        clearCampaignSchedule_(campaign, state, detail);
      });
    } catch (error) {
      console.warn(`Campaign schedule state could not be saved for ${campaignId}: ${String(error.message || error)}`);
    }
    if (state !== "Sending") appendAudit_("SCHEDULED_OUTREACH_CAMPAIGN_" + state.toUpperCase(), "Campaign", campaignId, "", "Scheduled sender", OUTREACH_CAMPAIGNS_SHEET_NAME, OUTREACH_CAMPAIGNS_SHEET_NAME, state, detail);
    return { campaign_id:campaignId, state:state, sent:sent, skipped:skipped, detail:detail };
  };
  let state;
  try {
    state = updateCampaignSchedule_(campaignId, campaign => {
      const current = campaignScheduleState_(campaign);
      if (!campaignScheduleIsDue_(current, new Date())) return null;
      if (current.schedule_status === "Scheduled") {
        campaign.values[campaign.headers.schedule_status] = "Sending";
        campaign.values[campaign.headers.schedule_detail] = `Started ${campaignScheduleTimeLabel_(new Date())}.`;
      }
      return current;
    });
  } catch (error) {
    return { campaign_id:campaignId, state:"Waiting", sent:0, skipped:0, detail:String(error.message || error) };
  }
  if (!state) return { campaign_id:campaignId, state:"Not due", sent:0, skipped:0, detail:"" };
  const actor = `Scheduled send (${state.scheduled_by || "staff"})`;
  let verifiedHold = false;
  while (Date.now() < deadlineAt) {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, campaignId);
    const current = campaign ? campaignScheduleState_(campaign) : null;
    if (!current || current.status !== "Approved" || current.schedule_status !== "Sending") {
      return { campaign_id:campaignId, state:"Stopped", sent:sent, skipped:skipped, detail:"Schedule cancelled, reopened, or completed during the run." };
    }
    const release = outreachClearReleasedOutboxHold_(Date.now(), holdCheck);
    let res;
    try {
      res = apiSendOutreachCampaignBatch_({ campaign_id:campaignId, approval_token:current.approval_token, batch_size:CAMPAIGN_SCHEDULE_BATCH_SIZE,
        continue_after_block:true, staff_name:actor, deadline_at:deadlineAt });
    } catch (error) {
      const message = String(error.message || error);
      // A busy lock is not a failure: a staff action or manual send holds it. The next run continues.
      if (/in progress/i.test(message)) return finish("Sending", `Waiting for another send to finish; ${sent} sent this run. Continues on the next run.`);
      return finish("Paused", `Paused at ${campaignScheduleTimeLabel_(new Date())}: ${message.slice(0, 500)}`);
    }
    const unsafe = campaignScheduleUnsafeBlocks_(res.results);
    sent += Number(res.sent || 0);
    skipped += Math.max(0, Number(res.blocked || 0) - unsafe.length);
    if (unsafe.length) {
      return finish("Paused", `Paused at ${campaignScheduleTimeLabel_(new Date())} after ${unsafe[0].business}: ${String(unsafe[0].detail || "").slice(0, 300)}. Delivery may be uncertain; open the campaign and check before resuming. ${sent} sent, ${skipped} skipped this run.`);
    }
    if (res.held && Number(res.sent || 0) > 0 && !verifiedHold && Date.now() + OUTREACH_HOLD_VERIFY_DELAY_MS < deadlineAt) {
      // The mailer counts the Outbox 1.5 s after sending, while a normal email is usually still in transit. Look again
      // shortly; if the Outbox has emptied, it was not a real hold, so clear it and carry on within the pace limits.
      verifiedHold = true;
      Utilities.sleep(OUTREACH_HOLD_VERIFY_DELAY_MS);
      if (outreachClearReleasedOutboxHold_(Date.now(), holdCheck, { force:true }).cleared) {
        // The window may have closed during the wait; never start another batch outside it.
        const windowNow = outreachSendWindowState_(new Date());
        if (windowNow.open) continue;
        return finish("Sending", outreachWindowWaitingDetail_(windowNow));
      }
    }
    if (res.held) {
      // A Zoho Outbox hold waits out the hour and then continues on its own. Only repeated holds with no clean send
      // in between (a sign Zoho may be blocking the account) pause the campaign for a person to check.
      const waiting = Number(res.remaining || 0);
      const streak = outreachHoldStreak_();
      if (streak >= OUTREACH_HOLD_STREAK_PAUSE) {
        return finish("Paused", `Paused at ${campaignScheduleTimeLabel_(new Date())}: Zoho held mail in the Outbox ${streak} times in a row, which can mean it is blocking the account. Check Zoho Mail (the Outbox and any "Email Outgoing Blocked" notice), then use Send remaining. ${sent} sent this run; ${waiting} still waiting.`);
      }
      const resumeAt = campaignScheduleTimeLabel_(new Date(outreachSendAllowance_(Date.now()).next_at));
      return finish("Sending", `Waiting: Zoho held mail in the Outbox, so sending is on hold until ${resumeAt} and then continues on its own. ${sent} sent this run; ${waiting} still waiting.`);
    }
    if (res.paced) {
      const releaseDetail = release.cleared ? " Zoho's Outbox is empty, so the hold was cleared." : "";
      return finish("Sending", `${res.message}${releaseDetail} ${Number(res.remaining || 0)} waiting; continues automatically.`);
    }
    if (!Number(res.remaining || 0)) {
      return finish("Done", `Finished ${campaignScheduleTimeLabel_(new Date())}. ${sent} sent and ${skipped} skipped in the final run; see the recipient list for the full result.`);
    }
    break; // One small batch per five-minute run keeps the sends spread out (a cleared transient hold continues above).
  }
  return finish("Sending", `Sending slowly: ${sent} sent and ${skipped} skipped in the latest run; continues automatically every five minutes (about ${outreachHourlyLimit_()} an hour).`);
}

function outreachAcceptedDetail_(result) {
  if (result.idempotent) return "Previously accepted and recovered.";
  const held = Number(result.held_in_outbox || 0);
  if (held > 0) return `Zoho accepted it but is holding ${held} email${held === 1 ? "" : "s"} in the Outbox (sending limit). It goes out when Zoho releases the Outbox.`;
  return "Zoho accepted delivery.";
}

function outreachStatusForOutcome_(outcome) {
  const map = {
    "Interested": "Interested",
    "Schedule tasting": "Interested",
    "Tasting visit": "Interested",
    "Wants cocktail list": "Nurture",
    "Follow up later": "Follow-up due",
    "Visit in person": "Interested",
    "Visit scheduled": "Interested",
    "Visited": "Interested",
    "Wrong contact": "Needs email",
    "Bad address": "Needs email",
    "Closed": "Closed",
    "Not interested": "Not interested",
    "Unsubscribed": "Do not contact",
  };
  return map[outcome] || "Replied";
}

const OUTREACH_OUTCOME_VALUES = [
  "Interested", "Schedule tasting", "Tasting visit", "Wants cocktail list", "Follow up later", "Visit in person",
  // 2026.11.19.78-APP (Karl): a visit set up with the business, and a visit made.
  "Visit scheduled", "Visited",
  "Wrong contact", "Bad address", "Closed", "Not interested", "Unsubscribed",
];
const OUTREACH_DIRECTORY_STAGE_VALUES = ["Initial", "Follow-up 1", "Follow-up 2", "Nurture check-in", "Reactivation", "Complete"];
const OUTREACH_DIRECTORY_STATUS_VALUES = [
  "Not contacted", "Sent", "Follow-up due", "Follow-up sent", "Replied", "Interested", "Not interested", "Bad address", "Closed",
  "Do not contact", "Needs email", "Verify email", "Send error", "Existing customer", "Reactivation due", "Reactivation sent",
  "Use reactivation", "Nurture",
];
const OUTREACH_FOLLOW_UP_OUTCOMES = new Set(["Interested", "Schedule tasting", "Follow up later", "Visit in person", "Visit scheduled"]);
const NURTURE_CHECK_IN_DUPLICATE_COOLDOWN_DAYS = 60;

function outreachIsCocktailListOutcome_(outcome) {
  return String(outcome || "").trim().toLowerCase() === "wants cocktail list";
}

function upsertNewsletterFromCocktailReply_(record, outcomeDate) {
  const sheet = getNewsletterContactsSheet_(true);
  const h = getHeaderMap_(sheet);
  const email = String(record.email || "").trim().toLowerCase();
  if (!email) throw new Error("A cocktail-list reply needs an email address.");
  const values = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const match = values.findIndex(row => String(row[h.email] || "").trim().toLowerCase() === email);
  const row = match >= 0 ? values[match].slice() : Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  const relationship = String(record.relationship || "").trim().toLowerCase() === "customer" ? "Customer" : "Prospect";
  const now = outcomeDate || new Date();
  set("contact_id", String(row[h.contact_id] || "") || Utilities.getUuid());
  set("account_id", String(record.account_id || "").trim());
  set("name", String(record.contact || "").trim());
  set("email", email);
  set("organization", String(record.business || "").trim());
  set("relationship_type", relationship);
  set("status", "Subscribed");
  set("consent_source", 'Replied "cocktails" to outreach email');
  set("consent_date", now);
  set("source_row", record.source_row || "");
  set("source_business", String(record.business || "").trim());
  set("topics", "Monthly cocktail ideas");
  set("updated_at", now);
  set("updated_by", "Outreach outcome");
  set("app_version", APP_VERSION);
  sheet.getRange(match >= 0 ? match + 2 : sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  return { contact_id:String(row[h.contact_id] || ""), created:match < 0 };
}

function unsubscribeNewsletterContactByEmail_(email, actor) {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return false;
  const sheet = getOutreachSs_().getSheetByName(NEWSLETTER_CONTACTS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return false;
  const h = getHeaderMap_(sheet);
  if (h.email === undefined || h.status === undefined) return false;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const now = new Date();
  const matching = values.map((row, index) => ({ row:row, index:index })).filter(item => String(item.row[h.email] || "").trim().toLowerCase() === target);
  if (!matching.length) return false;
  matching.forEach(item => {
    item.row[h.status] = "Unsubscribed";
    if (h.updated_at !== undefined) item.row[h.updated_at] = now;
    if (h.updated_by !== undefined) item.row[h.updated_by] = actor || "Outreach outcome";
    if (h.app_version !== undefined) item.row[h.app_version] = APP_VERSION;
  });
  matching.forEach(item => sheet.getRange(item.index + 2, 1, 1, item.row.length).setValues([item.row]));
  return true;
}

function appendOutreachActivity_(record, outcome, notes) {
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  const h = ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER]);
  const row = Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  set("timestamp", new Date());
  set("account_id", record.account_id || "");
  set("business", record.business);
  set("intended_recipient", record.email);
  set("message_stage", "OUTCOME");
  set("subject", "Staff follow-up outcome");
  set("result", outcome);
  set("error/detail", notes || "Logged in Sturgeon Distribution Hub");
  set("error_detail", notes || "Logged in Sturgeon Distribution Hub");
  set("delivered_to", "");
  set("mailer_version", APP_VERSION);
  sheet.appendRow(row);
}

function appendOutreachDraftActivity_(record, stage, subject) {
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  const h = ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER]);
  const row = Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  set("timestamp", new Date());
  set("account_id", record.account_id || "");
  set("business", record.business);
  set("intended_recipient", record.email);
  set("message_stage", stage);
  set("subject", subject);
  set("result", "DRAFT SAVED");
  set("error/detail", "Saved in Sturgeon Distribution Hub; no email sent.");
  set("error_detail", "Saved in Sturgeon Distribution Hub; no email sent.");
  set("delivered_to", "");
  set("mailer_version", APP_VERSION);
  sheet.appendRow(row);
}

function apiSaveOutreachDraft_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["source_row", "business", "message_stage", "subject", "body_text"]);

  const subject = publicText_(p.subject, 200, "Subject");
  const bodyText = publicText_(p.body_text, 20000, "Message");
  if (!subject) throw new Error("Subject is required.");
  if (!bodyText) throw new Error("Message is required.");

  const leadsSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(p.source_row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > leadsSheet.getLastRow()) throw new Error("Business row not found.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another draft update is in progress. Try again in a moment.");
  try {
    const h = getHeaderMap_(leadsSheet);
    const values = leadsSheet.getRange(rowNumber, 1, 1, leadsSheet.getLastColumn()).getValues()[0];
    const current = {};
    Object.keys(h).forEach(key => current[key] = values[h[key]]);
    const currentBusiness = String(outreachValue_(current, ["business", "business_name"]) || "").trim();
    const currentEmail = String(outreachValue_(current, ["email", "email_address"]) || "").trim();
    const accountId = String(current.account_id || "").trim();
    const currentStage = String(outreachValue_(current, ["next_email", "stage"]) || "Initial").trim();
    if (currentBusiness !== String(p.business || "").trim()) throw new Error("Business row changed. Refresh and try again.");
    if (p.email && currentEmail !== String(p.email).trim()) throw new Error("Contact email changed. Refresh and try again.");
    if (p.account_id && accountId !== String(p.account_id).trim()) throw new Error("Account identity changed. Refresh and try again.");
    if (currentStage.toLowerCase() !== String(p.message_stage || "").trim().toLowerCase()) {
      throw new Error("Email stage changed. Refresh before saving this draft.");
    }

    const sheet = getOutreachDraftSheet_(true);
    const headers = getHeaderMap_(sheet);
    const key = outreachDraftKey_(accountId || rowNumber, currentStage);
    const now = new Date();
    const updatedBy = authenticatedActor_(p, "Sturgeon Distribution Hub");
    const rowValues = Array(sheet.getLastColumn()).fill("");
    const set = (name, value) => { if (headers[name] !== undefined) rowValues[headers[name]] = value; };
    set("draft_key", key);
    set("account_id", accountId);
    set("source_row", rowNumber);
    set("business_name", currentBusiness);
    set("email", currentEmail);
    set("message_stage", currentStage);
    set("subject", subject);
    set("body_text", bodyText);
    set("updated_at", now);
    set("updated_by", updatedBy);
    set("app_version", APP_VERSION);

    let targetRow = sheet.getLastRow() + 1;
    if (sheet.getLastRow() >= 2) {
      const keyColumn = headers.draft_key + 1;
      const keys = sheet.getRange(2, keyColumn, sheet.getLastRow() - 1, 1).getValues();
      const match = keys.findIndex(row => String(row[0] || "") === key);
      if (match >= 0) targetRow = match + 2;
    }
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    appendOutreachDraftActivity_({ account_id:accountId, business:currentBusiness, email:currentEmail }, currentStage, subject);
    appendAudit_("SAVE_OUTREACH_DRAFT", "Account", accountId, accountId, updatedBy, OUTREACH_SHEET_NAME, OUTREACH_DRAFTS_SHEET_NAME, "Completed", currentStage);
    return { message:"Email draft saved.", account_id:accountId, source_row:rowNumber, updated_at:now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function outreachMailerProperties_() {
  const properties = PropertiesService.getScriptProperties();
  return {
    url:String(properties.getProperty("OUTREACH_MAILER_URL") || "").trim(),
    secret:String(properties.getProperty("OUTREACH_MAILER_SHARED_SECRET") || "").trim(),
  };
}

function outreachMailerConfigured_() {
  const config = outreachMailerProperties_();
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.url) && config.secret.length >= 24;
}

const OUTREACH_MAILER_STATUS_CACHE_KEY = "outreach_mailer_status_v1";

function cachedOutreachMailerStatus_() {
  const cached = CacheService.getScriptCache().get(OUTREACH_MAILER_STATUS_CACHE_KEY);
  if (!cached) return null;
  try { return JSON.parse(cached); }
  catch (error) { return null; }
}

function outreachMailerStatus_() {
  const cached = cachedOutreachMailerStatus_();
  if (cached) return cached;
  let status;
  if (!outreachMailerConfigured_()) {
    status = { can_send:false, test_send_available:false, detail:"Mailer URL or shared secret is not configured." };
    CacheService.getScriptCache().put(OUTREACH_MAILER_STATUS_CACHE_KEY, JSON.stringify(status), 60);
    return status;
  }
  try {
    const result = callOutreachMailer_({ action:"appMailerStatus" });
    status = {
      can_send:!!result.can_send,
      test_send_available:!!result.test_send_available,
      detail:String(result.detail || ""),
    };
  } catch (error) {
    status = { can_send:false, test_send_available:false, detail:String(error.message || error) };
  }
  CacheService.getScriptCache().put(OUTREACH_MAILER_STATUS_CACHE_KEY, JSON.stringify(status), status.can_send || status.test_send_available ? 60 : 15);
  return status;
}

function apiGetOutreachSendStatus_() {
  return outreachMailerStatus_();
}

function callOutreachMailer_(payload) {
  const config = outreachMailerProperties_();
  if (!outreachMailerConfigured_()) throw new Error("Direct sending is not configured. Set OUTREACH_MAILER_URL and OUTREACH_MAILER_SHARED_SECRET in the Inventory Backend Script Properties.");
  const response = UrlFetchApp.fetch(config.url, {
    method:"post",
    contentType:"application/json",
    payload:JSON.stringify(Object.assign({}, payload, { service_token:config.secret })),
    muteHttpExceptions:true,
    followRedirects:true,
  });
  let result;
  try { result = JSON.parse(response.getContentText() || "{}"); }
  catch (error) { throw new Error("The Distribution Outreach mailer returned an unreadable response."); }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !result.ok) {
    throw new Error(result?.error || `The Distribution Outreach mailer failed with HTTP ${response.getResponseCode()}.`);
  }
  if (OUTREACH_PACED_ACTIONS.includes(String(payload.action || "")) && result.accepted && !result.idempotent) {
    try { outreachRecordSend_(Date.now(), Number(result.held_in_outbox || 0) > 0); }
    catch (error) { console.warn(`Send pacing record failed: ${String(error.message || error)}`); }
  }
  return result;
}

// ---------- Send pacing (2026.10.30.50-APP) ----------
// Zoho Mail limits how many outside emails karl@ (and its sales@ alias) may send per hour, from 50 to 500 depending on
// sender reputation; Karl's own email counts against the same hour. On 2026-10-29 a campaign sent one email every 17
// seconds; Zoho held the last 11 in the Outbox and then blocked all outgoing mail on the account. So every real send
// is recorded here and campaign sends take only what the budget allows: at most the hourly limit (Hub Configuration
// "outreach_hourly_send_limit", default 20) in any 60 minutes, and a twelfth of it in any 5 minutes, so the hour is
// spread out. One-off sends (a single email, a welcome email, a payment reminder) are recorded but never refused.
// If the mailer reports Zoho holding mail in the Outbox, campaign sends stop for an hour and scheduled campaigns pause.
const OUTREACH_PACED_ACTIONS = ["sendAppEmail", "sendCustomerEmail", "sendNewsletterEmail", "sendWelcomeEmail", "sendPaymentReminder"];
const OUTREACH_HOURLY_LIMIT_CONFIG_KEY = "outreach_hourly_send_limit";
const OUTREACH_DEFAULT_HOURLY_LIMIT = 20;
const OUTREACH_SEND_TIMES_PROPERTY = "OUTREACH_SEND_TIMES";
const OUTREACH_SEND_HOLD_PROPERTY = "OUTREACH_SEND_HOLD_UNTIL";
// Consecutive real sends that Zoho held in the Outbox; any send that goes out clean resets it.
const OUTREACH_HOLD_STREAK_PROPERTY = "OUTREACH_SEND_HOLD_STREAK";
const OUTREACH_HOLD_STREAK_PAUSE = 3; // A scheduled campaign pauses for a person to check after this many in a row.
const OUTREACH_HOLD_MS = 60 * 60 * 1000;
// The mailer counts the Outbox 1.5 s after a send, when a normal email is often still in transit, so a single "held"
// report is usually not a real hold (2026-11-05: every Appleton send was reported held and went out within ~2 min).
// Checking again at the next five-minute run tells a transient one from a real one; a real hold keeps the full hour.
const OUTREACH_OUTBOX_RELEASE_CHECK_DELAY_MS = 4 * 60 * 1000;
const OUTREACH_HOLD_VERIFY_DELAY_MS = 45 * 1000; // Same-run re-check after a send was reported held.
const OUTREACH_WINDOW_MS = 60 * 60 * 1000;
const OUTREACH_BURST_WINDOW_MS = 5 * 60 * 1000;

function outreachHourlyLimit_() {
  const configured = Number(getHubConfigurationValue_(OUTREACH_HOURLY_LIMIT_CONFIG_KEY));
  return Number.isInteger(configured) && configured >= 1 && configured <= 200 ? configured : OUTREACH_DEFAULT_HOURLY_LIMIT;
}

function outreachSendTimes_(now) {
  let times = [];
  try { times = JSON.parse(PropertiesService.getScriptProperties().getProperty(OUTREACH_SEND_TIMES_PROPERTY) || "[]"); }
  catch (error) { times = []; }
  return (Array.isArray(times) ? times : []).map(Number).filter(time => Number.isFinite(time) && time > now - OUTREACH_WINDOW_MS && time <= now + 60000);
}

function outreachRecordSend_(at, held) {
  const properties = PropertiesService.getScriptProperties();
  const times = outreachSendTimes_(at);
  times.push(at);
  properties.setProperty(OUTREACH_SEND_TIMES_PROPERTY, JSON.stringify(times.slice(-300)));
  if (held) properties.setProperty(OUTREACH_SEND_HOLD_PROPERTY, String(at + OUTREACH_HOLD_MS));
  properties.setProperty(OUTREACH_HOLD_STREAK_PROPERTY, String(held ? outreachHoldStreak_() + 1 : 0));
}

// The mailer reported a hold immediately after the last send, but Zoho can release it much sooner than the fixed
// hour. This read-only check is called at most once by each scheduler invocation, once four minutes have elapsed.
function outreachClearReleasedOutboxHold_(now, runState, options) {
  const at = typeof now === "number" ? now : Date.now();
  const force = !!(options && options.force); // The scheduler's own re-check right after a send it just made.
  const properties = PropertiesService.getScriptProperties();
  const holdUntil = Number(properties.getProperty(OUTREACH_SEND_HOLD_PROPERTY) || 0);
  if (!holdUntil || holdUntil <= at || (!force && at - (holdUntil - OUTREACH_HOLD_MS) < OUTREACH_OUTBOX_RELEASE_CHECK_DELAY_MS)) return { checked:false, cleared:false, held_in_outbox:-1 };
  if (!force && runState && runState.outbox_hold_checked) return { checked:false, cleared:false, held_in_outbox:-1 };
  if (runState) runState.outbox_hold_checked = true;
  let held = -1;
  try { held = Number(callOutreachMailer_({ action:"getOutboxHeldCount" }).held_in_outbox); }
  catch (error) { console.warn(`Outbox hold release check failed: ${String(error.message || error)}`); }
  if (held !== 0 || Number(properties.getProperty(OUTREACH_SEND_HOLD_PROPERTY) || 0) !== holdUntil) return { checked:true, cleared:false, held_in_outbox:held };
  properties.deleteProperty(OUTREACH_SEND_HOLD_PROPERTY);
  properties.setProperty(OUTREACH_HOLD_STREAK_PROPERTY, "0");
  return { checked:true, cleared:true, held_in_outbox:0 };
}

function outreachHoldStreak_() {
  const value = Number(PropertiesService.getScriptProperties().getProperty(OUTREACH_HOLD_STREAK_PROPERTY) || 0);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/** How many campaign emails may go now, and when the next one may go if none can. */
function outreachSendAllowance_(now) {
  const at = typeof now === "number" ? now : Date.now();
  const limit = outreachHourlyLimit_();
  const burst = Math.max(1, Math.ceil(limit / 12));
  const holdUntil = Number(PropertiesService.getScriptProperties().getProperty(OUTREACH_SEND_HOLD_PROPERTY) || 0);
  const times = outreachSendTimes_(at).sort((a, b) => a - b);
  const recent = times.filter(time => time > at - OUTREACH_BURST_WINDOW_MS);
  const hourRoom = limit - times.length;
  const burstRoom = burst - recent.length;
  const allowed = holdUntil > at ? 0 : Math.max(0, Math.min(hourRoom, burstRoom));
  let nextAt = at;
  if (holdUntil > at) nextAt = holdUntil;
  else if (!allowed) {
    const hourNext = hourRoom > 0 ? at : times[times.length - limit] + OUTREACH_WINDOW_MS;
    const burstNext = burstRoom > 0 ? at : recent[recent.length - burst] + OUTREACH_BURST_WINDOW_MS;
    nextAt = Math.max(hourNext, burstNext);
  }
  return { allowed:allowed, limit:limit, burst:burst, sent_last_hour:times.length, held:holdUntil > at, next_at:nextAt };
}

function outreachPacingMessage_(allowance) {
  const when = campaignScheduleTimeLabel_(new Date(allowance.next_at));
  if (allowance.held) return `Zoho was holding mail in the Outbox, so campaign sending waits until ${when}. Scheduled campaigns and Send remaining continue on their own after that.`;
  return `Pacing: ${allowance.sent_last_hour} emails in the last hour (limit ${allowance.limit}, at most ${allowance.burst} per 5 minutes). The next one can go at ${when}.`;
}

function outreachActivityRows_() {
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER, "Message ID", "Idempotency Token"]);
  return getAllRowsAsObjects_(sheet);
}

function acceptedOutreachSendForToken_(token) {
  const normalized = String(token || "").trim();
  if (!normalized) return null;
  const sheet = getOutreachSs_().getSheetByName(OUTREACH_ACTIVITY_SHEET_NAME);
  if (sheet) ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER, "Message ID", "Idempotency Token"]);
  const row = outreachRowsMatchingCell_(sheet, ["idempotency_token", "Idempotency Token"], normalized).reverse().find(item => {
    const result = String(outreachValue_(item, ["result"]) || "").toUpperCase();
    return result.indexOf("SENT") >= 0 && result.indexOf("TEST") < 0;
  });
  return row ? {
    accepted:true,
    message_id:String(outreachValue_(row, ["message_id", "zoho_message_id", "Message ID"]) || ""),
    sent_at:outreachValue_(row, ["timestamp", "sent_at"]) || new Date(),
    idempotent:true,
  } : null;
}

// Campaign delivery has already frozen the email subject and HTML. Build only
// the current directory fields needed for safety checks; do not render a draft
// or load Activity, Drafts, Programs, or Engagement for one recipient.
function campaignSendLightweightRecord_(row, sourceRow) {
  return {
    account_id:String(row.account_id || "").trim(),
    source_row:sourceRow,
    business:String(outreachValue_(row, ["business", "business_name"]) || "").trim(),
    email:String(outreachValue_(row, ["email", "email_address"]) || "").trim(),
    postal_code:String(outreachValue_(row, ["zip", "zip_code", "postal_code"]) || "").trim(),
    city:String(outreachValue_(row, ["city", "town"]) || "").trim(),
    county:String(outreachValue_(row, ["county"]) || "").trim(),
    segment:String(outreachValue_(row, ["segment"]) || "").trim(),
    wave:String(outreachValue_(row, ["wave"]) || "").trim(),
    craft_spirit_fit:Number(outreachValue_(row, ["craft-spirit_fit_(1–5)", "craft-spirit_fit_(1-5)", "craft_spirit_fit", "craft_spirit_fit_(1–5)"]) || 0),
    status:String(outreachValue_(row, ["status"]) || "Not contacted").trim(),
    outcome:String(outreachValue_(row, ["outcome"]) || "").trim(),
    do_not_email:toBool_(outreachValue_(row, ["do_not_email", "do_not_contact"])),
    email_confidence:String(outreachValue_(row, ["email_confidence"]) || "").trim(),
    last_emailed:outreachValue_(row, ["last_emailed", "last_email"]),
    message_id:String(outreachValue_(row, ["message_id", "zoho_message_id"]) || "").trim(),
    next_email:String(outreachValue_(row, ["next_email", "stage"]) || "Initial").trim(),
    next_follow_up:outreachValue_(row, ["next_follow-up", "next_follow_up"]),
    activity:[],
  };
}

function legacyPilotSent_(record) {
  if (!__LEGACY_PILOT_SENT_BY_EMAIL) {
    __LEGACY_PILOT_SENT_BY_EMAIL = new Map();
    const sheet = getOutreachSs_().getSheetByName(OUTREACH_PILOT_SHEET_NAME);
    if (sheet && sheet.getLastRow() >= 2) getAllRowsAsObjects_(sheet).forEach(row => {
      const email = String(outreachValue_(row, ["email", "intended_recipient"]) || "").trim().toLowerCase();
      const business = String(outreachValue_(row, ["business", "business_name"]) || "").trim().toLowerCase();
      const status = String(outreachValue_(row, ["send_status", "status"]) || "").trim().toUpperCase();
      const messageId = String(outreachValue_(row, ["message_id", "zoho_message_id"]) || "").trim();
      const sentAt = outreachValue_(row, ["sent_at", "sent_timestamp"]);
      if (!email || !(status.indexOf("SENT") === 0 || !!messageId || !!sentAt)) return;
      const businesses = __LEGACY_PILOT_SENT_BY_EMAIL.get(email) || new Set();
      businesses.add(business);
      __LEGACY_PILOT_SENT_BY_EMAIL.set(email, businesses);
    });
  }
  const businesses = __LEGACY_PILOT_SENT_BY_EMAIL.get(String(record.email || "").trim().toLowerCase());
  return !!businesses && (businesses.has("") || businesses.has(String(record.business || "").trim().toLowerCase()));
}

function initialSentActivityForRecipient_(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  const headers = getHeaderMap_(sheet);
  const recipientHeader = headers.intended_recipient !== undefined ? "intended_recipient" : headers.delivered_to !== undefined ? "delivered_to" : "";
  if (!recipientHeader) return false;
  // One TextFinder lookup avoids rebuilding the Activity Log during delivery.
  return outreachRowsMatchingCell_(sheet, [recipientHeader], normalized).some(initialSentActivityRow_);
}

function initialSentDirectoryEmailElsewhere_(email, sourceRow) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  return outreachRowsMatchingCell_(sheet, ["email", "email_address"], normalized)
    .some(row => Number(row.__source_row) !== Number(sourceRow) && !!outreachValue_(row, ["last_emailed", "last_email"]));
}

function outreachStageIsDue_(record, now) {
  const dueAt = outreachDate_(record.next_follow_up);
  const endOfToday = new Date(now || new Date());
  endOfToday.setHours(23, 59, 59, 999);
  return !!dueAt && dueAt.getTime() <= endOfToday.getTime();
}

function outreachRecentStageSend_(record, stage, cooldownDays, now) {
  const cutoff = new Date(now || new Date());
  cutoff.setDate(cutoff.getDate() - Number(cooldownDays || 0));
  return (record.activity || []).some(item => {
    const result = String(item.result || "").toUpperCase();
    if (String(item.stage || "").trim().toLowerCase() !== String(stage || "").trim().toLowerCase() || result.indexOf("SENT") < 0 || result.indexOf("TEST") >= 0) return false;
    const sentAt = outreachDate_(item.timestamp);
    // An undated activity row is unsafe to repeat; retain the previous fail-closed behavior.
    return !sentAt || sentAt.getTime() >= cutoff.getTime();
  });
}

function outreachSendEligibility_(record, options) {
  const reasons = [];
  const email = String(record.email || "").trim().toLowerCase();
  const stage = String(record.next_email || "Initial").trim();
  const status = outreachStatusLower_(record);
  const outcome = String(record.outcome || "").trim().toLowerCase();
  const confidence = String(record.email_confidence || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reasons.push("Recipient email is invalid");
  if (record.do_not_email || ["closed", "do not contact", "not interested", "unsubscribed"].includes(status) || ["bad address", "closed", "unsubscribed", "not interested", "do not contact"].includes(outcome)) reasons.push("Business is excluded from email");
  if (outreachIsCocktailListOutcome_(outcome)) reasons.push("Recipient receives the cocktail list instead of sales outreach");
  const crossSendCooldown = outreachCrossSendCooldownReason_(email, false);
  if (crossSendCooldown) reasons.push(crossSendCooldown);
  if (confidence && !["confirmed", "published", "supplied"].includes(confidence)) reasons.push("Recipient email is not verified");
  const sentForStage = (record.activity || []).some(item => {
    const result = String(item.result || "").toUpperCase();
    return String(item.stage || "").trim().toLowerCase() === stage.toLowerCase() && result.indexOf("SENT") >= 0 && result.indexOf("TEST") < 0;
  });
  if (stage === "Nurture check-in") {
    if (outreachRecentStageSend_(record, stage, NURTURE_CHECK_IN_DUPLICATE_COOLDOWN_DAYS)) reasons.push(`${stage} was sent within the last ${NURTURE_CHECK_IN_DUPLICATE_COOLDOWN_DAYS} days`);
  } else if (sentForStage) reasons.push(`${stage} was already sent`);
  if (stage === "Initial") {
    if (options?.initial_sent_emails?.has(email)) reasons.push("An initial email was already sent to this address");
    if (record.last_emailed || record.message_id || (!options?.skip_legacy_pilot && legacyPilotSent_(record))) reasons.push("An initial email was already sent");
    if (!["not contacted", "review", "approved"].includes(status)) reasons.push("Business is not eligible for initial outreach");
  } else if (stage === "Follow-up 1" || stage === "Follow-up 2") {
    if (!["follow-up due", "sent", "follow-up sent"].includes(status)) reasons.push("Follow-up is not due");
    if (!outreachStageIsDue_(record)) reasons.push("Follow-up date has not arrived");
  } else if (stage === "Nurture check-in") {
    if (status !== "nurture") reasons.push("Nurture check-in is not due");
    if (!outreachStageIsDue_(record)) reasons.push("Nurture check-in date has not arrived");
  } else if (stage === "Reactivation") {
    if (!["reactivation due", "use reactivation"].includes(status)) reasons.push("Reactivation is not due");
  } else {
    reasons.push("Email stage is not sendable");
  }
  return Array.from(new Set(reasons));
}

function outreachNextStage_(stage) {
  if (stage === "Initial") return "Follow-up 1";
  if (stage === "Follow-up 1") return "Follow-up 2";
  if (stage === "Follow-up 2" || stage === "Nurture check-in") return "Nurture check-in";
  return "Complete";
}

function outreachAddDays_(date, days) {
  const value = new Date(date.getTime());
  value.setDate(value.getDate() + Number(days || 0));
  return value;
}

function advanceOutreachSend_(sheet, rowNumber, record, stage, messageId, sentAt, settings, existingValues) {
  const h = getHeaderMap_(sheet);
  const values = existingValues || sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  const setCell = (keys, value) => {
    const key = keys.find(candidate => h[candidate] !== undefined);
    if (key) values[h[key]] = value;
  };
  settings = settings || getOutreachCampaignSettings_();
  const nextStage = outreachNextStage_(stage);
  const followUpDays = nextStage === "Nurture check-in"
    ? Number(settings["Nurture check-in days"] || 90)
    : stage === "Initial"
      ? Number(settings["Follow-up days"] || 7)
      : Number(settings["Second follow-up days"] || 7);
  setCell(["queue", "queue?"], false);
  setCell(["next_email", "stage"], nextStage);
  setCell(["status"], nextStage === "Nurture check-in" ? "Nurture" : stage === "Initial" ? "Sent" : stage === "Reactivation" ? "Reactivation sent" : "Follow-up sent");
  setCell(["last_emailed", "last_email"], sentAt);
  setCell(["next_follow-up", "next_follow_up"], nextStage === "Complete" ? "" : outreachAddDays_(sentAt, followUpDays));
  setCell(["message_id", "zoho_message_id"], messageId || "");
  setCell(["record_updated_at"], new Date());
  sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
  return nextStage;
}

function finalizeOutreachSend_(sheet, rowNumber, record, stage, messageId, sentAt, staffName, idempotencyToken, existingValues) {
  const nextStage = advanceOutreachSend_(sheet, rowNumber, record, stage, messageId, sentAt, null, existingValues);
  appendAudit_("SEND_OUTREACH_EMAIL", "Account", record.account_id, record.account_id, staffName, OUTREACH_DRAFTS_SHEET_NAME, OUTREACH_ACTIVITY_SHEET_NAME, "Completed", `${stage}; message ${messageId || "accepted without message ID"}; token ${idempotencyToken}`);
  return nextStage;
}

function apiSendOutreachEmail_(p, testMode) {
  if (!p) throw new Error("Missing send request.");
  requireFields_(p, ["source_row", "business", "message_stage", "idempotency_token", "staff_name"]);
  const token = String(p.idempotency_token || "").trim();
  if (!/^[A-Za-z0-9_-]{20,160}$/.test(token)) throw new Error("A valid idempotency token is required.");
  const rowNumber = Number(p.source_row);
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error("Business row not found.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another outreach send is in progress. Wait a moment and try again.");
  let accepted = false;
  let acceptedMessageId = "";
  try {
    const h = getHeaderMap_(sheet);
    const values = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    const current = {};
    Object.keys(h).forEach(key => current[key] = values[h[key]]);
    const activityMap = outreachActivityMap_();
    const settings = getOutreachCampaignSettings_();
    const draftMap = outreachDraftMap_();
    const record = outreachRecord_(current, rowNumber, activityMap, settings, draftMap, outreachProgramMap_(), outreachEngagementMap_());
    const stage = String(record.next_email || "Initial").trim();
    if (record.business !== String(p.business || "").trim()) throw new Error("Business row changed. Refresh and try again.");
    if (p.email && record.email.toLowerCase() !== String(p.email).trim().toLowerCase()) throw new Error("Recipient changed. Refresh and try again.");
    if (p.account_id && record.account_id !== String(p.account_id).trim()) throw new Error("Account identity changed. Refresh and try again.");
    if (stage.toLowerCase() !== String(p.message_stage || "").trim().toLowerCase()) throw new Error("Email stage changed. Refresh and try again.");
    if (!record.has_saved_draft) throw new Error("Save the reviewed subject and message before sending.");
    if (String(p.subject || "").trim() !== record.subject || String(p.body_text || "").trim() !== record.body_text) throw new Error("The reviewed draft changed. Save it again before sending.");

    let result = !testMode ? acceptedOutreachSendForToken_(token) : null;
    if (!result) {
      // A test is delivered only to Karl and never changes the prospect's send
      // status. Real sends still require a valid, verified, eligible recipient.
      const reasons = testMode ? [] : outreachSendEligibility_(record);
      if (reasons.length) throw new Error(reasons.join("; ") + ".");
      const testDraft = draftMap.get(outreachDraftKey_(record.account_id || rowNumber, stage)) || draftMap.get(outreachDraftKey_(rowNumber, stage));
      const html = testMode ? outreachMessage_(current, settings, testDraft, true).html : record.preview_html;
      result = callOutreachMailer_({
        action:testMode ? "sendAppTestEmail" : "sendAppEmail",
        idempotency_token:token,
        account_id:record.account_id,
        source_row:rowNumber,
        business:record.business,
        recipient:record.email,
        message_stage:stage,
        subject:record.subject,
        html:html,
        requested_by:publicText_(p.staff_name, 120, "Staff name"),
      });
    }
    if (!result.accepted) throw new Error("Zoho did not accept the email.");
    accepted = true;
    acceptedMessageId = String(result.message_id || "");
    if (result.partial_failure) {
      appendAudit_("SEND_OUTREACH_EMAIL_PARTIAL", "Account", record.account_id, record.account_id, String(p.staff_name || "Staff"), "Distribution Outreach", OUTREACH_ACTIVITY_SHEET_NAME, "Needs recovery", String(result.partial_failure));
    }
    if (testMode) return { message:"Test email accepted by Zoho. The business was not marked sent.", test:true, message_id:acceptedMessageId, idempotent:!!result.idempotent };
    const sentAt = result.sent_at ? new Date(result.sent_at) : new Date();
    const nextStage = finalizeOutreachSend_(sheet, rowNumber, record, stage, acceptedMessageId, isNaN(sentAt.getTime()) ? new Date() : sentAt, publicText_(p.staff_name, 120, "Staff name"), token);
    return { message:"Email accepted by Zoho and recorded.", accepted:true, message_id:acceptedMessageId, next_stage:nextStage, idempotent:!!result.idempotent };
  } catch (error) {
    if (accepted) {
      appendAudit_("SEND_OUTREACH_EMAIL_PARTIAL", "Account", String(p.account_id || ""), String(p.account_id || ""), String(p.staff_name || "Staff"), OUTREACH_ACTIVITY_SHEET_NAME, OUTREACH_SHEET_NAME, "Needs recovery", `Zoho accepted message ${acceptedMessageId || "without ID"}; ${String(error.message || error)}`);
      throw new Error(`Zoho accepted the email${acceptedMessageId ? ` (${acceptedMessageId})` : ""}, but follow-up recording needs recovery. Do not resend; retry with the same review window.`);
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function apiUpdateOutreachOutcome_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["source_row", "business", "outcome"]);

  const outcome = String(p.outcome || "").trim();
  if (!OUTREACH_OUTCOME_VALUES.includes(outcome)) throw new Error("Unsupported outcome.");
  const followUpText = String(p.next_follow_up || "").trim();
  if (OUTREACH_FOLLOW_UP_OUTCOMES.has(outcome) && !followUpText) {
    throw new Error(`Choose a next follow-up date for “${outcome}.”`);
  }
  const followUpDate = followUpText ? new Date(`${followUpText}T12:00:00`) : null;
  if (followUpText && isNaN(followUpDate.getTime())) throw new Error("Next follow-up date is invalid.");

  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(p.source_row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error("Lead row not found.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another outreach update is in progress.");
  try {
    const h = getHeaderMap_(sheet);
    const rowRange = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn());
    const values = rowRange.getValues()[0];
    const originalValues = values.slice();
    const current = {};
    Object.keys(h).forEach(key => current[key] = values[h[key]]);
    const currentBusiness = String(outreachValue_(current, ["business", "business_name"]) || "").trim();
    const currentEmail = String(outreachValue_(current, ["email", "email_address"]) || "").trim();
    const accountId = String(current.account_id || "").trim();
    if (currentBusiness !== String(p.business || "").trim()) throw new Error("Lead changed in the sheet. Refresh and try again.");
    if (p.email && currentEmail !== String(p.email).trim()) throw new Error("Contact email changed in the sheet. Refresh and try again.");
    if (p.account_id && accountId !== String(p.account_id).trim()) throw new Error("Account identity changed. Refresh and try again.");

    const setRowValue = (keys, value) => {
      const key = keys.find(candidate => h[candidate] !== undefined);
      if (key) values[h[key]] = value;
    };
    setRowValue(["status"], outreachStatusForOutcome_(outcome));
    setRowValue(["outcome"], outcome);
    setRowValue(["record_updated_at"], new Date());
    if (followUpDate) setRowValue(["next_follow-up", "next_follow_up"], followUpDate);
    if (["Not interested", "Unsubscribed"].includes(outcome)) setRowValue(["do_not_email", "do_not_contact"], true);
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    const priorNotes = String(outreachValue_(current, ["notes"]) || "").trim();
    // Logged from a reply sent from another address: remember that address so later replies match this business.
    let altLine = "";
    if (p.reply_id) {
      try {
        const repliesSheet = getInboundRepliesSheet_(false);
        const found = repliesSheet ? outreachRowsMatchingCell_(repliesSheet, ["reply_id", "Reply ID"], String(p.reply_id).trim()) : [];
        if (found.length && String(found[0].account_id || "").trim() === accountId) altLine = inboundReplyAltEmailLine_(found[0], currentEmail, priorNotes, today);
      } catch (error) { console.warn(`Alt email not learned from reply ${p.reply_id}: ${String(error.message || error)}`); }
    }
    const newNoteLines = [p.notes ? `${today} - ${String(p.notes).trim()}` : "", altLine].filter(Boolean);
    if (newNoteLines.length) setRowValue(["notes"], [priorNotes].concat(newNoteLines).filter(Boolean).join("\n"));

    if (h.outcome !== undefined) {
      sheet.getRange(rowNumber, h.outcome + 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(OUTREACH_OUTCOME_VALUES, true).setAllowInvalid(false).build()
      );
    }
    writeChangedRowCells_(sheet, rowNumber, originalValues, values);

    if (outreachIsCocktailListOutcome_(outcome)) {
      upsertNewsletterFromCocktailReply_({
        account_id:accountId,
        source_row:rowNumber,
        business:currentBusiness,
        contact:String(outreachValue_(current, ["contact", "contact_name", "contact_person", "first_name"]) || "").trim(),
        email:currentEmail,
        relationship:String(outreachValue_(current, ["relationship"]) || "").trim(),
      }, new Date());
    }
    if (outcome === "Unsubscribed") unsubscribeNewsletterContactByEmail_(currentEmail, String(p.staff_name || "Outreach outcome"));

    appendOutreachActivity_({ account_id:accountId, business:currentBusiness, email:currentEmail }, outcome, String(p.notes || ""));
    appendAudit_("UPDATE_OUTREACH_OUTCOME", "Account", accountId, accountId, String(p.staff_name || "Staff"), OUTREACH_SHEET_NAME, OUTREACH_SHEET_NAME, "Completed", outcome);
    // The reply it was logged from is handled, and every reply of this business waiting for an outcome gets it.
    let reply = null;
    try { reply = recordInboundReplyOutcome_(accountId, outcome, String(p.staff_name || "Staff"), p.reply_id || ""); }
    catch (error) { console.warn(`Outcome saved; replies not updated: ${String(error.message || error)}`); }
    const altEmail = altLine ? (altLine.match(/Alt email: (\S+)/) || [])[1] || "" : "";
    return { message:altEmail ? `Outcome saved. ${altEmail} added as an alternate email.` : "Outcome saved.", account_id:accountId, source_row:rowNumber, status:outreachStatusForOutcome_(outcome), reply:reply, alt_email_added:altEmail };
  } finally {
    lock.releaseLock();
  }
}

function apiLogOutreachContact_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["source_row", "business", "contact_date", "channel", "staff_name"]);
  const channels = ["In person", "Phone", "Email outside app", "Event/tasting", "Other"];
  const channel = String(p.channel || "").trim();
  if (!channels.includes(channel)) throw new Error("Choose a listed contact channel.");
  const contactDateText = String(p.contact_date || "").trim();
  const contactDate = new Date(`${contactDateText}T12:00:00`);
  if (isNaN(contactDate.getTime())) throw new Error("Contact date is invalid.");
  const outcome = String(p.outcome || "").trim();
  if (outcome && !OUTREACH_OUTCOME_VALUES.includes(outcome)) throw new Error("Unsupported outcome.");
  const followUpText = String(p.next_follow_up || "").trim();
  if (outcome && OUTREACH_FOLLOW_UP_OUTCOMES.has(outcome) && !followUpText) throw new Error(`Choose a next follow-up date for “${outcome}.”`);
  const followUpDate = followUpText ? new Date(`${followUpText}T12:00:00`) : null;
  if (followUpText && isNaN(followUpDate.getTime())) throw new Error("Next follow-up date is invalid.");
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(p.source_row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error("Lead row not found. Add the business before logging contact.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another outreach update is in progress.");
  try {
    const h = getHeaderMap_(sheet);
    const range = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn());
    const values = range.getValues()[0];
    const originalValues = values.slice();
    const current = {}; Object.keys(h).forEach(key => current[key] = values[h[key]]);
    const business = String(outreachValue_(current, ["business", "business_name"]) || "").trim();
    const email = String(outreachValue_(current, ["email", "email_address"]) || "").trim();
    const accountId = String(current.account_id || "").trim();
    if (business !== String(p.business || "").trim()) throw new Error("Lead changed in the sheet. Refresh and try again.");
    const set = (keys, value) => { const key = keys.find(key => h[key] !== undefined); if (key) values[h[key]] = value; };
    const notes = publicText_(p.notes || "", 4000, "Notes");
    const contactPerson = publicText_(p.contact_person || "", 120, "Contact person");
    const noteDetail = [channel, contactPerson && `with ${contactPerson}`, notes].filter(Boolean).join(" — ");
    let automaticFollowUpText = "";
    if (outcome) {
      set(["status"], outreachStatusForOutcome_(outcome));
      set(["outcome"], outcome);
      if (followUpDate) set(["next_follow-up", "next_follow_up"], followUpDate);
      if (["Not interested", "Unsubscribed"].includes(outcome)) set(["do_not_email", "do_not_contact"], true);
    }
    if (channel === "Email outside app") {
      set(["last_emailed"], contactDate);
      const nextKey = ["next_email"].find(key => h[key] !== undefined);
      if (nextKey && String(values[h[nextKey]] || "").trim().toLowerCase() === "initial") values[h[nextKey]] = "Follow-up 1";
      if (!outcome) {
        const settings = getOutreachCampaignSettings_();
        const followUpDays = Number(settings["Follow-up days"] || 7);
        const automaticFollowUp = new Date(contactDate);
        automaticFollowUp.setDate(automaticFollowUp.getDate() + (Number.isFinite(followUpDays) ? followUpDays : 7));
        set(["status"], "Sent");
        set(["next_follow-up", "next_follow_up"], automaticFollowUp);
        automaticFollowUpText = Utilities.formatDate(automaticFollowUp, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
    }
    const priorNotes = String(outreachValue_(current, ["notes"]) || "").trim();
    const datedNote = `${Utilities.formatDate(contactDate, Session.getScriptTimeZone(), "yyyy-MM-dd")} — ${noteDetail || "Contact logged"}`;
    set(["notes"], priorNotes ? `${priorNotes}\n${datedNote}` : datedNote);
    set(["record_updated_at"], new Date());
    writeChangedRowCells_(sheet, rowNumber, originalValues, values);
    if (outcome && outreachIsCocktailListOutcome_(outcome)) {
      upsertNewsletterFromCocktailReply_({
        account_id:accountId,
        source_row:rowNumber,
        business:business,
        contact:String(outreachValue_(current, ["contact", "contact_name", "contact_person", "first_name"]) || "").trim(),
        email:email,
        relationship:String(outreachValue_(current, ["relationship"]) || "").trim(),
      }, contactDate);
    }
    if (outcome === "Unsubscribed") unsubscribeNewsletterContactByEmail_(email, String(p.staff_name || "Outreach contact log"));
    const activity = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
    const ah = ensureHeaderColumns_(activity, [ACCOUNT_ID_HEADER]);
    const activityRow = Array(activity.getLastColumn()).fill("");
    const activitySet = (key, value) => { if (ah[key] !== undefined) activityRow[ah[key]] = value; };
    activitySet("timestamp", contactDate); activitySet("account_id", accountId); activitySet("business", business);
    activitySet("intended_recipient", email); activitySet("message_stage", channel); activitySet("subject", "Staff contact log");
    activitySet("result", "CONTACT LOGGED"); activitySet("error/detail", noteDetail); activitySet("error_detail", noteDetail);
    activitySet("staff", String(p.staff_name)); activitySet("mailer_version", APP_VERSION);
    activity.appendRow(activityRow);
    appendAudit_("LOG_OUTREACH_CONTACT", "Account", accountId, accountId, String(p.staff_name), OUTREACH_SHEET_NAME, OUTREACH_ACTIVITY_SHEET_NAME, "Completed", `${channel}${outcome ? `; ${outcome}` : ""}`);
    if (outcome) {
      try { recordInboundReplyOutcome_(accountId, outcome, String(p.staff_name || "Staff"), ""); }
      catch (error) { console.warn(`Contact logged; replies not updated: ${String(error.message || error)}`); }
    }
    return { message:"Contact logged.", account_id:accountId, source_row:rowNumber, status:outcome ? outreachStatusForOutcome_(outcome) : (channel === "Email outside app" ? "Sent" : String(outreachValue_(current, ["status"]) || "")), next_follow_up:followUpText || automaticFollowUpText };
  } finally { lock.releaseLock(); }
}

function apiUpdateOutreachBusiness_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["source_row", "business"]);
  if (!p.updates || typeof p.updates !== "object" || Array.isArray(p.updates)) throw new Error("Missing updates.");

  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(p.source_row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error("Business row not found.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another update is in progress. Try again in a moment.");
  try {
    const h = getHeaderMap_(sheet);
    const values = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    const current = {};
    Object.keys(h).forEach(key => current[key] = values[h[key]]);
    const currentBusiness = String(outreachValue_(current, ["business", "business_name"]) || "").trim();
    const currentEmail = String(outreachValue_(current, ["email", "email_address"]) || "").trim();
    const accountId = String(current.account_id || "").trim();
    if (currentBusiness !== String(p.business || "").trim()) throw new Error("Business row changed. Refresh and try again.");
    if (p.original_email && currentEmail !== String(p.original_email).trim()) throw new Error("Contact information changed. Refresh and try again.");
    if (p.account_id && accountId !== String(p.account_id).trim()) throw new Error("Account identity changed. Refresh and try again.");

    const changed = [];
    let milesEditedManually = false;
    let zipChanged = false;
    Object.keys(p.updates).forEach(canonical => {
      if (!Object.prototype.hasOwnProperty.call(OUTREACH_EDITABLE_FIELD_KEYS, canonical)) return;
      const actualKey = OUTREACH_EDITABLE_FIELD_KEYS[canonical].find(key => h[key] !== undefined);
      if (!actualKey) return;
      const value = String(p.updates[canonical] ?? "").trim();
      if (canonical === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("Enter a valid email address.");
      if (canonical === "craft_spirit_fit" && value && (!Number.isFinite(Number(value)) || Number(value) < 1 || Number(value) > 5)) {
        throw new Error("Craft-spirit fit must be between 1 and 5.");
      }
      if (canonical === "priority" && !["High", "Normal", "Low"].includes(value)) {
        throw new Error("Priority must be High, Normal, or Low.");
      }
      if (canonical === "miles" && value && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
        throw new Error("Miles must be zero or greater.");
      }
      if (canonical === "email_confidence" && value && !["Confirmed", "Published", "Supplied", "Needs verification"].includes(value)) {
        throw new Error("Choose a listed email confidence.");
      }
      if (String(current[actualKey] ?? "").trim() === value) return;
      values[h[actualKey]] = value;
      if (canonical === "miles") milesEditedManually = true;
      if (canonical === "postal_code") zipChanged = true;
      changed.push(outreachFieldLabel_(canonical));
    });

    if (milesEditedManually) {
      if (h.miles_source === undefined) throw new Error("Run Recalculate miles from ZIP once before saving a manual mileage override.");
      values[h.miles_source] = "manual";
    } else if (zipChanged) {
      const zipKey = OUTREACH_EDITABLE_FIELD_KEYS.postal_code.find(key => h[key] !== undefined);
      const result = setDirectoryMilesFromZip_(values, h, zipKey ? values[h[zipKey]] : "");
      if (result.updated) changed.push("Miles from ZIP");
    }

    const additionalNote = String(p.additional_note || "").trim();
    if (additionalNote) {
      const notesKey = ["notes"].find(key => h[key] !== undefined);
      if (!notesKey) throw new Error("The directory does not have a Notes column.");
      const priorNotes = String(current[notesKey] || "").trim();
      const datedNote = `${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd")} - ${additionalNote}`;
      values[h[notesKey]] = priorNotes ? `${priorNotes}\n${datedNote}` : datedNote;
      changed.push("Notes");
    }

    if (!changed.length) return { message:"No contact changes to save.", source_row:rowNumber, changed:[] };
    if (h.record_updated_at !== undefined) values[h.record_updated_at] = new Date();
    sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
    appendOutreachActivity_(
      { account_id:accountId, business:currentBusiness, email:String(p.updates.email || currentEmail) },
      "CONTACT UPDATED",
      `Updated ${changed.join(", ")}`
    );
    appendAudit_("UPDATE_BUSINESS", "Account", accountId, accountId, String(p.staff_name || "Staff"), OUTREACH_SHEET_NAME, OUTREACH_SHEET_NAME, "Completed", changed.join(", "));
    return { message:"Contact information saved.", account_id:accountId, source_row:rowNumber, changed:changed };
  } finally {
    lock.releaseLock();
  }
}

function apiUpdateOutreachPrograms_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["source_row", "business", "newsletter_status", "ordering_status"]);

  const newsletterStatuses = ["Not invited", "Candidate", "Invite planned", "Invited", "Subscribed", "Declined", "Unsubscribed"];
  const orderingStatuses = ["Not offered", "Candidate", "Invite planned", "Invited", "Active", "Paused"];
  const newsletterStatus = String(p.newsletter_status || "").trim();
  const orderingStatus = String(p.ordering_status || "").trim();
  if (!newsletterStatuses.includes(newsletterStatus)) throw new Error("Choose a listed newsletter status.");
  if (!orderingStatuses.includes(orderingStatus)) throw new Error("Choose a listed online-ordering status.");

  const consentSource = String(p.newsletter_consent_source || "").trim();
  const newsletterDate = String(p.newsletter_status_date || "").trim();
  if (newsletterStatus === "Subscribed" && (!consentSource || !newsletterDate)) {
    throw new Error("A subscribed newsletter contact needs a consent source and status date.");
  }

  const leadsSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(p.source_row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > leadsSheet.getLastRow()) throw new Error("Business row not found.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another program update is in progress. Try again in a moment.");
  try {
    const leadHeaders = getHeaderMap_(leadsSheet);
    const leadValues = leadsSheet.getRange(rowNumber, 1, 1, leadsSheet.getLastColumn()).getValues()[0];
    const current = {};
    Object.keys(leadHeaders).forEach(key => current[key] = leadValues[leadHeaders[key]]);
    const currentBusiness = String(outreachValue_(current, ["business", "business_name"]) || "").trim();
    const currentEmail = String(outreachValue_(current, ["email", "email_address"]) || "").trim();
    const accountId = String(current.account_id || "").trim();
    if (currentBusiness !== String(p.business || "").trim()) throw new Error("Business row changed. Refresh and try again.");
    if (p.email && currentEmail !== String(p.email).trim()) throw new Error("Contact email changed. Refresh and try again.");
    if (p.account_id && accountId !== String(p.account_id).trim()) throw new Error("Account identity changed. Refresh and try again.");

    const sheet = getOutreachProgramSheet_(true);
    const h = getHeaderMap_(sheet);
    const programKey = `account::${accountId || rowNumber}`;
    const now = new Date();
    const updatedBy = authenticatedActor_(p, "Sturgeon Distribution Hub");
    const values = Array(sheet.getLastColumn()).fill("");
    const set = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
    set("program_key", programKey);
    set("account_id", accountId);
    set("source_row", rowNumber);
    set("business_name", currentBusiness);
    set("email", currentEmail);
    set("newsletter_status", newsletterStatus);
    set("newsletter_consent_source", consentSource);
    set("newsletter_status_date", newsletterDate ? new Date(`${newsletterDate}T12:00:00`) : "");
    set("ordering_status", orderingStatus);
    set("ordering_customer_id", String(p.ordering_customer_id || "").trim());
    set("ordering_invite_date", p.ordering_invite_date ? new Date(`${p.ordering_invite_date}T12:00:00`) : "");
    set("ordering_portal_url", String(p.ordering_portal_url || "").trim());
    set("updated_at", now);
    set("updated_by", updatedBy);
    set("notes", String(p.notes || "").trim());
    set("app_version", APP_VERSION);

    let targetRow = sheet.getLastRow() + 1;
    if (sheet.getLastRow() >= 2) {
      const keyColumn = h.program_key + 1;
      const keys = sheet.getRange(2, keyColumn, sheet.getLastRow() - 1, 1).getValues();
      const match = keys.findIndex(row => String(row[0] || "") === programKey);
      if (match >= 0) targetRow = match + 2;
    }
    sheet.getRange(targetRow, 1, 1, values.length).setValues([values]);

    const activitySheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
    const activityHeaders = ensureHeaderColumns_(activitySheet, [ACCOUNT_ID_HEADER]);
    const activityRow = Array(activitySheet.getLastColumn()).fill("");
    const setActivity = (key, value) => { if (activityHeaders[key] !== undefined) activityRow[activityHeaders[key]] = value; };
    setActivity("timestamp", now);
    setActivity("account_id", accountId);
    setActivity("business", currentBusiness);
    setActivity("intended_recipient", currentEmail);
    setActivity("message_stage", "PROGRAMS");
    setActivity("subject", "Optional program plan updated");
    setActivity("result", "PROGRAM PLAN SAVED");
    setActivity("error/detail", `Newsletter: ${newsletterStatus}; Online ordering: ${orderingStatus}; no action sent.`);
    setActivity("error_detail", `Newsletter: ${newsletterStatus}; Online ordering: ${orderingStatus}; no action sent.`);
    setActivity("mailer_version", APP_VERSION);
    activitySheet.appendRow(activityRow);
    appendAudit_("UPDATE_ACCOUNT_PROGRAMS", "Account", accountId, accountId, updatedBy, OUTREACH_SHEET_NAME, OUTREACH_PROGRAMS_SHEET_NAME, "Completed", `Newsletter: ${newsletterStatus}; ordering: ${orderingStatus}`);

    return { message:"Program plan saved.", account_id:accountId, source_row:rowNumber, updated_at:now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function getNewsletterContactsSheet_(createIfMissing) {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(NEWSLETTER_CONTACTS_SHEET_NAME);
  if (sheet) {
    ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER]);
    return sheet;
  }
  if (!createIfMissing) return sheet;
  sheet = ss.insertSheet(NEWSLETTER_CONTACTS_SHEET_NAME);
  const headers = [["Contact ID", "Account ID", "Name", "Email", "Organization", "Relationship Type", "Status", "Consent Source", "Consent Date", "Source Row", "Source Business", "Topics", "Notes", "Updated At", "Updated By", "App Version"]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers).setFontWeight("bold").setBackground("#e5e7eb").setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  return sheet;
}

function apiUpsertNewsletterContact_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["email", "relationship_type", "status"]);
  const email = String(p.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  const relationships = ["Customer", "Prospect", "Vendor", "Banker", "Distributor", "Community", "Partner", "Other"];
  const statuses = ["Candidate", "Invite planned", "Invited", "Subscribed", "Declined", "Unsubscribed"];
  if (!relationships.includes(String(p.relationship_type))) throw new Error("Choose a listed relationship.");
  if (!statuses.includes(String(p.status))) throw new Error("Choose a listed newsletter status.");
  if (p.status === "Subscribed" && (!String(p.consent_source || "").trim() || !p.consent_date)) {
    throw new Error("A subscribed contact needs a consent source and consent date.");
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another newsletter update is in progress. Try again in a moment.");
  try {
    const sheet = getNewsletterContactsSheet_(true);
    const h = getHeaderMap_(sheet);
    const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    const requestedId = String(p.contact_id || "").trim();
    let targetRow = 0;
    rows.forEach((row, index) => {
      const rowId = String(row[h.contact_id] || "");
      const rowEmail = String(row[h.email] || "").trim().toLowerCase();
      if (requestedId && rowId === requestedId) targetRow = index + 2;
      else if (!requestedId && rowEmail === email) throw new Error("That email is already on the newsletter list. Open the existing contact to edit it.");
    });
    const contactId = requestedId || Utilities.getUuid();
    const now = new Date();
    const values = Array(sheet.getLastColumn()).fill("");
    const set = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
    set("contact_id", contactId);
    set("account_id", String(p.account_id || "").trim());
    set("name", String(p.name || "").trim());
    set("email", email);
    set("organization", String(p.organization || "").trim());
    set("relationship_type", String(p.relationship_type));
    set("status", String(p.status));
    set("consent_source", String(p.consent_source || "").trim());
    set("consent_date", p.consent_date ? new Date(`${p.consent_date}T12:00:00`) : "");
    set("source_row", p.source_row || "");
    set("source_business", String(p.source_business || "").trim());
    set("topics", String(p.topics || "").trim());
    set("notes", String(p.notes || "").trim());
    set("updated_at", now);
    set("updated_by", authenticatedActor_(p, "Sturgeon Distribution Hub"));
    set("app_version", APP_VERSION);
    sheet.getRange(targetRow || sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
    return { message:"Newsletter contact saved.", contact_id:contactId, updated_at:now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

