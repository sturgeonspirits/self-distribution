// Inventory API, part 6 of 12: Replies: the inbound reply checker, bounces, outcomes learned from replies, replies answered from Zoho.
// The parts load in order 01 to 12 (filePushOrder in .clasp.json); version and change notes are in 01-core.gs.

// ---------- Inbound reply checker (2026.10.09.38-APP) ----------
// Every 15 minutes the Hub asks the Distribution Outreach mailer for new sales@ Inbox messages,
// keeps the ones that come from businesses and contacts we email, sorts what fixed rules can
// sort, and lists each in the Replies view with a respond-by time. Replies the rules cannot
// sort are left as "Needs reading" for the sort-inbound-replies Claude skill
// (.claude/skills/sort-inbound-replies), which fills in the category, summary and respond-by.
// The Hub makes no AI calls. Only the safe stops happen without a click: a person's reply
// pauses that business's follow-ups, a plain "stop" reply unsubscribes, and a hard bounce marks
// the address bad. Everything else is a suggestion staff confirm.
const INBOUND_REPLIES_SHEET_NAME = "Inbound Replies";
const INBOUND_REPLY_HEADERS = [
  "Reply ID", "Received At", "From", "From Name", "Subject", "Reply Text", "Account ID", "Source Row", "Business",
  "Relationship", "Matched By", "Last Sent Stage", "Last Sent At", "Category", "Summary", "Suggested Outcome", "Priority",
  "Respond By", "Auto Action", "Classifier", "Status", "Handled At", "Handled By", "Handled Note", "Zoho Message ID",
  "Zoho Folder ID", "Thread ID", "App Version", "Outcome Logged",
];
const INBOUND_REPLY_CHECK_HANDLER = "runInboundReplyCheck";
const INBOUND_REPLY_LOOKBACK_DAYS = 14;
const INBOUND_REPLY_RUN_BUDGET_MS = 4 * 60 * 1000;
const INBOUND_REPLY_SINCE_PROPERTY = "INBOUND_REPLY_SINCE_MS";
const INBOUND_REPLY_LAST_RUN_PROPERTY = "INBOUND_REPLY_LAST_RUN";
const INBOUND_REPLY_RUNNING_CACHE_KEY = "inbound_reply_check_running";
const INBOUND_REPLY_OWN_ADDRESSES = ["sales@sturgeonspirits.com", "karl@sturgeonspirits.com"];
const INBOUND_REPLY_FREE_MAIL_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "rocketmail.com", "outlook.com", "hotmail.com", "live.com",
  "msn.com", "aol.com", "icloud.com", "me.com", "mac.com", "comcast.net", "att.net", "sbcglobal.net", "charter.net",
  "spectrum.net", "frontier.com", "frontiernet.net", "tds.net", "protonmail.com", "proton.me", "gmx.com", "mail.com",
  "zoho.com", "verizon.net", "bellsouth.net", "earthlink.net", "netzero.net", "juno.com", "centurylink.net",
];
// Category → suggested Directory outcome and how soon to answer.
const INBOUND_REPLY_CATEGORY_RULES = {
  "Order or reorder":    { outcome:"",                    respond:"today" },
  "Interested":          { outcome:"Interested",          respond:"today" },
  "Schedule tasting":    { outcome:"Schedule tasting",    respond:"today" },
  "Question":            { outcome:"",                    respond:"soon" },
  "Wants cocktail list": { outcome:"Wants cocktail list", respond:"soon" },
  "Wrong contact":       { outcome:"Wrong contact",       respond:"soon" },
  "Follow up later":     { outcome:"Follow up later",     respond:"optional" },
  "Not interested":      { outcome:"Not interested",      respond:"optional" },
  "Unsubscribe":         { outcome:"Unsubscribed",        respond:"none" },
  "Bounce":              { outcome:"Bad address",         respond:"none" },
  "Out of office":       { outcome:"",                    respond:"none" },
  "Other":               { outcome:"",                    respond:"soon" },
  "Needs reading":       { outcome:"",                    respond:"soon" },
};
const INBOUND_REPLY_PRIORITY_LABELS = { today:"Respond today", soon:"Respond soon", optional:"Optional reply", none:"No reply needed" };
// Only these matches are certain enough to change a Directory row without a click. A match by company
// email domain or by subject line is listed as a possible match and changes nothing.
const INBOUND_REPLY_STRONG_MATCHES = ["Sender email", "Alternate email in notes", "Address we emailed", "Newsletter contact", "Bounce for address"];
// Statuses a person's reply moves to "Replied" so no automatic follow-up goes out after a real answer.
const INBOUND_REPLY_PAUSABLE_STATUSES = ["sent", "follow-up due", "follow-up sent", "reactivation sent", "reactivation due"];

function getInboundRepliesSheet_(create) {
  const ss = getOutreachSs_();
  const sheet = ss.getSheetByName(INBOUND_REPLIES_SHEET_NAME);
  if (sheet) { ensureHeaderColumns_(sheet, INBOUND_REPLY_HEADERS); return sheet; }
  return create ? ensureSheet_(ss, INBOUND_REPLIES_SHEET_NAME, INBOUND_REPLY_HEADERS) : null;
}

function installInboundReplyChecker() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === INBOUND_REPLY_CHECK_HANDLER)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(INBOUND_REPLY_CHECK_HANDLER).timeBased().everyMinutes(15).create();
  getInboundRepliesSheet_(true);
  // Respond-by times use the project's time zone (business days and hours, no holiday calendar).
  const timeZone = Session.getScriptTimeZone();
  const zoneNote = timeZone === "America/Chicago" ? "" : ` Warning: this project's time zone is ${timeZone}; set it to America/Chicago in Project Settings so respond-by times are right.`;
  return { message:`Reply checker installed. It reads new sales@ Inbox messages every 15 minutes.${zoneNote}` };
}

function inboundReplyCheckerInstalled_() {
  try { return ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === INBOUND_REPLY_CHECK_HANDLER); }
  catch (error) { return null; }
}

function runInboundReplyCheck() {
  try { checkInboundReplies_("Schedule"); }
  catch (error) { console.error(`Inbound reply check failed: ${String(error && error.message || error)}`); }
}

/** Removes quoted history so only the sender's new text is classified and stored. */
function stripQuotedReply_(text) {
  const source = String(text || "").replace(/\r/g, "");
  const lines = source.split("\n");
  const cutPatterns = [
    /^\s*-{2,}\s*(original message|forwarded message)/i,
    /^\s*-{2,}\s*on .+wrote\s*-{2,}\s*$/i,
    /^\s*on .{6,200}wrote:\s*$/i,
    /^\s*on .{6,200}$/i, // "On Tue, Oct 7, 2026 at 3:32 PM Sturgeon Spirits <" followed by "sales@...> wrote:"
    /^\s*from:\s.*(@|<).*/i, // Outlook header block: From: name <address> followed by Sent: / Date:
    /^\s*_{5,}\s*$/,
    /^\s*={3,}\s*(forwarded|original) message\s*={3,}/i,
  ];
  let end = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*>/.test(line)) { end = i; break; }
    const matched = cutPatterns.some((pattern, index) => {
      if (!pattern.test(line)) return false;
      if (index === 3) return /^.{0,120}wrote:\s*$/i.test(lines[i + 1] || "");
      if (index === 4) return lines.slice(i + 1, i + 5).some(next => /^\s*(sent|date):\s/i.test(next));
      return true;
    });
    if (matched) { end = i; break; }
  }
  // When nothing new remains, return "" rather than our own quoted email.
  return lines.slice(0, end).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Outside text written to a cell: trimmed to length, and never read by Sheets as a formula. */
function inboundReplyCellText_(value, maxLength) {
  const text = String(value || "").slice(0, maxLength);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function inboundReplyEmails_(value) {
  const found = String(value || "").toLowerCase().match(/[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [];
  return Array.from(new Set(found));
}

/** A delivery report: from a mail daemon, or a bounce-style subject that is not a person's "Re:". */
function inboundReplyIsBounce_(message) {
  const from = String(message.from_address || "").toLowerCase();
  const subject = String(message.subject || "");
  if (/^(mailer-daemon|postmaster|mail-daemon|mailerdaemon)@/.test(from)) return true;
  if (/^\s*(re|aw|sv)\s*:/i.test(subject)) return false;
  return /(undeliver|delivery status notification|delivery has failed|mail delivery (failed|failure|subsystem)|returned mail|failure notice|could not be delivered|delivery failure)/i.test(subject);
}

/** The report's own text, before the copy of our original message it usually quotes. */
function inboundReplyBounceHead_(text) {
  const body = String(text || "");
  const marker = body.search(/^\s*(-{2,}\s*(original|forwarded) message|original message|received:\s|return-path:\s|content-type:\s*message\/rfc822|message-id:\s)/im);
  return marker > 0 ? body.slice(0, marker) : body;
}

/**
 * "hard": the address does not exist (enhanced status 5.1.x or the usual user-unknown wording);
 * "blocked": the receiving server refused our mail (5.7.x policy/DMARC/spam, full mailbox) — the address may be fine;
 * "delayed": still being retried; "unknown": anything else. Only "hard" may mark an address bad.
 */
function inboundReplyBounceKind_(text) {
  const head = inboundReplyBounceHead_(text);
  if (/^\s*action:\s*delayed/im.test(head) || /^\s*status:\s*4\./im.test(head) || /(has been delayed|delivery (is |has been )?delayed|will (be )?retr(y|ied)|still trying|has not yet been delivered)/i.test(head)) return "delayed";
  // x.1.7 / x.1.8 and "sender address rejected" mean the receiver refused OUR sending address or domain, not that their
  // mailbox is gone, so they must never reach the 5.1.x hard rule below (which marks the address Bad automatically).
  if (/(\b5\.1\.[78]\b|sender('s)? (address|domain)( was| is)? (rejected|blocked|refused|denied)|\b5\.7\.\d{1,3}\b|\b5\.2\.2\b|\b552\b|\bdmarc\b|\bspam|blocked|blacklist|blocklist|reputation|mailbox (is )?full|over quota|out of storage|message rejected)/i.test(head)) return "blocked";
  if (/\b5\.1\.\d{1,3}\b/.test(head) || /^\s*status:\s*5\.1\./im.test(head) || /(does not exist|doesn't exist|user unknown|unknown user|no such (user|recipient|mailbox)|mailbox (not found|unavailable|does not exist)|address rejected|recipient (address )?rejected|invalid recipient|recipient not found|account (has been )?disabled|address couldn't be found|could not be found)/i.test(head)) return "hard";
  return "unknown";
}

/** A sign-off line that may follow a one-word reply: "Sent from my iPhone", "Thanks", a name, a phone or email. */
function inboundReplySignoffLine_(line) {
  const text = String(line || "").trim();
  if (/^(sent from my .{0,40}|get outlook for .{0,20}|sent (via|with|from) .{0,40}|thanks?( you| so much)?[.!]*|thank you[.!]*|cheers[.!]*|(kind |best )?regards[.!,]*|best( wishes)?[.!,]*|sincerely[.!,]*|-{1,2}|—)$/i.test(text)) return true;
  if (/^[+()\d\s.\-]{7,20}$/.test(text)) return true;
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(text)) return true;
  if (/^(www\.|https?:\/\/)\S+$/i.test(text)) return true;
  const words = text.split(/\s+/);
  return words.length <= 3 && words.every(word => /^[A-Z][A-Za-z.'&\-]*,?$/.test(word));
}

/** True when the reply's first line passes the test and every other line is only a sign-off. */
function inboundReplyIsOnly_(replyText, firstLineTest) {
  const lines = String(replyText || "").split("\n").map(line => line.trim()).filter(Boolean);
  if (!lines.length || !firstLineTest(lines[0])) return false;
  return lines.slice(1).every(inboundReplySignoffLine_);
}

/** A reply that is only "stop" (the outreach footer's opt-out). "Stop by Friday" or "Unsubscribe … can you send pricing?" go to the skill. */
function inboundReplyIsStop_(replyText) {
  return inboundReplyIsOnly_(replyText, line => {
    const normalized = line.toLowerCase().replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ").trim();
    return /^(please )?(stop|unsubscribe|opt out|remove|remove me|stop emailing( me)?|stop sending( me)?( emails)?|take me off( your| this| the)?( email| mailing)?( list)?|remove me from( your| this| the)?( email| mailing)?( list)?)( please| thanks| thank you)?$/.test(normalized);
  });
}

function inboundReplyIsCocktails_(replyText) {
  return inboundReplyIsOnly_(replyText, line => /^\W*cocktails?\W*$/i.test(line));
}

function inboundReplyLooksAutomatic_(message, detail) {
  return !!(detail && detail.automatic)
    || /^(automatic reply|auto(matic)?[- ]?(reply|response)|out of (the )?office|ooo\b|away from (the )?office|on vacation|autoreply)/i.test(String(message.subject || "").trim());
}

/** Everything the matcher needs, read once per run. */
function inboundReplyIndex_() {
  const settings = getOutreachCampaignSettings_();
  const own = new Set(INBOUND_REPLY_OWN_ADDRESSES.concat([settings["Sender address"], settings["Test recipient"]].map(value => String(value || "").trim().toLowerCase())).filter(Boolean));
  // The Inbox is karl@'s whole mailbox; only mail addressed to sales@ (the outreach sender) is considered.
  const sales = new Set(["sales@sturgeonspirits.com", String(settings["Sender address"] || "").trim().toLowerCase()].filter(Boolean));
  const ownDomains = new Set(Array.from(own).map(address => address.split("@")[1]).filter(Boolean));
  const records = getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME)).map((row, index) => ({
    source_row:index + 2,
    account_id:String(row.account_id || "").trim(),
    business:String(outreachValue_(row, ["business", "business_name"]) || "").trim(),
    email:String(outreachValue_(row, ["email", "email_address"]) || "").trim().toLowerCase(),
    relationship:String(row.relationship || "").trim(),
    status:String(row.status || "").trim(),
    last_emailed:outreachDate_(row.last_emailed),
    notes:String(row.notes || ""),
  }));
  const byEmail = new Map();
  const byDomain = new Map();
  const remember = (map, key, record) => { if (!map.has(key)) map.set(key, []); if (!map.get(key).includes(record)) map.get(key).push(record); };
  records.forEach(record => {
    if (record.email) remember(byEmail, record.email, record);
    const alternates = Array.from(record.notes.matchAll(/alt(?:ernate)?\.?\s*e-?mail\s*:?\s*([^\s,;|()]+@[^\s,;|()]+)/gi)).map(match => match[1].toLowerCase().replace(/[.]+$/, ""));
    // A hard-bounced address is removed from Email, but late delivery notices must still find this business.
    const bounced = Array.from(record.notes.matchAll(/bad email\s*\(bounced\)\s*:\s*([^\s,;|()]+@[^\s,;|()]+)/gi)).map(match => match[1].toLowerCase().replace(/[.]+$/, ""));
    const remembered = Array.from(new Set(alternates.concat(bounced)));
    remembered.forEach(email => remember(byEmail, email, record));
    [record.email].concat(remembered).forEach(email => {
      const domain = email.split("@")[1] || "";
      if (domain && !INBOUND_REPLY_FREE_MAIL_DOMAINS.includes(domain) && !ownDomains.has(domain)) remember(byDomain, domain, record);
    });
  });
  const byAccount = new Map(records.filter(record => record.account_id).map(record => [record.account_id, record]));
  const sends = new Map();
  const subjects = new Map();
  const activity = getOutreachSs_().getSheetByName(OUTREACH_ACTIVITY_SHEET_NAME);
  if (activity && activity.getLastRow() > 1) {
    getAllRowsAsObjects_(activity).forEach(row => {
      const result = String(outreachValue_(row, ["result"]) || "").toUpperCase();
      if (!result.includes("SENT") || result.includes("TEST")) return;
      const email = String(outreachValue_(row, ["intended_recipient", "delivered_to", "email"]) || "").trim().toLowerCase();
      const at = outreachDate_(outreachValue_(row, ["timestamp", "sent_at"]));
      const send = { email:email, account_id:String(row.account_id || "").trim(), stage:String(outreachValue_(row, ["message_stage", "stage"]) || "").trim(), subject:String(row.subject || "").trim(), at:at };
      if (email) {
        const prior = sends.get(email);
        if (!prior || (at && (!prior.at || at.getTime() > prior.at.getTime()))) sends.set(email, send);
      }
      const subjectKey = send.subject.toLowerCase().replace(/\s+/g, " ").trim();
      if (subjectKey) {
        // Remember every account a subject went to: a subject shared by several businesses identifies none.
        const prior = subjects.get(subjectKey) || { send:null, accounts:new Set() };
        if (send.account_id) prior.accounts.add(send.account_id);
        if (!prior.send || (at && (!prior.send.at || at.getTime() > prior.send.at.getTime()))) prior.send = send;
        subjects.set(subjectKey, prior);
      }
    });
  }
  const newsletter = new Map(newsletterContacts_().map(contact => [String(contact.email || "").trim().toLowerCase(), contact]));
  return { own:own, sales:sales, records:records, byEmail:byEmail, byDomain:byDomain, byAccount:byAccount, sends:sends, subjects:subjects, newsletter:newsletter };
}

function inboundReplyPickRecord_(candidates, index, email) {
  if (!candidates || !candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const sent = email ? index.sends.get(email) : null;
  const bySend = sent && candidates.find(record => record.account_id && record.account_id === sent.account_id);
  if (bySend) return bySend;
  return candidates.slice().sort((a, b) => (b.last_emailed ? b.last_emailed.getTime() : 0) - (a.last_emailed ? a.last_emailed.getTime() : 0))[0];
}

/** Which business (and which of our emails) a message answers, or null when it is not a reply to us. */
function matchInboundReply_(message, index, detailText) {
  const from = String(message.from_address || "").toLowerCase();
  if (!from || index.own.has(from)) return null;
  const isBounce = inboundReplyIsBounce_(message);
  // Bounces go to the envelope sender; every other message must be addressed (To or Cc) to sales@.
  if (!isBounce && !(message.to_addresses || []).some(address => index.sales.has(String(address).toLowerCase()))) return null;
  const isReply = /^\s*(re|aw|sv)\s*:/i.test(String(message.subject || ""));
  if (isBounce) {
    const addresses = inboundReplyEmails_(detailText || message.summary).filter(email => !index.own.has(email) && !/^(mailer-daemon|postmaster)@/.test(email));
    const bounced = addresses.find(email => index.byEmail.has(email) || index.sends.has(email) || index.newsletter.has(email));
    if (!bounced) return null;
    const send = index.sends.get(bounced);
    const record = inboundReplyPickRecord_(index.byEmail.get(bounced), index, bounced) || (send && index.byAccount.get(send.account_id)) || null;
    return { record:record, email:bounced, matched_by:"Bounce for address", send:send || null, newsletter:index.newsletter.get(bounced) || null, bounce:true };
  }
  const send = index.sends.get(from) || null;
  const direct = inboundReplyPickRecord_(index.byEmail.get(from), index, from);
  if (direct) return { record:direct, email:from, matched_by:direct.email === from ? "Sender email" : "Alternate email in notes", send:send || index.sends.get(direct.email) || null, newsletter:index.newsletter.get(from) || null };
  if (send && index.byAccount.get(send.account_id)) return { record:index.byAccount.get(send.account_id), email:from, matched_by:"Address we emailed", send:send, newsletter:index.newsletter.get(from) || null };
  const contact = index.newsletter.get(from);
  if (contact) {
    const record = contact.account_id ? index.byAccount.get(String(contact.account_id)) || null : null;
    return { record:record, email:from, matched_by:"Newsletter contact", send:send, newsletter:contact };
  }
  // Possible matches below: listed for staff, never applied automatically.
  if (!isReply) return null;
  const domain = from.split("@")[1] || "";
  const domainRecords = index.byDomain.get(domain) || [];
  const domainAccounts = new Set(domainRecords.map(record => record.account_id || `row-${record.source_row}`));
  if (domainRecords.length && domainAccounts.size === 1) {
    return { record:domainRecords[0], email:from, matched_by:"Same company email domain", send:index.sends.get(domainRecords[0].email) || null, newsletter:null };
  }
  const subjectKey = String(message.subject || "").replace(/^\s*((re|aw|sv|fw|fwd)\s*:\s*)+/i, "").toLowerCase().replace(/\s+/g, " ").trim();
  const subjectEntry = subjectKey ? index.subjects.get(subjectKey) : null;
  if (subjectEntry && subjectEntry.send && subjectEntry.accounts.size === 1) {
    return { record:index.byAccount.get(subjectEntry.send.account_id) || null, email:from, matched_by:"Reply to our subject line", send:subjectEntry.send, newsletter:null };
  }
  return { record:null, email:from, matched_by:"Reply to sales@ (no business match)", send:null, newsletter:null };
}

function inboundReplyBusinessDayAt_(from, addDays, hour) {
  const date = new Date(from.getTime());
  let added = 0;
  while (added < addDays || date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) added += 1;
  }
  date.setHours(hour, 0, 0, 0);
  return date;
}

/** Respond-by time: same business day for hot replies that arrive by 3 PM, otherwise the next business day. */
function inboundReplyRespondBy_(category, received) {
  const rule = INBOUND_REPLY_CATEGORY_RULES[category] || INBOUND_REPLY_CATEGORY_RULES["Needs reading"];
  const at = received instanceof Date && !isNaN(received.getTime()) ? received : new Date();
  if (rule.respond === "today") {
    const weekday = at.getDay() !== 0 && at.getDay() !== 6;
    if (weekday && at.getHours() < 15) { const sameDay = new Date(at.getTime()); sameDay.setHours(17, 0, 0, 0); return sameDay; }
    return inboundReplyBusinessDayAt_(at, 1, 12);
  }
  if (rule.respond === "soon") return inboundReplyBusinessDayAt_(at, 1, 17);
  return null;
}

/**
 * Writes back only the cells that changed in a row read with getValues(). Rewriting the whole row would
 * turn apostrophe-protected text ('=…, '+1 920…) into live formulas and overwrite cells another writer
 * (staff, the skill) changed in the meantime.
 */
function writeChangedRowCells_(sheet, rowNumber, originalValues, values) {
  values.forEach((value, index) => {
    const before = originalValues[index];
    const same = value instanceof Date && before instanceof Date ? value.getTime() === before.getTime() : value === before;
    if (!same) sheet.getRange(rowNumber, index + 1).setValue(value);
  });
}

/** Writes Status "Replied" and clears Next Follow-Up so no automatic follow-up goes out after a person's answer. */
function pauseOutreachFollowUpsForReply_(record, receivedAt, summary) {
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return "";
  try {
    const h = getHeaderMap_(sheet);
    const range = sheet.getRange(record.source_row, 1, 1, sheet.getLastColumn());
    const values = range.getValues()[0];
    const originalValues = values.slice();
    if (h.account_id !== undefined && String(values[h.account_id] || "").trim() !== record.account_id) return "";
    const status = String(h.status !== undefined ? values[h.status] : "").trim().toLowerCase();
    if (!INBOUND_REPLY_PAUSABLE_STATUSES.includes(status)) return "";
    if (h.status !== undefined) values[h.status] = "Replied";
    if (h["next_follow-up"] !== undefined) values[h["next_follow-up"]] = "";
    else if (h.next_follow_up !== undefined) values[h.next_follow_up] = "";
    if (h.notes !== undefined) {
      const note = `${Utilities.formatDate(receivedAt, Session.getScriptTimeZone(), "yyyy-MM-dd")} - Email reply received${summary ? `: ${summary}` : ""} (follow-ups paused automatically)`;
      const prior = String(values[h.notes] || "").trim();
      values[h.notes] = prior ? `${prior}\n${note}` : note;
    }
    if (h.record_updated_at !== undefined) values[h.record_updated_at] = new Date();
    writeChangedRowCells_(sheet, record.source_row, originalValues, values);
    return "Follow-ups paused (status Replied)";
  } finally {
    lock.releaseLock();
  }
}

function recordInboundReplyEngagement_(match, eventType, receivedAt) {
  const sheet = getOutreachSs_().getSheetByName(OUTREACH_ENGAGEMENT_SHEET_NAME);
  if (!sheet || !match.record) return;
  const headers = getHeaderMap_(sheet);
  const values = Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (headers[key] !== undefined) values[headers[key]] = value; };
  set("event_id", permanentId_("ENG"));
  set("business_name", match.record.business);
  set("email", match.email);
  set("account_id", match.record.account_id);
  set("source_row", match.record.source_row);
  set("event_type", eventType);
  set("event_at", receivedAt);
  set("source", "Inbox reply checker");
  set("message_stage", match.send ? match.send.stage : "");
  set("stage", match.send ? match.send.stage : "");
  set("confidence", "Inbox message");
  set("app_version", APP_VERSION);
  sheet.appendRow(values);
}

/**
 * The safe stops, applied without a click: { text, applied }. Only strong matches change a Directory row.
 * "applied" says whether the stop actually took effect, so a failed opt-out is never filed as handled.
 */
function applyInboundReplySafeStops_(match, classification, receivedAt) {
  const actions = [];
  const record = match.record;
  const actor = "Reply checker";
  if (!INBOUND_REPLY_STRONG_MATCHES.includes(match.matched_by)) {
    return { text:record ? "Possible match - not applied" : "", applied:false };
  }
  if (classification.category === "Bounce") {
    // Only an address that does not exist is marked bad; blocked, delayed and unclear reports change nothing.
    if (classification.bounce_kind !== "hard") return { text:"", applied:false };
    let applied = false;
    if (record && record.email && record.email === match.email) {
      try {
        apiUpdateOutreachOutcome_({ source_row:record.source_row, business:record.business, account_id:record.account_id, outcome:"Bad address", staff_name:actor, notes:`Email to ${match.email} bounced (applied automatically by the reply checker).` });
        actions.push("Marked Bad address");
        applied = true;
      } catch (error) { actions.push(`Bad address not applied: ${String(error.message || error)}`); }
    }
    if (match.newsletter && unsubscribeNewsletterContactByEmail_(match.email, actor)) { actions.push("Newsletter contact unsubscribed (bounced)"); if (!record) applied = true; }
    return { text:actions.join("; "), applied:applied };
  }
  if (classification.category === "Unsubscribe" && classification.classifier === "Rules") {
    let directoryApplied = false;
    if (record) {
      try {
        apiUpdateOutreachOutcome_({ source_row:record.source_row, business:record.business, account_id:record.account_id, outcome:"Unsubscribed", staff_name:actor, notes:`Replied "stop" from ${match.email} (applied automatically by the reply checker).` });
        actions.push("Unsubscribed (Do Not Email ticked)");
        directoryApplied = true;
      } catch (error) { actions.push(`Unsubscribe not applied: ${String(error.message || error)}`); }
    }
    const newsletterApplied = unsubscribeNewsletterContactByEmail_(match.email, actor);
    if (newsletterApplied) actions.push("Newsletter contact unsubscribed");
    if (!actions.length) actions.push("Nothing found to unsubscribe automatically");
    // With a Directory row, that row must be unsubscribed; otherwise the newsletter contact must be.
    return { text:actions.join("; "), applied:record ? directoryApplied : newsletterApplied };
  }
  if (!record || classification.category === "Out of office" || classification.no_pause) return { text:"", applied:false };
  const text = pauseOutreachFollowUpsForReply_(record, receivedAt, classification.summary);
  return { text:text, applied:!!text };
}

/** Status, priority and respond-by once the safe stops have run. */
function inboundReplyOutcomeFields_(classification, stops, receivedAt) {
  const rule = INBOUND_REPLY_CATEGORY_RULES[classification.category] || INBOUND_REPLY_CATEGORY_RULES["Needs reading"];
  const review = label => ({ status:"New", priority:label, respond_by:inboundReplyBusinessDayAt_(receivedAt, 1, 17) });
  const handled = { status:"Handled", priority:INBOUND_REPLY_PRIORITY_LABELS.none, respond_by:"" };
  if (classification.category === "Unsubscribe") return classification.classifier === "Rules" && stops.applied ? handled : review("Confirm unsubscribe");
  if (classification.category === "Bounce") {
    if (classification.bounce_kind === "delayed") return handled;
    return classification.bounce_kind === "hard" && stops.applied ? handled : review("Review bounce");
  }
  if (rule.respond === "none") return handled;
  return { status:"New", priority:INBOUND_REPLY_PRIORITY_LABELS[rule.respond], respond_by:inboundReplyRespondBy_(classification.category, receivedAt) || "" };
}

/** Zoho IDs are 19-digit numbers; written with a leading apostrophe they stay exact text instead of a rounded double. */
function inboundReplyIdText_(value) {
  const text = String(value || "").trim();
  return text ? `'${text}` : "";
}

/** Writes named cells of one Inbound Replies row (never the whole row). */
function setInboundReplyCells_(sheet, rowNumber, changes) {
  const h = getHeaderMap_(sheet);
  Object.keys(changes).forEach(key => { if (h[key] !== undefined) sheet.getRange(rowNumber, h[key] + 1).setValue(changes[key]); });
}

// ---------- Outcome tracking and learned alt emails (2026.10.10.40-APP) ----------
/** A reply answered from Zoho whose business still has no outcome recorded from it. */
function inboundReplyNeedsOutcome_(row) {
  return String(row.status || "").trim() === "Handled"
    && /^Answered in Zoho/i.test(String(row.handled_note || "").trim())
    && !String(row.outcome_logged || "").trim()
    && Number(row.source_row || 0) > 0;
}

/**
 * The Notes line to add when an outcome is logged from a reply sent from another address, or "".
 * Never for bounces, mail daemons, our own domain, the business's own email or an address already in Notes.
 */
function inboundReplyAltEmailLine_(reply, directoryEmail, priorNotes, dateText) {
  const from = String(reply.from || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(from)) return "";
  if (String(reply.category || "").trim() === "Bounce") return "";
  if (/^(mailer-daemon|postmaster|mail-daemon|mailerdaemon)@/.test(from)) return "";
  if (from.endsWith("@sturgeonspirits.com")) return "";
  if (from === String(directoryEmail || "").trim().toLowerCase()) return "";
  if (String(priorNotes || "").toLowerCase().includes(from)) return "";
  const name = String(reply.from_name || "").replace(/[\r\n]+/g, " ").trim();
  const label = name && name.toLowerCase() !== from ? ` (${name}, from an email reply)` : " (from an email reply)";
  return `${dateText} - Alt email: ${from}${label}`;
}

const INBOUND_REPLY_CONTACT_ROLE_WORDS = new Set([
  "info", "office", "manager", "sales", "bar", "staff", "admin", "team", "service", "support", "customer",
  "events", "event", "booking", "bookings", "reservations", "hello", "contact", "orders", "accounting", "billing",
  "marketing", "desk", "front", "owner", "owners", "management", "general", "mgr", "gm",
]);
const INBOUND_REPLY_CONTACT_BUSINESS_WORDS = new Set([
  "bar", "grill", "pub", "tavern", "saloon", "club", "brewing", "brewery", "taphouse", "tap", "restaurant", "lounge",
  "inn", "supper", "liquor", "liquors", "market", "wine", "spirits", "bistro", "cafe", "kitchen", "golf", "lanes", "bowl",
  "hotel", "resort", "marina", "catering", "llc", "inc", "co", "company", "corp",
]);

function inboundReplyNameWords_(value) {
  return String(value || "").toLowerCase().replace(/[^a-zà-ÿ'’.\- ]/g, " ").split(/\s+/).map(word => word.replace(/[.'’-]/g, "")).filter(Boolean);
}

/** A reply display name is useful only when it is plainly a person's name, not an inbox or role. */
function inboundReplyPersonContactName_(nameValue, businessValue, emailValue) {
  const name = String(nameValue || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!name || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name)) return "";
  if (/\d/.test(name)) return "";
  const words = inboundReplyNameWords_(name);
  if (words.length < 2 || words.some(word => INBOUND_REPLY_CONTACT_ROLE_WORDS.has(word) || INBOUND_REPLY_CONTACT_BUSINESS_WORDS.has(word))) return "";
  if (words.some((word, index) => word.length === 1 && (index === 0 || index === words.length - 1))) return "";
  const businessWords = new Set(inboundReplyNameWords_(businessValue).filter(word => word.length >= 3 && !["the", "and"].includes(word)));
  if (words.some(word => word.length >= 3 && businessWords.has(word))) return "";
  if (directoryQualityBusinessKey_(name) === directoryQualityBusinessKey_(businessValue)) return "";
  if (String(emailValue || "").trim().toLowerCase() === name.toLowerCase()) return "";
  return name.slice(0, 120);
}

/** Apply a trusted person reply to its matched Directory row without changing any real contact detail. */
function applyInboundReplyDirectoryFill_(match, message, classification, receivedAt) {
  const record = match && match.record;
  if (!record || !INBOUND_REPLY_STRONG_MATCHES.includes(match.matched_by)) return { changed:false };
  if (match.bounce || classification.category === "Bounce" || classification.category === "Out of office") return { changed:false };
  const email = String(match.email || "").trim().toLowerCase();
  const contact = classification.category === "Needs reading" && classification.no_pause
    ? ""
    : inboundReplyPersonContactName_(message && message.from_name, record.business, email);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { changed:false, skipped:"Directory is busy" };
  try {
    const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const headers = getHeaderMap_(sheet);
    const range = sheet.getRange(record.source_row, 1, 1, sheet.getLastColumn());
    const values = range.getValues()[0];
    const original = values.slice();
    const notesKey = directoryFillHeaderKey_(headers, ["notes"]);
    if (!directoryFillEmailAllowed_(email, notesKey === undefined ? "" : values[headers[notesKey]])) return { changed:false, skipped:"Sender address is not fillable" };
    const accountKey = directoryFillHeaderKey_(headers, ["account_id"]);
    const businessKey = directoryFillHeaderKey_(headers, ["business", "business_name"]);
    if (accountKey !== undefined && record.account_id && String(values[headers[accountKey]] || "").trim() !== String(record.account_id).trim()) return { changed:false, skipped:"Directory row changed" };
    if (businessKey !== undefined && String(values[headers[businessKey]] || "").trim() !== String(record.business || "").trim()) return { changed:false, skipped:"Directory row changed" };
    const result = directoryApplyContactFillToValues_(values, headers, { email:email, contact:contact, email_confidence:"Confirmed", label:"email reply", status_after_fill:"Replied" }, receivedAt);
    if (!result.changed) return result;
    writeChangedRowCells_(sheet, record.source_row, original, values);
    appendAudit_("FILL_DIRECTORY_FROM_REPLY", "Directory", String(record.account_id || ""), "", "Reply checker", INBOUND_REPLIES_SHEET_NAME, OUTREACH_SHEET_NAME, "Completed", `${result.email_filled ? "Email filled" : ""}${result.email_filled && result.contact_filled ? "; " : ""}${result.contact_filled ? "contact filled" : ""}${result.conflicts.length ? `${(result.email_filled || result.contact_filled) ? "; " : ""}difference noted` : ""}.`);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function inboundReplyAltEmailCandidates_(notes) {
  return String(notes || "").split(/\r?\n/).map(line => {
    const match = line.match(/Alt email:\s*([^\s(]+)(?:\s+\((.*?),\s*from an email reply\)|\s+\(from an email reply\))?/i);
    return match ? { email:String(match[1] || "").trim().toLowerCase(), name:String(match[2] || "").trim() } : null;
  }).filter(Boolean);
}

function backfillDirectoryReplyContacts_(dryRun) {
  const lock = dryRun ? null : LockService.getScriptLock();
  if (lock && !lock.tryLock(30000)) throw new Error("Another directory update is in progress. Try again in a moment.");
  try {
    const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const headers = getHeaderMap_(sheet);
    const rowCount = Math.max(0, sheet.getLastRow() - 1);
    const values = rowCount ? sheet.getRange(2, 1, rowCount, sheet.getLastColumn()).getValues() : [];
    const result = { dry_run:!!dryRun, scanned:values.length, updated:0, email_filled:0, contact_filled:0, examples:[] };
    values.forEach((row, index) => {
      const original = row.slice();
      const notesKey = directoryFillHeaderKey_(headers, ["notes"]);
      const businessKey = directoryFillHeaderKey_(headers, ["business", "business_name"]);
      const notes = notesKey === undefined ? "" : row[headers[notesKey]];
      const business = businessKey === undefined ? "" : row[headers[businessKey]];
      const candidates = inboundReplyAltEmailCandidates_(notes).reverse().filter(candidate => directoryFillEmailAllowed_(candidate.email, notes));
      const emailCandidate = candidates[0] || null;
      const contactCandidate = candidates.map(candidate => Object.assign({}, candidate, { name:inboundReplyPersonContactName_(candidate.name, business, candidate.email) })).find(candidate => candidate.name) || null;
      if (!emailCandidate && !contactCandidate) return;
      const fill = directoryApplyContactFillToValues_(row, headers, {
        email:emailCandidate ? emailCandidate.email : "",
        contact:contactCandidate ? contactCandidate.name : "",
        email_confidence:"Confirmed",
        label:"email reply",
        status_after_fill:"Replied",
      }, new Date());
      if (!fill.changed) return;
      result.updated += 1;
      result.email_filled += fill.email_filled ? 1 : 0;
      result.contact_filled += fill.contact_filled ? 1 : 0;
      if (result.examples.length < (dryRun ? Infinity : 25)) result.examples.push({ row:index + 2, business:String(business || "").trim(), email:fill.email_filled, contact:fill.contact_filled, detail:(fill.details || []).join(" ") });
      if (!dryRun) writeChangedRowCells_(sheet, index + 2, original, row);
    });
    if (!dryRun && result.updated) {
      appendAudit_("BACKFILL_DIRECTORY_FROM_REPLY_NOTES", "Directory", "", "", "Karl (editor)", INBOUND_REPLIES_SHEET_NAME, OUTREACH_SHEET_NAME, "Completed", `${result.updated} rows updated from existing Alt email notes.`);
      bumpReadCacheVersion_(["outreach"]);
    }
    return result;
  } finally {
    if (lock) lock.releaseLock();
  }
}

function previewBackfillDirectoryReplyContacts() { return backfillDirectoryReplyContacts_(true); }
function backfillDirectoryReplyContacts() {
  const result = backfillDirectoryReplyContacts_(false);
  Logger.log(JSON.stringify(result));
  return result;
}

/**
 * Records an outcome on the business's replies: the reply it was logged from (handled if still open) and every
 * reply of that account waiting for an outcome. Writes only status and Outcome Logged cells.
 * Returns the record of replyId, or null.
 */
function recordInboundReplyOutcome_(accountId, outcome, staffName, replyId) {
  const sheet = getInboundRepliesSheet_(false);
  if (!sheet || !accountId) return null;
  const now = new Date();
  const logged = inboundReplyCellText_(`${outcome} · ${Utilities.formatDate(now, Session.getScriptTimeZone(), "MMM d")} · ${staffName}`, 200);
  let selected = null;
  outreachRowsMatchingCell_(sheet, ["account_id", "Account ID"], accountId).forEach(row => {
    const isTarget = !!replyId && String(row.reply_id || "") === String(replyId);
    if (!isTarget && !inboundReplyNeedsOutcome_(row)) return;
    const changes = { outcome_logged:logged };
    if (isTarget && String(row.status || "").trim() === "New") {
      Object.assign(changes, { status:"Handled", handled_at:now, handled_by:inboundReplyCellText_(staffName, 120), handled_note:inboundReplyCellText_(`Outcome: ${outcome}`, 500) });
    }
    setInboundReplyCells_(sheet, row.__source_row, changes);
    if (isTarget) selected = inboundReplyRecord_(Object.assign({}, row, changes), row.__source_row);
  });
  if (replyId && !selected) throw new Error("That reply belongs to a different business.");
  return selected;
}

// ---------- Replies answered from Zoho (2026.10.10.39-APP) ----------
const INBOUND_REPLY_ANSWER_SKIP_CATEGORIES = ["Bounce", "Unsubscribe"];
const INBOUND_REPLY_ANSWER_SKIP_PRIORITIES = ["Confirm unsubscribe", "Review bounce"];
const INBOUND_REPLY_ANSWER_LOOKBACK_DAYS = 30;

/** Whether a reply row can be closed by an email sent from Zoho (bounces and unsubscribes need a decision in the Hub). */
function inboundReplyAnswerable_(row) {
  return String(row.status || "").trim() === "New"
    && !!String(row.thread_id || "").trim()
    && !INBOUND_REPLY_ANSWER_SKIP_CATEGORIES.includes(String(row.category || "").trim())
    && !INBOUND_REPLY_ANSWER_SKIP_PRIORITIES.includes(String(row.priority || "").trim());
}

/**
 * The sent message that answered a reply: same thread, sent from sales@, after the reply arrived (the original
 * outreach email is in the same thread but earlier, so it never counts). Earliest such message, or null.
 */
function inboundReplyAnsweredBy_(row, sentRows, senderSet) {
  if (!inboundReplyAnswerable_(row)) return null;
  const thread = String(row.thread_id || "").trim();
  const received = outreachDate_(row.received_at);
  if (!received) return null;
  // A reply reopened by staff is only closed again by a message sent after the reopen.
  const reopened = /^Reopened/i.test(String(row.handled_note || "").trim()) ? outreachDate_(row.handled_at) : null;
  const after = Math.max(received.getTime(), reopened ? reopened.getTime() : 0);
  const answers = (sentRows || []).filter(sent => String(sent.thread_id || "") === thread
    && senderSet.has(String(sent.from_address || "").trim().toLowerCase())
    && Number(sent.sent_ms) > after);
  answers.sort((a, b) => Number(a.sent_ms) - Number(b.sent_ms));
  return answers[0] || null;
}

/** Closes open replies that were answered from Zoho. Returns { answered, scan_capped }. */
function closeAnsweredInboundReplies_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return { answered:0, scan_capped:false };
  const rows = getAllRowsAsObjects_(sheet).map((row, index) => Object.assign(row, { __row:index + 2 })).filter(inboundReplyAnswerable_);
  if (!rows.length) return { answered:0, scan_capped:false };
  const floor = Date.now() - INBOUND_REPLY_ANSWER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const oldest = Math.min.apply(null, rows.map(row => { const date = outreachDate_(row.received_at); return date ? date.getTime() : Date.now(); }));
  const threadIds = Array.from(new Set(rows.map(row => String(row.thread_id).trim())));
  const listing = callOutreachMailer_({ action:"listSentInThreads", since_ms:Math.max(oldest, floor), thread_ids:threadIds });
  const settings = getOutreachCampaignSettings_();
  const senderSet = new Set(["sales@sturgeonspirits.com", String(settings["Sender address"] || "").trim().toLowerCase()].filter(Boolean));
  let answered = 0;
  rows.forEach(row => {
    const sent = inboundReplyAnsweredBy_(row, listing.rows || [], senderSet);
    if (!sent) return;
    // Re-find the row by Reply ID in case rows moved since they were read.
    const current = outreachRowsMatchingCell_(sheet, ["reply_id", "Reply ID"], String(row.reply_id || ""));
    if (!current.length || String(current[0].status || "").trim() !== "New") return;
    const sentAt = new Date(Number(sent.sent_ms));
    const label = Utilities.formatDate(sentAt, Session.getScriptTimeZone(), "MMM d h:mm a");
    setInboundReplyCells_(sheet, current[0].__source_row, {
      status:"Handled",
      handled_at:sentAt,
      handled_by:"Reply checker",
      handled_note:`Answered in Zoho ${label}`,
    });
    appendAudit_("CLOSE_INBOUND_REPLY_ANSWERED", "Reply", String(row.reply_id || ""), String(row.account_id || ""), "Reply checker", INBOUND_REPLIES_SHEET_NAME, INBOUND_REPLIES_SHEET_NAME, "Completed", `Answered in Zoho ${label} (message ${sent.message_id})`);
    answered += 1;
  });
  return { answered:answered, scan_capped:!!listing.scan_capped };
}

function inboundReplyStoredIds_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return new Set();
  const h = getHeaderMap_(sheet);
  if (h.zoho_message_id === undefined) return new Set();
  return new Set(sheet.getRange(2, h.zoho_message_id + 1, sheet.getLastRow() - 1, 1).getValues().map(row => String(row[0] || "").trim()).filter(Boolean));
}

function setInboundReplyLastRun_(value) {
  PropertiesService.getScriptProperties().setProperty(INBOUND_REPLY_LAST_RUN_PROPERTY, JSON.stringify(value));
}

function inboundReplyLastRun_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(INBOUND_REPLY_LAST_RUN_PROPERTY) || "null"); }
  catch (error) { return null; }
}

// One email can land in the sales@ Inbox twice with two Zoho message IDs (seen 2026-11-17: Mark Wilton's
// "New Order - Nov 17" at 11:41:28, message IDs ...756... and ...757...), so the message-ID check alone listed it
// twice and "Email sent" on one card left the other. A second copy is the same sender, subject and text arriving
// within two minutes of one already stored. (2026.11.17.69-APP)
const INBOUND_REPLY_DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

function inboundReplyDuplicateKey_(from, subject, text) {
  const squash = value => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  return [squash(from), squash(subject), squash(text).slice(0, 300)].join("|");
}

/** Recent stored replies by duplicate key, each with its received time in ms. */
function inboundReplyRecentCopies_(sheet, sinceMs) {
  const copies = new Map();
  if (!sheet || sheet.getLastRow() < 2) return copies;
  rowsWithSource_(sheet).forEach(row => {
    const receivedMs = row.received_at instanceof Date ? row.received_at.getTime() : Date.parse(row.received_at);
    if (!(receivedMs >= sinceMs)) return;
    const key = inboundReplyDuplicateKey_(row.from, row.subject, row.reply_text);
    copies.set(key, (copies.get(key) || []).concat(receivedMs));
  });
  return copies;
}

function inboundReplyIsDuplicateCopy_(copies, key, receivedMs) {
  return (copies.get(key) || []).some(ms => Math.abs(ms - Number(receivedMs || 0)) <= INBOUND_REPLY_DUPLICATE_WINDOW_MS);
}

/** Reads new Inbox messages through the mailer and catalogues the replies. Safe to run repeatedly. */
function checkInboundReplies_(trigger) {
  const cache = CacheService.getScriptCache();
  if (cache.get(INBOUND_REPLY_RUNNING_CACHE_KEY)) return { message:"A reply check is already running. Try again in a few minutes.", running:true };
  cache.put(INBOUND_REPLY_RUNNING_CACHE_KEY, "1", 360);
  const started = Date.now();
  const properties = PropertiesService.getScriptProperties();
  const sinceMs = Number(properties.getProperty(INBOUND_REPLY_SINCE_PROPERTY) || 0) || (started - INBOUND_REPLY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const summary = { at:new Date().toISOString(), trigger:trigger, checked:0, added:0, auto_actions:0, directory_fills:0, skipped:0, duplicates:0, answered:0, scan_capped:false, error:"", more_available:false };
  try {
    const listing = callOutreachMailer_({ action:"listInboxMessages", since_ms:sinceMs });
    const messages = (listing.messages || []).filter(message => message && message.message_id).sort((a, b) => Number(a.received_ms || 0) - Number(b.received_ms || 0));
    summary.checked = messages.length;
    summary.more_available = !!listing.more_available;
    const sheet = getInboundRepliesSheet_(true);
    const stored = inboundReplyStoredIds_(sheet);
    const copies = inboundReplyRecentCopies_(sheet, sinceMs - 24 * 60 * 60 * 1000);
    const index = inboundReplyIndex_();
    let checkpoint = sinceMs;
    const advance = receivedMs => {
      // Saved after every message, so a failure part-way never re-reads (or re-applies) earlier ones.
      checkpoint = Math.max(checkpoint, receivedMs || 0);
      properties.setProperty(INBOUND_REPLY_SINCE_PROPERTY, String(checkpoint));
    };
    const readMessage = message => {
      try { return callOutreachMailer_({ action:"getInboxMessage", message_id:message.message_id, folder_id:message.folder_id }); }
      catch (error) { return { text:String(message.summary || ""), automatic:false, bulk:false, header_error:true, text_truncated:false, read_error:String(error.message || error) }; }
    };
    for (const message of messages) {
      if (Date.now() - started > INBOUND_REPLY_RUN_BUDGET_MS) { summary.more_available = true; break; }
      const messageId = String(message.message_id);
      const receivedMs = Number(message.received_ms || 0);
      if (stored.has(messageId)) { advance(receivedMs); continue; }
      let detail = null;
      let match = matchInboundReply_(message, index, "");
      if (!match && inboundReplyIsBounce_(message)) {
        detail = readMessage(message);
        match = matchInboundReply_(message, index, detail.text);
      }
      if (!match) { summary.skipped += 1; advance(receivedMs); continue; }
      if (!detail) detail = readMessage(message);
      // A mailing-list or newsletter message from a matched address is not a reply.
      if (detail.bulk && !match.bounce) { summary.skipped += 1; advance(receivedMs); continue; }
      const receivedAt = new Date(receivedMs || Date.now());
      const replyText = stripQuotedReply_(detail.text || message.summary || "");
      const storedText = replyText || "(No new text above the quoted message.)";
      const copyKey = inboundReplyDuplicateKey_(match.email, message.subject, storedText);
      if (inboundReplyIsDuplicateCopy_(copies, copyKey, receivedAt.getTime())) { summary.duplicates += 1; stored.add(messageId); advance(receivedMs); continue; }
      let classification;
      if (match.bounce) {
        const kind = inboundReplyBounceKind_(detail.text);
        const wording = { hard:"bounced: the address does not exist", blocked:"was refused by the receiving server (policy, spam filter or full mailbox); the address may still be good", delayed:"was delayed; the server is still trying", unknown:"could not be delivered; read the bounce message" }[kind];
        classification = { category:"Bounce", summary:`Email to ${match.email} ${wording}.`, classifier:"Rules", bounce_kind:kind };
      } else if (inboundReplyIsStop_(replyText)) {
        classification = { category:"Unsubscribe", summary:"Asked to stop receiving emails.", classifier:"Rules" };
      } else if (inboundReplyIsCocktails_(replyText)) {
        classification = { category:"Wants cocktail list", summary:'Replied "cocktails".', classifier:"Rules" };
      } else if (inboundReplyLooksAutomatic_(message, detail)) {
        classification = { category:"Out of office", summary:"Automatic reply.", classifier:"Rules" };
      } else {
        // Left for the sort-inbound-replies skill. It still pauses follow-ups, unless the headers could
        // not be read (it might be an automatic reply).
        classification = { category:"Needs reading", summary:"", classifier:"Awaiting skill", no_pause:!!detail.header_error };
      }
      const rule = INBOUND_REPLY_CATEGORY_RULES[classification.category] || INBOUND_REPLY_CATEGORY_RULES["Needs reading"];
      const record = match.record || {};
      // 1) Catalogue the reply under the script lock, re-checking that no other run stored it first.
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(15000)) { summary.more_available = true; break; }
      let rowNumber = 0;
      try {
        if (outreachRowsMatchingCell_(sheet, ["zoho_message_id", "Zoho Message ID"], messageId).length) { stored.add(messageId); advance(receivedMs); continue; }
        const h = getHeaderMap_(sheet);
        const values = Array(sheet.getLastColumn()).fill("");
        const set = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
        set("reply_id", permanentId_("RPL"));
        set("received_at", receivedAt);
        set("from", inboundReplyCellText_(match.email, 200));
        set("from_name", inboundReplyCellText_(message.from_name, 200));
        set("subject", inboundReplyCellText_(message.subject, 500));
        const body = replyText || "(No new text above the quoted message.)";
        set("reply_text", inboundReplyCellText_(`${body.slice(0, 8000)}${detail.text_truncated ? "\n[Message truncated]" : ""}${detail.read_error ? "\n[Full message could not be read; showing Zoho's summary]" : ""}`, 8200));
        set("account_id", record.account_id || String(match.newsletter?.account_id || ""));
        set("source_row", record.source_row || "");
        set("business", record.business || String(match.newsletter?.organization || ""));
        set("relationship", record.relationship || "");
        set("matched_by", match.matched_by);
        set("last_sent_stage", match.send ? match.send.stage : "");
        set("last_sent_at", match.send && match.send.at ? match.send.at : "");
        set("category", classification.category);
        set("summary", inboundReplyCellText_(classification.summary || "", 700));
        // Only a bounce saying the address does not exist suggests "Bad address".
        set("suggested_outcome", classification.category === "Bounce" && classification.bounce_kind !== "hard" ? "" : rule.outcome);
        set("priority", INBOUND_REPLY_PRIORITY_LABELS[rule.respond]);
        set("auto_action", "Pending automatic changes");
        set("classifier", classification.classifier);
        set("status", "New");
        set("zoho_message_id", inboundReplyIdText_(messageId));
        set("zoho_folder_id", inboundReplyIdText_(message.folder_id));
        set("thread_id", inboundReplyIdText_(message.thread_id));
        set("app_version", APP_VERSION);
        sheet.appendRow(values);
        rowNumber = sheet.getLastRow();
      } finally {
        lock.releaseLock();
      }
      stored.add(messageId);
      copies.set(copyKey, (copies.get(copyKey) || []).concat(receivedAt.getTime()));
      summary.added += 1;
      // 2) Side effects, then the row's final status. If this part fails the row stays New with
      //    "Pending automatic changes", which staff see; the message is never processed twice.
      const automaticReply = classification.category === "Bounce" || classification.category === "Out of office";
      if (!automaticReply) recordInboundReplyEngagement_(match, "reply", receivedAt);
      else if (classification.category === "Bounce") recordInboundReplyEngagement_(match, "bounce", receivedAt);
      if (!automaticReply) {
        try {
          const fill = applyInboundReplyDirectoryFill_(match, message, classification, receivedAt);
          if (fill.changed) summary.directory_fills += 1;
        } catch (error) {
          // Saving the reply remains more important than a convenience fill; a later backfill can retry it.
          console.warn(`Directory fill from reply failed: ${String(error && error.message || error)}`);
        }
      }
      const stops = applyInboundReplySafeStops_(match, classification, receivedAt);
      if (stops.applied) summary.auto_actions += 1;
      const fields = inboundReplyOutcomeFields_(classification, stops, receivedAt);
      const handled = fields.status === "Handled";
      setInboundReplyCells_(sheet, rowNumber, {
        auto_action:inboundReplyCellText_(stops.text, 500),
        status:fields.status,
        priority:fields.priority,
        respond_by:fields.respond_by,
        handled_at:handled ? new Date() : "",
        handled_by:handled ? "Reply checker" : "",
        handled_note:handled ? "No reply needed" : "",
      });
      advance(receivedMs);
    }
    // Close replies answered from Zoho, if the run still has time. A failure here never fails the check.
    if (Date.now() - started < INBOUND_REPLY_RUN_BUDGET_MS) {
      try {
        const closed = closeAnsweredInboundReplies_(sheet);
        summary.answered = closed.answered;
        summary.scan_capped = closed.scan_capped;
      } catch (error) {
        console.error(`Closing answered replies failed: ${String(error && error.message || error)}`);
      }
    }
    if (summary.added || summary.auto_actions || summary.directory_fills || summary.answered) {
      bumpReadCacheVersion_(["outreach"]);
      // On the schedule, rebuild Outreach now so the next page load doesn't wait for it (.84). A staff press of
      // Check for new replies skips this to answer quickly; the page refreshes the stale copy itself.
      if (trigger === "Schedule") rebuildReadCaches_(["outreach"]);
    }
  } catch (error) {
    summary.error = String(error && error.message || error).slice(0, 500);
    throw error;
  } finally {
    summary.duration_ms = Date.now() - started;
    setInboundReplyLastRun_(summary);
    cache.remove(INBOUND_REPLY_RUNNING_CACHE_KEY);
  }
  return {
    message:`Checked ${summary.checked} new Inbox message(s): ${summary.added} repl${summary.added === 1 ? "y" : "ies"} added${summary.directory_fills ? `, ${summary.directory_fills} Directory contact${summary.directory_fills === 1 ? "" : "s"} filled` : ""}${summary.auto_actions ? `, ${summary.auto_actions} applied automatically` : ""}${summary.answered ? `, ${summary.answered} answered in Zoho` : ""}.${summary.more_available ? " More messages are waiting; they are picked up on the next check." : ""}${summary.scan_capped ? " The Sent folder scan hit its limit; some answers may not be seen." : ""}`,
    last_run:summary,
  };
}

function inboundReplyRecord_(row, rowNumber) {
  const iso = value => { const date = outreachDate_(value); return date ? date.toISOString() : ""; };
  return {
    row:rowNumber,
    reply_id:String(row.reply_id || ""),
    received_at:iso(row.received_at),
    from:String(row.from || ""),
    from_name:String(row.from_name || ""),
    subject:String(row.subject || ""),
    reply_text:String(row.reply_text || ""),
    account_id:String(row.account_id || ""),
    source_row:Number(row.source_row || 0) || null,
    business:String(row.business || ""),
    relationship:String(row.relationship || ""),
    matched_by:String(row.matched_by || ""),
    last_sent_stage:String(row.last_sent_stage || ""),
    last_sent_at:iso(row.last_sent_at),
    category:String(row.category || ""),
    summary:String(row.summary || ""),
    suggested_outcome:String(row.suggested_outcome || ""),
    priority:String(row.priority || ""),
    respond_by:iso(row.respond_by),
    auto_action:String(row.auto_action || ""),
    classifier:String(row.classifier || ""),
    status:String(row.status || "New"),
    handled_at:iso(row.handled_at),
    handled_by:String(row.handled_by || ""),
    handled_note:String(row.handled_note || ""),
    outcome_logged:String(row.outcome_logged || ""),
    needs_outcome:inboundReplyNeedsOutcome_(row),
    zoho_message_id:String(row.zoho_message_id || ""),
    bounce:String(row.category || "") === "Bounce" ? inboundReplyBounceProblem_(row.reply_text) : null,
  };
}

/**
 * A bounce in plain words for the Replies view: { verdict, words, sender }. Display only; it never changes data.
 * verdict: "dead" (the address is gone), "probably_dead" (their mail server can't be reached), "refused" (their server
 * refused our email; the address is probably fine), "delayed" (still retrying) or "unknown". sender: true when the
 * receiver refused OUR sending address or domain, which points at our own mail setup.
 */
function inboundReplyBounceProblem_(text) {
  const head = inboundReplyBounceHead_(text);
  const kind = inboundReplyBounceKind_(text);
  if (kind === "delayed") return { verdict:"delayed", words:"Delivery was delayed; Zoho kept retrying.", sender:false };
  if (kind === "blocked") {
    if (/(\b5\.1\.[78]\b|sender('s)? (address|domain|system address))/i.test(head)) {
      return { verdict:"refused", words:"Their server rejected our sending address. That usually points at our email setup, not their address.", sender:true };
    }
    if (/(\b5\.2\.2\b|mailbox (is )?full|over quota|out of storage)/i.test(head)) return { verdict:"refused", words:"Their mailbox is full, so the email bounced. The address is probably fine.", sender:false };
    if (/yahoo|\b552\b/i.test(head)) return { verdict:"refused", words:"Their server refused the email: usually a spam filter, sometimes a full mailbox.", sender:false };
    return { verdict:"refused", words:"Their server refused the email (spam filter or policy). The address is probably fine.", sender:false };
  }
  if (/(group .{0,40}may not exist|group you tried to contact)/i.test(head)) return { verdict:"dead", words:"This address doesn't exist (their email group was removed).", sender:false };
  if (/(mailbox|account) (is |has been )?(disabled|deactivated|suspended|closed)/i.test(head)) return { verdict:"dead", words:"This mailbox has been shut off.", sender:false };
  if (kind === "hard") return { verdict:"dead", words:"This address doesn't exist.", sender:false };
  if (/(host (not |un)reachable|host not found|no route to host|connection (timed out|refused)|domain (not found|does not exist)|unrouteable|no mx)/i.test(head)) {
    return { verdict:"probably_dead", words:"Their mail server couldn't be reached, so Zoho gave up.", sender:false };
  }
  return { verdict:"unknown", words:"The email couldn't be delivered. Read the bounce for details.", sender:false };
}

/** Zoho Mail's web address for the configured data center (https://mail.zoho.com/api → https://mail.zoho.com/zm/). */
function inboundReplyZohoWebUrl_() {
  let api = "";
  try { api = String(getOutreachCampaignSettings_()["Zoho Mail API URL"] || ""); } catch (error) { api = ""; }
  const origin = (api.match(/^https:\/\/mail\.zoho\.[a-z.]+/i) || ["https://mail.zoho.com"])[0];
  return `${origin}/zm/`;
}

/** Replies for the Replies view: every open reply plus the last 30 days of handled ones. */
function apiGetInboundReplies_() {
  const sheet = getInboundRepliesSheet_(false);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const replies = !sheet || sheet.getLastRow() < 2 ? [] : getAllRowsAsObjects_(sheet)
    .map((row, index) => inboundReplyRecord_(row, index + 2))
    .filter(reply => reply.reply_id && (reply.status === "New" || reply.needs_outcome || (Date.parse(reply.received_at) || 0) >= cutoff));
  replies.sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
  const now = Date.now();
  const open = replies.filter(reply => reply.status === "New");
  return {
    replies:replies,
    counts:{
      open:open.length,
      needs_outcome:replies.filter(reply => reply.needs_outcome).length,
      respond_today:open.filter(reply => reply.priority === INBOUND_REPLY_PRIORITY_LABELS.today).length,
      overdue:open.filter(reply => reply.respond_by && Date.parse(reply.respond_by) < now).length,
    },
    last_run:inboundReplyLastRun_(),
    checker_installed:inboundReplyCheckerInstalled_(),
    awaiting_skill:open.filter(reply => reply.category === "Needs reading").length,
    mailer_configured:outreachMailerConfigured_(),
    zoho_mail_url:inboundReplyZohoWebUrl_(),
  };
}

/** Marks a reply handled or dismissed (or reopens it). Identified by Reply ID, never by row alone. */
function resolveInboundReply_(replyId, status, staffName, note, expectedAccountId) {
  const allowed = ["Handled", "Dismissed", "New"];
  if (!allowed.includes(status)) throw new Error("Choose Handled, Dismissed or New.");
  const sheet = getInboundRepliesSheet_(false);
  if (!sheet) throw new Error("No replies have been recorded yet.");
  const rows = outreachRowsMatchingCell_(sheet, ["reply_id", "Reply ID"], String(replyId || "").trim());
  if (!rows.length) throw new Error("Reply not found. Refresh and try again.");
  const rowNumber = rows[0].__source_row;
  if (expectedAccountId !== undefined && String(rows[0].account_id || "").trim() !== String(expectedAccountId || "").trim()) {
    throw new Error("That reply belongs to a different business.");
  }
  // Only the four status cells are written; the rest of the row (outside text, the skill's cells) is untouched.
  // Reopening records when and by whom, so "Answered in Zoho" only closes it again for a newer sent message.
  const changes = {
    status:status,
    handled_at:new Date(),
    handled_by:inboundReplyCellText_(staffName, 120),
    handled_note:status === "New" ? inboundReplyCellText_(`Reopened by ${staffName}`, 500) : inboundReplyCellText_(note, 500),
  };
  setInboundReplyCells_(sheet, rowNumber, changes);
  return inboundReplyRecord_(Object.assign({}, rows[0], changes), rowNumber);
}

function apiResolveInboundReply_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["reply_id", "status"]);
  const staffName = authenticatedActor_(p, "Staff");
  if (p.no_outcome) {
    // An answered reply that needs no outcome: only Outcome Logged is written.
    const sheet = getInboundRepliesSheet_(false);
    const rows = sheet ? outreachRowsMatchingCell_(sheet, ["reply_id", "Reply ID"], String(p.reply_id || "").trim()) : [];
    if (!rows.length) throw new Error("Reply not found. Refresh and try again.");
    const changes = { outcome_logged:inboundReplyCellText_(`No outcome needed · ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMM d")} · ${staffName}`, 200) };
    setInboundReplyCells_(sheet, rows[0].__source_row, changes);
    const record = inboundReplyRecord_(Object.assign({}, rows[0], changes), rows[0].__source_row);
    appendAudit_("RESOLVE_INBOUND_REPLY", "Reply", record.reply_id, record.account_id, staffName, INBOUND_REPLIES_SHEET_NAME, INBOUND_REPLIES_SHEET_NAME, "Completed", "No outcome needed");
    return { message:"Marked as needing no outcome.", reply:record };
  }
  const reply = resolveInboundReply_(p.reply_id, String(p.status), staffName, publicText_(p.note || "", 500, "Note"));
  appendAudit_("RESOLVE_INBOUND_REPLY", "Reply", reply.reply_id, reply.account_id, staffName, INBOUND_REPLIES_SHEET_NAME, INBOUND_REPLIES_SHEET_NAME, "Completed", reply.status);
  return { message:`Reply marked ${reply.status === "New" ? "open" : reply.status.toLowerCase()}.`, reply:reply };
}

// "Check now" from the Hub starts a one-time background run, so a slow Inbox or classification
// never runs into the web request's time limit. The Replies view refreshes to show the result.
const INBOUND_REPLY_CHECK_NOW_HANDLER = "runInboundReplyCheckNow";

function runInboundReplyCheckNow() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === INBOUND_REPLY_CHECK_NOW_HANDLER)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  try { checkInboundReplies_("Staff"); }
  catch (error) { console.error(`Inbound reply check failed: ${String(error && error.message || error)}`); }
}

function apiCheckInboundReplies_() {
  if (!outreachMailerConfigured_()) throw new Error("The Distribution Outreach mailer is not configured, so the Inbox cannot be read.");
  if (CacheService.getScriptCache().get(INBOUND_REPLY_RUNNING_CACHE_KEY)) return { message:"A reply check is already running. Refresh in a minute.", started:false };
  const pending = ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === INBOUND_REPLY_CHECK_NOW_HANDLER);
  if (!pending) ScriptApp.newTrigger(INBOUND_REPLY_CHECK_NOW_HANDLER).timeBased().after(1000).create();
  return { message:"Checking the Inbox now. Refresh the Replies view in a minute.", started:true };
}

