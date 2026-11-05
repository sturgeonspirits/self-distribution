// Campaign sequences, Part B Phase 2 (Inventory API .55-APP): buildSequencePlan_ groups step campaigns into
// sequences and works out where each business is from what was actually sent.
// Run: node --test tests/sequences.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const DAY = 86400000;

async function backend() {
  const code = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const context = {
    console: { log() {}, warn() {}, error() {} },
    Utilities: { formatDate: date => new Date(date).toISOString().slice(5, 10) },
    PropertiesService: {}, Session: {}, SpreadsheetApp: {}, CacheService: {}, LockService: {}, ContentService: {}, MimeType: {}, ScriptApp: {}, UrlFetchApp: {},
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

const NOW = new Date("2026-11-05T18:00:00Z");
const day = n => new Date(NOW.getTime() - n * DAY).toISOString();
const campaign = (id, stage, extra = {}) => ({
  campaign_id:id, name:id, audience:"", status:"Complete", created_at:day(40), sent_count:1, recipient_count:1,
  criteria:stage === null ? null : Object.assign({ campaign_type:"sales_outreach", stage:stage }, extra.criteria || {}),
  schedule_status:"", sequence_id:"", step:0, ...extra.row,
});
const recipient = (campaignId, account, status, sentDaysAgo) => ({
  campaign_id:campaignId, account_id:account, business_name:`Biz ${account}`, recipient_email:`${account.toLowerCase()}@example.test`,
  status:status, sent_at:sentDaysAgo === undefined ? "" : day(sentDaysAgo),
});
const sent = (account, stage, daysAgo) => ({ timestamp:day(daysAgo), stage:stage, result:"APP SENT", account_id:account, intended_recipient:`${account.toLowerCase()}@example.test`, delivered_to:"" });
const dir = (account, status = "Sent", outcome = "", row = 2) => ({ source_row:row, account_id:account, business:`Biz ${account}`, email:`${account.toLowerCase()}@example.test`, status:status, outcome:outcome, do_not_email:false, sequence_id:"" });

function build(context, data, gap = 7) {
  context.__data = Object.assign({ campaigns:[], recipients:[], activity:[], directory:[], sequences:[] }, data);
  return JSON.parse(JSON.stringify(vm.runInContext(`buildSequencePlan_(__data, { now:new Date("${NOW.toISOString()}"), gap_days:${gap} })`, context)));
}

test("follow-up campaigns join their source's sequence, and each business's step comes from the Activity Log", async () => {
  const context = await backend();
  const plan = build(context, {
    campaigns:[
      campaign("CMP-A", null, { row:{ audience:"Initial prospects", created_at:day(40) } }), // oldest style: no criteria
      campaign("CMP-B", "Follow-up 1", { criteria:{ source_campaign_id:"CMP-A" } }),
      campaign("CMP-C", "Follow-up 2", { criteria:{ source_campaign_id:"CMP-B" }, row:{ status:"Approved" } }),
      campaign("CMP-N", "Cocktail list", { criteria:{ campaign_type:"cocktail_list" } }),
    ],
    recipients:[
      recipient("CMP-A", "A1", "Sent", 30), recipient("CMP-A", "A2", "Sent", 30), recipient("CMP-A", "A3", "Sent", 30), recipient("CMP-A", "A4", "Excluded"),
      recipient("CMP-B", "A1", "Sent", 20), recipient("CMP-B", "A2", "Sent", 20),
      recipient("CMP-C", "A1", "Sent", 1), recipient("CMP-C", "A2", "Ready to send"),
    ],
    activity:[sent("A1", "Initial", 30), sent("A2", "Initial", 30), sent("A3", "Initial", 30), sent("A1", "Follow-up 1", 20), sent("A2", "Follow-up 1", 20), sent("A1", "Follow-up 2", 1),
      { timestamp:day(2), stage:"Follow-up 2", result:"APP TEST SENT", account_id:"A3", intended_recipient:"" }],
    directory:[dir("A1", "Nurture", "", 2), dir("A2", "Follow-up sent", "", 3), dir("A3", "Sent", "", 4)],
  });
  assert.equal(plan.sequences.length, 1);
  const sequence = plan.sequences[0];
  assert.equal(sequence.sequence_id, "SEQ-A");
  assert.deepEqual(sequence.steps.map(step => step.campaigns.map(item => item.campaign_id)), [["CMP-A"], ["CMP-B"], ["CMP-C"]]);
  assert.equal(sequence.status, "Sending");
  const by = Object.fromEntries(sequence.members.map(m => [m.account_id, m]));
  assert.equal(by.A1.state, "finished", "the last step's send moves it to Nurture; that is finished, not stopped");
  assert.equal(by.A2.state, "sending");
  assert.equal(by.A3.state, "active");
  assert.equal(by.A3.next_step, 2, "a test send never counts");
  assert.equal(by.A3.due, true);
  assert.equal(by.A4, undefined, "excluded recipients are not members");
  assert.deepEqual(plan.singles.map(item => item.campaign_id), ["CMP-N"]);
});

test("a never-sent campaign fully covered by another campaign of the same step is proposed for deletion", async () => {
  const context = await backend();
  const plan = build(context, {
    campaigns:[
      campaign("CMP-I", "Initial"),
      campaign("CMP-F", "Follow-up 1", { criteria:{ source_campaign_id:"CMP-I" } }),
      campaign("CMP-DUP", "Follow-up 1", { criteria:{ source_campaign_id:"CMP-I" }, row:{ status:"Approved", sent_count:0 } }),
    ],
    recipients:[recipient("CMP-I", "B1", "Sent", 30), recipient("CMP-I", "B2", "Sent", 30),
      recipient("CMP-F", "B1", "Sent", 20), recipient("CMP-F", "B2", "Sent", 20), recipient("CMP-DUP", "B1", "Ready to send")],
    activity:[sent("B1", "Initial", 30), sent("B2", "Initial", 30), sent("B1", "Follow-up 1", 20), sent("B2", "Follow-up 1", 20)],
    directory:[dir("B1", "Follow-up sent", "", 2), dir("B2", "Follow-up sent", "", 3)],
  });
  assert.deepEqual(plan.deletions.map(item => item.campaign_id), ["CMP-DUP"]);
  const step2 = plan.sequences[0].steps[1];
  assert.deepEqual(step2.campaigns.map(item => item.campaign_id), ["CMP-F"]);
  assert.equal(plan.sequences[0].members.find(m => m.account_id === "B1").state, "active", "the duplicate's queued send does not count");
  assert.equal(plan.sequences[0].status, "Next step due");
});

test("a business belongs to the sequence that sent its Initial email, even if another sequence's follow-up included it", async () => {
  const context = await backend();
  const plan = build(context, {
    campaigns:[
      campaign("CMP-S1", "Initial", { row:{ created_at:day(45) } }),
      campaign("CMP-S2", "Initial", { row:{ created_at:day(30) } }),
      campaign("CMP-S2F", "Follow-up 1", { criteria:{ source_campaign_id:"CMP-S2" } }),
    ],
    recipients:[recipient("CMP-S1", "C1", "Sent", 44), recipient("CMP-S2", "C2", "Sent", 30),
      recipient("CMP-S2F", "C1", "Sent", 10), recipient("CMP-S2F", "C2", "Sent", 10)],
    activity:[sent("C1", "Initial", 44), sent("C2", "Initial", 30), sent("C1", "Follow-up 1", 10), sent("C2", "Follow-up 1", 10)],
    directory:[dir("C1", "Follow-up sent", "", 2), dir("C2", "Follow-up sent", "", 3)],
  });
  const members = id => plan.sequences.find(s => s.sequence_id === id).members.map(m => m.account_id);
  assert.deepEqual(members("SEQ-S1"), ["C1"]);
  assert.deepEqual(members("SEQ-S2"), ["C2"]);
  assert.equal(plan.conflicts.length, 0);
  const c1 = plan.sequences.find(s => s.sequence_id === "SEQ-S1").members[0];
  assert.equal(c1.next_step, 3, "its Follow-up 1 from the other sequence's campaign still counts");
});

test("outcomes and blocking statuses stop a business; the gap decides when the next step is due", async () => {
  const context = await backend();
  const plan = build(context, {
    campaigns:[campaign("CMP-G", "Initial")],
    recipients:["D1", "D2", "D3", "D4", "D5"].map(id => recipient("CMP-G", id, "Sent", id === "D5" ? 3 : 10)),
    activity:["D1", "D2", "D3", "D4"].map(id => sent(id, "Initial", 10)).concat([sent("D5", "Initial", 3)]),
    directory:[dir("D1", "Sent", "Schedule tasting", 2), dir("D2", "Closed", "Closed", 3), dir("D3", "Needs email", "Bad address", 4), dir("D4", "Sent", "", 5), dir("D5", "Sent", "", 6)],
  });
  const by = Object.fromEntries(plan.sequences[0].members.map(m => [m.account_id, m]));
  assert.equal(by.D1.stop_reason, "Schedule tasting");
  assert.equal(by.D2.stop_reason, "Closed");
  assert.equal(by.D3.stop_reason, "Bad address");
  assert.equal(by.D4.state, "active");
  assert.equal(by.D4.due, true, "10 days after Initial with a 7-day gap");
  assert.equal(by.D5.due, false, "3 days after Initial is not due yet");
  assert.equal(plan.sequences[0].next_due_at.slice(0, 10), new Date(NOW.getTime() + 4 * DAY).toISOString().slice(0, 10));
  assert.deepEqual(plan.sequences[0].due_by_step, { 2:1 });
});

test("stored sequences keep their name and mark pre-sequence campaigns as separate", async () => {
  const context = await backend();
  const plan = build(context, {
    campaigns:[campaign("CMP-K", "Initial", { row:{ sequence_id:"SEQ-K" } }), campaign("CMP-K2", "Follow-up 1", { criteria:{ source_campaign_id:"CMP-K" }, row:{ sequence_id:"SEQ-K", status:"Review", sent_count:0 } })],
    recipients:[recipient("CMP-K", "E1", "Sent", 9), recipient("CMP-K2", "E1", "Ready for review")],
    activity:[sent("E1", "Initial", 9)],
    directory:[dir("E1")],
    sequences:[{ sequence_id:"SEQ-K", name:"Neenah bars", gap_days:10, migrated_from:"CMP-K" }],
  });
  const sequence = plan.sequences[0];
  assert.equal(sequence.name, "Neenah bars");
  assert.equal(sequence.gap_days, 10);
  assert.equal(sequence.status, "Needs review");
  assert.equal(sequence.steps[0].campaigns[0].separate_campaign, true);
  assert.equal(sequence.steps[1].campaigns[0].separate_campaign, false);
});

test("the read action and the sequence structure are wired into the API, repair and proxy", async () => {
  const code = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const proxy = await readFile(new URL("netlify/functions/inventory.js", root), "utf8");
  assert.match(code, /case "outreachSequences": res = apiGetOutreachSequences_\(/);
  assert.match(code, /const READ_ACTIONS = new Set\(\[[^\]]*"outreachSequences"/);
  assert.match(code, /identity\.sequences = ensureSequenceStructure_\(\);/);
  assert.match(proxy, /const GET_READ_ACTIONS = new Set\(\[[^\]]*"outreachSequences"/);
  assert.match(proxy, /\["outreachSequences", "outreach"\]/);
  // The migration is editor-only: never reachable through the web app.
  assert.doesNotMatch(code, /case "migrateCampaignsToSequences"/);
  assert.doesNotMatch(proxy, /migrateCampaignsToSequences/);
});

// ---------- Phase 4: daily step drafts (Inventory API .55-APP) ----------

test("step drafts: only migrated sequences, never over a waiting draft or a step still sending; later ones say (more)", async () => {
  const context = await backend();
  context.__plan = {
    sequences:[
      { sequence_id:"SEQ-1", name:"Oshkosh", stored:true, status:"Next step due", due_by_step:{ 3:84, 2:12 },
        steps:[{ campaigns:[{ name:"Init", status:"Complete", sent_count:107 }] }, { campaigns:[{ name:"FU1", status:"Complete", sent_count:89 }] }, { campaigns:[] }] },
      { sequence_id:"SEQ-2", name:"Fond du Lac", stored:true, status:"Needs review", due_by_step:{ 2:44 },
        steps:[{ campaigns:[] }, { campaigns:[{ name:"Fond du Lac — Follow-up 1", status:"Review", sent_count:0 }] }, { campaigns:[] }] },
      { sequence_id:"SEQ-3", name:"Appleton", stored:true, status:"Sending", due_by_step:{ 3:2 },
        steps:[{ campaigns:[] }, { campaigns:[] }, { campaigns:[{ name:"FU2", status:"Approved", ready_to_send:51, sent_count:3 }] }] },
      { sequence_id:"SEQ-4", name:"Not migrated", stored:false, status:"Next step due", due_by_step:{ 2:5 }, steps:[{ campaigns:[] }, { campaigns:[] }, { campaigns:[] }] },
    ],
  };
  const actions = JSON.parse(JSON.stringify(vm.runInContext(`sequenceStepDraftActions_(__plan)`, context)));
  assert.deepEqual(actions.map(a => [a.sequence_id, a.stage, a.action]), [
    ["SEQ-1", "Follow-up 1", "create"], ["SEQ-1", "Follow-up 2", "create"],
    ["SEQ-2", "Follow-up 1", "skip"], ["SEQ-3", "Follow-up 2", "skip"],
  ]);
  assert.equal(actions[0].campaign_name, "Oshkosh — Follow-up 1 (more)", "Follow-up 1 already went to most of them");
  assert.equal(actions[1].campaign_name, "Oshkosh — Follow-up 2");
  assert.match(actions[2].reason, /already waiting for review/);
  assert.match(actions[3].reason, /still sending/);
});

test("the step check runs once a day from the hourly sync, not before 6 am", async () => {
  const context = await backend();
  const properties = new Map();
  let runs = 0;
  context.PropertiesService = { getScriptProperties: () => ({ getProperty: key => properties.get(key) ?? null, setProperty: (key, value) => properties.set(key, String(value)) }) };
  context.Session = { getScriptTimeZone: () => "UTC" };
  context.Utilities = { formatDate: (date, tz, fmt) => (fmt === "H" ? String(new Date(date).getUTCHours()) : new Date(date).toISOString().slice(0, 10)) };
  context.__count = () => { runs += 1; return []; };
  vm.runInContext(`runSequenceStepCheck = () => __count();`, context);
  assert.equal(vm.runInContext(`maybeRunSequenceStepCheck_(new Date("2026-11-06T05:10:00Z")).ran`, context), false);
  assert.equal(vm.runInContext(`maybeRunSequenceStepCheck_(new Date("2026-11-06T06:10:00Z")).ran`, context), true);
  assert.equal(vm.runInContext(`maybeRunSequenceStepCheck_(new Date("2026-11-06T09:10:00Z")).ran`, context), false);
  assert.equal(vm.runInContext(`maybeRunSequenceStepCheck_(new Date("2026-11-07T06:10:00Z")).ran`, context), true);
  assert.equal(runs, 2);
});

test("a sequence step's criteria, label and audience: its Directory members at that stage only", async () => {
  const context = await backend();
  vm.runInContext(`
    sequenceStoredRow_ = id => (id === "SEQ-1" ? { sequence_id:"SEQ-1", name:"Oshkosh" } : null);
    campaignCenterForCriteria_ = () => ({ type:"distillery", label:"Distillery (54902)", zip:"54902", latitude:43.99, longitude:-88.52 });`, context);
  const criteria = JSON.parse(JSON.stringify(vm.runInContext(`campaignCriteriaFromRequest_({ criteria:{ audience_mode:"sequence", sequence_id:"SEQ-1", stage:"Follow-up 2" } })`, context)));
  assert.equal(criteria.audience_mode, "sequence");
  assert.equal(criteria.sequence_name, "Oshkosh");
  assert.equal(criteria.stage, "Follow-up 2");
  context.__criteria = criteria;
  assert.equal(vm.runInContext(`campaignAudienceLabel_(__criteria)`, context), "Follow-up 2 due · sequence Oshkosh");
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext(`campaignCriteriaFailures_({ craft_spirit_fit:1 }, __criteria)`, context))), []);
  assert.throws(() => vm.runInContext(`campaignCriteriaFromRequest_({ criteria:{ audience_mode:"sequence", sequence_id:"SEQ-9", stage:"Follow-up 1" } })`, context), /not found/);
  assert.throws(() => vm.runInContext(`campaignCriteriaFromRequest_({ criteria:{ audience_mode:"sequence", sequence_id:"SEQ-1", stage:"Nurture check-in" } })`, context), /sequence step must be/);

  const row = (name, sequenceId, nextEmail) => ({ business_name:name, email:`${name.toLowerCase()}@example.test`, account_id:`ACC-${name}`, status:"Follow-up sent",
    next_email:nextEmail, relationship:"Prospect", sequence_id:sequenceId });
  context.__rows = [row("A", "SEQ-1", "Follow-up 2"), row("B", "SEQ-1", "Follow-up 1"), row("C", "SEQ-2", "Follow-up 2"), row("D", "", "Follow-up 2")];
  vm.runInContext(`
    getOutreachSheet_ = () => ({});
    getAllRowsAsObjects_ = () => __rows;
    campaignInitialSentEmailSet_ = () => new Set();
    outreachActivityMap_ = () => new Map();
    outreachSendEligibility_ = () => [];
    campaignDistanceForCriteria_ = () => 0;
    outreachPriorityScore_ = () => 0;`, context);
  const selection = JSON.parse(JSON.stringify(vm.runInContext(`(() => { const s = campaignDirectoryStageSelection_(__criteria); return { names:s.records.map(r => r.business), left:s.left_out, size:s.source_group_size }; })()`, context)));
  assert.deepEqual(selection.names, ["A"]);
  assert.equal(selection.size, 2);
  assert.deepEqual(selection.left, { "Due for Follow-up 1 instead":1 });
});

test("drafted steps are tied to their sequence and get a Review and approve task; sequence members get no separate Send reminder", async () => {
  const code = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const create = code.slice(code.indexOf("function apiCreateOutreachCampaign_"), code.indexOf("function apiApproveOutreachCampaign_"));
  assert.match(create, /if \(criteria\.audience_mode === "sequence"\) \{ setCampaign\("sequence_id", criteria\.sequence_id\); setCampaign\("step", sequenceStepNumber_\(criteria\.stage\)\); \}/);
  assert.match(code, /if \(campaign\.status === "Review" && campaign\.sequence_id\) \{\s*\/\/[^\n]*\n\s*state = "review";\s*title = `Review and approve '\$\{campaign\.name\}'/);
  assert.match(code, /if \(String\(row\.sequence_id \|\| ""\)\.trim\(\)\) return;\s*const due = status === "reactivation due"/);
  assert.match(code, /function runTaskManagerSync\(\) \{\s*\/\/[^\n]*\n\s*try \{ maybeRunSequenceStepCheck_\(new Date\(\)\); \}/);
  // Drafting never approves or sends.
  const check = code.slice(code.indexOf("function runSequenceStepCheck("), code.indexOf("function maybeRunSequenceStepCheck_"));
  assert.doesNotMatch(check, /apiApproveOutreachCampaign_|apiSendOutreachCampaignBatch_|apiScheduleOutreachCampaign_/);
});
