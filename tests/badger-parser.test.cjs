// Badger parser 2026.10.08.1 tests (2026-10-08). Run: node tests/badger-parser.test.cjs — fakes SpreadsheetApp, Drive, ScriptApp, Badger, etc.
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
  assert.deepStrictEqual(row.slice(1, 14), ["badger:101", "Badger invoice SS0170", "SS0170", "9/16/2026", "Wagner Market", "1 Main St", "Oshkosh WI 54901", "R-1", "", "", "0170", 336, ""]);
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

t("a failed Parser State write is finished by the next run without a second invoice row", () => {
  const b = makeBadger([]); bInv(b, "101", "SS0170", "Wagner Market", [{ q: 6, d: "Gin", p: 22 }]);
  const e = makeEnv({ ssId: PROD_ID, sheets: Object.assign(prodSheets(), { "Parser State": [["Updated At", "File Id", "File Name", "Status", "Invoice #", "Detail"]] }), badger: b, props: CREDS });
  e.tabs["Parser State"].failAppend = true;
  assert.throws(() => e.ctx.importFromBadger());
  e.tabs["Parser State"].failAppend = false;
  const r = e.ctx.importFromBadger(); assert.strictEqual(r.linked, 1); assert.strictEqual(r.imported, 0);
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

console.log(`\n${passed} tests passed`);
