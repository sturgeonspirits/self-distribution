// Behavioral tests for the Inventory API count submission (apiSubmitCountsUnlocked_), run against
// in-memory sheets. Run: node --test tests/inventory-counts.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

class FakeSheet {
  constructor(id, rows) { this.id = id; this.rows = rows; this.writeCalls = 0; }
  getParent() { return { getId: () => "workbook" }; }
  getSheetId() { return this.id; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(...this.rows.map(row => row.length)); }
  getRange(row, column, rows = 1, columns = 1) {
    const sheet = this;
    return {
      getValues() {
        return Array.from({ length: rows }, (_, i) => Array.from({ length: columns }, (_, j) => sheet.rows[row - 1 + i]?.[column - 1 + j] ?? ""));
      },
      getValue() { return this.getValues()[0][0]; },
      setValues(values) {
        sheet.writeCalls += 1;
        values.forEach((valueRow, i) => {
          while (sheet.rows.length < row + i) sheet.rows.push([]);
          valueRow.forEach((value, j) => { sheet.rows[row - 1 + i][column - 1 + j] = value; });
        });
      },
      setValue(value) { this.setValues([[value]]); },
    };
  }
}

async function harness() {
  const code = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const inventory = new FakeSheet(1, [
    ["store_id", "sku_id", "on_hand_units", "par_level_units", "reorder_point_units", "last_count_date", "last_count_units"],
    ["S1", "A", 5, 6, 2, "", ""],
    ["S2", "X", 9, 9, 9, "", ""],
    ["S1", "B", 3, 6, 2, "", ""],
  ]);
  const counts = new FakeSheet(2, [["timestamp", "store_id", "rep", "sku_id", "system_on_hand_units", "counted_units", "delta_units", "notes"]]);
  const context = { console, Utilities: {}, PropertiesService: { getScriptProperties: () => ({ getProperty: () => "" }) }, CacheService: {}, LockService: {}, SpreadsheetApp: {}, Session: {}, ContentService: {}, MimeType: {} };
  vm.createContext(context);
  vm.runInContext(code, context);
  context.__inventory = inventory;
  context.__counts = counts;
  vm.runInContext(`getSheet_ = name => name === "Counts" ? __counts : __inventory; assertInventoryStoreAllowed_ = () => true;`, context);
  const submit = body => vm.runInContext(`apiSubmitCountsUnlocked_(${JSON.stringify(body)})`, context);
  return { inventory, counts, submit };
}

const items = [
  { sku_id: "A", counted: 5, shelf: 4, back: 1, notes: "", expected_on_hand: 5 },
  { sku_id: "B", counted: 4, shelf: 4, back: 0, notes: "", expected_on_hand: 2 },
];

test("count submit records matching bottles, shelf/back, and flags a changed starting number", async () => {
  const { inventory, counts, submit } = await harness();
  const result = submit({ store_id: "S1", rep: "Todd", updateInventory: true, submission_token: "tok-1", items });
  assert.equal(result.submitted, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(result.changed_since_load)), [{ sku_id: "B", expected_on_hand: 2, current_on_hand: 3 }]);
  assert.deepEqual(counts.rows[0].slice(8), ["shelf_units", "back_units", "expected_system_units", "submission_token"]);
  assert.deepEqual(counts.rows[1].slice(1, 12).filter((_, i) => i !== 6), ["S1", "Todd", "A", 5, 5, 0, 4, 1, 5, "tok-1"]);
  assert.equal(Object.prototype.toString.call(inventory.rows[1][5]), "[object Date]", "matching bottle gets a new last-count date");
  assert.equal(inventory.rows[3][2], 4);
  assert.deepEqual(inventory.rows[2], ["S2", "X", 9, 9, 9, "", ""], "other store rows are unchanged");
  assert.equal(inventory.writeCalls, 3, "inventory is written in three batched column writes");
});

test("a retried count submission is not recorded twice", async () => {
  const { inventory, counts, submit } = await harness();
  submit({ store_id: "S1", rep: "Todd", updateInventory: true, submission_token: "tok-1", items });
  const writes = inventory.writeCalls;
  const retry = submit({ store_id: "S1", rep: "Todd", updateInventory: true, submission_token: "tok-1", items });
  assert.equal(retry.duplicate, true);
  assert.equal(retry.submitted, 0);
  assert.equal(counts.rows.length, 3);
  assert.equal(inventory.writeCalls, writes);
});

test("count submit accepts older clients without a token and rejects bad counts", async () => {
  const { inventory, counts, submit } = await harness();
  assert.equal(submit({ store_id: "S1", rep: "Todd", updateInventory: false, items: [{ sku_id: "A", counted: 6 }] }).submitted, 1);
  assert.equal(counts.rows.length, 2);
  assert.equal(inventory.rows[1][2], 6, "a count always updates on-hand, even if an old client sends updateInventory:false");
  assert.throws(() => submit({ store_id: "S1", rep: "Todd", items: [{ sku_id: "A", counted: -1 }] }), /whole number/);
  assert.throws(() => submit({ store_id: "S1", rep: "Todd", items: [{ sku_id: "A", counted: 1 }, { sku_id: "A", counted: 2 }] }), /appears twice/);
});

test("the Hub submits counted bottles with a stable retry token", async () => {
  const index = await readFile(new URL("index.html", root), "utf8");
  assert.match(index, /\.filter\(line => countState\[line\.sku_id\]\?\.touched\)/);
  assert.match(index, /submission_token: token,/);
  assert.match(index, /expected_on_hand: Number\(line\.on_hand_units \|\| 0\)/);
  assert.match(index, /items: items\.map\(\(\{ expected_on_hand, \.\.\.rest \}\) => rest\)/);
  assert.match(index, /not been counted yet\. Submit the/);
  assert.match(index, /countSubmissionKey\(storeId\)/);
  assert.match(index, /distribution_hub:count-draft:/);
  assert.doesNotMatch(index, /id="updateInventory"/);
});

test("managerGrid reports each store's most recent count date", async () => {
  const code = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  const sheets = {
    Stores: new FakeSheet(11, [["store_id", "store_name", "route"], ["S1", "Store One", ""], ["S2", "Store Two", ""]]),
    SKUs: new FakeSheet(12, [["sku_id", "sku_name", "size", "units_per_case", "active"], ["A", "Alpha", "750 mL", 12, true], ["B", "Beta", "750 mL", 12, true]]),
    Inventory: new FakeSheet(13, [
      ["store_id", "sku_id", "on_hand_units", "par_level_units", "reorder_point_units", "last_count_date", "last_count_units"],
      ["S1", "A", 5, 6, 2, new Date("2026-09-01T15:00:00Z"), 5],
      ["S1", "B", 3, 6, 2, new Date("2026-10-07T15:00:00Z"), 3],
      ["S2", "A", 4, 6, 2, "", ""],
    ]),
  };
  const context = { console, Utilities: {}, PropertiesService: { getScriptProperties: () => ({ getProperty: () => "" }) }, CacheService: {}, LockService: {}, SpreadsheetApp: {}, Session: {}, ContentService: {}, MimeType: {} };
  vm.createContext(context);
  vm.runInContext(code, context);
  context.__sheets = sheets;
  vm.runInContext(`getSheet_ = name => __sheets[name]; inventoryTrackedAccountIds_ = () => new Set(); inventoryStoreAllowed_ = () => true; storeContactFields_ = () => ({});`, context);
  const grid = JSON.parse(JSON.stringify(vm.runInContext("apiGetManagerGrid_()", context)));
  const byId = Object.fromEntries(grid.stores.map(store => [store.store_id, store.last_count_date]));
  assert.equal(byId.S1, "2026-10-07T15:00:00.000Z");
  assert.equal(byId.S2, "");
  const index = await readFile(new URL("index.html", root), "utf8");
  assert.match(index, /Last count \$\{formatDate\(store\.last_count_date\)\}/);
});

test("phone count mode hides extra tools behind More tools and lists uncounted bottles first", async () => {
  const index = await readFile(new URL("index.html", root), "utf8");
  assert.doesNotMatch(index, /<label>Counted by<\/label>/);
  assert.match(index, /id="compactToolsToggle"/);
  for (const id of ["managerSummaryCard", "storeContactsDetails", "countSearchWrap", "inventoryViewTabs", "countFilters", "countSummaryGrid", "managerDetails"]) {
    assert.match(index, new RegExp(`body\\.compactCount #${id}`), `${id} is hidden only in compact mode`);
    assert.match(index, new RegExp(`id="${id}"`), `${id} still exists`);
  }
  assert.match(index, /\.sort\(\(a, b\) => \(isCounted\(a\.line\) - isCounted\(b\.line\)\) \|\| \(a\.order - b\.order\)\)/);
  assert.match(index, /compactCountQuery\.matches && activeAppSection === "inventory" && !compactToolsOpen/);
});

test("salesReport returns the sales tabs as displayed, trimmed to their data", async () => {
  const code = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  class DisplaySheet extends FakeSheet {
    getRange(row, column, rows = 1, columns = 1) {
      if (typeof row === "string") return { getDisplayValue: () => "90" };
      const range = super.getRange(row, column, rows, columns);
      range.getDisplayValues = () => range.getValues().map(r => r.map(v => String(v)));
      return range;
    }
  }
  const locations = new DisplaySheet(21, [
    ["Sales by location"], [], [], ["Overdue when", 1.5], ["Recent period, in days", 90], [], [], [],
    ["Location", "Type", "Reorder status", ""],
    ["Becket's", "On-premise", "On schedule", ""],
    ["Woodman's Appleton", "Retail", "Overdue", ""],
    ["", "", "", ""],
  ]);
  const products = new DisplaySheet(22, [["Sales by product"], [], [], ["Product", "Units"], ["Cranberry Vodka", "485"]]);
  const sheets = { "Sales by Location": locations, "Sales by Product": products };
  const context = { console, Utilities: {}, PropertiesService: { getScriptProperties: () => ({ getProperty: () => "" }) }, CacheService: {}, LockService: {}, Session: {}, ContentService: {}, MimeType: {},
    SpreadsheetApp: { openById: () => ({ getSheetByName: name => sheets[name] || null }) } };
  vm.createContext(context);
  vm.runInContext(code, context);
  const result = JSON.parse(JSON.stringify(vm.runInContext("apiGetSalesReport_()", context)));
  assert.deepEqual(result.sales_report.locations.headers, ["Location", "Type", "Reorder status"]);
  assert.deepEqual(result.sales_report.locations.rows, [["Becket's", "On-premise", "On schedule"], ["Woodman's Appleton", "Retail", "Overdue"]]);
  assert.deepEqual(result.sales_report.products.rows, [["Cranberry Vodka", "485"]]);
  assert.equal(result.sales_report.grid.missing, true);
  assert.equal(result.recent_days, "90");
  const proxy = await readFile(new URL("netlify/functions/inventory.js", root), "utf8");
  assert.match(proxy, /\["salesReport", "orders"\]/);
  assert.match(code, /READ_ACTIONS = new Set\(\[[^\]]*"salesReport"/);
  const index = await readFile(new URL("index.html", root), "utf8");
  assert.match(index, /staffApiGet\(\{ action:"salesReport" \}\)/);
});
