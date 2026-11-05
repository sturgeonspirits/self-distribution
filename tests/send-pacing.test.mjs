// Send pacing (Inventory API .50) and the mailer's Outbox report (distribution outreach .34).
// Run: node --test tests/send-pacing.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const MIN = 60 * 1000;

async function backend({ config = {}, mailerResult } = {}) {
  const code = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const properties = new Map();
  const fetches = [];
  const context = {
    console: { log() {}, warn() {}, error() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) ?? null, setProperty: (key, value) => properties.set(key, String(value)), deleteProperty: key => properties.delete(key) }) },
    UrlFetchApp: { fetch: (url, options) => { fetches.push(JSON.parse(options.payload)); return { getContentText: () => JSON.stringify(mailerResult), getResponseCode: () => 200 }; } },
    Utilities: { formatDate: date => new Date(date).toISOString().slice(11, 16), sleep() {} },
    Session: {}, SpreadsheetApp: {}, CacheService: {}, LockService: {}, ContentService: {}, MimeType: {}, ScriptApp: {},
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  context.__config = config;
  vm.runInContext(`getHubConfigurationValue_ = key => (__config[key] === undefined ? "" : String(__config[key]));
    outreachMailerProperties_ = () => ({ url:"https://mailer.example", secret:"s" }); outreachMailerConfigured_ = () => true;`, context);
  const call = expr => JSON.parse(JSON.stringify(vm.runInContext(expr, context) ?? null));
  return { context, properties, fetches, call };
}

test("the allowance spreads sends: 20 an hour, 2 per 5 minutes, configurable", async () => {
  const { call, properties } = await backend();
  const now = Date.parse("2026-10-30T20:00:00Z");
  assert.deepEqual(call(`(() => { const a = outreachSendAllowance_(${now}); return [a.allowed, a.limit, a.burst]; })()`), [2, 20, 2]);

  // Two sends in the last 5 minutes use the burst; the next can go 5 minutes after the older one.
  properties.set("OUTREACH_SEND_TIMES", JSON.stringify([now - 4 * MIN, now - 1 * MIN]));
  let a = call(`outreachSendAllowance_(${now})`);
  assert.equal(a.allowed, 0);
  assert.equal(a.next_at, now + 1 * MIN);

  // Twenty in the last hour use the hour; the next can go when the oldest falls out.
  properties.set("OUTREACH_SEND_TIMES", JSON.stringify(Array.from({ length: 20 }, (_, i) => now - 59 * MIN + i * 2 * MIN)));
  a = call(`outreachSendAllowance_(${now})`);
  assert.equal(a.allowed, 0);
  assert.equal(a.sent_last_hour, 20);
  assert.equal(a.next_at, now + 1 * MIN);

  // Sends older than an hour no longer count.
  properties.set("OUTREACH_SEND_TIMES", JSON.stringify([now - 61 * MIN, now - 90 * MIN]));
  assert.equal(call(`outreachSendAllowance_(${now}).allowed`), 2);

  const tuned = await backend({ config: { outreach_hourly_send_limit: 36 } });
  assert.deepEqual(tuned.call(`(() => { const a = outreachSendAllowance_(${now}); return [a.limit, a.burst]; })()`), [36, 3]);
  const nonsense = await backend({ config: { outreach_hourly_send_limit: "lots" } });
  assert.equal(nonsense.call(`outreachSendAllowance_(${now}).limit`), 20);
});

test("a hold stops campaign sends for an hour and says to check Zoho", async () => {
  const { call, properties } = await backend();
  const now = Date.parse("2026-10-30T20:00:00Z");
  call(`outreachRecordSend_(${now}, true)`);
  assert.equal(Number(properties.get("OUTREACH_SEND_HOLD_UNTIL")), now + 60 * MIN);
  const a = call(`outreachSendAllowance_(${now + 10 * MIN})`);
  assert.equal(a.allowed, 0);
  assert.equal(a.held, true);
  assert.equal(a.next_at, now + 60 * MIN);
  assert.match(call(`outreachPacingMessage_(outreachSendAllowance_(${now + 10 * MIN}))`), /Zoho was holding mail in the Outbox/);
  assert.equal(call(`outreachSendAllowance_(${now + 61 * MIN}).allowed`), 2);
});

test("an empty Zoho Outbox releases a hold at the next run (after four minutes), while unknown results keep it", async () => {
  const now = Date.parse("2026-11-05T20:00:00Z");
  const empty = await backend({ mailerResult: { ok:true, held_in_outbox:0 } });
  empty.properties.set("OUTREACH_SEND_HOLD_UNTIL", String(now + 50 * MIN));
  empty.properties.set("OUTREACH_SEND_HOLD_STREAK", "2");
  assert.deepEqual(empty.call(`outreachClearReleasedOutboxHold_(${now + 11 * MIN}, { outbox_hold_checked:false })`), { checked:true, cleared:true, held_in_outbox:0 });
  assert.equal(empty.properties.get("OUTREACH_SEND_HOLD_UNTIL"), undefined);
  assert.equal(empty.properties.get("OUTREACH_SEND_HOLD_STREAK"), "0");
  assert.equal(empty.fetches[0].action, "getOutboxHeldCount");

  const unknown = await backend({ mailerResult: { ok:true, held_in_outbox:-1 } });
  unknown.properties.set("OUTREACH_SEND_HOLD_UNTIL", String(now + 50 * MIN));
  assert.deepEqual(unknown.call(`outreachClearReleasedOutboxHold_(${now + 11 * MIN}, { outbox_hold_checked:false })`), { checked:true, cleared:false, held_in_outbox:-1 });
  assert.equal(Number(unknown.properties.get("OUTREACH_SEND_HOLD_UNTIL")), now + 50 * MIN);
});

test("real sends are recorded; tests, replays and reads are not", async () => {
  const sent = await backend({ mailerResult: { ok: true, accepted: true, message_id: "m1", held_in_outbox: 0 } });
  sent.call(`callOutreachMailer_({ action:"sendAppEmail" })`);
  sent.call(`callOutreachMailer_({ action:"sendWelcomeEmail" })`);
  sent.call(`callOutreachMailer_({ action:"sendAppTestEmail" })`);
  sent.call(`callOutreachMailer_({ action:"listInboxMessages" })`);
  assert.equal(JSON.parse(sent.properties.get("OUTREACH_SEND_TIMES")).length, 2);
  assert.equal(sent.properties.get("OUTREACH_SEND_HOLD_UNTIL"), undefined);

  const replay = await backend({ mailerResult: { ok: true, accepted: true, message_id: "m1", idempotent: true } });
  replay.call(`callOutreachMailer_({ action:"sendAppEmail" })`);
  assert.equal(replay.properties.get("OUTREACH_SEND_TIMES"), undefined);

  const held = await backend({ mailerResult: { ok: true, accepted: true, message_id: "m2", held_in_outbox: 3 } });
  held.call(`callOutreachMailer_({ action:"sendPaymentReminder" })`);
  assert.ok(Number(held.properties.get("OUTREACH_SEND_HOLD_UNTIL")) > Date.now());

  // An unknown Outbox check (-1) is not a hold.
  const unknown = await backend({ mailerResult: { ok: true, accepted: true, message_id: "m3", held_in_outbox: -1 } });
  unknown.call(`callOutreachMailer_({ action:"sendAppEmail" })`);
  assert.equal(unknown.properties.get("OUTREACH_SEND_HOLD_UNTIL"), undefined);
});

test("the campaign batch sends only what the budget allows and stops on a hold", async () => {
  const source = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const batch = source.slice(source.indexOf("function apiSendOutreachCampaignBatch_"), source.indexOf("// ---------- Inbound reply checker"));
  // Budget is read inside the script lock, before any recipient is touched.
  assert.ok(batch.indexOf("lock.tryLock") < batch.indexOf("outreachSendAllowance_(Date.now())"));
  assert.match(batch, /if \(!allowance\.allowed\) \{\s*return \{ message:outreachPacingMessage_\(allowance\), sent:0, blocked:0, remaining:waiting\.length, results:\[\], paced:true/);
  assert.match(batch, /waiting\.slice\(0, Math\.min\(requestedSize, allowance\.allowed\)\)/);
  assert.equal((batch.match(/heldInOutbox = Math\.max\(heldInOutbox, Number\(result\.held_in_outbox \|\| 0\)\);/g) || []).length, 3, "every send type watches for a hold");
  assert.match(batch, /if \(heldInOutbox\) break;/);
  assert.match(batch, /held:true, held_in_outbox:heldInOutbox/);

  const { call } = await backend();
  assert.equal(call(`outreachAcceptedDetail_({ held_in_outbox:0 })`), "Zoho accepted delivery.");
  assert.equal(call(`outreachAcceptedDetail_({ held_in_outbox:-1 })`), "Zoho accepted delivery.");
  assert.match(call(`outreachAcceptedDetail_({ held_in_outbox:2 })`), /holding 2 emails in the Outbox/);
  assert.equal(call(`outreachAcceptedDetail_({ idempotent:true, held_in_outbox:2 })`), "Previously accepted and recovered.");
});

test("Send remaining can start the paced schedule now", async () => {
  const source = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const schedule = source.slice(source.indexOf("function apiScheduleOutreachCampaign_"), source.indexOf("function apiCancelOutreachCampaignSchedule_"));
  assert.match(schedule, /const check = startNow \? \{ send_at:new Date\(\) \} : campaignScheduleValidation_\(p\.send_at, new Date\(\)\);/);
  assert.match(schedule, /"Sending started\."/);
  assert.match(schedule, /The Hub sends about \$\{outreachHourlyLimit_\(\)\} an hour during the sending window/);
});

test("the mailer reports Zoho's Outbox after real sends only and never fails a send over it", async () => {
  const mailer = await readFile(new URL("docs/reference/distribution-outreach/Code.gs", root), "utf8");
  const send = mailer.slice(mailer.indexOf("function sendAppEmailRequest_"), mailer.indexOf("// ---------- Outbox check"));
  assert.match(send, /if \(!testMode\) accepted\.held_in_outbox = outboxHeldCount_\(settings\);\s*setAppReceipt_\(token, accepted\);/);
  assert.match(send, /appendAppLog_\(lead, body, deliveredTo, testMode \? 'APP TEST SENT' : 'APP SENT', accepted\.message_id, acceptedLogDetail_\(accepted\)\);/);
  const reminder = mailer.slice(mailer.indexOf("function sendPaymentReminderRequest_"), mailer.indexOf("// ---------- Inbox reading"));
  assert.match(reminder, /accepted\.held_in_outbox = outboxHeldCount_\(settings\);/);
  assert.match(mailer, /action === 'getOutboxHeldCount'/);
  assert.match(mailer, /function getOutboxHeldCountRequest_\(\)/);

  const check = mailer.slice(mailer.indexOf("const OUTBOX_CHECK_DELAY_MS"), mailer.indexOf("function sendNewsletterEmailRequest_"));
  const make = folders => {
    const context = {
      Utilities: { sleep() {} },
      CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
      OUTREACH_VERSION: "test",
      console: { warn() {} },
      zohoGet_: path => (path.endsWith("/folders") ? { data: folders } : { data: [{}, {}] }),
    };
    vm.createContext(context);
    vm.runInContext(check, context);
    return context;
  };
  assert.equal(vm.runInContext(`outboxHeldCount_({ "Zoho account ID":"1" })`, make([{ folderId: "9", folderType: "Outbox", folderName: "Outbox" }])), 2);
  assert.equal(vm.runInContext(`outboxHeldCount_({ "Zoho account ID":"1" })`, make([{ folderId: "1", folderType: "Inbox" }])), -1);
  const broken = make([]);
  vm.runInContext(`zohoGet_ = () => { throw new Error("Zoho down"); }`, broken);
  assert.equal(vm.runInContext(`outboxHeldCount_({ "Zoho account ID":"1" })`, broken), -1);
  assert.match(vm.runInContext(`acceptedLogDetail_({ held_in_outbox:1 })`, make([])), /holding 1 email in the Outbox/);
});

test("held sends build a streak that a clean send resets", async () => {
  const { call, properties } = await backend();
  const now = Date.parse("2026-11-05T17:20:00Z");
  call(`outreachRecordSend_(${now}, true)`);
  call(`outreachRecordSend_(${now + MIN}, true)`);
  assert.equal(call(`outreachHoldStreak_()`), 2);
  call(`outreachRecordSend_(${now + 2 * MIN}, false)`);
  assert.equal(call(`outreachHoldStreak_()`), 0);
  properties.set("OUTREACH_SEND_HOLD_STREAK", "nonsense");
  assert.equal(call(`outreachHoldStreak_()`), 0);
});

// Runs runScheduledCampaign_ against one stubbed campaign and one stubbed batch result.
async function scheduledRun(batchResult, { streak = 0, holdUntil = 0 } = {}) {
  const b = await backend();
  if (streak) b.properties.set("OUTREACH_SEND_HOLD_STREAK", String(streak));
  if (holdUntil) b.properties.set("OUTREACH_SEND_HOLD_UNTIL", String(holdUntil));
  b.context.__batch = batchResult;
  vm.runInContext(`
    __campaign = { row:2, headers:{ campaign_id:0, status:1, approval_token:2, scheduled_send_at:3, scheduled_by:4, schedule_status:5, schedule_detail:6, app_version:7 },
      values:["CMP-1", "Approved", "tok", new Date(Date.now() - 60000), "Karl", "Sending", "", ""] };
    __audits = [];
    updateCampaignSchedule_ = (id, mutate) => mutate(__campaign);
    outreachCampaignSheets_ = () => ({});
    outreachCampaignRow_ = () => __campaign;
    apiSendOutreachCampaignBatch_ = () => __batch;
    appendAudit_ = (...args) => __audits.push(args[0]);`, b.context);
  const run = b.call(`runScheduledCampaign_("CMP-1", Date.now() + 60000)`);
  return { run, campaign: b.call(`__campaign.values`), audits: b.call(`__audits`) };
}

test("a Zoho hold makes a scheduled campaign wait and continue on its own, not pause", async () => {
  // A send that Zoho held: keeps Sending, says when it resumes, no pause audit.
  const holdUntil = Date.now() + 60 * MIN;
  let r = await scheduledRun({ sent:1, blocked:0, remaining:53, results:[{ status:"Sent" }], held:true }, { streak:1, holdUntil });
  assert.equal(r.run.state, "Sending");
  assert.equal(r.campaign[5], "Sending");
  assert.match(r.campaign[6], /^Waiting: Zoho held mail in the Outbox, so sending is on hold until .+ and then continues on its own\. 1 sent this run; 53 still waiting\.$/);
  assert.deepEqual(r.audits, []);

  // A run that starts during the hold (nothing sent) also just waits.
  r = await scheduledRun({ sent:0, blocked:0, remaining:53, results:[], paced:true, held:true }, { streak:1, holdUntil });
  assert.equal(r.run.state, "Sending");
  assert.equal(r.campaign[5], "Sending");

  // Three holds in a row with no clean send between: pause for a person to check Zoho.
  r = await scheduledRun({ sent:1, blocked:0, remaining:52, results:[{ status:"Sent" }], held:true }, { streak:3, holdUntil });
  assert.equal(r.run.state, "Paused");
  assert.equal(r.campaign[5], "Paused");
  assert.match(r.campaign[6], /held mail in the Outbox 3 times in a row/);
  assert.deepEqual(r.audits, ["SCHEDULED_OUTREACH_CAMPAIGN_PAUSED"]);

  // An uncertain delivery still pauses, even when Zoho also reported a hold.
  r = await scheduledRun({ sent:0, blocked:1, remaining:53, held:true,
    results:[{ status:"Blocked", mailer_attempted:true, business:"Club Tavern", detail:"unreadable response" }] }, { streak:1, holdUntil });
  assert.equal(r.run.state, "Paused");
  assert.match(r.campaign[6], /after Club Tavern: unreadable response\. Delivery may be uncertain/);
});

// Review fixes for .52 (claude/review-7361d41-2026-11-05.md), shipped in .53-APP / .61-WEB.
test("ensureHeaderColumns_ skips the live read when the cache has every column, and never duplicates one", async () => {
  const { context, call } = await backend();
  context.__header = ["Campaign ID", "Status", "Schedule Detail"];
  context.__reads = 0;
  vm.runInContext(`
    __sheet = {
      getLastColumn: () => __header.length,
      getRange: (row, col, rows, cols) => ({
        getValues: () => { __reads += 1; return [__header.slice(0, cols || 1)]; },
        setValue: value => { __header[col - 1] = value; },
      }),
    };
    headerCacheKey_ = () => "test-sheet";`, context);
  call(`ensureHeaderColumns_(__sheet, ["Schedule Detail"])`);
  const afterFirst = context.__reads;
  call(`ensureHeaderColumns_(__sheet, ["Schedule Detail", "Status"])`);
  assert.equal(context.__reads, afterFirst, "a fully cached map needs no further read");
  // Another helper appends a column behind the cache's back; asking for it must not append a second copy.
  context.__header.push("Message Stage");
  call(`ensureHeaderColumns_(__sheet, ["Message Stage"])`);
  assert.deepEqual(context.__header.filter(h => h === "Message Stage").length, 1);
  call(`ensureHeaderColumns_(__sheet, ["Sequence ID"])`);
  assert.deepEqual(context.__header, ["Campaign ID", "Status", "Schedule Detail", "Message Stage", "Sequence ID"]);
});

test("isDoNotContact_ adds Closed only; older outcomes still count through status alone", async () => {
  const { call } = await backend();
  assert.equal(call(`isDoNotContact_({ status:"Closed" })`), true);
  assert.equal(call(`isDoNotContact_({ status:"Needs email", outcome:"Closed" })`), true);
  // A business whose old result was Not interested but whose status later moved on stays in the queues.
  assert.equal(call(`isDoNotContact_({ status:"Interested", outcome:"Not interested" })`), false);
  assert.equal(call(`isDoNotContact_({ status:"Existing customer", outcome:"Unsubscribed" })`), false);
  assert.equal(call(`isDoNotContact_({ status:"Not interested" })`), true);
});

test("the result window cannot be saved twice when business details arrive mid-save", async () => {
  const index = await readFile(new URL("index.html", root), "utf8");
  const save = index.slice(index.indexOf("async function saveOutreachOutcome"), index.indexOf("async function openContactLogForRecord"));
  assert.match(save, /if \(outcomeSaveInProgress \|\| !selectedOutreachRecord \|\| !selectedOutcome\) return;\s*outcomeSaveInProgress = true;/);
  assert.match(save, /finally \{\s*outcomeSaveInProgress = false;\s*\}/);
  const open = index.slice(index.indexOf("async function openOutcomeDialogForRecord"), index.indexOf("function displayDetailValue"));
  assert.equal((open.match(/\|\| outcomeSaveInProgress\) return;/g) || []).length, 2, "both the loaded and the failed path leave a save alone");
});

test("the Outbox re-check waits four minutes after a hold starts, so the next five-minute run can release it", async () => {
  const start = Date.parse("2026-11-05T18:36:00Z");
  const early = await backend({ mailerResult: { ok:true, held_in_outbox:0 } });
  early.properties.set("OUTREACH_SEND_HOLD_UNTIL", String(start + 60 * MIN));
  assert.deepEqual(early.call(`outreachClearReleasedOutboxHold_(${start + 3 * MIN}, { outbox_hold_checked:false })`), { checked:false, cleared:false, held_in_outbox:-1 });
  assert.equal(early.fetches.length, 0, "no mailer call before four minutes");
  assert.deepEqual(early.call(`outreachClearReleasedOutboxHold_(${start + 5 * MIN}, { outbox_hold_checked:false })`), { checked:true, cleared:true, held_in_outbox:0 });
  // A real hold (mail still in the Outbox) keeps the full hour.
  const real = await backend({ mailerResult: { ok:true, held_in_outbox:3 } });
  real.properties.set("OUTREACH_SEND_HOLD_UNTIL", String(start + 60 * MIN));
  assert.deepEqual(real.call(`outreachClearReleasedOutboxHold_(${start + 5 * MIN}, { outbox_hold_checked:false })`), { checked:true, cleared:false, held_in_outbox:3 });
  assert.equal(Number(real.properties.get("OUTREACH_SEND_HOLD_UNTIL")), start + 60 * MIN);
});

// Sending window and same-run hold check (Inventory API .57-APP).
function chicagoFormat(date, tz, fmt) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone:"America/Chicago", weekday:"short", hour:"numeric", minute:"numeric", hourCycle:"h23" })
    .formatToParts(new Date(date)).map(p => [p.type, p.value]));
  if (fmt === "u") return String(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1);
  if (fmt === "H") return String(Number(parts.hour));
  if (fmt === "m") return String(Number(parts.minute));
  return new Date(date).toISOString();
}

test("the sending window: weekdays 10 am–2 pm Chicago by default, configurable or off", async () => {
  const { context, call } = await backend();
  context.Utilities = { formatDate: chicagoFormat, sleep() {} };
  const state = (iso, config) => {
    context.__config = config === undefined ? {} : { outreach_send_window: config };
    return call(`outreachSendWindowState_(new Date("${iso}"))`);
  };
  assert.equal(state("2026-11-05T19:06:00Z").open, true, "Thu 1:06 pm CST");
  let s = state("2026-11-05T20:30:00Z"); // Thu 2:30 pm
  assert.equal(s.open, false);
  assert.equal(s.next_open, "2026-11-06T16:00:00.000Z", "Fri 10 am CST");
  assert.equal(s.label, "10 am–2 pm, Mon, Tue, Wed, Thu, Fri");
  s = state("2026-11-07T17:00:00Z"); // Sat 11 am
  assert.equal(s.open, false);
  assert.equal(s.next_open, "2026-11-09T16:00:00.000Z", "Mon 10 am");
  assert.equal(state("2026-11-06T15:59:00Z").open, false, "Fri 9:59 am");
  assert.equal(state("2026-11-07T17:00:00Z", "off").open, true);
  s = state("2026-11-05T17:00:00Z", "11:00-13:30 Tue,Thu"); // Thu 11 am
  assert.equal(s.open, true);
  assert.equal(state("2026-11-05T19:40:00Z", "11:00-13:30 Tue,Thu").next_open, "2026-11-10T17:00:00.000Z", "Thu 1:40 pm → Tue 11 am");
  assert.equal(state("2026-11-05T19:06:00Z", "nonsense").label, "10 am–2 pm, Mon, Tue, Wed, Thu, Fri", "a bad setting falls back to the default");
});

test("outside the window the scheduler sends nothing and notes when it resumes, writing only when the note changes", async () => {
  const { context } = await backend();
  context.Utilities = { formatDate: chicagoFormat, sleep() {} };
  vm.runInContext(`
    __writes = []; __sent = 0;
    __headers = { campaign_id:0, status:1, approval_token:2, scheduled_send_at:3, scheduled_by:4, schedule_status:5, schedule_detail:6 };
    __row = ["CMP-1", "Approved", "tok", new Date(Date.now() - 60000), "Karl", "Sending", ""];
    outreachCampaignSheets_ = () => ({ campaigns:{ getLastRow:() => 2, getLastColumn:() => 7, getRange:() => ({ getValues:() => [__row.slice()] }) } });
    getHeaderMap_ = () => __headers;
    outreachSendWindowState_ = () => ({ open:false, next_open:new Date("2026-11-06T16:00:00Z"), label:"10 am–2 pm, Mon, Tue, Wed, Thu, Fri" });
    campaignScheduleTimeLabel_ = () => "Fri Nov 6, 10:00 AM CT";
    updateCampaignSchedule_ = (id, mutate) => { const c = { values:__row, headers:__headers }; mutate(c); __writes.push(__row[6]); };
    runScheduledCampaign_ = () => { __sent += 1; return {}; };
    bumpReadCacheVersion_ = () => {};`, context);
  vm.runInContext(`runScheduledOutreachCampaigns()`, context);
  vm.runInContext(`runScheduledOutreachCampaigns()`, context);
  assert.equal(context.__sent, 0);
  assert.equal(context.__writes.length, 1, "the same note is not rewritten every five minutes");
  assert.match(context.__writes[0], /^Waiting for the sending window \(10 am–2 pm, Mon, Tue, Wed, Thu, Fri\); next opens Fri Nov 6, 10:00 AM CT\. Continues on its own\.$/);
});

test("a send reported held is re-checked in the same run; if the Outbox emptied, sending continues", async () => {
  const { context } = await backend();
  context.Utilities = { formatDate: chicagoFormat, sleep() { context.__slept = (context.__slept || 0) + 1; } };
  vm.runInContext(`
    __headers = { campaign_id:0, status:1, approval_token:2, scheduled_send_at:3, scheduled_by:4, schedule_status:5, schedule_detail:6, app_version:7 };
    __campaign = { row:2, headers:__headers, values:["CMP-1", "Approved", "tok", new Date(Date.now() - 60000), "Karl", "Sending", "", ""] };
    __batches = [
      { sent:1, blocked:0, remaining:10, results:[{ status:"Sent" }], held:true },
      { sent:1, blocked:0, remaining:9, results:[{ status:"Sent" }] },
    ];
    __calls = 0;
    updateCampaignSchedule_ = (id, mutate) => mutate(__campaign);
    outreachCampaignSheets_ = () => ({});
    outreachCampaignRow_ = () => __campaign;
    apiSendOutreachCampaignBatch_ = () => { __calls += 1; return __batches.shift(); };
    outreachClearReleasedOutboxHold_ = (now, state, options) => ({ cleared:!!(options && options.force) });
    outreachSendWindowState_ = () => ({ open:true });
    appendAudit_ = () => {};`, context);
  const run = JSON.parse(JSON.stringify(vm.runInContext(`runScheduledCampaign_("CMP-1", Date.now() + 200000, { outbox_hold_checked:false })`, context)));
  assert.equal(context.__calls, 2, "the cleared hold lets the run send its second email");
  assert.equal(context.__slept, 1);
  assert.equal(run.sent, 2);
  assert.equal(run.state, "Sending");

  // Still held after the re-check: wait it out as before (no second send in this run).
  vm.runInContext(`
    __campaign.values[5] = "Sending";
    __batches = [{ sent:1, blocked:0, remaining:10, results:[{ status:"Sent" }], held:true }];
    __calls = 0;
    outreachClearReleasedOutboxHold_ = () => ({ cleared:false });
    outreachHoldStreak_ = () => 1;
    outreachSendAllowance_ = () => ({ next_at:Date.now() + 3600000 });`, context);
  const held = JSON.parse(JSON.stringify(vm.runInContext(`runScheduledCampaign_("CMP-1", Date.now() + 200000, { outbox_hold_checked:false })`, context)));
  assert.equal(context.__calls, 1);
  assert.equal(held.state, "Sending");
  assert.match(context.__campaign.values[6], /^Waiting: Zoho held mail in the Outbox/);
});

test("the next window opens at 10 am Chicago across both daylight-saving changes", async () => {
  const { context, call } = await backend();
  context.Utilities = { formatDate: chicagoFormat, sleep() {} };
  context.__config = {};
  // Spring forward (Sun Mar 8, 2026): Fri 3 pm CST → Mon 10 am CDT = 15:00Z.
  assert.equal(call(`outreachSendWindowState_(new Date("2026-03-06T21:00:00Z")).next_open`), "2026-03-09T15:00:00.000Z");
  // Fall back (Sun Nov 1, 2026): Fri 3 pm CDT → Mon 10 am CST = 16:00Z.
  assert.equal(call(`outreachSendWindowState_(new Date("2026-10-30T20:00:00Z")).next_open`), "2026-11-02T16:00:00.000Z");
});

test("a window that closes during the 45-second hold re-check stops the run before a second batch", async () => {
  const { context } = await backend();
  context.Utilities = { formatDate: chicagoFormat, sleep() {} };
  vm.runInContext(`
    __headers = { campaign_id:0, status:1, approval_token:2, scheduled_send_at:3, scheduled_by:4, schedule_status:5, schedule_detail:6, app_version:7 };
    __campaign = { row:2, headers:__headers, values:["CMP-1", "Approved", "tok", new Date(Date.now() - 60000), "Karl", "Sending", "", ""] };
    __calls = 0;
    updateCampaignSchedule_ = (id, mutate) => mutate(__campaign);
    outreachCampaignSheets_ = () => ({});
    outreachCampaignRow_ = () => __campaign;
    apiSendOutreachCampaignBatch_ = () => { __calls += 1; return { sent:1, blocked:0, remaining:10, results:[{ status:"Sent" }], held:true }; };
    outreachClearReleasedOutboxHold_ = () => ({ cleared:true });
    outreachSendWindowState_ = () => ({ open:false, next_open:new Date("2026-11-06T16:00:00Z"), label:"10 am–2 pm, Mon, Tue, Wed, Thu, Fri" });
    campaignScheduleTimeLabel_ = () => "Fri Nov 6, 10:00 AM CT";
    appendAudit_ = () => {};`, context);
  const run = JSON.parse(JSON.stringify(vm.runInContext(`runScheduledCampaign_("CMP-1", Date.now() + 200000, { outbox_hold_checked:false })`, context)));
  assert.equal(context.__calls, 1);
  assert.equal(run.state, "Sending");
  assert.match(context.__campaign.values[6], /^Waiting for the sending window/);
});
