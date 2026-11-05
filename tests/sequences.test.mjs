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
