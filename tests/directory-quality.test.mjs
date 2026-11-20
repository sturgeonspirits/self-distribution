// Behavioral tests for the weekly Directory quality check and bounced-address handling.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readBackend } from "./helpers/backend-source.mjs";

function formatDate(date, _zone, pattern) {
  if (pattern === "yyyy-MM-dd") return date.toISOString().slice(0, 10);
  if (pattern === "u") return String(((date.getUTCDay() + 6) % 7) + 1);
  return date.toISOString().slice(0, 10);
}

async function contextFor() {
  const properties = new Map();
  const context = {
    console:{ log() {}, warn() {}, error() {} },
    Utilities:{ formatDate }, Session:{ getScriptTimeZone:() => "America/Chicago" },
    PropertiesService:{ getScriptProperties:() => ({ getProperty:key => properties.get(key) || null, setProperty:(key, value) => properties.set(key, value) }) },
    CacheService:{ getScriptCache:() => ({ get:() => null, put() {}, remove() {} }) },
    SpreadsheetApp:{}, LockService:{}, ScriptApp:{}, ContentService:{}, MimeType:{},
  };
  vm.createContext(context);
  vm.runInContext(await readBackend(), context);
  return { context, properties };
}

function call(context, expression) {
  return JSON.parse(JSON.stringify(vm.runInContext(expression, context)));
}

test("placeholder checks catch configured placeholders but not an ordinary name containing na", async () => {
  const { context } = await contextFor();
  const rows = [
    { business_name:"One Bar", contact_person:"Nate Anderson", email:"nate@example.com", city:"Oshkosh", account_id:"A1", relationship:"Prospect" },
    { business_name:"Two Bar", contact_person:"na na", email:"two@example.com", city:"Oshkosh", account_id:"A2", relationship:"Prospect" },
    { business_name:"Three Bar", contact_person:"Club Manager", email:"three@example.com", city:"Oshkosh", account_id:"A3", relationship:"Prospect" },
  ];
  const report = call(context, `directoryQualityReportFromRows_(${JSON.stringify(rows)})`);
  assert.deepEqual(report.categories.placeholder_contact.rows.map(item => item.name), ["Three Bar", "Two Bar"]);
});

test("duplicates require matching name and city or phone, never a shared chain email alone", async () => {
  const { context } = await contextFor();
  const rows = [
    { business_name:"The Cozumel, LLC", contact_person:"Maria Smith", email:"chain@example.com", city:"Oshkosh", phone_number:"920-555-0101", account_id:"A1", relationship:"Prospect" },
    { business_name:"Cozumel Inc.", contact_person:"Maria Smith", email:"other@example.com", city:"Oshkosh", phone_number:"920-555-0102", account_id:"A2", relationship:"Prospect" },
    { business_name:"Anduzzi's North", contact_person:"Rae Jones", email:"chain@example.com", city:"Green Bay", phone_number:"920-555-0103", account_id:"A3", relationship:"Prospect" },
    { business_name:"Anduzzi's South", contact_person:"Rae Jones", email:"chain@example.com", city:"Green Bay", phone_number:"920-555-0104", account_id:"A4", relationship:"Prospect" },
  ];
  const report = call(context, `directoryQualityReportFromRows_(${JSON.stringify(rows)})`);
  assert.deepEqual(report.categories.duplicates.rows.map(item => item.name), ["Cozumel Inc.", "The Cozumel, LLC"]);
});

test("weekly check moves only hard-bounced addresses into Notes and the send validator refuses them", async () => {
  const { context } = await contextFor();
  const values = [["Business Name", "Contact Person", "Email", "Status", "Outcome", "Notes", "Account ID", "Relationship", "City"],
    ["Bounced Bar", "Jamie Smith", "bounce@example.com", "Needs email", "Bad address", "Prior note", "A1", "Prospect", "Oshkosh"],
    ["Wrong Contact Bar", "Rae Jones", "wrong@example.com", "Needs email", "Wrong contact", "", "A2", "Prospect", "Oshkosh"]];
  const sheet = {
    getLastRow:() => values.length, getLastColumn:() => values[0].length,
    getParent:() => ({ getId:() => "quality-test" }), getSheetId:() => 1,
    getRange(row, column, height = 1, width = 1) {
      return {
        getValues:() => Array.from({ length:height }, (_, i) => Array.from({ length:width }, (_, j) => values[row - 1 + i]?.[column - 1 + j] ?? "")),
        setValue:value => { values[row - 1][column - 1] = value; },
        setValues:matrix => matrix.forEach((line, i) => line.forEach((value, j) => { values[row - 1 + i][column - 1 + j] = value; })),
        setDataValidation() {},
      };
    },
  };
  context.__sheet = sheet;
  vm.runInContext("getOutreachSheet_ = () => __sheet; appendAudit_ = () => {};", context);
  const result = call(context, "directoryQualityCheck_({ now:'2026-11-19T15:00:00-06:00' })");
  assert.equal(result.moved_bad_emails.length, 1);
  assert.equal(values[1][2], "");
  assert.match(values[1][5], /2026-11-19 - Bad email \(bounced\): bounce@example\.com/);
  assert.equal(values[2][2], "wrong@example.com", "Wrong contact is a staff decision and stays put");
  const reasons = call(context, "outreachSendEligibility_({ email:'bounce@example.com', notes:'2026-11-19 - Bad email (bounced): bounce@example.com', status:'Not contacted', outcome:'', next_email:'Initial', do_not_email:false, email_confidence:'confirmed', activity:[] }, { initial_sent_emails:new Set(), skip_legacy_pilot:true })");
  assert.ok(reasons.includes("Recipient email is recorded as a bounced address"));
});

test("a moved address still matches an inbound bounce and the weekly guard only runs once", async () => {
  const { context, properties } = await contextFor();
  const rows = [{ account_id:"A1", business_name:"Bounced Bar", email:"", notes:"2026-11-19 - Bad email (bounced): late@example.com" }];
  const directory = { getLastRow:() => 2, getLastColumn:() => 1 };
  context.__directory = directory;
  context.__rows = rows;
  vm.runInContext(`
    getOutreachSheet_ = () => __directory;
    getAllRowsAsObjects_ = () => __rows;
    getOutreachCampaignSettings_ = () => ({});
    getOutreachSs_ = () => ({ getSheetByName:() => null });
    newsletterContacts_ = () => [];
  `, context);
  const index = call(context, "(() => { const index = inboundReplyIndex_(); return { matched:index.byEmail.get('late@example.com').map(record => record.account_id) }; })()");
  assert.deepEqual(index.matched, ["A1"]);
  vm.runInContext("directoryQualityCheck_ = (() => { let n = 0; return () => ({ runs:++n }); })();", context);
  const first = call(context, "maybeRunDirectoryQualityCheck_(new Date('2026-11-19T15:00:00-06:00'))");
  const second = call(context, "maybeRunDirectoryQualityCheck_(new Date('2026-11-19T16:00:00-06:00'))");
  assert.equal(first.runs, 1);
  assert.equal(second.skipped, "Already checked this week.");
  assert.ok(properties.get("DIRECTORY_QUALITY_LAST_RUN"));
});
