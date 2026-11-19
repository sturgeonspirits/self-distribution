// App version: 2026.11.19.79-WEB / 2026.11.19.78-APP
// Karl, 2026-11-19: Done showed the same bar two or three times (one row per email in a conversation), and Record
// result had no choice for a visit set up or a visit made.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const backend = await readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8");

function doneLib(){
  const start = index.indexOf("function replyDoneKey");
  const end = index.indexOf("function replyCardHtml");
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
  const replyWhen = value => String(value).slice(0, 10);
  const replyDoneText = reply => reply.needs_outcome ? `You ${reply.handled_note}` : reply.outcome_logged ? `Result recorded: ${reply.outcome_logged}` : reply.handled_note;
  return new Function("escapeHtml", "replyWhen", "replyDoneText", `${index.slice(start, end)}; return { replyDoneGroups, replyDoneRowHtml };`)(escapeHtml, replyWhen, replyDoneText);
}

test("Done shows one row per business, newest email on top, earlier ones folded under it", () => {
  const { replyDoneGroups, replyDoneRowHtml } = doneLib();
  const replies = [
    { reply_id:"r5", account_id:"ACC-ANJIE", business:"Anjie's Bar", received_at:"2026-11-18T19:13", handled_note:"answered in Zoho Nov 18", needs_outcome:true },
    { reply_id:"r4", account_id:"ACC-BREWS", business:"MR BREWS TAPHOUSE", received_at:"2026-11-18T19:09", handled_note:"Answered", outcome_logged:"Visit in person · Nov 19 · Karl" },
    { reply_id:"r3", account_id:"ACC-BREWS", business:"MR BREWS TAPHOUSE", received_at:"2026-11-18T14:15", handled_note:"Answered", outcome_logged:"Visit in person · Nov 19 · Karl" },
    { reply_id:"r2", account_id:"ACC-ANJIE", business:"Anjie's Bar", received_at:"2026-11-17T20:00", handled_note:"answered in Zoho Nov 17", needs_outcome:true },
    { reply_id:"r1", account_id:"", from:"x@example.com", business:"", received_at:"2026-11-10T10:00", handled_note:"Closed" },
  ];
  const groups = replyDoneGroups(replies);
  assert.deepEqual(groups.map(group => group.map(reply => reply.reply_id)), [["r5", "r2"], ["r4", "r3"], ["r1"]]);
  const anjie = replyDoneRowHtml(groups[0]);
  assert.equal((anjie.match(/Anjie's Bar|Anjie&#39;s Bar/g) || []).length, 1, "the business name appears once");
  assert.match(anjie, /data-reply-action="result" data-reply-id="r5"/, "Record result opens the newest reply still needing one");
  assert.match(anjie, /1 earlier email from them/);
  assert.match(anjie, /data-reply-action="undo" data-reply-id="r2"/, "each earlier email keeps its own Undo");
  assert.doesNotMatch(replyDoneRowHtml(groups[1]), /data-reply-action="result"/, "no Record result once the result is recorded");
  assert.doesNotMatch(replyDoneRowHtml(groups[2]), /<details/, "a single email has nothing to fold");
});

test("the Done heading counts businesses, not emails", () => {
  const render = index.slice(index.indexOf("const doneGroups = group.key"), index.indexOf("$(\"outreachList\").innerHTML = panel + body;"));
  assert.match(render, /doneGroups \? doneGroups\.length : group\.items\.length/);
  assert.match(render, /doneGroups \? doneGroups\.map\(replyDoneRowHtml\)/);
});

test("Record result and Log contact offer Visit scheduled and Visited; Visit scheduled needs a date", () => {
  assert.match(index, /data-outcome="Visit scheduled">Visit scheduled</);
  assert.match(index, /data-outcome="Visited">Visited</);
  assert.match(index, /data-outcome="Visit in person">Visit in person \(to do\)</, "the existing choice stays, its value unchanged");
  assert.match(index, /<option>Visit scheduled<\/option><option>Visited<\/option><option value="Visit in person">/);
  assert.match(index, /OUTREACH_FOLLOW_UP_OUTCOMES = \[[^\]]*"Visit scheduled"\]/);
  assert.match(backend, /"Visit scheduled", "Visited",\n  "Wrong contact"/);
  assert.match(backend, /OUTREACH_FOLLOW_UP_OUTCOMES = new Set\(\[[^\]]*"Visit scheduled"\]\)/);
  const map = backend.slice(backend.indexOf("function outreachStatusForOutcome_"), backend.indexOf("const OUTREACH_OUTCOME_VALUES"));
  const statusFor = new Function(`${map}; return outreachStatusForOutcome_;`)();
  assert.equal(statusFor("Visit scheduled"), "Interested");
  assert.equal(statusFor("Visited"), "Interested");
});
