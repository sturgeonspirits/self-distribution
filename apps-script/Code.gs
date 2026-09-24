/*********************************
 * Inventory API (JSON) for Netlify
 * App version: 2026.09.24.16
 *
 * CHANGES IN THIS VERSION
 * - Corrected all-caps business display formatting so a terminal possessive 's stays lowercase while names such as O'Brien still retain their internal capital.
 * - Added lightweight Outreach badges and search text from the Programs and Engagement support tabs for slim dashboard loads.
 * - Fixed the nightly repair trigger handler, refreshed a missed Badger invoice lookup once, and made single-record Outreach lookup accept source-row-only requests.
 * - Added an optional slim Outreach dashboard response and a single-record outreach endpoint.
 * - Moved structural and Account ID repair out of normal requests, with an optional nightly repair installer.
 * - Memoized Hub configuration and campaign settings, cached Badger invoices, and reduced campaign-list reads.
 * - Batched business updates and added per-stage customer work-queue timing.
 * - Allows genuinely unsent blocked campaign recipients to return to review after checking the mailer Activity Log for an accepted send.
 * - Keeps an accepted Zoho message out of the resend path when its follow-up sheet recording fails.
 * - Locks campaign approval and preserves valid idempotency tokens that begin with a hyphen.
 * - Added reopening for unsent approved campaign recipients, returning only those recipients to review for editing.
 * - Preserved sent, blocked, and excluded recipients when reopening a campaign, and kept every reopen audited.
 * - Added saved, per-recipient campaign subject and message editing before approval.
 * - Allowed Karl-only test sends for saved drafts whose prospect email is missing or unverified.
 * - Kept every real-send recipient, exclusion, stage and duplicate safety check unchanged.
 *
 * EARLIER STAGING CHANGES
 * - Removed duplicate account migration and cross-tab backfills from the customer work-queue read path.
 * - Added customer work-queue timing diagnostics without changing customer records.
 * - Removed account migration and cross-tab backfills from the Outreach dashboard read path.
 * - Reused one workbook handle per request instead of reopening the Outreach workbook repeatedly.
 * - Moved mailer-status and newsletter reads behind small dedicated endpoints.
 * - Cached mailer status briefly and logged per-stage dashboard timing.
 * - Reduced repeated activity payload while preserving recent history in the app.
 *
 * - Required the shared staff code for every inventory read and write at the Netlify boundary.
 * - Added an Inventory unlock gate that prevents data loading before authentication.
 * - Neutralized spreadsheet formulas in staff-written product, contact and count fields.
 * - Restored usable count and reorder controls after network or response failures.
 * - Added account-centric order, invoice, delivery, activity and reorder history.
 * - Kept non-counted customer accounts out of active Inventory stores by default.
 * - Added locked, one-at-a-time app email delivery through the separate Zoho mailer.
 * - Preserved Pilot Review as a read-only legacy archive and duplicate-send source.
 * - Added global browser error visibility and staff-code throttling.
 *
 * - Added a guarded, verified migration into one staging Distribution Hub workbook.
 * - Kept the existing staging Inventory Backend as a rollback source until cutover.
 * - Replaced spreadsheet-row identity with permanent account IDs.
 * - Added write-ahead submission journals, audit events and retryable integration jobs.
 * - Linked outreach, applications, ordering access, orders, delivery and Badger invoices.
 * - Added protected business creation and reviewable CSV business imports.
 * - Added idempotent customer, store, delivery and Badger reconciliation writes.
 * - Kept the proven Badger parser separate and read only from this application.
 * - Added a disabled Toast catalog adapter boundary without adding credentials.
 * - Preserved all existing inventory, count, reorder and outreach workflows.
 *
 * - Replaced the browser-autofill-prone company_website spam trap.
 * - Prevented legitimate customer applications and orders from being discarded.
 * - Added an immediate staff email for each new online order request.
 * - Included ordered products and a direct staging-row link in the notice.
 * - Recorded order-notification success or failure without losing the order.
 * - Added an immediate staff email for each new wholesale customer application.
 * - Sent application notices to sales@sturgeonspirits.com with a direct review link.
 * - Set the applicant as the reply-to address for efficient follow-up.
 * - Recorded notification success or failure beside the saved application.
 * - Kept application storage successful even if the notification email fails.
 * - Enabled API-key authentication for every Inventory API request.
 * - Required the same API_KEY in Apps Script Properties and Netlify.
 * - Rejected direct requests that omit the key or provide the wrong key.
 * - Preserved all inventory, outreach, customer and ordering behavior from .22.
 * - Selected newsletter participation by default on the customer application.
 * - Added explicit instructions for applicants who do not want newsletter email.
 * - Recorded that the newsletter option was preselected on the form.
 * - Prepared the Netlify-hosted customer application for initial-email links.
 * - Kept the public link disabled until a deployed HTTPS URL is configured.
 * - Standardized the companion email system name as Distribution Outreach.
 * - Corrected the customer-facing address to sales@sturgeonspirits.com.
 * - Matched the supplied Badger customer form by collecting only the seller's permit.
 * - Removed alcohol license type and issuing municipality from new applications.
 * - Preserved existing staging-sheet licensing data without collecting more.
 * - Removed the alcohol license number from new customer applications.
 * - Preserved any existing staging-sheet license-number data without collecting more.
 * - Corrected the invoice workflow: Sturgeon provides the invoice with delivery.
 * - Clarified that the invoice directs payment to Badger State Cooperative.
 * - Standardized the product name as Sturgeon Distribution Hub.
 * - Updated API identity and activity-source labels to the new product name.
 * - Updated the cooperative's customer-facing name to Badger State Cooperative.
 * - Clarified that Sturgeon Spirits manages ordering and self-distribution.
 * - Clarified that payment is remitted to Badger State Cooperative.
 * - Locked inventory reads and writes to the staging Inventory Backend copy.
 * - Removed reliance on whichever spreadsheet happens to own the script.
 * - Added a public new-customer application endpoint based on the April 2026 form.
 * - Added structured account, contact, delivery, product-interest and consent fields.
 * - Added a customer order-request endpoint with normalized order lines.
 * - Kept account approval, price confirmation, invoicing and payment as staff decisions.
 * - Added submission tokens, honeypots, length limits and staged review statuses.
 * - Stored customer applications and order requests only in the staging workbook.
 * - Added a standalone newsletter contact list for customers and non-customers.
 * - Added relationship types including banker, vendor, partner and community.
 * - Required consent details before a contact can be marked Subscribed.
 * - Kept newsletter sending disabled during staging.
 * - Scaffolded read-only Toast stock integration with explicit SKU mapping.
 * - Added email engagement events and estimated-open summaries.
 * - Kept Toast credentials, tracking pixels and newsletter tracking disabled.
 * - Prioritized clicks, replies and orders over imperfect open signals.
 * - Scaffolded consent-aware newsletter participation for each business.
 * - Scaffolded online-ordering candidacy, invitations and account activation.
 * - Stored both optional programs separately from the core directory workflow.
 * - Kept newsletter delivery and online ordering inactive during staging.
 * - Added editable outreach subjects and message bodies with persistent drafts.
 * - Stored per-business drafts in a separate Outreach Drafts staging tab.
 * - Kept the sell sheet, signature, logo and compliance footer standardized.
 * - Exposed saved drafts to the Zoho sender without approving or sending them.
 * - Added the complete Outreach business directory and all nonblank row fields.
 * - Added business detail, contact editing, and append-only business notes.
 * - Added contact-update activity logging with row and email change checks.
 * - Added one authoritative weekly audience: Fit 5 within 15 miles of Oshkosh.
 * - Added in-app editing for qualification, mileage and email confidence.
 * - Normalized all-caps business names in email previews and app display.
 * - Added send-safety eligibility reasons without changing source-sheet rows.
 * - Corrected staging header aliases for contact, queue, fit and Top 50 fields.
 * - Reused Campaign Settings as the email-preview source of truth.
 * - Kept email delivery disabled in this API and preserved inventory workflows.
 *
 * PASTE INSTRUCTIONS
 * - This is the complete Code.gs source, not a partial snippet.
 * - Use only in the staging inventory backend until testing is complete.
 *********************************/

const APP_VERSION = "2026.09.24.16";

const SHEET_NAMES = {
  STORES: "Stores",
  SKUS: "SKUs",
  INVENTORY: "Inventory",
  COUNTS: "Counts",
  REORDERS: "Reorders",
};

const LEGACY_INVENTORY_SPREADSHEET_ID = "1asGSIuz65hhbXbanDSuLdgsasDKqAyVWgu7DGi42Il8"; // staging rollback source
const REQUIRE_API_KEY = true;
const OUTREACH_SPREADSHEET_ID = "1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo"; // staging only
const BADGER_TRACKER_SPREADSHEET_ID = "10KM-L-iAXJ4WQ1HfLWWoGkINsi9tEvVs6J5XiHBsMIQ"; // staging parser output only
const OUTREACH_SHEET_NAME = "Distribution Directory and Leads";
const OUTREACH_ACTIVITY_SHEET_NAME = "Activity Log";
const OUTREACH_DRAFTS_SHEET_NAME = "Outreach Drafts";
const OUTREACH_PILOT_SHEET_NAME = "Pilot Review";
const OUTREACH_PROGRAMS_SHEET_NAME = "Account Programs";
const OUTREACH_ENGAGEMENT_SHEET_NAME = "Email Engagement";
const OUTREACH_CAMPAIGNS_SHEET_NAME = "Outreach Campaigns";
const OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME = "Outreach Campaign Recipients";
const TOAST_ITEM_MAP_SHEET_NAME = "Toast Item Map";
const NEWSLETTER_CONTACTS_SHEET_NAME = "Newsletter Contacts";
const CUSTOMER_APPLICATIONS_SHEET_NAME = "Customer Applications";
const CUSTOMER_APPLICATION_NOTIFICATION_EMAIL = "sales@sturgeonspirits.com";
const ONLINE_ORDER_REQUESTS_SHEET_NAME = "Online Order Requests";
const ONLINE_ORDER_LINES_SHEET_NAME = "Online Order Lines";
const CUSTOMER_WORKFLOW_LOG_SHEET_NAME = "Customer Workflow Log";
const HUB_CONFIGURATION_SHEET_NAME = "Hub Configuration";
const SUBMISSION_JOURNAL_SHEET_NAME = "Submission Journal";
const HUB_AUDIT_SHEET_NAME = "Hub Audit Log";
const INTEGRATION_JOBS_SHEET_NAME = "Integration Jobs";
const IMPORT_BATCHES_SHEET_NAME = "Import Batches";
const IMPORT_ROWS_SHEET_NAME = "Import Rows";
const DELIVERIES_SHEET_NAME = "Deliveries";
const DELIVERY_LINES_SHEET_NAME = "Delivery Lines";
const ACCOUNT_ID_HEADER = "Account ID";
const HUB_MIGRATION_STATUS_KEY = "inventory_migration_status";
const HUB_MIGRATION_ACTIVE = "ACTIVE";
const ORDER_CATALOG_SOURCE = "SHEETS"; // Toast remains disabled until a reviewed integration is configured.

let __OPERATIONAL_SS = null;
let __OUTREACH_SS = null;
let __HUB_INVENTORY_ACTIVE = null;
let __OUTREACH_CAMPAIGN_SETTINGS = null;

function getLegacyInventorySs_() {
  return SpreadsheetApp.openById(LEGACY_INVENTORY_SPREADSHEET_ID);
}

function getHubConfigurationValue_(key) {
  const sheet = getOutreachSs_().getSheetByName(HUB_CONFIGURATION_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return "";
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  const row = values.find(item => String(item[0] || "").trim() === String(key));
  return row ? String(row[1] || "").trim() : "";
}

function isHubInventoryActive_() {
  if (__HUB_INVENTORY_ACTIVE === null) {
    __HUB_INVENTORY_ACTIVE = getHubConfigurationValue_(HUB_MIGRATION_STATUS_KEY) === HUB_MIGRATION_ACTIVE;
  }
  return __HUB_INVENTORY_ACTIVE;
}

function getSs_() {
  if (__OPERATIONAL_SS) return __OPERATIONAL_SS;
  __OPERATIONAL_SS = isHubInventoryActive_() ? getOutreachSs_() : getLegacyInventorySs_();
  return __OPERATIONAL_SS;
}

function inventoryTrackedAccountIds_() {
  const sheet = getCustomerApplicationsSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) return new Set();
  return new Set(getAllRowsAsObjects_(sheet)
    .filter(row => toBool_(row.inventory_tracking) && row.account_id)
    .map(row => String(row.account_id || "").trim()));
}

function inventoryStoreAllowed_(store, trackedAccountIds) {
  if (!toBool_(store.active)) return false;
  const accountId = String(store.account_id || "").trim();
  return !accountId || trackedAccountIds.has(accountId);
}

function assertInventoryStoreAllowed_(storeId) {
  const tracked = inventoryTrackedAccountIds_();
  const store = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.STORES)).find(row => String(row.store_id || "") === String(storeId || ""));
  if (!store || !inventoryStoreAllowed_(store, tracked)) throw new Error("Inventory Tracking is not enabled for this customer account.");
  return store;
}
function getSheet_(name) {
  const sh = getSs_().getSheetByName(name);
  if (!sh) throw new Error(`Missing sheet: ${name}`);
  return sh;
}
function getOutreachSs_() {
  if (!__OUTREACH_SS) __OUTREACH_SS = SpreadsheetApp.openById(OUTREACH_SPREADSHEET_ID);
  return __OUTREACH_SS;
}
function getOutreachSheet_(name) {
  const sh = getOutreachSs_().getSheetByName(name);
  if (!sh) throw new Error(`Missing outreach sheet: ${name}`);
  return sh;
}
function normalizeHeader_(h) {
  return String(h || "").trim().toLowerCase().replace(/\s+/g, "_");
}
const __HEADER_CACHE = new Map();
function headerCacheKey_(sheet) {
  return `${sheet.getParent().getId()}::${sheet.getSheetId()}`;
}
function getHeaderMap_(sheet) {
  const key = headerCacheKey_(sheet);
  if (__HEADER_CACHE.has(key)) return __HEADER_CACHE.get(key);
  const columnCount = sheet.getLastColumn();
  if (!columnCount) {
    const empty = {};
    __HEADER_CACHE.set(key, empty);
    return empty;
  }
  const headers = sheet.getRange(1, 1, 1, columnCount).getValues()[0];
  const map = {};
  headers.map(normalizeHeader_).forEach((h, i) => { if (h) map[h] = i; });
  __HEADER_CACHE.set(key, map);
  return map;
}
function ensureHeaderColumns_(sheet, columns) {
  const h = getHeaderMap_(sheet);
  const missing = columns.filter(col => h[normalizeHeader_(col)] === undefined);
  missing.forEach(col => {
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue(col);
  });
  if (missing.length) __HEADER_CACHE.delete(headerCacheKey_(sheet));
  return getHeaderMap_(sheet);
}
function toBool_(v) { return ["TRUE","YES","Y","1"].includes(String(v).toUpperCase()); }
function digitsOnly_(v) { return String(v || "").replace(/\D/g, ""); }

function getAllRowsAsObjects_(sheet) {
  const h = getHeaderMap_(sheet);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getValues();
  const keys = Object.keys(h);
  return rows.map(r => {
    const o = {};
    keys.forEach(k => o[k] = r[h[k]]);
    return o;
  });
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  } else {
    ensureHeaderColumns_(sheet, headers);
  }
  return sheet;
}

function permanentId_(prefix) {
  return `${prefix}-${Utilities.getUuid().replace(/-/g, "").toUpperCase()}`;
}

function safeJson_(value) {
  return JSON.stringify(value, (key, item) => key === "api_key" ? undefined : item);
}

function sha256_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ""), Utilities.Charset.UTF_8);
  return bytes.map(byte => (`0${(byte < 0 ? byte + 256 : byte).toString(16)}`).slice(-2)).join("");
}

function sheetChecksum_(sheet) {
  return sha256_(safeJson_(sheet.getDataRange().getDisplayValues()));
}

function ensureFoundationalSheets_() {
  const hub = getOutreachSs_();
  ensureSheet_(hub, HUB_CONFIGURATION_SHEET_NAME, ["Key", "Value", "Updated At", "Updated By", "App Version"]);
  ensureSheet_(hub, SUBMISSION_JOURNAL_SHEET_NAME, [
    "Journal ID", "Received At", "Submission Type", "Submission Token", "Account ID", "Business", "Payload JSON",
    "Payload Hash", "Status", "Primary Record ID", "Error", "Completed At", "App Version"
  ]);
  ensureSheet_(hub, HUB_AUDIT_SHEET_NAME, [
    "Event ID", "Timestamp", "Action", "Record Type", "Record ID", "Account ID", "Actor", "Source", "Target",
    "Result", "Details", "App Version"
  ]);
  ensureSheet_(hub, INTEGRATION_JOBS_SHEET_NAME, [
    "Job ID", "Created At", "Updated At", "Job Type", "Record Type", "Record ID", "Account ID", "Status",
    "Attempts", "Next Attempt At", "Payload JSON", "Payload Hash", "Last Error", "Completed At", "App Version"
  ]);
  ensureSheet_(hub, IMPORT_BATCHES_SHEET_NAME, [
    "Batch ID", "Created At", "Created By", "Source Name", "Source Hash", "Row Count", "Created Count", "Skipped Count",
    "Error Count", "Status", "Completed At", "App Version"
  ]);
  ensureSheet_(hub, IMPORT_ROWS_SHEET_NAME, [
    "Batch ID", "Source Row", "Account ID", "Business Name", "Email", "City", "Normalized JSON", "Row Hash",
    "Status", "Detail", "Processed At", "App Version"
  ]);
  ensureSheet_(hub, DELIVERIES_SHEET_NAME, [
    "Delivery ID", "Request ID", "Account ID", "Store ID", "Business Name", "Delivery Status", "Requested Date",
    "Delivered At", "Assigned To", "Badger Invoice Number", "Created At", "Updated At", "App Version"
  ]);
  ensureSheet_(hub, DELIVERY_LINES_SHEET_NAME, [
    "Delivery ID", "Request ID", "Account ID", "Line Number", "SKU ID", "SKU Name", "Quantity", "Unit",
    "Bottle Equivalent", "Created At", "App Version"
  ]);
}

function setHubConfigurationValue_(key, value, actor) {
  const sheet = getOutreachSs_().getSheetByName(HUB_CONFIGURATION_SHEET_NAME);
  const h = getHeaderMap_(sheet);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const index = rows.findIndex(row => String(row[h.key] || "").trim() === String(key));
  const target = index >= 0 ? index + 2 : sheet.getLastRow() + 1;
  const row = index >= 0 ? rows[index].slice() : Array(sheet.getLastColumn()).fill("");
  row[h.key] = key;
  row[h.value] = value;
  row[h.updated_at] = new Date();
  row[h.updated_by] = actor || "Sturgeon Distribution Hub";
  row[h.app_version] = APP_VERSION;
  sheet.getRange(target, 1, 1, row.length).setValues([row]);
  if (key === HUB_MIGRATION_STATUS_KEY) __HUB_INVENTORY_ACTIVE = null;
}

function appendAudit_(action, recordType, recordId, accountId, actor, source, target, result, details) {
  getOutreachSs_().getSheetByName(HUB_AUDIT_SHEET_NAME).appendRow([
    permanentId_("EVT"), new Date(), action, recordType || "", recordId || "", accountId || "",
    actor || "Sturgeon Distribution Hub", source || "", target || "", result || "Recorded", details || "", APP_VERSION,
  ]);
}

function startSubmissionJournal_(type, token, accountId, business, payload) {
  const sheet = getOutreachSs_().getSheetByName(SUBMISSION_JOURNAL_SHEET_NAME);
  const h = getHeaderMap_(sheet);
  if (sheet.getLastRow() >= 2) {
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    const prior = rows.find(row => String(row[h.submission_token] || "") === String(token || "") && String(row[h.submission_type] || "") === String(type));
    if (prior) return { id:String(prior[h.journal_id] || ""), row:rows.indexOf(prior) + 2, prior_record_id:String(prior[h.primary_record_id] || "") };
  }
  const journalId = permanentId_("JRN");
  const payloadJson = safeJson_(payload);
  sheet.appendRow([
    journalId, new Date(), type, token, accountId || "", business || "", payloadJson, sha256_(payloadJson),
    "Received", "", "", "", APP_VERSION,
  ]);
  return { id:journalId, row:sheet.getLastRow(), prior_record_id:"" };
}

function completeSubmissionJournal_(journal, status, recordId, error) {
  const sheet = getOutreachSs_().getSheetByName(SUBMISSION_JOURNAL_SHEET_NAME);
  const h = getHeaderMap_(sheet);
  sheet.getRange(journal.row, h.status + 1).setValue(status);
  sheet.getRange(journal.row, h.primary_record_id + 1).setValue(recordId || "");
  sheet.getRange(journal.row, h.error + 1).setValue(String(error || "").slice(0, 2000));
  if (status === "Completed") sheet.getRange(journal.row, h.completed_at + 1).setValue(new Date());
}

function enqueueIntegrationJob_(jobType, recordType, recordId, accountId, payload) {
  const sheet = getOutreachSs_().getSheetByName(INTEGRATION_JOBS_SHEET_NAME);
  const h = getHeaderMap_(sheet);
  const payloadJson = safeJson_(payload || {});
  const payloadHash = sha256_(payloadJson);
  if (sheet.getLastRow() >= 2) {
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    const prior = rows.find(row => String(row[h.job_type] || "") === jobType && String(row[h.record_id] || "") === String(recordId) && String(row[h.payload_hash] || "") === payloadHash);
    if (prior) return String(prior[h.job_id] || "");
  }
  const jobId = permanentId_("JOB");
  sheet.appendRow([
    jobId, new Date(), new Date(), jobType, recordType, recordId, accountId || "", "Pending", 0, new Date(),
    payloadJson, payloadHash, "", "", APP_VERSION,
  ]);
  return jobId;
}

function updateIntegrationJob_(jobId, status, error) {
  const sheet = getOutreachSs_().getSheetByName(INTEGRATION_JOBS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;
  const h = getHeaderMap_(sheet);
  const ids = sheet.getRange(2, h.job_id + 1, sheet.getLastRow() - 1, 1).getValues();
  const index = ids.findIndex(row => String(row[0] || "") === String(jobId));
  if (index < 0) return;
  const rowNumber = index + 2;
  const attempts = Number(sheet.getRange(rowNumber, h.attempts + 1).getValue() || 0) + 1;
  sheet.getRange(rowNumber, h.updated_at + 1).setValue(new Date());
  sheet.getRange(rowNumber, h.status + 1).setValue(status);
  sheet.getRange(rowNumber, h.attempts + 1).setValue(attempts);
  sheet.getRange(rowNumber, h.last_error + 1).setValue(String(error || "").slice(0, 2000));
  if (status === "Completed") sheet.getRange(rowNumber, h.completed_at + 1).setValue(new Date());
  else sheet.getRange(rowNumber, h.next_attempt_at + 1).setValue(new Date(Date.now() + Math.min(24, Math.pow(2, attempts)) * 60 * 60 * 1000));
}

function migrationInventorySheetStatus_() {
  const source = getLegacyInventorySs_();
  const hub = getOutreachSs_();
  return Object.values(SHEET_NAMES).map(name => {
    const sourceSheet = source.getSheetByName(name);
    const hubSheet = hub.getSheetByName(name);
    return {
      name:name,
      source_rows:sourceSheet ? sourceSheet.getLastRow() : 0,
      hub_rows:hubSheet ? hubSheet.getLastRow() : 0,
      matches:!!sourceSheet && !!hubSheet && sheetChecksum_(sourceSheet) === sheetChecksum_(hubSheet),
    };
  });
}

function apiInitializeHardenedHub_(p) {
  if (String(p?.confirmation || "") !== "STAGING ONLY") throw new Error("Staging migration confirmation is required.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another migration or write is in progress.");
  try {
    ensureFoundationalSheets_();
    if (isHubInventoryActive_()) return { message:"The hardened staging Hub is already active.", migration_status:HUB_MIGRATION_ACTIVE, sheets:migrationInventorySheetStatus_() };
    const source = getLegacyInventorySs_();
    const hub = getOutreachSs_();
    Object.values(SHEET_NAMES).forEach(name => {
      const sourceSheet = source.getSheetByName(name);
      if (!sourceSheet) throw new Error(`Rollback source is missing ${name}.`);
      const existing = hub.getSheetByName(name);
      if (existing) {
        if (sheetChecksum_(existing) !== sheetChecksum_(sourceSheet)) throw new Error(`${name} already exists in the Hub but does not match the rollback source.`);
        return;
      }
      sourceSheet.copyTo(hub).setName(name);
    });
    const checks = migrationInventorySheetStatus_();
    const failed = checks.filter(item => !item.matches);
    if (failed.length) throw new Error(`Migration verification failed for: ${failed.map(item => item.name).join(", ")}.`);
    ensureAccountIdentityModel_(true);
    setHubConfigurationValue_(HUB_MIGRATION_STATUS_KEY, HUB_MIGRATION_ACTIVE, String(p.staff_name || "Staging administrator"));
    setHubConfigurationValue_("legacy_inventory_spreadsheet_id", LEGACY_INVENTORY_SPREADSHEET_ID, String(p.staff_name || "Staging administrator"));
    setHubConfigurationValue_("badger_tracker_spreadsheet_id", BADGER_TRACKER_SPREADSHEET_ID, String(p.staff_name || "Staging administrator"));
    setHubConfigurationValue_("order_catalog_source", ORDER_CATALOG_SOURCE, String(p.staff_name || "Staging administrator"));
    __OPERATIONAL_SS = hub;
    appendAudit_("INITIALIZE_HARDENED_HUB", "System", "staging-hub", "", String(p.staff_name || "Staging administrator"), LEGACY_INVENTORY_SPREADSHEET_ID, OUTREACH_SPREADSHEET_ID, "Completed", "Inventory tabs copied and checksum verified before cutover.");
    return { message:"The hardened staging Hub is active. The prior Inventory Backend remains unchanged for rollback.", migration_status:HUB_MIGRATION_ACTIVE, sheets:checks };
  } finally {
    lock.releaseLock();
  }
}

function apiGetHubSystemStatus_() {
  const active = isHubInventoryActive_();
  return {
    migration_status:active ? HUB_MIGRATION_ACTIVE : "NOT STARTED",
    operational_spreadsheet:active ? "Staging Distribution Hub" : "Staging Inventory Backend",
    inventory_sheets:migrationInventorySheetStatus_(),
    badger_tracker:"Configured (read only)",
    toast_adapter:"Disabled",
    catalog_source:ORDER_CATALOG_SOURCE,
  };
}

function repairHubStructure_() {
  ensureFoundationalSheets_();
  return ensureAccountIdentityModel_(true);
}

function apiRepairHubStructure_(p) {
  if (!p) throw new Error("Missing repair request.");
  requireFields_(p, ["staff_name"]);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another migration or write is in progress.");
  try {
    const identity = repairHubStructure_();
    return { message:"Hub structure repaired.", repaired_at:new Date().toISOString(), accounts:identity.rows.length };
  } finally {
    lock.releaseLock();
  }
}

function repairHubStructureNightly() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another migration or write is in progress.");
  try {
    const identity = repairHubStructure_();
    console.log(JSON.stringify({ event:"hub_structure_repair", accounts:identity.rows.length }));
  } finally {
    lock.releaseLock();
  }
}

function installNightlyHubStructureRepair() {
  const handler = "repairHubStructureNightly";
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === handler)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(3).create();
  return { message:"Nightly Hub structure repair installed." };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function readJsonBody_(e) {
  try { return e?.postData?.contents ? JSON.parse(e.postData.contents) : {}; }
  catch (err) { return { __parse_error__: String(err) }; }
}
function requireFields_(obj, fields) {
  const missing = fields.filter(f => obj[f] === undefined || obj[f] === null || obj[f] === "");
  if (missing.length) throw new Error(`Missing required field(s): ${missing.join(", ")}`);
}
function getApiKey_() {
  return PropertiesService.getScriptProperties().getProperty("API_KEY") || "";
}
function assertAuthorized_(e, body) {
  if (!REQUIRE_API_KEY) return;
  const apiKey = (e?.parameter?.api_key) || (body?.api_key) || "";
  const expected = getApiKey_();
  if (!expected) throw new Error("Server missing API_KEY (set Script Properties).");
  if (String(apiKey) !== String(expected)) throw new Error("Unauthorized (bad API key).");
}

function doGet(e) {
  return handle_(e, null);
}
function doPost(e) {
  const body = readJsonBody_(e);
  return handle_(e, body);
}
function handle_(e, body) {
  try {
    assertAuthorized_(e, body);
    const action = (e?.parameter?.action) || (body?.action) || "";
    if (!action) {
      return json_({ ok:true, service:"sturgeon-distribution-hub", version:APP_VERSION, actions:["initData","listSkus","addSkuToStore","upsertProduct","submitCounts","createReorder","managerGrid","salesSinceCount","updateStoreContacts","outreachDashboard","outreachRecord","outreachSendStatus","outreachNewsletterContacts","outreachCampaigns","outreachCampaign","createOutreachCampaign","updateOutreachCampaignRecipient","setOutreachCampaignRecipientExclusion","approveOutreachCampaign","reopenOutreachCampaign","sendOutreachCampaignBatch","saveOutreachDraft","sendOutreachEmail","sendOutreachTestEmail","updateOutreachOutcome","updateOutreachBusiness","updateOutreachPrograms","createOutreachBusiness","importOutreachBusinesses","upsertNewsletterContact","submitCustomerApplication","submitOnlineOrderRequest","customerWorkQueue","updateCustomerApplication","updateOnlineOrderRequest","hubSystemStatus","initializeHardenedHub","repairHubStructure","reconcileIntegrations"] });
    }

    let res;
    switch (action) {
      case "initData": res = apiGetInitData_((e?.parameter?.store_id) || (body?.store_id) || ""); break;
      case "listSkus": res = apiListSkus_(); break;
      case "addSkuToStore": res = apiAddSkuToStore_(body); break;
      case "upsertProduct": res = apiUpsertProduct_(body); break;
      case "submitCounts": res = apiSubmitCounts_(body); break;
      case "createReorder": res = apiCreateReorder_(body); break;
      case "managerGrid": res = apiGetManagerGrid_(); break;
      case "salesSinceCount": res = apiGetSalesSinceCount_((e?.parameter?.store_id) || (body?.store_id) || ""); break;
      case "updateStoreContacts": res = apiUpdateStoreContacts_(body); break;
      case "outreachDashboard": res = apiGetOutreachDashboard_(Object.assign({}, e?.parameter || {}, body || {})); break;
      case "outreachRecord": res = apiGetOutreachRecord_(body); break;
      case "outreachSendStatus": res = apiGetOutreachSendStatus_(); break;
      case "outreachNewsletterContacts": res = { newsletter_contacts:newsletterContacts_() }; break;
      case "outreachCampaigns": res = apiGetOutreachCampaigns_(); break;
      case "outreachCampaign": res = apiGetOutreachCampaign_(body); break;
      case "createOutreachCampaign": res = apiCreateOutreachCampaign_(body); break;
      case "updateOutreachCampaignRecipient": res = apiUpdateOutreachCampaignRecipient_(body); break;
      case "setOutreachCampaignRecipientExclusion": res = apiSetOutreachCampaignRecipientExclusion_(body); break;
      case "approveOutreachCampaign": res = apiApproveOutreachCampaign_(body); break;
      case "reopenOutreachCampaign": res = apiReopenOutreachCampaign_(body); break;
      case "sendOutreachCampaignBatch": res = apiSendOutreachCampaignBatch_(body); break;
      case "saveOutreachDraft": res = apiSaveOutreachDraft_(body); break;
      case "sendOutreachEmail": res = apiSendOutreachEmail_(body, false); break;
      case "sendOutreachTestEmail": res = apiSendOutreachEmail_(body, true); break;
      case "updateOutreachOutcome": res = apiUpdateOutreachOutcome_(body); break;
      case "updateOutreachBusiness": res = apiUpdateOutreachBusiness_(body); break;
      case "updateOutreachPrograms": res = apiUpdateOutreachPrograms_(body); break;
      case "createOutreachBusiness": res = apiCreateOutreachBusiness_(body); break;
      case "importOutreachBusinesses": res = apiImportOutreachBusinesses_(body); break;
      case "upsertNewsletterContact": res = apiUpsertNewsletterContact_(body); break;
      case "submitCustomerApplication": res = apiSubmitCustomerApplication_(body); break;
      case "submitOnlineOrderRequest": res = apiSubmitOnlineOrderRequest_(body); break;
      case "customerWorkQueue": res = apiGetCustomerWorkQueue_(); break;
      case "updateCustomerApplication": res = apiUpdateCustomerApplication_(body); break;
      case "updateOnlineOrderRequest": res = apiUpdateOnlineOrderRequest_(body); break;
      case "hubSystemStatus": res = apiGetHubSystemStatus_(); break;
      case "initializeHardenedHub": res = apiInitializeHardenedHub_(body); break;
      case "repairHubStructure": res = apiRepairHubStructure_(body); break;
      case "reconcileIntegrations": res = apiReconcileIntegrations_(body); break;
      default: throw new Error(`Unknown action: ${action}`);
    }

    return json_(Object.assign({ ok:true, version:APP_VERSION }, res));
  } catch (err) {
    return json_({ ok:false, version:APP_VERSION, error: err?.message ? err.message : String(err) });
  }
}

function apiGetInitData_(store_id) {
  const trackedAccountIds = inventoryTrackedAccountIds_();
  const stores = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.STORES))
    .filter(s => inventoryStoreAllowed_(s, trackedAccountIds))
    .map(s => Object.assign({
      store_id:String(s.store_id || ""),
      store_name:String(s.store_name || ""),
      route:String(s.route||"")
    }, storeContactFields_(s)))
    .sort((a,b)=>a.store_name.localeCompare(b.store_name));

  if (!store_id) return { stores, lines: [] };
  assertInventoryStoreAllowed_(store_id);

  const skuRows = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.SKUS));
  const skuMap = new Map();
  skuRows.forEach(s => {
    if (!toBool_(s.active)) return;
    skuMap.set(String(s.sku_id).trim(), {
      sku_name: s.sku_name,
      upc: digitsOnly_(s.upc),
      size: s.size,
      units_per_case: Number(s.units_per_case || 12),
    });
  });

  const lines = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.INVENTORY))
    .filter(r => String(r.store_id) === String(store_id))
    .map(r => {
      const sku = skuMap.get(String(r.sku_id).trim()) || {};
      return {
        sku_id: String(r.sku_id),
        sku_name: String(sku.sku_name || r.sku_id || ""),
        upc: String(sku.upc || ""),
        size: String(sku.size || ""),
        units_per_case: Number(sku.units_per_case || 12),
        on_hand_units: Number(r.on_hand_units||0),
        par_level_units: Number(r.par_level_units||0),
        reorder_point_units: Number(r.reorder_point_units||0),
      };
    })
    .sort((a,b)=>a.sku_name.localeCompare(b.sku_name));

  return { stores, lines };
}

function apiListSkus_() {
  const toastMap = new Map();
  const toastSheet = getOutreachSs_().getSheetByName(TOAST_ITEM_MAP_SHEET_NAME);
  if (toastSheet && toastSheet.getLastRow() >= 2) {
    getAllRowsAsObjects_(toastSheet).forEach(item => {
      if (!toBool_(item.active)) return;
      const skuId = String(item.sturgeon_sku_id || "").trim();
      if (!skuId || toastMap.has(skuId)) return;
      toastMap.set(skuId, {
        external_item_id:String(item.toast_item_guid || ""),
        stock_status:String(item.stock_status || "Not connected"),
        toast_item_name:String(item.toast_item_name || ""),
      });
    });
  }
  const map = new Map();
  getAllRowsAsObjects_(getSheet_(SHEET_NAMES.SKUS)).forEach(s=>{
    if (!toBool_(s.active)) return;
    const id = String(s.sku_id||"").trim();
    if (!id) return;
    const toast = toastMap.get(id) || {};
    map.set(id,{
      sku_id:id,
      sku_name:s.sku_name,
      upc:digitsOnly_(s.upc),
      size:s.size,
      units_per_case:Number(s.units_per_case||12),
      catalog_source:ORDER_CATALOG_SOURCE,
      availability_status:"Not connected",
      external_item_id:String(toast.external_item_id || ""),
      toast_mapping_status:toast.external_item_id ? "Mapped; adapter disabled" : "Not mapped",
    });
  });
  return {
    catalog_source:ORDER_CATALOG_SOURCE,
    availability_source:"Toast adapter disabled; staff confirms availability",
    skus:Array.from(map.values()).sort((a,b)=>String(a.sku_name||"").localeCompare(String(b.sku_name||""))),
  };
}

function apiAddSkuToStoreUnlocked_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["store_id","sku_id"]);
  assertInventoryStoreAllowed_(p.store_id);

  const sh = getSheet_(SHEET_NAMES.INVENTORY);
  const h = getHeaderMap_(sh);
  const rows = getAllRowsAsObjects_(sh);

  if (rows.some(r => String(r.store_id)===String(p.store_id) && String(r.sku_id)===String(p.sku_id)))
    return { message:"SKU already exists for store." };

  const row = Array(sh.getLastColumn()).fill("");
  row[h.store_id]=p.store_id;
  row[h.sku_id]=p.sku_id;
  row[h.on_hand_units]=Number(p.on_hand_units||0);
  row[h.par_level_units]=Number(p.par_level_units||0);
  row[h.reorder_point_units]=Number(p.reorder_point_units||0);
  sh.appendRow(row);

  return { message:"Added SKU to store." };
}

function apiUpsertProductUnlocked_(p) {
  if (!p || !p.sku) throw new Error("Missing sku");
  requireFields_(p.sku, ["sku_id","sku_name"]);

  const sh = getSheet_(SHEET_NAMES.SKUS);
  const h = getHeaderMap_(sh);
  const rows = getAllRowsAsObjects_(sh);

  const id = String(p.sku.sku_id).trim();
  const idx = rows.findIndex(r => String(r.sku_id).trim() === id);

  const row = Array(sh.getLastColumn()).fill("");
  row[h.sku_id]=id;
  row[h.upc]=digitsOnly_(p.sku.upc);
  row[h.sku_name]=sheetSafeText_(p.sku.sku_name, 150, "SKU name");
  row[h.size]=sheetSafeText_(p.sku.size, 50, "Size");
  row[h.units_per_case]=Number(p.sku.units_per_case||12);
  row[h.active]=!!p.sku.active;

  if (idx>=0) sh.getRange(idx+2,1,1,row.length).setValues([row]);
  else sh.appendRow(row);

  if (p.addToStore) {
    apiAddSkuToStoreUnlocked_({
      store_id:p.store_id,
      sku_id:id,
      on_hand_units:p.inventory?.on_hand_units,
      par_level_units:p.inventory?.par_level_units,
      reorder_point_units:p.inventory?.reorder_point_units
    });
  }

  return { message:"Product saved." };
}

function apiSubmitCountsUnlocked_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["store_id","rep"]);
  assertInventoryStoreAllowed_(p.store_id);
  if (!Array.isArray(p.items) || !p.items.length) throw new Error("Missing items[]");

  const inv = getSheet_(SHEET_NAMES.INVENTORY);
  const ih = getHeaderMap_(inv);
  const counts = getSheet_(SHEET_NAMES.COUNTS);

  const ts = new Date();
  const rows = getAllRowsAsObjects_(inv);
  const out=[];

  p.items.forEach(it=>{
    const r = rows.find(x => String(x.store_id)===String(p.store_id) && String(x.sku_id)===String(it.sku_id));
    const before = r ? Number(r.on_hand_units||0) : 0;
    const after = Number(it.counted||0);

    out.push([ts, p.store_id, sheetSafeText_(p.rep, 100, "Rep"), it.sku_id, before, after, after-before, sheetSafeText_(it.notes, 500, "Notes")]);

    if (r && p.updateInventory) {
      const rowNum = rows.indexOf(r)+2;
      inv.getRange(rowNum, ih.on_hand_units+1).setValue(after);
      if (ih.last_count_date !== undefined) inv.getRange(rowNum, ih.last_count_date+1).setValue(ts);
      if (ih.last_count_units !== undefined) inv.getRange(rowNum, ih.last_count_units+1).setValue(after);
    }
  });

  if (out.length)
    counts.getRange(counts.getLastRow()+1,1,out.length,out[0].length).setValues(out);

  return { message:`Submitted ${out.length} counts.`, submitted: out.length };
}

function apiCreateReorderUnlocked_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["store_id","rep"]);
  assertInventoryStoreAllowed_(p.store_id);

  const inv = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.INVENTORY))
    .filter(r => String(r.store_id)===String(p.store_id));

  const skuMap = new Map();
  getAllRowsAsObjects_(getSheet_(SHEET_NAMES.SKUS)).forEach(s=>{
    skuMap.set(String(s.sku_id).trim(), Number(s.units_per_case||12));
  });

  const out=[];
  const ts=new Date();

  inv.forEach(r=>{
    const onHand = Number(r.on_hand_units||0);
    const rp = Number(r.reorder_point_units||0);
    const par = Number(r.par_level_units||0);

    if (onHand > rp) return;
    const need = Math.max(0, par - onHand);
    if (!need) return;

    const cases = Math.ceil(need / (skuMap.get(String(r.sku_id)) || 12));
    out.push([ts,p.store_id,p.rep,r.sku_id,need,cases,"Below RP",p.notes||"","OPEN"]);
  });

  const sh=getSheet_(SHEET_NAMES.REORDERS);
  if (out.length)
    sh.getRange(sh.getLastRow()+1,1,out.length,out[0].length).setValues(out);

  return { created: out.length };
}

function apiUpdateStoreContactsUnlocked_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["store_id"]);
  assertInventoryStoreAllowed_(p.store_id);

  const sh = getSheet_(SHEET_NAMES.STORES);
  const h = ensureHeaderColumns_(sh, ["manager_name", "assistant_manager_name"]);
  const rows = getAllRowsAsObjects_(sh);
  const storeId = String(p.store_id || "");
  const idx = rows.findIndex(r => String(r.store_id) === storeId);
  if (idx < 0) throw new Error("Store not found.");

  const managerName = sheetSafeText_(p.manager_name, 100, "Manager name");
  const assistantManagerName = sheetSafeText_(p.assistant_manager_name, 100, "Assistant manager name");
  const rowNum = idx + 2;
  sh.getRange(rowNum, h.manager_name + 1).setValue(managerName);
  sh.getRange(rowNum, h.assistant_manager_name + 1).setValue(assistantManagerName);

  return {
    message: "Store contacts saved.",
    store_id: storeId,
    manager_name: managerName,
    assistant_manager_name: assistantManagerName,
  };
}

function withInventoryWriteLock_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another inventory update is in progress. Try again in a moment.");
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function apiAddSkuToStore_(p) { return withInventoryWriteLock_(() => apiAddSkuToStoreUnlocked_(p)); }
function apiUpsertProduct_(p) { return withInventoryWriteLock_(() => apiUpsertProductUnlocked_(p)); }
function apiSubmitCounts_(p) { return withInventoryWriteLock_(() => apiSubmitCountsUnlocked_(p)); }
function apiCreateReorder_(p) { return withInventoryWriteLock_(() => apiCreateReorderUnlocked_(p)); }
function apiUpdateStoreContacts_(p) { return withInventoryWriteLock_(() => apiUpdateStoreContactsUnlocked_(p)); }

function apiGetManagerGrid_() {
  const trackedAccountIds = inventoryTrackedAccountIds_();
  const stores = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.STORES))
    .filter(s => inventoryStoreAllowed_(s, trackedAccountIds))
    .map(s => Object.assign({
      store_id: String(s.store_id || ""),
      store_name: String(s.store_name || ""),
      route: String(s.route || "")
    }, storeContactFields_(s)))
    .sort((a, b) => a.store_name.localeCompare(b.store_name));

  const skuRows = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.SKUS))
    .filter(s => toBool_(s.active))
    .map(s => ({
      sku_id: String(s.sku_id || "").trim(),
      sku_name: String(s.sku_name || ""),
      size: String(s.size || ""),
      units_per_case: Number(s.units_per_case || 12)
    }))
    .filter(s => s.sku_id)
    .sort((a, b) => a.sku_name.localeCompare(b.sku_name));

  const inventoryRows = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.INVENTORY));
  const storeMap = new Map(stores.map(s => [s.store_id, s]));
  const skuMap = new Map(skuRows.map(s => [s.sku_id, s]));

  const cellMap = new Map();
  inventoryRows.forEach(r => {
    const storeId = String(r.store_id || "");
    const skuId = String(r.sku_id || "").trim();
    if (!storeMap.has(storeId) || !skuMap.has(skuId)) return;

    const onHand = Number(r.on_hand_units || 0);
    const par = Number(r.par_level_units || 0);
    const rp = Number(r.reorder_point_units || 0);

    cellMap.set(`${storeId}__${skuId}`, {
      on_hand_units: onHand,
      par_level_units: par,
      reorder_point_units: rp,
      needs_attention: onHand <= rp,
      below_par: onHand < par,
    });
  });

  const rows = stores.map(store => {
    let needsCount = 0;
    let belowParCount = 0;

    const cells = skuRows.map(sku => {
      const cell = cellMap.get(`${store.store_id}__${sku.sku_id}`) || {
        on_hand_units: 0,
        par_level_units: 0,
        reorder_point_units: 0,
        needs_attention: true,
        below_par: false,
      };

      if (cell.needs_attention) needsCount++;
      else if (cell.below_par) belowParCount++;

      return {
        sku_id: sku.sku_id,
        on_hand_units: cell.on_hand_units,
        par_level_units: cell.par_level_units,
        reorder_point_units: cell.reorder_point_units,
        needs_attention: cell.needs_attention,
        below_par: cell.below_par,
      };
    });

    return {
      store_id: store.store_id,
      store_name: store.store_name,
      route: store.route,
      manager_name: store.manager_name,
      assistant_manager_name: store.assistant_manager_name,
      needs_count: needsCount,
      below_par_count: belowParCount,
      ok_count: Math.max(0, skuRows.length - needsCount - belowParCount),
      cells,
    };
  });

  return {
    stores: rows,
    skus: skuRows,
  };
}

function firstPresent_(obj, keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  return "";
}

function storeContactFields_(store) {
  return {
    manager_name: String(firstPresent_(store, ["manager_name", "manager", "store_manager", "manager_contact"]) || ""),
    assistant_manager_name: String(firstPresent_(store, ["assistant_manager_name", "asst_manager_name", "assistant_manager", "assistant_mgr", "asst_manager", "assistant"]) || ""),
  };
}

function getLatestCountMap_() {
  const sh = getSheet_(SHEET_NAMES.COUNTS);
  if (sh.getLastRow() < 2) return new Map();

  const h = getHeaderMap_(sh);
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const latest = new Map();

  values.forEach(row => {
    const obj = {};
    Object.keys(h).forEach(key => obj[key] = row[h[key]]);

    const ts = firstPresent_(obj, ["timestamp", "ts", "count_date", "date"]) || row[0];
    const storeId = String(firstPresent_(obj, ["store_id", "store"]) || row[1] || "");
    const skuId = String(firstPresent_(obj, ["sku_id", "sku"]) || row[3] || "").trim();
    const counted = Number(firstPresent_(obj, ["after", "after_units", "counted", "counted_units", "count_units"]) || row[5] || 0);
    const rep = String(firstPresent_(obj, ["rep", "staff"]) || row[2] || "");
    const notes = String(firstPresent_(obj, ["notes", "note"]) || row[7] || "");
    if (!storeId || !skuId) return;

    const countDate = ts instanceof Date ? ts : new Date(ts);
    const dateMs = countDate instanceof Date && !isNaN(countDate.getTime()) ? countDate.getTime() : 0;
    const key = `${storeId}__${skuId}`;
    const prior = latest.get(key);
    if (prior && prior.date_ms > dateMs) return;

    latest.set(key, {
      store_id: storeId,
      sku_id: skuId,
      last_count_units: counted,
      last_count_date: countDate instanceof Date && !isNaN(countDate.getTime()) ? countDate : "",
      last_count_rep: rep,
      last_count_notes: notes,
      date_ms: dateMs,
    });
  });

  return latest;
}

function apiGetSalesSinceCount_(store_id) {
  requireFields_({ store_id }, ["store_id"]);
  assertInventoryStoreAllowed_(store_id);

  const skuRows = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.SKUS));
  const skuMap = new Map();
  skuRows.forEach(s => {
    if (!toBool_(s.active)) return;
    const skuId = String(s.sku_id || "").trim();
    if (!skuId) return;
    skuMap.set(skuId, {
      sku_name: String(s.sku_name || skuId),
      upc: digitsOnly_(s.upc),
      size: String(s.size || ""),
      units_per_case: Number(s.units_per_case || 12),
    });
  });

  const latestCounts = getLatestCountMap_();
  const inventoryRows = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.INVENTORY))
    .filter(r => String(r.store_id) === String(store_id));

  const lines = inventoryRows.map(r => {
    const skuId = String(r.sku_id || "").trim();
    const sku = skuMap.get(skuId) || {};
    const current = Number(r.on_hand_units || 0);
    const latest = latestCounts.get(`${store_id}__${skuId}`);

    const fallbackUnits =
      r.last_count_units !== undefined && r.last_count_units !== null && r.last_count_units !== ""
        ? Number(r.last_count_units || 0)
        : null;
    const fallbackDate = r.last_count_date || "";
    const lastCountUnits = latest ? latest.last_count_units : fallbackUnits;
    const lastCountDate = latest ? latest.last_count_date : fallbackDate;
    const hasLastCount = lastCountUnits !== null && lastCountUnits !== undefined && lastCountUnits !== "";
    const sold = hasLastCount ? Math.max(0, Number(lastCountUnits || 0) - current) : null;

    return {
      sku_id: skuId,
      sku_name: String(sku.sku_name || skuId),
      upc: String(sku.upc || ""),
      size: String(sku.size || ""),
      units_per_case: Number(sku.units_per_case || 12),
      current_on_hand_units: current,
      last_count_units: hasLastCount ? Number(lastCountUnits || 0) : null,
      last_count_date: lastCountDate,
      last_count_rep: latest ? latest.last_count_rep : "",
      sold_since_last_count: sold,
      no_count: !hasLastCount,
    };
  }).sort((a, b) => {
    const soldA = a.sold_since_last_count === null ? -1 : a.sold_since_last_count;
    const soldB = b.sold_since_last_count === null ? -1 : b.sold_since_last_count;
    if (soldA !== soldB) return soldB - soldA;
    return String(a.sku_name || "").localeCompare(String(b.sku_name || ""));
  });

  const totalSold = lines.reduce((sum, line) => sum + Math.max(0, Number(line.sold_since_last_count || 0)), 0);
  const countedSkus = lines.filter(line => !line.no_count).length;

  return {
    store_id,
    lines,
    summary: {
      total_sold_units: totalSold,
      counted_skus: countedSkus,
      total_skus: lines.length,
    }
  };
}

function normalizeBusinessKey_(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function accountIdentityFromRows_(rows) {
  const identity = { by_id:new Map(), by_row:new Map(), by_email:new Map(), by_business_city:new Map(), rows:rows };
  rows.forEach((row, index) => {
    const accountId = String(row.account_id || "").trim();
    const sourceRow = index + 2;
    const business = String(outreachValue_(row, ["business", "business_name"]) || "").trim();
    const email = String(outreachValue_(row, ["email", "email_address"]) || "").trim().toLowerCase();
    const city = String(outreachValue_(row, ["city", "town"]) || "").trim();
    const record = { account_id:accountId, source_row:sourceRow, business:business, email:email, city:city, row:row };
    if (accountId) identity.by_id.set(accountId, record);
    identity.by_row.set(sourceRow, record);
    if (email) {
      if (!identity.by_email.has(email)) identity.by_email.set(email, []);
      identity.by_email.get(email).push(record);
    }
    const businessCity = `${normalizeBusinessKey_(business)}::${normalizeBusinessKey_(city)}`;
    if (business && !identity.by_business_city.has(businessCity)) identity.by_business_city.set(businessCity, []);
    if (business) identity.by_business_city.get(businessCity).push(record);
  });
  return identity;
}

function accountIdentityLookup_() {
  return accountIdentityFromRows_(getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME)));
}

function findIdentityMatch_(identity, accountId, business, email, city) {
  const requestedId = String(accountId || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedBusiness = normalizeBusinessKey_(business);
  const normalizedCity = normalizeBusinessKey_(city);
  if (requestedId && identity.by_id.has(requestedId)) {
    const record = identity.by_id.get(requestedId);
    const emailMatches = normalizedEmail && record.email === normalizedEmail;
    const businessMatches = normalizedBusiness && normalizeBusinessKey_(record.business) === normalizedBusiness;
    if (emailMatches || businessMatches) return { record:record, status:"Account ID verified" };
    return { record:null, status:"Account ID needs staff review" };
  }
  if (normalizedEmail && identity.by_email.has(normalizedEmail)) {
    const matches = identity.by_email.get(normalizedEmail).filter(record => !normalizedBusiness || normalizeBusinessKey_(record.business) === normalizedBusiness);
    if (matches.length === 1) return { record:matches[0], status:"Email and business matched" };
  }
  const businessCity = `${normalizedBusiness}::${normalizedCity}`;
  if (normalizedBusiness && normalizedCity && identity.by_business_city.has(businessCity)) {
    const matches = identity.by_business_city.get(businessCity);
    if (matches.length === 1) return { record:matches[0], status:"Business and city matched" };
  }
  return { record:null, status:"Needs staff match" };
}

function backfillAccountIdsInSheet_(sheet, identity, options) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const h = ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER]);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  let changed = 0;
  rows.forEach(row => {
    if (String(row[h.account_id] || "").trim()) return;
    const sourceRow = h.source_row !== undefined ? Number(row[h.source_row] || 0) : 0;
    let match = sourceRow ? identity.by_row.get(sourceRow) : null;
    if (!match) {
      const businessKey = (options?.business_keys || ["business", "business_name"]).find(key => h[key] !== undefined);
      const emailKey = (options?.email_keys || ["email", "primary_email", "intended_recipient"]).find(key => h[key] !== undefined);
      const cityKey = (options?.city_keys || ["city", "delivery_city"]).find(key => h[key] !== undefined);
      const result = findIdentityMatch_(identity, "", businessKey ? row[h[businessKey]] : "", emailKey ? row[h[emailKey]] : "", cityKey ? row[h[cityKey]] : "");
      match = result.record;
    }
    if (!match) return;
    row[h.account_id] = match.account_id;
    changed += 1;
  });
  if (changed) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return changed;
}

function ensureAccountIdentityModel_(lockHeld) {
  let lock = null;
  if (!lockHeld) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) throw new Error("Another account update is in progress.");
  }
  try {
    const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const h = ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER, "Record Created At", "Record Updated At"]);
    if (sheet.getLastRow() >= 2) {
      const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
      let changed = false;
      const now = new Date();
      const seenAccountIds = new Set();
      rows.forEach((row, index) => {
        const businessKey = h.business_name !== undefined ? "business_name" : (h.business !== undefined ? "business" : "");
        if (!businessKey || !String(row[h[businessKey]] || "").trim()) return;
        if (!String(row[h.account_id] || "").trim()) {
          row[h.account_id] = permanentId_("ACC");
          changed = true;
        }
        const accountId = String(row[h.account_id] || "").trim();
        if (seenAccountIds.has(accountId)) throw new Error(`Duplicate Account ID found on directory row ${index + 2}. Correct it before continuing.`);
        seenAccountIds.add(accountId);
        if (!row[h.record_created_at]) {
          row[h.record_created_at] = now;
          changed = true;
        }
      });
      if (changed) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    }
    const identity = accountIdentityFromRows_(getAllRowsAsObjects_(sheet));
    [
      [getOutreachSs_().getSheetByName(OUTREACH_DRAFTS_SHEET_NAME), {}],
      [getOutreachSs_().getSheetByName(OUTREACH_PROGRAMS_SHEET_NAME), {}],
      [getOutreachSs_().getSheetByName(OUTREACH_ENGAGEMENT_SHEET_NAME), {}],
      [getOutreachSs_().getSheetByName(OUTREACH_ACTIVITY_SHEET_NAME), { business_keys:["business"], email_keys:["intended_recipient"] }],
      [getOutreachSs_().getSheetByName(CUSTOMER_APPLICATIONS_SHEET_NAME), { business_keys:["business_name", "legal_business_name"], email_keys:["primary_email"], city_keys:["delivery_city"] }],
      [getOutreachSs_().getSheetByName(ONLINE_ORDER_REQUESTS_SHEET_NAME), { business_keys:["business_name"], email_keys:["email"] }],
      [getOutreachSs_().getSheetByName(NEWSLETTER_CONTACTS_SHEET_NAME), { business_keys:["source_business", "organization"], email_keys:["email"] }],
    ].forEach(item => backfillAccountIdsInSheet_(item[0], identity, item[1]));
    return accountIdentityFromRows_(getAllRowsAsObjects_(sheet));
  } finally {
    if (lock) lock.releaseLock();
  }
}

function setDirectoryField_(row, headers, aliases, value) {
  const key = aliases.map(normalizeHeader_).find(alias => headers[alias] !== undefined);
  if (key !== undefined) row[headers[key]] = value;
}

function directoryRowFromBusiness_(sheet, p, accountId, now) {
  const h = getHeaderMap_(sheet);
  const row = Array(sheet.getLastColumn()).fill("");
  setDirectoryField_(row, h, ["Account ID"], accountId);
  setDirectoryField_(row, h, ["Business Name", "Business"], String(p.business_name || p.business || "").trim());
  setDirectoryField_(row, h, ["Contact Person", "Contact"], String(p.contact || p.contact_name || "").trim());
  setDirectoryField_(row, h, ["Email"], String(p.email || "").trim().toLowerCase());
  setDirectoryField_(row, h, ["Phone Number", "Phone"], String(p.phone || "").trim());
  setDirectoryField_(row, h, ["Street Address", "Address"], String(p.address || p.street_address || "").trim());
  setDirectoryField_(row, h, ["City"], String(p.city || "").trim());
  setDirectoryField_(row, h, ["State"], String(p.state || "WI").trim().toUpperCase());
  setDirectoryField_(row, h, ["Zip Code", "ZIP"], String(p.postal_code || p.zip || "").trim());
  setDirectoryField_(row, h, ["Next Email"], String(p.next_email || "Initial"));
  setDirectoryField_(row, h, ["Status"], String(p.status || (p.email ? "Not contacted" : "Needs email")));
  setDirectoryField_(row, h, ["Priority"], String(p.priority || "Medium"));
  setDirectoryField_(row, h, ["Do Not Email"], toBool_(p.do_not_email));
  setDirectoryField_(row, h, ["Craft-Spirit Fit (1–5)", "Craft-Spirit Fit (1-5)"], String(p.craft_spirit_fit || ""));
  setDirectoryField_(row, h, ["Rating Basis"], String(p.rating_basis || ""));
  setDirectoryField_(row, h, ["Miles"], p.miles === "" || p.miles === undefined ? "" : Number(p.miles));
  setDirectoryField_(row, h, ["Lead Source"], String(p.lead_source || "Sturgeon Distribution Hub"));
  setDirectoryField_(row, h, ["Email Confidence"], String(p.email_confidence || (p.email ? "Needs verification" : "")));
  setDirectoryField_(row, h, ["Relationship"], String(p.relationship || "Prospect"));
  setDirectoryField_(row, h, ["Notes"], String(p.notes || ""));
  setDirectoryField_(row, h, ["Record Created At"], now);
  setDirectoryField_(row, h, ["Record Updated At"], now);
  return row;
}

function sheetSafeText_(value, maxLength, label) {
  const text = publicText_(value, maxLength, label);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function validateBusinessInput_(p) {
  const business = sheetSafeText_(p.business_name || p.business, 160, "Business name");
  if (!business) throw new Error("Business name is required.");
  const email = publicEmail_(p.email, "Email", false);
  const fit = String(p.craft_spirit_fit || "").trim();
  if (fit && (!Number.isInteger(Number(fit)) || Number(fit) < 1 || Number(fit) > 5)) throw new Error("Craft-spirit fit must be from 1 to 5.");
  const miles = String(p.miles ?? "").trim();
  if (miles && (!Number.isFinite(Number(miles)) || Number(miles) < 0 || Number(miles) > 1000)) throw new Error("Miles must be from 0 to 1000.");
  return {
    business_name:business,
    contact:sheetSafeText_(p.contact || p.contact_name, 120, "Contact"),
    email:email,
    phone:sheetSafeText_(p.phone, 40, "Phone"),
    address:sheetSafeText_(p.address || p.street_address, 180, "Address"),
    city:sheetSafeText_(p.city, 100, "City"),
    state:sheetSafeText_(p.state || "WI", 2, "State").toUpperCase(),
    postal_code:sheetSafeText_(p.postal_code || p.zip, 10, "ZIP code"),
    craft_spirit_fit:fit,
    rating_basis:sheetSafeText_(p.rating_basis, 1000, "Rating basis"),
    miles:miles,
    lead_source:sheetSafeText_(p.lead_source || "Sturgeon Distribution Hub", 200, "Lead source"),
    email_confidence:sheetSafeText_(p.email_confidence || (email ? "Needs verification" : ""), 80, "Email confidence"),
    relationship:sheetSafeText_(p.relationship || "Prospect", 80, "Relationship"),
    priority:sheetSafeText_(p.priority || "Medium", 40, "Priority"),
    status:sheetSafeText_(p.status || (email ? "Not contacted" : "Needs email"), 80, "Status"),
    next_email:sheetSafeText_(p.next_email || "Initial", 80, "Next email"),
    notes:sheetSafeText_(p.notes, 4000, "Notes"),
    do_not_email:toBool_(p.do_not_email),
  };
}

function duplicateBusiness_(identity, p) {
  const email = String(p.email || "").trim().toLowerCase();
  if (email && identity.by_email.has(email)) return identity.by_email.get(email)[0];
  const key = `${normalizeBusinessKey_(p.business_name)}::${normalizeBusinessKey_(p.city)}`;
  const matches = identity.by_business_city.get(key) || [];
  return matches.length ? matches[0] : null;
}

function apiCreateOutreachBusiness_(p) {
  if (!p) throw new Error("Missing business.");
  const input = validateBusinessInput_(p);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another directory update is in progress.");
  try {
    const identity = accountIdentityLookup_();
    const duplicate = duplicateBusiness_(identity, input);
    if (duplicate) throw new Error(`A matching business already exists: ${duplicate.business}.`);
    const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const accountId = permanentId_("ACC");
    const now = new Date();
    sheet.appendRow(directoryRowFromBusiness_(sheet, input, accountId, now));
    appendAudit_("CREATE_BUSINESS", "Account", accountId, accountId, String(p.staff_name || "Staff"), "Sturgeon Distribution Hub", OUTREACH_SHEET_NAME, "Completed", `Created ${input.business_name}.`);
    return { message:"Business added to the directory.", account_id:accountId, source_row:sheet.getLastRow() };
  } finally {
    lock.releaseLock();
  }
}

function apiImportOutreachBusinesses_(p) {
  if (!p || !Array.isArray(p.rows) || !p.rows.length) throw new Error("Choose a CSV containing at least one business.");
  if (p.rows.length > 500) throw new Error("Import no more than 500 businesses at a time.");
  const sourceName = publicText_(p.source_name || "CSV import", 200, "Source name");
  const staffName = publicText_(p.staff_name || "Staff", 120, "Staff name");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another directory import is in progress.");
  try {
    const directory = getOutreachSheet_(OUTREACH_SHEET_NAME);
    let identity = accountIdentityFromRows_(getAllRowsAsObjects_(directory));
    const batches = getOutreachSs_().getSheetByName(IMPORT_BATCHES_SHEET_NAME);
    const importRows = getOutreachSs_().getSheetByName(IMPORT_ROWS_SHEET_NAME);
    const batchId = permanentId_("IMP");
    const sourceJson = safeJson_(p.rows);
    const sourceHash = sha256_(sourceJson);
    let created = 0;
    let skipped = 0;
    let errors = 0;
    p.rows.forEach((raw, index) => {
      let accountId = "";
      let status = "Error";
      let detail = "";
      let normalizedForLog = {
        business_name:String(raw.business_name || raw.business || "").slice(0, 160),
        email:String(raw.email || "").slice(0, 200),
        city:String(raw.city || "").slice(0, 100),
      };
      try {
        const input = validateBusinessInput_(Object.assign({}, raw, { lead_source:raw.lead_source || sourceName }));
        normalizedForLog = input;
        const duplicate = duplicateBusiness_(identity, input);
        if (duplicate) {
          accountId = duplicate.account_id;
          status = "Skipped duplicate";
          detail = `Matched ${duplicate.business}`;
          skipped += 1;
        } else {
          accountId = permanentId_("ACC");
          directory.appendRow(directoryRowFromBusiness_(directory, input, accountId, new Date()));
          status = "Created";
          detail = "Added to directory";
          created += 1;
          const createdRecord = {
            account_id:accountId,
            source_row:directory.getLastRow(),
            business:input.business_name,
            email:String(input.email || "").toLowerCase(),
            city:String(input.city || ""),
          };
          identity.by_id.set(accountId, createdRecord);
          if (createdRecord.email) {
            const emailMatches = identity.by_email.get(createdRecord.email) || [];
            emailMatches.push(createdRecord);
            identity.by_email.set(createdRecord.email, emailMatches);
          }
          const businessCityKey = `${normalizeBusinessKey_(createdRecord.business)}::${normalizeBusinessKey_(createdRecord.city)}`;
          const businessMatches = identity.by_business_city.get(businessCityKey) || [];
          businessMatches.push(createdRecord);
          identity.by_business_city.set(businessCityKey, businessMatches);
        }
      } catch (error) {
        errors += 1;
        detail = String(error.message || error).slice(0, 1000);
      }
      const normalizedJson = safeJson_(normalizedForLog);
      importRows.appendRow([batchId, index + 2, accountId, raw.business_name || raw.business || "", raw.email || "", raw.city || "", normalizedJson, sha256_(normalizedJson), status, detail, new Date(), APP_VERSION]);
    });
    batches.appendRow([batchId, new Date(), staffName, sourceName, sourceHash, p.rows.length, created, skipped, errors, errors ? "Completed with errors" : "Completed", new Date(), APP_VERSION]);
    appendAudit_("IMPORT_BUSINESSES", "Import Batch", batchId, "", staffName, sourceName, OUTREACH_SHEET_NAME, errors ? "Completed with errors" : "Completed", `${created} created; ${skipped} skipped; ${errors} errors.`);
    return { message:`Import complete: ${created} created, ${skipped} skipped, ${errors} errors.`, batch_id:batchId, created:created, skipped:skipped, errors:errors };
  } finally {
    lock.releaseLock();
  }
}

function outreachValue_(row, keys) {
  return firstPresent_(row, keys);
}

function outreachDate_(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? "" : date;
}

function outreachStatusLower_(record) {
  return String(record.status || "").trim().toLowerCase();
}

function isDoNotContact_(record) {
  const status = outreachStatusLower_(record);
  return record.do_not_email || status === "do not contact" || status === "not interested";
}

function isSentOutreach_(record) {
  return ["sent", "follow-up due", "follow-up sent", "replied", "interested", "reactivation sent"]
    .includes(outreachStatusLower_(record));
}

function isReadyOutreach_(record) {
  const status = outreachStatusLower_(record);
  const queue = String(record.queue || "").trim().toLowerCase();
  return !!record.email && !isDoNotContact_(record)
    && (["not contacted", "review", "approved", "use reactivation"].includes(status) || ["review", "approved"].includes(queue));
}

function isDueOutreach_(record, endOfToday) {
  if (isDoNotContact_(record)) return false;
  const status = outreachStatusLower_(record);
  const followUp = outreachDate_(record.next_follow_up);
  return status === "follow-up due"
    || status === "reactivation due"
    || (!!followUp && followUp.getTime() <= endOfToday.getTime());
}

function outreachPriorityScore_(record) {
  const priority = String(record.priority || "").trim().toLowerCase();
  let score = 0;
  if (["high", "1", "a"].includes(priority)) score += 30;
  else if (["medium", "2", "b"].includes(priority)) score += 20;
  else if (priority) score += 10;
  if (record.top_50) score += 12;
  if (String(record.email_confidence || "").toLowerCase().includes("high")) score += 4;
  if (record.next_follow_up) score += 2;
  return score;
}

function outreachMiles_(value) {
  if (value === "" || value === null || value === undefined) return null;
  const miles = Number(value);
  return Number.isFinite(miles) ? miles : null;
}

function outreachWeeklyExclusionReasons_(record) {
  const reasons = [];
  const status = outreachStatusLower_(record);
  const outcome = String(record.outcome || "").trim().toLowerCase();
  const relationship = String(record.relationship || "").trim().toLowerCase();
  const confidence = String(record.email_confidence || "").trim().toLowerCase();
  const nextEmail = String(record.next_email || "").trim().toLowerCase();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(record.email || "").trim());

  if (Number(record.craft_spirit_fit) !== 5) reasons.push("Craft-spirit fit is not 5");
  if (record.miles === null) reasons.push("Distance is missing");
  else if (record.miles < 0 || record.miles > 15) reasons.push("More than 15 miles from Oshkosh");
  if (!validEmail) reasons.push("Valid email is missing");
  if (!["confirmed", "published", "supplied"].includes(confidence)) reasons.push("Email is not verified");
  if (relationship !== "prospect") reasons.push("Not an initial prospect");
  if (status !== "not contacted") reasons.push("Already contacted or not ready");
  if (nextEmail && nextEmail !== "initial") reasons.push("Next email is not the initial message");
  if (record.last_emailed) reasons.push("Email was already sent");
  if (record.do_not_email || ["bad address", "unsubscribed", "not interested", "do not contact"].includes(outcome)) {
    reasons.push("Excluded from email");
  }
  return reasons;
}

function outreachActivityMap_() {
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  const rows = getAllRowsAsObjects_(sheet);
  const activity = new Map();
  rows.forEach(row => {
    const business = String(outreachValue_(row, ["business"]) || "").trim();
    if (!business) return;
    const accountId = String(row.account_id || "").trim();
    const keys = [`business:${business.toLowerCase()}`];
    if (accountId) keys.unshift(`account:${accountId}`);
    const item = {
      timestamp: outreachValue_(row, ["timestamp"]),
      stage: String(outreachValue_(row, ["message_stage", "stage"]) || ""),
      result: String(outreachValue_(row, ["result"]) || ""),
      detail: String(outreachValue_(row, ["error/detail", "error_detail", "detail"]) || ""),
      subject: String(outreachValue_(row, ["subject"]) || ""),
      message_id: String(outreachValue_(row, ["message_id"]) || ""),
      delivered_to: String(outreachValue_(row, ["delivered_to"]) || ""),
      idempotency_token: String(outreachValue_(row, ["idempotency_token"]) || ""),
    };
    keys.forEach(key => {
      if (!activity.has(key)) activity.set(key, []);
      activity.get(key).push(item);
    });
  });
  activity.forEach(items => items.sort((a, b) => {
    const aDate = outreachDate_(a.timestamp);
    const bDate = outreachDate_(b.timestamp);
    return (bDate ? bDate.getTime() : 0) - (aDate ? aDate.getTime() : 0);
  }));
  return activity;
}

function getOutreachCampaignSettings_() {
  if (__OUTREACH_CAMPAIGN_SETTINGS) return __OUTREACH_CAMPAIGN_SETTINGS;
  const sheet = getOutreachSheet_("Campaign Settings");
  const values = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), 2).getValues();
  __OUTREACH_CAMPAIGN_SETTINGS = values.reduce((settings, row) => {
    if (row[0]) settings[String(row[0])] = row[1];
    return settings;
  }, {});
  return __OUTREACH_CAMPAIGN_SETTINGS;
}

function outreachDraftKey_(identityKey, stage) {
  return `${String(identityKey || "").trim()}::${String(stage || "Initial").trim().toLowerCase()}`;
}

function getOutreachDraftSheet_(createIfMissing) {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(OUTREACH_DRAFTS_SHEET_NAME);
  if (sheet) return sheet;
  if (!createIfMissing) return sheet;

  sheet = ss.insertSheet(OUTREACH_DRAFTS_SHEET_NAME);
  const headers = [["Draft Key", "Account ID", "Source Row", "Business Name", "Email", "Message Stage", "Subject", "Body Text", "Updated At", "Updated By", "App Version"]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers)
    .setFontWeight("bold")
    .setBackground("#e5e7eb")
    .setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 170);
  sheet.setColumnWidth(2, 90);
  sheet.setColumnWidth(3, 240);
  sheet.setColumnWidth(4, 220);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 320);
  sheet.setColumnWidth(7, 520);
  sheet.setColumnWidth(8, 160);
  sheet.setColumnWidth(9, 190);
  sheet.setColumnWidth(10, 120);
  sheet.getRange("F:G").setWrap(true).setVerticalAlignment("top");
  return sheet;
}

function outreachDraftMap_() {
  const sheet = getOutreachDraftSheet_(false);
  const drafts = new Map();
  if (!sheet || sheet.getLastRow() < 2) return drafts;
  getAllRowsAsObjects_(sheet).forEach(row => {
    const sourceRow = Number(row.source_row || 0);
    const accountId = String(row.account_id || "").trim();
    const stage = String(row.message_stage || "Initial").trim();
    if (!sourceRow && !accountId) return;
    const draft = {
      subject: String(row.subject || "").trim(),
      body_text: String(row.body_text || "").trim(),
      updated_at: row.updated_at || "",
      updated_by: String(row.updated_by || ""),
    };
    if (accountId) drafts.set(outreachDraftKey_(accountId, stage), draft);
    if (sourceRow) drafts.set(outreachDraftKey_(sourceRow, stage), draft);
  });
  return drafts;
}

function getOutreachProgramSheet_(createIfMissing) {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(OUTREACH_PROGRAMS_SHEET_NAME);
  if (sheet) {
    ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER]);
    return sheet;
  }
  if (!createIfMissing) return sheet;

  sheet = ss.insertSheet(OUTREACH_PROGRAMS_SHEET_NAME);
  const headers = [[
    "Program Key", "Account ID", "Source Row", "Business Name", "Email",
    "Newsletter Status", "Newsletter Consent Source", "Newsletter Status Date",
    "Ordering Status", "Ordering Customer ID", "Ordering Invite Date", "Ordering Portal URL",
    "Updated At", "Updated By", "Notes", "App Version"
  ]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers)
    .setFontWeight("bold")
    .setBackground("#e5e7eb")
    .setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  [150, 90, 240, 220, 150, 240, 150, 150, 170, 150, 280, 160, 190, 320, 120]
    .forEach((width, index) => sheet.setColumnWidth(index + 1, width));
  sheet.getRange("F:F").setWrap(true).setVerticalAlignment("top");
  sheet.getRange("N:N").setWrap(true).setVerticalAlignment("top");
  return sheet;
}

function outreachProgramMap_() {
  const sheet = getOutreachProgramSheet_(false);
  const programs = new Map();
  if (!sheet || sheet.getLastRow() < 2) return programs;
  getAllRowsAsObjects_(sheet).forEach(row => {
    const sourceRow = Number(row.source_row || 0);
    const accountId = String(row.account_id || "").trim();
    if (!sourceRow && !accountId) return;
    const program = {
      newsletter_status: String(row.newsletter_status || "Not invited"),
      newsletter_consent_source: String(row.newsletter_consent_source || ""),
      newsletter_status_date: row.newsletter_status_date || "",
      ordering_status: String(row.ordering_status || "Not offered"),
      ordering_customer_id: String(row.ordering_customer_id || ""),
      ordering_invite_date: row.ordering_invite_date || "",
      ordering_portal_url: String(row.ordering_portal_url || ""),
      notes: String(row.notes || ""),
      updated_at: row.updated_at || "",
    };
    if (accountId) programs.set(accountId, program);
    if (sourceRow) programs.set(sourceRow, program);
  });
  return programs;
}

function outreachEngagementMap_() {
  const sheet = getOutreachSs_().getSheetByName(OUTREACH_ENGAGEMENT_SHEET_NAME);
  const engagement = new Map();
  if (!sheet || sheet.getLastRow() < 2) return engagement;
  getAllRowsAsObjects_(sheet).forEach(row => {
    const sourceRow = Number(row.source_row || 0);
    const accountId = String(row.account_id || "").trim();
    const key = accountId || sourceRow;
    if (!key) return;
    if (!engagement.has(key)) {
      engagement.set(key, {
        open_count:0,
        last_opened:"",
        click_count:0,
        last_clicked:"",
        reply_count:0,
        bounce_count:0,
        source:"",
      });
    }
    const summary = engagement.get(key);
    const eventType = String(row.event_type || "").trim().toLowerCase();
    const eventAt = outreachDate_(row.event_at);
    const newest = (current, candidate) => {
      const currentDate = outreachDate_(current);
      if (!candidate) return current;
      return !currentDate || candidate.getTime() > currentDate.getTime() ? candidate : current;
    };
    if (eventType === "open") {
      summary.open_count += 1;
      summary.last_opened = newest(summary.last_opened, eventAt);
    } else if (eventType === "click") {
      summary.click_count += 1;
      summary.last_clicked = newest(summary.last_clicked, eventAt);
    } else if (eventType === "reply") summary.reply_count += 1;
    else if (eventType === "bounce") summary.bounce_count += 1;
    if (row.source) summary.source = String(row.source);
  });
  return engagement;
}

function newsletterContacts_() {
  const sheet = getOutreachSs_().getSheetByName(NEWSLETTER_CONTACTS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return getAllRowsAsObjects_(sheet).filter(row => row.email).map(row => ({
    contact_id:String(row.contact_id || ""),
    account_id:String(row.account_id || ""),
    name:String(row.name || ""),
    email:String(row.email || ""),
    organization:String(row.organization || ""),
    relationship_type:String(row.relationship_type || "Other"),
    status:String(row.status || "Candidate"),
    consent_source:String(row.consent_source || ""),
    consent_date:row.consent_date || "",
    source_row:row.source_row || "",
    source_business:String(row.source_business || ""),
    topics:String(row.topics || ""),
    notes:String(row.notes || ""),
    updated_at:row.updated_at || "",
  })).sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));
}

function outreachSegmentTemplateKey_(segment) {
  const value = String(segment || "").trim().toUpperCase();
  if (value.indexOf("A ") === 0) return "A";
  if (value.indexOf("B ") === 0) return "B";
  if (value.indexOf("D1") === 0 || value.indexOf("D2") === 0) return "D";
  return "C";
}

function escapeOutreachHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function outreachDisplayBusinessName_(value) {
  const text = String(value || "").trim();
  if (!text || text !== text.toUpperCase()) return text;
  return text.split(/\s+/).map(word => {
    if (/^(EAA|HQ|BP|VFW|LLC|USA|II|III|IV|TJ'S|T&O)$/i.test(word)) return word.toUpperCase();
    if (/^X-GOLF$/i.test(word)) return "X-Golf";
    const normalized = word.toLowerCase().replace(/(^|[-\/&])([a-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase());
    return normalized.replace(/'([a-z])/g, (match, letter, index, source) =>
      `'${letter === "s" && index + match.length === source.length ? "s" : letter.toUpperCase()}`
    );
  }).join(" ");
}

function renderOutreachTemplate_(template, values, htmlMode) {
  return String(template || "").replace(/{{\s*([^}]+?)\s*}}/g, (_, key) => {
    const value = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : "";
    const safeHtml = key === "Sell Sheet Link" || key === "Website Footer";
    return htmlMode && !safeHtml ? escapeOutreachHtml_(value) : String(value);
  });
}

function outreachTemplateParts_(template) {
  const source = String(template || "");
  const marker = "{{Sell Sheet Link}}";
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return { body:source, footer:"" };
  return {
    body: source.slice(0, markerIndex),
    footer: source.slice(markerIndex),
  };
}

function outreachHtmlToPlainText_(html) {
  return String(html || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function outreachPlainTextToHtml_(text) {
  return String(text || "").trim().split(/\n{2,}/).filter(Boolean).map(block =>
    `<p>${escapeOutreachHtml_(block).replace(/\n/g, "<br>")}</p>`
  ).join("");
}

function outreachMessage_(row, settings, draft) {
  const stage = String(outreachValue_(row, ["next_email", "stage"]) || "Initial");
  let keys;
  if (stage === "Reactivation") keys = ["Reactivation subject", "Reactivation HTML"];
  else if (stage === "Follow-up 1") keys = ["Follow-up 1 subject", "Follow-up 1 HTML"];
  else if (stage === "Follow-up 2") keys = ["Follow-up 2 subject", "Follow-up 2 HTML"];
  else {
    const segment = outreachSegmentTemplateKey_(outreachValue_(row, ["segment"]));
    keys = [`Segment ${segment} subject`, `Segment ${segment} HTML`];
  }

  const contact = String(outreachValue_(row, ["contact", "contact_name", "contact_person"]) || "").trim();
  const sellSheet = String(settings["Wholesale sell-sheet URL"] || "").trim();
  const website = String(settings["Website URL"] || "").trim();
  const logo = String(settings["Logo URL"] || "").trim();
  const values = {
    "First Name": contact ? contact.split(/\s+/)[0] : "there",
    "Business Name": outreachDisplayBusinessName_(outreachValue_(row, ["business", "business_name"]) || "your business"),
    "City": String(outreachValue_(row, ["city"]) || ""),
    "Segment": String(outreachValue_(row, ["segment"]) || ""),
    "Wave": String(outreachValue_(row, ["wave"]) || ""),
    "Relationship": String(outreachValue_(row, ["relationship"]) || "Prospect"),
    "Last Order": String(outreachValue_(row, ["last_order"]) || ""),
    "Physical Address": String(settings["Physical mailing address"] || ""),
    "Website Footer": website && logo
      ? `<a href="${escapeOutreachHtml_(website)}"><img src="${escapeOutreachHtml_(logo)}" alt="Sturgeon Spirits"></a>`
      : "",
    "Sell Sheet Link": sellSheet ? `<p><a href="${escapeOutreachHtml_(sellSheet)}">View our current wholesale sell sheet</a></p>` : "",
  };
  const template = String(settings[keys[1]] || "");
  const parts = outreachTemplateParts_(template);
  const templateSubject = renderOutreachTemplate_(settings[keys[0]], values, false);
  const templateBodyHtml = renderOutreachTemplate_(parts.body, values, true);
  const footerHtml = renderOutreachTemplate_(parts.footer, values, true);
  const draftBody = String(draft?.body_text || "").trim();
  return {
    stage: stage,
    subject: String(draft?.subject || "").trim() || templateSubject,
    body_text: draftBody || outreachHtmlToPlainText_(templateBodyHtml),
    html: draftBody ? outreachPlainTextToHtml_(draftBody) + footerHtml : templateBodyHtml + footerHtml,
    footer_html: footerHtml,
    has_saved_draft: !!draft,
    draft_updated_at: draft?.updated_at || "",
  };
}

function outreachFieldLabel_(key) {
  return String(key || "")
    .replace(/[_\-\/]+/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function outreachFields_(row) {
  return Object.keys(row).map(key => ({
    key: key,
    label: outreachFieldLabel_(key),
    value: row[key],
  })).filter(field => field.value !== "" && field.value !== null && field.value !== undefined);
}

const OUTREACH_EDITABLE_FIELD_KEYS = {
  contact: ["contact", "contact_name", "contact_person", "first_name"],
  email: ["email", "email_address"],
  phone: ["phone", "phone_number", "telephone"],
  website: ["website", "website_url", "url"],
  address: ["address", "street", "street_address", "address_1"],
  city: ["city", "town"],
  state: ["state"],
  postal_code: ["zip", "zip_code", "postal_code"],
  craft_spirit_fit: ["craft-spirit_fit_(1–5)", "craft-spirit_fit_(1-5)", "craft_spirit_fit", "craft_spirit_fit_(1–5)"],
  miles: ["miles", "distance", "distance_miles"],
  rating_basis: ["rating_basis"],
  email_confidence: ["email_confidence"],
};

function outreachEditableFields_(row) {
  const editable = {};
  Object.keys(OUTREACH_EDITABLE_FIELD_KEYS).forEach(canonical => {
    const actual = OUTREACH_EDITABLE_FIELD_KEYS[canonical].find(key => Object.prototype.hasOwnProperty.call(row, key));
    if (actual) editable[canonical] = actual;
  });
  return editable;
}

function outreachRecord_(row, sourceRow, activityMap, settings, draftMap, programMap, engagementMap) {
  const business = String(outreachValue_(row, ["business", "business_name"]) || "").trim();
  const contact = String(outreachValue_(row, ["contact", "contact_name", "contact_person", "first_name"]) || "").trim();
  const status = String(outreachValue_(row, ["status"]) || "Not contacted").trim();
  const relationship = String(outreachValue_(row, ["relationship"]) || "").trim();
  const accountId = String(row.account_id || "").trim();
  const messageStage = String(outreachValue_(row, ["next_email", "stage"]) || "Initial").trim();
  const draft = draftMap.get(outreachDraftKey_(accountId || sourceRow, messageStage)) || draftMap.get(outreachDraftKey_(sourceRow, messageStage));
  const message = outreachMessage_(row, settings, draft);
  const city = String(outreachValue_(row, ["city", "town"]) || "").trim();
  const state = String(outreachValue_(row, ["state"]) || "").trim();
  const postalCode = String(outreachValue_(row, ["zip", "zip_code", "postal_code"]) || "").trim();
  const street = String(outreachValue_(row, ["address", "street", "street_address", "address_1"]) || "").trim();
  const address = [street, city, state, postalCode].filter(Boolean).join(", ");
  const loggedActivity = (activityMap.get(`account:${accountId}`) || activityMap.get(`business:${business.toLowerCase()}`) || []).slice();
  const sourceMessageId = String(outreachValue_(row, ["message_id", "zoho_message_id"]) || "").trim();
  const sourceLastEmailed = outreachValue_(row, ["last_emailed", "last_email"]);
  if (sourceLastEmailed && !loggedActivity.some(item => item.message_id && item.message_id === sourceMessageId)) {
    loggedActivity.push({
      timestamp:sourceLastEmailed,
      stage:messageStage === "Initial" ? "Initial" : "Prior outreach",
      result:"SOURCE LEAD SENT",
      detail:"Historical send recorded on the source lead.",
      message_id:sourceMessageId,
      delivered_to:String(outreachValue_(row, ["email", "email_address"]) || "").trim(),
    });
  }
  loggedActivity.sort((a, b) => recordTimestamp_(b.timestamp) - recordTimestamp_(a.timestamp));
  const record = {
    account_id: accountId,
    source_row: sourceRow,
    business: business,
    display_business: outreachDisplayBusinessName_(business),
    contact: contact,
    email: String(outreachValue_(row, ["email", "email_address"]) || "").trim(),
    phone: String(outreachValue_(row, ["phone", "phone_number", "telephone"]) || "").trim(),
    website: String(outreachValue_(row, ["website", "website_url", "url"]) || "").trim(),
    address: address,
    city: city,
    state: state,
    postal_code: postalCode,
    queue: String(outreachValue_(row, ["queue", "queue?"]) || "").trim(),
    next_email: String(outreachValue_(row, ["next_email"]) || "").trim(),
    status: status,
    priority: String(outreachValue_(row, ["priority"]) || "").trim(),
    last_emailed: outreachValue_(row, ["last_emailed", "last_email"]),
    message_id: sourceMessageId,
    next_follow_up: outreachValue_(row, ["next_follow-up", "next_follow_up"]),
    outcome: String(outreachValue_(row, ["outcome"]) || "").trim(),
    notes: String(outreachValue_(row, ["notes"]) || "").trim(),
    do_not_email: toBool_(outreachValue_(row, ["do_not_email", "do_not_contact"])),
    segment: String(outreachValue_(row, ["segment"]) || "").trim(),
    wave: String(outreachValue_(row, ["wave"]) || "").trim(),
    top_50: toBool_(outreachValue_(row, ["top50", "top_50", "top_50?"])),
    craft_spirit_fit: Number(outreachValue_(row, ["craft-spirit_fit_(1–5)", "craft-spirit_fit_(1-5)", "craft_spirit_fit", "craft_spirit_fit_(1–5)"]) || 0),
    rating_basis: String(outreachValue_(row, ["rating_basis"]) || "").trim(),
    miles: outreachMiles_(outreachValue_(row, ["miles", "distance", "distance_miles"])),
    county: String(outreachValue_(row, ["county"]) || "").trim(),
    license: String(outreachValue_(row, ["license"]) || "").trim(),
    lead_source: String(outreachValue_(row, ["lead_source"]) || "").trim(),
    email_source_url: String(outreachValue_(row, ["email_source_url"]) || "").trim(),
    email_confidence: String(outreachValue_(row, ["email_confidence"]) || "").trim(),
    relationship: relationship,
    last_order: outreachValue_(row, ["last_order"]),
    order_count: outreachValue_(row, ["order_count"]),
    lifetime_invoiced: outreachValue_(row, ["lifetime_invoiced"]),
    customer_source: String(outreachValue_(row, ["customer_source"]) || "").trim(),
    editable_fields: outreachEditableFields_(row),
    fields: outreachFields_(row),
    subject: message.subject || `A Wisconsin spirits option for ${outreachDisplayBusinessName_(business)}`,
    body_text: message.body_text,
    preview_html: message.html,
    message_footer_html: message.footer_html,
    has_saved_draft: message.has_saved_draft,
    draft_updated_at: message.draft_updated_at,
    programs: programMap.get(accountId) || programMap.get(sourceRow) || {
      newsletter_status:"Not invited",
      newsletter_consent_source:"",
      newsletter_status_date:"",
      ordering_status:"Not offered",
      ordering_customer_id:"",
      ordering_invite_date:"",
      ordering_portal_url:"",
      notes:"",
      updated_at:"",
    },
    email_engagement: engagementMap.get(accountId) || engagementMap.get(sourceRow) || {
      open_count:0,
      last_opened:"",
      click_count:0,
      last_clicked:"",
      reply_count:0,
      bounce_count:0,
      source:"Not connected",
    },
    activity: loggedActivity.slice(0, 10),
  };
  record.weekly_exclusion_reasons = outreachWeeklyExclusionReasons_(record);
  record.weekly_eligible = record.weekly_exclusion_reasons.length === 0;
  return record;
}

function outreachSlimRecord_(row, sourceRow, draftMap, programMap, engagementMap) {
  const accountId = String(row.account_id || "").trim();
  const stage = String(outreachValue_(row, ["next_email", "stage"]) || "Initial").trim();
  const program = programMap.get(accountId) || programMap.get(sourceRow) || {};
  const engagement = engagementMap.get(accountId) || engagementMap.get(sourceRow) || {};
  const searchText = [
    outreachValue_(row, ["address", "street", "street_address", "address_1"]),
    outreachValue_(row, ["zip", "zip_code", "postal_code"]),
    outreachValue_(row, ["county"]),
    outreachValue_(row, ["license"]),
    outreachValue_(row, ["segment"]),
    outreachValue_(row, ["wave"]),
    outreachValue_(row, ["lead_source"]),
    outreachValue_(row, ["website", "website_url", "url"]),
    String(outreachValue_(row, ["notes"]) || "").slice(0, 200),
  ].map(value => String(value || "").trim()).filter(Boolean).join(" ").toLowerCase();
  const record = {
    account_id:accountId,
    source_row:sourceRow,
    business:String(outreachValue_(row, ["business", "business_name"]) || "").trim(),
    display_business:outreachDisplayBusinessName_(outreachValue_(row, ["business", "business_name"]) || ""),
    contact:String(outreachValue_(row, ["contact", "contact_name", "contact_person", "first_name"]) || "").trim(),
    email:String(outreachValue_(row, ["email", "email_address"]) || "").trim(),
    phone:String(outreachValue_(row, ["phone", "phone_number", "telephone"]) || "").trim(),
    city:String(outreachValue_(row, ["city", "town"]) || "").trim(),
    state:String(outreachValue_(row, ["state"]) || "").trim(),
    status:String(outreachValue_(row, ["status"]) || "Not contacted").trim(),
    next_email:stage,
    priority:String(outreachValue_(row, ["priority"]) || "").trim(),
    next_follow_up:outreachValue_(row, ["next_follow-up", "next_follow_up"]),
    last_emailed:outreachValue_(row, ["last_emailed", "last_email"]),
    outcome:String(outreachValue_(row, ["outcome"]) || "").trim(),
    do_not_email:toBool_(outreachValue_(row, ["do_not_email", "do_not_contact"])),
    segment:String(outreachValue_(row, ["segment"]) || "").trim(),
    wave:String(outreachValue_(row, ["wave"]) || "").trim(),
    top_50:toBool_(outreachValue_(row, ["top50", "top_50", "top_50?"])),
    craft_spirit_fit:Number(outreachValue_(row, ["craft-spirit_fit_(1–5)", "craft-spirit_fit_(1-5)", "craft_spirit_fit", "craft_spirit_fit_(1–5)"]) || 0),
    miles:outreachMiles_(outreachValue_(row, ["miles", "distance", "distance_miles"])),
    email_confidence:String(outreachValue_(row, ["email_confidence"]) || "").trim(),
    relationship:String(outreachValue_(row, ["relationship"]) || "").trim(),
    newsletter_status:String(program.newsletter_status || "Not invited"),
    ordering_status:String(program.ordering_status || "Not offered"),
    opened:Number(engagement.open_count || 0) > 0,
    clicked:Number(engagement.click_count || 0) > 0,
    search_text:searchText,
    has_saved_draft:draftMap.has(outreachDraftKey_(accountId || sourceRow, stage)),
    // Used only while assembling the server-side Today queue; omitted from slim JSON.
    queue:String(outreachValue_(row, ["queue", "queue?"]) || "").trim(),
  };
  record.weekly_exclusion_reasons = outreachWeeklyExclusionReasons_(record);
  record.weekly_eligible = record.weekly_exclusion_reasons.length === 0;
  return record;
}

function outreachSlimPayload_(record) {
  const fields = [
    "account_id", "source_row", "business", "display_business", "contact", "email", "phone", "city", "state",
    "status", "next_email", "priority", "next_follow_up", "last_emailed", "outcome", "do_not_email", "segment",
    "wave", "top_50", "craft_spirit_fit", "miles", "email_confidence", "relationship", "newsletter_status",
    "ordering_status", "opened", "clicked", "search_text", "weekly_eligible",
    "weekly_exclusion_reasons", "has_saved_draft",
  ];
  return fields.reduce((payload, field) => {
    payload[field] = record[field];
    return payload;
  }, {});
}

function apiGetOutreachDashboard_(p) {
  const slim = String(p?.slim || "") === "1";
  const startedAt = Date.now();
  const timings = {};
  let stageStartedAt = startedAt;
  const mark = name => {
    const now = Date.now();
    timings[name] = now - stageStartedAt;
    stageStartedAt = now;
  };
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rows = getAllRowsAsObjects_(sheet);
  mark("directory_read_ms");
  let activityMap = new Map();
  let records;
  if (slim) {
    const draftMap = outreachDraftMap_();
    const programMap = outreachProgramMap_();
    const engagementMap = outreachEngagementMap_();
    mark("supporting_tabs_ms");
    records = rows.map((row, index) => outreachSlimRecord_(row, index + 2, draftMap, programMap, engagementMap))
      .filter(record => record.business);
  } else {
    activityMap = outreachActivityMap_();
    mark("activity_read_ms");
    const settings = getOutreachCampaignSettings_();
    const draftMap = outreachDraftMap_();
    const programMap = outreachProgramMap_();
    const engagementMap = outreachEngagementMap_();
    mark("supporting_tabs_ms");
    records = rows.map((row, index) => outreachRecord_(row, index + 2, activityMap, settings, draftMap, programMap, engagementMap))
      .filter(record => record.business);
  }
  mark("record_build_ms");

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const due = records.filter(record => isDueOutreach_(record, endOfToday));
  const ready = records.filter(isReadyOutreach_)
    .sort((a, b) => outreachPriorityScore_(b) - outreachPriorityScore_(a));
  const sent = records.filter(isSentOutreach_)
    .sort((a, b) => {
      const aDate = outreachDate_(a.last_emailed);
      const bDate = outreachDate_(b.last_emailed);
      return (bDate ? bDate.getTime() : 0) - (aDate ? aDate.getTime() : 0);
    });
  const waiting = sent.filter(record => ["sent", "follow-up sent", "reactivation sent"].includes(outreachStatusLower_(record)));
  const weeklyReady = records.filter(record => record.weekly_eligible);
  const today = due.concat(ready.filter(record => !due.some(item => item.source_row === record.source_row)))
    .slice(0, 30);
  const directory = records.slice().sort((a, b) => String(a.business).localeCompare(String(b.business)));
  const mailer = cachedOutreachMailerStatus_() || {
    can_send:false,
    test_send_available:false,
    detail:"Sending status is loading separately.",
    pending:true,
  };
  mark("summary_build_ms");

  const totalMs = Date.now() - startedAt;
  console.log(JSON.stringify({
    event:"outreach_dashboard_timing",
    total_ms:totalMs,
    stages:timings,
    directory_rows:rows.length,
    activity_businesses:activityMap.size,
  }));

  return {
    can_send: mailer.can_send,
    test_send_available: mailer.test_send_available,
    send_configuration_detail: mailer.detail,
    send_status_pending:!!mailer.pending,
    today: slim ? today.map(record => record.source_row) : today,
    directory: slim ? directory.map(outreachSlimPayload_) : directory,
    sent: slim ? sent.slice(0, 50).map(record => record.source_row) : sent.slice(0, 50),
    newsletter_contacts: [],
    performance: { total_ms:totalMs },
    summary: {
      due_today: due.length,
      total_businesses: directory.length,
      waiting: waiting.length,
      weekly_ready: weeklyReady.length,
    },
  };
}

function apiGetOutreachRecord_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["source_row"]);
  const sourceRow = Number(p.source_row);
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  if (!Number.isInteger(sourceRow) || sourceRow < 2 || sourceRow > sheet.getLastRow()) {
    throw new Error("Business row not found.");
  }

  const headers = getHeaderMap_(sheet);
  const values = sheet.getRange(sourceRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = {};
  Object.keys(headers).forEach(key => row[key] = values[headers[key]]);
  const accountId = String(row.account_id || "").trim();
  const requestedAccountId = String(p.account_id || "").trim();
  if (requestedAccountId && accountId !== requestedAccountId) {
    throw new Error("Account identity changed. Refresh and try again.");
  }

  const record = outreachRecord_(
    row,
    sourceRow,
    outreachActivityMap_(),
    getOutreachCampaignSettings_(),
    outreachDraftMap_(),
    outreachProgramMap_(),
    outreachEngagementMap_()
  );
  if (!record.business) throw new Error("Business row is empty.");
  return { record:record };
}

// Campaigns are immutable recipient/message snapshots.  They make bulk review
// possible without changing a source lead or sending anything at creation time.
function outreachCampaignSheets_() {
  const ss = getOutreachSs_();
  return {
    campaigns: ensureSheet_(ss, OUTREACH_CAMPAIGNS_SHEET_NAME, [
      "Campaign ID", "Campaign Name", "Audience", "Status", "Recipient Count", "Audience Checksum",
      "Unsegmented Count", "Created At", "Created By", "Approved At", "Approved By", "Approval Token",
      "Last Batch At", "Sent Count", "Blocked Count", "App Version"
    ]),
    recipients: ensureSheet_(ss, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, [
      "Campaign ID", "Source Row", "Account ID", "Business Name", "Recipient Email", "Contact", "Priority",
      "Email Confidence", "Segment", "Wave", "Subject", "Body Text", "HTML", "Content Checksum",
      "Status", "Result Detail", "Zoho Message ID", "Sent At", "Idempotency Token", "App Version"
    ]),
  };
}

function outreachCampaignRow_(sheet, campaignId) {
  const h = getHeaderMap_(sheet);
  if (sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const index = values.findIndex(row => String(row[h.campaign_id] || "") === String(campaignId || ""));
  return index < 0 ? null : { row:index + 2, values:values[index], headers:h };
}

function campaignRecipientRows_(sheet, campaignId) {
  const h = getHeaderMap_(sheet);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues()
    .map((values, index) => ({ row:index + 2, values:values, headers:h }))
    .filter(item => String(item.values[h.campaign_id] || "") === String(campaignId || ""));
}

function campaignObject_(campaign, recipients, includeRecipients) {
  const h = campaign.headers;
  const value = key => campaign.values[h[key]];
  const recipientObjects = recipients.map(item => {
    const rh = item.headers;
    const get = key => item.values[rh[key]];
    return {
      source_row:Number(get("source_row") || 0), account_id:String(get("account_id") || ""),
      business:String(get("business_name") || ""), email:String(get("recipient_email") || ""),
      contact:String(get("contact") || ""), priority:String(get("priority") || ""),
      email_confidence:String(get("email_confidence") || ""), segment:String(get("segment") || ""), wave:String(get("wave") || ""),
      subject:String(get("subject") || ""), body_text:String(get("body_text") || ""), preview_html:String(get("html") || ""),
      content_checksum:String(get("content_checksum") || ""), status:String(get("status") || ""),
      result_detail:String(get("result_detail") || ""), message_id:String(get("zoho_message_id") || ""),
      sent_at:get("sent_at") || "", idempotency_token:String(get("idempotency_token") || ""),
    };
  });
  const counts = recipientObjects.reduce((all, item) => { all[item.status || "Unknown"] = (all[item.status || "Unknown"] || 0) + 1; return all; }, {});
  const result = {
    campaign_id:String(value("campaign_id") || ""), name:String(value("campaign_name") || ""), audience:String(value("audience") || ""),
    status:String(value("status") || ""), recipient_count:Number(value("recipient_count") || recipientObjects.length),
    audience_checksum:String(value("audience_checksum") || ""), unsegmented_count:Number(value("unsegmented_count") || 0),
    created_at:value("created_at") || "", created_by:String(value("created_by") || ""), approved_at:value("approved_at") || "",
    approved_by:String(value("approved_by") || ""), sent_count:Number(value("sent_count") || 0), blocked_count:Number(value("blocked_count") || 0),
    counts:counts,
  };
  if (includeRecipients) {
    result.recipients = recipientObjects;
    result.approval_token = String(value("approval_token") || "");
  }
  return result;
}

function apiGetOutreachCampaigns_() {
  const sheets = outreachCampaignSheets_();
  const h = getHeaderMap_(sheets.campaigns);
  if (sheets.campaigns.getLastRow() < 2) return { campaigns:[] };
  const recipientHeaders = getHeaderMap_(sheets.recipients);
  const recipientCount = Math.max(0, sheets.recipients.getLastRow() - 1);
  const recipientIds = recipientCount ? sheets.recipients.getRange(2, recipientHeaders.campaign_id + 1, recipientCount, 1).getValues() : [];
  const recipientStatuses = recipientCount ? sheets.recipients.getRange(2, recipientHeaders.status + 1, recipientCount, 1).getValues() : [];
  const listHeaders = { campaign_id:0, status:1 };
  const allRecipients = recipientIds.map((id, index) => ({
    row:index + 2,
    values:[id[0], recipientStatuses[index]?.[0] || ""],
    headers:listHeaders,
  }));
  const campaigns = sheets.campaigns.getRange(2, 1, sheets.campaigns.getLastRow() - 1, sheets.campaigns.getLastColumn()).getValues()
    .map((values, index) => ({ row:index + 2, values:values, headers:h }))
    .reverse().map(campaign => campaignObject_(campaign, allRecipients.filter(item => String(item.values[item.headers.campaign_id] || "") === String(campaign.values[h.campaign_id] || "")), false));
  return { campaigns:campaigns };
}

function apiGetOutreachCampaign_(p) {
  const sheets = outreachCampaignSheets_();
  const campaign = outreachCampaignRow_(sheets.campaigns, p?.campaign_id);
  if (!campaign) throw new Error("Campaign not found.");
  return { campaign:campaignObject_(campaign, campaignRecipientRows_(sheets.recipients, p.campaign_id), true) };
}

function campaignRecipientFooterHtml_(recipient, settings, draftMap) {
  const rh = recipient.headers;
  const stored = rh.footer_html === undefined ? "" : String(recipient.values[rh.footer_html] || "");
  if (stored) return stored;
  const sourceRow = Number(recipient.values[rh.source_row] || 0);
  const leadSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  if (!Number.isInteger(sourceRow) || sourceRow < 2 || sourceRow > leadSheet.getLastRow()) return "";
  const headers = getHeaderMap_(leadSheet);
  const values = leadSheet.getRange(sourceRow, 1, 1, leadSheet.getLastColumn()).getValues()[0];
  const source = {};
  Object.keys(headers).forEach(key => source[key] = values[headers[key]]);
  const stage = String(outreachValue_(source, ["next_email", "stage"]) || "Initial").trim();
  const accountId = String(source.account_id || "").trim();
  const draft = draftMap.get(outreachDraftKey_(accountId || sourceRow, stage)) || draftMap.get(outreachDraftKey_(sourceRow, stage));
  return String(outreachMessage_(source, settings, draft).footer_html || "");
}

function apiSetOutreachCampaignRecipientExclusion_(p) {
  requireFields_(p || {}, ["campaign_id", "idempotency_token"]);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    if (String(campaign.values[campaign.headers.status] || "") !== "Review") throw new Error("Only a campaign in Review can change recipient exclusions.");
    const recipient = campaignRecipientRows_(sheets.recipients, p.campaign_id)
      .find(item => String(item.values[item.headers.idempotency_token] || "") === String(p.idempotency_token || ""));
    if (!recipient) throw new Error("Campaign recipient not found.");
    const rh = recipient.headers;
    const exclude = p.exclude === true;
    const reason = publicText_(p.reason || "", 500, "Exclusion reason");
    if (exclude && !reason) throw new Error("Provide a reason before excluding a recipient.");
    recipient.values[rh.status] = exclude ? "Excluded" : "Ready for review";
    recipient.values[rh.result_detail] = exclude ? `Excluded from this campaign: ${reason}` : "Restored for campaign review.";
    recipient.values[rh.app_version] = APP_VERSION;
    sheets.recipients.getRange(recipient.row, 1, 1, recipient.values.length).setValues([recipient.values]);
    appendAudit_(exclude ? "EXCLUDE_OUTREACH_CAMPAIGN_RECIPIENT" : "RESTORE_OUTREACH_CAMPAIGN_RECIPIENT", "Campaign recipient", String(p.idempotency_token), String(recipient.values[rh.account_id] || ""), authenticatedActor_(p, "Sturgeon Distribution Hub"), OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, OUTREACH_CAMPAIGNS_SHEET_NAME, exclude ? "Excluded" : "Review", `${recipient.values[rh.business_name]}${exclude ? `: ${reason}` : ""}`);
    return { message:exclude ? "Recipient excluded from this campaign. No email was sent." : "Recipient restored for campaign review. No email was sent.", status:String(recipient.values[rh.status] || "") };
  } finally {
    lock.releaseLock();
  }
}

function apiUpdateOutreachCampaignRecipient_(p) {
  requireFields_(p || {}, ["campaign_id", "idempotency_token", "subject", "body_text", "content_checksum"]);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    const ch = campaign.headers;
    if (String(campaign.values[ch.status] || "") !== "Review") throw new Error("Only a campaign in Review can be edited.");
    const recipient = campaignRecipientRows_(sheets.recipients, p.campaign_id)
      .find(item => String(item.values[item.headers.idempotency_token] || "") === String(p.idempotency_token || ""));
    if (!recipient) throw new Error("Campaign recipient not found.");
    const rh = recipient.headers;
    if (String(recipient.values[rh.status] || "") !== "Ready for review") throw new Error("Only an unsent recipient returned to review can be edited.");
    if (String(recipient.values[rh.content_checksum] || "") !== String(p.content_checksum || "")) throw new Error("This email was changed elsewhere. Refresh the campaign before editing it.");
    const subject = publicText_(p.subject, 500, "Email subject");
    const bodyText = publicText_(p.body_text, 20000, "Email message");
    if (!subject || !bodyText) throw new Error("Email subject and message are required.");
    const footerHtml = campaignRecipientFooterHtml_(recipient, getOutreachCampaignSettings_(), outreachDraftMap_());
    const checksum = sha256_([recipient.values[rh.source_row], recipient.values[rh.account_id], recipient.values[rh.business_name], recipient.values[rh.recipient_email], subject, bodyText].join("|"));
    recipient.values[rh.subject] = subject;
    recipient.values[rh.body_text] = bodyText;
    recipient.values[rh.html] = outreachPlainTextToHtml_(bodyText) + footerHtml;
    if (rh.footer_html !== undefined) recipient.values[rh.footer_html] = footerHtml;
    recipient.values[rh.content_checksum] = checksum;
    recipient.values[rh.app_version] = APP_VERSION;
    sheets.recipients.getRange(recipient.row, 1, 1, recipient.values.length).setValues([recipient.values]);
    const recipients = campaignRecipientRows_(sheets.recipients, p.campaign_id);
    campaign.values[ch.audience_checksum] = sha256_(recipients.map(item => `${item.values[item.headers.source_row]}|${item.values[item.headers.recipient_email]}|${item.values[item.headers.content_checksum]}`).join("\n"));
    campaign.values[ch.app_version] = APP_VERSION;
    sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
    appendAudit_("EDIT_OUTREACH_CAMPAIGN_RECIPIENT", "Campaign recipient", String(p.idempotency_token), String(recipient.values[rh.account_id] || ""), authenticatedActor_(p, "Sturgeon Distribution Hub"), OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, OUTREACH_CAMPAIGNS_SHEET_NAME, "Review", `Edited ${recipient.values[rh.business_name]}.`);
    return { message:"Campaign email saved. No email was sent.", content_checksum:checksum, audience_checksum:String(campaign.values[ch.audience_checksum] || "") };
  } finally {
    lock.releaseLock();
  }
}

function apiCreateOutreachCampaign_(p) {
  const name = publicText_(p?.campaign_name || "Initial prospect campaign", 120, "Campaign name");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const leadSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const activityMap = outreachActivityMap_();
    const settings = getOutreachCampaignSettings_();
    const draftMap = outreachDraftMap_();
    const programMap = outreachProgramMap_();
    const engagementMap = outreachEngagementMap_();
    // A campaign only includes untouched initial prospects. Narrow the source rows before
    // rendering messages so snapshot creation stays within the interactive request window.
    const candidateRows = getAllRowsAsObjects_(leadSheet).map((row, index) => ({ row:row, sourceRow:index + 2 }))
      .filter(item => {
        const relationship = String(outreachValue_(item.row, ["relationship"]) || "").trim().toLowerCase();
        const nextEmail = String(outreachValue_(item.row, ["next_email", "stage"]) || "Initial").trim().toLowerCase();
        return relationship === "prospect" && (!nextEmail || nextEmail === "initial");
      });
    const records = candidateRows.map(item => outreachRecord_(item.row, item.sourceRow, activityMap, settings, draftMap, programMap, engagementMap));
    const seenEmails = new Set();
    const eligible = records.filter(record => {
      if (String(record.relationship || "").trim().toLowerCase() !== "prospect") return false;
      if (String(record.next_email || "Initial").trim().toLowerCase() !== "initial") return false;
      if (outreachSendEligibility_(record).length) return false;
      const email = String(record.email || "").trim().toLowerCase();
      if (seenEmails.has(email)) return false;
      seenEmails.add(email);
      return true;
    }).sort((a, b) => outreachPriorityScore_(b) - outreachPriorityScore_(a) || String(a.business).localeCompare(String(b.business)));
    if (!eligible.length) throw new Error("No eligible initial prospects are available for a campaign.");
    const campaignId = permanentId_("CMP");
    const recipientRows = eligible.map(record => {
      const checksum = sha256_([record.source_row, record.account_id, record.business, record.email, record.subject, record.body_text].join("|"));
      return [campaignId, record.source_row, record.account_id, record.business, record.email, record.contact, record.priority,
        record.email_confidence, record.segment, record.wave, record.subject, record.body_text, record.preview_html, checksum,
        "Ready for review", "", "", "", `${campaignId}-${record.source_row}`, APP_VERSION];
    });
    const audienceChecksum = sha256_(recipientRows.map(row => `${row[1]}|${row[4]}|${row[13]}`).join("\n"));
    const unsegmentedCount = eligible.filter(record => !String(record.segment || "").trim()).length;
    const campaignHeaders = getHeaderMap_(sheets.campaigns);
    if (sheets.campaigns.getLastRow() >= 2) {
      const matching = sheets.campaigns.getRange(2, 1, sheets.campaigns.getLastRow() - 1, sheets.campaigns.getLastColumn()).getValues()
        .find(row => ["Review", "Approved"].includes(String(row[campaignHeaders.status] || "")) && String(row[campaignHeaders.audience_checksum] || "") === audienceChecksum);
      if (matching) {
        return { message:"A matching active campaign already exists. No duplicate was created.", campaign_id:String(matching[campaignHeaders.campaign_id]), recipient_count:Number(matching[campaignHeaders.recipient_count] || eligible.length), audience_checksum:audienceChecksum, unsegmented_count:Number(matching[campaignHeaders.unsegmented_count] || unsegmentedCount), already_exists:true };
      }
    }
    sheets.recipients.getRange(sheets.recipients.getLastRow() + 1, 1, recipientRows.length, recipientRows[0].length).setValues(recipientRows);
    sheets.campaigns.appendRow([campaignId, name, "Eligible initial prospects", "Review", eligible.length, audienceChecksum,
      unsegmentedCount, new Date(), authenticatedActor_(p, "Sturgeon Distribution Hub"), "", "", "", "", 0, 0, APP_VERSION]);
    appendAudit_("CREATE_OUTREACH_CAMPAIGN", "Campaign", campaignId, "", authenticatedActor_(p, "Sturgeon Distribution Hub"), OUTREACH_SHEET_NAME, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, "Review", `${eligible.length} frozen recipients.`);
    return { message:"Campaign created for review. No email was sent.", campaign_id:campaignId, recipient_count:eligible.length, audience_checksum:audienceChecksum, unsegmented_count:unsegmentedCount };
  } finally { lock.releaseLock(); }
}

function apiApproveOutreachCampaign_(p) {
  requireFields_(p || {}, ["campaign_id", "audience_checksum", "staff_name"]);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    const h = campaign.headers;
    if (String(campaign.values[h.status] || "") !== "Review") throw new Error("Only a campaign awaiting review can be approved.");
    if (String(campaign.values[h.audience_checksum] || "") !== String(p.audience_checksum || "")) throw new Error("Campaign recipients changed. Refresh and review again.");
    const recipients = campaignRecipientRows_(sheets.recipients, p.campaign_id);
    if (Number(p.recipient_count || 0) !== recipients.length) throw new Error("Recipient count confirmation does not match this campaign.");
    const unsegmented = recipients.filter(item => !String(item.values[item.headers.segment] || "").trim()).length;
    if (unsegmented && p.confirm_unsegmented !== true) throw new Error(`${unsegmented} recipients have no segment. Confirm the default template before approval.`);
    const token = Utilities.getUuid().replace(/-/g, "");
    const now = new Date();
    campaign.values[h.status] = "Approved"; campaign.values[h.approved_at] = now; campaign.values[h.approved_by] = authenticatedActor_(p, "Sturgeon Distribution Hub"); campaign.values[h.approval_token] = token;
    campaign.values[h.app_version] = APP_VERSION;
    sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
    recipients.filter(item => String(item.values[item.headers.status] || "") === "Ready for review").forEach(item => {
      item.values[item.headers.status] = "Ready to send";
      item.values[item.headers.app_version] = APP_VERSION;
      sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
    });
    appendAudit_("APPROVE_OUTREACH_CAMPAIGN", "Campaign", p.campaign_id, "", authenticatedActor_(p, "Sturgeon Distribution Hub"), OUTREACH_CAMPAIGNS_SHEET_NAME, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, "Approved", `${recipients.length} recipients approved.`);
    return { message:"Campaign approved. No email was sent.", approval_token:token, recipient_count:recipients.length };
  } finally { lock.releaseLock(); }
}

function apiReopenOutreachCampaign_(p) {
  requireFields_(p || {}, ["campaign_id", "staff_name"]);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    const ch = campaign.headers;
    const campaignStatus = String(campaign.values[ch.status] || "");
    if (!["Review", "Approved", "Complete with blocks"].includes(campaignStatus)) {
      throw new Error(`This campaign is ${campaignStatus || "not in a reopenable state"} and cannot be reopened.`);
    }
    const recipients = campaignRecipientRows_(sheets.recipients, p.campaign_id);
    const acceptedTokens = new Set(outreachActivityRows_().filter(row => {
      const result = String(row.result || "").toUpperCase();
      return row.idempotency_token && result.includes("SENT") && !result.includes("TEST");
    }).map(row => String(row.idempotency_token)));
    const reopenable = recipients.filter(item => {
      const rh = item.headers;
      const status = String(item.values[rh.status] || "");
      if (status === "Ready to send") return true;
      return status === "Blocked"
        && !String(item.values[rh.zoho_message_id] || "").trim()
        && !acceptedTokens.has(String(item.values[rh.idempotency_token] || ""));
    });
    if (!reopenable.length) {
      throw new Error(campaignStatus === "Review"
        ? "Nothing to reopen. Every unsent recipient is already editable, and any blocked recipient with a recorded accepted send was left alone."
        : "There are no unsent campaign recipients to reopen.");
    }
    const leadSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const leadHeaders = getHeaderMap_(leadSheet);
    let correctedSubjects = 0;
    let reopenedBlocked = 0;
    reopenable.forEach(item => {
      const rh = item.headers;
      const wasBlocked = String(item.values[rh.status] || "") === "Blocked";
      const sourceRow = Number(item.values[rh.source_row] || 0);
      const source = sourceRow >= 2 && sourceRow <= leadSheet.getLastRow()
        ? leadSheet.getRange(sourceRow, 1, 1, leadSheet.getLastColumn()).getValues()[0] : null;
      const city = source && leadHeaders.city !== undefined ? String(source[leadHeaders.city] || "").trim().toLowerCase() : "";
      const currentSubject = String(item.values[rh.subject] || "");
      if (city && city !== "oshkosh" && currentSubject.includes("made here in Oshkosh")) {
        item.values[rh.subject] = currentSubject.replace("made here in Oshkosh", "made in Oshkosh");
        item.values[rh.content_checksum] = sha256_([item.values[rh.source_row], item.values[rh.account_id], item.values[rh.business_name], item.values[rh.recipient_email], item.values[rh.subject], item.values[rh.body_text]].join("|"));
        correctedSubjects += 1;
      }
      item.values[item.headers.status] = "Ready for review";
      item.values[item.headers.result_detail] = wasBlocked
        ? `Reopened after block: ${String(item.values[item.headers.result_detail] || "").slice(0, 300)}`
        : "Reopened for edits before delivery.";
      item.values[item.headers.app_version] = APP_VERSION;
      sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
      if (wasBlocked) reopenedBlocked += 1;
    });
    const updatedRecipients = campaignRecipientRows_(sheets.recipients, p.campaign_id);
    campaign.values[ch.audience_checksum] = sha256_(updatedRecipients.map(item => `${item.values[item.headers.source_row]}|${item.values[item.headers.recipient_email]}|${item.values[item.headers.content_checksum]}`).join("\n"));
    campaign.values[ch.status] = "Review";
    campaign.values[ch.approved_at] = "";
    campaign.values[ch.approved_by] = "";
    campaign.values[ch.approval_token] = "";
    campaign.values[ch.app_version] = APP_VERSION;
    sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
    appendAudit_("REOPEN_OUTREACH_CAMPAIGN", "Campaign", p.campaign_id, "", authenticatedActor_(p, "Sturgeon Distribution Hub"), OUTREACH_CAMPAIGNS_SHEET_NAME, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, "Review", `${reopenable.length} recipients reopened (${reopenedBlocked} previously blocked); ${correctedSubjects} non-Oshkosh subjects corrected; sent and excluded recipients were unchanged.`);
    return { message:`${reopenable.length} recipients reopened (${reopenedBlocked} previously blocked); ${correctedSubjects} non-Oshkosh subjects corrected. No email was sent.`, recipient_count:reopenable.length, reopened_blocked:reopenedBlocked, corrected_subjects:correctedSubjects };
  } finally { lock.releaseLock(); }
}

function apiSendOutreachCampaignBatch_(p) {
  requireFields_(p || {}, ["campaign_id", "approval_token", "staff_name"]);
  const requestedSize = Number(p.batch_size || 10);
  if (!Number.isInteger(requestedSize) || requestedSize < 1 || requestedSize > 20) throw new Error("Batch size must be between 1 and 20.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error("Another outreach send is in progress. Wait a moment and try again.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    const ch = campaign.headers;
    if (String(campaign.values[ch.status] || "") !== "Approved") throw new Error("Campaign must be approved before delivery.");
    if (String(campaign.values[ch.approval_token] || "") !== String(p.approval_token || "")) throw new Error("Campaign approval is not valid. Refresh and review again.");
    const recipients = campaignRecipientRows_(sheets.recipients, p.campaign_id)
      .filter(item => String(item.values[item.headers.status] || "") === "Ready to send").slice(0, requestedSize);
    if (!recipients.length) return { message:"No campaign recipients are waiting to send.", sent:0, blocked:0, remaining:0, results:[] };
    const leadSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const leadHeaders = getHeaderMap_(leadSheet);
    const activityMap = outreachActivityMap_();
    const settings = getOutreachCampaignSettings_();
    const draftMap = outreachDraftMap_();
    const programMap = outreachProgramMap_();
    const engagementMap = outreachEngagementMap_();
    const staffName = authenticatedActor_(p, "Sturgeon Distribution Hub");
    const results = []; let sent = 0; let blocked = 0;
    for (const item of recipients) {
      const rh = item.headers;
      const sourceRow = Number(item.values[rh.source_row] || 0);
      let result = null;
      try {
        if (!Number.isInteger(sourceRow) || sourceRow < 2 || sourceRow > leadSheet.getLastRow()) throw new Error("Source lead no longer exists.");
        const raw = leadSheet.getRange(sourceRow, 1, 1, leadSheet.getLastColumn()).getValues()[0];
        const current = {}; Object.keys(leadHeaders).forEach(key => current[key] = raw[leadHeaders[key]]);
        const record = outreachRecord_(current, sourceRow, activityMap, settings, draftMap, programMap, engagementMap);
        if (record.business !== String(item.values[rh.business_name] || "") || record.email.toLowerCase() !== String(item.values[rh.recipient_email] || "").toLowerCase()) throw new Error("Business or recipient changed after review.");
        const reasons = outreachSendEligibility_(record);
        if (reasons.length) throw new Error(reasons.join("; "));
        const token = String(item.values[rh.idempotency_token] || "");
        const prior = acceptedOutreachSendForToken_(token);
        result = prior || callOutreachMailer_({ action:"sendAppEmail", idempotency_token:token, account_id:record.account_id,
          source_row:sourceRow, business:record.business, recipient:record.email, message_stage:"Initial",
          subject:String(item.values[rh.subject] || ""), html:String(item.values[rh.html] || ""), requested_by:staffName });
        if (!result.accepted || !String(result.message_id || "").trim()) throw new Error("Zoho did not return a verified message ID.");
        const sentAt = result.sent_at ? new Date(result.sent_at) : new Date();
        finalizeOutreachSend_(leadSheet, sourceRow, record, "Initial", String(result.message_id), isNaN(sentAt.getTime()) ? new Date() : sentAt, staffName, token);
        item.values[rh.status] = "Sent"; item.values[rh.result_detail] = result.idempotent ? "Previously accepted and recovered." : "Zoho accepted delivery.";
        item.values[rh.zoho_message_id] = String(result.message_id); item.values[rh.sent_at] = isNaN(sentAt.getTime()) ? new Date() : sentAt; item.values[rh.app_version] = APP_VERSION;
        sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
        sent += 1; results.push({ source_row:sourceRow, business:record.business, status:"Sent", message_id:String(result.message_id) });
      } catch (error) {
        if (result?.accepted && String(result.message_id || "").trim()) {
          const acceptedAt = result.sent_at ? new Date(result.sent_at) : new Date();
          item.values[rh.status] = "Sent - needs recording";
          item.values[rh.result_detail] = `Zoho accepted; recording failed: ${String(error.message || error).slice(0, 1500)}`;
          item.values[rh.zoho_message_id] = String(result.message_id);
          item.values[rh.sent_at] = isNaN(acceptedAt.getTime()) ? new Date() : acceptedAt;
          item.values[rh.app_version] = APP_VERSION;
          sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
          appendAudit_("SEND_OUTREACH_EMAIL_PARTIAL", "Campaign recipient", String(item.values[rh.idempotency_token] || ""), String(item.values[rh.account_id] || ""), staffName, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, OUTREACH_SHEET_NAME, "Needs recovery", `Message ${result.message_id}; ${String(error.message || error)}`);
          sent += 1; results.push({ source_row:sourceRow, business:String(item.values[rh.business_name] || ""), status:"Sent - needs recording", message_id:String(result.message_id) });
          continue;
        }
        item.values[rh.status] = "Blocked"; item.values[rh.result_detail] = String(error.message || error).slice(0, 2000); item.values[rh.app_version] = APP_VERSION;
        sheets.recipients.getRange(item.row, 1, 1, item.values.length).setValues([item.values]);
        blocked += 1; results.push({ source_row:sourceRow, business:String(item.values[rh.business_name] || ""), status:"Blocked", detail:String(error.message || error) });
        if (p.continue_after_block !== true) break; // Manual batches pause for review; the explicit continue run skips uncertain recipients without retrying them.
      }
    }
    const allRecipients = campaignRecipientRows_(sheets.recipients, p.campaign_id);
    const remaining = allRecipients.filter(item => String(item.values[item.headers.status] || "") === "Ready to send").length;
    const needsRecording = allRecipients.filter(item => String(item.values[item.headers.status] || "") === "Sent - needs recording").length;
    const sentTotal = allRecipients.filter(item => ["Sent", "Sent - needs recording"].includes(String(item.values[item.headers.status] || ""))).length;
    const blockedTotal = allRecipients.filter(item => String(item.values[item.headers.status] || "") === "Blocked").length;
    campaign.values[ch.last_batch_at] = new Date(); campaign.values[ch.sent_count] = sentTotal;
    campaign.values[ch.blocked_count] = blockedTotal; campaign.values[ch.app_version] = APP_VERSION;
    if (!remaining) campaign.values[ch.status] = needsRecording ? "Complete with recording warnings" : blockedTotal ? "Complete with blocks" : "Complete";
    sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
    appendAudit_("SEND_OUTREACH_CAMPAIGN_BATCH", "Campaign", p.campaign_id, "", staffName, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, OUTREACH_ACTIVITY_SHEET_NAME, blocked ? "Stopped for review" : "Completed", `${sent} sent; ${blocked} blocked; ${remaining} remaining.`);
    return { message:blocked && p.continue_after_block !== true ? "Batch stopped for review after a blocked recipient." : `Batch complete: ${sent} sent; ${blocked} blocked; ${needsRecording} need recording.`, sent:sent, blocked:blocked, needs_recording:needsRecording, remaining:remaining, results:results };
  } finally { lock.releaseLock(); }
}

function outreachStatusForOutcome_(outcome) {
  const map = {
    "Interested": "Interested",
    "Schedule tasting": "Interested",
    "Follow up later": "Follow-up due",
    "Visit in person": "Interested",
    "Wrong contact": "Needs email",
    "Bad address": "Needs email",
    "Not interested": "Not interested",
    "Unsubscribed": "Do not contact",
  };
  return map[outcome] || "Replied";
}

const OUTREACH_OUTCOME_VALUES = [
  "Interested", "Schedule tasting", "Follow up later", "Visit in person",
  "Wrong contact", "Bad address", "Not interested", "Unsubscribed",
];
const OUTREACH_FOLLOW_UP_OUTCOMES = new Set(["Interested", "Schedule tasting", "Follow up later", "Visit in person"]);

function appendOutreachActivity_(record, outcome, notes) {
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  const h = ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER]);
  const row = Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  set("timestamp", new Date());
  set("account_id", record.account_id || "");
  set("business", record.business);
  set("intended_recipient", record.email);
  set("message_stage", "OUTCOME");
  set("subject", "Staff follow-up outcome");
  set("result", outcome);
  set("error/detail", notes || "Logged in Sturgeon Distribution Hub");
  set("error_detail", notes || "Logged in Sturgeon Distribution Hub");
  set("delivered_to", "");
  set("mailer_version", APP_VERSION);
  sheet.appendRow(row);
}

function appendOutreachDraftActivity_(record, stage, subject) {
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  const h = ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER]);
  const row = Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  set("timestamp", new Date());
  set("account_id", record.account_id || "");
  set("business", record.business);
  set("intended_recipient", record.email);
  set("message_stage", stage);
  set("subject", subject);
  set("result", "DRAFT SAVED");
  set("error/detail", "Saved in Sturgeon Distribution Hub; no email sent.");
  set("error_detail", "Saved in Sturgeon Distribution Hub; no email sent.");
  set("delivered_to", "");
  set("mailer_version", APP_VERSION);
  sheet.appendRow(row);
}

function apiSaveOutreachDraft_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["source_row", "business", "message_stage", "subject", "body_text"]);

  const subject = publicText_(p.subject, 200, "Subject");
  const bodyText = publicText_(p.body_text, 20000, "Message");
  if (!subject) throw new Error("Subject is required.");
  if (!bodyText) throw new Error("Message is required.");

  const leadsSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(p.source_row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > leadsSheet.getLastRow()) throw new Error("Business row not found.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another draft update is in progress. Try again in a moment.");
  try {
    const h = getHeaderMap_(leadsSheet);
    const values = leadsSheet.getRange(rowNumber, 1, 1, leadsSheet.getLastColumn()).getValues()[0];
    const current = {};
    Object.keys(h).forEach(key => current[key] = values[h[key]]);
    const currentBusiness = String(outreachValue_(current, ["business", "business_name"]) || "").trim();
    const currentEmail = String(outreachValue_(current, ["email", "email_address"]) || "").trim();
    const accountId = String(current.account_id || "").trim();
    const currentStage = String(outreachValue_(current, ["next_email", "stage"]) || "Initial").trim();
    if (currentBusiness !== String(p.business || "").trim()) throw new Error("Business row changed. Refresh and try again.");
    if (p.email && currentEmail !== String(p.email).trim()) throw new Error("Contact email changed. Refresh and try again.");
    if (p.account_id && accountId !== String(p.account_id).trim()) throw new Error("Account identity changed. Refresh and try again.");
    if (currentStage.toLowerCase() !== String(p.message_stage || "").trim().toLowerCase()) {
      throw new Error("Email stage changed. Refresh before saving this draft.");
    }

    const sheet = getOutreachDraftSheet_(true);
    const headers = getHeaderMap_(sheet);
    const key = outreachDraftKey_(accountId || rowNumber, currentStage);
    const now = new Date();
    const updatedBy = authenticatedActor_(p, "Sturgeon Distribution Hub");
    const rowValues = Array(sheet.getLastColumn()).fill("");
    const set = (name, value) => { if (headers[name] !== undefined) rowValues[headers[name]] = value; };
    set("draft_key", key);
    set("account_id", accountId);
    set("source_row", rowNumber);
    set("business_name", currentBusiness);
    set("email", currentEmail);
    set("message_stage", currentStage);
    set("subject", subject);
    set("body_text", bodyText);
    set("updated_at", now);
    set("updated_by", updatedBy);
    set("app_version", APP_VERSION);

    let targetRow = sheet.getLastRow() + 1;
    if (sheet.getLastRow() >= 2) {
      const keyColumn = headers.draft_key + 1;
      const keys = sheet.getRange(2, keyColumn, sheet.getLastRow() - 1, 1).getValues();
      const match = keys.findIndex(row => String(row[0] || "") === key);
      if (match >= 0) targetRow = match + 2;
    }
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    appendOutreachDraftActivity_({ account_id:accountId, business:currentBusiness, email:currentEmail }, currentStage, subject);
    appendAudit_("SAVE_OUTREACH_DRAFT", "Account", accountId, accountId, updatedBy, OUTREACH_SHEET_NAME, OUTREACH_DRAFTS_SHEET_NAME, "Completed", currentStage);
    return { message:"Email draft saved.", account_id:accountId, source_row:rowNumber, updated_at:now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function outreachMailerProperties_() {
  const properties = PropertiesService.getScriptProperties();
  return {
    url:String(properties.getProperty("OUTREACH_MAILER_URL") || "").trim(),
    secret:String(properties.getProperty("OUTREACH_MAILER_SHARED_SECRET") || "").trim(),
  };
}

function outreachMailerConfigured_() {
  const config = outreachMailerProperties_();
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.url) && config.secret.length >= 24;
}

const OUTREACH_MAILER_STATUS_CACHE_KEY = "outreach_mailer_status_v1";

function cachedOutreachMailerStatus_() {
  const cached = CacheService.getScriptCache().get(OUTREACH_MAILER_STATUS_CACHE_KEY);
  if (!cached) return null;
  try { return JSON.parse(cached); }
  catch (error) { return null; }
}

function outreachMailerStatus_() {
  const cached = cachedOutreachMailerStatus_();
  if (cached) return cached;
  let status;
  if (!outreachMailerConfigured_()) {
    status = { can_send:false, test_send_available:false, detail:"Mailer URL or shared secret is not configured." };
    CacheService.getScriptCache().put(OUTREACH_MAILER_STATUS_CACHE_KEY, JSON.stringify(status), 60);
    return status;
  }
  try {
    const result = callOutreachMailer_({ action:"appMailerStatus" });
    status = {
      can_send:!!result.can_send,
      test_send_available:!!result.test_send_available,
      detail:String(result.detail || ""),
    };
  } catch (error) {
    status = { can_send:false, test_send_available:false, detail:String(error.message || error) };
  }
  CacheService.getScriptCache().put(OUTREACH_MAILER_STATUS_CACHE_KEY, JSON.stringify(status), status.can_send || status.test_send_available ? 60 : 15);
  return status;
}

function apiGetOutreachSendStatus_() {
  return outreachMailerStatus_();
}

function callOutreachMailer_(payload) {
  const config = outreachMailerProperties_();
  if (!outreachMailerConfigured_()) throw new Error("Direct sending is not configured. Set OUTREACH_MAILER_URL and OUTREACH_MAILER_SHARED_SECRET in the Inventory Backend Script Properties.");
  const response = UrlFetchApp.fetch(config.url, {
    method:"post",
    contentType:"application/json",
    payload:JSON.stringify(Object.assign({}, payload, { service_token:config.secret })),
    muteHttpExceptions:true,
    followRedirects:true,
  });
  let result;
  try { result = JSON.parse(response.getContentText() || "{}"); }
  catch (error) { throw new Error("The Distribution Outreach mailer returned an unreadable response."); }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !result.ok) {
    throw new Error(result?.error || `The Distribution Outreach mailer failed with HTTP ${response.getResponseCode()}.`);
  }
  return result;
}

function outreachActivityRows_() {
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER, "Message ID", "Idempotency Token"]);
  return getAllRowsAsObjects_(sheet);
}

function acceptedOutreachSendForToken_(token) {
  const normalized = String(token || "").trim();
  if (!normalized) return null;
  const row = outreachActivityRows_().slice().reverse().find(item => {
    const result = String(item.result || "").toUpperCase();
    return String(item.idempotency_token || "") === normalized && result.indexOf("SENT") >= 0 && result.indexOf("TEST") < 0;
  });
  return row ? {
    accepted:true,
    message_id:String(row.message_id || ""),
    sent_at:row.timestamp || new Date(),
    idempotent:true,
  } : null;
}

function legacyPilotSent_(record) {
  const sheet = getOutreachSs_().getSheetByName(OUTREACH_PILOT_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return false;
  return getAllRowsAsObjects_(sheet).some(row => {
    const email = String(outreachValue_(row, ["email", "intended_recipient"]) || "").trim().toLowerCase();
    const business = String(outreachValue_(row, ["business", "business_name"]) || "").trim().toLowerCase();
    const status = String(outreachValue_(row, ["send_status", "status"]) || "").trim().toUpperCase();
    const messageId = String(outreachValue_(row, ["message_id", "zoho_message_id"]) || "").trim();
    const sentAt = outreachValue_(row, ["sent_at", "sent_timestamp"]);
    return email === String(record.email || "").trim().toLowerCase()
      && (!business || business === String(record.business || "").trim().toLowerCase())
      && (status.indexOf("SENT") === 0 || !!messageId || !!sentAt);
  });
}

function outreachSendEligibility_(record) {
  const reasons = [];
  const email = String(record.email || "").trim().toLowerCase();
  const stage = String(record.next_email || "Initial").trim();
  const status = outreachStatusLower_(record);
  const outcome = String(record.outcome || "").trim().toLowerCase();
  const confidence = String(record.email_confidence || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reasons.push("Recipient email is invalid");
  if (record.do_not_email || ["do not contact", "not interested", "unsubscribed"].includes(status) || ["bad address", "unsubscribed", "not interested", "do not contact"].includes(outcome)) reasons.push("Business is excluded from email");
  if (confidence && !["confirmed", "published", "supplied"].includes(confidence)) reasons.push("Recipient email is not verified");
  const sentForStage = (record.activity || []).some(item => {
    const result = String(item.result || "").toUpperCase();
    return String(item.stage || "").trim().toLowerCase() === stage.toLowerCase() && result.indexOf("SENT") >= 0 && result.indexOf("TEST") < 0;
  });
  if (sentForStage) reasons.push(`${stage} was already sent`);
  if (stage === "Initial") {
    if (record.last_emailed || record.message_id || legacyPilotSent_(record)) reasons.push("An initial email was already sent");
    if (!["not contacted", "review", "approved"].includes(status)) reasons.push("Business is not eligible for initial outreach");
  } else if (stage === "Follow-up 1" || stage === "Follow-up 2") {
    if (!["follow-up due", "sent", "follow-up sent"].includes(status)) reasons.push("Follow-up is not due");
  } else if (stage === "Reactivation") {
    if (!["reactivation due", "use reactivation"].includes(status)) reasons.push("Reactivation is not due");
  } else {
    reasons.push("Email stage is not sendable");
  }
  return Array.from(new Set(reasons));
}

function outreachNextStage_(stage) {
  if (stage === "Initial") return "Follow-up 1";
  if (stage === "Follow-up 1") return "Follow-up 2";
  return "Complete";
}

function outreachAddDays_(date, days) {
  const value = new Date(date.getTime());
  value.setDate(value.getDate() + Number(days || 0));
  return value;
}

function finalizeOutreachSend_(sheet, rowNumber, record, stage, messageId, sentAt, staffName, idempotencyToken) {
  const h = getHeaderMap_(sheet);
  const setCell = (keys, value) => {
    const key = keys.find(candidate => h[candidate] !== undefined);
    if (key) sheet.getRange(rowNumber, h[key] + 1).setValue(value);
  };
  const settings = getOutreachCampaignSettings_();
  const nextStage = outreachNextStage_(stage);
  const followUpDays = stage === "Initial"
    ? Number(settings["Follow-up days"] || 7)
    : Number(settings["Second follow-up days"] || 7);
  setCell(["queue", "queue?"], false);
  setCell(["next_email", "stage"], nextStage);
  setCell(["status"], stage === "Initial" ? "Sent" : stage === "Reactivation" ? "Reactivation sent" : "Follow-up sent");
  setCell(["last_emailed", "last_email"], sentAt);
  setCell(["next_follow-up", "next_follow_up"], nextStage === "Complete" ? "" : outreachAddDays_(sentAt, followUpDays));
  setCell(["message_id", "zoho_message_id"], messageId || "");
  setCell(["record_updated_at"], new Date());
  appendAudit_("SEND_OUTREACH_EMAIL", "Account", record.account_id, record.account_id, staffName, OUTREACH_DRAFTS_SHEET_NAME, OUTREACH_ACTIVITY_SHEET_NAME, "Completed", `${stage}; message ${messageId || "accepted without message ID"}; token ${idempotencyToken}`);
  return nextStage;
}

function apiSendOutreachEmail_(p, testMode) {
  if (!p) throw new Error("Missing send request.");
  requireFields_(p, ["source_row", "business", "message_stage", "idempotency_token", "staff_name"]);
  const token = String(p.idempotency_token || "").trim();
  if (!/^[A-Za-z0-9_-]{20,160}$/.test(token)) throw new Error("A valid idempotency token is required.");
  const rowNumber = Number(p.source_row);
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error("Business row not found.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another outreach send is in progress. Wait a moment and try again.");
  let accepted = false;
  let acceptedMessageId = "";
  try {
    const h = getHeaderMap_(sheet);
    const values = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    const current = {};
    Object.keys(h).forEach(key => current[key] = values[h[key]]);
    const activityMap = outreachActivityMap_();
    const settings = getOutreachCampaignSettings_();
    const draftMap = outreachDraftMap_();
    const record = outreachRecord_(current, rowNumber, activityMap, settings, draftMap, outreachProgramMap_(), outreachEngagementMap_());
    const stage = String(record.next_email || "Initial").trim();
    if (record.business !== String(p.business || "").trim()) throw new Error("Business row changed. Refresh and try again.");
    if (p.email && record.email.toLowerCase() !== String(p.email).trim().toLowerCase()) throw new Error("Recipient changed. Refresh and try again.");
    if (p.account_id && record.account_id !== String(p.account_id).trim()) throw new Error("Account identity changed. Refresh and try again.");
    if (stage.toLowerCase() !== String(p.message_stage || "").trim().toLowerCase()) throw new Error("Email stage changed. Refresh and try again.");
    if (!record.has_saved_draft) throw new Error("Save the reviewed subject and message before sending.");
    if (String(p.subject || "").trim() !== record.subject || String(p.body_text || "").trim() !== record.body_text) throw new Error("The reviewed draft changed. Save it again before sending.");

    let result = !testMode ? acceptedOutreachSendForToken_(token) : null;
    if (!result) {
      // A test is delivered only to Karl and never changes the prospect's send
      // status. Real sends still require a valid, verified, eligible recipient.
      const reasons = testMode ? [] : outreachSendEligibility_(record);
      if (reasons.length) throw new Error(reasons.join("; ") + ".");
      result = callOutreachMailer_({
        action:testMode ? "sendAppTestEmail" : "sendAppEmail",
        idempotency_token:token,
        account_id:record.account_id,
        source_row:rowNumber,
        business:record.business,
        recipient:record.email,
        message_stage:stage,
        subject:record.subject,
        html:record.preview_html,
        requested_by:publicText_(p.staff_name, 120, "Staff name"),
      });
    }
    if (!result.accepted) throw new Error("Zoho did not accept the email.");
    accepted = true;
    acceptedMessageId = String(result.message_id || "");
    if (result.partial_failure) {
      appendAudit_("SEND_OUTREACH_EMAIL_PARTIAL", "Account", record.account_id, record.account_id, String(p.staff_name || "Staff"), "Distribution Outreach", OUTREACH_ACTIVITY_SHEET_NAME, "Needs recovery", String(result.partial_failure));
    }
    if (testMode) return { message:"Test email accepted by Zoho. The business was not marked sent.", test:true, message_id:acceptedMessageId, idempotent:!!result.idempotent };
    const sentAt = result.sent_at ? new Date(result.sent_at) : new Date();
    const nextStage = finalizeOutreachSend_(sheet, rowNumber, record, stage, acceptedMessageId, isNaN(sentAt.getTime()) ? new Date() : sentAt, publicText_(p.staff_name, 120, "Staff name"), token);
    return { message:"Email accepted by Zoho and recorded.", accepted:true, message_id:acceptedMessageId, next_stage:nextStage, idempotent:!!result.idempotent };
  } catch (error) {
    if (accepted) {
      appendAudit_("SEND_OUTREACH_EMAIL_PARTIAL", "Account", String(p.account_id || ""), String(p.account_id || ""), String(p.staff_name || "Staff"), OUTREACH_ACTIVITY_SHEET_NAME, OUTREACH_SHEET_NAME, "Needs recovery", `Zoho accepted message ${acceptedMessageId || "without ID"}; ${String(error.message || error)}`);
      throw new Error(`Zoho accepted the email${acceptedMessageId ? ` (${acceptedMessageId})` : ""}, but follow-up recording needs recovery. Do not resend; retry with the same review window.`);
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function apiUpdateOutreachOutcome_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["source_row", "business", "outcome"]);

  const outcome = String(p.outcome || "").trim();
  if (!OUTREACH_OUTCOME_VALUES.includes(outcome)) throw new Error("Unsupported outcome.");
  const followUpText = String(p.next_follow_up || "").trim();
  if (OUTREACH_FOLLOW_UP_OUTCOMES.has(outcome) && !followUpText) {
    throw new Error(`Choose a next follow-up date for “${outcome}.”`);
  }
  const followUpDate = followUpText ? new Date(`${followUpText}T12:00:00`) : null;
  if (followUpText && isNaN(followUpDate.getTime())) throw new Error("Next follow-up date is invalid.");

  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(p.source_row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error("Lead row not found.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another outreach update is in progress.");
  try {
    const h = getHeaderMap_(sheet);
    const rowRange = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn());
    const values = rowRange.getValues()[0];
    const current = {};
    Object.keys(h).forEach(key => current[key] = values[h[key]]);
    const currentBusiness = String(outreachValue_(current, ["business", "business_name"]) || "").trim();
    const currentEmail = String(outreachValue_(current, ["email", "email_address"]) || "").trim();
    const accountId = String(current.account_id || "").trim();
    if (currentBusiness !== String(p.business || "").trim()) throw new Error("Lead changed in the sheet. Refresh and try again.");
    if (p.email && currentEmail !== String(p.email).trim()) throw new Error("Contact email changed in the sheet. Refresh and try again.");
    if (p.account_id && accountId !== String(p.account_id).trim()) throw new Error("Account identity changed. Refresh and try again.");

    const setRowValue = (keys, value) => {
      const key = keys.find(candidate => h[candidate] !== undefined);
      if (key) values[h[key]] = value;
    };
    setRowValue(["status"], outreachStatusForOutcome_(outcome));
    setRowValue(["outcome"], outcome);
    setRowValue(["record_updated_at"], new Date());
    if (followUpDate) setRowValue(["next_follow-up", "next_follow_up"], followUpDate);
    if (["Not interested", "Unsubscribed"].includes(outcome)) setRowValue(["do_not_email", "do_not_contact"], true);
    if (p.notes) {
      const priorNotes = String(outreachValue_(current, ["notes"]) || "").trim();
      const datedNote = `${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd")} - ${String(p.notes).trim()}`;
      setRowValue(["notes"], priorNotes ? `${priorNotes}\n${datedNote}` : datedNote);
    }

    if (h.outcome !== undefined) {
      sheet.getRange(rowNumber, h.outcome + 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(OUTREACH_OUTCOME_VALUES, true).setAllowInvalid(false).build()
      );
    }
    rowRange.setValues([values]);

    appendOutreachActivity_({ account_id:accountId, business:currentBusiness, email:currentEmail }, outcome, String(p.notes || ""));
    appendAudit_("UPDATE_OUTREACH_OUTCOME", "Account", accountId, accountId, String(p.staff_name || "Staff"), OUTREACH_SHEET_NAME, OUTREACH_SHEET_NAME, "Completed", outcome);
    return { message:"Outcome saved.", account_id:accountId, source_row:rowNumber, status:outreachStatusForOutcome_(outcome) };
  } finally {
    lock.releaseLock();
  }
}

function apiUpdateOutreachBusiness_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["source_row", "business"]);
  if (!p.updates || typeof p.updates !== "object" || Array.isArray(p.updates)) throw new Error("Missing updates.");

  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(p.source_row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error("Business row not found.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another update is in progress. Try again in a moment.");
  try {
    const h = getHeaderMap_(sheet);
    const values = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    const current = {};
    Object.keys(h).forEach(key => current[key] = values[h[key]]);
    const currentBusiness = String(outreachValue_(current, ["business", "business_name"]) || "").trim();
    const currentEmail = String(outreachValue_(current, ["email", "email_address"]) || "").trim();
    const accountId = String(current.account_id || "").trim();
    if (currentBusiness !== String(p.business || "").trim()) throw new Error("Business row changed. Refresh and try again.");
    if (p.original_email && currentEmail !== String(p.original_email).trim()) throw new Error("Contact information changed. Refresh and try again.");
    if (p.account_id && accountId !== String(p.account_id).trim()) throw new Error("Account identity changed. Refresh and try again.");

    const changed = [];
    Object.keys(p.updates).forEach(canonical => {
      if (!Object.prototype.hasOwnProperty.call(OUTREACH_EDITABLE_FIELD_KEYS, canonical)) return;
      const actualKey = OUTREACH_EDITABLE_FIELD_KEYS[canonical].find(key => h[key] !== undefined);
      if (!actualKey) return;
      const value = String(p.updates[canonical] ?? "").trim();
      if (canonical === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("Enter a valid email address.");
      if (canonical === "craft_spirit_fit" && value && (!Number.isFinite(Number(value)) || Number(value) < 1 || Number(value) > 5)) {
        throw new Error("Craft-spirit fit must be between 1 and 5.");
      }
      if (canonical === "miles" && value && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
        throw new Error("Miles must be zero or greater.");
      }
      if (canonical === "email_confidence" && value && !["Confirmed", "Published", "Supplied", "Needs verification"].includes(value)) {
        throw new Error("Choose a listed email confidence.");
      }
      if (String(current[actualKey] ?? "").trim() === value) return;
      values[h[actualKey]] = value;
      changed.push(outreachFieldLabel_(canonical));
    });

    const additionalNote = String(p.additional_note || "").trim();
    if (additionalNote) {
      const notesKey = ["notes"].find(key => h[key] !== undefined);
      if (!notesKey) throw new Error("The directory does not have a Notes column.");
      const priorNotes = String(current[notesKey] || "").trim();
      const datedNote = `${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd")} - ${additionalNote}`;
      values[h[notesKey]] = priorNotes ? `${priorNotes}\n${datedNote}` : datedNote;
      changed.push("Notes");
    }

    if (!changed.length) return { message:"No contact changes to save.", source_row:rowNumber, changed:[] };
    if (h.record_updated_at !== undefined) values[h.record_updated_at] = new Date();
    sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
    appendOutreachActivity_(
      { account_id:accountId, business:currentBusiness, email:String(p.updates.email || currentEmail) },
      "CONTACT UPDATED",
      `Updated ${changed.join(", ")}`
    );
    appendAudit_("UPDATE_BUSINESS", "Account", accountId, accountId, String(p.staff_name || "Staff"), OUTREACH_SHEET_NAME, OUTREACH_SHEET_NAME, "Completed", changed.join(", "));
    return { message:"Contact information saved.", account_id:accountId, source_row:rowNumber, changed:changed };
  } finally {
    lock.releaseLock();
  }
}

function apiUpdateOutreachPrograms_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["source_row", "business", "newsletter_status", "ordering_status"]);

  const newsletterStatuses = ["Not invited", "Candidate", "Invite planned", "Invited", "Subscribed", "Declined", "Unsubscribed"];
  const orderingStatuses = ["Not offered", "Candidate", "Invite planned", "Invited", "Active", "Paused"];
  const newsletterStatus = String(p.newsletter_status || "").trim();
  const orderingStatus = String(p.ordering_status || "").trim();
  if (!newsletterStatuses.includes(newsletterStatus)) throw new Error("Choose a listed newsletter status.");
  if (!orderingStatuses.includes(orderingStatus)) throw new Error("Choose a listed online-ordering status.");

  const consentSource = String(p.newsletter_consent_source || "").trim();
  const newsletterDate = String(p.newsletter_status_date || "").trim();
  if (newsletterStatus === "Subscribed" && (!consentSource || !newsletterDate)) {
    throw new Error("A subscribed newsletter contact needs a consent source and status date.");
  }

  const leadsSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(p.source_row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > leadsSheet.getLastRow()) throw new Error("Business row not found.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another program update is in progress. Try again in a moment.");
  try {
    const leadHeaders = getHeaderMap_(leadsSheet);
    const leadValues = leadsSheet.getRange(rowNumber, 1, 1, leadsSheet.getLastColumn()).getValues()[0];
    const current = {};
    Object.keys(leadHeaders).forEach(key => current[key] = leadValues[leadHeaders[key]]);
    const currentBusiness = String(outreachValue_(current, ["business", "business_name"]) || "").trim();
    const currentEmail = String(outreachValue_(current, ["email", "email_address"]) || "").trim();
    const accountId = String(current.account_id || "").trim();
    if (currentBusiness !== String(p.business || "").trim()) throw new Error("Business row changed. Refresh and try again.");
    if (p.email && currentEmail !== String(p.email).trim()) throw new Error("Contact email changed. Refresh and try again.");
    if (p.account_id && accountId !== String(p.account_id).trim()) throw new Error("Account identity changed. Refresh and try again.");

    const sheet = getOutreachProgramSheet_(true);
    const h = getHeaderMap_(sheet);
    const programKey = `account::${accountId || rowNumber}`;
    const now = new Date();
    const updatedBy = authenticatedActor_(p, "Sturgeon Distribution Hub");
    const values = Array(sheet.getLastColumn()).fill("");
    const set = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
    set("program_key", programKey);
    set("account_id", accountId);
    set("source_row", rowNumber);
    set("business_name", currentBusiness);
    set("email", currentEmail);
    set("newsletter_status", newsletterStatus);
    set("newsletter_consent_source", consentSource);
    set("newsletter_status_date", newsletterDate ? new Date(`${newsletterDate}T12:00:00`) : "");
    set("ordering_status", orderingStatus);
    set("ordering_customer_id", String(p.ordering_customer_id || "").trim());
    set("ordering_invite_date", p.ordering_invite_date ? new Date(`${p.ordering_invite_date}T12:00:00`) : "");
    set("ordering_portal_url", String(p.ordering_portal_url || "").trim());
    set("updated_at", now);
    set("updated_by", updatedBy);
    set("notes", String(p.notes || "").trim());
    set("app_version", APP_VERSION);

    let targetRow = sheet.getLastRow() + 1;
    if (sheet.getLastRow() >= 2) {
      const keyColumn = h.program_key + 1;
      const keys = sheet.getRange(2, keyColumn, sheet.getLastRow() - 1, 1).getValues();
      const match = keys.findIndex(row => String(row[0] || "") === programKey);
      if (match >= 0) targetRow = match + 2;
    }
    sheet.getRange(targetRow, 1, 1, values.length).setValues([values]);

    const activitySheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
    const activityHeaders = ensureHeaderColumns_(activitySheet, [ACCOUNT_ID_HEADER]);
    const activityRow = Array(activitySheet.getLastColumn()).fill("");
    const setActivity = (key, value) => { if (activityHeaders[key] !== undefined) activityRow[activityHeaders[key]] = value; };
    setActivity("timestamp", now);
    setActivity("account_id", accountId);
    setActivity("business", currentBusiness);
    setActivity("intended_recipient", currentEmail);
    setActivity("message_stage", "PROGRAMS");
    setActivity("subject", "Optional program plan updated");
    setActivity("result", "PROGRAM PLAN SAVED");
    setActivity("error/detail", `Newsletter: ${newsletterStatus}; Online ordering: ${orderingStatus}; no action sent.`);
    setActivity("error_detail", `Newsletter: ${newsletterStatus}; Online ordering: ${orderingStatus}; no action sent.`);
    setActivity("mailer_version", APP_VERSION);
    activitySheet.appendRow(activityRow);
    appendAudit_("UPDATE_ACCOUNT_PROGRAMS", "Account", accountId, accountId, updatedBy, OUTREACH_SHEET_NAME, OUTREACH_PROGRAMS_SHEET_NAME, "Completed", `Newsletter: ${newsletterStatus}; ordering: ${orderingStatus}`);

    return { message:"Program plan saved.", account_id:accountId, source_row:rowNumber, updated_at:now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function getNewsletterContactsSheet_(createIfMissing) {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(NEWSLETTER_CONTACTS_SHEET_NAME);
  if (sheet) {
    ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER]);
    return sheet;
  }
  if (!createIfMissing) return sheet;
  sheet = ss.insertSheet(NEWSLETTER_CONTACTS_SHEET_NAME);
  const headers = [["Contact ID", "Account ID", "Name", "Email", "Organization", "Relationship Type", "Status", "Consent Source", "Consent Date", "Source Row", "Source Business", "Topics", "Notes", "Updated At", "Updated By", "App Version"]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers).setFontWeight("bold").setBackground("#e5e7eb").setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  return sheet;
}

function apiUpsertNewsletterContact_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["email", "relationship_type", "status"]);
  const email = String(p.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  const relationships = ["Customer", "Prospect", "Vendor", "Banker", "Distributor", "Community", "Partner", "Other"];
  const statuses = ["Candidate", "Invite planned", "Invited", "Subscribed", "Declined", "Unsubscribed"];
  if (!relationships.includes(String(p.relationship_type))) throw new Error("Choose a listed relationship.");
  if (!statuses.includes(String(p.status))) throw new Error("Choose a listed newsletter status.");
  if (p.status === "Subscribed" && (!String(p.consent_source || "").trim() || !p.consent_date)) {
    throw new Error("A subscribed contact needs a consent source and consent date.");
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another newsletter update is in progress. Try again in a moment.");
  try {
    const sheet = getNewsletterContactsSheet_(true);
    const h = getHeaderMap_(sheet);
    const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    const requestedId = String(p.contact_id || "").trim();
    let targetRow = 0;
    rows.forEach((row, index) => {
      const rowId = String(row[h.contact_id] || "");
      const rowEmail = String(row[h.email] || "").trim().toLowerCase();
      if (requestedId && rowId === requestedId) targetRow = index + 2;
      else if (!requestedId && rowEmail === email) throw new Error("That email is already on the newsletter list. Open the existing contact to edit it.");
    });
    const contactId = requestedId || Utilities.getUuid();
    const now = new Date();
    const values = Array(sheet.getLastColumn()).fill("");
    const set = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
    set("contact_id", contactId);
    set("account_id", String(p.account_id || "").trim());
    set("name", String(p.name || "").trim());
    set("email", email);
    set("organization", String(p.organization || "").trim());
    set("relationship_type", String(p.relationship_type));
    set("status", String(p.status));
    set("consent_source", String(p.consent_source || "").trim());
    set("consent_date", p.consent_date ? new Date(`${p.consent_date}T12:00:00`) : "");
    set("source_row", p.source_row || "");
    set("source_business", String(p.source_business || "").trim());
    set("topics", String(p.topics || "").trim());
    set("notes", String(p.notes || "").trim());
    set("updated_at", now);
    set("updated_by", authenticatedActor_(p, "Sturgeon Distribution Hub"));
    set("app_version", APP_VERSION);
    sheet.getRange(targetRow || sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
    return { message:"Newsletter contact saved.", contact_id:contactId, updated_at:now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function publicText_(value, maxLength, label) {
  const text = String(value ?? "").trim();
  if (text.length > maxLength) throw new Error(`${label} is too long.`);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

// Netlify sets authenticated_staff_name only after validating a Zoho session.
// Browser-provided staff_name is retained solely as a compatibility fallback for
// older operational records; the deployed Hub always supplies the trusted value.
function authenticatedActor_(p, fallback) {
  return publicText_(p?.authenticated_staff_name || p?.staff_name || fallback || "Sturgeon Distribution Hub", 120, "Staff name");
}

function publicEmail_(value, label, required) {
  const email = publicText_(value, 200, label).toLowerCase();
  if (required && !email) throw new Error(`${label} is required.`);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Enter a valid ${label.toLowerCase()}.`);
  return email;
}

function publicSubmissionId_(prefix) {
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  const suffix = Utilities.getUuid().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${prefix}-${date}-${suffix}`;
}

function getCustomerApplicationsSheet_(createIfMissing) {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(CUSTOMER_APPLICATIONS_SHEET_NAME);
  if (sheet) {
    ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER, "Account Link Status", "Inventory Tracking", "Inventory Store ID", "Inventory Route", "Data Sync Status"]);
    return sheet;
  }
  if (!createIfMissing) return sheet;
  sheet = ss.insertSheet(CUSTOMER_APPLICATIONS_SHEET_NAME);
  const headers = [[
    "Application ID", "Submitted At", "Workflow Status", "Legal Business Name", "Business Name", "Business Type", "Website",
    "Seller Permit Number",
    "Primary Contact Name", "Primary Contact Title", "Primary Email", "Primary Phone", "Ordering Email",
    "AP Contact Name", "AP Email", "Invoice Preference", "Delivery Address 1", "Delivery Address 2", "Delivery City",
    "Delivery State", "Delivery ZIP", "Delivery Window", "Delivery Instructions", "Billing Same", "Billing Address 1",
    "Billing City", "Billing State", "Billing ZIP", "Product Interests", "Expected Order Frequency", "Referral Source", "Notes",
    "Authorized Name", "Authorized Title", "Attested", "Newsletter Opt In", "Newsletter Consent At", "Submission Token", "App Version",
    "Account ID", "Account Link Status", "Inventory Tracking", "Inventory Store ID", "Inventory Route", "Data Sync Status"
  ]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers).setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff").setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  sheet.getRange("A:AM").setVerticalAlignment("top");
  sheet.getRange("Z:AI").setWrap(true);
  return sheet;
}

function getOnlineOrderRequestsSheet_(createIfMissing) {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(ONLINE_ORDER_REQUESTS_SHEET_NAME);
  if (sheet) {
    ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER, "Account Link Status", "Catalog Source", "Integration Status", "Badger Match Status", "Badger Customer Name", "Badger Invoice Date", "Badger Amount", "Delivered At"]);
    return sheet;
  }
  if (!createIfMissing) return sheet;
  sheet = ss.insertSheet(ONLINE_ORDER_REQUESTS_SHEET_NAME);
  const headers = [[
    "Request ID", "Submitted At", "Workflow Status", "Verification Status", "Business Name", "Customer ID", "Contact Name",
    "Email", "Phone", "PO Number", "Requested Delivery Date", "Delivery Window", "Delivery Instructions", "Notes",
    "Line Count", "Requested Cases", "Requested Bottles", "Bottle Equivalent", "Submission Token", "App Version",
    "Account ID", "Account Link Status", "Catalog Source", "Integration Status", "Badger Match Status", "Badger Customer Name", "Badger Invoice Date", "Badger Amount", "Delivered At"
  ]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers).setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff").setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  sheet.getRange("A:T").setVerticalAlignment("top");
  sheet.getRange("M:N").setWrap(true);
  return sheet;
}

function getOnlineOrderLinesSheet_(createIfMissing) {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(ONLINE_ORDER_LINES_SHEET_NAME);
  if (sheet) {
    ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER, "Catalog Source", "External Item ID"]);
    return sheet;
  }
  if (!createIfMissing) return sheet;
  sheet = ss.insertSheet(ONLINE_ORDER_LINES_SHEET_NAME);
  const headers = [["Request ID", "Account ID", "Line Number", "SKU ID", "SKU Name", "Quantity", "Unit", "Units Per Case", "Bottle Equivalent", "Catalog Source", "External Item ID", "App Version"]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers).setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff").setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  return sheet;
}

function existingSubmissionByToken_(sheet, token, idHeader) {
  if (!token || !sheet || sheet.getLastRow() < 2) return "";
  const h = getHeaderMap_(sheet);
  const idKey = normalizeHeader_(idHeader);
  if (h.submission_token === undefined || h[idKey] === undefined) return "";
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const match = values.find(row => String(row[h.submission_token] || "") === token);
  return match ? String(match[h[idKey]] || "") : "";
}

function upsertNewsletterFromApplication_(application) {
  if (!application.newsletter_opt_in) return;
  const sheet = getNewsletterContactsSheet_(true);
  const h = getHeaderMap_(sheet);
  const email = application.primary_email;
  const values = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const match = values.findIndex(row => String(row[h.email] || "").trim().toLowerCase() === email);
  const now = new Date();
  const row = match >= 0 ? values[match].slice() : Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  set("contact_id", match >= 0 ? String(row[h.contact_id] || Utilities.getUuid()) : Utilities.getUuid());
  set("account_id", application.account_id || "");
  set("name", application.primary_contact_name);
  set("email", email);
  set("organization", application.business_name || application.legal_business_name);
  set("relationship_type", "Customer");
  set("status", "Subscribed");
  set("consent_source", "Customer application form; option preselected and could be unchecked");
  set("consent_date", now);
  set("topics", "Products, cocktails, distillery updates");
  set("notes", `Application ${application.application_id}`);
  set("updated_at", now);
  set("updated_by", "customer application form");
  set("app_version", APP_VERSION);
  sheet.getRange(match >= 0 ? match + 2 : sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

function resolvePublicAccount_(claimedAccountId, business, email, city, lockHeld) {
  const identity = accountIdentityLookup_();
  return findIdentityMatch_(identity, claimedAccountId, business, email, city);
}

function sendCustomerApplicationNotification_(application, sheet, rowNumber) {
  const business = application.business_name || application.legal_business_name;
  const reviewUrl = `https://docs.google.com/spreadsheets/d/${OUTREACH_SPREADSHEET_ID}/edit#gid=${sheet.getSheetId()}&range=A${rowNumber}`;
  const subject = `New wholesale application: ${business}`;
  const lines = [
    "A new wholesale customer application is ready for review.",
    "",
    `Application ID: ${application.application_id}`,
    `Business: ${business}`,
    `Legal business name: ${application.legal_business_name}`,
    `Contact: ${application.primary_contact_name}`,
    `Email: ${application.primary_email}`,
    `Phone: ${application.primary_phone}`,
    `Newsletter: ${application.newsletter_opt_in ? "Yes" : "No"}`,
    "",
    `Review the application: ${reviewUrl}`,
  ];
  const html = [
    "<p>A new wholesale customer application is ready for review.</p>",
    "<ul>",
    `<li><strong>Application ID:</strong> ${escapeOutreachHtml_(application.application_id)}</li>`,
    `<li><strong>Business:</strong> ${escapeOutreachHtml_(business)}</li>`,
    `<li><strong>Legal business name:</strong> ${escapeOutreachHtml_(application.legal_business_name)}</li>`,
    `<li><strong>Contact:</strong> ${escapeOutreachHtml_(application.primary_contact_name)}</li>`,
    `<li><strong>Email:</strong> ${escapeOutreachHtml_(application.primary_email)}</li>`,
    `<li><strong>Phone:</strong> ${escapeOutreachHtml_(application.primary_phone)}</li>`,
    `<li><strong>Newsletter:</strong> ${application.newsletter_opt_in ? "Yes" : "No"}</li>`,
    "</ul>",
    `<p><a href="${escapeOutreachHtml_(reviewUrl)}">Review this application in the staging sheet</a></p>`,
  ].join("");

  try {
    MailApp.sendEmail({
      to: CUSTOMER_APPLICATION_NOTIFICATION_EMAIL,
      replyTo: application.primary_email,
      name: "Sturgeon Distribution Hub",
      subject: subject,
      body: lines.join("\n"),
      htmlBody: html,
    });
    return { status:"Sent", sent_at:new Date(), error:"" };
  } catch (error) {
    return { status:"Send error", sent_at:"", error:String(error).slice(0, 500) };
  }
}

function apiSubmitCustomerApplication_(p) {
  if (!p) throw new Error("Missing form data.");
  if (String(p.form_trap || "").trim()) return { message:"Application received.", application_id:"RECEIVED" };
  requireFields_(p, ["legal_business_name", "business_type", "seller_permit_number", "primary_contact_name", "primary_email", "primary_phone", "delivery_address_1", "delivery_city", "delivery_state", "delivery_zip", "authorized_name", "authorized_title", "submission_token"]);
  if (!toBool_(p.attested)) throw new Error("Authorization is required.");

  const application = {
    legal_business_name:publicText_(p.legal_business_name, 160, "Legal business name"),
    business_name:publicText_(p.business_name, 160, "Business name"),
    business_type:publicText_(p.business_type, 80, "Business type"),
    website:publicText_(p.website, 300, "Website"),
    seller_permit_number:publicText_(p.seller_permit_number, 30, "Seller permit number"),
    primary_contact_name:publicText_(p.primary_contact_name, 120, "Primary contact name"),
    primary_contact_title:publicText_(p.primary_contact_title, 100, "Primary contact title"),
    primary_email:publicEmail_(p.primary_email, "Primary email", true),
    primary_phone:publicText_(p.primary_phone, 40, "Primary phone"),
    ordering_email:publicEmail_(p.ordering_email || p.primary_email, "Ordering email", true),
    ap_contact_name:publicText_(p.ap_contact_name, 120, "Accounts payable contact"),
    ap_email:publicEmail_(p.ap_email, "Accounts payable email", false),
    invoice_preference:publicText_(p.invoice_preference, 60, "Invoice preference"),
    delivery_address_1:publicText_(p.delivery_address_1, 180, "Delivery address"),
    delivery_address_2:publicText_(p.delivery_address_2, 120, "Delivery address details"),
    delivery_city:publicText_(p.delivery_city, 100, "Delivery city"),
    delivery_state:publicText_(p.delivery_state, 2, "Delivery state").toUpperCase(),
    delivery_zip:publicText_(p.delivery_zip, 10, "Delivery ZIP code"),
    delivery_window:publicText_(p.delivery_window, 160, "Delivery window"),
    delivery_instructions:publicText_(p.delivery_instructions, 1000, "Delivery instructions"),
    billing_same:toBool_(p.billing_same),
    billing_address_1:publicText_(p.billing_address_1, 180, "Billing address"),
    billing_city:publicText_(p.billing_city, 100, "Billing city"),
    billing_state:publicText_(p.billing_state, 2, "Billing state").toUpperCase(),
    billing_zip:publicText_(p.billing_zip, 10, "Billing ZIP code"),
    product_interests:(Array.isArray(p.product_interests) ? p.product_interests : [p.product_interests]).filter(Boolean).map(value => publicText_(value, 80, "Product interest")).join(", "),
    expected_order_frequency:publicText_(p.expected_order_frequency, 80, "Expected order frequency"),
    referral_source:publicText_(p.referral_source, 160, "Referral source"),
    notes:publicText_(p.notes, 2000, "Notes"),
    authorized_name:publicText_(p.authorized_name, 120, "Authorized name"),
    authorized_title:publicText_(p.authorized_title, 100, "Authorized title"),
    newsletter_opt_in:toBool_(p.newsletter_opt_in),
    claimed_account_id:publicText_(p.account_id, 80, "Account ID"),
    submission_token:publicText_(p.submission_token, 120, "Submission token"),
  };
  if (!application.billing_same && (!application.billing_address_1 || !application.billing_city || !application.billing_state || !application.billing_zip)) {
    throw new Error("Complete the billing address or mark it the same as delivery.");
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another application is being recorded. Try again in a moment.");
  let journal = null;
  try {
    const sheet = getCustomerApplicationsSheet_(true);
    ensureHeaderColumns_(sheet, ["Notification Status", "Notification Sent At", "Notification Error", ACCOUNT_ID_HEADER, "Account Link Status", "Data Sync Status"]);
    const priorId = existingSubmissionByToken_(sheet, application.submission_token, "Application ID");
    if (priorId) return { message:"Application already received.", application_id:priorId };
    const link = resolvePublicAccount_(application.claimed_account_id, application.business_name || application.legal_business_name, application.primary_email, application.delivery_city, true);
    application.account_id = link.record ? link.record.account_id : "";
    application.account_link_status = link.status;
    journal = startSubmissionJournal_("Customer application", application.submission_token, application.account_id, application.business_name || application.legal_business_name, p);
    if (journal.prior_record_id) return { message:"Application already received.", application_id:journal.prior_record_id };
    const h = getHeaderMap_(sheet);
    const now = new Date();
    application.application_id = publicSubmissionId_("APP");
    const row = Array(sheet.getLastColumn()).fill("");
    const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
    set("application_id", application.application_id);
    set("submitted_at", now);
    set("workflow_status", "New");
    Object.keys(application).forEach(key => set(key, application[key]));
    set("account_id", application.account_id);
    set("account_link_status", application.account_link_status);
    set("data_sync_status", "Normalized record saved");
    set("attested", true);
    set("newsletter_consent_at", application.newsletter_opt_in ? now : "");
    set("app_version", APP_VERSION);
    sheet.appendRow(row);
    upsertNewsletterFromApplication_(application);
    const applicationRow = sheet.getLastRow();
    const notificationJob = enqueueIntegrationJob_("APPLICATION_NOTIFICATION", "Application", application.application_id, application.account_id, {
      application_id:application.application_id,
      business:application.business_name || application.legal_business_name,
      email:application.primary_email,
    });
    const notification = sendCustomerApplicationNotification_(application, sheet, applicationRow);
    sheet.getRange(applicationRow, h.notification_status + 1, 1, 3).setValues([[
      notification.status,
      notification.sent_at,
      notification.error,
    ]]);
    updateIntegrationJob_(notificationJob, notification.status === "Sent" ? "Completed" : "Retry", notification.error);
    completeSubmissionJournal_(journal, "Completed", application.application_id, "");
    appendAudit_("SUBMIT_APPLICATION", "Application", application.application_id, application.account_id, "Public customer form", "Customer application", CUSTOMER_APPLICATIONS_SHEET_NAME, "Completed", application.account_link_status);
    return { message:"Application received for review.", application_id:application.application_id, account_link_status:application.account_link_status };
  } catch (error) {
    if (journal) completeSubmissionJournal_(journal, "Needs recovery", "", error.message || error);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function rowsWithSource_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const h = getHeaderMap_(sheet);
  const keys = Object.keys(h);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().map((row, index) => {
    const record = { source_row:index + 2 };
    keys.forEach(key => { record[key] = row[h[key]]; });
    return record;
  });
}

function customerApplicationRecord_(row) {
  const businessName = String(row.business_name || row.legal_business_name || "").trim();
  return {
    source_row:row.source_row,
    application_id:String(row.application_id || ""),
    account_id:String(row.account_id || ""),
    account_link_status:String(row.account_link_status || "Needs staff match"),
    submitted_at:row.submitted_at || "",
    workflow_status:String(row.workflow_status || "New"),
    legal_business_name:String(row.legal_business_name || ""),
    business_name:businessName,
    business_type:String(row.business_type || ""),
    website:String(row.website || ""),
    seller_permit_number:String(row.seller_permit_number || ""),
    primary_contact_name:String(row.primary_contact_name || ""),
    primary_contact_title:String(row.primary_contact_title || ""),
    primary_email:String(row.primary_email || ""),
    primary_phone:String(row.primary_phone || ""),
    ordering_email:String(row.ordering_email || ""),
    ap_contact_name:String(row.ap_contact_name || ""),
    ap_email:String(row.ap_email || ""),
    invoice_preference:String(row.invoice_preference || ""),
    delivery_address_1:String(row.delivery_address_1 || ""),
    delivery_address_2:String(row.delivery_address_2 || ""),
    delivery_city:String(row.delivery_city || ""),
    delivery_state:String(row.delivery_state || ""),
    delivery_zip:String(row.delivery_zip || ""),
    delivery_window:String(row.delivery_window || ""),
    delivery_instructions:String(row.delivery_instructions || ""),
    billing_same:toBool_(row.billing_same),
    billing_address_1:String(row.billing_address_1 || ""),
    billing_city:String(row.billing_city || ""),
    billing_state:String(row.billing_state || ""),
    billing_zip:String(row.billing_zip || ""),
    product_interests:String(row.product_interests || ""),
    expected_order_frequency:String(row.expected_order_frequency || ""),
    referral_source:String(row.referral_source || ""),
    customer_notes:String(row.notes || ""),
    authorized_name:String(row.authorized_name || ""),
    authorized_title:String(row.authorized_title || ""),
    newsletter_opt_in:toBool_(row.newsletter_opt_in),
    notification_status:String(row.notification_status || ""),
    customer_id:String(row.customer_id || ""),
    assigned_to:String(row.assigned_to || ""),
    staff_notes:String(row.staff_notes || ""),
    review_updated_at:row.review_updated_at || "",
    review_updated_by:String(row.review_updated_by || ""),
    inventory_tracking:toBool_(row.inventory_tracking),
    inventory_store_id:String(row.inventory_store_id || ""),
    inventory_route:String(row.inventory_route || ""),
    data_sync_status:String(row.data_sync_status || ""),
  };
}

function onlineOrderRecord_(row, linesByRequest) {
  const requestId = String(row.request_id || "");
  return {
    source_row:row.source_row,
    request_id:requestId,
    account_id:String(row.account_id || ""),
    account_link_status:String(row.account_link_status || "Needs staff match"),
    submitted_at:row.submitted_at || "",
    workflow_status:String(row.workflow_status || "New"),
    verification_status:String(row.verification_status || "Needs review"),
    business_name:String(row.business_name || ""),
    customer_id:String(row.customer_id || ""),
    contact_name:String(row.contact_name || ""),
    email:String(row.email || ""),
    phone:String(row.phone || ""),
    po_number:String(row.po_number || ""),
    requested_delivery_date:row.requested_delivery_date || "",
    delivery_window:String(row.delivery_window || ""),
    delivery_instructions:String(row.delivery_instructions || ""),
    customer_notes:String(row.notes || ""),
    line_count:Number(row.line_count || 0),
    requested_cases:Number(row.requested_cases || 0),
    requested_bottles:Number(row.requested_bottles || 0),
    bottle_equivalent:Number(row.bottle_equivalent || 0),
    notification_status:String(row.notification_status || ""),
    badger_invoice_number:String(row.badger_invoice_number || ""),
    invoice_status:String(row.invoice_status || "Not started"),
    delivery_status:String(row.delivery_status || "Not scheduled"),
    assigned_to:String(row.assigned_to || ""),
    staff_notes:String(row.staff_notes || ""),
    review_updated_at:row.review_updated_at || "",
    review_updated_by:String(row.review_updated_by || ""),
    catalog_source:String(row.catalog_source || ORDER_CATALOG_SOURCE),
    integration_status:String(row.integration_status || "Pending review"),
    badger_match_status:String(row.badger_match_status || "Not checked"),
    badger_customer_name:String(row.badger_customer_name || ""),
    badger_invoice_date:row.badger_invoice_date || "",
    badger_amount:row.badger_amount || "",
    delivered_at:row.delivered_at || "",
    lines:linesByRequest.get(requestId) || [],
  };
}

function recordTimestamp_(value) {
  const date = value ? new Date(value) : null;
  return date && !isNaN(date.getTime()) ? date.getTime() : 0;
}

function getCustomerWorkflowLogSheet_() {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(CUSTOMER_WORKFLOW_LOG_SHEET_NAME);
  if (sheet) {
    ensureHeaderColumns_(sheet, [ACCOUNT_ID_HEADER]);
    return sheet;
  }
  sheet = ss.insertSheet(CUSTOMER_WORKFLOW_LOG_SHEET_NAME);
  const headers = [["Timestamp", "Record Type", "Record ID", "Account ID", "Business", "Previous Status", "New Status", "Updated By", "Details", "App Version"]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers).setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff");
  sheet.setFrozenRows(1);
  return sheet;
}

function appendCustomerWorkflowLog_(recordType, recordId, accountId, business, previousStatus, newStatus, updatedBy, details) {
  const sheet = getCustomerWorkflowLogSheet_();
  const h = getHeaderMap_(sheet);
  const row = Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  set("timestamp", new Date()); set("record_type", recordType); set("record_id", recordId); set("account_id", accountId || "");
  set("business", business); set("previous_status", previousStatus); set("new_status", newStatus); set("updated_by", updatedBy);
  set("details", details || ""); set("app_version", APP_VERSION);
  sheet.appendRow(row);
}

function findRecordRow_(sheet, idKey, idValue) {
  const h = getHeaderMap_(sheet);
  if (h[idKey] === undefined || sheet.getLastRow() < 2) return 0;
  const values = sheet.getRange(2, h[idKey] + 1, sheet.getLastRow() - 1, 1).getValues();
  const index = values.findIndex(row => String(row[0] || "") === String(idValue || ""));
  return index < 0 ? 0 : index + 2;
}

function orderOperationalStatuses_(order) {
  const statuses = [];
  if (String(order.workflow_status || "") === "New") statuses.push("New");
  if (!["New", "Cancelled", "Completed"].includes(String(order.workflow_status || ""))
      && !["Invoice received", "Invoice delivered", "Paid", "Cancelled"].includes(String(order.invoice_status || ""))) statuses.push("Awaiting invoice");
  if (String(order.workflow_status || "") === "Ready for delivery"
      || (["Invoice received", "Invoice delivered"].includes(String(order.invoice_status || "")) && String(order.delivery_status || "") !== "Delivered")) statuses.push("Ready");
  if (String(order.delivery_status || "") === "Delivered" || String(order.workflow_status || "") === "Completed") statuses.push("Delivered");
  return statuses;
}

function accountHistoryItem_(timestamp, type, title, detail, id, status) {
  return { timestamp:timestamp || "", type:type, title:title, detail:detail || "", id:id || "", status:status || "" };
}

const BADGER_INVOICE_CACHE_PREFIX = "hub_badger_invoices_v1";
const BADGER_INVOICE_CACHE_TTL_SECONDS = 900;
const BADGER_INVOICE_CACHE_CHUNK_SIZE = 80000;

function readBadgerInvoices_() {
  const sheet = SpreadsheetApp.openById(BADGER_TRACKER_SPREADSHEET_ID).getSheetByName("Invoices");
  if (!sheet || sheet.getLastRow() < 2) return [];
  return getAllRowsAsObjects_(sheet).map(row => ({
    invoice_number:String(firstPresent_(row, ["invoice_#", "invoice_number", "invoice_no"]) || ""),
    invoice_date:firstPresent_(row, ["invoice_date", "date"]) || "",
    customer_name:String(firstPresent_(row, ["customer_name", "customer"]) || ""),
    amount:firstPresent_(row, ["amount_due", "amount", "total"]) || "",
    paid:firstPresent_(row, ["paid_to_me", "paid"]) || "",
    pdf_file_id:String(firstPresent_(row, ["pdf_file_id"]) || ""),
  }));
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

function buildCustomerAccounts_(applications, orders) {
  const identity = accountIdentityFromRows_(getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME)));
  const programs = outreachProgramMap_();
  const activityRows = outreachActivityRows_();
  const workflowRows = rowsWithSource_(getOutreachSs_().getSheetByName(CUSTOMER_WORKFLOW_LOG_SHEET_NAME));
  const deliveryRows = rowsWithSource_(getOutreachSs_().getSheetByName(DELIVERIES_SHEET_NAME));
  const deliveryLineRows = rowsWithSource_(getOutreachSs_().getSheetByName(DELIVERY_LINES_SHEET_NAME));
  const trackedAccountIds = inventoryTrackedAccountIds_();
  const activeStores = isHubInventoryActive_()
    ? getAllRowsAsObjects_(getSheet_(SHEET_NAMES.STORES)).filter(row => inventoryStoreAllowed_(row, trackedAccountIds) && row.account_id)
    : [];
  const storeByAccount = new Map(activeStores.map(row => [String(row.account_id || ""), row]));
  const reorderRows = isHubInventoryActive_() ? getAllRowsAsObjects_(getSheet_(SHEET_NAMES.REORDERS)) : [];
  let badgerInvoices = [];
  try {
    badgerInvoices = cachedBadgerInvoices_(false);
  } catch (err) {
    console.warn("Badger invoice history was unavailable: " + String(err && err.message || err));
  }
  const now = new Date();
  const accounts = [];

  identity.rows.forEach((row, index) => {
    const accountId = String(row.account_id || "").trim();
    if (!accountId) return;
    const business = String(outreachValue_(row, ["business", "business_name"]) || "").trim();
    const email = String(outreachValue_(row, ["email", "email_address"]) || "").trim();
    const relationship = String(outreachValue_(row, ["relationship"]) || "").trim();
    const directoryStatus = String(outreachValue_(row, ["status"]) || "").trim();
    const accountApplications = applications.filter(item => item.account_id === accountId);
    const accountOrders = orders.filter(item => item.account_id === accountId);
    const program = programs.get(accountId) || programs.get(index + 2) || {};
    const isCustomer = accountApplications.some(item => ["Approved", "Account active"].includes(item.workflow_status))
      || accountOrders.length > 0
      || String(program.ordering_status || "") === "Active"
      || /customer/i.test(relationship)
      || /existing customer/i.test(directoryStatus);
    if (!isCustomer) return;

    const store = storeByAccount.get(accountId) || null;
    const accountDeliveries = deliveryRows.filter(item => String(item.account_id || "") === accountId).map(delivery => Object.assign({}, delivery, {
      lines:deliveryLineRows.filter(line => String(line.delivery_id || "") === String(delivery.delivery_id || "")),
    }));
    const accountActivity = activityRows.filter(item => String(item.account_id || "") === accountId
      || (!item.account_id && String(item.business || "").trim().toLowerCase() === business.toLowerCase()));
    const accountWorkflow = workflowRows.filter(item => String(item.account_id || "") === accountId);
    const accountReorders = store ? reorderRows.filter(item => String(item.store_id || "") === String(store.store_id || "")) : [];
    const orderInvoices = accountOrders.filter(order => order.badger_invoice_number || order.invoice_status !== "Not started").map(order => ({
      request_id:order.request_id,
      invoice_number:order.badger_invoice_number,
      invoice_status:order.invoice_status,
      badger_match_status:order.badger_match_status,
      invoice_date:order.badger_invoice_date,
      amount:order.badger_amount,
      customer_name:order.badger_customer_name,
    }));
    const accountInvoiceNumbers = new Set(orderInvoices.map(item => String(item.invoice_number || "").toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(Boolean));
    const invoices = badgerInvoices.filter(item => {
      const invoiceKey = String(item.invoice_number || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      return accountInvoiceNumbers.has(invoiceKey) || normalizeBusinessKey_(item.customer_name) === normalizeBusinessKey_(business);
    }).map(item => Object.assign({ invoice_status:/^(true|yes|y|paid|1)$/i.test(String(item.paid || "")) ? "Paid" : "Invoice received", badger_match_status:"Matched" }, item));
    orderInvoices.forEach(item => {
      const invoiceKey = String(item.invoice_number || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!invoiceKey || !invoices.some(invoice => String(invoice.invoice_number || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === invoiceKey)) invoices.push(item);
    });
    const operational = new Set();
    accountApplications.forEach(item => { if (item.workflow_status === "New") operational.add("New"); });
    accountOrders.forEach(order => orderOperationalStatuses_(order).forEach(status => operational.add(status)));
    const followUp = outreachDate_(outreachValue_(row, ["next_follow-up", "next_follow_up"]));
    if ((followUp && followUp.getTime() <= now.getTime()) || directoryStatus.toLowerCase() === "follow-up due" || accountReorders.some(item => String(item.status || "OPEN").toUpperCase() === "OPEN")) operational.add("Reorder due");
    if (store) operational.add("Inventory-counted");
    const history = [];
    accountApplications.forEach(item => history.push(accountHistoryItem_(item.submitted_at, "Application", `Application ${item.workflow_status}`, item.staff_notes || item.customer_notes, item.application_id, item.workflow_status)));
    accountOrders.forEach(item => history.push(accountHistoryItem_(item.submitted_at, "Order", `Order ${item.workflow_status}`, `${item.line_count || item.lines.length} products; invoice ${item.invoice_status}; delivery ${item.delivery_status}`, item.request_id, item.workflow_status)));
    invoices.forEach(item => history.push(accountHistoryItem_(item.invoice_date, "Invoice", `Invoice ${item.invoice_number || "recorded"}`, `Amount ${item.amount || "not recorded"}; ${item.invoice_status || "status not recorded"}`, item.invoice_number, item.invoice_status)));
    accountDeliveries.forEach(item => history.push(accountHistoryItem_(item.delivered_at || item.updated_at || item.created_at, "Delivery", `Delivery ${item.delivery_status || "recorded"}`, `${item.lines.length} product lines; invoice ${item.badger_invoice_number || "not recorded"}`, item.delivery_id, item.delivery_status)));
    accountActivity.forEach(item => history.push(accountHistoryItem_(item.timestamp, "Outreach", String(item.result || item.message_stage || "Activity"), String(item.error_detail || item["error/detail"] || ""), item.message_id, item.result)));
    accountWorkflow.forEach(item => history.push(accountHistoryItem_(item.timestamp, String(item.record_type || "Workflow"), `${item.previous_status || ""} → ${item.new_status || ""}`, item.details, item.record_id, item.new_status)));
    accountReorders.forEach(item => history.push(accountHistoryItem_(item.timestamp || item.created_at, "Inventory reorder", `Reorder ${item.status || "OPEN"}`, `${item.sku_id || "SKU"}: ${item.needed_units || item.need || ""} units`, item.sku_id, item.status || "OPEN")));
    history.sort((a, b) => recordTimestamp_(b.timestamp) - recordTimestamp_(a.timestamp));
    accounts.push({
      account_id:accountId,
      source_row:index + 2,
      business_name:business,
      contact_name:String(outreachValue_(row, ["contact", "contact_name", "contact_person"]) || ""),
      email:email,
      phone:String(outreachValue_(row, ["phone", "phone_number"]) || ""),
      city:String(outreachValue_(row, ["city"]) || ""),
      relationship:relationship,
      directory_status:directoryStatus,
      next_follow_up:outreachValue_(row, ["next_follow-up", "next_follow_up"]),
      last_emailed:outreachValue_(row, ["last_emailed", "last_email"]),
      inventory_tracking:!!store,
      inventory_store_id:store ? String(store.store_id || "") : "",
      operational_statuses:Array.from(operational),
      primary_status:["New", "Awaiting invoice", "Ready", "Delivered", "Reorder due", "Inventory-counted"].find(status => operational.has(status)) || "Account active",
      applications:accountApplications,
      orders:accountOrders,
      invoices:invoices,
      deliveries:accountDeliveries,
      reorders:accountReorders,
      history:history,
    });
  });
  return accounts.sort((a, b) => String(a.business_name || "").localeCompare(String(b.business_name || "")));
}

function apiGetCustomerWorkQueue_() {
  const startedAt = Date.now();
  const timings = {};
  let stageStartedAt = startedAt;
  const mark = name => {
    const now = Date.now();
    timings[name] = now - stageStartedAt;
    stageStartedAt = now;
  };
  const applicationSheet = getCustomerApplicationsSheet_(false);
  const orderSheet = getOnlineOrderRequestsSheet_(false);
  const lineSheet = getOnlineOrderLinesSheet_(false);
  mark("sheet_lookup_ms");

  const linesByRequest = new Map();
  rowsWithSource_(lineSheet).forEach(row => {
    const requestId = String(row.request_id || "");
    if (!requestId) return;
    if (!linesByRequest.has(requestId)) linesByRequest.set(requestId, []);
    linesByRequest.get(requestId).push({
      line_number:Number(row.line_number || 0),
      account_id:String(row.account_id || ""),
      sku_id:String(row.sku_id || ""),
      sku_name:String(row.sku_name || ""),
      quantity:Number(row.quantity || 0),
      unit:String(row.unit || ""),
      units_per_case:Number(row.units_per_case || 0),
      bottle_equivalent:Number(row.bottle_equivalent || 0),
      catalog_source:String(row.catalog_source || ORDER_CATALOG_SOURCE),
      external_item_id:String(row.external_item_id || ""),
    });
  });
  mark("order_lines_read_ms");

  const applications = rowsWithSource_(applicationSheet).map(customerApplicationRecord_)
    .filter(record => record.application_id)
    .sort((a, b) => recordTimestamp_(b.submitted_at) - recordTimestamp_(a.submitted_at));
  const orders = rowsWithSource_(orderSheet).map(row => onlineOrderRecord_(row, linesByRequest))
    .filter(record => record.request_id)
    .sort((a, b) => recordTimestamp_(b.submitted_at) - recordTimestamp_(a.submitted_at));
  mark("application_order_read_ms");
  orders.forEach(order => order.operational_statuses = orderOperationalStatuses_(order));
  applications.forEach(application => application.operational_statuses = application.workflow_status === "New" ? ["New"] : (application.inventory_tracking ? ["Inventory-counted"] : []));
  const accounts = buildCustomerAccounts_(applications, orders);
  mark("account_build_ms");
  const activeApplicationStatuses = ["New", "Reviewing", "Needs information"];
  const activeOrderStatuses = ["New", "Reviewing", "Confirmed", "Invoicing", "Ready for delivery"];

  const totalMs = Date.now() - startedAt;
  console.log(JSON.stringify({
    event:"customer_work_queue_timing",
    total_ms:totalMs,
    stages:timings,
    applications:applications.length,
    orders:orders.length,
    accounts:accounts.length,
  }));

  return {
    applications:applications,
    orders:orders,
    accounts:accounts,
    summary:{
      new_applications:applications.filter(record => record.workflow_status === "New").length,
      active_applications:applications.filter(record => activeApplicationStatuses.includes(record.workflow_status)).length,
      new_orders:orders.filter(record => record.workflow_status === "New").length,
      active_orders:orders.filter(record => activeOrderStatuses.includes(record.workflow_status)).length,
      invoice_needed:orders.filter(record => ["Confirmed", "Invoicing"].includes(record.workflow_status) && ["Not started", "Ready for Badger"].includes(record.invoice_status)).length,
      integration_attention:orders.filter(record => ["Needs retry", "Badger invoice not found", "Needs account match"].includes(record.integration_status)).length,
      customer_accounts:accounts.length,
      reorder_due:accounts.filter(record => record.operational_statuses.includes("Reorder due")).length,
    },
    performance:{ total_ms:totalMs },
  };
}

function makeStoreId_(business, accountId) {
  const words = String(business || "STORE").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const prefix = words.slice(0, 3).map(word => word.slice(0, 4)).join("-") || "STORE";
  return `${prefix}-${String(accountId || "").replace(/[^A-Z0-9]/gi, "").slice(-6).toUpperCase()}`.slice(0, 40);
}

function ensureInventoryStoreForApplication_(application, customerId, trackInventory, requestedStoreId, route) {
  const accountId = String(application.account_id || "");
  if (!trackInventory) {
    if (!isHubInventoryActive_()) return "";
    const inactiveSheet = getSheet_(SHEET_NAMES.STORES);
    const inactiveHeaders = ensureHeaderColumns_(inactiveSheet, ["account_id", "customer_id", "manager_name", "assistant_manager_name"]);
    const inactiveRows = getAllRowsAsObjects_(inactiveSheet);
    const inactiveIndex = inactiveRows.findIndex(row => accountId && String(row.account_id || "") === accountId);
    if (inactiveIndex >= 0) inactiveSheet.getRange(inactiveIndex + 2, inactiveHeaders.active + 1).setValue(false);
    return "";
  }
  if (!isHubInventoryActive_()) throw new Error("Initialize the hardened staging Hub before enabling inventory tracking.");
  const sheet = getSheet_(SHEET_NAMES.STORES);
  const h = ensureHeaderColumns_(sheet, ["account_id", "customer_id", "manager_name", "assistant_manager_name"]);
  const rows = getAllRowsAsObjects_(sheet);
  const existingIndex = rows.findIndex(row => String(row.account_id || "") === accountId);
  const storeId = publicText_(requestedStoreId || (existingIndex >= 0 ? rows[existingIndex].store_id : makeStoreId_(application.business_name, accountId)), 80, "Inventory store ID");
  const conflict = rows.find(row => String(row.store_id || "") === storeId && String(row.account_id || "") !== accountId);
  if (conflict) throw new Error("That inventory store ID is already used by another account.");
  const target = existingIndex >= 0 ? existingIndex + 2 : sheet.getLastRow() + 1;
  const values = existingIndex >= 0
    ? sheet.getRange(target, 1, 1, sheet.getLastColumn()).getValues()[0]
    : Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
  set("store_id", storeId);
  set("store_name", application.business_name);
  set("route", String(route || "Unassigned"));
  set("active", true);
  set("account_id", accountId);
  set("customer_id", customerId);
  sheet.getRange(target, 1, 1, values.length).setValues([values]);
  return storeId;
}

function upsertActiveAccountProgram_(account, customerId, applicationId, staffName) {
  const sheet = getOutreachProgramSheet_(true);
  const h = getHeaderMap_(sheet);
  const key = `account::${account.account_id}`;
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const index = rows.findIndex(row => String(row[h.program_key] || "") === key || String(row[h.account_id] || "") === account.account_id);
  const values = index >= 0 ? rows[index].slice() : Array(sheet.getLastColumn()).fill("");
  const set = (name, value) => { if (h[name] !== undefined) values[h[name]] = value; };
  const now = new Date();
  set("program_key", key); set("account_id", account.account_id); set("source_row", account.source_row);
  set("business_name", account.business); set("email", account.email); set("ordering_status", "Active");
  set("ordering_customer_id", customerId); set("ordering_invite_date", now);
  set("ordering_portal_url", `https://distribution-hub.netlify.app/order.html?account_id=${encodeURIComponent(account.account_id)}&customer_id=${encodeURIComponent(customerId || "")}`);
  set("updated_at", now); set("updated_by", staffName); set("notes", `Activated from application ${applicationId}`); set("app_version", APP_VERSION);
  sheet.getRange(index >= 0 ? index + 2 : sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
}

function synchronizeApplicationAccount_(application, p, staffName) {
  const identity = accountIdentityLookup_();
  let account = String(p.account_id || application.account_id || "") ? identity.by_id.get(String(p.account_id || application.account_id || "")) : null;
  if (!account) {
    const match = findIdentityMatch_(identity, "", application.business_name, application.primary_email, application.delivery_city);
    account = match.record;
  }
  if (!account) {
    const directory = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const accountId = permanentId_("ACC");
    directory.appendRow(directoryRowFromBusiness_(directory, {
      business_name:application.business_name,
      contact:application.primary_contact_name,
      email:application.primary_email,
      phone:application.primary_phone,
      address:application.delivery_address_1,
      city:application.delivery_city,
      state:application.delivery_state,
      postal_code:application.delivery_zip,
      relationship:"Current customer",
      status:"Existing customer",
      do_not_email:true,
      lead_source:`Customer application ${application.application_id}`,
      notes:`Created from approved application ${application.application_id}`,
    }, accountId, new Date()));
    account = accountIdentityFromRows_(getAllRowsAsObjects_(directory)).by_id.get(accountId);
  }
  const directory = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const h = getHeaderMap_(directory);
  const row = directory.getRange(account.source_row, 1, 1, directory.getLastColumn()).getValues()[0];
  const set = (aliases, value, overwrite) => {
    const key = aliases.map(normalizeHeader_).find(alias => h[alias] !== undefined);
    if (key === undefined) return;
    if (overwrite || !String(row[h[key]] || "").trim()) row[h[key]] = value;
  };
  set(["Business Name", "Business"], application.business_name, false);
  set(["Contact Person", "Contact"], application.primary_contact_name, false);
  set(["Email"], application.primary_email, false);
  set(["Phone Number", "Phone"], application.primary_phone, false);
  set(["Street Address", "Address"], application.delivery_address_1, false);
  set(["City"], application.delivery_city, false); set(["State"], application.delivery_state, false); set(["Zip Code", "ZIP"], application.delivery_zip, false);
  set(["Relationship"], "Current customer", true); set(["Status"], "Existing customer", true); set(["Do Not Email"], true, true);
  set(["Customer Source"], `Application ${application.application_id}`, true); set(["Record Updated At"], new Date(), true);
  directory.getRange(account.source_row, 1, 1, row.length).setValues([row]);
  account = accountIdentityFromRows_(getAllRowsAsObjects_(directory)).by_id.get(account.account_id);
  const customerId = publicText_(p.customer_id, 80, "Customer ID");
  upsertActiveAccountProgram_(account, customerId, application.application_id, staffName);
  const storeId = ensureInventoryStoreForApplication_(Object.assign({}, application, { account_id:account.account_id }), customerId, toBool_(p.inventory_tracking), p.inventory_store_id, p.inventory_route);
  appendAudit_("ACTIVATE_ACCOUNT", "Application", application.application_id, account.account_id, staffName, CUSTOMER_APPLICATIONS_SHEET_NAME, OUTREACH_SHEET_NAME, "Completed", `Customer ID ${customerId}; inventory store ${storeId || "not enabled"}.`);
  return { account_id:account.account_id, account_link_status:"Linked and active", inventory_store_id:storeId, data_sync_status:storeId ? "Directory, ordering and inventory store synchronized" : "Directory and ordering synchronized" };
}

function findBadgerInvoice_(invoiceNumber, bypassCache) {
  const normalized = String(invoiceNumber || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normalized) return null;
  const match = invoices => invoices.find(invoice =>
    String(invoice.invoice_number || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === normalized
  ) || null;
  const cachedMatch = match(cachedBadgerInvoices_(!!bypassCache));
  if (cachedMatch || bypassCache) return cachedMatch;

  const refreshed = cachedBadgerInvoices_(true);
  cacheBadgerInvoices_(refreshed);
  return match(refreshed);
}

function reconcileBadgerForOrder_(sheet, rowNumber, h, invoiceNumber, bypassCache) {
  const set = (key, value) => { if (h[key] !== undefined) sheet.getRange(rowNumber, h[key] + 1).setValue(value); };
  if (!String(invoiceNumber || "").trim()) {
    set("badger_match_status", "Not checked");
    return { matched:false, status:"Not checked" };
  }
  const match = findBadgerInvoice_(invoiceNumber, bypassCache);
  if (!match) {
    set("badger_match_status", "Pending parser import");
    set("integration_status", "Badger invoice not found");
    return { matched:false, status:"Pending parser import" };
  }
  set("badger_match_status", "Matched"); set("badger_customer_name", match.customer_name);
  set("badger_invoice_date", match.invoice_date); set("badger_amount", match.amount); set("integration_status", "Synchronized");
  return { matched:true, status:"Matched", invoice:match };
}

function upsertDeliveryForOrder_(order, lines, staffName) {
  const sheet = getOutreachSs_().getSheetByName(DELIVERIES_SHEET_NAME);
  const h = getHeaderMap_(sheet);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const index = rows.findIndex(row => String(row[h.request_id] || "") === order.request_id);
  const values = index >= 0 ? rows[index].slice() : Array(sheet.getLastColumn()).fill("");
  const deliveryId = index >= 0 ? String(values[h.delivery_id] || permanentId_("DLV")) : permanentId_("DLV");
  const set = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
  const now = new Date();
  set("delivery_id", deliveryId); set("request_id", order.request_id); set("account_id", order.account_id); set("store_id", order.store_id || "");
  set("business_name", order.business_name); set("delivery_status", order.delivery_status); set("requested_date", order.requested_delivery_date || "");
  if (order.delivery_status === "Delivered" && !values[h.delivered_at]) set("delivered_at", now);
  set("assigned_to", order.assigned_to || staffName); set("badger_invoice_number", order.badger_invoice_number || "");
  if (index < 0) set("created_at", now); set("updated_at", now); set("app_version", APP_VERSION);
  sheet.getRange(index >= 0 ? index + 2 : sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);

  const lineSheet = getOutreachSs_().getSheetByName(DELIVERY_LINES_SHEET_NAME);
  const lh = getHeaderMap_(lineSheet);
  const existing = lineSheet.getLastRow() < 2 ? [] : lineSheet.getRange(2, 1, lineSheet.getLastRow() - 1, lineSheet.getLastColumn()).getValues();
  const existingKeys = new Set(existing.map(row => `${row[lh.request_id]}::${row[lh.line_number]}`));
  const newRows = lines.filter(line => !existingKeys.has(`${order.request_id}::${line.line_number}`)).map(line => {
    const row = Array(lineSheet.getLastColumn()).fill("");
    const setLine = (key, value) => { if (lh[key] !== undefined) row[lh[key]] = value; };
    setLine("delivery_id", deliveryId); setLine("request_id", order.request_id); setLine("account_id", order.account_id); setLine("line_number", line.line_number);
    setLine("sku_id", line.sku_id); setLine("sku_name", line.sku_name); setLine("quantity", line.quantity); setLine("unit", line.unit);
    setLine("bottle_equivalent", line.bottle_equivalent); setLine("created_at", now); setLine("app_version", APP_VERSION);
    return row;
  });
  if (newRows.length) lineSheet.getRange(lineSheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  return deliveryId;
}

function apiUpdateCustomerApplication_(p) {
  if (!p) throw new Error("Missing application update.");
  requireFields_(p, ["application_id", "workflow_status", "staff_name"]);
  const statuses = ["New", "Reviewing", "Needs information", "Approved", "Account active", "Declined"];
  const status = String(p.workflow_status || "");
  if (!statuses.includes(status)) throw new Error("Choose a listed application status.");
  const staffName = publicText_(p.staff_name, 120, "Staff name");
  const applicationId = publicText_(p.application_id, 80, "Application ID");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another customer update is in progress. Try again in a moment.");
  try {
    const sheet = getCustomerApplicationsSheet_(false);
    if (!sheet) throw new Error("Customer Applications sheet is missing.");
    ensureHeaderColumns_(sheet, ["Customer ID", "Assigned To", "Staff Notes", "Review Updated At", "Review Updated By", ACCOUNT_ID_HEADER, "Account Link Status", "Inventory Tracking", "Inventory Store ID", "Inventory Route", "Data Sync Status"]);
    const rowNumber = findRecordRow_(sheet, "application_id", applicationId);
    if (!rowNumber) throw new Error("Application not found.");
    const h = getHeaderMap_(sheet);
    const row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    const previousStatus = String(row[h.workflow_status] || "New");
    const business = String(row[h.business_name] || row[h.legal_business_name] || "");
    const customerId = publicText_(p.customer_id, 80, "Customer ID");
    if (status === "Account active" && !customerId) throw new Error("Customer ID is required before activating an account.");
    const set = (key, value) => { if (h[key] !== undefined) sheet.getRange(rowNumber, h[key] + 1).setValue(value); };
    set("workflow_status", status);
    set("customer_id", customerId);
    set("assigned_to", publicText_(p.assigned_to, 120, "Assigned to"));
    set("staff_notes", publicText_(p.staff_notes, 4000, "Staff notes"));
    set("inventory_tracking", toBool_(p.inventory_tracking));
    set("inventory_store_id", publicText_(p.inventory_store_id, 80, "Inventory store ID"));
    set("inventory_route", publicText_(p.inventory_route, 120, "Inventory route"));
    set("review_updated_at", new Date());
    set("review_updated_by", staffName);
    let accountId = publicText_(p.account_id || (h.account_id !== undefined ? row[h.account_id] : ""), 80, "Account ID");
    let sync = null;
    if (status === "Account active") {
      const record = customerApplicationRecord_(Object.assign({ source_row:rowNumber }, Object.keys(h).reduce((item, key) => {
        item[key] = row[h[key]];
        return item;
      }, {})));
      sync = synchronizeApplicationAccount_(record, Object.assign({}, p, { customer_id:customerId, account_id:accountId }), staffName);
      accountId = sync.account_id;
      set("account_id", accountId);
      set("account_link_status", sync.account_link_status);
      set("inventory_store_id", sync.inventory_store_id || "");
      set("data_sync_status", sync.data_sync_status);
    } else if (accountId) {
      const identity = accountIdentityLookup_();
      if (!identity.by_id.has(accountId)) throw new Error("The selected Account ID does not exist in the directory.");
      set("account_id", accountId);
      set("account_link_status", "Linked by staff");
      set("data_sync_status", "Application linked; account not yet activated");
    }
    appendCustomerWorkflowLog_("Application", applicationId, accountId, business, previousStatus, status, staffName, `Customer ID: ${customerId}; inventory tracking: ${toBool_(p.inventory_tracking) ? "yes" : "no"}`);
    appendAudit_("UPDATE_APPLICATION", "Application", applicationId, accountId, staffName, CUSTOMER_APPLICATIONS_SHEET_NAME, CUSTOMER_APPLICATIONS_SHEET_NAME, "Completed", `${previousStatus} to ${status}`);
    return { message:"Application updated.", application_id:applicationId, account_id:accountId, workflow_status:status, synchronization:sync };
  } finally {
    lock.releaseLock();
  }
}

function apiUpdateOnlineOrderRequest_(p) {
  if (!p) throw new Error("Missing order update.");
  requireFields_(p, ["request_id", "workflow_status", "staff_name"]);
  const statuses = ["New", "Reviewing", "Confirmed", "Invoicing", "Ready for delivery", "Completed", "Cancelled"];
  const invoiceStatuses = ["Not started", "Ready for Badger", "Invoice requested", "Invoice received", "Invoice delivered", "Paid", "Cancelled"];
  const deliveryStatuses = ["Not scheduled", "Scheduled", "Delivered", "Issue"];
  const status = String(p.workflow_status || "");
  const invoiceStatus = String(p.invoice_status || "Not started");
  const deliveryStatus = String(p.delivery_status || "Not scheduled");
  if (!statuses.includes(status)) throw new Error("Choose a listed order status.");
  if (!invoiceStatuses.includes(invoiceStatus)) throw new Error("Choose a listed invoice status.");
  if (!deliveryStatuses.includes(deliveryStatus)) throw new Error("Choose a listed delivery status.");
  const staffName = publicText_(p.staff_name, 120, "Staff name");
  const requestId = publicText_(p.request_id, 80, "Request ID");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another order update is in progress. Try again in a moment.");
  try {
    const sheet = getOnlineOrderRequestsSheet_(false);
    if (!sheet) throw new Error("Online Order Requests sheet is missing.");
    ensureHeaderColumns_(sheet, ["Badger Invoice Number", "Invoice Status", "Delivery Status", "Assigned To", "Staff Notes", "Review Updated At", "Review Updated By", ACCOUNT_ID_HEADER, "Account Link Status", "Integration Status", "Delivered At"]);
    const rowNumber = findRecordRow_(sheet, "request_id", requestId);
    if (!rowNumber) throw new Error("Order request not found.");
    const h = getHeaderMap_(sheet);
    const row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    const previousStatus = String(row[h.workflow_status] || "New");
    const business = String(row[h.business_name] || "");
    let accountId = publicText_(p.account_id || (h.account_id !== undefined ? row[h.account_id] : ""), 80, "Account ID");
    if (accountId) {
      const identity = accountIdentityLookup_();
      if (!identity.by_id.has(accountId)) throw new Error("The selected Account ID does not exist in the directory.");
    }
    const set = (key, value) => { if (h[key] !== undefined) sheet.getRange(rowNumber, h[key] + 1).setValue(value); };
    set("workflow_status", status);
    set("badger_invoice_number", publicText_(p.badger_invoice_number, 80, "Badger invoice number"));
    set("invoice_status", invoiceStatus);
    set("delivery_status", deliveryStatus);
    set("assigned_to", publicText_(p.assigned_to, 120, "Assigned to"));
    set("staff_notes", publicText_(p.staff_notes, 4000, "Staff notes"));
    const requestedDeliveryDate = String(p.requested_delivery_date || "").trim();
    if (requestedDeliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDeliveryDate)) throw new Error("Enter a valid requested delivery date.");
    set("requested_delivery_date", requestedDeliveryDate ? new Date(`${requestedDeliveryDate}T12:00:00`) : "");
    set("review_updated_at", new Date());
    set("review_updated_by", staffName);
    if (accountId) { set("account_id", accountId); set("account_link_status", "Linked by staff"); }
    const badger = reconcileBadgerForOrder_(sheet, rowNumber, h, p.badger_invoice_number);
    const freshRow = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    const fresh = Object.keys(h).reduce((item, key) => { item[key] = freshRow[h[key]]; return item; }, { source_row:rowNumber });
    const order = onlineOrderRecord_(fresh, new Map());
    order.account_id = accountId || order.account_id;
    const orderLines = rowsWithSource_(getOnlineOrderLinesSheet_(false)).filter(line => String(line.request_id || "") === requestId);
    let deliveryId = "";
    if (deliveryStatus !== "Not scheduled") deliveryId = upsertDeliveryForOrder_(order, orderLines, staffName);
    if (deliveryStatus === "Delivered") set("delivered_at", order.delivered_at || new Date());
    set("integration_status", badger.matched ? "Synchronized" : (String(p.badger_invoice_number || "").trim() ? "Badger invoice not found" : (accountId ? "Account linked" : "Needs account match")));
    appendCustomerWorkflowLog_("Order", requestId, accountId, business, previousStatus, status, staffName, `Invoice: ${String(p.badger_invoice_number || "")}; ${invoiceStatus}; Delivery: ${deliveryStatus}`);
    appendAudit_("UPDATE_ORDER", "Order", requestId, accountId, staffName, ONLINE_ORDER_REQUESTS_SHEET_NAME, deliveryId ? DELIVERIES_SHEET_NAME : ONLINE_ORDER_REQUESTS_SHEET_NAME, "Completed", `${previousStatus} to ${status}; Badger ${badger.status}; delivery ${deliveryStatus}`);
    return { message:"Order updated.", request_id:requestId, account_id:accountId, workflow_status:status, badger_match_status:badger.status, delivery_id:deliveryId };
  } finally {
    lock.releaseLock();
  }
}

function onlineOrderVerification_(businessName, customerId, email, claimedAccountId, lockHeld) {
  const directoryMatch = resolvePublicAccount_(claimedAccountId, businessName, email, "", !!lockHeld);
  const matchedAccountId = directoryMatch.record ? directoryMatch.record.account_id : "";
  const sheet = getOutreachProgramSheet_(false);
  const normalizedBusiness = String(businessName || "").trim().toLowerCase();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedId = String(customerId || "").trim().toLowerCase();
  const programMatch = sheet && sheet.getLastRow() >= 2 && getAllRowsAsObjects_(sheet).find(row => {
    if (String(row.ordering_status || "").trim() !== "Active") return false;
    const accountMatch = matchedAccountId && String(row.account_id || "") === matchedAccountId;
    const idMatch = normalizedId && String(row.ordering_customer_id || "").trim().toLowerCase() === normalizedId;
    const emailMatch = normalizedEmail && String(row.email || "").trim().toLowerCase() === normalizedEmail;
    const businessMatch = normalizedBusiness && String(row.business_name || "").trim().toLowerCase() === normalizedBusiness;
    return accountMatch || idMatch || (emailMatch && businessMatch);
  });
  if (programMatch) return { status:"Active account matched", account_id:String(programMatch.account_id || matchedAccountId), account_link_status:"Linked to active account" };

  const applicationSheet = getCustomerApplicationsSheet_(false);
  const applicationMatch = rowsWithSource_(applicationSheet).find(row => {
    if (String(row.workflow_status || "").trim() !== "Account active") return false;
    const idMatch = normalizedId && String(row.customer_id || "").trim().toLowerCase() === normalizedId;
    const applicationEmail = String(row.ordering_email || row.primary_email || "").trim().toLowerCase();
    const applicationBusiness = String(row.business_name || row.legal_business_name || "").trim().toLowerCase();
    return idMatch || (normalizedEmail && applicationEmail === normalizedEmail && normalizedBusiness && applicationBusiness === normalizedBusiness);
  });
  if (applicationMatch) return { status:"Active account matched", account_id:String(applicationMatch.account_id || matchedAccountId), account_link_status:"Linked to active application" };
  return { status:"Needs review", account_id:matchedAccountId, account_link_status:directoryMatch.status };
}

function sendOnlineOrderNotification_(request, lines, sheet, rowNumber) {
  const reviewUrl = `https://docs.google.com/spreadsheets/d/${OUTREACH_SPREADSHEET_ID}/edit#gid=${sheet.getSheetId()}&range=A${rowNumber}`;
  const subject = `New order request: ${request.business_name}`;
  const productLines = lines.map(line => `${line.quantity} ${line.unit.toLowerCase()} - ${line.sku_name}`);
  const plainText = [
    "A new customer order request is ready for review.",
    "",
    `Request ID: ${request.request_id}`,
    `Business: ${request.business_name}`,
    `Contact: ${request.contact_name}`,
    `Email: ${request.email}`,
    `Phone: ${request.phone || "Not provided"}`,
    `Requested delivery date: ${request.requested_delivery_date || "Not specified"}`,
    `Verification: ${request.verification_status}`,
    "",
    "Products:",
  ].concat(productLines, ["", `Review the order: ${reviewUrl}`]);
  const htmlProducts = lines.map(line =>
    `<li>${escapeOutreachHtml_(line.quantity)} ${escapeOutreachHtml_(line.unit.toLowerCase())} - ${escapeOutreachHtml_(line.sku_name)}</li>`
  ).join("");
  const html = [
    "<p>A new customer order request is ready for review.</p>",
    "<ul>",
    `<li><strong>Request ID:</strong> ${escapeOutreachHtml_(request.request_id)}</li>`,
    `<li><strong>Business:</strong> ${escapeOutreachHtml_(request.business_name)}</li>`,
    `<li><strong>Contact:</strong> ${escapeOutreachHtml_(request.contact_name)}</li>`,
    `<li><strong>Email:</strong> ${escapeOutreachHtml_(request.email)}</li>`,
    `<li><strong>Phone:</strong> ${escapeOutreachHtml_(request.phone || "Not provided")}</li>`,
    `<li><strong>Requested delivery date:</strong> ${escapeOutreachHtml_(request.requested_delivery_date || "Not specified")}</li>`,
    `<li><strong>Verification:</strong> ${escapeOutreachHtml_(request.verification_status)}</li>`,
    "</ul>",
    `<p><strong>Products</strong></p><ul>${htmlProducts}</ul>`,
    `<p><a href="${escapeOutreachHtml_(reviewUrl)}">Review this order in the staging sheet</a></p>`,
  ].join("");

  try {
    MailApp.sendEmail({
      to: CUSTOMER_APPLICATION_NOTIFICATION_EMAIL,
      replyTo: request.email,
      name: "Sturgeon Distribution Hub",
      subject: subject,
      body: plainText.join("\n"),
      htmlBody: html,
    });
    return { status:"Sent", sent_at:new Date(), error:"" };
  } catch (error) {
    return { status:"Send error", sent_at:"", error:String(error).slice(0, 500) };
  }
}

function apiSubmitOnlineOrderRequest_(p) {
  if (!p) throw new Error("Missing order data.");
  if (String(p.form_trap || "").trim()) return { message:"Order request received.", request_id:"RECEIVED" };
  requireFields_(p, ["business_name", "contact_name", "email", "submission_token"]);
  if (!Array.isArray(p.lines) || !p.lines.length) throw new Error("Choose at least one product.");
  if (p.lines.length > 50) throw new Error("An order request can contain up to 50 products.");

  const businessName = publicText_(p.business_name, 160, "Business name");
  const claimedAccountId = publicText_(p.account_id, 80, "Account ID");
  const customerId = publicText_(p.customer_id, 60, "Customer ID");
  const contactName = publicText_(p.contact_name, 120, "Contact name");
  const email = publicEmail_(p.email, "Ordering email", true);
  const phone = publicText_(p.phone, 40, "Phone");
  const poNumber = publicText_(p.po_number, 80, "PO number");
  const deliveryDate = publicText_(p.requested_delivery_date, 10, "Requested delivery date");
  const deliveryWindow = publicText_(p.delivery_window, 160, "Delivery window");
  const deliveryInstructions = publicText_(p.delivery_instructions, 1000, "Delivery instructions");
  const notes = publicText_(p.notes, 2000, "Order notes");
  const submissionToken = publicText_(p.submission_token, 120, "Submission token");

  const skuMap = new Map(apiListSkus_().skus.map(sku => [String(sku.sku_id), sku]));
  const lines = p.lines.map((line, index) => {
    const skuId = publicText_(line.sku_id, 120, `Product ${index + 1}`);
    const sku = skuMap.get(skuId);
    if (!sku) throw new Error(`Product ${index + 1} is not available.`);
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error(`Product ${index + 1} needs a whole-number quantity from 1 to 999.`);
    const unit = String(line.unit || "");
    if (!["Cases", "Bottles"].includes(unit)) throw new Error(`Product ${index + 1} has an unsupported unit.`);
    const unitsPerCase = Number(sku.units_per_case || 12);
    return {
      sku_id:skuId,
      sku_name:String(sku.sku_name || skuId),
      quantity:quantity,
      unit:unit,
      units_per_case:unitsPerCase,
      bottle_equivalent:unit === "Cases" ? quantity * unitsPerCase : quantity,
      catalog_source:String(sku.catalog_source || ORDER_CATALOG_SOURCE),
      external_item_id:String(sku.external_item_id || ""),
    };
  });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another order request is being recorded. Try again in a moment.");
  let journal = null;
  try {
    const requestSheet = getOnlineOrderRequestsSheet_(true);
    ensureHeaderColumns_(requestSheet, ["Notification Status", "Notification Sent At", "Notification Error"]);
    const priorId = existingSubmissionByToken_(requestSheet, submissionToken, "Request ID");
    if (priorId) return { message:"Order request already received.", request_id:priorId };
    const verification = onlineOrderVerification_(businessName, customerId, email, claimedAccountId, true);
    journal = startSubmissionJournal_("Online order", submissionToken, verification.account_id, businessName, p);
    if (journal.prior_record_id) return { message:"Order request already received.", request_id:journal.prior_record_id };
    const lineSheet = getOnlineOrderLinesSheet_(true);
    const h = getHeaderMap_(requestSheet);
    const lineHeaders = getHeaderMap_(lineSheet);
    const requestId = publicSubmissionId_("ORD");
    const now = new Date();
    const totalCases = lines.filter(line => line.unit === "Cases").reduce((sum, line) => sum + line.quantity, 0);
    const totalBottles = lines.filter(line => line.unit === "Bottles").reduce((sum, line) => sum + line.quantity, 0);
    const bottleEquivalent = lines.reduce((sum, line) => sum + line.bottle_equivalent, 0);
    const row = Array(requestSheet.getLastColumn()).fill("");
    const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
    set("request_id", requestId);
    set("submitted_at", now);
    set("workflow_status", "New");
    set("verification_status", verification.status);
    set("account_id", verification.account_id);
    set("account_link_status", verification.account_link_status);
    set("catalog_source", ORDER_CATALOG_SOURCE);
    set("integration_status", verification.account_id ? "Account linked; awaiting staff review" : "Needs account match");
    set("badger_match_status", "Not checked");
    set("business_name", businessName);
    set("customer_id", customerId);
    set("contact_name", contactName);
    set("email", email);
    set("phone", phone);
    set("po_number", poNumber);
    set("requested_delivery_date", deliveryDate ? new Date(`${deliveryDate}T12:00:00`) : "");
    set("delivery_window", deliveryWindow);
    set("delivery_instructions", deliveryInstructions);
    set("notes", notes);
    set("line_count", lines.length);
    set("requested_cases", totalCases);
    set("requested_bottles", totalBottles);
    set("bottle_equivalent", bottleEquivalent);
    set("submission_token", submissionToken);
    set("app_version", APP_VERSION);
    requestSheet.appendRow(row);
    const requestRow = requestSheet.getLastRow();

    const lineRows = lines.map((line, index) => {
      const values = Array(lineSheet.getLastColumn()).fill("");
      const setLine = (key, value) => { if (lineHeaders[key] !== undefined) values[lineHeaders[key]] = value; };
      setLine("request_id", requestId);
      setLine("account_id", verification.account_id);
      setLine("line_number", index + 1);
      setLine("sku_id", line.sku_id);
      setLine("sku_name", line.sku_name);
      setLine("quantity", line.quantity);
      setLine("unit", line.unit);
      setLine("units_per_case", line.units_per_case);
      setLine("bottle_equivalent", line.bottle_equivalent);
      setLine("catalog_source", line.catalog_source);
      setLine("external_item_id", line.external_item_id);
      setLine("app_version", APP_VERSION);
      return values;
    });
    lineSheet.getRange(lineSheet.getLastRow() + 1, 1, lineRows.length, lineRows[0].length).setValues(lineRows);
    const notificationJob = enqueueIntegrationJob_("ORDER_NOTIFICATION", "Order", requestId, verification.account_id, {
      request_id:requestId, business:businessName, email:email,
    });
    const notification = sendOnlineOrderNotification_({
      request_id:requestId,
      business_name:businessName,
      contact_name:contactName,
      email:email,
      phone:phone,
      requested_delivery_date:deliveryDate,
      verification_status:verification.status,
    }, lines, requestSheet, requestRow);
    requestSheet.getRange(requestRow, h.notification_status + 1, 1, 3).setValues([[
      notification.status,
      notification.sent_at,
      notification.error,
    ]]);
    updateIntegrationJob_(notificationJob, notification.status === "Sent" ? "Completed" : "Retry", notification.error);
    completeSubmissionJournal_(journal, "Completed", requestId, "");
    appendAudit_("SUBMIT_ORDER", "Order", requestId, verification.account_id, "Public order form", "Online order", ONLINE_ORDER_REQUESTS_SHEET_NAME, "Completed", verification.account_link_status);
    return { message:"Order request received for confirmation.", request_id:requestId, account_id:verification.account_id, verification_status:verification.status };
  } catch (error) {
    if (journal) completeSubmissionJournal_(journal, "Needs recovery", "", error.message || error);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function apiReconcileIntegrations_(p) {
  if (!p) throw new Error("Missing reconciliation request.");
  requireFields_(p, ["staff_name"]);
  const staffName = publicText_(p.staff_name, 120, "Staff name");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another reconciliation or write is in progress.");
  try {
    const orderSheet = getOnlineOrderRequestsSheet_(false);
    if (!orderSheet || orderSheet.getLastRow() < 2) return { message:"No orders need reconciliation.", checked:0, badger_matches:0, deliveries:0, attention:0 };
    ensureHeaderColumns_(orderSheet, ["Badger Invoice Number", "Invoice Status", "Delivery Status", "Integration Status", "Badger Match Status", "Delivered At"]);
    const h = getHeaderMap_(orderSheet);
    const lineRows = rowsWithSource_(getOnlineOrderLinesSheet_(false));
    const linesByRequest = new Map();
    lineRows.forEach(line => {
      const requestId = String(line.request_id || "");
      if (!linesByRequest.has(requestId)) linesByRequest.set(requestId, []);
      linesByRequest.get(requestId).push(line);
    });
    const rows = rowsWithSource_(orderSheet);
    let badgerMatches = 0;
    let deliveries = 0;
    let attention = 0;
    rows.forEach(raw => {
      const order = onlineOrderRecord_(raw, linesByRequest);
      if (!order.request_id) return;
      const invoice = reconcileBadgerForOrder_(orderSheet, raw.source_row, h, order.badger_invoice_number, true);
      if (invoice.matched) badgerMatches += 1;
      if (order.delivery_status !== "Not scheduled") {
        upsertDeliveryForOrder_(order, order.lines, staffName);
        deliveries += 1;
      }
      const status = invoice.matched
        ? "Synchronized"
        : (order.badger_invoice_number ? "Badger invoice not found" : (order.account_id ? "Account linked" : "Needs account match"));
      orderSheet.getRange(raw.source_row, h.integration_status + 1).setValue(status);
      if (["Badger invoice not found", "Needs account match"].includes(status)) attention += 1;
    });
    appendAudit_("RECONCILE_INTEGRATIONS", "System", "orders", "", staffName, `${ONLINE_ORDER_REQUESTS_SHEET_NAME}; ${BADGER_TRACKER_SPREADSHEET_ID}`, `${DELIVERIES_SHEET_NAME}; ${ONLINE_ORDER_REQUESTS_SHEET_NAME}`, "Completed", `${rows.length} orders checked; ${badgerMatches} Badger matches; ${deliveries} delivery records; ${attention} need attention.`);
    return { message:"Integration reconciliation completed.", checked:rows.length, badger_matches:badgerMatches, deliveries:deliveries, attention:attention };
  } finally {
    lock.releaseLock();
  }
}
