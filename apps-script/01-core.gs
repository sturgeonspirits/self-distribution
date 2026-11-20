/*********************************
 * Inventory API (JSON) for Netlify. Part 1 of 12: core.
 * App version: 2026.11.20.103-APP
 *
 * CHANGES IN THIS VERSION
 * DOR fetch speed (Claude, 2026-11-20): the first previewDirectoryQualityCheck() hit Apps Script's 6-minute limit. DOR's
 * pages are now fetched in parallel batches of 20 after each pull's first page (61 sequential fetches before), and
 * the run logs how long the sources and the preview took.
 *
 * PARTS (load in this order; filePushOrder in .clasp.json): 01-core (config, cache, sheets, setup, relay, request router),
 * 02-inventory, 03-outreach-directory, 04-campaigns, 05-sequences, 06-replies, 07-sending, 08-applications,
 * 09-badger-and-pricing, 10-accounts, 11-orders, 12-task-manager.
 *
 * DEPLOY
 * - Apps Script project: Inventory API
 * - Attached to (container): Distribution Hub - Inventory Backend  (checked in Apps Script > Overview, 2026-10-17)
 * - Run ~/self-distribution-app/apps-script/deploy.sh (clasp push of every file in apps-script/, then the live deployment
 *   moves to the new version; same URL).
 *
 * Earlier version notes: docs/history/inventory-api-changes.md (move this version's notes there when the version changes).
 *********************************/

const APP_VERSION = "2026.11.20.103-APP";

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
const BADGER_TRACKER_SPREADSHEET_ID = "1nmHzrZLB2Kv-bLf3z0GBXbkO0XqUL-ETCxUlOlidSEk"; // live Badger tracker; P/Q remain staff-maintained workflow marks
const BADGER_BASE_URL = "https://badgerstatecoop.com/BSWCSite";
const BADGER_SESSION_CACHE_KEY = "hub_badger_session_v1";
const BADGER_SESSION_TTL_SECONDS = 20 * 60;
const PAYMENT_REMINDERS_ENABLED_CONFIG_KEY = "payment_reminders_enabled";
const BADGER_STATUS_SHEET_NAME = "Badger Invoice Status";
const BADGER_SYNC_LOG_SHEET_NAME = "Badger Sync Log";
const BADGER_SYNC_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const BADGER_PAYMENT_LOG_SHEET_NAME = "Badger Invoice Payment Log";
const PRICE_TIERS_SHEET_NAME = "Price Tiers"; // inventory workbook: Tier, Price
const CUSTOMER_PRICES_SHEET_NAME = "Customer Prices"; // inventory workbook: SKU ID, Account ID, Price, Active, Notes
const BADGER_INVOICE_CREATIONS_SHEET_NAME = "Badger Invoice Creations";
const OUTREACH_SHEET_NAME = "Distribution Directory and Leads";
const OUTREACH_ACTIVITY_SHEET_NAME = "Activity Log";
const OUTREACH_DRAFTS_SHEET_NAME = "Outreach Drafts";
const OUTREACH_PILOT_SHEET_NAME = "Pilot Review";
const OUTREACH_PROGRAMS_SHEET_NAME = "Account Programs";
const OUTREACH_ENGAGEMENT_SHEET_NAME = "Email Engagement";
const OUTREACH_CAMPAIGNS_SHEET_NAME = "Outreach Campaigns";
const OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME = "Outreach Campaign Recipients";
const ZIP_CENTROIDS_SHEET_NAME = "ZIP Centroids";
const TOAST_ITEM_MAP_SHEET_NAME = "Toast Item Map";
const NEWSLETTER_CONTACTS_SHEET_NAME = "Newsletter Contacts";
const CUSTOMER_APPLICATIONS_SHEET_NAME = "Customer Applications";
const CUSTOMER_APPLICATION_NOTIFICATION_EMAIL = "sales@sturgeonspirits.com";
const ONLINE_ORDER_REQUESTS_SHEET_NAME = "Online Order Requests";
const ONLINE_ORDER_LINES_SHEET_NAME = "Online Order Lines";
const CUSTOMER_WORKFLOW_LOG_SHEET_NAME = "Customer Workflow Log";
const BADGER_INVOICE_LINKS_SHEET_NAME = "Badger Invoice Links";
const BADGER_CUSTOMER_ALIASES_SHEET_NAME = "Badger Customer Aliases";
const BADGER_CUSTOMER_ALIAS_HEADERS = ["Badger Customer Name", "Normalized Key", "Account ID", "Source", "Linked At", "Linked By", "App Version"];
const BADGER_CUSTOMERS_SHEET_NAME = "Badger Customers";
const LICENSE_LEADS_SHEET_NAME = "License Leads";
const BADGER_PAYMENT_REMINDERS_SHEET_NAME = "Badger Payment Reminders";
const BADGER_PAYMENT_REMINDER_MIN_DAYS = 7;
const BADGER_PAYMENT_REMINDER_MIN_AGE_CONFIG_KEY = "payment_reminder_min_age_days";
const BADGER_PAYMENT_REMINDER_DEFAULT_MIN_AGE_DAYS = 30;
const BADGER_PAYMENT_REMINDER_PENDING_MS = 60 * 60 * 1000;
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
const OUTREACH_COCKTAIL_LIST_STAGE = "Cocktail list";
const OUTREACH_COCKTAIL_LIST_GAP_DAYS = 14;
const PUBLIC_SITE_URL_SETTING_KEY = "Public site URL";
const PUBLIC_SITE_URL_FALLBACK = "https://distribution-hub.netlify.app";
const READ_CACHE_VERSION_KEY = "hub_read_cache_version";
const READ_CACHE_CHUNK_SIZE = 45000;
// Speed fixes (Karl, 2026-11-19, .84). Each screen's cache belongs to one group, and a change clears only the groups it
// affects (it used to clear all three screens). A copy is "fresh" while its group is unchanged and it is under 15 minutes
// old; an older copy is still served at once, marked stale, while a rebuild runs. Copies are kept for 6 hours.
const READ_CACHE_GROUPS = { outreach_slim:"outreach", customer_work_queue:"customers", customer_account_index:"customers", inventory_stores:"inventory" };
const READ_CACHE_ALL_GROUPS = ["outreach", "customers", "inventory"];
const READ_CACHE_FRESH_SECONDS = 900;
const READ_CACHE_KEEP_SECONDS = 21600; // CacheService maximum
const READ_CACHE_REBUILD_GUARD_SECONDS = 90;
const READ_CACHE_WARM_MAX_AGE_SECONDS = 3600; // the 10-minute warmer also rebuilds an unchanged copy past an hour old
const READ_ACTIONS = new Set(["initData", "listSkus", "sellSheet", "managerGrid", "salesSinceCount", "outreachDashboard", "outreachRecord", "outreachSendStatus", "outreachNewsletterContacts", "outreachCampaigns", "outreachCampaign", "outreachSequences", "previewOutreachCampaign", "customerWorkQueue", "customerAccountIndex", "hubSystemStatus", "salesReport", "inboundReplies"]);

// Which screens each saving action can change (.84). Anything not listed clears all three.
const READ_CACHE_ACTION_GROUPS = (() => {
  const map = {};
  const add = (groups, actions) => actions.forEach(action => { map[action] = groups; });
  add([], ["badgerReconcilePreview", "previewBadgerPaymentReminder", "previewBadgerInvoice", "previewApplicationWelcome", "sendOutreachTestEmail", "syncBadgerStatus"]);
  add(["inventory", "customers"], ["addSkuToStore", "upsertProduct", "submitCounts", "createReorder", "updateStoreContacts"]);
  add(["outreach"], ["recordEmailEngagement", "createOutreachCampaign", "updateOutreachCampaignRecipient", "setOutreachCampaignRecipientExclusion",
    "setOutreachCampaignRecipientExclusions", "approveOutreachCampaign", "reopenOutreachCampaign", "deleteOutreachCampaign", "renameOutreachCampaign",
    "updateOutreachSequence", "buildOutreachSequenceStep", "reconcileCampaignSends", "rebuildCampaignRecipients", "sendOutreachCampaignBatch",
    "scheduleOutreachCampaign", "cancelOutreachCampaignSchedule", "saveOutreachDraft", "sendOutreachEmail", "updateOutreachOutcome", "logOutreachContact",
    "backfillEngagementDetails", "recalculateOutreachMiles", "upsertNewsletterContact", "resolveInboundReply", "checkInboundReplies"]);
  // Directory edits and account activation show in both Outreach and Orders & Accounts; Outreach also marks recently
  // invoiced businesses, so invoice links count for both.
  add(["outreach", "customers"], ["updateOutreachBusiness", "updateOutreachPrograms", "createOutreachBusiness", "importOutreachBusinesses",
    "submitCustomerApplication", "submitPaperCustomerApplication", "updateCustomerApplication", "sendApplicationWelcome", "linkBadgerInvoice",
    "applyBadgerReconcile", "createBadgerInvoice", "adoptBadgerInvoice"]);
  add(["customers"], ["submitOnlineOrderRequest", "markBadgerInvoicePayment", "recordBadgerCheck", "resolvePaymentReminder", "sendBadgerPaymentReminder",
    "failBadgerInvoiceCreation", "updateOnlineOrderRequest", "updateOnlineOrderLines"]);
  return map;
})();

let __OPERATIONAL_SS = null;
let __OUTREACH_SS = null;
let __HUB_INVENTORY_ACTIVE = null;
let __OUTREACH_CAMPAIGN_SETTINGS = null;
let __OUTREACH_RECENT_BADGER_INVOICE_ACCOUNT_IDS = null;
let __OUTREACH_RECENT_BADGER_INVOICE_LOOKUP_FAILED = false;
let __OUTREACH_RECENT_BADGER_MATCHES = null; // { strong:Set, name_only:Map(account -> Badger name), unplaced_invoices:number }
let __ZIP_CENTROID_MAP = null;
let __LEGACY_PILOT_SENT_BY_EMAIL = null;
let __OUTREACH_RECENT_SEND_INDEX = null;
let __OUTREACH_COCKTAIL_LIST_CONTACT_INDEX = null;

function readCacheGroupKey_(group) {
  return `${READ_CACHE_VERSION_KEY}:${group}`;
}

/** Version of the group a cache scope belongs to; it changes whenever something that scope shows changes. */
function readCacheVersion_(scope) {
  const group = READ_CACHE_GROUPS[scope];
  return PropertiesService.getScriptProperties().getProperty(group ? readCacheGroupKey_(group) : READ_CACHE_VERSION_KEY) || "1";
}

/**
 * Marks the given screen groups changed ("outreach", "customers", "inventory"; none given = all). Each group is its own
 * property set to a new unique value, so two changes at once can't undo each other.
 */
function bumpReadCacheVersion_(groups) {
  const list = (Array.isArray(groups) ? groups : READ_CACHE_ALL_GROUPS).filter(group => READ_CACHE_ALL_GROUPS.includes(group));
  if (!list.length) return "";
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const values = {};
  list.forEach(group => { values[readCacheGroupKey_(group)] = stamp; });
  PropertiesService.getScriptProperties().setProperties(values);
  return stamp;
}

function readCacheMeta_(cache, scope) {
  try { return JSON.parse(cache.get(`hub_read:${scope}:meta`) || "null"); } catch (error) { return null; }
}

function readCacheIsFresh_(meta, version, maxAgeSeconds) {
  return !!meta && meta.version === version && Date.now() - Number(meta.built_at || 0) < (maxAgeSeconds || READ_CACHE_FRESH_SECONDS) * 1000;
}

/** The saved copy a meta entry points to, read in one call; null if any part has gone. */
function readCachePayload_(cache, scope, meta) {
  if (!meta || !meta.build || !Number.isInteger(meta.parts) || meta.parts < 1 || meta.parts > 20) return null;
  const keys = Array.from({ length:meta.parts }, (_, index) => `hub_read:${scope}:${meta.build}:${index}`);
  const found = cache.getAll(keys);
  if (keys.some(key => typeof found[key] !== "string")) return null;
  return JSON.parse(keys.map(key => found[key]).join(""));
}

function readCachePresent_(scope) {
  try { return !!readCacheMeta_(CacheService.getScriptCache(), scope); } catch (error) { return false; }
}

/**
 * Screen cache. bypass = rebuild now (refresh button). mode "rebuild" = the page's follow-up to a stale copy: rebuild
 * unless another rebuild of this scope is already running, in which case the stale copy comes back marked rebuilding.
 * A normal read returns a fresh copy, else a stale copy (cache_stale:true), else builds.
 */
function cachedReadPayload_(scope, build, bypass, mode) {
  const startedAt = Date.now();
  const version = readCacheVersion_(scope);
  const cache = CacheService.getScriptCache();
  const guardKey = `hub_read:${scope}:rebuilding`;
  if (!bypass) {
    try {
      const meta = readCacheMeta_(cache, scope);
      const fresh = readCacheIsFresh_(meta, version);
      const rebuilding = !fresh && !!cache.get(guardKey);
      if (fresh || mode !== "rebuild" || rebuilding) {
        const payload = readCachePayload_(cache, scope, meta);
        if (payload) {
          payload.cache_stale = !fresh;
          payload.cache_rebuilding = rebuilding;
          payload.cache_built_at = new Date(Number(meta.built_at || 0)).toISOString();
          payload.performance = Object.assign({}, payload.performance || {}, { total_ms:Date.now() - startedAt, cache_hit:true, cache_stale:!fresh, stages:{ cache_read_ms:Date.now() - startedAt } });
          return payload;
        }
      }
    } catch (error) { console.warn("Read cache miss: " + String(error && error.message || error)); }
  }
  try { cache.put(guardKey, String(Date.now()), READ_CACHE_REBUILD_GUARD_SECONDS); } catch (error) {}
  try {
    const payload = build();
    const totalMs = Date.now() - startedAt;
    payload.performance = Object.assign({}, payload.performance || {}, { total_ms:totalMs, cache_hit:false, stages:Object.assign({}, payload.performance?.stages || {}, { cache_build_ms:totalMs }) });
    try {
      const text = JSON.stringify(payload);
      const parts = Math.ceil(text.length / READ_CACHE_CHUNK_SIZE);
      if (scope === "customer_account_index") {
        console.log(JSON.stringify({ event:"customer_account_index_cache_rebuild", payload_chars:text.length, parts:parts, max_parts:20 }));
        if (parts > 20) console.warn(`Customer account index is ${parts} cache parts; it exceeds the 20-part cache limit.`);
      }
      if (parts > 0 && parts <= 20) {
        // Parts go under a new build ID first, then the meta entry points at them, so a reader never mixes two builds.
        const buildId = Utilities.getUuid().slice(0, 8);
        const values = {};
        for (let index = 0; index < parts; index += 1) values[`hub_read:${scope}:${buildId}:${index}`] = text.slice(index * READ_CACHE_CHUNK_SIZE, (index + 1) * READ_CACHE_CHUNK_SIZE);
        const previous = readCacheMeta_(cache, scope);
        cache.putAll(values, READ_CACHE_KEEP_SECONDS);
        cache.put(`hub_read:${scope}:meta`, JSON.stringify({ version:version, build:buildId, parts:parts, built_at:startedAt }), READ_CACHE_KEEP_SECONDS);
        // Drop the replaced copy so kept copies don't pile up (Outreach can rebuild every few minutes while sending).
        if (previous?.build && previous.build !== buildId && Number.isInteger(previous.parts) && previous.parts > 0 && previous.parts <= 20) {
          cache.removeAll(Array.from({ length:previous.parts }, (_, index) => `hub_read:${scope}:${previous.build}:${index}`));
        }
      }
    } catch (error) { console.warn("Read cache write skipped: " + String(error && error.message || error)); }
    payload.cache_stale = false;
    payload.cache_rebuilding = false;
    payload.cache_built_at = new Date(startedAt).toISOString();
    return payload;
  } finally {
    try { cache.remove(guardKey); } catch (error) {}
  }
}

const READ_CACHE_BUILDERS = {
  outreach_slim:() => apiGetOutreachDashboard_({ slim:"1", _cache_bypass:true }),
  customer_work_queue:() => apiGetCustomerWorkQueue_({ _cache_bypass:true }),
  inventory_stores:() => apiGetInitData_("", true),
};

/** Rebuilds the screen caches of the given groups now (used by background jobs right after they change something). */
function rebuildReadCaches_(groups) {
  Object.keys(READ_CACHE_BUILDERS).filter(scope => groups.includes(READ_CACHE_GROUPS[scope])).forEach(scope => {
    try { cachedReadPayload_(scope, READ_CACHE_BUILDERS[scope], true); }
    catch (error) { console.warn(`Rebuilding ${scope} failed: ${String(error && error.message || error)}`); }
  });
}

function warmHubReadCaches() {
  const hour = Number(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "H"));
  if (hour < 7 || hour >= 21) return { message:"Skipped outside 7am–9pm." };
  // Rebuild at most ONE cache per run: the one that changed (or is missing) and has gone longest without a rebuild.
  // Rebuilding all three at once took 30+ seconds and slowed staff requests running at the same moment.
  const cache = CacheService.getScriptCache();
  const due = Object.keys(READ_CACHE_BUILDERS)
    .map(scope => ({ scope:scope, meta:readCacheMeta_(cache, scope) }))
    .filter(item => !readCacheIsFresh_(item.meta, readCacheVersion_(item.scope), READ_CACHE_WARM_MAX_AGE_SECONDS))
    .sort((a, b) => Number(a.meta?.built_at || 0) - Number(b.meta?.built_at || 0));
  if (!due.length) return { message:"Hub read caches already current." };
  if (cache.get(`hub_read:${due[0].scope}:rebuilding`)) return { message:`Hub read cache ${due[0].scope} is already rebuilding.` };
  cachedReadPayload_(due[0].scope, READ_CACHE_BUILDERS[due[0].scope], true);
  return { message:`Hub read cache warmed: ${due[0].scope}.` };
}

function onHubReadCacheSpreadsheetChange(e) {
  const version = bumpReadCacheVersion_();
  clearBadgerInvoiceCache_();
  console.log(JSON.stringify({ event:"hub_read_cache_invalidated", change_type:String(e?.changeType || "unknown"), version:version }));
}

function installHubReadCacheWarmer() {
  const warmerHandler = "warmHubReadCaches";
  const changeHandler = "onHubReadCacheSpreadsheetChange";
  ScriptApp.getProjectTriggers()
    .filter(trigger => [warmerHandler, changeHandler].includes(trigger.getHandlerFunction()))
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(warmerHandler).timeBased().everyMinutes(10).create();
  // getSs_() is the inventory workbook (SKUs, Price Tiers, Customer Prices): the legacy Inventory Backend before the hub
  // migration, the Outreach workbook after it. Re-run this installer after switching migration state.
  const workbooks = new Map();
  [getOutreachSs_(), SpreadsheetApp.openById(BADGER_TRACKER_SPREADSHEET_ID), getSs_()].forEach(spreadsheet => workbooks.set(spreadsheet.getId(), spreadsheet));
  workbooks.forEach(spreadsheet => {
    ScriptApp.newTrigger(changeHandler).forSpreadsheet(spreadsheet).onChange().create();
  });
  return { message:"Ten-minute Hub read-cache warmer and change triggers installed for the Outreach, Badger Tracker and inventory workbooks." };
}

function installBadgerStatusSyncTrigger() {
  const handler = "scheduledBadgerStatusSync";
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === handler)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(handler).timeBased().inTimezone("America/Chicago").atHour(6).nearMinute(10).everyDays(1).create();
  return { message:"Daily Badger status sync trigger installed for approximately 6:10am Central." };
}

function scheduledBadgerStatusSync() {
  return syncBadgerStatus_("Scheduled Badger status sync");
}

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

function paymentRemindersEnabled_() {
  return /^(1|true|yes|on)$/i.test(getHubConfigurationValue_(PAYMENT_REMINDERS_ENABLED_CONFIG_KEY));
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
  // Fast path: when the cached header map already has every column, nothing can be duplicated, so no extra read.
  // This runs on sends, outcome saves and count saves, where every Sheets read adds to the time-out risk.
  const cached = getHeaderMap_(sheet);
  if (columns.every(col => cached[normalizeHeader_(col)] !== undefined)) return cached;
  // Something looks missing. The cache may be stale (another helper can append a column first), so read the live
  // header row before appending; this prevents a second copy of a column such as Schedule Detail or Message Stage.
  const actual = sheet.getLastColumn()
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(normalizeHeader_)
    : [];
  const present = new Set(actual.filter(Boolean));
  const missing = columns.filter(col => !present.has(normalizeHeader_(col)));
  missing.forEach(col => {
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue(col);
  });
  __HEADER_CACHE.delete(headerCacheKey_(sheet));
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
  ensureSheet_(hub, BADGER_INVOICE_LINKS_SHEET_NAME, [
    "Badger Invoice Number", "Account ID", "Badger Customer Name", "Match Method", "Linked At", "Linked By", "Notes", "App Version"
  ]);
  ensureSheet_(hub, BADGER_CUSTOMER_ALIASES_SHEET_NAME, BADGER_CUSTOMER_ALIAS_HEADERS);
  ensureSheet_(hub, BADGER_PAYMENT_REMINDERS_SHEET_NAME, [
    "Reminder ID", "Account ID", "Business Name", "Recipient", "Invoice Numbers", "Outstanding Amount", "Status",
    "Sent At", "Sent By", "Zoho Message ID", "Idempotency Token", "Error", "App Version"
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

// Sales report tabs are built with formulas in the Badger tracker (Sales by Location, Sales by Product,
// Location x Product, fed by Sales Data). The Hub only reads their displayed values; all calculation stays
// in the sheet so this script does not grow with the analysis.
const SALES_REPORT_TABS = [
  { key:"locations", sheet:"Sales by Location", header_row:9 },
  { key:"products", sheet:"Sales by Product", header_row:4 },
  { key:"grid", sheet:"Location x Product", header_row:1 },
];

function salesReportTable_(spreadsheet, tab) {
  const sheet = spreadsheet.getSheetByName(tab.sheet);
  if (!sheet) return { sheet:tab.sheet, missing:true, headers:[], rows:[] };
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < tab.header_row || !lastColumn) return { sheet:tab.sheet, headers:[], rows:[] };
  const values = sheet.getRange(tab.header_row, 1, lastRow - tab.header_row + 1, lastColumn).getDisplayValues();
  let width = values[0].length;
  while (width > 0 && !String(values[0][width - 1] || "").trim()) width -= 1;
  return {
    sheet:tab.sheet,
    headers:values[0].slice(0, width),
    rows:values.slice(1).filter(row => String(row[0] || "").trim()).map(row => row.slice(0, width)),
  };
}

function apiGetSalesReport_() {
  const spreadsheet = SpreadsheetApp.openById(BADGER_TRACKER_SPREADSHEET_ID);
  const report = {};
  SALES_REPORT_TABS.forEach(tab => { report[tab.key] = salesReportTable_(spreadsheet, tab); });
  const settingsSheet = spreadsheet.getSheetByName("Sales by Location");
  const recentDays = settingsSheet ? String(settingsSheet.getRange("B5").getDisplayValue() || "") : "";
  return {
    sales_report:report,
    recent_days:recentDays,
    sheet_url:`https://docs.google.com/spreadsheets/d/${BADGER_TRACKER_SPREADSHEET_ID}/edit`,
    loaded_at:new Date().toISOString(),
  };
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

function setOutreachDirectoryValidation_(sheet, headerKey, values) {
  const headers = getHeaderMap_(sheet);
  if (headers[headerKey] === undefined) return false;
  const rows = Math.max(1, sheet.getMaxRows() - 1);
  const validation = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, headers[headerKey] + 1, rows, 1).setDataValidation(validation);
  return true;
}

function repairOutreachDirectoryValidations_(directory) {
  return {
    next_email:setOutreachDirectoryValidation_(directory, "next_email", OUTREACH_DIRECTORY_STAGE_VALUES),
    status:setOutreachDirectoryValidation_(directory, "status", OUTREACH_DIRECTORY_STATUS_VALUES),
    outcome:setOutreachDirectoryValidation_(directory, "outcome", OUTREACH_OUTCOME_VALUES),
  };
}

const OUTREACH_MONTHLY_CONTENT_SECTION = "MONTHLY CONTENT";
const OUTREACH_MONTHLY_CONTENT_ROWS = [
  { label:"Month label", note:"Example: October 2026" },
  { label:"Featured cocktail", note:"Cocktail name and one recipe sentence." },
  { label:"Second cocktail", note:"Cocktail name and one recipe sentence." },
  { label:"Tasting offer sentence", note:"Optional; leave blank to omit." },
  { label:"Cocktail-list sentence", note:"Optional invitation to receive cocktail ideas." },
];
const OUTREACH_MONTHLY_CONTENT_SETTINGS = [
  { key:"Monthly content month", label:"Month label" },
  { key:"Monthly content featured cocktail", label:"Featured cocktail" },
  { key:"Monthly content second cocktail", label:"Second cocktail" },
  { key:"Monthly content tasting offer", label:"Tasting offer sentence" },
  { key:"Monthly content cocktail-list offer", label:"Cocktail-list sentence" },
];
const OUTREACH_COCKTAIL_LIST_EDITOR_ROWS = [
  { label:"COCKTAIL LIST EMAIL", note:"Monthly newsletter template; no sales offer or application link." },
  { label:"Cocktail list subject", note:"Example: {{Month}} cocktail ideas from Sturgeon Spirits" },
  { label:"Cocktail list intro", note:"A short non-sales introduction." },
  { label:"Cocktail list featured cocktail", note:"Use {{Featured Cocktail}}." },
  { label:"Cocktail list distillery line", note:"One line about the Oshkosh distillery." },
  { label:"Cocktail list reply-to-order line", note:"Invite a reply to order; do not link to an application." },
];
const OUTREACH_COCKTAIL_LIST_SETTINGS = [
  { key:"Cocktail list subject", label:"Cocktail list subject" },
  { key:"Cocktail list intro", label:"Cocktail list intro" },
  { key:"Cocktail list featured cocktail", label:"Cocktail list featured cocktail" },
  { key:"Cocktail list distillery line", label:"Cocktail list distillery line" },
  { key:"Cocktail list reply-to-order line", label:"Cocktail list reply-to-order line" },
];
// Order-online invite for current customers (2026.10.08.36-APP). The account-form link and the
// address/unsubscribe footer are added by the code, so the template cannot leave them out.
const OUTREACH_CUSTOMER_INVITE_STAGE = "Order online invite";
const OUTREACH_CUSTOMER_INVITE_EDITOR_ROWS = [
  { label:"CUSTOMER ORDER INVITE EMAIL", value:"", note:"Sends current customers their own ordering link. No form: the link is already set up for their account. The link and the address / unsubscribe footer are added automatically." },
  { label:"Customer invite subject", value:"Online ordering is open for {{Business Name}}", note:"Merge fields: {{First Name}}, {{Business Name}}, {{City}}." },
  { label:"Customer invite greeting", value:"Hi {{First Name}},", note:"First line of the email." },
  { label:"Customer invite intro", value:"Thank you for carrying Sturgeon Spirits. You can now place your wholesale orders with us online.", note:"Why you are writing." },
  { label:"Customer invite steps", value:"There's nothing to fill out. The link below is already set up for {{Business Name}}: pick products and quantities, by the bottle or by the case, and we'll confirm the delivery day. Bookmark it for reorders.", note:"What they do next. Their ordering link follows this line." },
  { label:"Customer invite link text", value:"Open your ordering page", note:"The words of the link to the customer's own ordering page." },
  { label:"Customer invite sign-off", value:"Questions? Just reply to this email. Thank you, Sturgeon Spirits", note:"Last line before the footer." },
];
const OUTREACH_CUSTOMER_INVITE_SETTINGS = OUTREACH_CUSTOMER_INVITE_EDITOR_ROWS.slice(1).map(item => ({ key:item.label, label:item.label }));
const OUTREACH_PUBLIC_SITE_SETTINGS = [
  { key:PUBLIC_SITE_URL_SETTING_KEY },
];
const SELL_SHEET_SECTION_VALUES = ["Best seller", "New", "Vodka", "Gin", "Rum", "Liqueur", "Agave", "Whiskey & Brandy", "Squadron Spirits", "Gift boxes", "Bitters", "Canned cocktails", "Hide"];
const SELL_SHEET_EDITOR_SECTION = "SELL SHEET";
const SELL_SHEET_EDITOR_ROWS = [
  { label:"Sell sheet headline", value:"Oshkosh's First Distillery Since 1919", note:"Main headline on the web and printed sell sheet." },
  { label:"Sell sheet price line", value:"Where patience pays", note:"Shown under the headline; live prices appear only to invited visitors or staff." },
  { label:"Sell sheet story heading", value:"Rooted in Tradition, Driven by Curiosity", note:"Story-section heading." },
  { label:"Sell sheet story", value:"For three years, we've been getting up early, working hard, and trusting the process right here in Oshkosh. We respect the old ways, but we never stop experimenting with new flavor profiles. Put our local craft spirits into your arsenal.", note:"Karl can update the timing or copy here." },
  { label:"Sell sheet unique heading", value:"As Unique As We Are", note:"Flavor-list heading." },
  { label:"Sell sheet flavors line", value:"Choose from over 40 additional flavors and spirits available.", note:"Flavor-list introduction." },
  { label:"Sell sheet infusion line", value:"Imagine a custom infusion only available at your establishment.", note:"Flavor-list introduction." },
  { label:"Sell sheet cans line", value:"Mix flavors within a case. Ask about 5-gallon corny kegs of our cocktails.", note:"Shown only when canned-cocktail SKUs exist." },
  { label:"Sell sheet contact", value:"2663 Oregon Street, Oshkosh, Wisconsin · sturgeonspirits.com · sales@sturgeonspirits.com · (920) 267-5192", note:"Contact block." },
  { label:"Sell sheet footer", value:"Distilled and bottled in Oshkosh, Wisconsin", note:"Printed and web footer." },
];

function ensureOutreachMonthlyContent_() {
  const hub = getOutreachSs_();
  const editor = hub.getSheetByName("Email Editor");
  const settings = hub.getSheetByName("Campaign Settings");
  if (!editor || !settings) throw new Error("Email Editor and Campaign Settings are required for monthly outreach content.");

  const editorValues = editor.getRange(1, 1, Math.max(1, editor.getLastRow()), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  let sectionRow = editorValues.findIndex(value => value === OUTREACH_MONTHLY_CONTENT_SECTION) + 1;
  const rowsByLabel = new Map();
  if (!sectionRow) {
    sectionRow = editor.getLastRow() + 1;
    const values = [[OUTREACH_MONTHLY_CONTENT_SECTION, "", "Shared monthly content for outreach templates."]]
      .concat(OUTREACH_MONTHLY_CONTENT_ROWS.map(item => [item.label, "", item.note]));
    editor.getRange(sectionRow, 1, values.length, values[0].length).setValues(values);
    editor.getRange(sectionRow, 1, 1, values[0].length).setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff");
    OUTREACH_MONTHLY_CONTENT_ROWS.forEach((item, index) => rowsByLabel.set(item.label, sectionRow + index + 1));
  } else {
    OUTREACH_MONTHLY_CONTENT_ROWS.forEach(item => {
      const row = editorValues.findIndex((value, index) => index + 1 > sectionRow && value === item.label) + 1;
      if (row) rowsByLabel.set(item.label, row);
    });
    const missing = OUTREACH_MONTHLY_CONTENT_ROWS.filter(item => !rowsByLabel.has(item.label));
    if (missing.length) {
      const start = editor.getLastRow() + 1;
      const values = missing.map(item => [item.label, "", item.note]);
      editor.getRange(start, 1, values.length, values[0].length).setValues(values);
      missing.forEach((item, index) => rowsByLabel.set(item.label, start + index));
    }
  }

  const settingKeys = settings.getRange(2, 1, Math.max(1, settings.getLastRow() - 1), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  const missingSettings = OUTREACH_MONTHLY_CONTENT_SETTINGS.filter(item => !settingKeys.includes(item.key));
  if (missingSettings.length) {
    const values = missingSettings.map(item => [item.key, `='Email Editor'!B${rowsByLabel.get(item.label)}`]);
    settings.getRange(settings.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
  }
  const refreshedEditorValues = editor.getRange(1, 1, Math.max(1, editor.getLastRow()), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  const cocktailRowsByLabel = new Map();
  OUTREACH_COCKTAIL_LIST_EDITOR_ROWS.forEach(item => {
    const row = refreshedEditorValues.indexOf(item.label) + 1;
    if (row) cocktailRowsByLabel.set(item.label, row);
  });
  const missingCocktailRows = OUTREACH_COCKTAIL_LIST_EDITOR_ROWS.filter(item => !cocktailRowsByLabel.has(item.label));
  if (missingCocktailRows.length) {
    const start = editor.getLastRow() + 1;
    const values = missingCocktailRows.map(item => [item.label, "", item.note]);
    editor.getRange(start, 1, values.length, values[0].length).setValues(values);
    editor.getRange(start, 1, 1, values[0].length).setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff");
    missingCocktailRows.forEach((item, index) => cocktailRowsByLabel.set(item.label, start + index));
  }
  const allSettingKeys = settings.getRange(2, 1, Math.max(1, settings.getLastRow() - 1), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  const missingCocktailSettings = OUTREACH_COCKTAIL_LIST_SETTINGS.filter(item => !allSettingKeys.includes(item.key));
  if (missingCocktailSettings.length) {
    const values = missingCocktailSettings.map(item => [item.key, `='Email Editor'!B${cocktailRowsByLabel.get(item.label)}`]);
    settings.getRange(settings.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
  }
  const invite = ensureEditorBlockWithSettings_(editor, settings, OUTREACH_CUSTOMER_INVITE_EDITOR_ROWS, OUTREACH_CUSTOMER_INVITE_SETTINGS);
  const refreshedSettingKeys = settings.getRange(2, 1, Math.max(1, settings.getLastRow() - 1), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  const missingPublicSiteSettings = OUTREACH_PUBLIC_SITE_SETTINGS.filter(item => !refreshedSettingKeys.includes(item.key));
  if (missingPublicSiteSettings.length) {
    settings.getRange(settings.getLastRow() + 1, 1, missingPublicSiteSettings.length, 2)
      .setValues(missingPublicSiteSettings.map(item => [item.key, ""]));
  }
  return {
    section_row:sectionRow,
    editor_rows:Object.fromEntries(rowsByLabel),
    added_settings:missingSettings.map(item => item.key),
    cocktail_list_editor_rows:Object.fromEntries(cocktailRowsByLabel),
    cocktail_list_added_settings:missingCocktailSettings.map(item => item.key),
    public_site_added_settings:missingPublicSiteSettings.map(item => item.key),
    customer_invite_editor_rows:invite.editor_rows,
    customer_invite_added_settings:invite.added_settings,
  };
}

/**
 * Appends any missing rows of an Email Editor block (label, starting value, note) and links
 * each missing Campaign Settings key to its editor cell. Never moves or overwrites existing
 * cells, so an edited template is kept.
 */
function ensureEditorBlockWithSettings_(editor, settings, rows, settingItems) {
  const labels = editor.getRange(1, 1, Math.max(1, editor.getLastRow()), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  const rowsByLabel = new Map();
  rows.forEach(item => {
    const row = labels.indexOf(item.label) + 1;
    if (row) rowsByLabel.set(item.label, row);
  });
  const missing = rows.filter(item => !rowsByLabel.has(item.label));
  if (missing.length) {
    const start = editor.getLastRow() + 1;
    const values = missing.map(item => [item.label, item.value || "", item.note || ""]);
    editor.getRange(start, 1, values.length, values[0].length).setValues(values);
    if (missing[0] === rows[0]) editor.getRange(start, 1, 1, values[0].length).setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff");
    missing.forEach((item, index) => rowsByLabel.set(item.label, start + index));
  }
  const keys = settings.getRange(2, 1, Math.max(1, settings.getLastRow() - 1), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  const missingSettings = settingItems.filter(item => !keys.includes(item.key));
  if (missingSettings.length) {
    settings.getRange(settings.getLastRow() + 1, 1, missingSettings.length, 2)
      .setValues(missingSettings.map(item => [item.key, `='Email Editor'!B${rowsByLabel.get(item.label)}`]));
  }
  return { editor_rows:Object.fromEntries(rowsByLabel), added_settings:missingSettings.map(item => item.key) };
}

function ensureSellSheetStructure_() {
  const skuSheet = getSheet_(SHEET_NAMES.SKUS);
  const skuHeaders = ensureHeaderColumns_(skuSheet, ["sell_sheet_section"]);
  const validation = SpreadsheetApp.newDataValidation().requireValueInList(SELL_SHEET_SECTION_VALUES, true).setAllowInvalid(false).build();
  skuSheet.getRange(2, skuHeaders.sell_sheet_section + 1, Math.max(1, skuSheet.getMaxRows() - 1), 1).setDataValidation(validation);
  const editor = getOutreachSs_().getSheetByName("Email Editor");
  if (!editor) throw new Error("Email Editor is required for sell-sheet content.");
  const labels = editor.getRange(1, 1, Math.max(1, editor.getLastRow()), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  let sectionRow = labels.indexOf(SELL_SHEET_EDITOR_SECTION) + 1;
  if (!sectionRow) {
    sectionRow = editor.getLastRow() + 1;
    editor.getRange(sectionRow, 1, 1, 3).setValues([[SELL_SHEET_EDITOR_SECTION, "", "Editable content for sell-sheet.html."]]);
    editor.getRange(sectionRow, 1, 1, 3).setFontWeight("bold").setBackground("#44656b").setFontColor("#ffffff");
  }
  const refreshed = editor.getRange(1, 1, Math.max(1, editor.getLastRow()), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  const missing = SELL_SHEET_EDITOR_ROWS.filter(item => !refreshed.includes(item.label));
  if (missing.length) editor.getRange(editor.getLastRow() + 1, 1, missing.length, 3).setValues(missing.map(item => [item.label, item.value, item.note]));
  return { section_row:sectionRow, sku_column:"sell_sheet_section", added_editor_rows:missing.map(item => item.label) };
}

function sellSheetCopy_() {
  const values = new Map(SELL_SHEET_EDITOR_ROWS.map(item => [item.label, item.value]));
  const editor = getOutreachSs_().getSheetByName("Email Editor");
  if (editor && editor.getLastRow()) editor.getRange(1, 1, editor.getLastRow(), Math.max(2, editor.getLastColumn())).getDisplayValues().forEach(row => {
    const label = String(row[0] || "").trim();
    if (values.has(label) && String(row[1] || "").trim()) values.set(label, String(row[1]).trim());
  });
  return { headline:values.get("Sell sheet headline"), price_line:values.get("Sell sheet price line"), story_heading:values.get("Sell sheet story heading"), story:values.get("Sell sheet story"), unique_heading:values.get("Sell sheet unique heading"), flavors_line:values.get("Sell sheet flavors line"), infusion_line:values.get("Sell sheet infusion line"), cans_line:values.get("Sell sheet cans line"), contact:values.get("Sell sheet contact"), footer:values.get("Sell sheet footer") };
}

function repairHubStructure_() {
  ensureFoundationalSheets_();
  const engagement = getOutreachSs_().getSheetByName(OUTREACH_ENGAGEMENT_SHEET_NAME);
  if (engagement) ensureHeaderColumns_(engagement, ["Account ID", "Target", "Stage"]);
  getInboundRepliesSheet_(true);
  const identity = ensureAccountIdentityModel_(true);
  const directory = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const headers = getHeaderMap_(directory);
  const directoryValidations = repairOutreachDirectoryValidations_(directory);
  if (headers.priority !== undefined && directory.getLastRow() > 1) {
    const priorityRange = directory.getRange(2, headers.priority + 1, directory.getLastRow() - 1, 1);
    const priorityValues = priorityRange.getValues();
    let changed = false;
    priorityValues.forEach(row => {
      if (String(row[0] || "").trim().toLowerCase() === "medium") {
        row[0] = "Normal";
        changed = true;
      }
    });
    if (changed) priorityRange.setValues(priorityValues);
  }
  identity.directory_validations = directoryValidations;
  identity.monthly_content = ensureOutreachMonthlyContent_();
  identity.sell_sheet = ensureSellSheetStructure_();
  identity.service_area = ensureOutreachServiceAreaSetting_();
  identity.sequences = ensureSequenceStructure_();
  return identity;
}

function apiRepairHubStructure_(p) {
  if (!p) throw new Error("Missing repair request.");
  requireFields_(p, ["staff_name"]);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another migration or write is in progress.");
  try {
    const identity = repairHubStructure_();
    const failures = (identity.backfill_results || []).filter(item => !item.ok);
    return {
      message:failures.length
        ? `Hub structure repaired, but Account ID backfill failed on: ${failures.map(item => `${item.sheet} (${item.error})`).join("; ")}.`
        : "Hub structure repaired.",
      repaired_at:new Date().toISOString(),
      accounts:identity.rows.length,
      backfill_results:identity.backfill_results || [],
      directory_validations:identity.directory_validations || {},
    };
  } finally {
    lock.releaseLock();
  }
}

function repairHubStructureNightly() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another migration or write is in progress.");
  try {
    const identity = repairHubStructure_();
    console.log(JSON.stringify({ event:"hub_structure_repair", accounts:identity.rows.length, backfill_results:identity.backfill_results || [] }));
  } finally {
    bumpReadCacheVersion_();
    lock.releaseLock();
  }
}

function repairHubStructure() {
  try {
    const result = apiRepairHubStructure_({ staff_name:"Karl (editor)", authenticated_staff_role:"admin" });
    Logger.log(JSON.stringify(result));
    return result;
  } finally {
    bumpReadCacheVersion_();
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

function compressedText_(payload) {
  const text = JSON.stringify(payload);
  if (text.length < 50000) return text;
  const packed = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(text, "application/json")).getBytes());
  return JSON.stringify({ ok:true, version:APP_VERSION, gzip_b64:packed });
}

// ---------------------------------------------------------------------------
// Drive response relay. Google's web-app response handoff to Netlify stalls or
// returns 404 even when this script finishes in seconds. When the staff proxy
// sends relay_id, the response text is ALSO written to one of a fixed set of
// Drive "slot" files, which the proxy reads directly with a service account.
// The proxy uses whichever copy arrives first. Nothing is executed twice.
// Run setupDriveRelay() once; see PROJECT_STATUS.md for the Netlify settings.
// ---------------------------------------------------------------------------
const RELAY_SLOT_COUNT = 32;
const RELAY_SLOT_IDS_PROPERTY = "RELAY_SLOT_IDS";
let __RELAY_SLOT_IDS = null;

// Must match relaySlotIndex() in netlify/lib/drive-relay.js exactly.
function relaySlotIndex_(relayId) {
  let hash = 0;
  const text = String(relayId || "");
  for (let index = 0; index < text.length; index += 1) hash = (Math.imul(hash, 31) + text.charCodeAt(index)) >>> 0;
  return hash % RELAY_SLOT_COUNT;
}

function relaySlotIds_() {
  if (__RELAY_SLOT_IDS) return __RELAY_SLOT_IDS;
  try { __RELAY_SLOT_IDS = JSON.parse(PropertiesService.getScriptProperties().getProperty(RELAY_SLOT_IDS_PROPERTY) || "[]"); }
  catch (_) { __RELAY_SLOT_IDS = []; }
  return __RELAY_SLOT_IDS;
}

function relayedOutput_(e, text) {
  const relayId = String(e?.parameter?.relay_id || "");
  if (/^[A-Za-z0-9-]{20,80}$/.test(relayId)) {
    const ids = relaySlotIds_();
    if (ids.length === RELAY_SLOT_COUNT) {
      try {
        DriveApp.getFileById(ids[relaySlotIndex_(relayId)]).setContent(JSON.stringify({ relay_id:relayId, written_at:new Date().toISOString(), body:text }));
      } catch (error) {
        console.warn("Drive relay write failed: " + String(error && error.message || error));
      }
    }
  }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor. Creates the relay folder, 32 slot files and a manifest. */
function setupDriveRelay() {
  const props = PropertiesService.getScriptProperties();
  let ids = [];
  try { ids = JSON.parse(props.getProperty(RELAY_SLOT_IDS_PROPERTY) || "[]"); } catch (_) {}
  let folder;
  if (ids.length === RELAY_SLOT_COUNT) {
    folder = DriveApp.getFileById(ids[0]).getParents().next();
  } else {
    folder = DriveApp.createFolder("Distribution Hub Relay (do not edit)");
    ids = [];
    for (let index = 0; index < RELAY_SLOT_COUNT; index += 1) {
      ids.push(folder.createFile(`relay-slot-${String(index).padStart(2, "0")}.json`, "{}", "application/json").getId());
    }
    props.setProperty(RELAY_SLOT_IDS_PROPERTY, JSON.stringify(ids));
  }
  const manifestName = "relay-manifest.json";
  const existing = folder.getFilesByName(manifestName);
  const manifest = existing.hasNext() ? existing.next() : folder.createFile(manifestName, "{}", "application/json");
  manifest.setContent(JSON.stringify({ slots:ids }));
  __RELAY_SLOT_IDS = ids;
  const result = {
    folder_url:folder.getUrl(),
    RELAY_MANIFEST_FILE_ID:manifest.getId(),
    next_steps:"Share this folder (Viewer) with the service account email, then set GOOGLE_SA_CLIENT_EMAIL, GOOGLE_SA_PRIVATE_KEY and RELAY_MANIFEST_FILE_ID in Netlify.",
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
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
  if (missing.length) throw publicError_(`Missing required field(s): ${missing.join(", ")}`);
}
// Actions the public customer proxy may call. Their callers see only messages written for them
// (thrown with publicError_); anything else is logged and replaced with a fixed message.
const PUBLIC_ACTIONS = new Set(["listSkus", "submitCustomerApplication", "submitOnlineOrderRequest"]);
const PUBLIC_ERROR_MESSAGE = "The request could not be processed.";
function publicError_(message) {
  const error = new Error(message);
  error.public_message = true;
  return error;
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
  return handle_(e, null, true);
}
function doPost(e) {
  const body = readJsonBody_(e);
  return handle_(e, body);
}
function handle_(e, body, isGet) {
  const action = (e?.parameter?.action) || (body?.action) || "";
  let invalidateReadCache = false;
  try {
    assertAuthorized_(e, body);
    if (!action) {
      return json_({ ok:true, service:"sturgeon-distribution-hub", version:APP_VERSION, actions:["initData","listSkus","sellSheet","addSkuToStore","upsertProduct","submitCounts","createReorder","managerGrid","salesSinceCount","updateStoreContacts","outreachDashboard","outreachRecord","outreachSendStatus","outreachNewsletterContacts","outreachCampaigns","outreachCampaign","outreachSequences","previewOutreachCampaign","createOutreachCampaign","updateOutreachCampaignRecipient","setOutreachCampaignRecipientExclusion","setOutreachCampaignRecipientExclusions","approveOutreachCampaign","reopenOutreachCampaign","deleteOutreachCampaign","renameOutreachCampaign","updateOutreachSequence","buildOutreachSequenceStep","reconcileCampaignSends","rebuildCampaignRecipients","sendOutreachCampaignBatch","scheduleOutreachCampaign","cancelOutreachCampaignSchedule","saveOutreachDraft","sendOutreachEmail","sendOutreachTestEmail","updateOutreachOutcome","logOutreachContact","updateOutreachBusiness","updateOutreachPrograms","createOutreachBusiness","importOutreachBusinesses","recalculateOutreachMiles","backfillEngagementDetails","upsertNewsletterContact","submitCustomerApplication","submitPaperCustomerApplication","submitOnlineOrderRequest","customerWorkQueue","customerAccountIndex","linkBadgerInvoice","syncBadgerStatus","markBadgerInvoicePayment","recordBadgerCheck","resolvePaymentReminder","badgerReconcilePreview","applyBadgerReconcile","previewBadgerPaymentReminder","sendBadgerPaymentReminder","previewBadgerInvoice","createBadgerInvoice","adoptBadgerInvoice","failBadgerInvoiceCreation","updateCustomerApplication","previewApplicationWelcome","sendApplicationWelcome","updateOnlineOrderRequest","updateOnlineOrderLines","hubSystemStatus","salesReport","inboundReplies","resolveInboundReply","checkInboundReplies","initializeHardenedHub","repairHubStructure","reconcileIntegrations"] });
    }

    // A link or image tag can trigger a GET, so only read actions are accepted that way.
    if (isGet && !READ_ACTIONS.has(action)) throw new Error("This action must be sent as POST.");
    invalidateReadCache = !READ_ACTIONS.has(action);
    // Read follow-ups ask for a rebuild of a stale copy (.84).
    const readMode = String((e?.parameter?.rebuild) || (body?.rebuild) || "") === "1" ? "rebuild" : "";
    let res;
    switch (action) {
      case "initData": res = apiGetInitData_((e?.parameter?.store_id) || (body?.store_id) || "", false, String((e?.parameter?.refresh) || (body?.refresh) || "") === "1", readMode); break;
      case "listSkus": res = apiListSkus_(); break;
      case "sellSheet": res = apiSellSheet_(body || {}); break;
      case "addSkuToStore": res = apiAddSkuToStore_(body); break;
      case "upsertProduct": res = apiUpsertProduct_(body); break;
      case "submitCounts": res = apiSubmitCounts_(body); break;
      case "createReorder": res = apiCreateReorder_(body); break;
      case "managerGrid": res = apiGetManagerGrid_(); break;
      case "salesSinceCount": res = apiGetSalesSinceCount_((e?.parameter?.store_id) || (body?.store_id) || ""); break;
      case "updateStoreContacts": res = apiUpdateStoreContacts_(body); break;
      case "outreachDashboard": res = apiGetOutreachDashboard_(Object.assign({}, e?.parameter || {}, body || {})); break;
      case "outreachRecord": res = apiGetOutreachRecord_(body); break;
      case "recordEmailEngagement": res = apiRecordEmailEngagement_(body); break;
      case "outreachSendStatus": res = apiGetOutreachSendStatus_(); break;
      case "outreachNewsletterContacts": res = { newsletter_contacts:newsletterContacts_() }; break;
      case "outreachCampaigns": res = apiGetOutreachCampaigns_(); break;
      case "outreachSequences": res = apiGetOutreachSequences_(Object.assign({}, e?.parameter || {}, body || {})); break;
      case "outreachCampaign": res = apiGetOutreachCampaign_(body); break;
      case "previewOutreachCampaign": res = apiPreviewOutreachCampaign_(body); break;
      case "createOutreachCampaign": res = apiCreateOutreachCampaign_(body); break;
      case "updateOutreachCampaignRecipient": res = apiUpdateOutreachCampaignRecipient_(body); break;
      case "setOutreachCampaignRecipientExclusion": res = apiSetOutreachCampaignRecipientExclusion_(body); break;
      case "setOutreachCampaignRecipientExclusions": res = apiSetOutreachCampaignRecipientExclusions_(body); break;
      case "approveOutreachCampaign": res = apiApproveOutreachCampaign_(body); break;
      case "reopenOutreachCampaign": res = apiReopenOutreachCampaign_(body); break;
      case "deleteOutreachCampaign": res = apiDeleteOutreachCampaign_(body); break;
      case "renameOutreachCampaign": res = apiRenameOutreachCampaign_(body); break;
      case "updateOutreachSequence": res = apiUpdateOutreachSequence_(body); break;
      case "buildOutreachSequenceStep": res = apiBuildOutreachSequenceStep_(body); break;
      case "reconcileCampaignSends": res = apiReconcileCampaignSends_(body); break;
      case "rebuildCampaignRecipients": res = apiRebuildCampaignRecipients_(body); break;
      case "sendOutreachCampaignBatch": res = apiSendOutreachCampaignBatch_(body); break;
      case "scheduleOutreachCampaign": res = apiScheduleOutreachCampaign_(body); break;
      case "cancelOutreachCampaignSchedule": res = apiCancelOutreachCampaignSchedule_(body); break;
      case "saveOutreachDraft": res = apiSaveOutreachDraft_(body); break;
      case "sendOutreachEmail": res = apiSendOutreachEmail_(body, false); break;
      case "sendOutreachTestEmail": res = apiSendOutreachEmail_(body, true); break;
      case "updateOutreachOutcome": res = apiUpdateOutreachOutcome_(body); break;
      case "logOutreachContact": res = apiLogOutreachContact_(body); break;
      case "updateOutreachBusiness": res = apiUpdateOutreachBusiness_(body); break;
      case "updateOutreachPrograms": res = apiUpdateOutreachPrograms_(body); break;
      case "createOutreachBusiness": res = apiCreateOutreachBusiness_(body); break;
      case "importOutreachBusinesses": res = apiImportOutreachBusinesses_(body); break;
      case "backfillEngagementDetails": res = apiBackfillEngagementDetails_(body); break;
      case "recalculateOutreachMiles": res = apiRecalculateOutreachMiles_(body); break;
      case "upsertNewsletterContact": res = apiUpsertNewsletterContact_(body); break;
      case "submitCustomerApplication": res = apiSubmitCustomerApplication_(body); break;
      case "submitPaperCustomerApplication": res = apiSubmitPaperCustomerApplication_(body); break;
      case "submitOnlineOrderRequest": res = apiSubmitOnlineOrderRequest_(body); break;
      case "customerWorkQueue": res = apiGetCustomerWorkQueue_(Object.assign({}, e?.parameter || {}, body || {})); break;
      case "customerAccountIndex": res = apiGetCustomerAccountIndex_(Object.assign({}, e?.parameter || {}, body || {})); break;
      case "linkBadgerInvoice": res = apiLinkBadgerInvoice_(body); break;
      case "syncBadgerStatus": res = apiSyncBadgerStatus_(body); break;
      case "markBadgerInvoicePayment": res = apiMarkBadgerInvoicePayment_(body); break;
      case "recordBadgerCheck": res = apiRecordBadgerCheck_(body); break;
      case "resolvePaymentReminder": res = apiResolvePaymentReminder_(body); break;
      case "badgerReconcilePreview": res = apiBadgerReconcilePreview_(); break;
      case "applyBadgerReconcile": res = apiApplyBadgerReconcile_(body); break;
      case "previewBadgerPaymentReminder": res = apiPreviewBadgerPaymentReminder_(body); break;
      case "sendBadgerPaymentReminder": res = apiSendBadgerPaymentReminder_(body); break;
      case "previewBadgerInvoice": res = apiPreviewBadgerInvoice_(body); break;
      case "createBadgerInvoice": res = apiCreateBadgerInvoice_(body); break;
      case "adoptBadgerInvoice": res = apiAdoptBadgerInvoice_(body); break;
      case "failBadgerInvoiceCreation": res = apiFailBadgerInvoiceCreation_(body); break;
      case "updateCustomerApplication": res = apiUpdateCustomerApplication_(body); break;
      case "previewApplicationWelcome": res = apiPreviewApplicationWelcome_(body); break;
      case "sendApplicationWelcome": res = apiSendApplicationWelcome_(body); break;
      case "updateOnlineOrderRequest": res = apiUpdateOnlineOrderRequest_(body); break;
      case "updateOnlineOrderLines": res = apiUpdateOnlineOrderLines_(body); break;
      case "hubSystemStatus": res = apiGetHubSystemStatus_(); break;
      case "salesReport": res = apiGetSalesReport_(); break;
      case "inboundReplies": res = apiGetInboundReplies_(); break;
      case "resolveInboundReply": res = apiResolveInboundReply_(body); break;
      case "checkInboundReplies": res = apiCheckInboundReplies_(); break;
      case "initializeHardenedHub": res = apiInitializeHardenedHub_(body); break;
      case "repairHubStructure": res = apiRepairHubStructure_(body); break;
      case "reconcileIntegrations": res = apiReconcileIntegrations_(body); break;
      default:
        invalidateReadCache = false;
        throw new Error(`Unknown action: ${action}`);
    }

    const payload = Object.assign({ ok:true, version:APP_VERSION }, res);
    // Large read responses stall intermittently in Google's web-app response handoff.
    // When the staff proxy asks (gz=1), send big payloads gzip+base64; the proxy unpacks them.
    const text = READ_ACTIONS.has(action) && String(e?.parameter?.gz || "") === "1" ? compressedText_(payload) : JSON.stringify(payload);
    return relayedOutput_(e, text);
  } catch (err) {
    const detail = err?.message ? err.message : String(err);
    if (PUBLIC_ACTIONS.has(action) && !err?.public_message) {
      console.error(`Public ${action} failed: ${detail}`);
      return relayedOutput_(e, JSON.stringify({ ok:false, version:APP_VERSION, error:PUBLIC_ERROR_MESSAGE }));
    }
    return relayedOutput_(e, JSON.stringify({ ok:false, version:APP_VERSION, error:detail }));
  } finally {
    if (invalidateReadCache) {
      try { bumpReadCacheVersion_(Object.prototype.hasOwnProperty.call(READ_CACHE_ACTION_GROUPS, action) ? READ_CACHE_ACTION_GROUPS[action] : READ_CACHE_ALL_GROUPS); }
      catch (error) { console.warn("Read cache invalidation failed: " + String(error && error.message || error)); }
    }
  }
}

