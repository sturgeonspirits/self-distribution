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
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) ?? null, setProperty: (key, value) => properties.set(key, String(value)) }) },
    UrlFetchApp: { fetch: (url, options) => { fetches.push(JSON.parse(options.payload)); return { getContentText: () => JSON.stringify(mailerResult), getResponseCode: () => 200 }; } },
    Utilities: { formatDate: date => new Date(date).toISOString().slice(11, 16) },
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
  assert.match(schedule, /Sending started\. The Hub sends about \$\{outreachHourlyLimit_\(\)\} an hour on its own/);
});

test("the mailer reports Zoho's Outbox after real sends only and never fails a send over it", async () => {
  const mailer = await readFile(new URL("docs/reference/distribution-outreach/Code.gs", root), "utf8");
  const send = mailer.slice(mailer.indexOf("function sendAppEmailRequest_"), mailer.indexOf("// ---------- Outbox check"));
  assert.match(send, /if \(!testMode\) accepted\.held_in_outbox = outboxHeldCount_\(settings\);\s*setAppReceipt_\(token, accepted\);/);
  assert.match(send, /appendAppLog_\(lead, body, deliveredTo, testMode \? 'APP TEST SENT' : 'APP SENT', accepted\.message_id, acceptedLogDetail_\(accepted\)\);/);
  const reminder = mailer.slice(mailer.indexOf("function sendPaymentReminderRequest_"), mailer.indexOf("// ---------- Inbox reading"));
  assert.match(reminder, /accepted\.held_in_outbox = outboxHeldCount_\(settings\);/);

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
