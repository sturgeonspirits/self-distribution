/**
 * STURGEON SPIRITS — BADGER INVOICE PARSER
 *
 * VERSION: 2026.10.02.1
 *
 * CHANGES IN THIS VERSION (from 2026.09.15.5-TEST)
 * - One file for both trackers. The parser looks at which spreadsheet it is
 *   running in: the production Badger Invoice Tracker uses the live Badger
 *   invoice folder and the real tabs; the staging tracker uses the private
 *   fixture folder and the TEST - tabs; any other spreadsheet stops.
 * - Removed the Supabase retail-map sync (masterSyncDistilleryMap) and every
 *   Supabase setting. The Distribution Hub does not use Supabase.
 * - Saves in an order that survives a failure part-way through: invoice lines
 *   first, then the invoice row, then the Parser State row. A retry never
 *   loses an invoice and never doubles its lines.
 * - Reads only PDFs directly inside the Badger folder (subfolders are not
 *   scanned) and reports any non-PDF files it ignored, such as a saved .html
 *   page, so a wrongly saved invoice is visible instead of silently skipped.
 * - Stops cleanly when the daily OCR limit is reached or the run nears the
 *   Apps Script time limit, instead of logging an error for every file left.
 * - Production never rewrites header rows: a renamed or moved column stops
 *   the import with a message. Checkboxes and the Yes/No/N/A list are applied
 *   only to newly added invoice rows, never to rows staff have edited.
 * - New "Move old parser settings" utility: copies every legacy
 *   processed_pdf_ marker into Parser State, then deletes the processed_pdf_,
 *   ocr_count_, SUPABASE_URL and SUPABASE_KEY Script Properties.
 * - No pop-up dialogs anywhere (toasts and the execution log only), so every
 *   function is safe to run from the menu or from the Apps Script editor.
 * - The staging reset is two-step (run twice within 2 minutes) and is refused
 *   in production. The one-off January 2026 diagnostic was removed.
 *
 * PASTE INSTRUCTIONS
 * - This is the complete parser file, not a snippet. Replace the whole
 *   contents of the parser file (Invoice Parser.gs) with this file.
 * - The Apps Script project should contain only this file and appsscript.json.
 *   Delete supakeys.gs. Another file defining onOpen or the same function
 *   names would silently override these.
 * - Requires the Drive advanced service (v3), as before.
 */

const BADGER_PARSER_VERSION = "2026.10.02.1";

const PARSER_PRODUCTION_FOLDER_ID = "1ccOfQpk69SLyMYskD2srlNqHCGm1VBJ5";

const PARSER_ENVIRONMENTS = Object.freeze({
  // Distribution Hub - Badger Invoice Tracker (live)
  "1nmHzrZLB2Kv-bLf3z0GBXbkO0XqUL-ETCxUlOlidSEk": Object.freeze({
    name: "PRODUCTION",
    label: "Distribution Hub - Badger Invoice Tracker",
    folderId: PARSER_PRODUCTION_FOLDER_ID,
    folderLabel: "Badger invoice folder (Invoices)",
    menuTitle: "Sturgeon Invoice Parser",
    overwriteHeaders: false,
    allowReset: false,
    sheets: Object.freeze({
      invoices: "Invoices",
      lines: "Invoice Lines",
      summary: "Monthly Summary",
      errors: "Import Errors",
      previousMonth: "Previous Month",
      state: "Parser State"
    })
  }),
  // STAGING - Badger Invoice Tracker - 2026-09-15
  "10KM-L-iAXJ4WQ1HfLWWoGkINsi9tEvVs6J5XiHBsMIQ": Object.freeze({
    name: "STAGING",
    label: "STAGING - Badger Invoice Tracker",
    folderId: "1_F2aeV7p3FvxPKtY8sONJyUKJoRK4foq",
    folderLabel: "private test fixture folder",
    menuTitle: "Sturgeon TEST Invoice Parser",
    overwriteHeaders: true,
    allowReset: true,
    sheets: Object.freeze({
      invoices: "TEST - Invoices",
      lines: "TEST - Invoice Lines",
      summary: "TEST - Monthly Summary",
      errors: "TEST - Import Errors",
      previousMonth: "TEST - Previous Month",
      state: "TEST - Parser State"
    })
  })
});

const PARSER_SETTINGS = Object.freeze({
  OCR_LANGUAGE: "en",
  TRASH_TEMP_DOC: true,
  MAX_FILES_PER_RUN: 25,
  MAX_RUN_MS: 4.5 * 60 * 1000, // stop starting new files before Apps Script's 6-minute limit
  OCR_MAX_RETRIES: 6,
  OCR_INITIAL_BACKOFF_MS: 1500,
  OCR_DAILY_LIMIT: 60,
  OCR_DAILY_STATE_PROPERTY: "ocr_daily_state",
  RESET_ARMED_PROPERTY: "parser_reset_armed_at",
  RESET_CONFIRM_WINDOW_MS: 2 * 60 * 1000,
  LEGACY_PROPERTY_PREFIXES: ["processed_pdf_", "ocr_count_"],
  RETIRED_PROPERTY_KEYS: ["SUPABASE_URL", "SUPABASE_KEY"],
  PRODUCT_SIMILARITY_THRESHOLD: 0.92
});

const PARSER_INVOICE_HEADERS = Object.freeze([
  "Processed At", "PDF File Id", "PDF File Name", "Invoice #", "Invoice Date",
  "Customer Name", "Customer Address", "Customer City/State/Zip", "Reseller #",
  "Winery Name", "Phone", "Order #", "Amount Due", "Terms", "Delivered",
  "Paid to Me", "Submitted"
]);
const PARSER_LINE_HEADERS = Object.freeze([
  "Invoice #", "Customer Name", "Qty", "Volume", "Description",
  "Beverage Class", "Unit Price", "Line Total"
]);
const PARSER_ERROR_HEADERS = Object.freeze(["Timestamp", "File Id", "File Name", "Stage", "Error", "Text Snippet"]);
const PARSER_STATE_HEADERS = Object.freeze(["Updated At", "File Id", "File Name", "Status", "Invoice #", "Detail"]);

// Parser State statuses that mean "do not read this file again".
// To re-read a file, change its latest Status cell to RETRY.
const PARSER_TERMINAL_STATUSES = Object.freeze(["IMPORTED", "DUPLICATE", "REVIEW", "IGNORED", "LEGACY_PROCESSED"]);

let PARSER_ENV_CACHE_ = null;

/* -------------------- ENVIRONMENT -------------------- */

function parserEnv_() {
  if (PARSER_ENV_CACHE_) return PARSER_ENV_CACHE_;

  const ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error("Run the parser from the Badger Invoice Tracker spreadsheet.");

  const id = ss.getId();
  const env = PARSER_ENVIRONMENTS[id];
  if (!env) {
    throw new Error(`Safety stop: spreadsheet ${id} is not a known Badger Invoice Tracker. This parser runs only in the production or staging tracker.`);
  }
  if (env.name !== "PRODUCTION" && env.folderId === PARSER_PRODUCTION_FOLDER_ID) {
    throw new Error("Safety stop: the staging tracker cannot read the production Badger folder.");
  }

  PARSER_ENV_CACHE_ = Object.freeze(Object.assign({ spreadsheetId: id, ss: ss }, env));
  return PARSER_ENV_CACHE_;
}

function notify_(message, title) {
  console.log(`[${title || "Invoice Parser"}] ${message}`);
  try {
    SpreadsheetApp.getActive().toast(String(message), title || "Invoice Parser", 10);
  } catch (e) {
    // No open spreadsheet UI (for example a time-driven run); the log line is enough.
  }
  return message;
}

/* -------------------- MENU -------------------- */

function onOpen() {
  let env = null;
  try {
    env = parserEnv_();
  } catch (e) {
    // Unknown spreadsheet: show only the status item so the reason is visible.
  }

  const menu = SpreadsheetApp.getUi().createMenu(env ? env.menuTitle : "Invoice Parser (not configured)");
  if (env) {
    menu
      .addItem("1. Import New Invoice PDFs", "importInvoicePdfs")
      .addItem("2. Rebuild Monthly Summary", "rebuildMonthlySummary")
      .addItem("3. Rebuild Previous Month", "rebuildPreviousMonthSummary")
      .addSeparator()
      .addItem("Repair Missing Customer Names", "repairMissingCustomerNames")
      .addItem("Parser Status", "showParserStatus")
      .addItem("One-time: Move Old Parser Settings", "migrateLegacyParserSettings");
    if (env.allowReset) {
      menu.addSeparator().addItem("RESET TEST OUTPUT (run twice)", "resetTestOutput");
    }
  } else {
    menu.addItem("Parser Status", "showParserStatus");
  }
  menu.addToUi();
}

function showParserStatus() {
  let env;
  try {
    env = parserEnv_();
  } catch (e) {
    return notify_(`${String(e.message || e)} Version ${BADGER_PARSER_VERSION}.`, "Parser Status");
  }

  const props = PropertiesService.getScriptProperties().getProperties();
  const legacyCount = Object.keys(props).filter(isLegacyParserProperty_).length;
  const retired = PARSER_SETTINGS.RETIRED_PROPERTY_KEYS.filter((k) => k in props);
  const ocr = readDailyOcrState_(PropertiesService.getScriptProperties());
  const stateSheet = env.ss.getSheetByName(env.sheets.state);
  const stateRows = stateSheet ? Math.max(stateSheet.getLastRow() - 1, 0) : 0;

  return notify_(
    `Version ${BADGER_PARSER_VERSION} · ${env.name} (${env.label}) · reads the ${env.folderLabel} · ` +
    `writes "${env.sheets.invoices}" and "${env.sheets.lines}" · Parser State rows: ${stateRows} · ` +
    `OCR today: ${ocr.count}/${PARSER_SETTINGS.OCR_DAILY_LIMIT} · old processed_pdf_/ocr_count_ settings left: ${legacyCount}` +
    (retired.length ? ` · retired settings still present: ${retired.join(", ")}` : ""),
    "Parser Status"
  );
}

/* -------------------- MAIN IMPORT -------------------- */

/** Kept so any old menu or trigger that still calls the previous name keeps working. */
function importNextBatch_() {
  return importInvoicePdfs();
}

function importInvoicePdfs() {
  return withScriptLock_(function () {
    const env = parserEnv_();
    const startedAt = Date.now();
    ensureSheetsAndHeaders_();

    const scan = listFolderCandidates_(env.folderId);
    const existingInvoiceNos = buildExistingInvoiceIndex_();
    const processedFileIds = buildProcessedFileIndex_();
    const invoicesWithLines = buildInvoicesWithLinesIndex_();

    let imported = 0;
    let attempted = 0;
    let skippedProcessed = 0;
    let skippedDuplicateInvoice = 0;
    let review = 0;
    let retryable = 0;
    let linesAlreadyPresent = 0;
    let stoppedReason = "";

    const invoiceRows = [];
    const lineRows = [];
    const parserStateRows = [];

    for (const f of scan.pdfs) {
      const fileId = f.id;
      const fileName = f.name || getDriveFileName_(fileId);

      if (processedFileIds.has(fileId)) {
        skippedProcessed++;
        continue;
      }
      if (attempted >= PARSER_SETTINGS.MAX_FILES_PER_RUN) {
        stoppedReason = `Stopped after ${PARSER_SETTINGS.MAX_FILES_PER_RUN} files; run again for the rest.`;
        break;
      }
      if (Date.now() - startedAt > PARSER_SETTINGS.MAX_RUN_MS) {
        stoppedReason = "Stopped before the Apps Script time limit; run again for the rest.";
        break;
      }

      attempted++;

      try {
        let text = extractTextNoOcr_(fileId);
        if (!looksLikeInvoiceText_(text)) {
          text = ocrPdfFileIdToText_WithBackoff_(fileId, fileName);
        }

        const parsed = parseInvoiceText_(text);

        if (!parsed.invoiceNumber) {
          logError_(fileId, fileName, "parse", "Invoice number (SS####) not found", text);
          parserStateRows.push(buildParserStateRow_(fileId, fileName, "REVIEW", "", "Invoice number (SS####) not found. Not a Badger invoice? Move it out of the folder, or set Status to RETRY to read it again."));
          processedFileIds.add(fileId);
          review++;
          continue;
        }

        const invNoNorm = normalizeInvoiceNo_(parsed.invoiceNumber);
        if (existingInvoiceNos.has(invNoNorm)) {
          parserStateRows.push(buildParserStateRow_(fileId, fileName, "DUPLICATE", invNoNorm, "Invoice number already imported"));
          processedFileIds.add(fileId);
          skippedDuplicateInvoice++;
          continue;
        }

        const rows = buildInvoiceWriteRows_({ id: fileId, name: fileName }, parsed);
        invoiceRows.push(rows.invoiceRow);
        if (invoicesWithLines.has(invNoNorm)) {
          // A previous run saved this invoice's lines but stopped before saving the
          // invoice row. Keep those lines; do not add them a second time.
          linesAlreadyPresent++;
        } else if (rows.lineRows.length) {
          Array.prototype.push.apply(lineRows, rows.lineRows);
          invoicesWithLines.add(invNoNorm);
        }

        existingInvoiceNos.add(invNoNorm);
        parserStateRows.push(buildParserStateRow_(fileId, fileName, "IMPORTED", invNoNorm, `${rows.lineRows.length} line(s)`));
        processedFileIds.add(fileId);
        imported++;
      } catch (err) {
        const errorMessage = String(err && err.message ? err.message : err);
        if (errorMessage.indexOf("Daily OCR limit reached") === 0) {
          attempted--;
          stoppedReason = `${errorMessage} The remaining files will be read on a later run.`;
          break;
        }
        logError_(fileId, fileName, "import", errorMessage, "");
        parserStateRows.push(buildParserStateRow_(fileId, fileName, "RETRYABLE_ERROR", "", errorMessage));
        retryable++;
      }
    }

    // Save order matters: lines, then invoices, then Parser State.
    // - If the line write fails, nothing was saved and the next run starts clean.
    // - If the invoice write fails, the next run re-reads the PDF, finds its lines
    //   already present, and adds only the invoice row.
    // - If the Parser State write fails, the invoice's PDF File Id in the Invoices tab
    //   still marks the file as done.
    const lines = env.ss.getSheetByName(env.sheets.lines);
    const inv = env.ss.getSheetByName(env.sheets.invoices);
    const parserState = env.ss.getSheetByName(env.sheets.state);

    appendRows_(lines, lineRows);
    const firstNewInvoiceRow = inv.getLastRow() + 1;
    appendRows_(inv, invoiceRows);
    applyInvoiceStatusValidations_(firstNewInvoiceRow, invoiceRows.length);
    appendRows_(parserState, parserStateRows);

    if (imported) rebuildMonthlySummaryCore_();

    const parts = [
      `Imported ${imported}.`,
      review ? `${review} need review (no SS invoice number).` : "",
      retryable ? `${retryable} failed and will be retried next run (see ${env.sheets.errors}).` : "",
      skippedDuplicateInvoice ? `${skippedDuplicateInvoice} duplicate invoice number(s) skipped.` : "",
      `${skippedProcessed} already done.`,
      linesAlreadyPresent ? `${linesAlreadyPresent} invoice(s) completed from an earlier interrupted run.` : "",
      scan.ignored.length ? `Ignored ${scan.ignored.length} non-PDF file(s): ${scan.ignored.slice(0, 5).join(", ")}${scan.ignored.length > 5 ? ", …" : ""}. Save invoices as PDF.` : "",
      scan.subfolders.length ? `${scan.subfolders.length} subfolder(s) not scanned: ${scan.subfolders.slice(0, 3).join(", ")}.` : "",
      stoppedReason
    ].filter(Boolean);

    notify_(parts.join(" "), env.name === "PRODUCTION" ? "Invoice Import" : "TEST Invoice Import");

    return {
      environment: env.name,
      imported: imported,
      attempted: attempted,
      review: review,
      retryable: retryable,
      skippedProcessed: skippedProcessed,
      skippedDuplicateInvoice: skippedDuplicateInvoice,
      linesAlreadyPresent: linesAlreadyPresent,
      ignoredNonPdf: scan.ignored,
      subfolders: scan.subfolders,
      stoppedReason: stoppedReason
    };
  });
}

function buildInvoiceWriteRows_(fileMeta, parsed) {
  const invNo = normalizeInvoiceNo_(parsed.invoiceNumber);
  const custName = parsed.customerName || "Unknown Customer";

  const invoiceRow = [
    new Date(),                     // Processed At
    fileMeta.id,                    // PDF File Id
    fileMeta.name,                  // PDF File Name
    invNo,                          // Invoice #
    parsed.invoiceDate || "",       // Invoice Date
    custName,                       // Customer Name
    "",                             // Customer Address
    "",                             // Customer City/State/Zip
    "",                             // Reseller #
    "",                             // Winery Name
    "",                             // Phone
    "",                             // Order #
    parsed.amountDue || "",         // Amount Due
    "",                             // Terms
    false,                          // Delivered
    false,                          // Paid to Me
    "No"                            // Submitted
  ];

  const lineRows = (parsed.lineItems || []).map((li) => [
    invNo,
    custName,
    li.qty,
    li.volume,
    li.description,
    li.beverageClass,
    li.unitPrice,
    li.lineTotal
  ]);

  return { invoiceRow, lineRows };
}

/* -------------------- PARSING -------------------- */

function parseInvoiceText_(text) {
  const raw = String(text || "");
  const lines = raw
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  function isLabelish_(s) {
    const t = String(s || "").trim();
    return (
      !t ||
      /:$/.test(t) ||
      /^(invoice|date|bill\s*to|address|city,\s*state,\s*zip|reseller('|')?s?\s*(number)?|winery\s*name|phone|order\s*number|amount\s*due|amount\s*enclosed|check\s*#|remittance|customer\s*name|customer\s*reseller|qty|volume|description|beverage\s*class|unit\s*price|total|terms)\b/i.test(t)
    );
  }

  function normalizeCustomerName_(s) {
    let name = String(s || "").replace(/\s+/g, " ").trim();
    if (!name || isLabelish_(name) || /sturgeon\s*spirits/i.test(name)) return "";

    name = name.replace(/\s*\?\s*$/g, "").trim();
    name = name.replace(/\s+\d{3,}[-\d]{6,}\s*$/g, "").trim();
    name = name.replace(/\s+\d{12,}\s*$/g, "").trim();

    const addrRe = /\s(?!#)(?:[NSEW]\d{2,6}|\d{1,6})\s+(?:[A-Za-z0-9.'-]+\s+){0,6}(?:St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Hwy|Highway|Pkwy|Parkway|Way|Trl|Trail|Pl|Place)\b\.?/i;
    const m = name.match(addrRe);
    if (m && m.index !== undefined) {
      name = name.slice(0, m.index).trim();
    }

    const parts = name.split(" ").filter(Boolean);
    if (
      parts.length >= 2 &&
      /^[A-Za-z]$/.test(parts[parts.length - 1]) &&
      !/^DBA$/i.test(parts[parts.length - 2]) &&
      !/d\/b\/a/i.test(parts[parts.length - 2])
    ) {
      parts.pop();
      name = parts.join(" ");
    }

    name = name.replace(/\s+#\s+/g, " #").replace(/[-,;:]+$/g, "").trim();
    return isLabelish_(name) ? "" : name;
  }

  function captureAfterLabel_(labelRe, maxLines) {
    for (let i = 0; i < lines.length; i++) {
      if (labelRe.test(lines[i])) {
        const same = lines[i].split(":").slice(1).join(":").trim();
        if (same) {
          const cleaned = normalizeCustomerName_(same);
          if (cleaned) return cleaned;
        }

        const parts = [];
        for (let j = i + 1; j < lines.length && parts.length < (maxLines || 2); j++) {
          if (isLabelish_(lines[j])) break;
          const cleaned = normalizeCustomerName_(lines[j]);
          if (cleaned) parts.push(cleaned);
        }

        const joined = parts.join(" ").replace(/\s+/g, " ").trim();
        if (joined) return joined;
      }
    }
    return "";
  }

  const ssMatch = raw.match(/\bSS\s*\d+\b/i);
  const amountMatch = raw.match(/Amount\s*Due\s*[:#]?\s*\$?\s*([0-9,]+\.\d{2})/i);
  const dateMatch = raw.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);

  const lineItems = [];
  const lineRe = /(?:^|\n)\s*(\d+)\s+(\d+\s?mL|\d+\s?L)\s+(.+?)\s+(Spirits|Wine|Beer|Cider|Other)\s+\$?\s*([0-9,]+\.\d{2})\s+\$?\s*([0-9,]+\.\d{2})\s*(?=\n|$)/gi;

  let match;
  while ((match = lineRe.exec(raw)) !== null) {
    lineItems.push({
      qty: Number(match[1]),
      volume: String(match[2] || "").replace(/\s+/g, ""),
      description: String(match[3] || "").replace(/\s+/g, " ").trim(),
      beverageClass: String(match[4] || "").trim(),
      unitPrice: Number(String(match[5] || "0").replace(/,/g, "")),
      lineTotal: Number(String(match[6] || "0").replace(/,/g, ""))
    });
  }

  return {
    invoiceNumber: normalizeInvoiceNo_(ssMatch ? ssMatch[0] : ""),
    invoiceDate: dateMatch ? dateMatch[1] : "",
    customerName:
      captureAfterLabel_(/^Customer\s*Name\s*:/i, 3) ||
      captureAfterLabel_(/^Reseller('|')?s?\s*(Number)?\s*:/i, 2) ||
      captureAfterLabel_(/^Bill\s*To\s*:/i, 2) ||
      captureAfterLabel_(/^Bill\s*To\s*$/i, 2) ||
      "",
    amountDue: amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : "",
    lineItems: lineItems
  };
}

/* -------------------- SPIRIT CATEGORY LOGIC -------------------- */

function categorizeProduct_(rawName) {
  const n = String(rawName || "").toLowerCase();

  if (n.includes("osh-gave") || n.includes("agave") || n.includes("oshgave")) return "Osh-gave";
  if (n.includes("whiskey") || n.includes("bourbon") || n.includes("whisky") || n.includes("rye")) return "Whiskey/Bourbon";
  if (n.includes("amaretto") || n.includes("liqueur") || n.includes("cream") || n.includes("cello") || n.includes("schnapps")) return "Liqueur";
  if (n.includes("gin")) return "Gin";
  if (n.includes("vodka")) return "Vodka";
  if (n.includes("brandy") || n.includes("cognac")) return "Brandy";
  if (n.includes("bitters") || n.includes("gns") || n.includes("neutral")) return "Bitters";

  return "Other";
}

/* -------------------- MONTHLY SUMMARY -------------------- */

function rebuildMonthlySummary() {
  return withScriptLock_(function () {
    const result = rebuildMonthlySummaryCore_();
    notify_(result, "Monthly Summary");
    return result;
  });
}

function rebuildMonthlySummaryCore_() {
  const env = parserEnv_();
  const ss = env.ss;
  const inv = ss.getSheetByName(env.sheets.invoices);
  const lines = ss.getSheetByName(env.sheets.lines);
  let sum = ss.getSheetByName(env.sheets.summary);
  if (!sum) sum = ss.insertSheet(env.sheets.summary);

  fullClearSheet_(sum);

  if (!inv || !lines) {
    sum.getRange(1, 1).setValue("Required source sheets not found.");
    return "Required source sheets not found.";
  }

  const invLast = inv.getLastRow();
  const lineLast = lines.getLastRow();

  if (invLast < 2 || lineLast < 2) {
    sum.getRange(1, 1).setValue("No data to summarize yet (Invoices or Invoice Lines is empty).");
    return "No data to summarize yet.";
  }

  const invData = inv.getRange(2, 1, invLast - 1, inv.getLastColumn()).getValues();
  const invoiceToMonth = new Map();
  const monthsSet = new Set();

  for (const r of invData) {
    const invNo = normalizeInvoiceNo_(r[3]);
    const invDate = r[4];
    if (!invNo) continue;

    const ym = toMonthKeyFlexible_(invDate);
    if (!ym) continue;

    invoiceToMonth.set(invNo, ym);
    monthsSet.add(ym);
  }

  if (monthsSet.size === 0) {
    sum.getRange(1, 1).setValue("No usable Invoice Dates found in Invoices column E (Invoice Date).");
    return "No usable invoice dates found.";
  }

  const monthsAll = Array.from(monthsSet).sort();
  const yearToMonths = new Map();

  for (const ym of monthsAll) {
    const y = ym.slice(0, 4);
    if (!yearToMonths.has(y)) yearToMonths.set(y, []);
    yearToMonths.get(y).push(ym);
  }

  for (const arr of yearToMonths.values()) arr.sort();
  const years = Array.from(yearToMonths.keys()).sort();

  const productMonth = new Map();
  const productsKeySet = new Set();
  const monthTotals = new Map();
  const productDisplayName = new Map();
  const productDisplayCount = new Map();

  const categoryMonth = new Map();
  const categoriesSet = new Set();

  for (const ym of monthsAll) {
    monthTotals.set(ym, { bottles: 0, sales: 0 });
  }

  const lineData = lines.getRange(2, 1, lineLast - 1, lines.getLastColumn()).getValues();

  for (const r of lineData) {
    const invNo = normalizeInvoiceNo_(r[0]);
    if (!invNo) continue;

    const ym = invoiceToMonth.get(invNo);
    if (!ym) continue;

    const qty = asNumberFlexible_(r[2]);
    const sales = asNumberFlexible_(r[7]);
    const rawProduct = String(r[4] || "").replace(/\s+/g, " ").trim();
    if (!rawProduct) continue;

    const productKey = resolveProductGroup_(rawProduct, productsKeySet, PARSER_SETTINGS.PRODUCT_SIMILARITY_THRESHOLD);
    if (!productKey) continue;

    productsKeySet.add(productKey);

    const counts = productDisplayCount.get(productKey) || new Map();
    counts.set(rawProduct, (counts.get(rawProduct) || 0) + 1);
    productDisplayCount.set(productKey, counts);

    let best = productDisplayName.get(productKey) || rawProduct;
    if ((counts.get(rawProduct) || 0) > (counts.get(best) || 0)) {
      best = rawProduct;
    }
    productDisplayName.set(productKey, best);

    if (!productMonth.has(productKey)) productMonth.set(productKey, new Map());
    const pm = productMonth.get(productKey);
    const cur = pm.get(ym) || { bottles: 0, sales: 0 };
    cur.bottles += qty;
    cur.sales += sales;
    pm.set(ym, cur);

    const cat = categorizeProduct_(rawProduct);
    categoriesSet.add(cat);

    if (!categoryMonth.has(cat)) categoryMonth.set(cat, new Map());
    const cm = categoryMonth.get(cat);
    const cCur = cm.get(ym) || { bottles: 0, sales: 0 };
    cCur.bottles += qty;
    cCur.sales += sales;
    cm.set(ym, cCur);

    const mt = monthTotals.get(ym);
    mt.bottles += qty;
    mt.sales += sales;
  }

  const productKeys = Array.from(productsKeySet).filter((k) => {
    const pm = productMonth.get(k);
    if (!pm) return false;
    let b = 0;
    let s = 0;
    for (const v of pm.values()) {
      b += v.bottles || 0;
      s += v.sales || 0;
    }
    return b !== 0 || s !== 0;
  });

  productKeys.sort((a, b) => (productDisplayName.get(a) || a).localeCompare(productDisplayName.get(b) || b));

  const headerRow1 = [""];
  const headerRow2 = ["Product"];
  const yearSpans = [];
  let colCursor = 2;

  for (const year of years) {
    const yMonths = yearToMonths.get(year);
    const startCol = colCursor;

    for (const ym of yMonths) {
      const mm = ym.slice(5, 7);
      headerRow2.push(`${mm} Bottles`, `${mm} Sales`);
      colCursor += 2;
    }

    headerRow2.push(`${year} Bottles`, `${year} Sales`);
    colCursor += 2;

    const endCol = colCursor - 1;
    headerRow1.push(year);
    for (let i = startCol + 1; i <= endCol; i++) headerRow1.push("");
    yearSpans.push({ startCol, endCol });
  }

  const totalCols = headerRow2.length;
  const out = [];

  out.push(headerRow1);
  out.push(headerRow2);

  for (const productKey of productKeys) {
    const display = productDisplayName.get(productKey) || productKey;
    const pm = productMonth.get(productKey) || new Map();
    const row = [display];

    for (const year of years) {
      let yBottles = 0;
      let ySales = 0;

      for (const ym of yearToMonths.get(year)) {
        const v = pm.get(ym) || { bottles: 0, sales: 0 };
        row.push(v.bottles, v.sales);
        yBottles += v.bottles;
        ySales += v.sales;
      }

      row.push(yBottles, ySales);
    }

    while (row.length < totalCols) row.push("");
    out.push(row);
  }

  const totalRow = ["TOTAL (Products)"];
  for (const year of years) {
    let yBottles = 0;
    let ySales = 0;

    for (const ym of yearToMonths.get(year)) {
      const mt = monthTotals.get(ym) || { bottles: 0, sales: 0 };
      totalRow.push(mt.bottles, mt.sales);
      yBottles += mt.bottles;
      ySales += mt.sales;
    }

    totalRow.push(yBottles, ySales);
  }

  while (totalRow.length < totalCols) totalRow.push("");
  out.push(totalRow);

  const productTotalRowIndex = out.length;

  out.push(new Array(totalCols).fill(""));
  out.push(new Array(totalCols).fill(""));

  const catHeaderRowIndex = out.length + 1;
  out.push([...headerRow1]);

  const catHeader2 = [...headerRow2];
  catHeader2[0] = "Spirit Category";
  out.push(catHeader2);

  const orderedCategories = ["Vodka", "Gin", "Whiskey/Bourbon", "Osh-gave", "Brandy", "Liqueur", "Bitters", "Other"];
  const catsPresent = orderedCategories.filter((c) => categoriesSet.has(c));
  for (const c of categoriesSet) {
    if (!orderedCategories.includes(c)) catsPresent.push(c);
  }

  for (const cat of catsPresent) {
    const row = [cat];
    const cm = categoryMonth.get(cat) || new Map();

    for (const year of years) {
      let yBottles = 0;
      let ySales = 0;

      for (const ym of yearToMonths.get(year)) {
        const v = cm.get(ym) || { bottles: 0, sales: 0 };
        row.push(v.bottles, v.sales);
        yBottles += v.bottles;
        ySales += v.sales;
      }

      row.push(yBottles, ySales);
    }

    while (row.length < totalCols) row.push("");
    out.push(row);
  }

  const catTotalRow = ["TOTAL (Categories)"];
  for (let i = 1; i < totalRow.length; i++) {
    catTotalRow.push(totalRow[i]);
  }
  out.push(catTotalRow);

  sum.getRange(1, 1, out.length, totalCols).setValues(out);
  sum.setFrozenRows(2);
  sum.setFrozenColumns(1);

  for (const span of yearSpans) {
    if (span.endCol > span.startCol) {
      sum.getRange(1, span.startCol, 1, span.endCol - span.startCol + 1)
        .merge()
        .setHorizontalAlignment("center");

      sum.getRange(catHeaderRowIndex, span.startCol, 1, span.endCol - span.startCol + 1)
        .merge()
        .setHorizontalAlignment("center");
    }
  }

  sum.getRange(1, 1, 2, totalCols).setFontWeight("bold");
  sum.getRange(productTotalRowIndex, 1, 1, totalCols).setFontWeight("bold");
  sum.getRange(catHeaderRowIndex, 1, 2, totalCols).setFontWeight("bold");
  sum.getRange(out.length, 1, 1, totalCols).setFontWeight("bold");

  for (let c = 2; c <= totalCols; c += 2) {
    const numRows = Math.max(out.length - 2, 1);
    sum.getRange(3, c, numRows, 1).setNumberFormat("0");
    if (c + 1 <= totalCols) {
      sum.getRange(3, c + 1, numRows, 1).setNumberFormat("$#,##0.00");
    }
  }

  return `Monthly Summary rebuilt: ${productKeys.length} products across ${monthsAll.length} months.`;
}

/* -------------------- PREVIOUS MONTH SUMMARY -------------------- */

function rebuildPreviousMonthSummary() {
  return withScriptLock_(function () {
    return rebuildPreviousMonthSummaryCore_();
  });
}

function rebuildPreviousMonthSummaryCore_() {
  const env = parserEnv_();
  const ss = env.ss;
  const inv = ss.getSheetByName(env.sheets.invoices);
  const lines = ss.getSheetByName(env.sheets.lines);

  if (!inv || !lines) {
    return notify_("Invoices or Invoice Lines sheet not found.", "Previous Month Summary");
  }

  const now = new Date();
  let prevMonth = now.getMonth();
  let prevYear = now.getFullYear();

  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear--;
  }

  const targetYm = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
  const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const sheetTitle = `${monthNames[prevMonth]} ${prevYear}`;

  const invLast = inv.getLastRow();
  const lineLast = lines.getLastRow();

  if (invLast < 2 || lineLast < 2) {
    return notify_("No invoice data to summarize.", "Previous Month Summary");
  }

  const invData = inv.getRange(2, 1, invLast - 1, inv.getLastColumn()).getValues();
  const targetInvoices = new Set();

  for (const r of invData) {
    const invNo = normalizeInvoiceNo_(r[3]);
    const invDate = r[4];
    if (!invNo) continue;

    if (toMonthKeyFlexible_(invDate) === targetYm) {
      targetInvoices.add(invNo);
    }
  }

  if (targetInvoices.size === 0) {
    return notify_(`No invoices found for ${sheetTitle}.`, "Previous Month Summary");
  }

  const lineData = lines.getRange(2, 1, lineLast - 1, lines.getLastColumn()).getValues();
  const productMap = new Map();
  const catMap = new Map();

  for (const r of lineData) {
    const invNo = normalizeInvoiceNo_(r[0]);
    if (!invNo || !targetInvoices.has(invNo)) continue;

    const cust = String(r[1] || "").trim();
    const qty = asNumberFlexible_(r[2]);
    const sales = asNumberFlexible_(r[7]);
    const rawProduct = String(r[4] || "").replace(/\s+/g, " ").trim();

    if (!rawProduct || (qty === 0 && sales === 0)) continue;

    const pData = productMap.get(rawProduct) || { bottles: 0, sales: 0, customers: new Set() };
    pData.bottles += qty;
    pData.sales += sales;
    if (cust) pData.customers.add(cust);
    productMap.set(rawProduct, pData);

    const cat = categorizeProduct_(rawProduct);
    const cData = catMap.get(cat) || { bottles: 0, sales: 0 };
    cData.bottles += qty;
    cData.sales += sales;
    catMap.set(cat, cData);
  }

  const sortedProducts = Array.from(productMap.entries()).sort((a, b) => b[1].sales - a[1].sales);
  const sortedCats = Array.from(catMap.entries()).sort((a, b) => b[1].sales - a[1].sales);

  let sh = ss.getSheetByName(env.sheets.previousMonth);
  if (sh) {
    try {
      sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
    } catch (e) {}
    sh.clear();
  } else {
    sh = ss.insertSheet(env.sheets.previousMonth);
  }

  const out = [];
  out.push([`${sheetTitle} — Sales Summary`, "", "", ""]);
  out.push(["Product", "Bottles", "Sales", "Customers"]);

  let totalBottles = 0;
  let totalSales = 0;

  for (const [product, data] of sortedProducts) {
    totalBottles += data.bottles;
    totalSales += data.sales;
    out.push([product, data.bottles, data.sales, Array.from(data.customers).sort().join(", ")]);
  }

  out.push(["TOTAL (Products)", totalBottles, totalSales, ""]);
  const productTotalRowIndex = out.length;

  out.push(["", "", "", ""]);
  out.push(["Spirit Category", "Bottles", "Sales", ""]);
  const catHeaderRowIndex = out.length;

  for (const [cat, data] of sortedCats) {
    out.push([cat, data.bottles, data.sales, ""]);
  }

  out.push(["TOTAL (Categories)", totalBottles, totalSales, ""]);

  sh.getRange(1, 1, out.length, 4).setValues(out);

  sh.getRange(1, 1, 1, 4).setFontWeight("bold").setFontSize(12);
  sh.getRange(2, 1, 1, 4).setFontWeight("bold");
  sh.getRange(productTotalRowIndex, 1, 1, 4).setFontWeight("bold");
  sh.getRange(catHeaderRowIndex, 1, 1, 4).setFontWeight("bold");
  sh.getRange(out.length, 1, 1, 4).setFontWeight("bold");

  sh.getRange(3, 2, Math.max(out.length - 2, 1), 1).setNumberFormat("0");
  sh.getRange(3, 3, Math.max(out.length - 2, 1), 1).setNumberFormat("$#,##0.00");

  sh.setFrozenRows(2);
  sh.autoResizeColumns(1, 4);
  ss.setActiveSheet(sh);

  return notify_(
    `${sheetTitle}: ${sortedProducts.length} products, ${totalBottles} bottles, $${totalSales.toFixed(2)}`,
    "Previous Month Summary"
  );
}

/* -------------------- REPAIRS -------------------- */

function repairMissingCustomerNames() {
  return withScriptLock_(function () {
    const env = parserEnv_();
    const invSheet = env.ss.getSheetByName(env.sheets.invoices);
    const lineSheet = env.ss.getSheetByName(env.sheets.lines);

    if (!invSheet || !lineSheet) {
      return notify_("Invoices or Invoice Lines sheet not found.", "Repair Names");
    }

    const invData = invSheet.getDataRange().getValues();
    const lineData = lineSheet.getDataRange().getValues();

    const nameMap = new Map();
    for (let i = 1; i < invData.length; i++) {
      const invNo = normalizeInvoiceNo_(invData[i][3]);
      const custName = String(invData[i][5] || "").trim();
      if (invNo && custName) nameMap.set(invNo, custName);
    }

    const output = [];
    let changed = 0;

    for (let j = 1; j < lineData.length; j++) {
      const lineInvNo = normalizeInvoiceNo_(lineData[j][0]);
      const existingName = String(lineData[j][1] || "").trim();
      const correctName = nameMap.get(lineInvNo) || existingName || "Unknown Customer";

      if (correctName !== existingName) changed++;
      output.push([correctName]);
    }

    if (changed > 0) {
      lineSheet.getRange(2, 2, output.length, 1).setValues(output);
    }

    return notify_(`Repair complete. Changed ${changed} line item(s).`, "Repair Names");
  });
}

/* -------------------- LEGACY SETTINGS MIGRATION -------------------- */

function isLegacyParserProperty_(key) {
  return PARSER_SETTINGS.LEGACY_PROPERTY_PREFIXES.some((prefix) => String(key).indexOf(prefix) === 0);
}

/**
 * One-time cleanup when switching from the old parser.
 * 1. Copies every processed_pdf_<file id> marker into Parser State as LEGACY_PROCESSED
 *    (skipping files Parser State or the Invoices tab already know about).
 * 2. Only after that write succeeds, deletes processed_pdf_*, ocr_count_*,
 *    SUPABASE_URL and SUPABASE_KEY. Every other Script Property is kept.
 * Safe to run more than once.
 */
function migrateLegacyParserSettings() {
  return withScriptLock_(function () {
    const env = parserEnv_();
    ensureSheetsAndHeaders_();

    const props = PropertiesService.getScriptProperties();
    const all = props.getProperties();
    const alreadyRecorded = buildProcessedFileIndex_();
    const migratedRows = [];

    Object.keys(all).forEach((key) => {
      if (key.indexOf("processed_pdf_") !== 0) return;

      const fileId = key.slice("processed_pdf_".length).trim();
      if (!fileId || alreadyRecorded.has(fileId)) return;

      migratedRows.push(
        buildParserStateRow_(fileId, "", "LEGACY_PROCESSED", "", "Migrated from a legacy processed_pdf_ Script Property")
      );
      alreadyRecorded.add(fileId);
    });

    appendRows_(env.ss.getSheetByName(env.sheets.state), migratedRows);

    let deleted = 0;
    Object.keys(all).forEach((key) => {
      if (isLegacyParserProperty_(key) || PARSER_SETTINGS.RETIRED_PROPERTY_KEYS.indexOf(key) >= 0) {
        props.deleteProperty(key);
        deleted++;
      }
    });

    notify_(
      `Moved ${migratedRows.length} old file marker(s) into ${env.sheets.state} and removed ${deleted} old setting(s), including any Supabase settings. Other settings were kept.`,
      "Parser Cleanup"
    );
    return { migrated: migratedRows.length, deleted: deleted };
  });
}

/* -------------------- STAGING RESET -------------------- */

/** Staging only. Run twice within 2 minutes: the first run arms it, the second clears TEST output. */
function resetTestOutput() {
  const env = parserEnv_();
  if (!env.allowReset) {
    throw new Error("Reset is not available in the production tracker.");
  }

  const props = PropertiesService.getScriptProperties();
  const armedAt = Number(props.getProperty(PARSER_SETTINGS.RESET_ARMED_PROPERTY) || 0);
  if (!armedAt || Date.now() - armedAt > PARSER_SETTINGS.RESET_CONFIRM_WINDOW_MS) {
    props.setProperty(PARSER_SETTINGS.RESET_ARMED_PROPERTY, String(Date.now()));
    return notify_("Reset armed. Run RESET TEST OUTPUT again within 2 minutes to clear the TEST tabs and test parser state.", "TEST Reset");
  }
  props.deleteProperty(PARSER_SETTINGS.RESET_ARMED_PROPERTY);

  return withScriptLock_(function () {
    props.deleteProperty(PARSER_SETTINGS.OCR_DAILY_STATE_PROPERTY);
    ensureSheetsAndHeaders_();

    [env.sheets.invoices, env.sheets.lines, env.sheets.errors, env.sheets.state].forEach((name) => {
      const sh = env.ss.getSheetByName(name);
      if (sh && sh.getLastRow() > 1 && sh.getLastColumn() > 0) {
        sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
      }
    });
    [env.sheets.summary, env.sheets.previousMonth].forEach((name) => {
      const sh = env.ss.getSheetByName(name);
      if (sh) fullClearSheet_(sh);
    });

    return notify_("TEST output cleared.", "TEST Reset");
  });
}

/* -------------------- SHEETS & VALIDATION -------------------- */

function ensureSheetsAndHeaders_() {
  const env = parserEnv_();
  ensureSheet_(env.ss, env.sheets.invoices, PARSER_INVOICE_HEADERS, env.overwriteHeaders);
  ensureSheet_(env.ss, env.sheets.lines, PARSER_LINE_HEADERS, env.overwriteHeaders);
  ensureSheet_(env.ss, env.sheets.errors, PARSER_ERROR_HEADERS, env.overwriteHeaders);
  ensureSheet_(env.ss, env.sheets.state, PARSER_STATE_HEADERS, env.overwriteHeaders);
}

/**
 * Creates a missing tab with its headers. On an existing tab, a header mismatch
 * either rewrites the header row (staging) or stops with a clear message
 * (production), because the Distribution Hub reads these tabs by column.
 */
function ensureSheet_(ss, name, headers, overwriteHeaders) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers.slice()]);
    sh.setFrozenRows(1);
    return sh;
  }

  const currentHeaders =
    sh.getLastRow() >= 1 && sh.getLastColumn() >= 1
      ? sh.getRange(1, 1, 1, headers.length).getValues()[0]
      : [];

  const mismatchIndex = headers.findIndex((h, i) => String(currentHeaders[i] || "").trim() !== String(h));
  if (mismatchIndex < 0) return sh;

  if (!overwriteHeaders && sh.getLastRow() >= 1) {
    throw new Error(
      `Safety stop: the "${name}" tab's column ${mismatchIndex + 1} is "${String(currentHeaders[mismatchIndex] || "")}" but should be "${headers[mismatchIndex]}". ` +
      "Restore the header row (the Distribution Hub reads these columns), then run the import again."
    );
  }

  sh.getRange(1, 1, 1, headers.length).setValues([headers.slice()]);
  sh.setFrozenRows(1);
  return sh;
}

/** Checkboxes for Delivered / Paid to Me and the Yes/No/N/A list for Submitted, on new rows only. */
function applyInvoiceStatusValidations_(startRow, rowCount) {
  if (!rowCount || rowCount < 1) return;
  const env = parserEnv_();
  const sh = env.ss.getSheetByName(env.sheets.invoices);
  if (!sh) return;

  sh.getRange(startRow, 15, rowCount, 2).insertCheckboxes();

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Yes", "No", "N/A"], true)
    .setAllowInvalid(false)
    .build();

  sh.getRange(startRow, 17, rowCount, 1).setDataValidation(rule);
}

function fullClearSheet_(sh) {
  try {
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  } catch (e) {}
  sh.clear();
  sh.setFrozenRows(0);
  sh.setFrozenColumns(0);
}

function logError_(fileId, fileName, stage, errorMsg, text) {
  const env = parserEnv_();
  const sh = env.ss.getSheetByName(env.sheets.errors);
  if (!sh) return;

  sh.appendRow([
    new Date(),
    fileId,
    fileName,
    stage,
    errorMsg,
    String(text || "").slice(0, 320)
  ]);
}

/* -------------------- FILE DISCOVERY -------------------- */

/**
 * Lists the PDFs directly inside the Badger folder. Subfolders are not read, so
 * templates, branded copies and other projects can never be imported by accident.
 * Non-PDF files and subfolders are returned by name so the import can report them.
 */
function listFolderCandidates_(folderId) {
  const pdfs = listFilesByQuery_(
    `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`
  ).filter((f) => f && f.id);

  const others = listFilesByQuery_(
    `'${folderId}' in parents and mimeType!='application/pdf' and trashed=false`
  );

  const ignored = [];
  const subfolders = [];
  others.forEach((f) => {
    if (!f) return;
    if (f.mimeType === "application/vnd.google-apps.folder") subfolders.push(f.name || f.id);
    else ignored.push(f.name || f.id);
  });

  pdfs.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  ignored.sort();
  subfolders.sort();
  return { pdfs: pdfs, ignored: ignored, subfolders: subfolders };
}

function listFilesByQuery_(q) {
  const out = [];
  let pageToken;

  do {
    try {
      const respV3 = Drive.Files.list({
        q: q,
        fields: "nextPageToken, files(id, name, mimeType)",
        pageSize: 200,
        pageToken: pageToken
      });
      (respV3.files || []).forEach((f) => out.push(f));
      pageToken = respV3.nextPageToken;
    } catch (e) {
      const respV2 = Drive.Files.list({
        q: q,
        fields: "nextPageToken, items(id, title, mimeType)",
        maxResults: 200,
        pageToken: pageToken
      });
      (respV2.items || []).forEach((it) => {
        out.push({ id: it.id, name: it.title, mimeType: it.mimeType });
      });
      pageToken = respV2.nextPageToken;
    }
  } while (pageToken);

  return out;
}

function getDriveFileName_(fileId) {
  try {
    let meta;
    try {
      meta = Drive.Files.get(fileId, { fields: "name,title" });
    } catch (e) {
      meta = Drive.Files.get(fileId);
    }
    return meta.name || meta.title || "(unnamed)";
  } catch (e) {
    return "(unnamed)";
  }
}

/* -------------------- TEXT EXTRACTION + OCR -------------------- */

function extractTextNoOcr_(pdfFileId) {
  const blob = downloadDriveFileAsBlob_(pdfFileId, "invoice.pdf");
  let docId;

  if (Drive.Files.create) {
    const created = Drive.Files.create(
      {
        name: `NOOCR_${Date.now()}`,
        mimeType: "application/vnd.google-apps.document"
      },
      blob,
      { fields: "id" }
    );
    docId = created.id;
  } else {
    const inserted = Drive.Files.insert(
      {
        title: `NOOCR_${Date.now()}`,
        mimeType: blob.getContentType() || "application/pdf"
      },
      blob,
      { convert: true }
    );
    docId = inserted.id;
  }

  try {
    return normalizeText_(DocumentApp.openById(docId).getBody().getText());
  } finally {
    if (PARSER_SETTINGS.TRASH_TEMP_DOC) trashDoc_(docId);
  }
}

function looksLikeInvoiceText_(text) {
  if (!text) return false;

  const t = String(text).toLowerCase();
  const hasInvoice = t.indexOf("invoice") >= 0;
  const hasDate = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(text);
  const hasAmount = t.indexOf("amount due") >= 0 || /\$\s*\d/.test(text);

  return (hasInvoice && (hasDate || hasAmount)) && text.length > 120;
}

function ocrPdfFileIdToText_WithBackoff_(pdfFileId, pdfName) {
  enforceDailyOcrLimit_();

  let attempt = 0;
  let backoff = PARSER_SETTINGS.OCR_INITIAL_BACKOFF_MS;

  while (attempt < PARSER_SETTINGS.OCR_MAX_RETRIES) {
    try {
      const text = ocrPdfFileIdToText_(pdfFileId, pdfName);
      incrementDailyOcrCount_();
      return text;
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      const low = msg.toLowerCase();
      const isRateLimit =
        low.indexOf("rate limit") >= 0 ||
        low.indexOf("user rate limit exceeded") >= 0 ||
        low.indexOf("quota") >= 0;

      if (!isRateLimit) throw err;

      attempt++;
      if (attempt >= PARSER_SETTINGS.OCR_MAX_RETRIES) {
        throw new Error(`OCR throttled. Try again later. Last error: ${msg}`);
      }

      Utilities.sleep(backoff + Math.floor(Math.random() * 500));
      backoff = Math.min(backoff * 2, 60000);
    }
  }

  throw new Error("OCR failed after retries.");
}

function ocrPdfFileIdToText_(pdfFileId, pdfName) {
  const blob = downloadDriveFileAsBlob_(pdfFileId, pdfName);
  let docId;

  if (Drive.Files.create) {
    const created = Drive.Files.create(
      {
        name: `OCR_${pdfName}_${Date.now()}`,
        mimeType: "application/vnd.google-apps.document"
      },
      blob,
      {
        ocr: true,
        ocrLanguage: PARSER_SETTINGS.OCR_LANGUAGE,
        fields: "id"
      }
    );
    docId = created.id;
  } else {
    const inserted = Drive.Files.insert(
      {
        title: `OCR_${pdfName}_${Date.now()}`,
        mimeType: blob.getContentType() || "application/pdf"
      },
      blob,
      {
        ocr: true,
        ocrLanguage: PARSER_SETTINGS.OCR_LANGUAGE,
        convert: true
      }
    );
    docId = inserted.id;
  }

  try {
    return normalizeText_(DocumentApp.openById(docId).getBody().getText());
  } finally {
    if (PARSER_SETTINGS.TRASH_TEMP_DOC) trashDoc_(docId);
  }
}

function trashDoc_(docId) {
  try {
    if (Drive.Files.update) {
      Drive.Files.update({ trashed: true }, docId);
    } else if (Drive.Files.trash) {
      Drive.Files.trash(docId);
    }
  } catch (e) {
    console.warn(`Could not trash temporary document ${docId}: ${e && e.message ? e.message : e}`);
  }
}

function downloadDriveFileAsBlob_(fileId, fileName) {
  const token = ScriptApp.getOAuthToken();
  const url = "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId) + "?alt=media";
  const resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true
  });

  const code = resp.getResponseCode();
  if (code !== 200) {
    throw new Error(`Drive download failed (${code}). Check file/folder permissions.`);
  }

  const blob = resp.getBlob();
  blob.setName(fileName || "invoice.pdf");
  return blob;
}

/* -------------------- FUZZY PRODUCT GROUPING -------------------- */

function canonicalProductKey_(name) {
  let s = String(name || "").toLowerCase();
  s = s.replace(/&/g, " and ");
  s = s.replace(/['']/g, "");
  s = s.replace(/[^\w\s]/g, " ");
  s = s.replace(/\b(m|ml|l)\b/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s.replace(/\b[a-z]{1,2}\b$/g, "").trim();
}

function editDistance_(a, b) {
  a = String(a || "");
  b = String(b || "");

  const n = a.length;
  const m = b.length;

  if (n === 0) return m;
  if (m === 0) return n;

  const dp = new Array(m + 1);
  for (let j = 0; j <= m; j++) dp[j] = j;

  for (let i = 1; i <= n; i++) {
    let prev = dp[0];
    dp[0] = i;

    for (let j = 1; j <= m; j++) {
      const temp = dp[j];
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }

  return dp[m];
}

function similarity_(a, b) {
  a = String(a || "");
  b = String(b || "");

  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - editDistance_(a, b) / maxLen;
}

function resolveProductGroup_(rawName, knownKeysSet, threshold) {
  const baseKey = canonicalProductKey_(rawName);
  if (!baseKey) return "";
  if (knownKeysSet.has(baseKey)) return baseKey;

  let bestKey = "";
  let bestScore = 0;

  const baseLen = baseKey.length;
  const basePrefix = baseKey.slice(0, 6);

  for (const k of knownKeysSet) {
    if (!k || k.slice(0, 6) !== basePrefix) continue;

    const len = k.length;
    if (len < baseLen * 0.75 || len > baseLen * 1.33) continue;

    const score = similarity_(baseKey, k);
    if (score > bestScore) {
      bestScore = score;
      bestKey = k;
    }
  }

  return bestKey && bestScore >= threshold ? bestKey : baseKey;
}

/* -------------------- GENERIC HELPERS -------------------- */

function withScriptLock_(fn, timeoutMs) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(timeoutMs || 30000)) {
    throw new Error("Another parser run is in progress. Try again in a minute.");
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function appendRows_(sheet, rows) {
  if (!sheet || !rows || !rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function normalizeInvoiceNo_(v) {
  return String(v || "").toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "");
}

function parseMmDdYyyy_(s) {
  const m = String(s || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;

  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);

  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }

  return d;
}

function toMonthKeyFlexible_(dateVal) {
  if (!dateVal) return "";

  if (
    Object.prototype.toString.call(dateVal) === "[object Date]" &&
    !isNaN(dateVal.getTime())
  ) {
    return `${dateVal.getFullYear()}-${String(dateVal.getMonth() + 1).padStart(2, "0")}`;
  }

  const parsed = parseMmDdYyyy_(String(dateVal).trim());
  if (parsed) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
  }

  return "";
}

function asNumberFlexible_(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;

  const n = Number(String(v).trim().replace(/[$,]/g, ""));
  return isFinite(n) ? n : 0;
}

function normalizeText_(t) {
  return String(t || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* -------------------- PARSER STATE & OCR LIMITS -------------------- */

function buildParserStateRow_(fileId, fileName, status, invoiceNumber, detail) {
  return [
    new Date(),
    fileId,
    fileName,
    status,
    invoiceNumber || "",
    detail || ""
  ];
}

/**
 * Files that must not be read again: every PDF File Id in the Invoices tab, plus
 * files whose latest Parser State row has a terminal status. A later RETRY or
 * RETRYABLE_ERROR row re-opens a file that was never imported.
 */
function buildProcessedFileIndex_() {
  const env = parserEnv_();
  const importedFileIds = new Set();
  const processedFileIds = new Set();
  const invoices = env.ss.getSheetByName(env.sheets.invoices);

  if (invoices && invoices.getLastRow() > 1) {
    invoices.getRange(2, 2, invoices.getLastRow() - 1, 1).getValues().forEach((row) => {
      const fileId = String(row[0] || "").trim();
      if (fileId) {
        importedFileIds.add(fileId);
        processedFileIds.add(fileId);
      }
    });
  }

  const stateSheet = env.ss.getSheetByName(env.sheets.state);
  if (!stateSheet || stateSheet.getLastRow() < 2) return processedFileIds;

  const terminalStatuses = new Set(PARSER_TERMINAL_STATUSES);
  stateSheet.getRange(2, 1, stateSheet.getLastRow() - 1, 6).getValues().forEach((row) => {
    const fileId = String(row[1] || "").trim();
    const status = String(row[3] || "").trim().toUpperCase();
    if (!fileId) return;

    if (terminalStatuses.has(status)) {
      processedFileIds.add(fileId);
    } else if (!importedFileIds.has(fileId)) {
      processedFileIds.delete(fileId);
    }
  });

  return processedFileIds;
}

function buildExistingInvoiceIndex_() {
  const env = parserEnv_();
  const sh = env.ss.getSheetByName(env.sheets.invoices);
  const set = new Set();
  if (!sh) return set;

  const lastRow = sh.getLastRow();
  if (lastRow > 1) {
    sh.getRange(2, 4, lastRow - 1, 1).getValues().forEach((r) => {
      const inv = normalizeInvoiceNo_(r[0]);
      if (inv) set.add(inv);
    });
  }

  return set;
}

/** Invoice numbers that already have at least one row in Invoice Lines. */
function buildInvoicesWithLinesIndex_() {
  const env = parserEnv_();
  const sh = env.ss.getSheetByName(env.sheets.lines);
  const set = new Set();
  if (!sh) return set;

  const lastRow = sh.getLastRow();
  if (lastRow > 1) {
    sh.getRange(2, 1, lastRow - 1, 1).getValues().forEach((r) => {
      const inv = normalizeInvoiceNo_(r[0]);
      if (inv) set.add(inv);
    });
  }

  return set;
}

function todayKey_() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || "America/Chicago",
    "yyyyMMdd"
  );
}

function enforceDailyOcrLimit_() {
  const props = PropertiesService.getScriptProperties();
  const state = readDailyOcrState_(props);

  if (state.count >= PARSER_SETTINGS.OCR_DAILY_LIMIT) {
    throw new Error(`Daily OCR limit reached (${PARSER_SETTINGS.OCR_DAILY_LIMIT}). Run again later.`);
  }
}

function incrementDailyOcrCount_() {
  const props = PropertiesService.getScriptProperties();
  const state = readDailyOcrState_(props);
  state.count++;
  props.setProperty(PARSER_SETTINGS.OCR_DAILY_STATE_PROPERTY, JSON.stringify(state));
}

function readDailyOcrState_(props) {
  const today = todayKey_();
  let state = null;

  try {
    state = JSON.parse(props.getProperty(PARSER_SETTINGS.OCR_DAILY_STATE_PROPERTY) || "null");
  } catch (e) {}

  if (!state || state.date !== today || !isFinite(Number(state.count))) {
    return { date: today, count: 0 };
  }

  return { date: today, count: Number(state.count) };
}
