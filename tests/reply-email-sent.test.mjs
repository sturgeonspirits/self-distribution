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
