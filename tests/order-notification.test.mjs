// App version: 2026.11.17.65-APP
// New-order email and order window (Karl, 2026-11-17): the bottles, prices and customer notes must be readable
// without opening the spreadsheet, and the email link must open the order in the Hub.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const functionSource = (backend, name, nextName) => backend.slice(backend.indexOf(`function ${name}`), backend.indexOf(`function ${nextName}`));

async function loadEmailBuilder() {
  const backend = await read("apps-script/Code.gs");
  const escape = new Function(`${functionSource(backend, "escapeOutreachHtml_", backend.slice(backend.indexOf("function escapeOutreachHtml_") + 30).match(/function (\w+)/)[1])}; return escapeOutreachHtml_;`)();
  const money = new Function(`${functionSource(backend, "badgerMoneyLabel_", "badgerInvoicePaymentState_")}; return badgerMoneyLabel_;`)();
  const priceFor = new Function(`${functionSource(backend, "badgerPriceForOrderLine_", "getBadgerInvoiceCreationsSheet_")}; return badgerPriceForOrderLine_;`)();
  const start = backend.indexOf("function pricedOrderLines_");
  const end = backend.indexOf("function sendOnlineOrderNotification_");
  const Utilities = { formatDate:date => date.toDateString() };
  const Session = { getScriptTimeZone:() => "America/Chicago" };
  return new Function("escapeOutreachHtml_", "badgerMoneyLabel_", "badgerPriceForOrderLine_", "Utilities", "Session", "PUBLIC_SITE_URL_FALLBACK", "publicSiteUrl_", "getOutreachCampaignSettings_",
    `${backend.slice(start, end)}; return { pricedOrderLines_, orderTotalsFromLines_, onlineOrderNotificationContent_, hubOrderUrl_ };`)(
    escape, money, priceFor, Utilities, Session, "https://distribution-hub.netlify.app", () => "https://distribution.sturgeonspirits.com", () => ({}));
}

const prices = [
  { sku_id:"STUR-LIQ-APIE-750", description:"Apple Pie Liqueur", unit_price_cents:2200, account_id:"" },
  { sku_id:"STUR-VOD-CRAN-750", description:"Cranberry Vodka", unit_price_cents:2200, account_id:"" },
  { sku_id:"STUR-VOD-CRAN-750", description:"Cranberry Vodka", unit_price_cents:2000, account_id:"ACCT-DEAL" },
];
const lines = [
  { line_number:1, sku_id:"STUR-LIQ-APIE-750", sku_name:"Apple Pie Liqueur", quantity:3, unit:"Bottles", units_per_case:12 },
  { line_number:2, sku_id:"STUR-VOD-CRAN-750", sku_name:"Cranberry Vodka", quantity:2, unit:"Bottles", units_per_case:12 },
];

test("order lines are priced from the wholesale catalog, cases count as bottles, account deals win", async () => {
  const { pricedOrderLines_, orderTotalsFromLines_ } = await loadEmailBuilder();
  const priced = pricedOrderLines_(lines, "", prices);
  assert.deepEqual(priced.map(line => [line.bottles, line.unit_price_cents, line.line_total_cents]), [[3, 2200, 6600], [2, 2200, 4400]]);
  assert.deepEqual(orderTotalsFromLines_(priced), { bottles:5, total_cents:11000, unpriced:0 });
  const deal = pricedOrderLines_([{ sku_id:"STUR-VOD-CRAN-750", quantity:1, unit:"Cases", units_per_case:12 }], "ACCT-DEAL", prices);
  assert.equal(deal[0].bottles, 12);
  assert.equal(deal[0].line_total_cents, 24000);
  const unpriced = pricedOrderLines_([{ sku_id:"STUR-VOD-DILL-750", quantity:1, unit:"Bottles" }], "", prices);
  assert.equal(orderTotalsFromLines_(unpriced).unpriced, 1);
});

test("the new-order email shows products, prices, totals and the notes, and links to the order in the Hub", async () => {
  const builder = await loadEmailBuilder();
  const hubUrl = builder.hubOrderUrl_("ORD-20261117-C50E96EA");
  assert.equal(hubUrl, "https://distribution.sturgeonspirits.com/?order=ORD-20261117-C50E96EA");
  const request = {
    request_id:"ORD-20261117-C50E96EA", business_name:"Acorn Ridge Hospitality, LLC (Tim's Hardware Store)", contact_name:"Mark Wilton",
    email:"mark@example.com", phone:"8475550100", requested_delivery_date:"2026-11-20", delivery_window:"Before 5pm",
    delivery_instructions:"Delivery down to the bar, down the Bar ramp", po_number:"", account_id:"",
    notes:"Tried ordering a bottle of each of the Dill Vodka and Orange Vodka but they weren't on this drop down. Please add one of each if you can.",
  };
  const content = builder.onlineOrderNotificationContent_(request, builder.pricedOrderLines_(lines, "", prices), hubUrl, "https://docs.google.com/x");
  assert.match(content.subject, /^New order: Acorn Ridge .* \(5 bottles, \$110\.00\) - see customer notes$/);
  for (const text of ["Apple Pie Liqueur", "STUR-VOD-CRAN-750", "3 bottles", "$22.00", "$66.00", "$44.00", "$110.00", "Customer notes (may change the order)", "Dill Vodka and Orange Vodka", "Before 5pm", "Bar ramp", "Open this order in the Hub", "Not linked to an account yet"]) {
    assert.ok(content.html.includes(text) || content.html.includes(text.replace(/'/g, "&#39;")), `HTML includes ${text}`);
  }
  assert.ok(content.html.indexOf("Open this order in the Hub") < content.html.indexOf("Spreadsheet row (raw data)"), "the Hub link comes first; the sheet row is a footer link");
  assert.match(content.body, /Open this order in the Hub: https:\/\/distribution\.sturgeonspirits\.com\/\?order=ORD-20261117-C50E96EA/);
  assert.match(content.body, /CUSTOMER NOTES \(may change the order\):\nTried ordering/);
  assert.match(content.body, /3 bottles - Apple Pie Liqueur \(STUR-LIQ-APIE-750\) - \$22\.00 each, \$66\.00/);
  assert.doesNotMatch(content.html, /Review this order in the staging sheet/);
  const noNotes = builder.onlineOrderNotificationContent_(Object.assign({}, request, { notes:"" }), builder.pricedOrderLines_(lines, "", prices), hubUrl, "x");
  assert.doesNotMatch(noNotes.subject, /customer notes/);
  assert.doesNotMatch(noNotes.html, /may change the order/);
});

test("staff can add or remove order products before invoicing, and the Hub opens ?order= links", async () => {
  const [backend, index, proxy] = await Promise.all([read("apps-script/Code.gs"), read("index.html"), read("netlify/functions/inventory.js")]);
  assert.match(backend, /case "updateOnlineOrderLines": res = apiUpdateOnlineOrderLines_\(body\); break;/);
  assert.match(backend, /"updateOnlineOrderRequest","updateOnlineOrderLines"/);
  assert.match(proxy, /"updateOnlineOrderLines",\n/);
  assert.match(proxy, /\["updateOnlineOrderLines", "orders"\]/);
  const block = new Function(`${functionSource(backend, "orderLineEditBlock_", "apiUpdateOnlineOrderLines_")}; return orderLineEditBlock_;`)();
  assert.equal(block({ workflow_status:"New", badger_invoice_number:"" }), "");
  assert.match(block({ workflow_status:"Confirmed", badger_invoice_number:"SS0123" }), /already has a Badger invoice/);
  assert.match(block({ workflow_status:"Cancelled" }), /cancelled/);
  const action = functionSource(backend, "apiUpdateOnlineOrderLines_", "apiReconcileIntegrations_");
  assert.match(action, /apiListSkus_\(\)\.skus\.find/, "only active SKUs can be added");
  assert.match(action, /An order needs at least one product/);
  assert.match(action, /appendAudit_\("UPDATE_ORDER_LINES"/);
  assert.match(action, /set\("bottle_equivalent"/);
  assert.match(backend, /order_catalog:orderCatalog,/);
  assert.match(index, /new URLSearchParams\(location\.search\)\.get\("order"\)/);
  assert.match(index, /renderCustomerWorkflow\(\);\n    openPendingOrderLink\(\);/, "the link opens from fresh data, not the cache");
  assert.match(index, /action:"updateOnlineOrderLines"/);
  assert.match(index, /class="orderNotesBox"/);
  assert.match(index, /const orderLines = isOrder \? orderLinesSectionHtml\(record\) : "";/);
});

test("order and application windows pick the account by business name (2026.11.17.71-WEB)", async () => {
  const index = await read("index.html");
  assert.equal((index.match(/<input id="customerRecordAccountId" list="badgerAccountPicker" autocomplete="off"/g) || []).length, 2);
  assert.match(index, /hydrateRecordAccountField\(record\);\n  \}/);
  assert.equal((index.match(/account_id:recordAccountId,/g) || []).length, 2, "both saves send the picked account's ID");
  const pick = index.slice(index.indexOf("function recordAccountIdFromField"), index.indexOf("function recordAccountIdFromField") + 600);
  const recordAccountIdFromField = new Function("$", "badgerAccountPickerByLabel", `${pick.slice(0, pick.indexOf("\n  }") + 4)}; return recordAccountIdFromField;`);
  const label = "Tim's Hardware Store (Princeton) — ACC-B013655ADA72404598FDF784A3807052";
  const field = value => () => ({ value });
  const map = new Map([[label, "ACC-B013655ADA72404598FDF784A3807052"]]);
  assert.equal(recordAccountIdFromField(field(label), map)(), "ACC-B013655ADA72404598FDF784A3807052");
  assert.equal(recordAccountIdFromField(field("ACC-B013655ADA72404598FDF784A3807052"), map)(), "ACC-B013655ADA72404598FDF784A3807052");
  assert.equal(recordAccountIdFromField(field(""), map)(), "");
  assert.throws(() => recordAccountIdFromField(field("Tims hardware"), map)(), /Pick the business from the list/);
});
