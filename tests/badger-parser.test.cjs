// Badger parser 2026.10.03.1 tests (2026-10-03). Run: node tests/badger-parser.test.cjs — fakes SpreadsheetApp, Drive, ScriptApp, etc.
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const SRC = fs.readFileSync(require("path").join(__dirname, "..", "docs", "reference", "badger-parser", "Code.gs"), "utf8");
const PROD_ID = "1nmHzrZLB2Kv-bLf3z0GBXbkO0XqUL-ETCxUlOlidSEk";
const STAGE_ID = "10KM-L-iAXJ4WQ1HfLWWoGkINsi9tEvVs6J5XiHBsMIQ";
const PROD_FOLDER = "1ccOfQpk69SLyMYskD2srlNqHCGm1VBJ5";

function makeSheet(name, rows) {
  const s = { name, rows: rows ? rows.map(r => r.slice()) : [], failAppend: false, checkboxes: [], validations: [], cleared: 0 };
  const width = () => Math.max(0, ...s.rows.map(r => r.length));
  s.getLastRow = () => { let n = s.rows.length; while (n > 0 && s.rows[n - 1].every(v => v === "" || v == null)) n--; return n; };
  s.getLastColumn = () => width();
  s.getMaxRows = () => Math.max(s.rows.length, 1); s.getMaxColumns = () => Math.max(width(), 1);
  s.setFrozenRows = () => s; s.setFrozenColumns = () => s; s.autoResizeColumns = () => s;
  s.clear = () => { s.rows = []; s.cleared++; return s; };
  s.appendRow = r => { s.rows.push(r.slice()); };
  s.getDataRange = () => s.getRange(1, 1, Math.max(s.getLastRow(), 1), Math.max(width(), 1));
  s.getRange = (r, c, nr = 1, nc = 1) => {
    const rng = {
      getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (s.rows[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? "" : v); } out.push(row); } return out; },
      setValues: vals => {
        if (s.failAppend && r > s.getLastRow()) throw new Error(`simulated write failure on ${s.name}`);
        vals.forEach((row, i) => { while (s.rows.length < r + i) s.rows.push([]); const t = s.rows[r - 1 + i]; row.forEach((v, j) => { while (t.length < c - 1 + j) t.push(""); t[c - 1 + j] = v; }); }); return rng; },
      setValue: v => rng.setValues([[v]]),
      clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (s.rows[r - 1 + i]) s.rows[r - 1 + i][c - 1 + j] = ""; return rng; },
      insertCheckboxes: () => { s.checkboxes.push([r, c, nr, nc]); return rng; },
      setDataValidation: () => { s.validations.push([r, c, nr, nc]); return rng; },
      merge: () => rng, setHorizontalAlignment: () => rng, setFontWeight: () => rng, setNumberFormat: () => rng, setFontSize: () => rng, breakApart: () => rng,
    };
    return rng;
  };
  return s;
}

function makeEnv({ ssId, sheets = {}, files = [], texts = {}, props = {}, noActive = false }) {
  const tabs = {}; Object.entries(sheets).forEach(([n, rows]) => tabs[n] = makeSheet(n, rows));
  const toasts = [];
  const ss = { getId: () => ssId, getSheetByName: n => tabs[n] || null, insertSheet: n => (tabs[n] = makeSheet(n, [])), toast: m => toasts.push(m), setActiveSheet: () => {} };
  const propStore = Object.assign({}, props);
  const docs = {}; let docSeq = 0; const trashed = []; const triggers = [];
  const ctx = {
    console: { log: () => {}, warn: () => {} },
    SpreadsheetApp: { getActive: () => (noActive ? null : ss), openById: id => (id === ssId ? ss : null), getUi: () => ({ createMenu: () => { const m = { items: [], addItem: (a, b) => (m.items.push(b), m), addSeparator: () => m, addToUi: () => (ctx.__menu = m) }; return m; } }),
      newDataValidation: () => { const b = { requireValueInList: () => b, setAllowInvalid: () => b, build: () => ({}) }; return b; } },
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => Object.assign({}, propStore), getProperty: k => (k in propStore ? propStore[k] : null), setProperty: (k, v) => { propStore[k] = String(v); }, deleteProperty: k => { delete propStore[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Drive: { Files: {
      list: ({ q }) => {
        const folder = q.match(/'([^']+)' in parents/)[1];
        const inFolder = files.filter(f => f.parent === folder);
        const pick = q.includes("mimeType='application/pdf'") ? inFolder.filter(f => f.mimeType === "application/pdf") : inFolder.filter(f => f.mimeType !== "application/pdf");
        return { files: pick.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType })) };
      },
      get: id => ({ name: (files.find(f => f.id === id) || {}).name }),
      create: (meta, blob) => { const id = "doc" + (++docSeq); docs[id] = texts[blob.fileId] || ""; return { id }; },
      update: (_m, id) => trashed.push(id),
    } },
    DocumentApp: { openById: id => ({ getBody: () => ({ getText: () => docs[id] }) }) },
    ScriptApp: { getOAuthToken: () => "t",
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: t => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: handler => { const spec = { handler }; const b = { timeBased: () => b, inTimezone: z => (spec.tz = z, b), atHour: h => (spec.hour = h, b), nearMinute: m => (spec.minute = m, b), everyDays: d => (spec.days = d, b), create: () => { const t = { spec, getHandlerFunction: () => handler }; triggers.push(t); return t; } }; return b; } },
    UrlFetchApp: { fetch: url => { const fileId = decodeURIComponent(url.split("/files/")[1].split("?")[0]); return { getResponseCode: () => 200, getBlob: () => ({ fileId, setName: () => {}, getContentType: () => "application/pdf" }) }; } },
    Utilities: { sleep: () => {}, formatDate: () => "20261002" },
    Session: { getScriptTimeZone: () => "America/Chicago" },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, tabs, toasts, propStore, trashed, triggers };
}

const invText = (no, cust, lines) => `Badger State Winery Cooperative\nInvoice #: ${no}\nDate: 9/16/2026\nCustomer Name: ${cust}\nAmount Due: $264.00\n` + lines.map(l => `${l.q} 750mL ${l.d} Spirits $22.00 $${(22 * l.q).toFixed(2)}`).join("\n") + "\n" + "x".repeat(60);
const INV_H = ["Processed At","PDF File Id","PDF File Name","Invoice #","Invoice Date","Customer Name","Customer Address","Customer City/State/Zip","Reseller #","Winery Name","Phone","Order #","Amount Due","Terms","Delivered","Paid to Me","Submitted"];
const LINE_H = ["Invoice #","Customer Name","Qty","Volume","Description","Beverage Class","Unit Price","Line Total"];
const ERR_H = ["Timestamp","File Id","File Name","Stage","Error","Text Snippet"];
const prodSheets = (extraInv = []) => ({ "Invoices": [INV_H, ...extraInv], "Invoice Lines": [LINE_H], "Import Errors": [ERR_H], "Monthly Summary": [["", "2025"]], "Previous Month": [["x"]] });
const pdf = (id, name, parent = PROD_FOLDER) => ({ id, name, parent, mimeType: "application/pdf" });

let passed = 0; const t = (name, fn) => { fn(); passed++; console.log("ok -", name); };

t("unknown spreadsheet stops with a safety message", () => {
  const e = makeEnv({ ssId: "someOtherSheet" });
  assert.throws(() => e.ctx.importInvoicePdfs(), /not a known Badger Invoice Tracker/);
  e.ctx.onOpen(); assert.strictEqual(JSON.stringify(e.ctx.__menu.items), JSON.stringify(["showParserStatus"]));
});

t("production imports a new invoice into the real tabs, creates Parser State, rebuilds summary", () => {
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets([["old", "OLDFILE", "0163.pdf", "SS0163", "9/28/2026", "Fox and Crow"]]),
    files: [pdf("OLDFILE", "0163-fox.pdf"), pdf("F087", "0087-wagner-01-2026.pdf")],
    texts: { F087: invText("SS0087", "Wagner Market", [{ q: 12, d: "Blood Orange Gin" }]) } });
  const r = e.ctx.importInvoicePdfs();
  assert.strictEqual(r.environment, "PRODUCTION"); assert.strictEqual(r.imported, 1); assert.strictEqual(r.skippedProcessed, 1);
  const inv = e.tabs["Invoices"].rows; assert.strictEqual(inv.length, 3); assert.strictEqual(inv[2][3], "SS0087"); assert.strictEqual(inv[2][16], "No");
  assert.strictEqual(e.tabs["Invoice Lines"].rows.length, 2);
  assert.ok(e.tabs["Parser State"], "Parser State created"); assert.strictEqual(e.tabs["Parser State"].rows[1][3], "IMPORTED");
  assert.ok(!e.tabs["TEST - Invoices"], "never touches TEST tabs in production");
  assert.strictEqual(JSON.stringify(e.tabs["Invoices"].checkboxes), JSON.stringify([[3, 15, 1, 2]]), "checkboxes only on the new row");
  assert.ok(e.tabs["Monthly Summary"].cleared >= 1, "summary rebuilt");
  assert.strictEqual(e.trashed.length, 1, "temporary doc trashed");
});

t("second run imports nothing (idempotent)", () => {
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), files: [pdf("F1", "0098.pdf")], texts: { F1: invText("SS0098", "Woodman's", [{ q: 6, d: "Gin" }]) } });
  e.ctx.importInvoicePdfs(); const r2 = e.ctx.importInvoicePdfs();
  assert.strictEqual(r2.imported, 0); assert.strictEqual(r2.attempted, 0); assert.strictEqual(e.tabs["Invoices"].rows.length, 2); assert.strictEqual(e.tabs["Invoice Lines"].rows.length, 2);
});

t("interrupted run (invoice write fails after lines saved) recovers without doubling lines", () => {
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), files: [pdf("F1", "0144.pdf")], texts: { F1: invText("SS0144", "Sunken Paddle", [{ q: 6, d: "Gin" }, { q: 6, d: "Cherry Vodka" }]) } });
  e.tabs["Invoices"].failAppend = true;
  assert.throws(() => e.ctx.importInvoicePdfs(), /simulated write failure/);
  assert.strictEqual(e.tabs["Invoice Lines"].rows.length, 3, "lines saved before the failure");
  assert.strictEqual(e.tabs["Invoices"].rows.length, 1, "invoice not saved");
  assert.ok(!e.tabs["Parser State"] || e.tabs["Parser State"].rows.length === 1, "no state row written");
  e.tabs["Invoices"].failAppend = false;
  const r = e.ctx.importInvoicePdfs();
  assert.strictEqual(r.imported, 1); assert.strictEqual(r.linesAlreadyPresent, 1);
  assert.strictEqual(e.tabs["Invoice Lines"].rows.length, 3, "lines not doubled");
  assert.strictEqual(e.tabs["Invoices"].rows.length, 2);
});

t("line write failure leaves nothing behind; retry imports cleanly", () => {
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), files: [pdf("F1", "0001.pdf")], texts: { F1: invText("SS0001", "Cujak's", [{ q: 5, d: "Gin" }]) } });
  e.tabs["Invoice Lines"].failAppend = true;
  assert.throws(() => e.ctx.importInvoicePdfs());
  assert.strictEqual(e.tabs["Invoices"].rows.length, 1);
  e.tabs["Invoice Lines"].failAppend = false;
  assert.strictEqual(e.ctx.importInvoicePdfs().imported, 1);
});

t("non-invoice PDF becomes REVIEW once and is not re-read; RETRY re-opens it", () => {
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), files: [pdf("X", "template.pdf")], texts: { X: "Sturgeon Spirits template invoice 1/1/2026 amount due $1.00 " + "y".repeat(150) } });
  const r1 = e.ctx.importInvoicePdfs(); assert.strictEqual(r1.review, 1);
  const errorsAfter1 = e.tabs["Import Errors"].rows.length;
  const r2 = e.ctx.importInvoicePdfs(); assert.strictEqual(r2.attempted, 0); assert.strictEqual(e.tabs["Import Errors"].rows.length, errorsAfter1, "no repeat error rows");
  e.tabs["Parser State"].rows[1][3] = "RETRY";
  assert.strictEqual(e.ctx.importInvoicePdfs().attempted, 1);
});

t("duplicate invoice number in a second PDF is skipped", () => {
  const txt = invText("SS0154", "Wagner Market", [{ q: 1, d: "Gin" }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), files: [pdf("A", "0154-a.pdf"), pdf("B", "0154-b.pdf")], texts: { A: txt, B: txt } });
  const r = e.ctx.importInvoicePdfs(); assert.strictEqual(r.imported, 1); assert.strictEqual(r.skippedDuplicateInvoice, 1);
});

t("only top-level PDFs are read; .html files and subfolders are reported", () => {
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), files: [
    pdf("SUBPDF", "inside-sub.pdf", "SUBFOLDER"),
    { id: "SUBFOLDER", name: "Branded", parent: PROD_FOLDER, mimeType: "application/vnd.google-apps.folder" },
    { id: "H", name: "0162-Flights-09-2026.html", parent: PROD_FOLDER, mimeType: "text/html" }], texts: {} });
  const r = e.ctx.importInvoicePdfs();
  assert.strictEqual(r.attempted, 0); assert.strictEqual(JSON.stringify(r.ignoredNonPdf), JSON.stringify(["0162-Flights-09-2026.html"])); assert.strictEqual(JSON.stringify(r.subfolders), JSON.stringify(["Branded"]));
  assert.ok(e.toasts.some(m => /Save invoices as PDF/.test(m)));
});

t("production refuses to run with a changed header instead of rewriting it", () => {
  const sheets = prodSheets(); sheets["Invoices"] = [INV_H.map((h, i) => (i === 15 ? "Paid" : h))];
  const e = makeEnv({ ssId: PROD_ID, sheets });
  assert.throws(() => e.ctx.importInvoicePdfs(), /column 16 is "Paid" but should be "Paid to Me"/);
  assert.strictEqual(e.tabs["Invoices"].rows[0][15], "Paid", "header untouched");
});

t("staging uses TEST tabs and the fixture folder, never the production folder", () => {
  const e = makeEnv({ ssId: STAGE_ID, files: [pdf("P", "prod.pdf"), pdf("FX", "FIXTURE-VALID-0157-acorn.pdf", "1_F2aeV7p3FvxPKtY8sONJyUKJoRK4foq")],
    texts: { P: invText("SS0999", "Nope", []), FX: invText("SS0157", "Acorn Ridge", [{ q: 6, d: "Gin" }]) } });
  const r = e.ctx.importInvoicePdfs();
  assert.strictEqual(r.environment, "STAGING"); assert.strictEqual(r.imported, 1);
  assert.strictEqual(e.tabs["TEST - Invoices"].rows[1][3], "SS0157"); assert.ok(!e.tabs["Invoices"]);
});

t("legacy migration copies markers, deletes legacy + Supabase settings, keeps others", () => {
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets([["d", "INV_FILE", "x.pdf", "SS0001"]]),
    props: { processed_pdf_INV_FILE: "1", processed_pdf_OLDREVIEW: "1", ocr_count_20260101: "3", SUPABASE_URL: "u", SUPABASE_KEY: "k", BADGER_PASSWORD: "keep", ocr_daily_state: "{}" } });
  const r = e.ctx.migrateLegacyParserSettings();
  assert.strictEqual(r.migrated, 1, "only the file not already in Invoices"); assert.strictEqual(r.deleted, 5);
  assert.deepStrictEqual(Object.keys(e.propStore).sort(), ["BADGER_PASSWORD", "ocr_daily_state"]);
  assert.strictEqual(e.tabs["Parser State"].rows[1][1], "OLDREVIEW");
  assert.strictEqual(e.ctx.migrateLegacyParserSettings().migrated, 0, "safe to run twice");
});

t("daily OCR limit stops the run cleanly without an error per file", () => {
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), files: [pdf("S1", "scan1.pdf"), pdf("S2", "scan2.pdf")], texts: { S1: "", S2: "" },
    props: { ocr_daily_state: JSON.stringify({ date: "20261002", count: 60 }) } });
  const r = e.ctx.importInvoicePdfs();
  assert.match(r.stoppedReason, /Daily OCR limit reached/); assert.strictEqual(r.attempted, 0); assert.strictEqual(e.tabs["Import Errors"].rows.length, 1);
});

t("reset is refused in production and two-step in staging", () => {
  const p = makeEnv({ ssId: PROD_ID, sheets: prodSheets() });
  assert.throws(() => p.ctx.resetTestOutput(), /not available in the production/);
  p.ctx.onOpen(); assert.ok(!p.ctx.__menu.items.includes("resetTestOutput"));
  const s = makeEnv({ ssId: STAGE_ID, sheets: { "TEST - Invoices": [INV_H, ["x", "F", "f", "SS1"]] } });
  s.ctx.resetTestOutput(); assert.strictEqual(s.tabs["TEST - Invoices"].rows[1][3], "SS1", "first run only arms");
  s.ctx.resetTestOutput(); assert.strictEqual(s.tabs["TEST - Invoices"].rows[1][3], "", "second run clears");
});

t("daily automatic import: on installs exactly one 5:45 Central trigger, off removes it, staging refuses", () => {
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets() });
  e.ctx.turnOnDailyAutomaticImport(); e.ctx.turnOnDailyAutomaticImport();
  assert.strictEqual(e.triggers.length, 1, "turning on twice still leaves one trigger");
  const sp = e.triggers[0].spec;
  assert.strictEqual(JSON.stringify(sp), JSON.stringify({ handler: "scheduledInvoiceImport", tz: "America/Chicago", hour: 5, minute: 45, days: 1 }));
  e.ctx.showParserStatus(); assert.ok(/daily automatic import: ON/.test(e.toasts[e.toasts.length - 1]));
  e.ctx.turnOffAutomaticImport(); assert.strictEqual(e.triggers.length, 0);
  e.ctx.onOpen(); assert.ok(e.ctx.__menu.items.includes("turnOnDailyAutomaticImport"));
  const s = makeEnv({ ssId: STAGE_ID });
  assert.throws(() => s.ctx.turnOnDailyAutomaticImport(), /only for the production tracker/);
  s.ctx.onOpen(); assert.ok(!s.ctx.__menu.items.includes("turnOnDailyAutomaticImport"));
});

t("scheduled run with no active spreadsheet opens the production tracker and imports", () => {
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), noActive: true, files: [pdf("F9", "0165.pdf")], texts: { F9: invText("SS0165", "Acorn Ridge", [{ q: 6, d: "Gin" }]) } });
  const r = e.ctx.scheduledInvoiceImport();
  assert.strictEqual(r.environment, "PRODUCTION"); assert.strictEqual(r.imported, 1);
  assert.strictEqual(e.tabs["Invoices"].rows[1][3], "SS0165");
});

t("scheduled run refuses in staging", () => {
  const s = makeEnv({ ssId: STAGE_ID });
  assert.throws(() => s.ctx.scheduledInvoiceImport(), /not the production tracker/);
});

t("no Supabase code and no pop-up dialogs remain", () => {
  assert.ok(!/supabase\.co|UrlFetchApp\.fetch\([^)]*rest\/v1|masterSyncDistilleryMap\s*\(/i.test(SRC.replace(/^ \*.*$/gm, "")));
  assert.ok(!/\.alert\(|\.prompt\(/.test(SRC), "no getUi().alert/prompt");
});

console.log(`\n${passed} tests passed`);
