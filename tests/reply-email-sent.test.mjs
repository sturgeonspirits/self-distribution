// App version: 2026.11.17.68-WEB
// Karl answers some replies from his own mailbox (2026-11-17); "Email sent" must close the card as answered.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("reply cards waiting on an answer offer Email sent, which closes them as Handled", async () => {
  const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const card = index.slice(index.indexOf("function replyCardHtml"), index.indexOf("async function resolveReplyFromCard"));
  assert.equal((card.match(/\$\{replyEmailSentButton\(\)\}/g) || []).length, 2, "both answer layouts show the button");
  assert.match(index, /function replyEmailSentButton\(\)\{\n    return `<button class="actionBtn" type="button" data-reply-action="emailed">/);
  const handler = index.slice(index.indexOf("async function handleReplyAction"), index.indexOf("function renderNewsletterContacts"));
  assert.match(handler, /else if \(action === "emailed"\) note = "Email sent directly";/);
  assert.match(handler, /let status = "Handled", note = ""/, "the default status for the new action is Handled");
  assert.match(handler, /await resolveReplyFromCard\(reply, status, note, extra\)/);
});

test("the reply checker skips a second copy of the same email (2026.11.17.69-APP)", async () => {
  const backend = await readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
  const start = backend.indexOf("const INBOUND_REPLY_DUPLICATE_WINDOW_MS");
  const end = backend.indexOf("/** Reads new Inbox messages through the mailer");
  const rowsWithSource_ = sheet => sheet.rows;
  const lib = new Function("rowsWithSource_", `${backend.slice(start, end)}; return { inboundReplyDuplicateKey_, inboundReplyRecentCopies_, inboundReplyIsDuplicateCopy_ };`)(rowsWithSource_);
  const at = Date.parse("2026-11-17T17:41:28Z");
  const text = "Hi Karl,\n\nI've just submitted an order.";
  const sheet = { getLastRow:() => 3, rows:[
    { from:"mark@acornridgemotel.com", subject:"New Order - Nov 17", reply_text:text, received_at:new Date(at) },
    { from:"old@example.com", subject:"Re: hi", reply_text:"yes", received_at:new Date(at - 30 * 86400000) },
  ] };
  const copies = lib.inboundReplyRecentCopies_(sheet, at - 86400000);
  assert.equal(copies.size, 1, "only recent rows are indexed");
  const key = lib.inboundReplyDuplicateKey_("Mark@AcornRidgeMotel.com ", "New Order -  Nov 17", text.replace(/\n/g, " "));
  assert.equal(lib.inboundReplyIsDuplicateCopy_(copies, key, at + 1000), true, "same email, second copy");
  assert.equal(lib.inboundReplyIsDuplicateCopy_(copies, key, at + 10 * 60 * 1000), false, "the same words ten minutes later is a new email");
  assert.equal(lib.inboundReplyIsDuplicateCopy_(copies, lib.inboundReplyDuplicateKey_("mark@acornridgemotel.com", "New Order - Nov 17", "Different text"), at), false);
  const loop = backend.slice(backend.indexOf("function checkInboundReplies_"), backend.indexOf("function checkInboundReplies_") + 9000);
  assert.match(loop, /if \(inboundReplyIsDuplicateCopy_\(copies, copyKey, receivedAt\.getTime\(\)\)\) \{ summary\.duplicates \+= 1; stored\.add\(messageId\); advance\(receivedMs\); continue; \}/);
  assert.match(loop, /copies\.set\(copyKey,/, "a copy stored this run also blocks its twin later in the same run");
});

test("answered replies leave the Replies count and sit in Done with Record result (2026.11.17.70-WEB)", async () => {
  const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const count = index.slice(index.indexOf("function updateRepliesTabCount"), index.indexOf("function repliesAwaitingOutcomeFor"));
  assert.match(count, /filter\(reply => reply\.status === "New"\)\.length/);
  assert.doesNotMatch(count, /needs_outcome/);
  const groups = index.slice(index.indexOf("function replyGroups"), index.indexOf("function replyWhen"));
  assert.doesNotMatch(groups, /key:"results"/);
  assert.match(groups, /key:"done"[^\n]*reply\.status !== "New" && \(!reply\.needs_outcome \|\|/);
  const doneRow = index.slice(index.indexOf("function replyDoneRowHtml"), index.indexOf("function replyCardHtml"));
  assert.match(doneRow, /needing \? `<button class="actionBtn" type="button" data-reply-action="result" data-reply-id=/); // grouped per business in 2026.11.19.79-WEB
  assert.doesNotMatch(index, /tile\(resultsToRecord/);
});
