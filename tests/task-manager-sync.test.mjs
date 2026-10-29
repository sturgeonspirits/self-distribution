// Behavioral tests for the Hub → weekly task manager sync (syncTaskManager_), run against in-memory sheets.
// Run: node --test tests/task-manager-sync.test.mjs
process.env.TZ = "America/Chicago";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const HUB_ID = "1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo";
const TASKS_ID = "1NQKvTSWvpTZ3uRsYWMUPAdOa_bHvsp_VMpc7EX1c_tI";
// Thursday Oct 29, 2026, 3 PM Central. Its week starts Monday Oct 26.
const NOW = "2026-10-29T15:00:00-05:00";

let nextSheetId = 1;
class FakeSheet {
  constructor(workbookId, name, rows) {
    this.workbookId = workbookId; this.name = name; this.rows = rows; this.id = nextSheetId++; this.writes = 0;
  }
  getName() { return this.name; }
  getParent() { return { getId: () => this.workbookId }; }
  getSheetId() { return this.id; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(0, ...this.rows.map(row => row.length)); }
  getRange(row, column, rows = 1, columns = 1) {
    const sheet = this;
    const read = () => Array.from({ length: rows }, (_, i) => Array.from({ length: columns }, (_, j) => sheet.rows[row - 1 + i]?.[column - 1 + j] ?? ""));
    return {
      getValues: read,
      getDisplayValues: () => read().map(r => r.map(v => v === true ? "TRUE" : v === false ? "FALSE" : String(v))),
      getValue() { return read()[0][0]; },
      setNumberFormat() { return this; },
      setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; },
      setValues(values) {
        sheet.writes += 1;
        values.forEach((valueRow, i) => {
          while (sheet.rows.length < row + i) sheet.rows.push([]);
          valueRow.forEach((value, j) => { sheet.rows[row - 1 + i][column - 1 + j] = value; });
        });
      },
      setValue(value) { this.setValues([[value]]); },
    };
  }
}

const TASK_HEADERS = ["id", "title", "category", "description", "dayOfWeek", "completed", "weekId", "repeatsWeekly", "repeatPattern", "originTaskId", "deleted", "reminderDate", "assignee", "priority", "shiftHours", "updatedAt"];
const DIRECTORY_HEADERS = ["Business Name", "Contact Person", "Email", "Phone Number", "City", "State", "Next Email", "Status", "Next Follow-Up", "Outcome", "Notes", "Do Not Email", "Relationship", "Account ID"];
const REPLY_HEADERS = ["Reply ID", "Received At", "From", "From Name", "Subject", "Business", "Category", "Summary", "Priority", "Respond By", "Status"];
const CAMPAIGN_HEADERS = ["Campaign ID", "Campaign Name", "Status", "Recipient Count", "Created At", "Approved At", "Sent Count", "Schedule Status", "Schedule Detail"];
const RECIPIENT_HEADERS = ["Campaign ID", "Source Row", "Account ID", "Business Name", "Body Text", "Status", "Sent At"];
const APPLICATION_HEADERS = ["Application ID", "Submitted At", "Workflow Status", "Legal Business Name", "Business Name", "Business Type", "Primary Contact Name", "Primary Email", "Primary Phone", "Delivery City"];
const ORDER_HEADERS = ["Request ID", "Submitted At", "Workflow Status", "Business Name", "Contact Name", "Email", "Phone", "Requested Delivery Date", "Requested Cases", "Requested Bottles"];

function fixture() {
  const directory = [DIRECTORY_HEADERS,
    // Personal follow-up, overdue: goes on today.
    ["Cinders Charcoal Grill", "Crystal", "crystal@example.com", "920-555-0101", "Oshkosh", "WI", "Follow-up 1", "Interested", "10/24/2026 12:00 PM", "Visit in person", "Met at 920fest\n2026-10-07 - Hi Karl,\nWe would love samples.\n2026-10-21 - Visited with\nsamples.", "", "Prospect", "ACC-CINDERS"],
    // Personal follow-up later this week (Saturday): goes on day 6.
    ["Gabe's Kitchen", "Steve", "steve@example.com", "", "Oshkosh", "WI", "Follow-up 1", "Follow-up due", "10/31/2026 12:00 PM", "Follow up later", "", "", "Prospect", "ACC-GABES"],
    // Personal follow-up next week: not yet.
    ["Mr Brews", "Traci", "traci@example.com", "", "Oshkosh", "WI", "Follow-up 1", "Interested", "11/4/2026 12:00 PM", "Interested", "", "", "Prospect", "ACC-BREWS"],
    // Campaign follow-ups due from the Appleton campaign.
    ["Bar A", "", "a@example.com", "", "Appleton", "WI", "Follow-up 2", "Follow-up sent", "10/13/2026 2:00 PM", "", "", "", "Prospect", "ACC-A"],
    ["Bar B", "", "b@example.com", "", "Kaukauna", "WI", "Follow-up 2", "Follow-up sent", "10/14/2026 2:00 PM", "", "", "", "Prospect", "ACC-B"],
    // Due, but already sitting in a paused follow-up campaign.
    ["Bar C", "", "c@example.com", "", "Oshkosh", "WI", "Follow-up 1", "Sent", "10/13/2026 2:00 PM", "", "", "", "Prospect", "ACC-C"],
    // Sequence finished.
    ["Bar D", "", "d@example.com", "", "Oshkosh", "WI", "Complete", "Follow-up sent", "10/20/2026 2:00 PM", "", "", "", "Prospect", "ACC-D"],
    // Do not contact.
    ["Bar E", "", "e@example.com", "", "Oshkosh", "WI", "Follow-up 1", "Interested", "10/20/2026 2:00 PM", "", "", "TRUE", "Prospect", "ACC-E"],
    // Bad address with a stale date: nothing to do here.
    ["Bar F", "", "f@example.com", "", "Oshkosh", "WI", "Follow-up 1", "Needs email", "10/13/2026 2:00 PM", "Bad address", "", "", "Prospect", "ACC-F"],
  ];
  const replies = [REPLY_HEADERS,
    ["RPL-OPEN", "10/26/2026 0:43:50", "ella@vendor.example", "Ella", "Re: bottles", "", "Needs reading", "", "Respond soon", "10/27/2026", "New"],
    ["RPL-BOUNCE", "10/20/2026 15:14:43", "mancinos@example.com", "postmaster", "Undeliverable", "Mancino's Pizza", "Bounce", "Mailbox full.", "Review bounce", "10/21/2026", "New"],
    ["RPL-DONE", "10/22/2026 9:44:10", "hello@rowe.example", "Jodi", "Re: samples", "Rowe Lounge", "Interested", "Wants samples", "Respond today", "10/22/2026", "Handled"],
  ];
  const campaigns = [CAMPAIGN_HEADERS,
    ["CMP-APP-FU1", "Appleton Follow-up 1", "Complete", 2, "10/6/2026", "10/6/2026", 2, "", ""],
    ["CMP-OSH2", "Oshkosh 2", "Approved", 89, "10/17/2026", "10/17/2026", 20, "Paused", "Paused after WEST END PIZZA."],
    ["CMP-FLAWED", "Flawed local", "Approved", 31, "10/17/2026", "10/17/2026", 0, "", ""],
    ["CMP-GONE", "Deleted one", "Deleted", 5, "10/17/2026", "", 0, "", ""],
  ];
  const recipients = [RECIPIENT_HEADERS,
    ["CMP-APP-FU1", "4", "ACC-A", "Bar A", "long body", "Sent", "10/6/2026"],
    ["CMP-APP-FU1", "5", "ACC-B", "Bar B", "long body", "Sent", 46301.5],
    ["CMP-OSH2", "6", "ACC-C", "Bar C", "long body", "Ready to send", ""],
  ];
  const applications = [APPLICATION_HEADERS,
    ["APP-NEW", "10/28/2026 9:00:00", "New", "New Bar LLC", "New Bar", "Restaurant or bar", "Pat", "pat@example.com", "920-555-0199", "Neenah"],
    ["APP-OLD", "10/12/2026 9:00:00", "Account active", "Old Bar LLC", "Old Bar", "Restaurant or bar", "", "", "", ""],
  ];
  const orders = [ORDER_HEADERS,
    ["ORD-1", "10/29/2026 8:00:00", "Confirmed", "The Wild Boar", "Travis", "travis@example.com", "", "11/3/2026", 2, 0],
  ];
  const hub = {
    "Distribution Directory and Leads": new FakeSheet(HUB_ID, "Distribution Directory and Leads", directory),
    "Inbound Replies": new FakeSheet(HUB_ID, "Inbound Replies", replies),
    "Outreach Campaigns": new FakeSheet(HUB_ID, "Outreach Campaigns", campaigns),
    "Outreach Campaign Recipients": new FakeSheet(HUB_ID, "Outreach Campaign Recipients", recipients),
    "Customer Applications": new FakeSheet(HUB_ID, "Customer Applications", applications),
    "Online Order Requests": new FakeSheet(HUB_ID, "Online Order Requests", orders),
  };
  const tasks = new FakeSheet(TASKS_ID, "Tasks", [TASK_HEADERS,
    ["sec-1", "Email: someone", "email", "From the secretary", "4", "FALSE", "2026-10-26", "FALSE", "none", "", "FALSE", "", "", "high", "", "1793000000000"],
  ]);
  return { hub, tasks };
}

async function harness(state = fixture()) {
  const code = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const properties = new Map();
  const cache = new Map();
  const workbook = (id, sheets) => ({ getId: () => id, getSheetByName: name => sheets[name] || null, getSheets: () => Object.values(sheets) });
  const context = {
    console: { log() {}, error() {} },
    Utilities: {
      formatDate(date, timeZone, pattern) {
        const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
          .formatToParts(date).map(part => [part.type, part.value]));
        if (pattern === "yyyy-MM-dd") return `${parts.year}-${parts.month}-${parts.day}`;
        if (pattern === "u") return String({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[parts.weekday]);
        if (pattern === "MMM d") return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(date);
        throw new Error(`Unexpected pattern ${pattern}`);
      },
    },
    Session: { getScriptTimeZone: () => "America/Chicago" },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) ?? null, setProperty: (key, value) => properties.set(key, value) }) },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key) ?? null, put: (key, value) => cache.set(key, value), remove: key => cache.delete(key) }) },
    SpreadsheetApp: { openById: id => id === TASKS_ID ? workbook(TASKS_ID, { Tasks: state.tasks }) : workbook(HUB_ID, state.hub) },
    LockService: {}, ScriptApp: {}, ContentService: {}, MimeType: {},
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  vm.runInContext("appendAudit_ = () => {};", context);
  const sync = (options = {}) => JSON.parse(JSON.stringify(vm.runInContext(`syncTaskManager_(${JSON.stringify(Object.assign({ now: NOW }, options))})`, context)));
  const rows = () => state.tasks.rows.slice(1).map(row => Object.fromEntries(TASK_HEADERS.map((name, i) => [name, row[i]])));
  const byId = id => rows().find(row => row.id === id);
  return { state, sync, rows, byId, properties };
}

test("first run writes one task per open Hub item, on the right day", async () => {
  const { sync, rows, byId } = await harness();
  const result = sync();
  const ids = result.creates.map(item => item.id).sort();
  assert.deepEqual(ids, [
    "hub-app-APP-NEW",
    "hub-cmp-CMP-APP-FU1-follow-up-2",
    "hub-cmprun-CMP-FLAWED-unsent",
    "hub-cmprun-CMP-OSH2-paused",
    "hub-fu-ACC-CINDERS-2026-10-24",
    "hub-fu-ACC-GABES-2026-10-31",
    "hub-order-ORD-1-invoice",
    "hub-reply-RPL-BOUNCE",
    "hub-reply-RPL-OPEN",
  ]);
  assert.equal(result.closed, 0);
  assert.equal(rows().length, 10, "the secretary's row is kept and nine are added");

  const cinders = byId("hub-fu-ACC-CINDERS-2026-10-24");
  assert.equal(cinders.weekId, "2026-10-26");
  assert.equal(cinders.dayOfWeek, "4", "overdue follow-up lands on today (Thursday)");
  assert.equal(cinders.category, "sales");
  assert.equal(cinders.completed, "FALSE");
  assert.equal(cinders.priority, "high");
  assert.match(cinders.title, /Follow up with Cinders Charcoal Grill \(Visit in person\)/);
  assert.match(cinders.description, /Last note: 2026-10-21 - Visited with samples\.\n/, "the newest dated note entry, joined onto one line");
  assert.match(cinders.description, /Contact: Crystal · crystal@example.com · 920-555-0101/);
  assert.match(cinders.description, /\nHub key: hub-fu-ACC-CINDERS-2026-10-24$/);

  assert.equal(byId("hub-fu-ACC-GABES-2026-10-31").dayOfWeek, "6", "a follow-up later this week keeps its own day");
  assert.equal(byId("hub-reply-RPL-OPEN").dayOfWeek, "4");
  assert.match(byId("hub-reply-RPL-BOUNCE").title, /check the bounce for Mancino's Pizza/i);

  const group = byId("hub-cmp-CMP-APP-FU1-follow-up-2");
  assert.equal(group.title, "Send Follow-up 2 to 'Appleton Follow-up 1' (2 businesses)", "Bar C is in the paused campaign, Bar D is complete");
  assert.match(group.description, /Where: (Appleton 1, Kaukauna 1|Kaukauna 1, Appleton 1)\./);
  assert.match(group.description, /Due since Oct 13\./);
  assert.match(byId("hub-cmprun-CMP-OSH2-paused").title, /resume paused campaign 'Oshkosh 2' \(69 left\)/);
  assert.match(byId("hub-cmprun-CMP-FLAWED-unsent").title, /Send or delete campaign 'Flawed local' \(31 not sent\)/);
  assert.match(byId("hub-order-ORD-1-invoice").title, /The Wild Boar: invoice in Badger/);
  assert.equal(byId("hub-fu-ACC-BREWS-2026-11-04"), undefined, "next week's follow-up waits for its week");
});

test("a second run with nothing changed writes nothing", async () => {
  const { state, sync } = await harness();
  sync();
  const writes = state.tasks.writes;
  const result = sync();
  assert.deepEqual([result.created, result.updated, result.closed], [0, 0, 0]);
  assert.equal(state.tasks.writes, writes);
});

test("a dry run reports without writing", async () => {
  const { state, sync, properties } = await harness();
  const result = sync({ dryRun: true });
  assert.equal(result.created, 9);
  assert.equal(state.tasks.rows.length, 2);
  assert.equal(properties.size, 0);
});

test("tasks close when the Hub item clears; a task reopened by hand stays open", async () => {
  const { state, sync, byId } = await harness();
  sync();
  state.hub["Inbound Replies"].rows[1][10] = "Handled";
  // Outcome logged on Cinders with a new date next week.
  state.hub["Distribution Directory and Leads"].rows[1][8] = "11/5/2026 12:00 PM";
  const result = sync({ now: "2026-10-29T16:00:00-05:00" });
  assert.equal(result.closed, 2);
  const reply = byId("hub-reply-RPL-OPEN");
  assert.equal(reply.completed, "TRUE");
  assert.match(reply.description, /Closed by the Hub Oct 29: cleared in the Hub\.$/);
  assert.equal(byId("hub-fu-ACC-CINDERS-2026-10-24").completed, "TRUE");
  assert.equal(byId("hub-fu-ACC-CINDERS-2026-11-05"), undefined, "the new date is next week, so no task yet");

  // Karl reopens the reply task by hand.
  const row = state.tasks.rows.find(r => r[0] === "hub-reply-RPL-OPEN");
  row[5] = "FALSE";
  const again = sync({ now: "2026-10-29T17:00:00-05:00" });
  assert.equal(again.closed, 0);
  assert.equal(byId("hub-reply-RPL-OPEN").completed, "FALSE");
});

test("a carried-over copy counts as the task, and both copies close", async () => {
  const { state, sync, rows } = await harness();
  sync();
  // The task manager's Transfer makes a new id and keeps the original as originTaskId.
  const original = state.tasks.rows.find(r => r[0] === "hub-reply-RPL-BOUNCE");
  const copy = original.slice();
  copy[0] = "task-abc"; copy[6] = "2026-11-02"; copy[9] = "hub-reply-RPL-BOUNCE";
  state.tasks.rows.push(copy);
  assert.equal(sync().created, 0);
  state.hub["Inbound Replies"].rows[2][10] = "Handled";
  const result = sync();
  assert.equal(result.closed, 2);
  assert.ok(rows().filter(r => r.originTaskId === "hub-reply-RPL-BOUNCE" || r.id === "hub-reply-RPL-BOUNCE").every(r => r.completed === "TRUE"));
});

test("a hand-made task with a Hub key line is adopted: not duplicated, not retitled, closed later", async () => {
  const state = fixture();
  state.tasks.rows.push(["fub-resume-oshkosh2", "Check and resume the paused Oshkosh 2", "sales", "My own notes.\nHub key: hub-cmprun-CMP-OSH2-paused", "4", "FALSE", "2026-10-26", "FALSE", "none", "", "FALSE", "", "", "high", "", "1793207562032"]);
  const { sync, byId } = await harness(state);
  const result = sync();
  assert.ok(!result.creates.some(item => item.id === "hub-cmprun-CMP-OSH2-paused"));
  state.hub["Outreach Campaigns"].rows[2][6] = 30; // more sent; still paused
  sync();
  assert.equal(byId("fub-resume-oshkosh2").title, "Check and resume the paused Oshkosh 2");
  state.hub["Outreach Campaigns"].rows[2][2] = "Complete";
  state.hub["Outreach Campaigns"].rows[2][7] = "Done";
  assert.equal(sync().closed, 1);
  assert.equal(byId("fub-resume-oshkosh2").completed, "TRUE");
});

test("an open group task is retitled when its count changes", async () => {
  const { state, sync, byId } = await harness();
  sync();
  state.hub["Distribution Directory and Leads"].rows[5][8] = "11/20/2026 2:00 PM"; // Bar B no longer due
  const result = sync();
  assert.equal(result.updated, 1);
  assert.equal(byId("hub-cmp-CMP-APP-FU1-follow-up-2").title, "Send Follow-up 2 to 'Appleton Follow-up 1' (1 business)");
});

test("text that looks like a formula is written as text", async () => {
  const state = fixture();
  state.hub["Inbound Replies"].rows[1][7] = "=HYPERLINK(\"x\")";
  const { sync, byId } = await harness(state);
  sync();
  const reply = byId("hub-reply-RPL-OPEN");
  assert.ok(!String(reply.title).startsWith("="));
  assert.match(reply.title, /^Reply to /);
});

test("a failed Hub read writes nothing", async () => {
  const state = fixture();
  delete state.hub["Distribution Directory and Leads"];
  const { sync } = await harness(state);
  assert.throws(() => sync(), /Missing outreach sheet/);
  assert.equal(state.tasks.rows.length, 2);
});
