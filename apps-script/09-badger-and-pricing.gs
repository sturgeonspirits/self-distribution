// Inventory API, part 9 of 12: Badger and pricing: Badger site sign-in and status sync, payment marks, Toast stock import, wholesale prices, Badger invoice creation and links.
// The parts load in order 01 to 12 (filePushOrder in .clasp.json); version and change notes are in 01-core.gs.

function badgerUrl_(method, path) {
  const normalizedMethod = String(method || "").toUpperCase();
  const normalizedPath = String(path || "");
  const allowed = (normalizedMethod === "POST" && new Set(["/Login/Authenticate", "/Api/invoice/Paged", "/Api/Invoice/Paged/orderorinvoicenumber", "/api/invoice"]).has(normalizedPath))
    || (normalizedMethod === "GET" && (/^\/api\/invoice\/\d+$/.test(normalizedPath) || /^\/api\/customer\/\d+$/.test(normalizedPath) || /^\/api\/invoice\/validateforcreate\?number=\d{1,4}&date=\d{4}-\d{2}-\d{2}$/.test(normalizedPath)));
  if (!allowed) throw new Error("Badger request method or path is not allow-listed.");
  return `${BADGER_BASE_URL}${normalizedPath}`;
}

function badgerCookieHeader_(headers) {
  const rawCookies = headers["Set-Cookie"] || headers["set-cookie"] || [];
  const values = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
  const cookies = values.flatMap(value => String(value || "").match(/(?:^|,\s*)([^;,\s]+=[^;,\s]+)/g) || [])
    .map(value => value.replace(/^,\s*/, "").trim())
    .filter(Boolean);
  return [...new Set(cookies)].join("; ");
}

function badgerSession_(forceRefresh) {
  const cache = CacheService.getScriptCache();
  if (forceRefresh) cache.remove(BADGER_SESSION_CACHE_KEY);
  const cached = cache.get(BADGER_SESSION_CACHE_KEY);
  if (cached) return cached;
  const properties = PropertiesService.getScriptProperties();
  const username = String(properties.getProperty("BADGER_USERNAME") || "").trim();
  const password = String(properties.getProperty("BADGER_PASSWORD") || "");
  if (!username || !password) throw new Error("Badger login requires BADGER_USERNAME and BADGER_PASSWORD Script Properties.");
  const response = UrlFetchApp.fetch(badgerUrl_("POST", "/Login/Authenticate"), {
    method:"post",
    contentType:"application/json",
    payload:JSON.stringify({ username:username, password:password }),
    muteHttpExceptions:true,
    followRedirects:false,
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 400) throw new Error(`Badger login was rejected (HTTP ${status}).`);
  try {
    const payload = JSON.parse(response.getContentText());
    if (payload && payload.isSuccess === false) throw new Error("Badger login was rejected.");
  } catch (error) {
    if (String(error && error.message || error) === "Badger login was rejected.") throw error;
  }
  const cookieHeader = badgerCookieHeader_(response.getAllHeaders());
  if (!cookieHeader) throw new Error("Badger login did not return a session cookie.");
  cache.put(BADGER_SESSION_CACHE_KEY, cookieHeader, BADGER_SESSION_TTL_SECONDS);
  return cookieHeader;
}

function testBadgerLogin() {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const response = UrlFetchApp.fetch(badgerUrl_("POST", "/Api/invoice/Paged"), {
    method:"post",
    contentType:"application/json",
    payload:JSON.stringify({
      pageSize:500, page:0, sorts:[], filters:[],
      parameters:{ rangeStart:"2024-01-01T00:00:00-06:00", rangeEnd:`${today}T23:59:59-06:00`, status:"All" },
    }),
    headers:{ Cookie:badgerSession_() },
    muteHttpExceptions:true,
    followRedirects:false,
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error(`Badger invoice probe failed (HTTP ${status}).`);
  let payload;
  try { payload = JSON.parse(response.getContentText()); } catch (_) { throw new Error("Badger invoice probe returned invalid JSON."); }
  const page = payload && payload.data;
  if (!page || !Number.isFinite(Number(page.totalCount)) || !Array.isArray(page.data)) throw new Error("Badger invoice probe returned an unexpected response shape.");
  console.log(JSON.stringify({ totalCount:Number(page.totalCount), invoiceNumbers:page.data.slice(0, 5).map(item => String(item.number || "")).filter(Boolean) }));
}

function readBadgerInvoices_() {
  const sheet = getOutreachSs_().getSheetByName(BADGER_STATUS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return readBadgerTrackerFallbackInvoices_();
  return getAllRowsAsObjects_(sheet).map(row => {
    const amount = firstPresent_(row, ["amount", "dollar_amount", "total_due"]) || "";
    const paidDate = firstPresent_(row, ["paid_date"]) || "";
    const isVoid = /^(true|yes|y|1)$/i.test(String(firstPresent_(row, ["void", "is_void"]) || "").trim());
    return {
      invoice_number:String(firstPresent_(row, ["invoice_#", "invoice_number", "invoice_no", "invoice"]) || ""),
      badger_id:String(firstPresent_(row, ["badger_id", "id"]) || ""),
      customer_id:String(firstPresent_(row, ["customer_id"]) || ""),
      invoice_date:firstPresent_(row, ["date", "invoice_date"]) || "",
      customer_name:String(firstPresent_(row, ["bill-to", "bill_to", "bill_to_name", "customer_name", "customer"]) || ""),
      amount:amount,
      amount_cents:badgerMoneyToCents_(amount),
      paid_date:paidDate,
      is_paid:!!paidDate,
      is_void:isVoid,
      is_closed:!!paidDate || isVoid,
      modified_date:firstPresent_(row, ["modified"]) || "",
      synced_at:firstPresent_(row, ["synced_at"]) || "",
    };
  });
}

function readBadgerTrackerFallbackInvoices_() {
  const sheet = SpreadsheetApp.openById(BADGER_TRACKER_SPREADSHEET_ID).getSheetByName("Invoices");
  if (!sheet || sheet.getLastRow() < 2) return [];
  return getAllRowsAsObjects_(sheet).map(row => ({
    invoice_number:String(firstPresent_(row, ["invoice_#", "invoice_number", "invoice_no"]) || ""),
    invoice_date:firstPresent_(row, ["invoice_date", "date"]) || "", customer_name:String(firstPresent_(row, ["customer_name", "customer"]) || ""),
    amount:firstPresent_(row, ["amount_due", "amount", "total"]) || "", amount_cents:badgerMoneyToCents_(firstPresent_(row, ["amount_due", "amount", "total"]) || ""),
    is_paid:false, is_void:false, is_closed:false, payment_status:"Unknown", invoice_status:"Unknown",
  }));
}

function getBadgerInvoiceStatusSheet_() {
  return ensureSheet_(getOutreachSs_(), BADGER_STATUS_SHEET_NAME, ["Invoice #", "Badger ID", "Customer ID", "Bill-To", "Date", "Amount", "Paid Date", "Void", "Modified", "Synced At", "App Version"]);
}

function getBadgerSyncLogSheet_() {
  return ensureSheet_(getOutreachSs_(), BADGER_SYNC_LOG_SHEET_NAME, ["Synced At", "Result", "Invoice Count", "Details", "App Version"]);
}

function appendBadgerSyncLog_(result, invoiceCount, details) {
  getBadgerSyncLogSheet_().appendRow([new Date(), result, Number(invoiceCount || 0), String(details || ""), APP_VERSION]);
}

function badgerSyncState_() {
  const sheet = getOutreachSs_().getSheetByName(BADGER_SYNC_LOG_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return { last_good_sync_at:"", is_fresh:false };
  const h = getHeaderMap_(sheet);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const good = rows.map(row => ({ synced_at:row[h.synced_at], result:String(row[h.result] || ""), invoice_count:Number(row[h.invoice_count] || 0) }))
    .filter(item => item.result === "Succeeded" && outreachDate_(item.synced_at))
    .sort((a, b) => recordTimestamp_(b.synced_at) - recordTimestamp_(a.synced_at))[0];
  const timestamp = good ? outreachDate_(good.synced_at) : null;
  const statusSheet = getOutreachSs_().getSheetByName(BADGER_STATUS_SHEET_NAME);
  const rowCountMatches = !!good && !!statusSheet && Math.max(0, statusSheet.getLastRow() - 1) === good.invoice_count;
  return { last_good_sync_at:timestamp ? timestamp.toISOString() : "", is_fresh:!!timestamp && Date.now() - timestamp.getTime() <= BADGER_SYNC_MAX_AGE_MS && rowCountMatches };
}

function badgerPaymentMarks_() {
  const sheet = SpreadsheetApp.openById(BADGER_TRACKER_SPREADSHEET_ID).getSheetByName("Invoices");
  if (!sheet || sheet.getLastRow() < 2) throw new Error("The live Badger tracker Invoices tab is unavailable.");
  const byInvoice = new Map();
  getAllRowsAsObjects_(sheet).forEach(row => {
    const invoiceKey = normalizeBadgerInvoiceNumber_(firstPresent_(row, ["invoice_#", "invoice_number", "invoice_no"]));
    if (!invoiceKey) return;
    byInvoice.set(invoiceKey, { paid_to_me:/^(true|yes|y|1)$/i.test(String(firstPresent_(row, ["paid_to_me", "paid"]) || "").trim()), submitted:String(firstPresent_(row, ["submitted"]) || "").trim() });
  });
  return byInvoice;
}

function getBadgerInvoicePaymentLogSheet_() {
  return ensureSheet_(getOutreachSs_(), BADGER_PAYMENT_LOG_SHEET_NAME, ["Log ID", "Action", "Invoice #", "Old Paid to Me", "New Paid to Me", "Old Submitted", "New Submitted", "Staff", "At", "Check #", "Check Date", "Undone Log ID", "App Version"]);
}

function activeBadgerPaymentMarkInvoiceKeys_() {
  const sheet = getBadgerInvoicePaymentLogSheet_();
  if (sheet.getLastRow() < 2) return new Set();
  const h = getHeaderMap_(sheet);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const undone = new Set(rows.map(row => String(row[h.undone_log_id] || "")).filter(Boolean));
  return new Set(rows.filter(row => String(row[h.action] || "") !== "UNDO_BADGER_PAYMENT" && !undone.has(String(row[h.log_id] || "")))
    .map(row => normalizeBadgerInvoiceNumber_(row[h["invoice_#"]])).filter(Boolean));
}

function badgerTrackerInvoice_(invoiceNumber) {
  const sheet = SpreadsheetApp.openById(BADGER_TRACKER_SPREADSHEET_ID).getSheetByName("Invoices");
  if (!sheet || sheet.getLastRow() < 2) throw new Error("The live Badger tracker Invoices tab is unavailable.");
  const h = getHeaderMap_(sheet);
  if (h.paid_to_me === undefined || h.submitted === undefined) throw new Error("The live tracker is missing Paid to Me or Submitted columns.");
  const key = normalizeBadgerInvoiceNumber_(invoiceNumber);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const index = rows.findIndex(row => normalizeBadgerInvoiceNumber_(row[h["invoice_#"]]) === key);
  if (index < 0) throw new Error(`Invoice ${invoiceNumber} is not in the live Badger tracker.`);
  return { sheet:sheet, headers:h, row:rows[index], row_number:index + 2, invoice_number:String(rows[index][h["invoice_#"]] || invoiceNumber) };
}

function writeBadgerPaymentMark_(invoiceNumber, paidToMe, submitted, action, actor, checkNumber, checkDate, undoneLogId) {
  const tracker = badgerTrackerInvoice_(invoiceNumber);
  const oldPaid = tracker.row[tracker.headers.paid_to_me];
  const oldSubmitted = tracker.row[tracker.headers.submitted];
  if (tracker.headers.submitted === tracker.headers.paid_to_me + 1) tracker.sheet.getRange(tracker.row_number, tracker.headers.paid_to_me + 1, 1, 2).setValues([[!!paidToMe, submitted]]);
  else { tracker.sheet.getRange(tracker.row_number, tracker.headers.paid_to_me + 1).setValue(!!paidToMe); tracker.sheet.getRange(tracker.row_number, tracker.headers.submitted + 1).setValue(submitted); }
  const verified = tracker.sheet.getRange(tracker.row_number, tracker.headers.paid_to_me + 1, 1, 1).getValue();
  if (/^(true|yes|1)$/i.test(String(verified)) !== !!paidToMe) throw new Error("Badger tracker did not retain the payment mark.");
  const log = getBadgerInvoicePaymentLogSheet_(); const h = getHeaderMap_(log); const row = Array(log.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  set("log_id", permanentId_("BPL")); set("action", action); set("invoice_#", tracker.invoice_number); set("old_paid_to_me", oldPaid); set("new_paid_to_me", !!paidToMe); set("old_submitted", oldSubmitted); set("new_submitted", submitted); set("staff", actor); set("at", new Date()); set("check_#", checkNumber || ""); set("check_date", checkDate || ""); set("undone_log_id", undoneLogId || ""); set("app_version", APP_VERSION); log.appendRow(row);
  appendAudit_(action, "Invoice", tracker.invoice_number, "", actor, BADGER_TRACKER_SPREADSHEET_ID, BADGER_PAYMENT_LOG_SHEET_NAME, "Completed", `${oldPaid}/${oldSubmitted} → ${!!paidToMe}/${submitted}`);
}

// All invoices are validated from one tracker snapshot before any mutation.  This
// keeps multi-invoice checks/reconciliation atomic from the application's view and
// avoids one network round-trip, log append, and audit row per invoice.
function writeBadgerPaymentMarksBatch_(updates, action, actor, checkNumber, checkDate) {
  if (!Array.isArray(updates) || !updates.length) return { count:0, invoice_numbers:[] };
  const sheet = SpreadsheetApp.openById(BADGER_TRACKER_SPREADSHEET_ID).getSheetByName("Invoices");
  if (!sheet || sheet.getLastRow() < 2) throw new Error("The live Badger tracker Invoices tab is unavailable.");
  const h = getHeaderMap_(sheet);
  if (h.paid_to_me === undefined || h.submitted === undefined || h["invoice_#"] === undefined) throw new Error("The live tracker is missing Invoice #, Paid to Me, or Submitted columns.");
  const rowCount = sheet.getLastRow() - 1;
  const rows = sheet.getRange(2, 1, rowCount, sheet.getLastColumn()).getValues();
  const byInvoice = new Map();
  rows.forEach((row, index) => {
    const key = normalizeBadgerInvoiceNumber_(row[h["invoice_#"]]);
    if (key) byInvoice.set(key, { row:row, row_number:index + 2, invoice_number:String(row[h["invoice_#"]] || "") });
  });
  const seen = new Set();
  const prepared = updates.map(update => {
    const key = normalizeBadgerInvoiceNumber_(update.invoice_number);
    if (!key || seen.has(key)) throw new Error("Choose each Badger invoice only once.");
    seen.add(key);
    const tracker = byInvoice.get(key);
    if (!tracker) throw new Error(`Invoice ${update.invoice_number} is not in the live Badger tracker.`);
    if (update.require_owed && (!/^(true|yes|1)$/i.test(String(tracker.row[h.paid_to_me])) || String(tracker.row[h.submitted] || "").trim().toLowerCase() !== "no")) {
      throw new Error(`Invoice ${tracker.invoice_number} is not currently owed to Badger.`);
    }
    return Object.assign(tracker, {
      old_paid_to_me:tracker.row[h.paid_to_me], old_submitted:tracker.row[h.submitted],
      paid_to_me:!!update.paid_to_me, submitted:String(update.submitted || ""), undone_log_id:String(update.undone_log_id || ""),
    });
  }).sort((a, b) => a.row_number - b.row_number);
  const blocks = [];
  prepared.forEach(item => {
    const prior = blocks[blocks.length - 1];
    if (prior && prior[prior.length - 1].row_number + 1 === item.row_number) prior.push(item);
    else blocks.push([item]);
  });
  blocks.forEach(block => {
    const firstRow = block[0].row_number;
    if (h.submitted === h.paid_to_me + 1) {
      sheet.getRange(firstRow, h.paid_to_me + 1, block.length, 2).setValues(block.map(item => [item.paid_to_me, item.submitted]));
    } else {
      sheet.getRange(firstRow, h.paid_to_me + 1, block.length, 1).setValues(block.map(item => [item.paid_to_me]));
      sheet.getRange(firstRow, h.submitted + 1, block.length, 1).setValues(block.map(item => [item.submitted]));
    }
  });
  const log = getBadgerInvoicePaymentLogSheet_();
  ensureHeaderColumns_(log, ["Error"]);
  const logHeaders = getHeaderMap_(log); const at = new Date();
  const logRows = prepared.map(item => {
    const row = Array(log.getLastColumn()).fill("");
    const set = (key, value) => { if (logHeaders[key] !== undefined) row[logHeaders[key]] = value; };
    set("log_id", permanentId_("BPL")); set("action", action); set("invoice_#", item.invoice_number); set("old_paid_to_me", item.old_paid_to_me); set("new_paid_to_me", item.paid_to_me); set("old_submitted", item.old_submitted); set("new_submitted", item.submitted); set("staff", actor); set("at", at); set("check_#", checkNumber || ""); set("check_date", checkDate || ""); set("undone_log_id", item.undone_log_id); set("app_version", APP_VERSION);
    return row;
  });
  const appendBatchLog = error => {
    if (error && logHeaders.error !== undefined) logRows.forEach(row => { row[logHeaders.error] = error; });
    log.getRange(log.getLastRow() + 1, 1, logRows.length, log.getLastColumn()).setValues(logRows);
    appendAudit_(action, "Badger payment batch", prepared.map(item => item.invoice_number).join(", "), "", actor, BADGER_TRACKER_SPREADSHEET_ID, BADGER_PAYMENT_LOG_SHEET_NAME, error ? "Verify failed" : "Completed", error || `${prepared.length} invoice(s) updated in one batch.`);
  };
  const firstPaymentColumn = Math.min(h.paid_to_me, h.submitted);
  let verifyFailed = false;
  try {
    const verified = sheet.getRange(2, firstPaymentColumn + 1, rowCount, Math.abs(h.paid_to_me - h.submitted) + 1).getValues();
    verifyFailed = prepared.some(item => {
      const verifiedRow = verified[item.row_number - 2];
      return /^(true|yes|1)$/i.test(String(verifiedRow[h.paid_to_me - firstPaymentColumn])) !== item.paid_to_me
        || String(verifiedRow[h.submitted - firstPaymentColumn] || "").trim() !== item.submitted;
    });
  } catch (error) { appendBatchLog("verify failed"); throw new Error("Badger tracker verification failed after the update."); }
  if (verifyFailed) { appendBatchLog("verify failed"); throw new Error("Badger tracker did not retain every payment mark."); }
  appendBatchLog("");
  return { count:prepared.length, invoice_numbers:prepared.map(item => item.invoice_number) };
}

function apiMarkBadgerInvoicePayment_(p) {
  const invoiceNumber = publicText_(p?.invoice_number || "", 80, "Invoice number");
  const mode = publicText_(p?.mode || "", 40, "Payment mode");
  const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another payment update is in progress. Try again shortly.");
  try {
    const tracker = badgerTrackerInvoice_(invoiceNumber);
    if (mode === "paid_badger") writeBadgerPaymentMark_(invoiceNumber, true, "N/A", "MARK_BADGER_PAID", actor);
    else if (mode === "paid_me") writeBadgerPaymentMark_(invoiceNumber, true, "No", "MARK_PAID_TO_STURGEON", actor);
    // The tracker said the customer paid Sturgeon directly, but they have not. Clear Paid to Me
    // (and the pass-through flag) so the invoice returns to Customer owes. Undo restores both.
    else if (mode === "not_paid") writeBadgerPaymentMark_(invoiceNumber, false, "", "MARK_CUSTOMER_NOT_PAID", actor);
    else if (mode === "undo") {
      const log = getBadgerInvoicePaymentLogSheet_();
      const h = getHeaderMap_(log);
      const rows = log.getLastRow() < 2 ? [] : log.getRange(2, 1, log.getLastRow() - 1, log.getLastColumn()).getValues();
      const undone = new Set(rows.map(row => String(row[h.undone_log_id] || "")).filter(Boolean));
      const prior = rows.map(row => ({ row:row, id:String(row[h.log_id] || ""), action:String(row[h.action] || ""), invoice:String(row[h["invoice_#"]] || "") }))
        .reverse().find(item => item.action !== "UNDO_BADGER_PAYMENT" && !undone.has(item.id) && normalizeBadgerInvoiceNumber_(item.invoice) === normalizeBadgerInvoiceNumber_(invoiceNumber));
      if (!prior) throw new Error("No prior payment mark is available to undo for this invoice.");
      writeBadgerPaymentMark_(invoiceNumber, /^(true|yes|1)$/i.test(String(prior.row[h.old_paid_to_me] || "")), prior.row[h.old_submitted], "UNDO_BADGER_PAYMENT", actor, "", "", prior.id);
    }
    else throw new Error("Choose a supported payment action.");
  } finally { lock.releaseLock(); }
  bumpReadCacheVersion_(["customers"]); clearBadgerInvoiceCache_();
  return { message:"Badger payment mark updated." };
}

function apiRecordBadgerCheck_(p) {
  const invoices = Array.isArray(p?.invoice_numbers) ? p.invoice_numbers.map(value => publicText_(value, 80, "Invoice number")).filter(Boolean) : [];
  const checkNumber = publicText_(p?.check_number || "", 120, "Check number");
  const checkDate = publicText_(p?.check_date || "", 40, "Check date");
  const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  if (!invoices.length || !checkNumber || !checkDate) throw new Error("Select invoices and enter the check number and date.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another payment update is in progress. Try again shortly.");
  try {
    writeBadgerPaymentMarksBatch_(invoices.map(invoiceNumber => ({ invoice_number:invoiceNumber, paid_to_me:true, submitted:"Yes", require_owed:true })), "RECORD_BADGER_CHECK", actor, checkNumber, checkDate);
  }
  finally { lock.releaseLock(); }
  bumpReadCacheVersion_(["customers"]); clearBadgerInvoiceCache_();
  return { message:`Recorded Badger check for ${invoices.length} invoice(s).` };
}

function badgerReconcileGroups_() {
  const marks = badgerPaymentMarks_(); const groups = { paid_not_marked:[], paid_check_no:[], unpaid_review:[], missing_tracker:[] };
  const links = readBadgerInvoiceLinks_();
  readBadgerInvoices_().forEach(invoice => {
    const key = normalizeBadgerInvoiceNumber_(invoice.invoice_number); const mark = marks.get(key);
    if (String(links.get(key)?.match_method || "").trim().toLowerCase() === "void") return;
    if (!mark) { groups.missing_tracker.push(invoice); return; }
    const submitted = String(mark.submitted || "").trim().toLowerCase();
    if (invoice.is_paid && !mark.paid_to_me) groups.paid_not_marked.push(invoice);
    else if (invoice.is_paid && submitted === "no") groups.paid_check_no.push(invoice);
    else if (!invoice.is_closed && mark.paid_to_me && submitted && submitted !== "no" && submitted !== "n/a") groups.unpaid_review.push(invoice);
  });
  return groups;
}

function apiBadgerReconcilePreview_() { return { groups:badgerReconcileGroups_() }; }

function apiApplyBadgerReconcile_(p) {
  const group = publicText_(p?.group || "", 40, "Reconcile group"); const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  if (!new Set(["paid_not_marked", "paid_check_no"]).has(group)) throw new Error("This group requires manual review; it cannot be applied automatically.");
  let invoices = []; const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another payment update is in progress. Try again shortly.");
  try {
    invoices = badgerReconcileGroups_()[group] || [];
    writeBadgerPaymentMarksBatch_(invoices.map(invoice => ({ invoice_number:invoice.invoice_number, paid_to_me:true, submitted:group === "paid_not_marked" ? "N/A" : "Yes" })), "RECONCILE_BADGER_PAYMENT", actor);
  }
  finally { lock.releaseLock(); }
  bumpReadCacheVersion_(["outreach", "customers"]); clearBadgerInvoiceCache_(); return { message:`Applied ${invoices.length} reconciliation update(s).`, count:invoices.length };
}

function badgerResponseNeedsSessionRefresh_(method, path, status, responseText) {
  // A create is never replayed: after its immediately preceding validation GET,
  // an unreadable or unusual response is an unknown outcome, not a retry signal.
  if (String(method || "").toUpperCase() === "POST" && String(path || "") === "/api/invoice") return false;
  if (status === 401 || (status >= 300 && status < 400)) return true;
  try {
    const payload = JSON.parse(responseText);
    const errors = Array.isArray(payload?.errors) ? payload.errors : [];
    return payload?.isAuthorized === false && !errors.length && payload?.hasErrors !== true;
  } catch (_) { return true; }
}

function badgerRequest_(path, options) {
  const requestOptions = Object.assign({}, options || {});
  const method = String(requestOptions.method || "get").toUpperCase();
  const url = badgerUrl_(method, path);
  const send = forceRefresh => UrlFetchApp.fetch(url, Object.assign({}, requestOptions, { method:method.toLowerCase(), headers:Object.assign({}, requestOptions.headers || {}, { Cookie:badgerSession_(forceRefresh) }), muteHttpExceptions:true, followRedirects:false }));
  let response = send(false);
  const status = response.getResponseCode();
  const requiresRefresh = badgerResponseNeedsSessionRefresh_(method, path, status, response.getContentText());
  if (requiresRefresh) response = send(true);
  return response;
}

function fetchBadgerInvoices_() {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const invoices = [];
  let totalCount = null;
  for (let page = 0; page < 100; page += 1) {
    const response = badgerRequest_("/Api/invoice/Paged", { method:"post", contentType:"application/json", payload:JSON.stringify({ pageSize:500, page:page, sorts:[], filters:[], parameters:{ rangeStart:"2024-01-01T00:00:00-06:00", rangeEnd:`${today}T23:59:59-06:00`, status:"All" } }) });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error(`Badger invoice sync failed (HTTP ${response.getResponseCode()}).`);
    let payload;
    try { payload = JSON.parse(response.getContentText()); } catch (_) { throw new Error("Badger invoice sync returned invalid JSON."); }
    const data = payload && payload.data;
    const count = Number(data && data.totalCount);
    if (!data || !Number.isInteger(count) || count < 0 || !Array.isArray(data.data)) throw new Error("Badger invoice sync returned an unexpected response shape.");
    if (totalCount === null) totalCount = count;
    if (totalCount !== count) throw new Error("Badger invoice count changed during synchronization; no status data was written.");
    data.data.forEach(invoice => {
      if (!invoice || !String(invoice.id || "").trim() || !String(invoice.number || "").trim()) throw new Error("Badger invoice sync returned an incomplete invoice record.");
      invoices.push(invoice);
    });
    if (invoices.length === totalCount) return invoices;
    if (!data.data.length || invoices.length > totalCount) throw new Error("Badger invoice sync returned an incomplete page sequence.");
  }
  throw new Error("Badger invoice sync exceeded the safe page limit.");
}

function syncBadgerStatus_(actor) {
  let invoices;
  try { invoices = fetchBadgerInvoices_(); }
  catch (error) {
    const failedLock = LockService.getScriptLock();
    if (failedLock.tryLock(10000)) {
      try { appendBadgerSyncLog_("Failed", 0, error && error.message || String(error)); }
      finally { failedLock.releaseLock(); }
    }
    throw error;
  }
  const syncedAt = new Date();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another Badger status write is in progress. Try again shortly.");
  try {
    const sheet = getBadgerInvoiceStatusSheet_();
    const headers = ["Invoice #", "Badger ID", "Customer ID", "Bill-To", "Date", "Amount", "Paid Date", "Void", "Modified", "Synced At", "App Version"];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (invoices.length) sheet.getRange(2, 1, invoices.length, headers.length).setValues(invoices.map(invoice => [String(invoice.number || ""), String(invoice.id || ""), String(invoice.customerId || ""), String(invoice.billToName || ""), invoice.date || "", invoice.dollarAmount || "", invoice.paidDate || "", !!invoice.isVoid, invoice.modifiedDate || "", syncedAt, APP_VERSION]));
    const extraRows = sheet.getLastRow() - invoices.length - 1;
    if (extraRows > 0) sheet.getRange(invoices.length + 2, 1, extraRows, headers.length).clearContent();
    appendBadgerSyncLog_("Succeeded", invoices.length, `Synced by ${String(actor || "staff")}.`);
  } finally { lock.releaseLock(); }
  bumpReadCacheVersion_(["outreach", "customers"]);
  clearBadgerInvoiceCache_();
  return { message:`Badger status synchronized: ${invoices.length} invoices.`, invoice_count:invoices.length, synced_at:syncedAt.toISOString() };
}

function apiSyncBadgerStatus_(p) {
  return syncBadgerStatus_(authenticatedActor_(p, "Sturgeon Distribution Hub"));
}

function badgerMoneyToCents_(value) {
  const normalized = String(value ?? "").replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

function badgerMoneyLabel_(cents) {
  return `$${(Math.max(0, Number(cents) || 0) / 100).toFixed(2)}`;
}

function badgerInvoicePaymentState_(isFresh, isClosed, paidToMe, submitted) {
  if (!isFresh) return "Unknown";
  if (isClosed) return "Closed";
  if (!paidToMe) return "Customer owes";
  const submittedValue = String(submitted || "").trim().toLowerCase();
  if (submittedValue === "no") return "Owed to Badger";
  if (submittedValue === "yes") return "Check sent";
  return "Awaiting Badger";
}

function cachedBadgerInvoices_(bypassCache) {
  const cache = CacheService.getScriptCache();
  const manifestKey = `${BADGER_INVOICE_CACHE_PREFIX}:manifest`;
  if (!bypassCache) {
    try {
      const manifest = JSON.parse(cache.get(manifestKey) || "null");
      if (manifest && Number.isInteger(manifest.parts) && manifest.parts > 0) {
        let serialized = "";
        for (let index = 0; index < manifest.parts; index += 1) {
          const chunk = cache.get(`${BADGER_INVOICE_CACHE_PREFIX}:part:${index}`);
          if (chunk === null) { serialized = ""; break; }
          serialized += chunk;
        }
        if (serialized) return JSON.parse(serialized);
      }
    } catch (error) {
      console.warn("Badger invoice cache read failed: " + String(error && error.message || error));
    }
  }

  const invoices = readBadgerInvoices_();
  if (!bypassCache) cacheBadgerInvoices_(invoices, cache);
  return invoices;
}

function cacheBadgerInvoices_(invoices, cache) {
  const targetCache = cache || CacheService.getScriptCache();
  try {
    const serialized = JSON.stringify(invoices);
    const chunks = serialized.match(new RegExp(`[\\s\\S]{1,${BADGER_INVOICE_CACHE_CHUNK_SIZE}}`, "g")) || ["[]"];
    chunks.forEach((chunk, index) => targetCache.put(`${BADGER_INVOICE_CACHE_PREFIX}:part:${index}`, chunk, BADGER_INVOICE_CACHE_TTL_SECONDS));
    targetCache.put(`${BADGER_INVOICE_CACHE_PREFIX}:manifest`, JSON.stringify({ parts:chunks.length }), BADGER_INVOICE_CACHE_TTL_SECONDS);
  } catch (error) {
    console.warn("Badger invoice cache write failed: " + String(error && error.message || error));
  }
}

function clearBadgerInvoiceCache_() {
  const cache = CacheService.getScriptCache();
  const manifestKey = `${BADGER_INVOICE_CACHE_PREFIX}:manifest`;
  try { cache.remove(BADGER_LOCATION_NAMES_CACHE_KEY); } catch (_) {}
  try { cache.remove(`${BADGER_INVOICE_CACHE_PREFIX}:current_prices`); } catch (_) {}
  try {
    const manifest = JSON.parse(cache.get(manifestKey) || "null");
    cache.remove(manifestKey);
    if (manifest && Number.isInteger(manifest.parts) && manifest.parts > 0) {
      for (let index = 0; index < manifest.parts; index += 1) cache.remove(`${BADGER_INVOICE_CACHE_PREFIX}:part:${index}`);
    }
  } catch (error) {
    console.warn("Badger invoice cache clear failed: " + String(error && error.message || error));
  }
}

function badgerVolumeUnitOfMeasureId_(volume) {
  const normalized = String(volume || "").toLowerCase().replace(/\s/g, "");
  return ({ "750ml":3, "375ml":5, "1.75l":20, "1750ml":20, "1500ml":2, "330ml":6, "200ml":25, "187ml":7, "100ml":26, "50ml":19 })[normalized] || "";
}

// ---------- Toast stock import (2026.10.04.20-APP) ----------
// Save Toast's 86 Report CSV (Reports > Menus > 86 Report, threshold 9999) into the "Toast 86 Reports" Drive folder.
// An hourly trigger (installToastStockImport) reads the newest unread report and writes each SKU's toast_stock and
// toast_stock_date, matching the SKU's toast_item_name exactly (case and spacing ignored). Nothing else in SKUs changes.
const TOAST_REPORT_FOLDER_ID = "1kwjhWWg4KONWlcl-FmQ8oXeR9De6e5d_";
const TOAST_STOCK_LAST_FILE_PROPERTY = "TOAST_STOCK_LAST_FILE";
const TOAST_STOCK_GROUPS = ["750 ml", "375 ml", "box sets"]; // Toast 86 Report "Group Name" values that are wholesale products

function installToastStockImport() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === "importLatestToastStockReport")
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("importLatestToastStockReport").timeBased().everyHours(1).create();
  return { message:"Toast stock import installed. It checks the Toast 86 Reports folder every hour." };
}

function toastItemKey_(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function parseToast86Report_(csvText) {
  const rows = Utilities.parseCsv(String(csvText || "").replace(/^﻿/, ""));
  if (!rows.length) throw new Error("The Toast report is empty.");
  const header = rows[0].map(cell => String(cell || "").trim().toLowerCase());
  const col = name => header.indexOf(name);
  const itemCol = col("item name"); const qtyCol = col("quantity remaining"); const groupCol = col("group name"); const menuCol = col("menu name");
  if (itemCol < 0 || qtyCol < 0) throw new Error("This does not look like a Toast 86 Report (missing Item Name or Quantity Remaining).");
  return rows.slice(1).filter(row => String(row[itemCol] || "").trim()).map(row => ({
    menu:menuCol < 0 ? "" : String(row[menuCol] || "").trim(),
    group:groupCol < 0 ? "" : String(row[groupCol] || "").trim(),
    item:String(row[itemCol] || "").trim(),
    quantity:Number(row[qtyCol]),
  }));
}

// Pure: decides the new stock for each SKU row. skuRows are objects from SKUs; reportRows from parseToast86Report_.
function toastStockUpdates_(skuRows, reportRows) {
  const stock = new Map();
  (reportRows || []).forEach(row => {
    const key = toastItemKey_(row.item);
    if (key && Number.isFinite(row.quantity) && !stock.has(key)) stock.set(key, row.quantity);
  });
  const mapped = new Set();
  const updates = [];
  const missing = [];
  const cleared = [];
  (skuRows || []).forEach((sku, index) => {
    const key = toastItemKey_(sku.toast_item_name);
    if (!key) return;
    mapped.add(key);
    if (stock.has(key)) updates.push({ index:index, sku_id:String(sku.sku_id || ""), stock:stock.get(key) });
    else { missing.push(String(sku.sku_id || "")); cleared.push({ index:index, sku_id:String(sku.sku_id || "") }); }
  });
  const groups = new Set(TOAST_STOCK_GROUPS);
  const unmapped = Array.from(new Set((reportRows || [])
    .filter(row => groups.has(String(row.group || "").trim().toLowerCase()) && !mapped.has(toastItemKey_(row.item)))
    .map(row => row.item)));
  return { updates:updates, cleared:cleared, missing_in_report:missing, unmapped_toast_items:unmapped };
}

function importLatestToastStockReport() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { message:"Another update is running; the Toast import will try again next hour." };
  try {
    const files = [];
    const iterator = DriveApp.getFolderById(TOAST_REPORT_FOLDER_ID).getFiles();
    while (iterator.hasNext()) {
      const file = iterator.next();
      if (/\.csv$/i.test(file.getName()) || /csv/i.test(file.getMimeType())) files.push(file);
    }
    if (!files.length) return { message:"No Toast 86 Report CSV is in the folder yet." };
    files.sort((a, b) => b.getDateCreated().getTime() - a.getDateCreated().getTime());
    const latest = files[0];
    const props = PropertiesService.getScriptProperties();
    const marker = `${latest.getId()}:${latest.getLastUpdated().getTime()}`;
    if (props.getProperty(TOAST_STOCK_LAST_FILE_PROPERTY) === marker) return { message:`Already imported ${latest.getName()}.` };

    const report = parseToast86Report_(latest.getBlob().getDataAsString("ISO-8859-1"));
    const nameDate = latest.getName().match(/(\d{4})[_-](\d{2})[_-](\d{2})/);
    const reportDate = nameDate ? `${nameDate[1]}-${nameDate[2]}-${nameDate[3]}` : Utilities.formatDate(latest.getDateCreated(), "America/Chicago", "yyyy-MM-dd");

    const sheet = getSheet_(SHEET_NAMES.SKUS);
    const h = getHeaderMap_(sheet);
    ["toast_item_name", "toast_stock", "toast_stock_date"].forEach(key => {
      if (h[key] === undefined) throw new Error(`SKUs is missing the ${key} column.`);
    });
    const skuRows = getAllRowsAsObjects_(sheet);
    const result = toastStockUpdates_(skuRows, report);
    if (skuRows.length) {
      const stockRange = sheet.getRange(2, h.toast_stock + 1, skuRows.length, 1);
      const dateRange = sheet.getRange(2, h.toast_stock_date + 1, skuRows.length, 1);
      const stockValues = stockRange.getValues();
      const dateValues = dateRange.getValues();
      result.updates.forEach(update => { stockValues[update.index][0] = update.stock; dateValues[update.index][0] = reportDate; });
      // A mapped SKU missing from the newest report has unknown stock: clear it (never assume zero) so the order page
      // shows "Staff will confirm availability" instead of an old "In stock".
      result.cleared.forEach(item => { stockValues[item.index][0] = ""; dateValues[item.index][0] = ""; });
      stockRange.setValues(stockValues);
      dateRange.setValues(dateValues);
    }
    props.setProperty(TOAST_STOCK_LAST_FILE_PROPERTY, marker);
    bumpReadCacheVersion_(["inventory", "customers"]);
    rebuildReadCaches_(["inventory"]); // Orders & Accounts is left to the warmer: its rebuild is the slow one (.84)
    const detail = `${latest.getName()}: ${result.updates.length} SKUs updated; ${result.missing_in_report.length} mapped SKUs not in the report, stock cleared (${result.missing_in_report.slice(0, 20).join(", ")}); ${result.unmapped_toast_items.length} Toast bottles with no SKU (${result.unmapped_toast_items.slice(0, 20).join(", ")}).`;
    appendAudit_("IMPORT_TOAST_STOCK", "SKUs", latest.getId(), "", "Toast stock import", "Toast 86 Report", SHEET_NAMES.SKUS, "Completed", detail);
    console.log(JSON.stringify({ event:"toast_stock_import", file:latest.getName(), updated:result.updates.length, missing:result.missing_in_report, unmapped:result.unmapped_toast_items }));
    return { message:detail, updated:result.updates.length, missing_in_report:result.missing_in_report, unmapped_toast_items:result.unmapped_toast_items };
  } finally { lock.releaseLock(); }
}

// Wholesale pricing lives with the products (2026.10.04.20-APP). Each active SKU row has a price_tier and an
// optional wholesale_price override; the tier amounts are one row each on the Price Tiers tab, and account-specific
// deals are rows on the Customer Prices tab. All three are in the operational inventory workbook beside SKUs.
function priceTierCents_() {
  const sheet = getSs_().getSheetByName(PRICE_TIERS_SHEET_NAME);
  const tiers = new Map();
  tiers.conflicts = [];
  if (!sheet || sheet.getLastRow() < 2) return tiers;
  const conflicts = new Set();
  getAllRowsAsObjects_(sheet).forEach(row => {
    const tier = String(row.tier || "").trim().toLowerCase();
    const cents = badgerMoneyToCents_(firstPresent_(row, ["price", "wholesale_price", "unit_price"]));
    if (!tier || !(cents > 0)) return;
    if (tiers.has(tier) && tiers.get(tier) !== cents) conflicts.add(tier); else tiers.set(tier, cents);
  });
  // Two rows for one tier with different prices: price nothing in that tier, so invoices block until the tab is fixed.
  conflicts.forEach(tier => tiers.delete(tier));
  tiers.conflicts = Array.from(conflicts);
  return tiers;
}

function skuWholesaleCents_(sku, tiers) {
  const override = badgerMoneyToCents_(sku.wholesale_price);
  if (override > 0) return override;
  return tiers.get(String(sku.price_tier || "").trim().toLowerCase()) || 0;
}

function skuInvoiceVolume_(sku) {
  // invoice_volume lets a product invoice at a different Badger size than it is sold as (gift boxes: 5 x 100 mL sold, 500 mL invoiced).
  return String(sku.invoice_volume || sku.size || "").trim();
}

function skuPriceRow_(sku, cents, accountId) {
  const size = skuInvoiceVolume_(sku);
  return {
    sku_id:String(sku.sku_id || "").trim(), description:String(sku.sku_name || "").trim(), unit_price_cents:cents,
    volume:size, unit_of_measure_id:Number(badgerVolumeUnitOfMeasureId_(size) || 0), proof:Number(sku.proof || 0),
    beverage_class:"Spirit", account_id:String(accountId || "").trim(), updated_at:"",
  };
}

// Active Customer Prices rows that repeat one SKU + account with different prices. Keys are "sku_id|account_id".
function customerPriceConflicts_(customerRows) {
  const seen = new Map(); const conflicts = new Set();
  (customerRows || []).forEach(row => {
    if (!toBool_(row.active)) return;
    const key = `${String(row.sku_id || "").trim()}|${String(row.account_id || "").trim()}`;
    const cents = badgerMoneyToCents_(firstPresent_(row, ["price", "unit_price", "wholesale_price"]));
    if (seen.has(key) && seen.get(key) !== cents) conflicts.add(key); else seen.set(key, cents);
  });
  return conflicts;
}

function wholesalePriceRows_(skuRows, tierCents, customerRows) {
  const activeSkus = new Map();
  const rows = [];
  (skuRows || []).forEach(sku => {
    const skuId = String(sku.sku_id || "").trim();
    if (!skuId || !toBool_(sku.active)) return;
    activeSkus.set(skuId, sku);
    const cents = skuWholesaleCents_(sku, tierCents);
    if (cents > 0) rows.push(skuPriceRow_(sku, cents, ""));
  });
  const conflicts = customerPriceConflicts_(customerRows);
  const added = new Set();
  (customerRows || []).forEach(row => {
    if (!toBool_(row.active)) return;
    const sku = activeSkus.get(String(row.sku_id || "").trim());
    const accountId = String(row.account_id || "").trim();
    const key = `${String(row.sku_id || "").trim()}|${accountId}`;
    if (!sku || !accountId || added.has(key)) return;
    // A conflicting deal gets a zero price so this account's invoice blocks instead of silently using one row or the tier.
    const cents = conflicts.has(key) ? 0 : badgerMoneyToCents_(firstPresent_(row, ["price", "unit_price", "wholesale_price"]));
    if (cents > 0 || conflicts.has(key)) { rows.push(skuPriceRow_(sku, cents, accountId)); added.add(key); }
  });
  return rows;
}

// Lists catalog problems a person must fix: active products that cannot be priced or invoiced, SKU tiers that are not
// on the Price Tiers tab (for example after a tier is renamed there), and duplicate Price Tiers or Customer Prices rows
// with different prices. not_stock_tracked is information, not a problem: active products with no Toast item (bitters
// are Toast modifiers) show "Staff will confirm availability". Run checkWholesaleCatalog() from the Apps Script editor.
function wholesaleCatalogProblems_(skuRows, tierCents, customerRows) {
  const problems = { unknown_tier:[], no_price:[], no_proof:[], no_invoice_unit:[],
    tier_conflicts:(tierCents.conflicts || []).slice(), customer_price_conflicts:Array.from(customerPriceConflicts_(customerRows)), not_stock_tracked:[] };
  (skuRows || []).forEach(sku => {
    const id = String(sku.sku_id || "").trim();
    if (!id) return;
    const tier = String(sku.price_tier || "").trim();
    if (tier && !tierCents.has(tier.toLowerCase()) && !(tierCents.conflicts || []).includes(tier.toLowerCase()) && !(badgerMoneyToCents_(sku.wholesale_price) > 0)) problems.unknown_tier.push(`${id} (${tier})`);
    if (!toBool_(sku.active)) return;
    if (!(skuWholesaleCents_(sku, tierCents) > 0)) problems.no_price.push(id);
    if (!(Number(sku.proof) > 0)) problems.no_proof.push(id);
    if (!badgerVolumeUnitOfMeasureId_(skuInvoiceVolume_(sku))) problems.no_invoice_unit.push(`${id} (${skuInvoiceVolume_(sku) || "no size"})`);
    if (!String(sku.toast_item_name || "").trim()) problems.not_stock_tracked.push(id);
  });
  return problems;
}

function checkWholesaleCatalog() {
  const customerSheet = getSs_().getSheetByName(CUSTOMER_PRICES_SHEET_NAME);
  const customerRows = customerSheet && customerSheet.getLastRow() >= 2 ? getAllRowsAsObjects_(customerSheet) : [];
  const problems = wholesaleCatalogProblems_(getAllRowsAsObjects_(getSheet_(SHEET_NAMES.SKUS)), priceTierCents_(), customerRows);
  console.log(JSON.stringify(problems, null, 2));
  return problems;
}

function badgerCurrentPrices_(bypassCache) {
  const cache = CacheService.getScriptCache(); const cacheKey = `${BADGER_INVOICE_CACHE_PREFIX}:current_prices`;
  if (!bypassCache) {
    try { const cached = JSON.parse(cache.get(cacheKey) || "null"); if (Array.isArray(cached)) return cached; } catch (_) {}
  }
  const customerSheet = getSs_().getSheetByName(CUSTOMER_PRICES_SHEET_NAME);
  const customerRows = customerSheet && customerSheet.getLastRow() >= 2 ? getAllRowsAsObjects_(customerSheet) : [];
  const rows = wholesalePriceRows_(getAllRowsAsObjects_(getSheet_(SHEET_NAMES.SKUS)), priceTierCents_(), customerRows);
  try { cache.put(cacheKey, JSON.stringify(rows), BADGER_INVOICE_CACHE_TTL_SECONDS); } catch (_) {}
  return rows;
}

function badgerPriceForOrderLine_(prices, accountId, line) {
  const candidates = prices.filter(price => price.sku_id === String(line.sku_id || ""));
  return candidates.find(price => price.account_id === String(accountId || "")) || candidates.find(price => !price.account_id) || null;
}

function getBadgerInvoiceCreationsSheet_() {
  return ensureSheet_(getOutreachSs_(), BADGER_INVOICE_CREATIONS_SHEET_NAME, ["Request ID", "Invoice #", "Customer ID", "Total Cents", "Fingerprint", "Status", "Badger Invoice ID", "Staff", "At", "Error", "App Version"]);
}

function badgerInvoiceCreationRows_(requestId) {
  const sheet = getBadgerInvoiceCreationsSheet_(); const h = getHeaderMap_(sheet);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return rows.map((row, index) => ({ row:row, row_number:index + 2, request_id:String(row[h.request_id] || ""), invoice_number:String(row[h["invoice_#"]] || ""), customer_id:String(row[h.customer_id] || ""), total_cents:Number(row[h.total_cents] || 0), fingerprint:String(row[h.fingerprint] || ""), status:String(row[h.status] || ""), badger_invoice_id:String(row[h.badger_invoice_id] || ""), at:row[h.at] || "", error:String(row[h.error] || "") })).filter(item => !requestId || item.request_id === String(requestId));
}

function badgerJson_(path, options, label) {
  const response = badgerRequest_(path, options || {}); const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error(`${label || "Badger request"} failed (HTTP ${status}).`);
  try { return JSON.parse(response.getContentText()); } catch (_) { throw new Error(`${label || "Badger request"} returned invalid JSON.`); }
}

function badgerRemoteInvoiceByNumber_(invoiceNumber) {
  const payload = badgerJson_("/Api/Invoice/Paged/orderorinvoicenumber", { method:"post", contentType:"application/json", payload:JSON.stringify({ pageSize:20, page:0, sorts:[], filters:[], parameters:{ value:String(invoiceNumber || "") } }) }, "Badger invoice lookup");
  const rows = Array.isArray(payload?.data?.data) ? payload.data.data : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  const key = normalizeBadgerInvoiceNumber_(invoiceNumber);
  return rows.find(row => normalizeBadgerInvoiceNumber_(row.number || row.invoiceNumber || row.invoice_number) === key) || null;
}

function badgerRemoteInvoiceDetails_(invoiceId) {
  if (!/^\d+$/.test(String(invoiceId || ""))) throw new Error("Badger invoice ID is invalid.");
  const payload = badgerJson_(`/api/invoice/${invoiceId}`, { method:"get" }, "Badger invoice confirmation");
  return payload?.data || payload;
}

function badgerValidationError_(payload) {
  const data = payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
  if (data?.isSuccess === true && data?.hasErrors !== true) return "";
  const errors = Array.isArray(data?.errors) ? data.errors : Array.isArray(payload?.errors) ? payload.errors : [];
  return String(errors[0] || "number taken — preview again");
}

function badgerValidateInvoiceNumber_(invoiceNumber, date) {
  if (!/^SS[1-9]\d{0,3}$/.test(String(invoiceNumber || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw new Error("Proposed Badger invoice number or date is invalid.");
  // Badger compares numbers as text, so it would accept SS0172 next to SS172; the tracker import treats them as the
  // same invoice. Refuse any number whose value is already used, with or without leading zeros (2026.11.17.74-APP).
  const serial = badgerInvoiceSerial_(invoiceNumber);
  const clash = readBadgerInvoices_().find(invoice => badgerInvoiceSerial_(invoice.invoice_number) === serial);
  if (clash) throw new Error(`Invoice number ${invoiceNumber} is already used in Badger (${clash.invoice_number}). Preview again for the next number.`);
  const orderNumber = String(invoiceNumber).slice(2);
  const payload = badgerJson_(`/api/invoice/validateforcreate?number=${orderNumber}&date=${date}`, { method:"get" }, "Badger invoice-number validation");
  const error = badgerValidationError_(payload);
  if (error) throw new Error(error);
  return true;
}

function badgerOrderForInvoice_(requestId) {
  const sheet = getOnlineOrderRequestsSheet_(false);
  if (!sheet) throw new Error("Online Order Requests sheet is missing.");
  const rowNumber = findRecordRow_(sheet, "request_id", requestId);
  if (!rowNumber) throw new Error("Order request not found.");
  const h = getHeaderMap_(sheet); const row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  const raw = Object.keys(h).reduce((item, key) => { item[key] = row[h[key]]; return item; }, { source_row:rowNumber });
  const lines = rowsWithSource_(getOnlineOrderLinesSheet_(false)).filter(line => String(line.request_id || "") === String(requestId || ""));
  return { sheet:sheet, headers:h, row_number:rowNumber, order:onlineOrderRecord_(raw, new Map([[String(requestId || ""), lines]])) };
}

function badgerCustomerIdForAccount_(accountId, account) {
  const directory = getOutreachSheet_(OUTREACH_SHEET_NAME); const directoryRow = getAllRowsAsObjects_(directory).find(row => String(row.account_id || "") === String(accountId || "")) || {};
  const override = String(directoryRow.badger_customer_id || "").trim();
  if (/^\d+$/.test(override)) return override;
  const paymentAccount = account || currentBadgerPaymentAccount_(accountId, false);
  const match = (paymentAccount.invoices || []).filter(invoice => invoice.badger_match_status === "Matched" && /^\d+$/.test(String(invoice.customer_id || "")))
    .sort((a, b) => recordTimestamp_(b.invoice_date) - recordTimestamp_(a.invoice_date))[0];
  if (!match) throw new Error("This customer has no invoice in Badger yet. Add them at badgerstatecoop.com if needed, enter their first invoice there by hand, and after the daily Badger sync links it, the Hub can create their invoices.");
  return String(match.customer_id);
}

// Badger's own invoice ID on each order, for the Hub's Print invoice button (2026.11.17.76-APP). Badger prints an
// invoice at /BSWCSite/member/invoice/print/<Badger ID> (Karl, 2026-11-17). Invoices the Hub created are on Badger
// Invoice Creations at once; others come from the synced Badger Invoice Status tab by invoice number.
function badgerInvoiceIdsForOrders_(orders) {
  const byRequest = new Map(), byNumber = new Map();
  try {
    const sheet = getOutreachSs_().getSheetByName(BADGER_INVOICE_CREATIONS_SHEET_NAME);
    if (sheet && sheet.getLastRow() > 1) rowsWithSource_(sheet).forEach(row => {
      if (String(row.status || "") === "CREATED" && /^\d+$/.test(String(row.badger_invoice_id || ""))) byRequest.set(String(row.request_id || ""), String(row.badger_invoice_id));
    });
  } catch (error) { console.warn("Badger invoice creations unavailable: " + String(error?.message || error)); }
  try {
    readBadgerInvoices_().forEach(invoice => { if (/^\d+$/.test(invoice.badger_id)) byNumber.set(normalizeBadgerInvoiceNumber_(invoice.invoice_number), invoice.badger_id); });
  } catch (error) { console.warn("Badger invoice status unavailable: " + String(error?.message || error)); }
  (orders || []).forEach(order => {
    const number = normalizeBadgerInvoiceNumber_(order.badger_invoice_number);
    order.badger_invoice_id = number ? (byRequest.get(String(order.request_id || "")) || byNumber.get(number) || "") : "";
  });
}

// Invoice preview and create read the account from the Hub's read cache (2026.11.17.72-APP). Rebuilding the whole
// Orders & Accounts queue (15-20 s) and then calling Badger four times ran past the staff proxy's 25 s limit (Karl,
// 2026-11-17, Acorn Ridge order: "Google Sheets took too long to answer"). The account is only used for its Badger
// customer ID and last invoice, which don't change between loading the page and previewing; any write (linking an
// invoice, saving the order) starts a new cache version. An account missing from the cache falls back to a rebuild.
function badgerInvoiceAccount_(accountId) {
  let cached = null;
  try { cached = apiGetCustomerWorkQueue_({}); } catch (error) { console.warn("Cached work queue unavailable: " + String(error?.message || error)); }
  const account = (cached?.accounts || []).find(item => String(item.account_id || "") === String(accountId || ""));
  return account || currentBadgerPaymentAccount_(accountId, false);
}

// Invoice numbers (2026.11.17.74-APP). Karl's invoices ran SS0163-SS0170, then were entered as SS171-SS173 without
// the leading zero. Reading only four-digit numbers, the Hub skipped SS171-SS173 and created SS0171 beside Fox and
// Crow's SS171 (Karl, 2026-11-17). The next number now counts every SS invoice by value and is written without
// leading zeros, matching the newest invoices: after SS173 comes SS174.
function badgerInvoiceSerial_(invoiceNumber) {
  const match = /^SS0*(\d{1,4})$/.exec(normalizeBadgerInvoiceNumber_(invoiceNumber));
  return match ? Number(match[1]) : null;
}

function badgerNextInvoiceNumber_() {
  const highest = readBadgerInvoices_().map(invoice => badgerInvoiceSerial_(invoice.invoice_number)).filter(serial => serial !== null).reduce((max, serial) => Math.max(max, serial), 0);
  if (highest >= 9999) throw new Error("No four-digit Badger invoice number remains.");
  return `SS${highest + 1}`;
}

function badgerBillToCustomer_(customer) {
  const source = customer || {};
  return {
    id:source.id || "", billToName:String(source.name || source.billToName || "").trim(),
    billToResellerNumber:String(source.resellerNumber || source.billToResellerNumber || "").trim(),
    billToAddressLine1:String(source.addressLine1 || source.billToAddressLine1 || "").trim(),
    billToAddressLine2:String(source.addressLine2 || source.billToAddressLine2 || "").trim(),
    billToCity:String(source.city || source.billToCity || "").trim(),
    billToPostalCode:String(source.postalCode || source.billToPostalCode || "").trim(),
    email:String(source.email || "").trim(), phone:String(source.phone || "").trim(),
  };
}

function badgerInvoiceDraft_(requestId, p, skipValidation, accountSnapshot) {
  const source = badgerOrderForInvoice_(requestId); const order = source.order;
  if (String(order.workflow_status || "") !== "Confirmed") throw new Error("Only Confirmed orders can create a Badger invoice.");
  if (String(order.badger_invoice_number || "").trim()) throw new Error("This order already has a Badger invoice.");
  if (!String(order.account_id || "").trim()) throw new Error("Link this order to an account before creating a Badger invoice.");
  const account = accountSnapshot || badgerInvoiceAccount_(order.account_id);
  const customerId = badgerCustomerIdForAccount_(order.account_id, account);
  const customer = badgerJson_(`/api/customer/${customerId}`, { method:"get" }, "Badger customer lookup");
  const customerData = badgerBillToCustomer_(customer?.data || customer);
  if (!customerData.billToName || !customerData.billToAddressLine1) throw new Error("Badger customer needs a name and address before this invoice can be previewed.");
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const date = String(p?.date || today).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invoice date must use YYYY-MM-DD.");
  // Always a fresh catalog read: a price, tier or proof fixed in the inventory workbook must reach preview and create at once.
  const prices = badgerCurrentPrices_(true); const overrides = new Map((Array.isArray(p?.lines) ? p.lines : []).map(line => [String(line.sku_id || ""), line]));
  const blocked = [];
  const lines = (order.lines || []).map(line => {
    const price = badgerPriceForOrderLine_(prices, order.account_id, line); const override = overrides.get(String(line.sku_id || "")) || {};
    if (!price) { blocked.push(String(line.sku_name || line.sku_id || "product")); return null; }
    const requested = Number(override.quantity !== undefined ? override.quantity : (line.quantity || 0)); const bottles = /case/i.test(String(line.unit || "")) ? requested * Number(line.units_per_case || 0) : requested;
    const cents = override.unit_price === undefined ? price.unit_price_cents : badgerMoneyToCents_(override.unit_price);
    if (!(bottles > 0) || !(cents > 0) || !(price.unit_of_measure_id > 0) || !(price.proof > 0)) { blocked.push(String(line.sku_name || line.sku_id || "product")); return null; }
    return { sku_id:String(line.sku_id || ""), quantity:bottles, description:price.description, unit_price_cents:cents, unitPrice:cents / 100, unitOfMeasureId:price.unit_of_measure_id, beverageClass:price.beverage_class, alcoholProof:price.proof };
  }).filter(Boolean);
  if (blocked.length) throw new Error(`Each product needs an active SKU row with a size, a price (price tier or wholesale price, with no conflicting duplicate Price Tiers or Customer Prices rows), and proof before invoicing: ${blocked.join(", ")}.`);
  const number = String((skipValidation && p?.invoice_number) || badgerNextInvoiceNumber_()).trim();
  if (!skipValidation) badgerValidateInvoiceNumber_(number, date);
  const total_cents = lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unit_price_cents), 0);
  const fingerprint = sha256_([customerId, number, date].concat(lines.slice().sort((a, b) => a.sku_id.localeCompare(b.sku_id)).map(line => `${line.sku_id}:${line.quantity}:${line.unit_price_cents}:${line.unitOfMeasureId}:${line.alcoholProof}`)).join("|"));
  const directory = getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME)).find(row => String(row.account_id || "") === String(order.account_id || "")) || {};
  const warnings = [];
  const badgerAddress = [customerData.billToAddressLine1, customerData.billToCity, customerData.billToPostalCode].filter(Boolean).join("|");
  const directoryAddress = [directory.street_address || directory.address, directory.city, directory.zip_code || directory.zip].filter(Boolean).join("|");
  if (badgerAddress && directoryAddress && normalizeCustomerMatchKey_(badgerAddress) !== normalizeCustomerMatchKey_(directoryAddress)) warnings.push("Badger bill-to address differs from the Directory.");
  try {
    const lastInvoice = (account.invoices || []).filter(invoice => /^\d+$/.test(String(invoice.badger_id || ""))).sort((a, b) => recordTimestamp_(b.invoice_date) - recordTimestamp_(a.invoice_date))[0];
    if (lastInvoice) {
      const priorLines = badgerRemoteInvoiceDetails_(lastInvoice.badger_id).lines || [];
      lines.forEach(line => {
        const prior = priorLines.find(item => normalizeCustomerMatchKey_(item.description) === normalizeCustomerMatchKey_(line.description));
        if (prior && badgerMoneyToCents_(prior.unitPrice ?? prior.unit_price) !== line.unit_price_cents) warnings.push(`Price differs from this account's last invoice for ${line.description}.`);
      });
    }
  } catch (error) { console.warn("Could not compare Badger invoice prices: " + String(error?.message || error)); }
  if (!badgerSyncState_().is_fresh) warnings.push("Badger status sync is not fresh.");
  return { source:source, order:order, customer_id:customerId, customer:customerData, date:date, invoice_number:number, order_number:number.slice(2), lines:lines, total_cents:total_cents, total:badgerMoneyLabel_(total_cents), draft_fingerprint:fingerprint, warnings:warnings };
}

function badgerInvoiceMatchesDraft_(invoice, draft) {
  if (!invoice || !draft) return false;
  const remoteCustomerId = String(invoice.customerId || invoice.customer_id || invoice.billToCustomerId || invoice.billToId || "");
  const remoteTotal = badgerMoneyToCents_(invoice.totalDue ?? invoice.total_due ?? invoice.dollarAmount ?? invoice.amount);
  return remoteCustomerId === String(draft.customer_id) && remoteTotal === Number(draft.total_cents);
}

function writeBadgerInvoiceCreation_(draft, status, actor, badgerInvoiceId, error) {
  const sheet = getBadgerInvoiceCreationsSheet_(); const h = getHeaderMap_(sheet); const row = Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  set("request_id", draft.order.request_id); set("invoice_#", draft.invoice_number); set("customer_id", draft.customer_id); set("total_cents", draft.total_cents); set("fingerprint", draft.draft_fingerprint); set("status", status); set("badger_invoice_id", badgerInvoiceId || ""); set("staff", actor); set("at", new Date()); set("error", error || ""); set("app_version", APP_VERSION);
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function updateBadgerInvoiceCreation_(sheet, rowNumber, status, actor, badgerInvoiceId, error) {
  const h = getHeaderMap_(sheet);
  const set = (key, value) => { if (h[key] !== undefined) sheet.getRange(rowNumber, h[key] + 1).setValue(value); };
  set("status", status); set("badger_invoice_id", badgerInvoiceId || ""); set("staff", actor); set("at", new Date()); set("error", error || ""); set("app_version", APP_VERSION);
}

function linkCreatedBadgerInvoiceToOrder_(draft, invoice, actor) {
  const sheet = draft.source.sheet; const h = draft.source.headers; const rowNumber = draft.source.row_number;
  const set = (key, value) => { if (h[key] !== undefined) sheet.getRange(rowNumber, h[key] + 1).setValue(value); };
  set("badger_invoice_number", draft.invoice_number); set("invoice_status", "Invoice received"); set("integration_status", "Synchronized"); set("badger_match_status", "Matched"); set("badger_customer_name", String(invoice.billToName || invoice.customerName || draft.customer.billToName || "")); set("badger_invoice_date", draft.date); set("badger_amount", badgerMoneyLabel_(draft.total_cents)); set("review_updated_at", new Date()); set("review_updated_by", actor);
  appendCustomerWorkflowLog_("Order", draft.order.request_id, draft.order.account_id, draft.order.business_name, draft.order.workflow_status, draft.order.workflow_status, actor, `Created Badger invoice ${draft.invoice_number}.`);
  appendAudit_("CREATE_BADGER_INVOICE", "Order", draft.order.request_id, draft.order.account_id, actor, ONLINE_ORDER_REQUESTS_SHEET_NAME, BADGER_INVOICE_CREATIONS_SHEET_NAME, "Completed", `${draft.invoice_number}; ${draft.total}`);
}

function apiPreviewBadgerInvoice_(p) {
  const requestId = publicText_(p?.request_id || "", 80, "Request ID");
  const pending = badgerInvoiceCreationRows_(requestId).filter(item => item.status === "PENDING").sort((a, b) => recordTimestamp_(b.at) - recordTimestamp_(a.at))[0];
  const draft = badgerInvoiceDraft_(requestId, pending ? Object.assign({}, p, { invoice_number:pending.invoice_number }) : p, !!pending);
  if (pending) {
    const remote = badgerRemoteInvoiceByNumber_(pending.invoice_number);
    if (badgerInvoiceMatchesDraft_(remote, draft)) return Object.assign({}, draft, { pending_creation_id:pending.row_number, adoptable_invoice:{ badger_invoice_id:String(remote.id || remote.invoiceId || ""), invoice_number:pending.invoice_number } });
    return Object.assign({}, draft, { pending_creation:{ at:pending.at, error:String(pending.error || ""), invoice_number:pending.invoice_number } });
  }
  return draft;
}

function apiCreateBadgerInvoice_(p) {
  const requestId = publicText_(p?.request_id || "", 80, "Request ID");
  const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  const fingerprint = publicText_(p?.draft_fingerprint || "", 128, "Draft fingerprint");
  if (p?.reviewed !== true) throw new Error("Review the invoice and confirm the checkbox before creating it.");
  if (!/^[a-f0-9]{64}$/i.test(fingerprint)) throw new Error("Preview the invoice again before creating it.");
  const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) throw new Error("Another invoice action is in progress. Try again shortly.");
  try {
    if (badgerInvoiceCreationRows_(requestId).some(item => item.status === "PENDING")) throw new Error("A Badger invoice creation is already pending for this order.");
    const draft = badgerInvoiceDraft_(requestId, p, false);
    if (draft.draft_fingerprint !== fingerprint) throw new Error("Invoice changed — preview again.");
    // The second validation is intentional: a number is never auto-bumped after preview.
    badgerValidateInvoiceNumber_(draft.invoice_number, draft.date);
    const pendingRow = writeBadgerInvoiceCreation_(draft, "PENDING", actor, "", "Awaiting Badger confirmation.");
    const creationSheet = getBadgerInvoiceCreationsSheet_();
    try {
      const badgerDate = Utilities.formatDate(new Date(`${draft.date}T00:00:00`), "America/Chicago", "yyyy-MM-dd'T'HH:mm:ssXXX");
      const result = badgerJson_("/api/invoice", { method:"post", contentType:"application/json", payload:JSON.stringify({ date:badgerDate, orderNumber:draft.order_number, customerId:Number(draft.customer_id), billToName:draft.customer.billToName || "", billToAddressLine1:draft.customer.billToAddressLine1 || "", billToAddressLine2:draft.customer.billToAddressLine2 || "", billToCity:draft.customer.billToCity || "", billToPostalCode:draft.customer.billToPostalCode || "", billToResellerNumber:draft.customer.billToResellerNumber || "", lines:draft.lines.map(line => ({ quantity:line.quantity, description:line.description, unitPrice:line.unitPrice, unitOfMeasureId:line.unitOfMeasureId, beverageClass:"Spirit", alcoholProof:line.alcoholProof })) }) }, "Badger invoice create");
      const created = badgerRemoteInvoiceByNumber_(draft.invoice_number) || result?.data || result;
      const badgerInvoiceId = String(created?.id || created?.invoiceId || "");
      const confirmed = badgerInvoiceId ? badgerRemoteInvoiceDetails_(badgerInvoiceId) : created;
      if (!badgerInvoiceMatchesDraft_(confirmed, draft)) throw new Error("Badger did not confirm the created invoice total and customer.");
      updateBadgerInvoiceCreation_(creationSheet, pendingRow, "CREATED", actor, badgerInvoiceId, "");
      linkCreatedBadgerInvoiceToOrder_(draft, confirmed, actor);
      bumpReadCacheVersion_(["outreach", "customers"]); clearBadgerInvoiceCache_();
      return { message:`Created Badger invoice ${draft.invoice_number}.`, invoice_number:draft.invoice_number, badger_invoice_id:badgerInvoiceId };
    } catch (error) {
      updateBadgerInvoiceCreation_(creationSheet, pendingRow, "PENDING", actor, "", String(error?.message || error).slice(0, 1000));
      throw new Error("Invoice may have been created — check before retrying.");
    }
  } finally { lock.releaseLock(); }
}

function apiAdoptBadgerInvoice_(p) {
  const requestId = publicText_(p?.request_id || "", 80, "Request ID"); const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) throw new Error("Another invoice action is in progress. Try again shortly.");
  try {
    const pending = badgerInvoiceCreationRows_(requestId).filter(item => item.status === "PENDING").sort((a, b) => b.row_number - a.row_number)[0];
    if (!pending) throw new Error("No pending Badger invoice creation is available to adopt.");
    const draft = badgerInvoiceDraft_(requestId, { invoice_number:pending.invoice_number }, true); const remote = badgerRemoteInvoiceByNumber_(pending.invoice_number);
    if (!badgerInvoiceMatchesDraft_(remote, draft)) throw new Error("Badger does not have a matching invoice to adopt.");
    const id = String(remote.id || remote.invoiceId || ""); const confirmed = id ? badgerRemoteInvoiceDetails_(id) : remote;
    if (!badgerInvoiceMatchesDraft_(confirmed, draft)) throw new Error("Badger does not have a matching invoice to adopt.");
    updateBadgerInvoiceCreation_(getBadgerInvoiceCreationsSheet_(), pending.row_number, "CREATED", actor, id, "Adopted after pending create."); linkCreatedBadgerInvoiceToOrder_(draft, confirmed, actor); bumpReadCacheVersion_(["outreach", "customers"]); clearBadgerInvoiceCache_();
    return { message:`Adopted Badger invoice ${draft.invoice_number}.`, invoice_number:draft.invoice_number };
  } finally { lock.releaseLock(); }
}

function apiFailBadgerInvoiceCreation_(p) {
  const requestId = publicText_(p?.request_id || "", 80, "Request ID"); const reason = publicText_(p?.reason || "", 1000, "Failure reason"); const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  if (!reason) throw new Error("A failure reason is required.");
  const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) throw new Error("Another invoice action is in progress. Try again shortly.");
  try {
    const pending = badgerInvoiceCreationRows_(requestId).filter(item => item.status === "PENDING").sort((a, b) => b.row_number - a.row_number)[0];
    if (!pending || Date.now() - recordTimestamp_(pending.at) < 24 * 60 * 60 * 1000) throw new Error("Only a pending creation older than 24 hours can be marked failed.");
    if (badgerRemoteInvoiceByNumber_(pending.invoice_number)) throw new Error("Badger has this invoice; adopt it instead of marking the creation failed.");
    updateBadgerInvoiceCreation_(getBadgerInvoiceCreationsSheet_(), pending.row_number, "FAILED", actor, "", reason); bumpReadCacheVersion_(["customers"]); return { message:"Pending Badger invoice creation marked failed." };
  } finally { lock.releaseLock(); }
}

function normalizeBadgerInvoiceNumber_(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const BADGER_CUSTOMER_NAME_SUFFIXES = new Set(["llc", "inc", "incorporated", "co", "corp", "corporation", "company", "ltd"]);

// Loose customer-name key: ignores case, punctuation, spacing, a leading "The", and trailing
// entity suffixes, so "Cujak's Wine andSpirits" and "Cujaks Wine and Spirits" compare equal.
function normalizeCustomerMatchKey_(value) {
  const words = String(value || "").toLowerCase().replace(/&/g, " and ").replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && BADGER_CUSTOMER_NAME_SUFFIXES.has(words[words.length - 1])) words.pop();
  if (words.length > 1 && words[0] === "the") words.shift();
  return words.join("");
}

const BADGER_LOCATION_NAMES_CACHE_KEY = "hub_badger_location_names_v1";

function readBadgerLocationNames_() {
  const sheet = SpreadsheetApp.openById(BADGER_TRACKER_SPREADSHEET_ID).getSheetByName("Location_Directory");
  if (!sheet || sheet.getLastRow() < 2) return [];
  return getAllRowsAsObjects_(sheet).map(row => ({
    invoice_name:String(firstPresent_(row, ["invoice_name"]) || "").trim(),
    public_name:String(firstPresent_(row, ["public_name"]) || "").trim(),
  })).filter(item => item.invoice_name && item.public_name);
}

function cachedBadgerLocationNames_(bypassCache) {
  const cache = CacheService.getScriptCache();
  if (!bypassCache) {
    try {
      const cached = cache.get(BADGER_LOCATION_NAMES_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (error) {
      console.warn("Badger location-name cache read failed: " + String(error && error.message || error));
    }
  }
  const names = readBadgerLocationNames_();
  try {
    const serialized = JSON.stringify(names);
    if (serialized.length < 90000) cache.put(BADGER_LOCATION_NAMES_CACHE_KEY, serialized, BADGER_INVOICE_CACHE_TTL_SECONDS);
  } catch (error) {
    console.warn("Badger location-name cache write failed: " + String(error && error.message || error));
  }
  return names;
}

function getBadgerCustomerAliasesSheet_() {
  return ensureSheet_(getOutreachSs_(), BADGER_CUSTOMER_ALIASES_SHEET_NAME, BADGER_CUSTOMER_ALIAS_HEADERS);
}

// Returns learned aliases two ways:
// - by_name: exact customer name (only case, apostrophes, punctuation and spacing ignored) → account
// - by_key: loose key (also ignores "The" and LLC/Inc./Co./Corp.) → set of accounts
// An exact-name alias always wins. A loose key is used only when it points to a single account.
function readBadgerCustomerAliases_() {
  const aliases = { by_name:new Map(), by_key:new Map() };
  const sheet = getOutreachSs_().getSheetByName(BADGER_CUSTOMER_ALIASES_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return aliases;
  const h = getHeaderMap_(sheet);
  if (h.account_id === undefined || (h.badger_customer_name === undefined && h.normalized_key === undefined)) return aliases;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().forEach(values => {
    const customerName = h.badger_customer_name === undefined ? "" : String(values[h.badger_customer_name] || "").trim();
    const key = normalizeCustomerMatchKey_(customerName) || (h.normalized_key === undefined ? "" : String(values[h.normalized_key] || "").trim());
    const accountId = String(values[h.account_id] || "").trim();
    if (!key || !accountId) return;
    const canonicalName = canonicalBadgerAliasName_(customerName);
    if (canonicalName) {
      const existing = aliases.by_name.get(canonicalName);
      if (existing && existing.account_id !== accountId) aliases.by_name.set(canonicalName, { ambiguous:true });
      else if (!existing) aliases.by_name.set(canonicalName, { account_id:accountId });
    }
    if (!aliases.by_key.has(key)) aliases.by_key.set(key, new Set());
    aliases.by_key.get(key).add(accountId);
  });
  return aliases;
}

function canonicalBadgerAliasName_(value) {
  return String(value || "").toLowerCase().replace(/[\u2019`']/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// Remembers "Badger customer name → Account ID" so future invoices for that customer match on their own.
// Caller must hold the script lock.
function upsertBadgerCustomerAlias_(customerName, accountId, source, actor) {
  const key = normalizeCustomerMatchKey_(customerName);
  if (!key || !accountId) return false;
  const sheet = getBadgerCustomerAliasesSheet_();
  const h = getHeaderMap_(sheet);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const matchingRows = rows.map((row, index) => ({ row:row, index:index })).filter(item => {
    const row = item.row;
    const rowName = h.badger_customer_name === undefined ? "" : row[h.badger_customer_name];
    const rowKey = normalizeCustomerMatchKey_(rowName) || (h.normalized_key === undefined ? "" : String(row[h.normalized_key] || "").trim());
    return rowKey === key;
  });
  // Update the row for this exact customer name if there is one; otherwise add a new row.
  // Loose-key neighbours for other accounts are kept, so a staff correction is always learned and
  // the reader treats that loose key as ambiguous instead of guessing.
  const canonicalName = canonicalBadgerAliasName_(customerName);
  const sameName = matchingRows.find(item => canonicalBadgerAliasName_(h.badger_customer_name === undefined ? "" : item.row[h.badger_customer_name]) === canonicalName);
  const existingIndex = (sameName || {}).index;
  const values = Number.isInteger(existingIndex) ? rows[existingIndex].slice() : Array(sheet.getLastColumn()).fill("");
  const set = (column, value) => { if (h[column] !== undefined) values[h[column]] = value; };
  set("badger_customer_name", sheetSafeText_(customerName, 200, "Badger customer name"));
  set("normalized_key", key);
  set("account_id", accountId);
  set("source", source);
  set("linked_at", new Date());
  set("linked_by", actor);
  set("app_version", APP_VERSION);
  sheet.getRange(Number.isInteger(existingIndex) ? existingIndex + 2 : sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
  return true;
}

function readBadgerInvoiceLinks_() {
  const sheet = getOutreachSs_().getSheetByName(BADGER_INVOICE_LINKS_SHEET_NAME);
  const byInvoice = new Map();
  if (!sheet || sheet.getLastRow() < 2) return byInvoice;
  const headers = getHeaderMap_(sheet);
  if (headers.badger_invoice_number === undefined || headers.account_id === undefined) return byInvoice;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().forEach((values, index) => {
    const invoiceNumber = String(values[headers.badger_invoice_number] || "").trim();
    const accountId = String(values[headers.account_id] || "").trim();
    const key = normalizeBadgerInvoiceNumber_(invoiceNumber);
    if (!key) return;
    byInvoice.set(key, {
      row:index + 2,
      invoice_number:invoiceNumber,
      account_id:accountId,
      customer_name:headers.badger_customer_name === undefined ? "" : String(values[headers.badger_customer_name] || ""),
      match_method:headers.match_method === undefined ? "Manual link" : String(values[headers.match_method] || "Manual link"),
      notes:headers.notes === undefined ? "" : String(values[headers.notes] || ""),
      linked_at:headers.linked_at === undefined ? "" : values[headers.linked_at],
      linked_by:headers.linked_by === undefined ? "" : String(values[headers.linked_by] || ""),
    });
  });
  return byInvoice;
}

function getBadgerInvoiceLinksSheet_() {
  return ensureSheet_(getOutreachSs_(), BADGER_INVOICE_LINKS_SHEET_NAME, [
    "Badger Invoice Number", "Account ID", "Badger Customer Name", "Match Method", "Linked At", "Linked By", "Notes", "App Version",
    "Void Prior Account ID", "Void Prior Match Method", "Void Prior Notes", "Void Prior Linked At", "Void Prior Linked By"
  ]);
}

function apiGetCustomerAccountIndex_(p) {
  const cacheBypass = !!p?._cache_bypass;
  if (!cacheBypass) return cachedReadPayload_("customer_account_index", () => apiGetCustomerAccountIndex_({ _cache_bypass:true }));
  const accounts = accountIdentityFromRows_(getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME))).rows
    .map(row => ({
      account_id:String(row.account_id || "").trim(),
      business_name:String(outreachValue_(row, ["business", "business_name"]) || "").trim(),
      city:String(outreachValue_(row, ["city", "town"]) || "").trim(),
    }))
    .filter(item => item.account_id && item.business_name)
    .sort((a, b) => a.business_name.localeCompare(b.business_name))
    .map(({ account_id, business_name, city }) => ({ account_id, business_name, city }));
  return { accounts:accounts };
}

function apiLinkBadgerInvoice_(p) {
  requireFields_(p || {}, ["invoice_number", "staff_name"]);
  const invoiceNumber = publicText_(p.invoice_number, 120, "Badger invoice number");
  const invoiceKey = normalizeBadgerInvoiceNumber_(invoiceNumber);
  const mode = String(p.mode || "link").trim().toLowerCase();
  const accountId = publicText_(p.account_id || "", 120, "Account ID");
  if (!invoiceKey) throw new Error("Enter a valid Badger invoice number.");
  if (!["link", "ignore", "void", "restore"].includes(mode)) throw new Error("Choose link, ignore, void, or restore for this invoice.");
  if (mode === "link" && !accountId) throw new Error("Choose an existing account before linking this invoice.");
  const voidReason = mode === "void" ? publicText_(p.notes || "", 1000, "Void reason") : "";
  if (mode === "void" && !voidReason) throw new Error("Enter why this invoice is void.");
  let invoice = cachedBadgerInvoices_(false).find(item => normalizeBadgerInvoiceNumber_(item.invoice_number) === invoiceKey);
  if (!invoice) {
    const refreshed = readBadgerInvoices_();
    cacheBadgerInvoices_(refreshed);
    invoice = refreshed.find(item => normalizeBadgerInvoiceNumber_(item.invoice_number) === invoiceKey);
  }
  if (!invoice) throw new Error("That invoice was not found in the Badger Invoice Tracker.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another invoice update is in progress. Try again in a moment.");
  try {
    const sheet = getBadgerInvoiceLinksSheet_();
    const h = getHeaderMap_(sheet);
    const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    const existingIndex = rows.findIndex(row => normalizeBadgerInvoiceNumber_(row[h.badger_invoice_number]) === invoiceKey);
    if (mode === "restore") {
      const restoredMethod = existingIndex < 0 ? "" : String(rows[existingIndex][h.match_method] || "").trim().toLowerCase();
      if (!["ignored", "void"].includes(restoredMethod)) throw new Error("Only an ignored or voided invoice can be restored.");
      if (restoredMethod === "void") {
        const values = rows[existingIndex].slice();
        const priorMethod = String(values[h.void_prior_match_method] || "").trim();
        if (priorMethod) {
          const restore = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
          restore("account_id", values[h.void_prior_account_id] || "");
          restore("match_method", priorMethod);
          restore("notes", values[h.void_prior_notes] || "");
          restore("linked_at", values[h.void_prior_linked_at] || "");
          restore("linked_by", values[h.void_prior_linked_by] || "");
          restore("void_prior_account_id", ""); restore("void_prior_match_method", ""); restore("void_prior_notes", ""); restore("void_prior_linked_at", ""); restore("void_prior_linked_by", "");
          restore("app_version", APP_VERSION);
          sheet.getRange(existingIndex + 2, 1, 1, values.length).setValues([values]);
          appendAudit_("RESTORE_BADGER_INVOICE", "Invoice", String(invoice.invoice_number || invoiceNumber), String(values[h.account_id] || ""), authenticatedActor_(p, "Sturgeon Distribution Hub"), BADGER_TRACKER_SPREADSHEET_ID, BADGER_INVOICE_LINKS_SHEET_NAME, "Restored prior link", priorMethod);
          bumpReadCacheVersion_(["outreach", "customers"]);
          return { message:`Invoice ${invoice.invoice_number || invoiceNumber} restored to its prior ${priorMethod} link.`, invoice_number:String(invoice.invoice_number || invoiceNumber) };
        }
      }
      sheet.deleteRow(existingIndex + 2);
      appendAudit_("RESTORE_BADGER_INVOICE", "Invoice", String(invoice.invoice_number || invoiceNumber), "", authenticatedActor_(p, "Sturgeon Distribution Hub"), BADGER_TRACKER_SPREADSHEET_ID, BADGER_INVOICE_LINKS_SHEET_NAME, "Restored", invoice.customer_name || "Badger customer");
      bumpReadCacheVersion_(["outreach", "customers"]);
      return { message:`Invoice ${invoice.invoice_number || invoiceNumber} restored to matching review.`, invoice_number:String(invoice.invoice_number || invoiceNumber) };
    }
    let account = null;
    if (mode === "link") {
      account = accountIdentityLookup_().by_id.get(accountId);
      if (!account) throw new Error("That Account ID is not in the Distribution Directory.");
    }
    const values = existingIndex >= 0 ? rows[existingIndex].slice() : Array(sheet.getLastColumn()).fill("");
    const set = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
    const priorMatchMethod = String(values[h.match_method] || "").trim();
    const wasVoid = priorMatchMethod.toLowerCase() === "void";
    if (mode === "void" && !wasVoid) {
      set("void_prior_account_id", values[h.account_id] || "");
      set("void_prior_match_method", priorMatchMethod);
      set("void_prior_notes", values[h.notes] || "");
      set("void_prior_linked_at", values[h.linked_at] || "");
      set("void_prior_linked_by", values[h.linked_by] || "");
    }
    if (mode !== "void") {
      set("void_prior_account_id", ""); set("void_prior_match_method", ""); set("void_prior_notes", ""); set("void_prior_linked_at", ""); set("void_prior_linked_by", "");
    }
    set("badger_invoice_number", invoice.invoice_number || invoiceNumber);
    set("account_id", mode === "link" ? accountId : "");
    set("badger_customer_name", invoice.customer_name || "");
    set("match_method", mode === "link" ? "Manual link" : mode === "void" ? "Void" : "Ignored");
    set("linked_at", new Date());
    set("linked_by", authenticatedActor_(p, "Sturgeon Distribution Hub"));
    set("notes", mode === "void" ? voidReason : publicText_(p.notes || "", 1000, "Invoice-link notes"));
    set("app_version", APP_VERSION);
    sheet.getRange(existingIndex >= 0 ? existingIndex + 2 : sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
    bumpReadCacheVersion_(["outreach", "customers"]);
    if (mode === "void") {
      appendAudit_("VOID_BADGER_INVOICE", "Invoice", String(invoice.invoice_number || invoiceNumber), "", authenticatedActor_(p, "Sturgeon Distribution Hub"), BADGER_TRACKER_SPREADSHEET_ID, BADGER_INVOICE_LINKS_SHEET_NAME, "Voided", voidReason);
      return { message:`Invoice ${invoice.invoice_number || invoiceNumber} marked void in the Hub. It no longer counts toward balances, reminders, or pass-through checks.`, invoice_number:String(invoice.invoice_number || invoiceNumber) };
    }
    const ignored = mode === "ignore";
    const learned = !ignored && upsertBadgerCustomerAlias_(invoice.customer_name || "", accountId, "Staff invoice link", authenticatedActor_(p, "Sturgeon Distribution Hub"));
    appendAudit_(ignored ? "IGNORE_BADGER_INVOICE" : "LINK_BADGER_INVOICE", "Invoice", String(invoice.invoice_number || invoiceNumber), ignored ? "" : accountId, authenticatedActor_(p, "Sturgeon Distribution Hub"), BADGER_TRACKER_SPREADSHEET_ID, BADGER_INVOICE_LINKS_SHEET_NAME, ignored ? "Ignored" : "Linked", ignored ? (invoice.customer_name || "Badger customer") : `${invoice.customer_name || "Badger customer"} → ${account.business}`);
    return ignored
      ? { message:`Invoice ${invoice.invoice_number || invoiceNumber} marked as not a Directory account.`, invoice_number:String(invoice.invoice_number || invoiceNumber) }
      : { message:`Invoice ${invoice.invoice_number || invoiceNumber} linked to ${account.business}.${learned ? ` Future invoices for ${invoice.customer_name} will match automatically.` : ""}`, invoice_number:String(invoice.invoice_number || invoiceNumber), account_id:accountId, learned_customer_name:learned };
  } finally {
    lock.releaseLock();
  }
}

