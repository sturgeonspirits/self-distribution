/**
 * STURGEON SPIRITS — INTEGRATED MASTER SCRIPT
 *
 * VERSION: 2026.09.15.5-TEST
 *
 * CHANGES IN THIS VERSION
 * - Bound this test build to the staging Badger Tracker spreadsheet.
 * - Bound PDF discovery to the private staging fixture folder.
 * - Isolated all parser output in TEST-prefixed sheet tabs.
 * - Disabled Supabase and retail-map writes in the test build.
 * - Added runtime checks that stop execution outside the staging spreadsheet.
 *
 * PASTE INSTRUCTIONS
 * - This is the complete Invoice Parser.gs source, not a partial snippet.
 * - Replace Invoice Parser.gs only in the STAGING Badger Tracker.
 * - Keep credentials in Script Properties; do not paste supakeys.gs here.
 *
 * Features
 * - Recursive PDF import from Drive with OCR fallback and daily limits
 * - Robust invoice parsing and customer-name extraction
 * - Invoice lines using layout: C=Qty, D=Vol, E=Product


 * - Monthly summary by Product and Spirit Category
 * - Previous month summary by Product and Category
 * - Supabase retail map sync
 * - Diagnostics and data repair utilities
 *
 * Notes
 * - Repository reference copy: Supabase credential redacted.
 * - Store live credentials in Script Properties.
 */

const BADGER_PARSER_VERSION = "2026.09.15.5-TEST";

const CONFIG = Object.freeze({
  ENVIRONMENT: "STAGING_TEST",
  EXPECTED_SPREADSHEET_ID: "10KM-L-iAXJ4WQ1HfLWWoGkINsi9tEvVs6J5XiHBsMIQ",
  FOLDER_ID: "1_F2aeV7p3FvxPKtY8sONJyUKJoRK4foq",
  BLOCKED_PRODUCTION_FOLDER_ID: "1ccOfQpk69SLyMYskD2srlNqHCGm1VBJ5",
  ALLOW_EXTERNAL_WRITES: false,

  // Only actual PDF file IDs belong here.
  EXTRA_FILE_IDS: [],

  INVOICES_SHEET: "TEST - Invoices",
  LINES_SHEET: "TEST - Invoice Lines",
  SUMMARY_SHEET: "TEST - Monthly Summary",
  ERRORS_SHEET: "TEST - Import Errors",
  PREVIOUS_MONTH_SHEET: "TEST - Previous Month",
  DIAGNOSTICS_SHEET: "TEST - Diagnostics",
  LOCATION_DIRECTORY_SHEET: "Location_Directory",
  STATE_SHEET: "TEST - Parser State",

  SUPABASE_URL_PROPERTY: "SUPABASE_URL",
  SUPABASE_KEY_PROPERTY: "SUPABASE_KEY",
  OCR_DAILY_STATE_PROPERTY: "ocr_daily_state",

  OCR_LANGUAGE: "en",
  TRASH_TEMP_DOC: true,
  MAX_FILES_PER_RUN: 25,
  OCR_MAX_RETRIES: 6,
  OCR_INITIAL_BACKOFF_MS: 1500,
  OCR_DAILY_LIMIT: 60,

  PRODUCT_SIMILARITY_THRESHOLD: 0.92
});

/* -------------------- MENU -------------------- */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Sturgeon TEST Operations")
    .addItem("Verify Test Configuration", "showTestConfiguration")
    .addItem("1. Import Test PDF Batch", "importNextBatch_")
    .addItem("2. Rebuild Test Monthly Summary", "rebuildMonthlySummary_")
    .addItem("3. Rebuild Test Previous Month", "rebuildPreviousMonthSummary_")
    .addSeparator()
    .addItem("Repair Test Missing Names", "repairMissingCustomerNames")
    .addItem("RESET TEST OUTPUT", "resetEverything_")
    .addToUi();
}

function showTestConfiguration() {
  assertStagingEnvironment_();
  SpreadsheetApp.getUi().alert(
    "Staging configuration verified",
    `Version: ${BADGER_PARSER_VERSION}\nSpreadsheet: STAGING Badger Invoice Tracker\nPDF source: private fixture folder\nOutput: TEST-prefixed tabs\nExternal writes: disabled`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function assertStagingEnvironment_() {
  const ss = SpreadsheetApp.getActive();

  if (CONFIG.ENVIRONMENT !== "STAGING_TEST") {
    throw new Error("This build is not configured as STAGING_TEST.");
  }

  if (ss.getId() !== CONFIG.EXPECTED_SPREADSHEET_ID) {
    throw new Error(
      `Safety stop: this test build may run only in spreadsheet ${CONFIG.EXPECTED_SPREADSHEET_ID}.`
    );
  }

  if (!CONFIG.FOLDER_ID || CONFIG.FOLDER_ID === CONFIG.BLOCKED_PRODUCTION_FOLDER_ID) {
    throw new Error("Safety stop: the test build cannot read the production PDF folder.");
  }

  return ss;
}

/* -------------------- MAIN IMPORT -------------------- */

function importNextBatch_() {
  return withScriptLock_(function () {
    assertStagingEnvironment_();
    ensureSheetsAndHeaders_();

    if (!CONFIG.FOLDER_ID || String(CONFIG.FOLDER_ID).indexOf("PASTE_REAL") >= 0) {
      throw new Error("Set CONFIG.FOLDER_ID to your real Drive folder ID.");
    }

    const candidates = getAllPdfCandidatesRecursive_(CONFIG.FOLDER_ID, CONFIG.EXTRA_FILE_IDS);
    const existingInvoiceNos = buildExistingInvoiceIndex_();
    const processedFileIds = buildProcessedFileIndex_();

    let imported = 0;
    let attempted = 0;
    let skippedProcessed = 0;
    let skippedDuplicateInvoice = 0;

    const invoiceRows = [];
    const lineRows = [];
    const parserStateRows = [];

    for (const f of candidates) {
      if (attempted >= CONFIG.MAX_FILES_PER_RUN) break;

      const fileId = f.id;
      const fileName = f.name || getDriveFileName_(fileId);

      if (processedFileIds.has(fileId)) {
        skippedProcessed++;
        continue;
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
          parserStateRows.push(
            buildParserStateRow_(fileId, fileName, "REVIEW", "", "Invoice number (SS####) not found")
          );
          processedFileIds.add(fileId);
          continue;
        }

        const invNoNorm = normalizeInvoiceNo_(parsed.invoiceNumber);
        if (existingInvoiceNos.has(invNoNorm)) {
          skippedDuplicateInvoice++;
          parserStateRows.push(
            buildParserStateRow_(fileId, fileName, "DUPLICATE", invNoNorm, "Invoice number already imported")
          );
          processedFileIds.add(fileId);
          continue;
        }

        const rows = buildInvoiceWriteRows_({ id: fileId, name: fileName }, parsed);
        invoiceRows.push(rows.invoiceRow);
        if (rows.lineRows.length) {
          Array.prototype.push.apply(lineRows, rows.lineRows);
        }

        existingInvoiceNos.add(invNoNorm);
        parserStateRows.push(
          buildParserStateRow_(fileId, fileName, "IMPORTED", invNoNorm, "")
        );
        processedFileIds.add(fileId);
        imported++;
      } catch (err) {
        const errorMessage = String(err && err.message ? err.message : err);
        logError_(
          fileId,
          fileName,
          "import",
          errorMessage,
          ""
        );
        parserStateRows.push(
          buildParserStateRow_(fileId, fileName, "RETRYABLE_ERROR", "", errorMessage)
        );
      }
    }

    const ss = SpreadsheetApp.getActive();
    const inv = ss.getSheetByName(CONFIG.INVOICES_SHEET);
    const lines = ss.getSheetByName(CONFIG.LINES_SHEET);
    const parserState = ss.getSheetByName(CONFIG.STATE_SHEET);

    appendRows_(inv, invoiceRows);
    appendRows_(lines, lineRows);
    appendRows_(parserState, parserStateRows);

    applyInvoiceStatusValidations_();
    rebuildMonthlySummary_();

    SpreadsheetApp.getActive().toast(
      `Imported ${imported}. Attempted ${attempted}. Skipped processed ${skippedProcessed}. Skipped duplicate invoice# ${skippedDuplicateInvoice}.`,
      "Invoice Import",
      10
    );
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

/* -------------------- SUPABASE MAP SYNC -------------------- */

function masterSyncDistilleryMap() {
  assertStagingEnvironment_();
  if (!CONFIG.ALLOW_EXTERNAL_WRITES) {
    throw new Error("External Supabase and retail-map writes are disabled in the staging test build.");
  }

  return withScriptLock_(function () {
    const ss = SpreadsheetApp.getActive();
    const ui = SpreadsheetApp.getUi();

    const dirSheet = ss.getSheetByName(CONFIG.LOCATION_DIRECTORY_SHEET);
    if (!dirSheet) return ui.alert(`Error: '${CONFIG.LOCATION_DIRECTORY_SHEET}' tab not found.`);

    const invoiceSheet = ss.getSheetByName(CONFIG.LINES_SHEET);
    if (!invoiceSheet) return ui.alert(`Error: '${CONFIG.LINES_SHEET}' tab not found.`);

    const dirData = dirSheet.getDataRange().getValues();
    const invoiceData = invoiceSheet.getDataRange().getValues();

    const spiritsMap = {};

    for (let i = 1; i < invoiceData.length; i++) {
      const customer = String(invoiceData[i][1] || "").trim();
      const rawProduct = String(invoiceData[i][4] || "").trim();
      if (!customer || !rawProduct) continue;

      let product = rawProduct
        .split(" - ")[0]
        .replace(/\d+(\.\d+)?\s*(ml|l|oz|cs|case)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      product = titleCase_(product.toLowerCase());
      if (!product) continue;

      if (!spiritsMap[customer]) spiritsMap[customer] = new Set();
      spiritsMap[customer].add(product);
    }

    const payload = [];

    for (let j = 1; j < dirData.length; j++) {
      const invoiceName = String(dirData[j][0] || "").trim();
      const publicName = String(dirData[j][1] || "").trim();
      const showOnMap = normalizeBool_(dirData[j][6]);

      if (!showOnMap) continue;

      let matchedSpirits = [];

      if (
        invoiceName === "Sturgeon Spirits" ||
        publicName === "Sturgeon Spirits Tasting Room"
      ) {
        matchedSpirits = ["Full Product Lineup", "Tasting Room Exclusives"];
      } else if (spiritsMap[invoiceName]) {
        matchedSpirits = Array.from(spiritsMap[invoiceName]).sort();
      } else if (spiritsMap[publicName]) {
        matchedSpirits = Array.from(spiritsMap[publicName]).sort();
      }

      payload.push({
        client_name: invoiceName,
        public_name: publicName,
        address: dirData[j][2] || "",
        city: dirData[j][3] || "",
        category: dirData[j][4] || "",
        hours: dirData[j][5] || "",
        show_on_map: true,
        latitude: dirData[j][7] || null,
        longitude: dirData[j][8] || null,
        spirits_available: matchedSpirits.join(", ")
      });
    }

    if (!payload.length) {
      ui.alert("Nothing to sync. No rows marked show_on_map.");
      return;
    }

    const supabaseUrl = getRequiredScriptProperty_(CONFIG.SUPABASE_URL_PROPERTY);
    const supabaseKey = getRequiredScriptProperty_(CONFIG.SUPABASE_KEY_PROPERTY);

    const response = UrlFetchApp.fetch(
      `${supabaseUrl}/rest/v1/retail_locations?on_conflict=client_name`,
      {
        method: "post",
        contentType: "application/json",
        headers: {
          apikey: supabaseKey,
          Authorization: "Bearer " + supabaseKey,
          Prefer: "resolution=merge-duplicates"
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );

    const code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      ui.alert(`Success! Synced ${payload.length} locations.`);
    } else {
      ui.alert(`Sync Error (${code}): ${response.getContentText()}`);
    }
  });
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

function rebuildMonthlySummary_() {
  assertStagingEnvironment_();
  const ss = SpreadsheetApp.getActive();
  const inv = ss.getSheetByName(CONFIG.INVOICES_SHEET);
  const lines = ss.getSheetByName(CONFIG.LINES_SHEET);
  let sum = ss.getSheetByName(CONFIG.SUMMARY_SHEET);
  if (!sum) sum = ss.insertSheet(CONFIG.SUMMARY_SHEET);

  fullClearSheet_(sum);

  if (!inv || !lines) {
    sum.getRange(1, 1).setValue("Required source sheets not found.");
    return;
  }

  const invLast = inv.getLastRow();
  const lineLast = lines.getLastRow();

  if (invLast < 2 || lineLast < 2) {
    sum.getRange(1, 1).setValue("No data to summarize yet (Invoices or Invoice Lines is empty).");
    return;
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
    return;
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

    const productKey = resolveProductGroup_(rawProduct, productsKeySet, CONFIG.PRODUCT_SIMILARITY_THRESHOLD);
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
}

/* -------------------- PREVIOUS MONTH SUMMARY -------------------- */

function rebuildPreviousMonthSummary_() {
  assertStagingEnvironment_();
  const ss = SpreadsheetApp.getActive();
  const inv = ss.getSheetByName(CONFIG.INVOICES_SHEET);
  const lines = ss.getSheetByName(CONFIG.LINES_SHEET);

  if (!inv || !lines) {
    SpreadsheetApp.getUi().alert("Invoices or Invoice Lines sheet not found.");
    return;
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
    SpreadsheetApp.getUi().alert("No invoice data to summarize.");
    return;
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
    SpreadsheetApp.getUi().alert(`No invoices found for ${sheetTitle}.`);
    return;
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

  let sh = ss.getSheetByName(CONFIG.PREVIOUS_MONTH_SHEET);
  if (sh) {
    try {
      sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
    } catch (e) {}
    sh.clear();
  } else {
    sh = ss.insertSheet(CONFIG.PREVIOUS_MONTH_SHEET);
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

  SpreadsheetApp.getActive().toast(
    `${sheetTitle}: ${sortedProducts.length} products, ${totalBottles} bottles, $${totalSales.toFixed(2)}`,
    "Previous Month Summary",
    8
  );
}

/* -------------------- DIAGNOSTICS & REPAIRS -------------------- */

function diagnoseJan2026_() {
  assertStagingEnvironment_();
  const ss = SpreadsheetApp.getActive();
  const inv = ss.getSheetByName(CONFIG.INVOICES_SHEET);
  const lines = ss.getSheetByName(CONFIG.LINES_SHEET);

  if (!inv || !lines) {
    SpreadsheetApp.getUi().alert("Invoices or Invoice Lines sheet not found.");
    return;
  }

  let diag = ss.getSheetByName(CONFIG.DIAGNOSTICS_SHEET);
  if (diag) {
    try {
      diag.getRange(1, 1, diag.getMaxRows(), diag.getMaxColumns()).breakApart();
    } catch (e) {}
    diag.clear();
  } else {
    diag = ss.insertSheet(CONFIG.DIAGNOSTICS_SHEET);
  }

  const out = [];
  out.push(["═══ SECTION A: Invoices with Invoice Date → 2026-01 ═══"]);
  out.push(["Invoice #", "Invoice Date (raw)", "Parsed Month Key", "Customer Name", "Amount Due"]);

  const invLast = inv.getLastRow();
  const invoiceToMonth = new Map();
  const janInvoiceNos = new Set();

  if (invLast >= 2) {
    const invData = inv.getRange(2, 1, invLast - 1, inv.getLastColumn()).getValues();
    for (const r of invData) {
      const invNo = normalizeInvoiceNo_(r[3]);
      const invDate = r[4];
      if (!invNo) continue;

      const ym = toMonthKeyFlexible_(invDate);
      invoiceToMonth.set(invNo, ym);

      if (ym === "2026-01") {
        janInvoiceNos.add(invNo);
        out.push([invNo, String(invDate), ym, String(r[5] || ""), String(r[12] || "")]);
      }
    }
  }

  out.push([""]);
  out.push([`Found ${janInvoiceNos.size} invoices mapping to 2026-01`]);
  out.push([""]);

  out.push(["═══ SECTION B: Invoice Lines rows for January 2026 invoices ═══"]);
  out.push(["Invoice #", "Qty", "Volume", "Description", "Bev Class", "Unit Price", "Line Total", "Mapped Month"]);

  const lineLast = lines.getLastRow();
  let janLineCount = 0;
  let janBottleTotal = 0;
  let janSalesTotal = 0;

  if (lineLast >= 2) {
    const lineData = lines.getRange(2, 1, lineLast - 1, lines.getLastColumn()).getValues();
    for (const r of lineData) {
      const invNo = normalizeInvoiceNo_(r[0]);
      if (!invNo) continue;

      const ym = invoiceToMonth.get(invNo) || "(NO MATCH)";
      if (ym === "2026-01") {
        janLineCount++;
        const qty = asNumberFlexible_(r[2]);
        const sales = asNumberFlexible_(r[7]);
        const rawProduct = String(r[4] || "").replace(/\s+/g, " ").trim();

        janBottleTotal += qty;
        janSalesTotal += sales;

        out.push([
          invNo,
          qty,
          String(r[3] || ""),
          rawProduct,
          String(r[5] || ""),
          asNumberFlexible_(r[6]),
          sales,
          ym
        ]);
      }
    }
  }

  out.push([""]);
  out.push([`January 2026 line items: ${janLineCount} rows, ${janBottleTotal} bottles, $${janSalesTotal.toFixed(2)} sales`]);
  out.push([""]);

  const maxCols = Math.max.apply(null, out.map((r) => r.length));
  for (const row of out) {
    while (row.length < maxCols) row.push("");
  }

  diag.getRange(1, 1, out.length, maxCols).setValues(out);

  for (let i = 0; i < out.length; i++) {
    if (String(out[i][0]).startsWith("═══")) {
      diag.getRange(i + 1, 1, 1, maxCols).setFontWeight("bold");
    }
  }

  diag.autoResizeColumns(1, Math.min(maxCols, 10));
  ss.setActiveSheet(diag);
}

function repairMissingCustomerNames() {
  assertStagingEnvironment_();
  const ss = SpreadsheetApp.getActive();
  const invSheet = ss.getSheetByName(CONFIG.INVOICES_SHEET);
  const lineSheet = ss.getSheetByName(CONFIG.LINES_SHEET);

  if (!invSheet || !lineSheet) {
    SpreadsheetApp.getUi().alert("Invoices or Invoice Lines sheet not found.");
    return;
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

  if (output.length > 0) {
    lineSheet.getRange(2, 2, output.length, 1).setValues(output);
  }

  SpreadsheetApp.getUi().alert(`Repair complete. Changed ${changed} line items.`);
}

/* -------------------- SHEETS, RESET, VALIDATION -------------------- */

function resetEverything_() {
  assertStagingEnvironment_();

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    "Reset test output?",
    "This clears only TEST-prefixed parser tabs and test parser state.",
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;

  clearImportState_();
  ensureSheetsAndHeaders_();
  clearDataBelowHeaders_();
  SpreadsheetApp.getActive().toast("Test reset complete.", "TEST Operations", 8);
}

function clearImportState_() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(CONFIG.OCR_DAILY_STATE_PROPERTY);
  deleteLegacyParserProperties_(props);

  const stateSheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.STATE_SHEET);
  if (stateSheet && stateSheet.getLastRow() > 1) {
    stateSheet.getRange(2, 1, stateSheet.getLastRow() - 1, stateSheet.getLastColumn()).clearContent();
  }
}

function cleanupLegacyParserProperties() {
  assertStagingEnvironment_();
  ensureSheetsAndHeaders_();

  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const alreadyRecorded = buildProcessedFileIndex_();
  const migratedRows = [];

  Object.keys(all).forEach((key) => {
    if (key.indexOf("processed_pdf_") !== 0 || all[key] !== "1") return;

    const fileId = key.slice("processed_pdf_".length).trim();
    if (!fileId || alreadyRecorded.has(fileId)) return;

    migratedRows.push(
      buildParserStateRow_(
        fileId,
        "",
        "LEGACY_PROCESSED",
        "",
        "Migrated from a legacy processed_pdf_ Script Property"
      )
    );
    alreadyRecorded.add(fileId);
  });

  appendRows_(SpreadsheetApp.getActive().getSheetByName(CONFIG.STATE_SHEET), migratedRows);
  const deleted = deleteLegacyParserProperties_(props);
  SpreadsheetApp.getActive().toast(
    `Migrated ${migratedRows.length} file markers and removed ${deleted} legacy parser properties. Credentials and unrelated properties were preserved.`,
    "Parser Cleanup",
    10
  );
  return { migrated: migratedRows.length, deleted: deleted };
}

function deleteLegacyParserProperties_(props) {
  const all = props.getProperties();
  let deleted = 0;

  Object.keys(all).forEach((key) => {
    if (key.indexOf("processed_pdf_") === 0 || key.indexOf("ocr_count_") === 0) {
      props.deleteProperty(key);
      deleted++;
    }
  });

  return deleted;
}

function clearDataBelowHeaders_() {
  const ss = SpreadsheetApp.getActive();

  [CONFIG.INVOICES_SHEET, CONFIG.LINES_SHEET, CONFIG.ERRORS_SHEET].forEach((name) => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;

    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    if (lastRow > 1 && lastCol > 0) {
      sh.getRange(2, 1, lastRow - 1, lastCol).clearContent();
    }
  });

  const sumSh = ss.getSheetByName(CONFIG.SUMMARY_SHEET);
  if (sumSh) fullClearSheet_(sumSh);

  const prevSh = ss.getSheetByName(CONFIG.PREVIOUS_MONTH_SHEET);
  if (prevSh) fullClearSheet_(prevSh);

  const diagSh = ss.getSheetByName(CONFIG.DIAGNOSTICS_SHEET);
  if (diagSh) fullClearSheet_(diagSh);
}

function ensureSheetsAndHeaders_() {
  const ss = SpreadsheetApp.getActive();

  ensureSheet_(ss, CONFIG.INVOICES_SHEET, [
    "Processed At",
    "PDF File Id",
    "PDF File Name",
    "Invoice #",
    "Invoice Date",
    "Customer Name",
    "Customer Address",
    "Customer City/State/Zip",
    "Reseller #",
    "Winery Name",
    "Phone",
    "Order #",
    "Amount Due",
    "Terms",
    "Delivered",
    "Paid to Me",
    "Submitted"
  ]);

  ensureSheet_(ss, CONFIG.LINES_SHEET, [
    "Invoice #",
    "Customer Name",
    "Qty",
    "Volume",
    "Description",
    "Beverage Class",
    "Unit Price",
    "Line Total"
  ]);

  ensureSheet_(ss, CONFIG.SUMMARY_SHEET, ["(Generated)"]);
  ensureSheet_(ss, CONFIG.ERRORS_SHEET, ["Timestamp", "File Id", "File Name", "Stage", "Error", "Text Snippet"]);
  ensureSheet_(ss, CONFIG.STATE_SHEET, [
    "Updated At",
    "File Id",
    "File Name",
    "Status",
    "Invoice #",
    "Detail"
  ]);

  applyInvoiceStatusValidations_();
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  const currentHeaders =
    sh.getLastRow() >= 1
      ? sh.getRange(1, 1, 1, headers.length).getValues()[0]
      : [];

  const needsHeaderWrite =
    currentHeaders.length < headers.length ||
    headers.some((h, i) => String(currentHeaders[i] || "") !== String(h));

  if (needsHeaderWrite) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sh.setFrozenRows(1);
}

function applyInvoiceStatusValidations_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.INVOICES_SHEET);
  if (!sh) return;

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  sh.getRange(2, 15, lastRow - 1, 2).insertCheckboxes();

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Yes", "No", "N/A"], true)
    .setAllowInvalid(false)
    .build();

  sh.getRange(2, 17, lastRow - 1, 1).setDataValidation(rule);
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
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CONFIG.ERRORS_SHEET);
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

function getAllPdfCandidatesRecursive_(rootFolderId, extraFileIds) {
  const results = [];
  const seenFolders = new Set();
  const seenFiles = new Set();
  const queue = [rootFolderId];

  seenFolders.add(rootFolderId);

  while (queue.length) {
    const folderId = queue.shift();

    const pdfs = listFilesByQuery_(
      `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`
    );
    for (const f of pdfs) {
      if (f && f.id && !seenFiles.has(f.id)) {
        seenFiles.add(f.id);
        results.push(f);
      }
    }

    const subs = listFilesByQuery_(
      `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    );
    for (const sf of subs) {
      if (sf && sf.id && !seenFolders.has(sf.id)) {
        seenFolders.add(sf.id);
        queue.push(sf.id);
      }
    }
  }

  (extraFileIds || []).forEach((id) => {
    const fid = String(id || "").trim();
    if (!fid || seenFiles.has(fid)) return;
    seenFiles.add(fid);
    results.push({ id: fid, name: "", mimeType: "application/pdf" });
  });

  results.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  return results;
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

  const text = DocumentApp.openById(docId).getBody().getText();
  if (CONFIG.TRASH_TEMP_DOC) trashDoc_(docId);
  return normalizeText_(text);
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
  let backoff = CONFIG.OCR_INITIAL_BACKOFF_MS;

  while (attempt < CONFIG.OCR_MAX_RETRIES) {
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
      if (attempt >= CONFIG.OCR_MAX_RETRIES) {
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
        ocrLanguage: CONFIG.OCR_LANGUAGE,
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
        ocrLanguage: CONFIG.OCR_LANGUAGE,
        convert: true
      }
    );
    docId = inserted.id;
  }

  const text = DocumentApp.openById(docId).getBody().getText();
  if (CONFIG.TRASH_TEMP_DOC) trashDoc_(docId);
  return normalizeText_(text);
}

function trashDoc_(docId) {
  if (Drive.Files.update) {
    Drive.Files.update({ trashed: true }, docId);
  } else if (Drive.Files.trash) {
    Drive.Files.trash(docId);
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

function getRequiredScriptProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error(`Missing Apps Script property: ${name}`);
  return value;
}

function withScriptLock_(fn, timeoutMs) {
  const lock = LockService.getScriptLock();
  lock.waitLock(timeoutMs || 30000);
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

function normalizeBool_(v) {
  return v === true || String(v).toUpperCase() === "TRUE";
}

function titleCase_(s) {
  return String(s || "")
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
    .join(" ")
    .trim();
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

function buildProcessedFileIndex_() {
  const ss = SpreadsheetApp.getActive();
  const importedFileIds = new Set();
  const processedFileIds = new Set();
  const invoices = ss.getSheetByName(CONFIG.INVOICES_SHEET);

  if (invoices && invoices.getLastRow() > 1) {
    invoices.getRange(2, 2, invoices.getLastRow() - 1, 1).getValues().forEach((row) => {
      const fileId = String(row[0] || "").trim();
      if (fileId) {
        importedFileIds.add(fileId);
        processedFileIds.add(fileId);
      }
    });
  }

  const stateSheet = ss.getSheetByName(CONFIG.STATE_SHEET);
  if (!stateSheet || stateSheet.getLastRow() < 2) return processedFileIds;

  const terminalStatuses = new Set([
    "IMPORTED",
    "DUPLICATE",
    "REVIEW",
    "IGNORED",
    "LEGACY_PROCESSED"
  ]);
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

  if (state.count >= CONFIG.OCR_DAILY_LIMIT) {
    throw new Error(`Daily OCR limit reached (${CONFIG.OCR_DAILY_LIMIT}). Run again later.`);
  }
}

function incrementDailyOcrCount_() {
  const props = PropertiesService.getScriptProperties();
  const state = readDailyOcrState_(props);
  state.count++;
  props.setProperty(CONFIG.OCR_DAILY_STATE_PROPERTY, JSON.stringify(state));
}

function readDailyOcrState_(props) {
  const today = todayKey_();
  let state = null;

  try {
    state = JSON.parse(props.getProperty(CONFIG.OCR_DAILY_STATE_PROPERTY) || "null");
  } catch (e) {}

  if (!state || state.date !== today || !isFinite(Number(state.count))) {
    return { date: today, count: 0 };
  }

  return { date: today, count: Number(state.count) };
}

function buildExistingInvoiceIndex_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.INVOICES_SHEET);
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
