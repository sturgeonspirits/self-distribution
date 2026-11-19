// App version: 2026.11.19.89-WEB
// Karl, 2026-11-19: closed businesses should be hidden. Outreach lists leave out any business whose status or
// outcome is Closed; "Closed businesses" under Who to show lists only those, and the count says how many are hidden.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");

function recordsForView(data, view, preset, filterText = ""){
  const start = index.indexOf("  function outreachIsClosed(record)");
  const end = index.indexOf("    const businessSort", start);
  assert.ok(start > 0 && end > start, "closed filter code found");
  const code = `${index.slice(start, end)} return { rows, hidden:outreachClosedHiddenCount }; }`;
  const helpers = `
    function outreachFollowUpIsDue(){ return true; }
    function outreachOutcomeIsInterested(r){ return r.outcome === "Interested"; }
    function outreachHasContactIssue(){ return false; }`;
  return new Function("outreachData", "outreachView", "outreachAudiencePreset", "outreachFilterText",
    `${helpers}\n${code}\nreturn outreachRecordsForView();`)(data, view, preset, filterText);
}

const directory = [
  { business:"2fer's GameTime Retreat Sports Bar & Grill", status:"Closed", outcome:"Closed" },
  { business:"2fer's GameTime Retreat Sports Bar and Grill", status:"Follow-up 2", outcome:"Closed" },
  { business:"The Plaza / The Globe Cafe", status:"Interested", outcome:"Visited" },
  { business:"Mr Brews Taphouse", status:"Sent", outcome:"Interested" },
];

test("closed businesses are hidden from the business list and counted", () => {
  const { rows, hidden } = recordsForView({ directory }, "directory", "all");
  assert.deepEqual(rows.map(r => r.business), ["The Plaza / The Globe Cafe", "Mr Brews Taphouse"]);
  assert.equal(hidden, 2);
});

test("a search only counts the closed businesses it matches", () => {
  const plaza = recordsForView({ directory }, "directory", "all", "plaza");
  assert.equal(plaza.rows.length, 1);
  assert.equal(plaza.hidden, 0);
  const twofers = recordsForView({ directory }, "directory", "all", "2fer");
  assert.equal(twofers.rows.length, 0);
  assert.equal(twofers.hidden, 2);
});

test("Closed businesses lists only the closed ones", () => {
  const { rows, hidden } = recordsForView({ directory }, "directory", "closed");
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => /2fer/.test(r.business)));
  assert.equal(hidden, 0);
});

test("other filters still leave closed businesses out", () => {
  const { rows } = recordsForView({ directory }, "directory", "interested");
  assert.deepEqual(rows.map(r => r.business), ["Mr Brews Taphouse"]);
});

test("the page offers the Closed businesses choice and counts only open businesses", () => {
  assert.match(index, /<option value="closed">Closed businesses<\/option>/);
  assert.match(index, /OUTREACH_AUDIENCE_PRESETS = \[[^\]]*"closed"/);
  assert.match(index, /outreachData\.directory\.filter\(record => !outreachIsClosed\(record\)\)\.length/);
});
