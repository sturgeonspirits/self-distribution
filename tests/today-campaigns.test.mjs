// App version: 2026.11.19.87-APP / 2026.11.19.88-WEB
// Karl, 2026-11-19: Today listed businesses whose next email a campaign was already about to send. Today now leaves
// those out, and every card says which campaign still has an email waiting for that business.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readBackend } from "./helpers/backend-source.mjs";

const backend = await readBackend();
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");

function fakeSheet(rows){
  return {
    getLastRow:() => rows.length,
    getLastColumn:() => rows[0].length,
    getRange:(row, col, numRows, numCols) => ({ getValues:() => rows.slice(row - 1, row - 1 + numRows).map(r => r.slice(col - 1, col - 1 + numCols)) }),
  };
}
const headerMap = sheet => Object.fromEntries(sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((h, i) => [String(h).trim().toLowerCase().replace(/\s+/g, "_"), i]));

function membershipFor(campaigns, recipients){
  const start = backend.indexOf("const OPEN_CAMPAIGN_STATE_RANK");
  const code = backend.slice(start, backend.indexOf("function campaignRecipientRows_"));
  const sheets = { campaigns:fakeSheet(campaigns), recipients:fakeSheet(recipients) };
  return new Function("outreachCampaignSheets_", "getHeaderMap_", `${code}; return openCampaignMembership_();`)(() => sheets, headerMap);
}

const campaignHeader = ["Campaign ID", "Campaign Name", "Status", "Schedule Status"];
const recipientHeader = ["Campaign ID", "Source Row", "Account ID", "Status", "Message Stage", "Body Text"];

test("membership covers open campaigns only and says whether the next email is scheduled", () => {
  const map = membershipFor([
    campaignHeader,
    ["CMP-FU1", "First prospects, Sep 23 — Follow-up 1", "Approved", "Scheduled"],
    ["CMP-FU2", "First prospects, Sep 23 — Follow-up 2", "Review", ""],
    ["CMP-OLD", "Initial prospect campaign — Sep 23", "Complete with blocks", ""],
    ["CMP-PAUSED", "Oshkosh 2 follow-up", "Approved", "Paused"],
  ], [
    recipientHeader,
    ["CMP-FU1", 35, "ACC-BACKAGAIN", "Ready to send", "Follow-up 1", "long body"],
    ["CMP-FU1", 41, "ACC-HOUGES", "Sent", "Follow-up 1", ""],
    ["CMP-FU2", 60, "ACC-DELTA", "Ready for review", "Follow-up 2", ""],
    ["CMP-OLD", 99, "ACC-OLDONLY", "Ready to send", "Initial", ""],
    ["CMP-PAUSED", 70, "", "Ready to send", "Follow-up 1", ""],
    ["CMP-FU2", 35, "ACC-BACKAGAIN", "Ready for review", "Follow-up 2", ""],
  ]);
  assert.deepEqual(map.get("ACC-BACKAGAIN"), { name:"First prospects, Sep 23 — Follow-up 1", state:"scheduled", stage:"Follow-up 1" }, "a scheduled email wins over one waiting for review");
  assert.equal(map.get("ACC-HOUGES"), undefined, "already sent: nothing waiting");
  assert.equal(map.get("ACC-DELTA").state, "review");
  assert.equal(map.get("ACC-OLDONLY"), undefined, "finished campaigns don't count");
  assert.equal(map.get("row:70").state, "paused", "no Account ID: keyed by Directory row");
});

test("Today and the due count leave out businesses a campaign is about to email", () => {
  const dash = backend.slice(backend.indexOf("function apiGetOutreachDashboard_"), backend.indexOf("function isReadyOutreach_") > 0 ? backend.length : backend.length);
  assert.match(dash, /const campaignWillSend = record => record\.campaign\?\.state === "scheduled";/);
  assert.match(dash, /const due = records\.filter\(record => isDueOutreach_\(record, endOfToday\) && !campaignWillSend\(record\)\);/);
  assert.match(dash, /const ready = records\.filter\(record => isReadyOutreach_\(record\) && !campaignWillSend\(record\)\)/);
  assert.match(backend, /"weekly_exclusion_reasons", "has_saved_draft", "campaign",/, "the label reaches the page");
});

test("cards show which campaign still has an email waiting", () => {
  const start = index.indexOf("function outreachCampaignBadge(record)");
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
  const badge = new Function("escapeHtml", `${index.slice(start, index.indexOf("function patchOutreachRecordLocally"))}; return outreachCampaignBadge;`)(escapeHtml);
  assert.equal(badge({}), "");
  assert.match(badge({ campaign:{ name:"First prospects, Sep 23 — Follow-up 2", state:"review" } }), /In campaign: First prospects, Sep 23 — Follow-up 2 · waiting for your review/);
  assert.match(badge({ campaign:{ name:"Fond Du Lac — Follow-up 1", state:"scheduled" } }), /class="badge blue"[\s\S]*next email scheduled/);
  assert.match(index, /<span class="badge">\$\{escapeHtml\(dateLabel\)\}<\/span>\s*\$\{outreachCampaignBadge\(record\)\}/);
});
