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
    PropertiesService:{ getScriptProperties:() => ({ getProperty:key => properties.get(key) || null, setProperty:(key, value) => properties.set(key, value), setProperties:values => Object.entries(values).forEach(([key, value]) => properties.set(key, value)) }) },
    CacheService:{ getScriptCache:() => ({ get:() => null, put() {}, remove() {} }) },
    SpreadsheetApp:{}, LockService:{ getScriptLock:() => ({ tryLock:() => true, releaseLock() {} }) }, ScriptApp:{}, ContentService:{}, MimeType:{},
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
    { business_name:"One Bar", contact_person:"Nate Anderson", email:"nate@example.com", city:"Oshkosh", account_id:"A1", relationship:"Prospect", miles:10 },
    { business_name:"Two Bar", contact_person:"na na", email:"two@example.com", city:"Oshkosh", account_id:"A2", relationship:"Prospect", miles:10 },
    { business_name:"Three Bar", contact_person:"Club Manager", email:"three@example.com", city:"Oshkosh", account_id:"A3", relationship:"Prospect", miles:10 },
  ];
  const report = call(context, `directoryQualityReportFromRows_(${JSON.stringify(rows)})`);
  assert.deepEqual(report.categories.placeholder_contact.rows.map(item => item.name), ["Three Bar", "Two Bar"]);
});

test("duplicates require matching name and city or phone, never a shared chain email alone", async () => {
  const { context } = await contextFor();
  const rows = [
    { business_name:"The Cozumel, LLC", contact_person:"Maria Smith", email:"chain@example.com", city:"Oshkosh", phone_number:"920-555-0101", account_id:"A1", relationship:"Prospect", miles:10 },
    { business_name:"Cozumel Inc.", contact_person:"Maria Smith", email:"other@example.com", city:"Oshkosh", phone_number:"920-555-0102", account_id:"A2", relationship:"Prospect", miles:10 },
    { business_name:"Anduzzi's North", contact_person:"Rae Jones", email:"chain@example.com", city:"Green Bay", phone_number:"920-555-0103", account_id:"A3", relationship:"Prospect", miles:10 },
    { business_name:"Anduzzi's South", contact_person:"Rae Jones", email:"chain@example.com", city:"Green Bay", phone_number:"920-555-0104", account_id:"A4", relationship:"Prospect", miles:10 },
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
  vm.runInContext("getOutreachSheet_ = () => __sheet; getOutreachCampaignSettings_ = () => ({}); appendAudit_ = () => {};", context);
  const result = call(context, "directoryQualityCheck_({ now:'2026-11-19T15:00:00-06:00' })");
  assert.equal(result.moved_bad_emails.length, 1);
  assert.equal(values[1][2], "");
  assert.match(values[1][5], /2026-11-19 - Bad email \(bounced\): bounce@example\.com/);
  assert.equal(values[2][2], "wrong@example.com", "Wrong contact is a staff decision and stays put");
  const reasons = call(context, "outreachSendEligibility_({ email:'bounce@example.com', notes:'2026-11-19 - Bad email (bounced): bounce@example.com', status:'Not contacted', outcome:'', next_email:'Initial', do_not_email:false, email_confidence:'confirmed', activity:[] }, { initial_sent_emails:new Set(), skip_legacy_pilot:true })");
  assert.ok(reasons.includes("Recipient email is recorded as a bounced address"));
});

test("weekly check fills blank automatic Miles from ZIP and keeps manual Miles untouched", async () => {
  const { context } = await contextFor();
  const values = [["Business Name", "Zip", "Miles", "Miles Source"],
    ["Automatic miles", "54945", "", ""],
    ["Manual miles", "54945", "", "manual"],
    ["Unknown ZIP", "99999", "", ""]];
  const sheet = {
    getLastRow:() => values.length, getLastColumn:() => values[0].length,
    getParent:() => ({ getId:() => "miles-test" }), getSheetId:() => 1,
    getRange(row, column, height = 1, width = 1) {
      return {
        getValues:() => Array.from({ length:height }, (_, i) => Array.from({ length:width }, (_, j) => values[row - 1 + i]?.[column - 1 + j] ?? "")),
        setValue:value => { values[row - 1][column - 1] = value; },
      };
    },
  };
  context.__sheet = sheet;
  vm.runInContext("getOutreachSheet_ = () => __sheet; getOutreachCampaignSettings_ = () => ({}); milesForZip_ = zip => zip === '54945' ? 42 : null;", context);
  const result = call(context, "directoryQualityCheck_({ now:'2026-11-19T15:00:00-06:00' })");
  assert.equal(values[1][2], 42);
  assert.equal(values[1][3], "zip");
  assert.equal(values[2][2], "", "manual source prevents an automatic overwrite");
  assert.equal(result.mileage.updated, 1);
  assert.deepEqual(result.mileage.unknown_zips, ["99999"]);
});

test("quality work is restricted to the service area, while distant customers remain included", async () => {
  const { context } = await contextFor();
  vm.runInContext("milesForZip_ = zip => zip === '54945' ? 42 : null;", context);
  const rows = [
    { business_name:"In area", email:"", contact_person:"Pat", relationship:"Prospect", miles:10 },
    { business_name:"At 61", email:"", contact_person:"Pat", relationship:"Prospect", miles:61 },
    { business_name:"Blank miles", email:"", contact_person:"Pat", relationship:"Prospect", miles:"", zip:"54945" },
    { business_name:"Lapsed customer", email:"", contact_person:"Pat", relationship:"Lapsed customer", miles:200 },
  ];
  const report = call(context, `directoryQualityReportFromRows_(${JSON.stringify(rows)}, { service_area_miles:60 })`);
  assert.deepEqual(report.categories.no_email.rows.map(item => item.name), ["In area", "Lapsed customer"]);
  assert.equal(report.outside_service_area.count, 2);
  assert.equal(report.categories.no_distance.count, 0, "a usable ZIP is filled automatically, not put on Karl's list");
});

test("customer-history relationships, including Win-back due, stay in Directory quality regardless of distance", async () => {
  const { context } = await contextFor();
  const report = call(context, `directoryQualityReportFromRows_([{ business_name:'Returning Bar', email:'', contact_person:'Pat', relationship:'Win-back due', miles:200 }], { service_area_miles:60 })`);
  assert.deepEqual(report.categories.no_email.rows.map(item => item.name), ["Returning Bar"]);
  assert.equal(report.outside_service_area.count, 0);
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

test("Not a buyer maps to Do not contact and is blocked by every Hub email gate", async () => {
  const { context } = await contextFor();
  vm.runInContext("outreachCrossSendCooldownReason_ = () => '';", context);
  assert.equal(call(context, "outreachStatusForOutcome_('Not a buyer')"), "Do not contact");
  assert.equal(call(context, "isDoNotContact_({ status:'Needs email', outcome:'Not a buyer', do_not_email:false })"), true);
  const reasons = call(context, "outreachSendEligibility_({ email:'buyer@example.com', notes:'', status:'Do not contact', outcome:'Not a buyer', next_email:'Initial', do_not_email:true, email_confidence:'confirmed', activity:[] }, { initial_sent_emails:new Set(), skip_legacy_pilot:true })");
  assert.ok(reasons.includes("Business is excluded from email"));
  assert.equal(call(context, "outreachServiceAreaMiles_({ 'Service area miles':42 })"), 42);
  assert.equal(call(context, "outreachServiceAreaMiles_({})"), 60);
});

test("DOR pages use subject, keep liquor-only records once, and reject a non-OK response", async () => {
  const { context } = await contextFor();
  const page = call(context, `dorPageRows_({ result:'Ok', count:'2', subject:[{ rn:1, AL:1 }, { rn:2, BL:1 }] })`);
  assert.equal(page.count, 2);
  const records = call(context, `dorLiquorRecords_([{ rn:1, AL:1 }, { rn:1, BL:1 }, { rn:2, AB:1 }, { rn:3, CW:1 }])`);
  assert.deepEqual(records.map(row => row.rn), [1], "a dual liquor license is one record and beer/wine-only records are excluded");
  assert.throws(() => vm.runInContext(`dorPageRows_({ result:'Error', count:'0', subject:[] })`, context), /did not return Ok/);
});

test("DOR preview uses the shared fill rules, plans one add for duplicate businesses, and never writes", async () => {
  const { context } = await contextFor();
  const directory = { getLastRow:() => 2, getLastColumn:() => 12 };
  context.__directory = directory;
  vm.runInContext(`
    getOutreachSs_ = () => ({ getSheetByName:() => null });
    milesForZip_ = zip => zip === '54945' ? 12 : 100;
    outreachServiceAreaMiles_ = () => 60;
    permanentId_ = () => 'ACC-new';
  `, context);
  const rows = [{ account_id:'A1', business_name:'Matched Bar', contact_person:'', email:'', address:'1 Main', city:'Oshkosh', zip:'54945', notes:'', relationship:'Prospect', status:'Needs email' }];
  const records = [
    { rn:'1', AL:1, businessName:'Matched Bar', agentName:'Jamie Smith', address:'1 Main', city:'Oshkosh', zip:'54945', lastUpdated:'2026-11-01' },
    { rn:'2', BL:1, businessName:'New Bar', agentName:'Rae Jones', address:'2 Main', city:'Oshkosh', zip:'54945', county:'Winnebago', lastUpdated:'2026-11-02' },
    { rn:'3', AL:1, businessName:'New Bar', agentName:'Other Agent', address:'2 Main', city:'Oshkosh', zip:'54945', lastUpdated:'2026-11-03' },
    { rn:'4', AL:1, businessName:'Far Bar', agentName:'Far Agent', address:'4 Main', city:'Far', zip:'99999', lastUpdated:'2026-11-04' },
  ];
  const result = call(context, `processDorLiquorLicenses_({ dryRun:true, records:${JSON.stringify(records)}, identity:accountIdentityFromRows_(${JSON.stringify(rows)}), directory:__directory, now:new Date('2026-11-20T12:00:00Z') })`);
  assert.equal(result.filled, 1, 'blank contact is a real would-fill');
  assert.equal(result.added, 1, 'same business under two RNs is planned once');
  assert.equal(result.outside, 1);
  assert.deepEqual(result.examples.would_add.map(item => item.business), ['New Bar']);
  assert.deepEqual(result.examples.would_fill.map(item => item.business), ['Matched Bar']);
  assert.equal(rows[0].contact_person, '', 'preview does not mutate its input row');
});

test("DOR time budget leaves the weekly guard open so an editor rerun can resume", async () => {
  const { context, properties } = await contextFor();
  vm.runInContext("directoryQualityCheck_ = () => ({ complete:false, dor:{ stopped:true } });", context);
  const result = call(context, "maybeRunDirectoryQualityCheck_(new Date('2026-11-19T15:00:00-06:00'))");
  assert.equal(result.complete, false);
  assert.equal(properties.get('DIRECTORY_QUALITY_LAST_RUN'), undefined);
  assert.equal(call(context, "typeof runDirectoryQualityCheckNow"), 'function');
});
