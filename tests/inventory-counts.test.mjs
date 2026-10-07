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
  const { counts, submit } = await harness();
  assert.equal(submit({ store_id: "S1", rep: "Todd", updateInventory: false, items: [{ sku_id: "A", counted: 6 }] }).submitted, 1);
  assert.equal(counts.rows.length, 2);
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
});
