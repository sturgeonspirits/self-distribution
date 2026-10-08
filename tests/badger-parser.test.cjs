// Badger parser 2026.10.08.1 tests (2026-10-08, with both review rounds). Run: node tests/badger-parser.test.cjs — fakes SpreadsheetApp, Drive, ScriptApp, Badger, etc.
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
  s.getMaxRows = () => Math.max(s.rows.length, 1) + (s.spareRows || 0); s.getMaxColumns = () => Math.max(width(), 1);
  s.setFrozenRows = () => s; s.setFrozenColumns = () => s; s.autoResizeColumns = () => s;
  s.clear = () => { s.rows = []; s.cleared++; return s; };
  s.appendRow = r => { s.rows.push(r.slice()); };
  s.insertRowsAfter = (after, n) => { s.spareRows = (s.spareRows || 0) + n; return s; };
  s.deleteRows = (start, n) => { if (s.failDelete) throw new Error(`simulated delete failure on ${s.name}`); s.rows.splice(start - 1, n); };
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

function makeEnv({ ssId, sheets = {}, files = [], texts = {}, props = {}, noActive = false, badger = null }) {
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
    UrlFetchApp: { fetch: (url, opts) => { if (url.indexOf(BADGER_BASE) === 0) return fakeBadgerFetch(badger, url.slice(BADGER_BASE.length), opts || {}); const fileId = decodeURIComponent(url.split("/files/")[1].split("?")[0]); return { getResponseCode: () => 200, getBlob: () => ({ fileId, setName: () => {}, getContentType: () => "application/pdf" }) }; } },
    Utilities: { sleep: () => {}, formatDate: () => "20261002" },
    Session: { getScriptTimeZone: () => "America/Chicago" },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, tabs, toasts, propStore, trashed, triggers, badger };
}

// Fake Badger: list items + details by id. Records every request as "METHOD path".
const BADGER_BASE = "https://badgerstatecoop.com/BSWCSite";
function makeBadger(invoices, opts = {}) {
  return Object.assign({ invoices, details: {}, requests: [], logins: 0, pageSize: null, expireNext: false, countDrift: false }, opts);
}
function fakeBadgerFetch(b, path, opts) {
  if (!b) throw new Error("no fake Badger");
  const method = String(opts.method || "get").toUpperCase();
  b.requests.push(`${method} ${path}`);
  const res = (code, body, headers = {}) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body), getAllHeaders: () => headers });
  if (path === "/Login/Authenticate") {
    const creds = JSON.parse(opts.payload);
    if (creds.password !== "pw") return res(200, { isSuccess: false });
    b.logins++; return res(200, { isSuccess: true }, { "Set-Cookie": [`.AUTH=s${b.logins}; path=/; HttpOnly`] });
  }
  if (!/^\.AUTH=s\d+$/.test(opts.headers && opts.headers.Cookie || "")) return res(401, {});
  if (b.expireNext) { b.expireNext = false; return res(401, {}); }
  if (method === "POST" && path === "/Api/invoice/Paged") {
    const body = JSON.parse(opts.payload); const size = b.pageSize || body.pageSize;
    const total = b.invoices.length + (b.countDrift && body.page > 0 ? 1 : 0);
    return res(200, { data: { totalCount: total, data: b.invoices.slice(body.page * size, body.page * size + size) } });
  }
  const m = path.match(/^\/api\/invoice\/(\d+)$/);
  if (method === "GET" && m && b.details[m[1]]) return res(200, { data: b.details[m[1]] });
  return res(404, {});
}
// One Badger invoice: list item and detail.
function bInv(b, id, no, cust, lines, extra = {}) {
  const total = lines.reduce((s, l) => s + l.q * l.p, 0);
  const item = Object.assign({ id, number: no, customerId: 7, billToName: cust, date: "2026-09-16T00:00:00", dollarAmount: total, paidDate: null, isVoid: false, modifiedDate: "2026-09-16T10:00:00" }, extra);
  b.invoices.push(item);
  b.details[id] = { id, number: no, billToName: cust, billToAddressLine1: "1 Main St", billToCity: "Oshkosh", billToState: "WI", billToPostalCode: "54901", billToResellerNumber: "R-1", orderNumber: no.slice(2), date: item.date, totalDue: total,
    lines: lines.map(l => ({ quantity: l.q, description: l.d, unitPrice: l.p, unitOfMeasureId: l.u || 3, beverageClass: "Spirit", alcoholProof: 80 })) };
  return item;
}
const CREDS = { BADGER_USERNAME: "karl", BADGER_PASSWORD: "pw" };

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

/* -------------------- 2026.10.08.1 direct Badger import -------------------- */

const ALLOWED_BADGER = /^(POST \/Login\/Authenticate|POST \/Api\/invoice\/Paged|GET \/api\/invoice\/\d+)$/;
const lineRowsFor = (e, no, tab = "Invoice Lines") => e.tabs[tab].rows.slice(1).filter(r => r[0] === no);
const stateRows = (e, tab = "Parser State") => e.tabs[tab].rows.slice(1);

t("Badger import stops before any write or request when the login settings are missing", () => {
  const b = makeBadger([]); bInv(b, "101", "SS0170", "Wagner Market", [{ q: 6, d: "Blood Orange Gin", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: { BADGER_USERNAME: "karl" } });
  assert.throws(() => e.ctx.importFromBadger(), /BADGER_USERNAME and BADGER_PASSWORD/);
  assert.strictEqual(b.requests.length, 0); assert.strictEqual(e.tabs["Invoices"].rows.length, 1); assert.ok(!e.tabs["Parser State"]);
  assert.throws(() => e.ctx.compareWithBadger(), /BADGER_PASSWORD/);
  assert.throws(() => e.ctx.applyBadgerCorrections(), /BADGER_PASSWORD/);
  e.ctx.showParserStatus(); assert.match(e.toasts[e.toasts.length - 1], /Badger login settings: missing/);
  assert.ok(!/karl/.test(e.toasts.join(" ")), "never shows the username");
});

t("Badger import adds a new invoice (lines, row, Parser State with modifiedDate) and rebuilds the summaries", () => {
  const b = makeBadger([]); bInv(b, "101", "SS0170", "Wagner Market", [{ q: 12, d: "Blood Orange Gin", p: 22 }, { q: 6, d: "Limoncello", p: 12, u: 5 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  const r = e.ctx.importFromBadger();
  assert.strictEqual(r.environment, "PRODUCTION"); assert.strictEqual(r.imported, 1); assert.strictEqual(r.detailsRead, 1);
  const row = e.tabs["Invoices"].rows[1];
  assert.deepStrictEqual(row.slice(1, 14), ["badger:101", "Badger invoice SS0170", "SS0170", "9/16/2026", "Wagner Market", "1 Main St", "Oshkosh WI 54901", "R-1", "", "", "'0170", 336, ""]);
  assert.deepStrictEqual(row.slice(14), [false, false, "No"], "new row gets the default Delivered/Paid to Me/Submitted");
  assert.deepStrictEqual(lineRowsFor(e, "SS0170"), [["SS0170", "Wagner Market", 12, "750mL", "Blood Orange Gin", "Spirit", 22, 264], ["SS0170", "Wagner Market", 6, "375mL", "Limoncello", "Spirit", 12, 72]]);
  const st = stateRows(e)[0]; assert.strictEqual(st[1], "badger:101"); assert.strictEqual(st[3], "IMPORTED"); assert.match(st[5], /badgerModified=2026-09-16T10:00:00/);
  assert.deepStrictEqual(e.tabs["Monthly Units"].rows, [["Month", "Channel", "Product", "Size", "Units", "Dollars"], ["2026-09", "Wholesale (Badger)", "Blood Orange Gin", "750mL", 12, 264], ["2026-09", "Wholesale (Badger)", "Limoncello", "375mL", 6, 72]]);
  assert.ok(e.tabs["Monthly Summary"].cleared >= 1); assert.ok(e.tabs["Previous Month"].cleared >= 1);
  assert.ok(b.requests.every(q => ALLOWED_BADGER.test(q)), b.requests.join(", "));
  assert.ok(!b.requests.some(q => /^POST \/api\/invoice$/i.test(q)), "never creates an invoice");
  assert.strictEqual(JSON.stringify(e.tabs["Invoices"].checkboxes), JSON.stringify([[2, 15, 1, 2]]));
});

t("second Badger run changes nothing and reads no invoice details", () => {
  const b = makeBadger([]); bInv(b, "101", "SS0170", "Wagner Market", [{ q: 12, d: "Gin", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  e.ctx.importFromBadger(); b.requests.length = 0;
  const r = e.ctx.importFromBadger();
  assert.strictEqual(r.imported, 0); assert.strictEqual(r.unchanged, 1); assert.strictEqual(r.detailsRead, 0);
  assert.ok(!b.requests.some(q => q.startsWith("GET")));
  assert.strictEqual(e.tabs["Invoices"].rows.length, 2); assert.strictEqual(e.tabs["Invoice Lines"].rows.length, 2); assert.strictEqual(stateRows(e).length, 1);
});

t("an invoice changed in Badger is refreshed; Delivered, Paid to Me and Submitted are never written", () => {
  const b = makeBadger([]); const item = bInv(b, "101", "SS0170", "Wagner Market", [{ q: 12, d: "Gin", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  e.ctx.importFromBadger();
  const inv = e.tabs["Invoices"].rows; inv[1][14] = true; inv[1][15] = true; inv[1][16] = "Yes"; // staff marks
  item.modifiedDate = "2026-09-20T08:00:00"; item.dollarAmount = 198;
  b.details["101"].lines = [{ quantity: 9, description: "Gin", unitPrice: 22, unitOfMeasureId: 3, beverageClass: "Spirit" }]; b.details["101"].totalDue = 198;
  const r = e.ctx.importFromBadger();
  assert.strictEqual(r.updated, 1); assert.strictEqual(r.imported, 0);
  assert.strictEqual(inv.length, 2); assert.strictEqual(inv[1][12], 198);
  assert.deepStrictEqual(inv[1].slice(14), [true, true, "Yes"], "staff columns untouched");
  assert.deepStrictEqual(lineRowsFor(e, "SS0170").map(l => l[2]), [9], "lines replaced, not added");
  assert.strictEqual(stateRows(e)[1][3], "UPDATED"); assert.match(stateRows(e)[1][5], /badgerModified=2026-09-20T08:00:00/);
  assert.strictEqual(JSON.stringify(e.tabs["Invoices"].checkboxes), JSON.stringify([[2, 15, 1, 2]]), "no checkboxes re-applied to the existing row");
  assert.strictEqual(e.ctx.importFromBadger().unchanged, 1, "third run is quiet again");
});

t("a voided invoice loses its lines, Amount Due 0 and Terms VOID; a void never imported is only noted once", () => {
  const b = makeBadger([]); const item = bInv(b, "101", "SS0170", "Wagner Market", [{ q: 12, d: "Gin", p: 22 }]);
  bInv(b, "102", "SS0171", "Fox and Crow", [{ q: 1, d: "Gin", p: 22 }], { isVoid: true });
  bInv(b, "103", "SS0172", "Acorn Ridge", [{ q: 2, d: "Vodka", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  const r1 = e.ctx.importFromBadger(); assert.strictEqual(r1.imported, 2); assert.strictEqual(r1.voidSkipped, 1);
  assert.ok(!e.tabs["Invoices"].rows.some(r => r[3] === "SS0171"), "void invoice not imported");
  const inv = e.tabs["Invoices"].rows; inv[1][15] = true; inv[1][16] = "Yes";
  e.tabs["Invoice Lines"].rows.find(l => l[0] === "SS0172")[8] = "staff note";
  item.isVoid = true; item.modifiedDate = "2026-09-21T00:00:00";
  const r2 = e.ctx.importFromBadger(); assert.strictEqual(r2.voided, 1); assert.strictEqual(r2.voidSkipped, 0);
  assert.strictEqual(inv[1][12], 0); assert.strictEqual(inv[1][13], "VOID"); assert.strictEqual(inv[1][5], "Wagner Market");
  assert.deepStrictEqual(inv[1].slice(15), [true, "Yes"]);
  assert.strictEqual(lineRowsFor(e, "SS0170").length, 0); assert.strictEqual(lineRowsFor(e, "SS0172").length, 1, "other invoices' lines kept");
  assert.ok(!e.tabs["Invoice Lines"].spareRows, "no spare row needed while other rows remain");
  assert.strictEqual(lineRowsFor(e, "SS0172")[0][8], "staff note", "a note beside a kept line stays on its row");
  assert.ok(!e.tabs["Monthly Units"].rows.some(r => r[2] === "Gin"), "void invoice left Monthly Units");
  const r3 = e.ctx.importFromBadger(); assert.strictEqual(r3.voided + r3.voidSkipped + r3.imported + r3.updated, 0);
});

t("an invoice already in the tracker from a PDF is LINKED and left alone; Compare lists differences and writes nothing else", () => {
  const b = makeBadger([]);
  bInv(b, "201", "SS0163", "Fox and Crow", [{ q: 6, d: "Blood Orange Gin", p: 22 }]); // tracker has it with a wrong OCR amount
  bInv(b, "202", "SS0164", "Acorn Ridge", [{ q: 3, d: "Vodka", p: 22 }]);             // not in the tracker yet
  const sheets = prodSheets([["old", "PDFFILE", "0163.pdf", "SS0163", "9/16/2026", "Fox and Crow", "", "", "", "", "", "", 162, "", true, true, "Yes"],
                             ["old", "PDF2", "0099.pdf", "SS0099", "1/5/2026", "Gone Bar", "", "", "", "", "", "", 22, "", false, false, "No"]]);
  sheets["Invoice Lines"].push(["SS0163", "Fox and Crow", 6, "750mL", "Blood Orange Gin", "Spirits", 22, 132]);
  const e = makeEnv({ ssId: PROD_ID, sheets, badger: b, props: CREDS });
  const before = JSON.stringify([e.tabs["Invoices"].rows, e.tabs["Invoice Lines"].rows]);
  const c = e.ctx.compareWithBadger();
  assert.strictEqual(JSON.stringify([e.tabs["Invoices"].rows, e.tabs["Invoice Lines"].rows]), before, "Compare changes no tracker data");
  assert.ok(!e.tabs["Parser State"], "Compare writes no Parser State");
  const issues = e.tabs["Badger Compare"].rows.slice(1).map(r => `${r[1]}:${r[3]}`);
  assert.deepStrictEqual(issues, ["SS0163:Amount differs", "SS0164:Missing in tracker", "SS0099:Not in Badger"]);
  assert.strictEqual(c.correctable, 1);
  const r = e.ctx.importFromBadger(); assert.strictEqual(r.linked, 1); assert.strictEqual(r.imported, 1);
  assert.strictEqual(e.tabs["Invoices"].rows[1][12], 162, "linked row not changed by the import");
  assert.strictEqual(stateRows(e).find(s => s[1] === "badger:201")[3], "LINKED");
});

t("Apply Badger corrections fixes listed rows from Badger and never writes the staff columns", () => {
  const b = makeBadger([]);
  bInv(b, "201", "SS0163", "Fox and Crow", [{ q: 6, d: "Blood Orange Gin", p: 22 }, { q: 1, d: "Limoncello", p: 12, u: 5 }]);
  const sheets = prodSheets([["old", "PDFFILE", "0163.pdf", "SS0163", "9/16/2026", "Fox & Crow", "", "", "", "", "", "", 162, "", true, true, "Yes"]]);
  sheets["Invoice Lines"].push(["SS0163", "Fox & Crow", 6, "750mL", "Blood Orange Gin", "Spirits", 22, 132]);
  const e = makeEnv({ ssId: PROD_ID, sheets, badger: b, props: CREDS });
  assert.match(e.ctx.applyBadgerCorrections(), /Run Compare with Badger first/);
  e.ctx.compareWithBadger();
  assert.deepStrictEqual(e.tabs["Badger Compare"].rows.slice(1).map(r => r[3]), ["Amount differs", "Lines differ"], "an & spelling is not a customer difference");
  const r = e.ctx.applyBadgerCorrections(); assert.strictEqual(r.corrected, 1);
  const row = e.tabs["Invoices"].rows[1];
  assert.strictEqual(row[1], "PDFFILE", "the PDF file ID stays"); assert.strictEqual(row[12], 144); assert.strictEqual(row[5], "Fox and Crow");
  assert.deepStrictEqual(row.slice(14), [true, true, "Yes"]);
  assert.deepStrictEqual(lineRowsFor(e, "SS0163").map(l => [l[2], l[4]]), [[6, "Blood Orange Gin"], [1, "Limoncello"]]);
  assert.strictEqual(stateRows(e)[0][3], "CORRECTED");
  e.ctx.compareWithBadger(); assert.strictEqual(e.tabs["Badger Compare"].rows[1][3], "No differences");
  assert.ok(b.requests.every(q => ALLOWED_BADGER.test(q)));
});

t("interrupted Badger import (invoice write fails after lines) recovers without doubling lines", () => {
  const b = makeBadger([]); bInv(b, "101", "SS0170", "Wagner Market", [{ q: 6, d: "Gin", p: 22 }, { q: 6, d: "Cherry Vodka", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  e.tabs["Invoices"].failAppend = true;
  assert.throws(() => e.ctx.importFromBadger(), /simulated write failure/);
  assert.strictEqual(e.tabs["Invoice Lines"].rows.length, 3); assert.strictEqual(e.tabs["Invoices"].rows.length, 1);
  assert.strictEqual(stateRows(e).length, 0, "no Parser State row");
  e.tabs["Invoices"].failAppend = false;
  assert.strictEqual(e.ctx.importFromBadger().imported, 1);
  assert.strictEqual(e.tabs["Invoice Lines"].rows.length, 3, "lines not doubled"); assert.strictEqual(e.tabs["Invoices"].rows.length, 2);
});

t("a failed Parser State write is finished by the next run without a second invoice row, and the row still follows Badger", () => {
  const b = makeBadger([]); bInv(b, "101", "SS0170", "Wagner Market", [{ q: 6, d: "Gin", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: Object.assign(prodSheets(), { "Parser State": [["Updated At", "File Id", "File Name", "Status", "Invoice #", "Detail"]] }), badger: b, props: CREDS });
  e.tabs["Parser State"].failAppend = true;
  assert.throws(() => e.ctx.importFromBadger());
  e.tabs["Parser State"].failAppend = false;
  const r = e.ctx.importFromBadger(); assert.strictEqual(r.linked, 0); assert.strictEqual(r.imported, 0); assert.strictEqual(r.updated, 1);
  assert.strictEqual(stateRows(e).slice(-1)[0][3], "UPDATED", "its own row is recognised by badger:<id> and refreshed, so it keeps following Badger (not LINKED)");
  assert.strictEqual(e.tabs["Invoices"].rows.length, 2); assert.strictEqual(e.tabs["Invoice Lines"].rows.length, 2);
});

t("Badger import stops at MAX_RUN_MS, saves what it read, and the next run finishes", () => {
  const b = makeBadger([]); ["101", "102", "103"].forEach((id, i) => bInv(b, id, `SS017${i}`, "Store " + i, [{ q: 1, d: "Gin", p: 22 }]));
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  let clock = 0; vm.runInContext("Date.now = () => globalThis.__clock()", e.ctx); e.ctx.__clock = () => clock;
  const realFetch = e.ctx.UrlFetchApp.fetch; e.ctx.UrlFetchApp.fetch = (u, o) => { if (/\/api\/invoice\/\d+$/.test(u)) clock += 3 * 60 * 1000; return realFetch(u, o); };
  const r1 = e.ctx.importFromBadger();
  assert.strictEqual(r1.imported, 2); assert.match(r1.stoppedReason, /time limit/);
  assert.strictEqual(e.tabs["Invoices"].rows.length, 3);
  clock = 0; const r2 = e.ctx.importFromBadger(); clock = 0;
  assert.strictEqual(r2.imported, 1); assert.strictEqual(e.tabs["Invoices"].rows.length, 4); assert.strictEqual(e.tabs["Invoice Lines"].rows.length, 4);
});

t("Badger list paging reads every page; a count change mid-read writes nothing", () => {
  const b = makeBadger([], { pageSize: 2 }); ["101", "102", "103"].forEach((id, i) => bInv(b, id, `SS018${i}`, "S" + i, [{ q: 1, d: "Gin", p: 22 }]));
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  assert.strictEqual(e.ctx.importFromBadger().imported, 3);
  assert.strictEqual(b.requests.filter(q => q === "POST /Api/invoice/Paged").length, 2);
  const b2 = makeBadger([], { pageSize: 2, countDrift: true }); ["101", "102", "103"].forEach((id, i) => bInv(b2, id, `SS018${i}`, "S" + i, [{ q: 1, d: "Gin", p: 22 }]));
  const e2 = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b2, props: CREDS });
  assert.throws(() => e2.ctx.importFromBadger(), /count changed/);
  assert.strictEqual(e2.tabs["Invoices"].rows.length, 1); assert.strictEqual(e2.tabs["Invoice Lines"].rows.length, 1);
});

t("an expired Badger session logs in again once; a rejected login stops the run", () => {
  const b = makeBadger([], { expireNext: true }); bInv(b, "101", "SS0170", "W", [{ q: 1, d: "Gin", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  assert.strictEqual(e.ctx.importFromBadger().imported, 1); assert.strictEqual(b.logins, 2);
  const b2 = makeBadger([]); const e2 = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b2, props: { BADGER_USERNAME: "karl", BADGER_PASSWORD: "wrong" } });
  assert.throws(() => e2.ctx.importFromBadger(), /login was rejected/);
});

t("the parser can only read Badger (allow-list)", () => {
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets() });
  assert.match(e.ctx.badgerParserUrl_("GET", "/api/invoice/123"), /\/api\/invoice\/123$/);
  ["POST /api/invoice", "GET /api/customer/5", "GET /api/invoice/validateforcreate?number=0170&date=2026-10-08", "PUT /api/invoice/123", "DELETE /api/invoice/123", "POST /Api/Invoice/Paged/orderorinvoicenumber"]
    .forEach(q => { const [m, p] = q.split(" "); assert.throws(() => e.ctx.badgerParserUrl_(m, p), /not allowed/, q); });
  assert.ok(!/BADGER_PASSWORD\s*[:=]\s*["']/.test(SRC), "no password in the code");
});

t("staging Badger import writes only TEST tabs", () => {
  const b = makeBadger([]); bInv(b, "101", "SS0170", "Wagner Market", [{ q: 6, d: "Gin", p: 22 }]);
  const e = makeEnv({ ssId: STAGE_ID, badger: b, props: CREDS });
  const r = e.ctx.importFromBadger(); assert.strictEqual(r.environment, "STAGING"); assert.strictEqual(r.imported, 1);
  assert.strictEqual(e.tabs["TEST - Invoices"].rows[1][3], "SS0170"); assert.ok(e.tabs["TEST - Monthly Units"]);
  assert.ok(Object.keys(e.tabs).every(n => n.startsWith("TEST - ")), Object.keys(e.tabs).join(", "));
});

t("daily source defaults to PDF, can switch to Badger (production only), and shows in Parser Status", () => {
  const b = makeBadger([]); bInv(b, "101", "SS0170", "Wagner Market", [{ q: 6, d: "Gin", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), noActive: false, badger: b, props: CREDS, files: [pdf("F9", "0165.pdf")], texts: { F9: invText("SS0165", "Acorn Ridge", [{ q: 6, d: "Gin" }]) } });
  e.ctx.showParserStatus(); assert.match(e.toasts[e.toasts.length - 1], /daily source: PDF/); assert.match(e.toasts[e.toasts.length - 1], /Badger login settings: present/);
  const r1 = e.ctx.scheduledInvoiceImport(); assert.strictEqual(r1.imported, 1); assert.strictEqual(r1.source, undefined, "PDF import by default"); assert.strictEqual(b.requests.length, 0);
  e.ctx.useBadgerForDailyImport(); e.ctx.showParserStatus(); assert.match(e.toasts[e.toasts.length - 1], /daily source: Badger/);
  const r2 = e.ctx.scheduledInvoiceImport(); assert.strictEqual(r2.source, "BADGER"); assert.strictEqual(r2.imported, 1);
  assert.strictEqual(e.tabs["Invoices"].rows.length, 3);
  e.ctx.usePdfForDailyImport(); assert.strictEqual(e.propStore.PARSER_DAILY_SOURCE, "PDF");
  const s = makeEnv({ ssId: STAGE_ID }); assert.throws(() => s.ctx.useBadgerForDailyImport(), /only for the production tracker/);
});

t("menu offers the Badger import, Compare, Apply, PDF fallback and daily source items", () => {
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets() }); e.ctx.onOpen();
  ["importFromBadger", "compareWithBadger", "applyBadgerCorrections", "importInvoicePdfs", "rebuildMonthlyUnits", "useBadgerForDailyImport", "usePdfForDailyImport", "showParserStatus"]
    .forEach(fn => assert.ok(e.ctx.__menu.items.includes(fn), fn));
  assert.strictEqual(e.ctx.__menu.items[0], "importFromBadger");
  const s = makeEnv({ ssId: STAGE_ID }); s.ctx.onOpen(); assert.ok(!s.ctx.__menu.items.includes("useBadgerForDailyImport"));
  assert.match(SRC, /const BADGER_PARSER_VERSION = "2026\.10\.08\.1";/);
});

/* -------------------- 2026.10.08.1 review fixes -------------------- */

const withClock = (e, msPerDetail) => {
  let clock = 0; vm.runInContext("Date.now = () => globalThis.__clock()", e.ctx); e.ctx.__clock = () => clock;
  const realFetch = e.ctx.UrlFetchApp.fetch;
  e.ctx.UrlFetchApp.fetch = (u, o) => { if (/\/api\/invoice\/\d+$/.test(u)) clock += msPerDetail; return realFetch(u, o); };
  return { reset: () => { clock = 0; } };
};
const pdfRow = (no, cust, amount, extra = {}) => Object.assign(["old", "PDF" + no, no + ".pdf", no, "9/16/2026", cust, "", "", "", "", "", "", amount, "", true, true, "Yes"], extra);

t("review 1.1: a row moved during the run is found again by invoice number, so another invoice's staff columns are never touched", () => {
  const b = makeBadger([]);
  bInv(b, "101", "SS0170", "First", [{ q: 1, d: "Gin", p: 22 }]);
  const second = bInv(b, "102", "SS0171", "Second", [{ q: 1, d: "Gin", p: 22 }]);
  bInv(b, "103", "SS0172", "Third", [{ q: 1, d: "Gin", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  e.ctx.importFromBadger();
  const inv = e.tabs["Invoices"].rows; inv[3][15] = true; inv[3][16] = "Yes"; // SS0172 paid + submitted
  second.modifiedDate = "2026-09-22T00:00:00"; second.dollarAmount = 44; b.details["102"].lines[0].quantity = 2;
  const realFetch = e.ctx.UrlFetchApp.fetch; let done = false;
  e.ctx.UrlFetchApp.fetch = (u, o) => { if (!done && /\/api\/invoice\/102$/.test(u)) { done = true; inv.splice(1, 1); } return realFetch(u, o); };
  assert.strictEqual(e.ctx.importFromBadger().updated, 1);
  assert.deepStrictEqual(inv.slice(1).map(r => [r[3], r[12], r[15], r[16]]), [["SS0171", 44, false, "No"], ["SS0172", 22, true, "Yes"]]);
});

t("review 1.1: an invoice whose row was deleted during the run is left for the next run (no Parser State row)", () => {
  const b = makeBadger([]); const item = bInv(b, "101", "SS0170", "First", [{ q: 1, d: "Gin", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  e.ctx.importFromBadger(); const stateBefore = stateRows(e).length;
  item.modifiedDate = "2026-09-22T00:00:00";
  const realFetch = e.ctx.UrlFetchApp.fetch;
  e.ctx.UrlFetchApp.fetch = (u, o) => { if (/\/api\/invoice\/101$/.test(u)) e.tabs["Invoices"].rows.splice(1, 1); return realFetch(u, o); };
  const r = e.ctx.importFromBadger(); assert.strictEqual(r.deferred, 1);
  assert.strictEqual(stateRows(e).length, stateBefore, "nothing recorded"); assert.strictEqual(lineRowsFor(e, "SS0170").length, 1, "its lines untouched");
  e.ctx.UrlFetchApp.fetch = realFetch;
  assert.strictEqual(e.ctx.importFromBadger().imported, 1, "next run re-imports the deleted row");
  assert.strictEqual(lineRowsFor(e, "SS0170").length, 1, "without doubling its lines");
});

t("review 1.2: a void record and its active re-issue under one number import the active one, and never void it", () => {
  const b = makeBadger([]);
  bInv(b, "301", "SS0200", "Wagner Market", [{ q: 6, d: "Gin", p: 22 }], { isVoid: true });
  bInv(b, "302", "SS0200", "Wagner Market", [{ q: 12, d: "Gin", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  const r = e.ctx.importFromBadger(); assert.strictEqual(r.imported, 1); assert.strictEqual(r.voidSkipped, 0); assert.strictEqual(r.duplicateNumbers, 0);
  assert.strictEqual(e.tabs["Invoices"].rows[1][1], "badger:302"); assert.strictEqual(e.tabs["Invoices"].rows[1][12], 264);
  e.tabs["Invoices"].rows[1][15] = true;
  b.invoices.reverse(); // order must not matter
  const r2 = e.ctx.importFromBadger(); assert.strictEqual(r2.voided, 0); assert.strictEqual(r2.unchanged, 1);
  assert.deepStrictEqual([e.tabs["Invoices"].rows[1][12], e.tabs["Invoices"].rows[1][13], lineRowsFor(e, "SS0200").length], [264, "", 1]);
});

t("review 1.2: two active records under one number are left alone and logged once", () => {
  const b = makeBadger([]);
  bInv(b, "301", "SS0200", "A", [{ q: 1, d: "Gin", p: 22 }]); bInv(b, "302", "SS0200", "B", [{ q: 2, d: "Gin", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  const r = e.ctx.importFromBadger(); assert.strictEqual(r.duplicateNumbers, 1); assert.strictEqual(r.imported, 0);
  const errs = e.tabs["Import Errors"].rows.length;
  assert.strictEqual(errs, 3, "one Import Errors row per Badger record");
  e.ctx.importFromBadger(); e.ctx.importFromBadger();
  assert.strictEqual(e.tabs["Import Errors"].rows.length, errs, "not logged again on later runs");
  assert.strictEqual(e.tabs["Invoices"].rows.length, 1);
  assert.ok(e.toasts.some(m => /more than one active Badger invoice/.test(m)));
});

t("review 1.3: lines are removed by deleting rows; a stop between delete and append is finished without duplicates", () => {
  const b = makeBadger([]);
  const a = bInv(b, "101", "SS0170", "A", [{ q: 1, d: "Gin", p: 22 }, { q: 2, d: "Vodka", p: 22 }]);
  bInv(b, "102", "SS0171", "B", [{ q: 3, d: "Rum", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  e.ctx.importFromBadger();
  a.modifiedDate = "2026-09-21T00:00:00"; a.dollarAmount = 22; b.details["101"].lines = [{ quantity: 1, description: "Gin", unitPrice: 22, unitOfMeasureId: 3 }];
  e.tabs["Invoice Lines"].failAppend = true;
  assert.throws(() => e.ctx.importFromBadger(), /simulated write failure/);
  assert.deepStrictEqual(e.tabs["Invoice Lines"].rows.slice(1).map(r => `${r[0]}:${r[4]}`), ["SS0171:Rum"], "old lines deleted, nothing else touched");
  e.tabs["Invoice Lines"].failAppend = false;
  assert.strictEqual(e.ctx.importFromBadger().updated, 1);
  assert.deepStrictEqual(e.tabs["Invoice Lines"].rows.slice(1).map(r => `${r[0]}:${r[4]}:${r[2]}`), ["SS0171:Rum:3", "SS0170:Gin:1"]);
  assert.deepStrictEqual(e.tabs["Monthly Units"].rows.slice(1).map(r => `${r[2]}=${r[4]}`), ["Gin=1", "Rum=3"]);
});

t("review 1.4: Amount Due comes from the list amount; null fields never become 0; lines that do not add up are refused", () => {
  const b = makeBadger([]); bInv(b, "101", "SS0170", "Wagner Market", [{ q: 6, d: "Gin", p: 22 }]);
  b.details["101"].totalDue = null; b.details["101"].lines[0].lineTotal = null;
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  e.ctx.importFromBadger();
  assert.strictEqual(e.tabs["Invoices"].rows[1][12], 132); assert.strictEqual(lineRowsFor(e, "SS0170")[0][7], 132);

  const b2 = makeBadger([]); bInv(b2, "201", "SS0163", "Fox and Crow", [{ q: 6, d: "Gin", p: 22 }], { paidDate: "2026-09-30T00:00:00" });
  b2.details["201"].totalDue = 0; // an unpaid balance would be 0 once paid
  const sheets = prodSheets([pdfRow("SS0163", "Fox and Crow", 132)]);
  sheets["Invoice Lines"].push(["SS0163", "Fox and Crow", 6, "750mL", "Gin", "Spirits", 22, 132]);
  const e2 = makeEnv({ ssId: PROD_ID, sheets, badger: b2, props: CREDS });
  e2.ctx.compareWithBadger(); assert.strictEqual(e2.tabs["Badger Compare"].rows[1][3], "No differences");

  const b3 = makeBadger([]); bInv(b3, "101", "SS0170", "Wagner Market", [{ q: 6, d: "Gin", p: 22 }]);
  b3.invoices[0].dollarAmount = 150; // list amount and lines disagree
  const e3 = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b3, props: CREDS });
  const r = e3.ctx.importFromBadger(); assert.strictEqual(r.failed, 1); assert.strictEqual(r.imported, 0);
  assert.strictEqual(e3.tabs["Invoices"].rows.length, 1); assert.strictEqual(e3.tabs["Invoice Lines"].rows.length, 1);
  assert.match(e3.tabs["Import Errors"].rows[1][4], /add up to \$132\.00 but its amount is \$150\.00/);
});

t("review 1.5: the key is the list number; a different detail number is refused, a leading-zero form is accepted", () => {
  const b = makeBadger([]); bInv(b, "101", "SS0170", "Wagner Market", [{ q: 6, d: "Gin", p: 22 }]);
  b.details["101"].number = "0170";
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  assert.deepStrictEqual([e.ctx.importFromBadger().imported, e.ctx.importFromBadger().imported, e.ctx.importFromBadger().imported], [1, 0, 0]);
  assert.deepStrictEqual(e.tabs["Invoices"].rows.slice(1).map(r => r[3]), ["SS0170"]);
  const b2 = makeBadger([]); bInv(b2, "101", "SS0170", "Wagner Market", [{ q: 6, d: "Gin", p: 22 }]); b2.details["101"].number = "SS0171";
  const e2 = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b2, props: CREDS });
  assert.strictEqual(e2.ctx.importFromBadger().failed, 1); assert.strictEqual(e2.tabs["Invoices"].rows.length, 1);
});

t("review 2.1: the import never changes a LINKED (PDF) row, even when Badger changes or staff type VOID", () => {
  const b = makeBadger([]); const item = bInv(b, "201", "SS0163", "Fox and Crow LLC", [{ q: 6, d: "Blood Orange Gin", p: 22 }]);
  const original = ["old", "PDFFILE", "0163.pdf", "SS0163", "9/16/2026", "Fox & Crow", "12 Oak St", "Oshkosh WI 54901", "R-9", "Sturgeon Spirits", "920-555-0100", "0163", 162, "Net 30", true, true, "Yes"];
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets([original]), badger: b, props: CREDS });
  assert.strictEqual(e.ctx.importFromBadger().linked, 1);
  item.modifiedDate = "2026-10-01T00:00:00"; item.paidDate = "2026-10-01T00:00:00";
  const r = e.ctx.importFromBadger(); assert.strictEqual(r.updated, 0); assert.strictEqual(r.linkedChanged, 1);
  assert.match(e.toasts[e.toasts.length - 1], /run Compare with Badger/);
  assert.deepStrictEqual(e.tabs["Invoices"].rows[1], original);
  e.tabs["Invoices"].rows[1][13] = "VOID"; e.ctx.importFromBadger();
  assert.strictEqual(e.tabs["Invoices"].rows[1][13], "VOID", "typed VOID kept");
});

t("review 2.1: refresh and Apply never blank a filled cell or touch Winery Name / Terms; corrected rows then follow Badger", () => {
  const b = makeBadger([]); const item = bInv(b, "201", "SS0163", "Fox and Crow LLC", [{ q: 6, d: "Blood Orange Gin", p: 22 }]);
  ["billToAddressLine1", "billToCity", "billToState", "billToPostalCode"].forEach(k => { b.details["201"][k] = undefined; });
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets([["old", "PDFFILE", "0163.pdf", "SS0163", "9/16/2026", "Fox & Crow", "12 Oak St", "Oshkosh WI 54901", "R-9", "Sturgeon Spirits", "920-555-0100", "0163", 162, "Net 30", true, true, "Yes"]]), badger: b, props: CREDS });
  e.ctx.importFromBadger(); e.ctx.compareWithBadger(); e.ctx.applyBadgerCorrections();
  assert.deepStrictEqual(e.tabs["Invoices"].rows[1].slice(3), ["SS0163", "9/16/2026", "Fox and Crow LLC", "12 Oak St", "Oshkosh WI 54901", "R-1", "Sturgeon Spirits", "920-555-0100", "'0163", 132, "Net 30", true, true, "Yes"]);
  assert.strictEqual(e.tabs["Invoices"].rows[1][0], "old", "Processed At not rewritten");
  item.modifiedDate = "2026-10-02T00:00:00"; item.dollarAmount = 154; b.details["201"].lines[0].quantity = 7;
  assert.strictEqual(e.ctx.importFromBadger().updated, 1, "a CORRECTED row follows Badger from then on");
  assert.strictEqual(e.tabs["Invoices"].rows[1][12], 154);
});

t("review 2.2: Apply stopped by the time limit finishes on the next run; Compare continues where it stopped", () => {
  const b = makeBadger([]); const extra = [];
  ["401", "402", "403", "404"].forEach((id, i) => { bInv(b, id, `SS030${i}`, "Store " + i, [{ q: 2, d: "Gin", p: 22 }]); extra.push(pdfRow(`SS030${i}`, "Store " + i, 1)); });
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(extra), badger: b, props: CREDS });
  const clock = withClock(e, 3 * 60 * 1000);
  const c1 = e.ctx.compareWithBadger(); assert.strictEqual(c1.checked, 2); assert.strictEqual(c1.notChecked, 2);
  clock.reset(); const c2 = e.ctx.compareWithBadger(); assert.strictEqual(c2.continued, true); assert.strictEqual(c2.checked, 2); assert.strictEqual(c2.notChecked, 0);
  assert.deepStrictEqual(e.tabs["Badger Compare"].rows.slice(1).filter(r => r[3] === "Amount differs").map(r => r[1]), ["SS0300", "SS0301", "SS0302", "SS0303"]);
  const runs = [];
  for (let i = 0; i < 3; i++) { clock.reset(); const r = e.ctx.applyBadgerCorrections(); runs.push(`${r.corrected}/${r.alreadyDone}`); }
  assert.deepStrictEqual(runs, ["2/0", "2/2", "0/4"]);
  assert.deepStrictEqual(e.tabs["Invoices"].rows.slice(1).map(r => r[12]), [44, 44, 44, 44]);
});

t("review 2.3: Compare and Apply use one Badger record per invoice number", () => {
  const b = makeBadger([]);
  bInv(b, "302", "SS0200", "Wagner Market", [{ q: 12, d: "Gin", p: 22 }]);
  bInv(b, "301", "SS0200", "Wagner Market", [{ q: 6, d: "Gin", p: 22 }], { isVoid: true });
  const sheets = prodSheets([pdfRow("SS0200", "Wagner Market", 250)]);
  sheets["Invoice Lines"].push(["SS0200", "Wagner Market", 12, "750mL", "Gin", "Spirits", 22, 250]);
  const e = makeEnv({ ssId: PROD_ID, sheets, badger: b, props: CREDS });
  e.ctx.compareWithBadger();
  assert.deepStrictEqual(e.tabs["Badger Compare"].rows.slice(1).map(r => `${r[2]}:${r[3]}`), ["302:Amount differs", "302:Lines differ"]);
  const r = e.ctx.applyBadgerCorrections(); assert.strictEqual(r.corrected, 1); assert.strictEqual(r.voided, 0);
  const row = e.tabs["Invoices"].rows[1];
  assert.deepStrictEqual([row[12], row[13], lineRowsFor(e, "SS0200").length], [264, "", 1]);
});

t("review 2.5: a modifiedDate with spaces reads back exactly, so the invoice is not re-read every run", () => {
  const b = makeBadger([]); bInv(b, "101", "SS0170", "Wagner Market", [{ q: 6, d: "Gin", p: 22 }], { modifiedDate: "9/16/2026 10:00:00 AM" });
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  const rs = [e.ctx.importFromBadger(), e.ctx.importFromBadger(), e.ctx.importFromBadger()];
  assert.deepStrictEqual(rs.map(r => `${r.imported}/${r.updated}/${r.unchanged}/${r.detailsRead}`), ["1/0/0/1", "0/0/1/0", "0/0/1/0"]);
  assert.strictEqual(stateRows(e).length, 1);
});

t("review: voiding the only invoice keeps a spare row, since Sheets cannot delete every non-frozen row", () => {
  const b = makeBadger([]); const item = bInv(b, "101", "SS0170", "A", [{ q: 1, d: "Gin", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  e.ctx.importFromBadger(); const lines = e.tabs["Invoice Lines"];
  const realDelete = lines.deleteRows; lines.deleteRows = (start, n) => { assert.ok(lines.getMaxRows() - n >= 2, "would delete the last non-frozen row"); realDelete(start, n); };
  item.isVoid = true; item.modifiedDate = "2026-09-21T00:00:00";
  assert.strictEqual(e.ctx.importFromBadger().voided, 1); assert.strictEqual(lines.spareRows, 1); assert.strictEqual(lineRowsFor(e, "SS0170").length, 0);
});

t("review 3.2: a list page returned twice (repeated IDs) stops the run before any write", () => {
  const b = makeBadger([], { pageSize: 2 }); ["101", "102", "103", "104"].forEach((id, i) => bInv(b, id, `SS018${i}`, "S" + i, [{ q: 1, d: "Gin", p: 22 }]));
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  const realFetch = e.ctx.UrlFetchApp.fetch;
  e.ctx.UrlFetchApp.fetch = (u, o) => { if (/Paged$/.test(u)) { const body = JSON.parse(o.payload); body.page = 0; o = Object.assign({}, o, { payload: JSON.stringify(body) }); } return realFetch(u, o); };
  assert.throws(() => e.ctx.importFromBadger(), /same invoice twice/);
  assert.strictEqual(e.tabs["Invoices"].rows.length, 1);
});

t("review 3.3/3.4: the unit ID wins over a name field; an unreadable invoice is logged once per Badger version", () => {
  const b = makeBadger([]); bInv(b, "101", "SS0170", "W", [{ q: 1, d: "Gin", p: 22 }]); b.details["101"].lines[0].volume = "bottle";
  bInv(b, "102", "SS0171", "X", [{ q: 1, d: "Gin", p: 22 }]); delete b.details["102"];
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  assert.strictEqual(e.ctx.importFromBadger().failed, 1); e.ctx.importFromBadger(); e.ctx.importFromBadger();
  assert.strictEqual(lineRowsFor(e, "SS0170")[0][3], "750mL");
  assert.strictEqual(e.tabs["Import Errors"].rows.length, 2, "one error row, not one per run");
  bInv(b, "102", "SS0171", "X", [{ q: 1, d: "Gin", p: 22 }]); b.invoices.pop();
  assert.strictEqual(e.ctx.importFromBadger().imported, 1, "retried and imported once readable");
});

t("review 3.5: a row with Terms VOID is left out of Monthly Summary, Previous Month and Monthly Units alike", () => {
  const sheets = prodSheets([pdfRow("SS0001", "A", 22), pdfRow("SS0002", "B", 44, { 13: "VOID" })]);
  sheets["Invoice Lines"].push(["SS0001", "A", 1, "750mL", "Gin", "Spirits", 22, 22], ["SS0002", "B", 2, "750mL", "Gin", "Spirits", 22, 44]);
  const e = makeEnv({ ssId: PROD_ID, sheets });
  e.ctx.rebuildMonthlySummary(); e.ctx.rebuildMonthlyUnits();
  const total = e.tabs["Monthly Summary"].rows.find(r => r[0] === "TOTAL (Products)");
  assert.deepStrictEqual(total.slice(1, 3), [1, 22]);
  assert.deepStrictEqual(e.tabs["Monthly Units"].rows.slice(1).map(r => r[4]), [1]);
});

t("review: Check Badger fields is read-only and writes nothing to any sheet", () => {
  const b = makeBadger([]); bInv(b, "101", "SS0170", "W", [{ q: 1, d: "Gin", p: 22 }]); bInv(b, "102", "SS0171", "X", [{ q: 1, d: "Gin", p: 22 }], { isVoid: true });
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  const before = JSON.stringify(Object.keys(e.tabs).map(n => e.tabs[n].rows));
  const r = e.ctx.checkBadgerFields();
  assert.strictEqual(r.samples.length, 2); assert.strictEqual(r.samples[0].detailNumber, "SS0170");
  assert.strictEqual(JSON.stringify(Object.keys(e.tabs).map(n => e.tabs[n].rows)), before);
  assert.ok(b.requests.every(q => ALLOWED_BADGER.test(q)));
});

/* -------------------- 2026.10.08.1 second review -------------------- */

t("review2 A: an imported invoice voided and re-issued under the same number follows the re-issued record", () => {
  const b = makeBadger([]); const first = bInv(b, "301", "SS0200", "Wagner Market", [{ q: 6, d: "Gin", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  e.ctx.importFromBadger(); e.tabs["Invoices"].rows[1][15] = true;
  first.isVoid = true; first.modifiedDate = "2026-09-20T00:00:00";
  const re = bInv(b, "302", "SS0200", "Wagner Market", [{ q: 12, d: "Gin", p: 22 }], { modifiedDate: "2026-09-20T00:05:00" });
  const r1 = e.ctx.importFromBadger(); assert.strictEqual(r1.updated, 1); assert.strictEqual(r1.linked, 0);
  const row = e.tabs["Invoices"].rows[1];
  assert.deepStrictEqual([row[1], row[2], row[12], row[15]], ["badger:302", "Badger invoice SS0200", 264, true]);
  assert.strictEqual(e.ctx.importFromBadger().unchanged, 1);
  re.modifiedDate = "2026-09-25T00:00:00"; re.dollarAmount = 286; b.details["302"].lines[0].quantity = 13;
  assert.strictEqual(e.ctx.importFromBadger().updated, 1);
  assert.deepStrictEqual([row[12], lineRowsFor(e, "SS0200").map(l => l[2])], [286, [13]]);
});

t("review2 B: a void or un-void in Badger is applied even when modifiedDate does not change; a typed VOID is kept", () => {
  const b = makeBadger([]); const item = bInv(b, "101", "SS0170", "Wagner Market", [{ q: 6, d: "Gin", p: 22 }]);
  bInv(b, "102", "SS0171", "Other", [{ q: 1, d: "Gin", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  e.ctx.importFromBadger();
  item.isVoid = true;
  assert.strictEqual(e.ctx.importFromBadger().voided, 1);
  assert.deepStrictEqual([e.tabs["Invoices"].rows[1][12], e.tabs["Invoices"].rows[1][13], lineRowsFor(e, "SS0170").length], [0, "VOID", 0]);
  assert.strictEqual(e.ctx.importFromBadger().voided, 0, "not repeated");
  item.isVoid = false;
  assert.strictEqual(e.ctx.importFromBadger().updated, 1);
  assert.deepStrictEqual([e.tabs["Invoices"].rows[1][12], e.tabs["Invoices"].rows[1][13], lineRowsFor(e, "SS0170").length], [132, "", 1]);
  e.tabs["Invoices"].rows[2][13] = "VOID"; // staff typed VOID on an active invoice
  e.ctx.importFromBadger(); assert.strictEqual(e.tabs["Invoices"].rows[2][13], "VOID");
});

t("review2 C: a LINKED invoice's Badger change or void is logged once to Import Errors and not repeated in later toasts", () => {
  const b = makeBadger([]); const item = bInv(b, "201", "SS0163", "Fox and Crow", [{ q: 6, d: "Gin", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets([pdfRow("SS0163", "Fox and Crow", 132)]), badger: b, props: CREDS });
  e.ctx.importFromBadger();
  item.modifiedDate = "2026-10-01T00:00:00"; item.paidDate = "2026-10-01T00:00:00";
  assert.strictEqual(e.ctx.importFromBadger().linkedChanged, 1);
  assert.match(e.tabs["Import Errors"].rows[1][4], /came from a PDF and changed in Badger/);
  assert.strictEqual(e.ctx.importFromBadger().linkedChanged, 0); assert.ok(!/came from PDFs/.test(e.toasts[e.toasts.length - 1]));
  item.isVoid = true; // same modifiedDate
  assert.strictEqual(e.ctx.importFromBadger().linkedChanged, 1);
  assert.match(e.tabs["Import Errors"].rows[2][4], /now VOID in Badger.*still in the tracker/);
  assert.strictEqual(e.tabs["Invoices"].rows[1][12], 132, "the LINKED row itself is not changed");
  e.ctx.importFromBadger(); assert.strictEqual(e.tabs["Import Errors"].rows.length, 3, "each logged once");
});

t("review2 D: Check Badger fields shows the raw field names even when the lines are under another key, and checks recent totals", () => {
  const b = makeBadger([]); bInv(b, "101", "SS0170", "W", [{ q: 1, d: "Gin", p: 22 }]); bInv(b, "102", "SS0171", "X", [{ q: 2, d: "Gin", p: 22 }]);
  b.invoices[1].dollarAmount = 40;
  const d = b.details["101"]; d.invoiceLines = d.lines; delete d.lines;
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  const r = e.ctx.checkBadgerFields();
  assert.strictEqual(JSON.stringify(r.samples[0].detailArrayFields), JSON.stringify(["invoiceLines"])); assert.ok(r.samples[0].lineFields.includes("unitPrice"));
  assert.strictEqual(r.samples[0].paidDate, null); assert.strictEqual(r.samples[0].isVoid, false);
  assert.strictEqual(r.addUp.checked, 2); assert.strictEqual(r.addUp.matching, 1); assert.strictEqual(r.addUp.notMatching[0].number, "SS0171");
});

t("review2 E: a void writes only Amount Due and Terms; a refresh leaves an unplanned cell (Winery Name) untouched", () => {
  const b = makeBadger([]); const item = bInv(b, "101", "SS0170", "Wagner Market", [{ q: 6, d: "Gin", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  e.ctx.importFromBadger(); e.tabs["Invoices"].rows[1][9] = "=WINERY()";
  const sheet = e.tabs["Invoices"]; const real = sheet.getRange; const writes = [];
  sheet.getRange = (r, c, nr = 1, nc = 1) => { const rng = real(r, c, nr, nc); const sv = rng.setValues; rng.setValues = v => { writes.push(`${c}-${c + nc - 1}`); return sv(v); }; return rng; };
  item.isVoid = true; e.ctx.importFromBadger();
  assert.deepStrictEqual(writes, ["13-14"]);
  item.isVoid = false; item.modifiedDate = "2026-09-30T00:00:00"; writes.length = 0; e.ctx.importFromBadger();
  assert.ok(writes.every(w => !/^(1|2|3|10|15|16|17)-|-(10)$/.test(w) && w !== "10-10"), writes.join(" "));
  assert.strictEqual(e.tabs["Invoices"].rows[1][9], "=WINERY()");
});

t("review2 F: a continued Compare redoes the list-only checks; a stopped Compare older than an hour starts fresh", () => {
  const b = makeBadger([]); const extra = [];
  ["401", "402", "403"].forEach((id, i) => { bInv(b, id, `SS030${i}`, "Store " + i, [{ q: 2, d: "Gin", p: 22 }]); extra.push(pdfRow(`SS030${i}`, "Store " + i, 1)); });
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(extra), badger: b, props: CREDS });
  const clock = withClock(e, 3 * 60 * 1000);
  assert.strictEqual(e.ctx.compareWithBadger().notChecked, 1);
  bInv(b, "405", "SS0309", "New Store", [{ q: 1, d: "Gin", p: 22 }]);
  clock.reset(); const c2 = e.ctx.compareWithBadger(); assert.strictEqual(c2.continued, true); assert.strictEqual(c2.checked, 1);
  assert.ok(e.tabs["Badger Compare"].rows.some(r => r[1] === "SS0309" && r[3] === "Missing in tracker"));
  // A stopped run from yesterday is not continued.
  const tab = e.tabs["Badger Compare"]; tab.rows[1][3] = "Not checked (time limit)"; tab.rows.slice(1).forEach(r => { r[0] = new Date(Date.UTC(2020, 0, 1)); });
  clock.reset(); const c3 = e.ctx.compareWithBadger(); assert.strictEqual(c3.continued, false);
});

t("review2 G: Apply records a void as VOIDED, so a later un-void in Badger clears Terms", () => {
  const b = makeBadger([]); const item = bInv(b, "201", "SS0163", "Fox and Crow", [{ q: 6, d: "Gin", p: 22 }], { isVoid: true });
  const sheets = prodSheets([pdfRow("SS0163", "Fox and Crow", 132)]);
  sheets["Invoice Lines"].push(["SS0163", "Fox and Crow", 6, "750mL", "Gin", "Spirits", 22, 132]);
  const e = makeEnv({ ssId: PROD_ID, sheets, badger: b, props: CREDS });
  e.ctx.importFromBadger(); e.ctx.compareWithBadger(); assert.strictEqual(e.ctx.applyBadgerCorrections().voided, 1);
  assert.strictEqual(stateRows(e).slice(-1)[0][3], "VOIDED");
  item.isVoid = false; item.modifiedDate = "2026-10-02T00:00:00";
  assert.strictEqual(e.ctx.importFromBadger().updated, 1);
  assert.deepStrictEqual([e.tabs["Invoices"].rows[1][12], e.tabs["Invoices"].rows[1][13], e.tabs["Monthly Units"].rows.length - 1], [132, "", 1]);
});

t("review2 H: a row moved between the row re-read and the write is skipped and finished by the next run", () => {
  const b = makeBadger([]);
  bInv(b, "101", "SS0170", "First", [{ q: 1, d: "Gin", p: 22 }]);
  const second = bInv(b, "102", "SS0171", "Second", [{ q: 1, d: "Gin", p: 22 }]);
  bInv(b, "103", "SS0172", "Third", [{ q: 1, d: "Gin", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(), badger: b, props: CREDS });
  e.ctx.importFromBadger();
  const inv = e.tabs["Invoices"].rows; inv[3][15] = true; inv[3][16] = "Yes";
  second.modifiedDate = "2026-09-22T00:00:00"; second.dollarAmount = 44; b.details["102"].lines[0].quantity = 2;
  const ls = e.tabs["Invoice Lines"]; const dr = ls.deleteRows; let done = false;
  ls.deleteRows = (...a) => { if (!done) { done = true; inv.splice(1, 1); } return dr(...a); };
  assert.strictEqual(e.ctx.importFromBadger().deferred, 1);
  assert.deepStrictEqual(inv.slice(1).map(r => [r[3], r[12], r[15], r[16]]), [["SS0171", 22, false, "No"], ["SS0172", 22, true, "Yes"]]);
  const r2 = e.ctx.importFromBadger(); assert.strictEqual(r2.updated, 1); assert.strictEqual(r2.imported, 1, "the row staff deleted is re-imported");
  assert.deepStrictEqual(inv.slice(1).map(r => [r[3], r[12], r[15], r[16]]), [["SS0171", 44, false, "No"], ["SS0172", 22, true, "Yes"], ["SS0170", 22, false, "No"]]);
  assert.deepStrictEqual(lineRowsFor(e, "SS0171").map(l => l[2]), [2], "lines not doubled");
});

t("review2 J: Apply corrects at most 40 invoices per run and finishes on the next run", () => {
  const b = makeBadger([]); const extra = [];
  for (let i = 0; i < 45; i++) { const no = `SS1${String(i).padStart(3, "0")}`; bInv(b, String(500 + i), no, "Store " + i, [{ q: 2, d: "Gin", p: 22 }]); extra.push(pdfRow(no, "Store " + i, 1)); }
  const e = makeEnv({ ssId: PROD_ID, sheets: prodSheets(extra), badger: b, props: CREDS });
  e.ctx.compareWithBadger();
  const r1 = e.ctx.applyBadgerCorrections(); assert.strictEqual(r1.corrected, 40); assert.match(r1.stoppedReason, /Stopped after 40 corrections/);
  const r2 = e.ctx.applyBadgerCorrections(); assert.strictEqual(r2.corrected, 5); assert.strictEqual(r2.alreadyDone, 40);
  assert.ok(e.tabs["Invoices"].rows.slice(1).every(r => r[12] === 44));
});

console.log(`\n${passed} tests passed`);
