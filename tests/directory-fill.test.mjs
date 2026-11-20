// Behavior tests for trusted-source Directory contact filling.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readBackend } from "./helpers/backend-source.mjs";

async function contextFor() {
  const context = {
    console:{ log() {}, warn() {}, error() {} },
    Utilities:{ formatDate:() => "2026-11-19" },
    Session:{ getScriptTimeZone:() => "America/Chicago" },
    PropertiesService:{ getScriptProperties:() => ({ getProperty:() => null, setProperty() {}, setProperties() {} }) },
    CacheService:{ getScriptCache:() => ({ get:() => null, put() {}, remove() {} }) },
    SpreadsheetApp:{}, LockService:{}, ScriptApp:{}, ContentService:{}, MimeType:{},
  };
  vm.createContext(context);
  vm.runInContext(await readBackend(), context);
  return context;
}

const HEADERS = {
  business_name:0, contact_person:1, email:2, status:3, outcome:4, notes:5, relationship:6,
  email_confidence:7, record_updated_at:8, email_source_url:9,
};

function apply(context, values, source) {
  const output = JSON.parse(JSON.stringify(vm.runInContext(`(() => { const values = ${JSON.stringify(values)}; const result = directoryApplyContactFillToValues_(values, ${JSON.stringify(HEADERS)}, ${JSON.stringify(source)}, new Date('2026-11-19T15:00:00-06:00')); return { result:result, values:values }; })()`, context)));
  values.splice(0, values.length, ...output.values);
  return output.result;
}

function directorySheet(values) {
  const headers = Object.keys(HEADERS).sort((a, b) => HEADERS[a] - HEADERS[b]);
  const rows = [headers, values];
  return {
    getLastRow:() => rows.length,
    getLastColumn:() => headers.length,
    getParent:() => ({ getId:() => "reply-fill-test" }),
    getSheetId:() => 1,
    getRange(row, column, height = 1, width = 1) {
      return {
        getValues:() => Array.from({ length:height }, (_, i) => Array.from({ length:width }, (_, j) => rows[row - 1 + i]?.[column - 1 + j] ?? "")),
        setValue:value => { rows[row - 1][column - 1] = value; },
      };
    },
  };
}

test("trusted reply fills blank email and person name, restores a prospect, and records its source", async () => {
  const context = await contextFor();
  const values = ["A Bar", "", "", "Needs email", "", "", "Prospect", "", "", ""];
  const result = apply(context, values, { email:"owner@abar.example", contact:"Jamie Smith", email_confidence:"Confirmed", label:"email reply" });
  assert.equal(result.email_filled, true);
  assert.equal(result.contact_filled, true);
  assert.deepEqual(values.slice(1, 8), ["Jamie Smith", "owner@abar.example", "Not contacted", "", "2026-11-19 - Filled email owner@abar.example and contact person Jamie Smith from email reply.", "Prospect", "Confirmed"]);
});

test("real values are kept and a trusted source disagreement is left in Notes", async () => {
  const context = await contextFor();
  const values = ["A Bar", "Alex Jones", "alex@abar.example", "Not contacted", "", "Prior", "Prospect", "Confirmed", "", ""];
  apply(context, values, { email:"jamie@abar.example", contact:"Jamie Smith", email_confidence:"Confirmed", label:"email reply" });
  assert.equal(values[1], "Alex Jones");
  assert.equal(values[2], "alex@abar.example");
  assert.match(values[5], /email reply has email jamie@abar\.example/);
  assert.match(values[5], /email reply has contact Jamie Smith/);
  const repeat = apply(context, values, { email:"jamie@abar.example", contact:"Jamie Smith", email_confidence:"Confirmed", label:"email reply" });
  assert.equal(repeat.changed, false, "the backfill is safe to preview and run again");
});

test("a placeholder name is replaceable, but an ordinary name containing na is not", async () => {
  const context = await contextFor();
  const placeholder = ["A Bar", "Club Manager", "", "Not contacted", "", "", "Prospect", "", "", ""];
  apply(context, placeholder, { contact:"Jamie Smith", label:"email reply" });
  assert.equal(placeholder[1], "Jamie Smith");
  const real = ["A Bar", "Nate Anderson", "", "Not contacted", "", "", "Prospect", "", "", ""];
  apply(context, real, { contact:"Jamie Smith", label:"email reply" });
  assert.equal(real[1], "Nate Anderson");
  assert.match(real[5], /email reply has contact Jamie Smith/);
});

test("a replacement reply address clears Bad address, while an address recorded as bounced is never learned", async () => {
  const context = await contextFor();
  const replacement = ["A Bar", "", "old@abar.example", "Needs email", "Bad address", "2026-11-18 - Bad email (bounced): old@abar.example", "Prospect", "", "", ""];
  apply(context, replacement, { email:"owner@abar.example", contact:"Jamie Smith", email_confidence:"Confirmed", label:"email reply" });
  assert.equal(replacement[2], "owner@abar.example");
  assert.equal(replacement[4], "");
  const bounced = ["A Bar", "", "", "Needs email", "", "2026-11-18 - Bad email (bounced): owner@abar.example", "Prospect", "", "", ""];
  const result = apply(context, bounced, { email:"owner@abar.example", contact:"Jamie Smith", email_confidence:"Confirmed", label:"email reply" });
  assert.equal(result.changed, false);
  assert.equal(bounced[1], "");
  assert.equal(bounced[2], "");
});

test("reply name rules accept a person and reject roles, addresses, and the business name", async () => {
  const context = await contextFor();
  const name = expression => JSON.parse(JSON.stringify(vm.runInContext(expression, context)));
  assert.equal(name(`inboundReplyPersonContactName_('Jamie Smith', 'A Bar', 'owner@abar.example')`), "Jamie Smith");
  assert.equal(name(`inboundReplyPersonContactName_('Info Desk', 'A Bar', 'info@abar.example')`), "");
  assert.equal(name(`inboundReplyPersonContactName_('owner@abar.example', 'A Bar', 'owner@abar.example')`), "");
  assert.equal(name(`inboundReplyPersonContactName_('A Bar', 'A Bar', 'owner@abar.example')`), "");
});

test("a strong person reply fills both details, while a role name and automatic reply do not", async () => {
  const context = await contextFor();
  const values = ["A Bar", "", "", "Needs email", "", "", "Prospect", "", "", ""];
  context.__sheet = directorySheet(values);
  vm.runInContext("getOutreachSheet_ = () => __sheet; LockService.getScriptLock = () => ({ tryLock:() => true, releaseLock() {} }); appendAudit_ = () => {};", context);
  const fill = args => JSON.parse(JSON.stringify(vm.runInContext(`applyInboundReplyDirectoryFill_(${JSON.stringify(args.match)}, ${JSON.stringify(args.message)}, ${JSON.stringify(args.classification)}, new Date('2026-11-19T15:00:00-06:00'))`, context)));
  const base = { match:{ record:{ source_row:2, account_id:"ACC-A", business:"A Bar" }, matched_by:"Address we emailed", email:"owner@abar.example", bounce:false } };
  assert.equal(fill({ ...base, message:{ from_name:"Jamie Smith" }, classification:{ category:"Needs reading" } }).changed, true);
  assert.equal(values[1], "Jamie Smith");
  assert.equal(values[2], "owner@abar.example");
  const roleValues = ["B Bar", "", "", "Needs email", "", "", "Prospect", "", "", ""];
  context.__sheet = directorySheet(roleValues);
  const role = { match:{ record:{ source_row:2, account_id:"ACC-B", business:"B Bar" }, matched_by:"Address we emailed", email:"info@bbar.example", bounce:false } };
  assert.equal(fill({ ...role, message:{ from_name:"Info Desk" }, classification:{ category:"Needs reading" } }).contact_filled, false);
  assert.equal(roleValues[2], "info@bbar.example", "a role inbox still supplies a confirmed address");
  const automaticValues = ["C Bar", "", "", "Needs email", "", "", "Prospect", "", "", ""];
  context.__sheet = directorySheet(automaticValues);
  const automatic = { match:{ record:{ source_row:2, account_id:"ACC-C", business:"C Bar" }, matched_by:"Address we emailed", email:"owner@cbar.example", bounce:false } };
  assert.equal(fill({ ...automatic, message:{ from_name:"Casey Smith" }, classification:{ category:"Out of office" } }).changed, false);
  assert.equal(automaticValues[2], "");
});
