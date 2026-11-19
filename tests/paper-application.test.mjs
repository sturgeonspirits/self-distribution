// App version: 2026.11.19.81-WEB / 2026.11.19.80-APP
// Karl, 2026-11-19: a way for staff to type in a paper customer form without signing the authorization themselves,
// and the new-application email's review link should open the Hub, not the staging sheet.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [signup, index, backend, staffProxy, publicProxy] = await Promise.all([
  read("customer-signup.html"), read("index.html"), read("apps-script/Code.gs"), read("netlify/functions/inventory.js"), read("netlify/functions/customer.js"),
]);

test("paper mode saves through the signed-in staff proxy, never the public form", () => {
  assert.match(signup, /const paperMode = link\.get\("paper"\) === "1";/);
  assert.match(signup, /payload\.action = "submitPaperCustomerApplication";\s*payload\.paper_signed = data\.has\("attested"\);/);
  assert.match(signup, /fetch\(paperMode \? "\/api\/inventory" : "\/api\/customer"/);
  assert.match(staffProxy, /\["submitPaperCustomerApplication", "orders"\]/);
  assert.doesNotMatch(publicProxy, /submitPaperCustomerApplication/, "the public proxy can't reach the paper action");
  assert.match(backend, /case "submitPaperCustomerApplication": res = apiSubmitPaperCustomerApplication_\(body\); break;/);
});

test("staff don't sign: the signer is optional and defaults to the primary contact", () => {
  assert.match(signup, /form\.elements\.authorized_name\.required = false;/);
  assert.match(signup, /form\.elements\.authorized_title\.required = false;/);
  assert.match(signup, /"The customer signed the paper form\."/);
  assert.match(signup, /form\.elements\.newsletter_opt_in\.checked = false;/, "newsletter consent comes from the paper, not a default");
  const fn = backend.slice(backend.indexOf("function apiSubmitPaperCustomerApplication_"), backend.indexOf("function apiSubmitCustomerApplication_"));
  assert.match(fn, /authenticated_staff_name/);
  assert.match(fn, /if \(!toBool_\(p\.paper_signed\)\) throw/);
  assert.match(fn, /authorized_name:String\(p\.authorized_name \|\| ""\)\.trim\(\) \|\| String\(p\.primary_contact_name \|\| ""\)\.trim\(\)/);
  assert.match(fn, /source:"Paper form", entered_by:staffName/);
});

test("a paper form is marked as one and skips the new-application email", () => {
  const fn = backend.slice(backend.indexOf("function apiSubmitCustomerApplication_"), backend.indexOf("function rowsWithSource_"));
  assert.match(fn, /"Submission Source", "Entered By"/);
  assert.match(fn, /set\("submission_source", paper \? "Paper form" : "Online form"\);/);
  assert.match(fn, /if \(paper\) \{[\s\S]*Not needed \(paper form\)[\s\S]*\} else \{[\s\S]*sendCustomerApplicationNotification_/);
  assert.match(fn, /if \(!paper && String\(p\.form_trap/);
  assert.match(backend, /submission_source:String\(row\.submission_source \|\| "Online form"\),\s*entered_by:String\(row\.entered_by \|\| ""\),/);
  assert.match(index, /label:"Received as", value:record\.submission_source === "Paper form"/);
});

test("the new-application email opens the application in the Hub", () => {
  const fn = backend.slice(backend.indexOf("function sendCustomerApplicationNotification_"), backend.indexOf("function apiSubmitPaperCustomerApplication_"));
  assert.match(fn, /const reviewUrl = hubApplicationUrl_\(application\.application_id\);/);
  assert.doesNotMatch(fn, /docs\.google\.com\/spreadsheets/);
  assert.match(fn, /Review this application in the Hub/);
  const helpers = backend.slice(backend.indexOf("function hubApplicationUrl_"), backend.indexOf("function orderEmailDateLabel_"));
  const hubOrderUrl_ = new Function("PUBLIC_SITE_URL_FALLBACK", "publicSiteUrl_", "getOutreachCampaignSettings_", `${helpers}; return hubApplicationUrl_;`)(
    "https://distribution.sturgeonspirits.com", () => "https://distribution.sturgeonspirits.com", () => ({}));
  assert.equal(hubOrderUrl_("APP-20261119-AB12CD34"), "https://distribution.sturgeonspirits.com/?application=APP-20261119-AB12CD34");
  assert.match(index, /new URLSearchParams\(location\.search\)\.has\("application"\)\) activeAppSection = "customers";/);
  assert.match(index, /openPendingOrderLink\(\);\s*openPendingApplicationLink\(\);/);
});

test("the Hub links to paper mode from Outreach and from Orders & Accounts > Applications", () => {
  assert.equal((index.match(/href="\/customer-signup\.html\?paper=1"/g) || []).length, 2);
  assert.match(index, /\$\("paperApplicationLink"\)\.hidden = customerView !== "applications";/);
});
