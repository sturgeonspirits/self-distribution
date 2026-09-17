/*********************************
 * Inventory API (JSON) for Netlify
 * App version: 2026.09.16.24
 *
 * CHANGES IN THIS VERSION
 * - Added an immediate staff email for each new wholesale customer application.
 * - Sent application notices to sales@sturgeonspirits.com with a direct review link.
 * - Set the applicant as the reply-to address for efficient follow-up.
 * - Recorded notification success or failure beside the saved application.
 * - Kept application storage successful even if the notification email fails.
 *
 * EARLIER STAGING CHANGES
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

const APP_VERSION = "2026.09.16.24";

const SHEET_NAMES = {
  STORES: "Stores",
  SKUS: "SKUs",
  INVENTORY: "Inventory",
  COUNTS: "Counts",
  REORDERS: "Reorders",
};

const SPREADSHEET_ID = "1asGSIuz65hhbXbanDSuLdgsasDKqAyVWgu7DGi42Il8"; // staging Inventory Backend only
const REQUIRE_API_KEY = true;
const OUTREACH_SPREADSHEET_ID = "1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo"; // staging only
const OUTREACH_SHEET_NAME = "Distribution Directory and Leads";
const OUTREACH_ACTIVITY_SHEET_NAME = "Activity Log";
const OUTREACH_DRAFTS_SHEET_NAME = "Outreach Drafts";
const OUTREACH_PROGRAMS_SHEET_NAME = "Account Programs";
const OUTREACH_ENGAGEMENT_SHEET_NAME = "Email Engagement";
const TOAST_ITEM_MAP_SHEET_NAME = "Toast Item Map";
const NEWSLETTER_CONTACTS_SHEET_NAME = "Newsletter Contacts";
const CUSTOMER_APPLICATIONS_SHEET_NAME = "Customer Applications";
const CUSTOMER_APPLICATION_NOTIFICATION_EMAIL = "sales@sturgeonspirits.com";
const ONLINE_ORDER_REQUESTS_SHEET_NAME = "Online Order Requests";
const ONLINE_ORDER_LINES_SHEET_NAME = "Online Order Lines";

function getSs_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}
function getSheet_(name) {
  const sh = getSs_().getSheetByName(name);
  if (!sh) throw new Error(`Missing sheet: ${name}`);
  return sh;
}
function getOutreachSs_() {
  return SpreadsheetApp.openById(OUTREACH_SPREADSHEET_ID);
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
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
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
      return json_({ ok:true, service:"sturgeon-distribution-hub", version:APP_VERSION, actions:["initData","listSkus","addSkuToStore","upsertProduct","submitCounts","createReorder","managerGrid","salesSinceCount","updateStoreContacts","outreachDashboard","saveOutreachDraft","updateOutreachOutcome","updateOutreachBusiness","updateOutreachPrograms","upsertNewsletterContact","submitCustomerApplication","submitOnlineOrderRequest"] });
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
      case "outreachDashboard": res = apiGetOutreachDashboard_(); break;
      case "saveOutreachDraft": res = apiSaveOutreachDraft_(body); break;
      case "updateOutreachOutcome": res = apiUpdateOutreachOutcome_(body); break;
      case "updateOutreachBusiness": res = apiUpdateOutreachBusiness_(body); break;
      case "updateOutreachPrograms": res = apiUpdateOutreachPrograms_(body); break;
      case "upsertNewsletterContact": res = apiUpsertNewsletterContact_(body); break;
      case "submitCustomerApplication": res = apiSubmitCustomerApplication_(body); break;
      case "submitOnlineOrderRequest": res = apiSubmitOnlineOrderRequest_(body); break;
      default: throw new Error(`Unknown action: ${action}`);
    }

    return json_(Object.assign({ ok:true, version:APP_VERSION }, res));
  } catch (err) {
    return json_({ ok:false, version:APP_VERSION, error: err?.message ? err.message : String(err) });
  }
}

function apiGetInitData_(store_id) {
  const stores = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.STORES))
    .filter(s => toBool_(s.active))
    .map(s => Object.assign({
      store_id:String(s.store_id || ""),
      store_name:String(s.store_name || ""),
      route:String(s.route||"")
    }, storeContactFields_(s)))
    .sort((a,b)=>a.store_name.localeCompare(b.store_name));

  if (!store_id) return { stores, lines: [] };

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
  const map = new Map();
  getAllRowsAsObjects_(getSheet_(SHEET_NAMES.SKUS)).forEach(s=>{
    if (!toBool_(s.active)) return;
    const id = String(s.sku_id||"").trim();
    if (!id) return;
    map.set(id,{
      sku_id:id,
      sku_name:s.sku_name,
      upc:digitsOnly_(s.upc),
      size:s.size,
      units_per_case:Number(s.units_per_case||12),
    });
  });
  return { skus:Array.from(map.values()).sort((a,b)=>String(a.sku_name||"").localeCompare(String(b.sku_name||""))) };
}

function apiAddSkuToStore_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["store_id","sku_id"]);

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

function apiUpsertProduct_(p) {
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
  row[h.sku_name]=p.sku.sku_name;
  row[h.size]=p.sku.size || "";
  row[h.units_per_case]=Number(p.sku.units_per_case||12);
  row[h.active]=!!p.sku.active;

  if (idx>=0) sh.getRange(idx+2,1,1,row.length).setValues([row]);
  else sh.appendRow(row);

  if (p.addToStore) {
    apiAddSkuToStore_({
      store_id:p.store_id,
      sku_id:id,
      on_hand_units:p.inventory?.on_hand_units,
      par_level_units:p.inventory?.par_level_units,
      reorder_point_units:p.inventory?.reorder_point_units
    });
  }

  return { message:"Product saved." };
}

function apiSubmitCounts_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["store_id","rep"]);
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

    out.push([ts,p.store_id,p.rep,it.sku_id,before,after,after-before,it.notes||""]);

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

function apiCreateReorder_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["store_id","rep"]);

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

function apiUpdateStoreContacts_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["store_id"]);

  const sh = getSheet_(SHEET_NAMES.STORES);
  const h = ensureHeaderColumns_(sh, ["manager_name", "assistant_manager_name"]);
  const rows = getAllRowsAsObjects_(sh);
  const storeId = String(p.store_id || "");
  const idx = rows.findIndex(r => String(r.store_id) === storeId);
  if (idx < 0) throw new Error("Store not found.");

  const managerName = String(p.manager_name || "").trim();
  const assistantManagerName = String(p.assistant_manager_name || "").trim();
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

function apiGetManagerGrid_() {
  const stores = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.STORES))
    .filter(s => toBool_(s.active))
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
    const key = business.toLowerCase();
    if (!activity.has(key)) activity.set(key, []);
    activity.get(key).push({
      timestamp: outreachValue_(row, ["timestamp"]),
      stage: String(outreachValue_(row, ["message_stage", "stage"]) || ""),
      result: String(outreachValue_(row, ["result"]) || ""),
      detail: String(outreachValue_(row, ["error/detail", "error_detail", "detail"]) || ""),
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
  const sheet = getOutreachSheet_("Campaign Settings");
  const values = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), 2).getValues();
  return values.reduce((settings, row) => {
    if (row[0]) settings[String(row[0])] = row[1];
    return settings;
  }, {});
}

function outreachDraftKey_(sourceRow, stage) {
  return `${Number(sourceRow)}::${String(stage || "Initial").trim().toLowerCase()}`;
}

function getOutreachDraftSheet_(createIfMissing) {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(OUTREACH_DRAFTS_SHEET_NAME);
  if (sheet || !createIfMissing) return sheet;

  sheet = ss.insertSheet(OUTREACH_DRAFTS_SHEET_NAME);
  const headers = [["Draft Key", "Source Row", "Business Name", "Email", "Message Stage", "Subject", "Body Text", "Updated At", "Updated By", "App Version"]];
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
    const stage = String(row.message_stage || "Initial").trim();
    if (!sourceRow) return;
    drafts.set(outreachDraftKey_(sourceRow, stage), {
      subject: String(row.subject || "").trim(),
      body_text: String(row.body_text || "").trim(),
      updated_at: row.updated_at || "",
      updated_by: String(row.updated_by || ""),
    });
  });
  return drafts;
}

function getOutreachProgramSheet_(createIfMissing) {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(OUTREACH_PROGRAMS_SHEET_NAME);
  if (sheet || !createIfMissing) return sheet;

  sheet = ss.insertSheet(OUTREACH_PROGRAMS_SHEET_NAME);
  const headers = [[
    "Program Key", "Source Row", "Business Name", "Email",
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
    if (!sourceRow) return;
    programs.set(sourceRow, {
      newsletter_status: String(row.newsletter_status || "Not invited"),
      newsletter_consent_source: String(row.newsletter_consent_source || ""),
      newsletter_status_date: row.newsletter_status_date || "",
      ordering_status: String(row.ordering_status || "Not offered"),
      ordering_customer_id: String(row.ordering_customer_id || ""),
      ordering_invite_date: row.ordering_invite_date || "",
      ordering_portal_url: String(row.ordering_portal_url || ""),
      notes: String(row.notes || ""),
      updated_at: row.updated_at || "",
    });
  });
  return programs;
}

function outreachEngagementMap_() {
  const sheet = getOutreachSs_().getSheetByName(OUTREACH_ENGAGEMENT_SHEET_NAME);
  const engagement = new Map();
  if (!sheet || sheet.getLastRow() < 2) return engagement;
  getAllRowsAsObjects_(sheet).forEach(row => {
    const sourceRow = Number(row.source_row || 0);
    if (!sourceRow) return;
    if (!engagement.has(sourceRow)) {
      engagement.set(sourceRow, {
        open_count:0,
        last_opened:"",
        click_count:0,
        last_clicked:"",
        reply_count:0,
        bounce_count:0,
        source:"",
      });
    }
    const summary = engagement.get(sourceRow);
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
    return word.toLowerCase().replace(/(^|[-\/'&])([a-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase());
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
  const messageStage = String(outreachValue_(row, ["next_email", "stage"]) || "Initial").trim();
  const draft = draftMap.get(outreachDraftKey_(sourceRow, messageStage));
  const message = outreachMessage_(row, settings, draft);
  const city = String(outreachValue_(row, ["city", "town"]) || "").trim();
  const state = String(outreachValue_(row, ["state"]) || "").trim();
  const postalCode = String(outreachValue_(row, ["zip", "zip_code", "postal_code"]) || "").trim();
  const street = String(outreachValue_(row, ["address", "street", "street_address", "address_1"]) || "").trim();
  const address = [street, city, state, postalCode].filter(Boolean).join(", ");
  const record = {
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
    has_saved_draft: message.has_saved_draft,
    draft_updated_at: message.draft_updated_at,
    programs: programMap.get(sourceRow) || {
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
    email_engagement: engagementMap.get(sourceRow) || {
      open_count:0,
      last_opened:"",
      click_count:0,
      last_clicked:"",
      reply_count:0,
      bounce_count:0,
      source:"Not connected",
    },
    activity: (activityMap.get(business.toLowerCase()) || []).slice(0, 5),
  };
  record.weekly_exclusion_reasons = outreachWeeklyExclusionReasons_(record);
  record.weekly_eligible = record.weekly_exclusion_reasons.length === 0;
  return record;
}

function apiGetOutreachDashboard_() {
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rows = getAllRowsAsObjects_(sheet);
  const activityMap = outreachActivityMap_();
  const settings = getOutreachCampaignSettings_();
  const draftMap = outreachDraftMap_();
  const programMap = outreachProgramMap_();
  const engagementMap = outreachEngagementMap_();
  const records = rows.map((row, index) => outreachRecord_(row, index + 2, activityMap, settings, draftMap, programMap, engagementMap))
    .filter(record => record.business);

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

  return {
    can_send: false,
    today: today,
    directory: directory,
    sent: sent.slice(0, 50),
    newsletter_contacts: newsletterContacts_(),
    summary: {
      due_today: due.length,
      total_businesses: directory.length,
      waiting: waiting.length,
      weekly_ready: weeklyReady.length,
    },
  };
}

function outreachStatusForOutcome_(outcome) {
  const map = {
    "Interested": "Interested",
    "Schedule tasting": "Interested",
    "Follow up later": "Follow-up due",
    "Visit in person": "Interested",
    "Wrong contact": "Needs email",
    "Not interested": "Not interested",
  };
  return map[outcome] || "Replied";
}

function appendOutreachActivity_(record, outcome, notes) {
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  const h = getHeaderMap_(sheet);
  const row = Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  set("timestamp", new Date());
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
  const h = getHeaderMap_(sheet);
  const row = Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  set("timestamp", new Date());
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

  const subject = String(p.subject || "").trim();
  const bodyText = String(p.body_text || "").trim();
  if (!subject || subject.length > 200) throw new Error("Subject must be between 1 and 200 characters.");
  if (!bodyText || bodyText.length > 20000) throw new Error("Message must be between 1 and 20,000 characters.");

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
    const currentStage = String(outreachValue_(current, ["next_email", "stage"]) || "Initial").trim();
    if (currentBusiness !== String(p.business || "").trim()) throw new Error("Business row changed. Refresh and try again.");
    if (p.email && currentEmail !== String(p.email).trim()) throw new Error("Contact email changed. Refresh and try again.");
    if (currentStage.toLowerCase() !== String(p.message_stage || "").trim().toLowerCase()) {
      throw new Error("Email stage changed. Refresh before saving this draft.");
    }

    const sheet = getOutreachDraftSheet_(true);
    const headers = getHeaderMap_(sheet);
    const key = outreachDraftKey_(rowNumber, currentStage);
    const now = new Date();
    const updatedBy = Session.getActiveUser().getEmail() || "Sturgeon Distribution Hub";
    const rowValues = Array(sheet.getLastColumn()).fill("");
    const set = (name, value) => { if (headers[name] !== undefined) rowValues[headers[name]] = value; };
    set("draft_key", key);
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
    appendOutreachDraftActivity_({ business:currentBusiness, email:currentEmail }, currentStage, subject);
    return { message:"Email draft saved.", source_row:rowNumber, updated_at:now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function apiUpdateOutreachOutcome_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["source_row", "business", "outcome"]);

  const allowed = ["Interested", "Schedule tasting", "Follow up later", "Visit in person", "Wrong contact", "Not interested"];
  if (!allowed.includes(String(p.outcome))) throw new Error("Unsupported outcome.");

  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(p.source_row);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error("Lead row not found.");

  const h = getHeaderMap_(sheet);
  const values = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  const current = {};
  Object.keys(h).forEach(key => current[key] = values[h[key]]);
  const currentBusiness = String(outreachValue_(current, ["business", "business_name"]) || "").trim();
  const currentEmail = String(outreachValue_(current, ["email", "email_address"]) || "").trim();
  if (currentBusiness !== String(p.business || "").trim()) throw new Error("Lead changed in the sheet. Refresh and try again.");
  if (p.email && currentEmail !== String(p.email).trim()) throw new Error("Contact email changed in the sheet. Refresh and try again.");

  const setCell = (keys, value) => {
    const key = keys.find(candidate => h[candidate] !== undefined);
    if (key) sheet.getRange(rowNumber, h[key] + 1).setValue(value);
  };
  const outcome = String(p.outcome);
  setCell(["status"], outreachStatusForOutcome_(outcome));
  setCell(["outcome"], outcome);
  if (p.next_follow_up) setCell(["next_follow-up", "next_follow_up"], new Date(`${p.next_follow_up}T12:00:00`));
  if (outcome === "Not interested") setCell(["do_not_email", "do_not_contact"], true);
  if (p.notes) {
    const priorNotes = String(outreachValue_(current, ["notes"]) || "").trim();
    const datedNote = `${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd")} - ${String(p.notes).trim()}`;
    setCell(["notes"], priorNotes ? `${priorNotes}\n${datedNote}` : datedNote);
  }

  appendOutreachActivity_({ business:currentBusiness, email:currentEmail }, outcome, String(p.notes || ""));
  return { message:"Outcome saved.", source_row:rowNumber, status:outreachStatusForOutcome_(outcome) };
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
    if (currentBusiness !== String(p.business || "").trim()) throw new Error("Business row changed. Refresh and try again.");
    if (p.original_email && currentEmail !== String(p.original_email).trim()) throw new Error("Contact information changed. Refresh and try again.");

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
      sheet.getRange(rowNumber, h[actualKey] + 1).setValue(value);
      changed.push(outreachFieldLabel_(canonical));
    });

    const additionalNote = String(p.additional_note || "").trim();
    if (additionalNote) {
      const notesKey = ["notes"].find(key => h[key] !== undefined);
      if (!notesKey) throw new Error("The directory does not have a Notes column.");
      const priorNotes = String(current[notesKey] || "").trim();
      const datedNote = `${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd")} - ${additionalNote}`;
      sheet.getRange(rowNumber, h[notesKey] + 1).setValue(priorNotes ? `${priorNotes}\n${datedNote}` : datedNote);
      changed.push("Notes");
    }

    if (!changed.length) return { message:"No contact changes to save.", source_row:rowNumber, changed:[] };
    appendOutreachActivity_(
      { business:currentBusiness, email:String(p.updates.email || currentEmail) },
      "CONTACT UPDATED",
      `Updated ${changed.join(", ")}`
    );
    return { message:"Contact information saved.", source_row:rowNumber, changed:changed };
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
    if (currentBusiness !== String(p.business || "").trim()) throw new Error("Business row changed. Refresh and try again.");
    if (p.email && currentEmail !== String(p.email).trim()) throw new Error("Contact email changed. Refresh and try again.");

    const sheet = getOutreachProgramSheet_(true);
    const h = getHeaderMap_(sheet);
    const programKey = `account::${rowNumber}`;
    const now = new Date();
    const updatedBy = Session.getActiveUser().getEmail() || "Sturgeon Distribution Hub";
    const values = Array(sheet.getLastColumn()).fill("");
    const set = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
    set("program_key", programKey);
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
    const activityHeaders = getHeaderMap_(activitySheet);
    const activityRow = Array(activitySheet.getLastColumn()).fill("");
    const setActivity = (key, value) => { if (activityHeaders[key] !== undefined) activityRow[activityHeaders[key]] = value; };
    setActivity("timestamp", now);
    setActivity("business", currentBusiness);
    setActivity("intended_recipient", currentEmail);
    setActivity("message_stage", "PROGRAMS");
    setActivity("subject", "Optional program plan updated");
    setActivity("result", "PROGRAM PLAN SAVED");
    setActivity("error/detail", `Newsletter: ${newsletterStatus}; Online ordering: ${orderingStatus}; no action sent.`);
    setActivity("error_detail", `Newsletter: ${newsletterStatus}; Online ordering: ${orderingStatus}; no action sent.`);
    setActivity("mailer_version", APP_VERSION);
    activitySheet.appendRow(activityRow);

    return { message:"Program plan saved.", source_row:rowNumber, updated_at:now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function getNewsletterContactsSheet_(createIfMissing) {
  const ss = getOutreachSs_();
  let sheet = ss.getSheetByName(NEWSLETTER_CONTACTS_SHEET_NAME);
  if (sheet || !createIfMissing) return sheet;
  sheet = ss.insertSheet(NEWSLETTER_CONTACTS_SHEET_NAME);
  const headers = [["Contact ID", "Name", "Email", "Organization", "Relationship Type", "Status", "Consent Source", "Consent Date", "Source Row", "Source Business", "Topics", "Notes", "Updated At", "Updated By", "App Version"]];
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
    set("updated_by", Session.getActiveUser().getEmail() || "Sturgeon Distribution Hub");
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
  return text;
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
  if (sheet || !createIfMissing) return sheet;
  sheet = ss.insertSheet(CUSTOMER_APPLICATIONS_SHEET_NAME);
  const headers = [[
    "Application ID", "Submitted At", "Workflow Status", "Legal Business Name", "Business Name", "Business Type", "Website",
    "Seller Permit Number",
    "Primary Contact Name", "Primary Contact Title", "Primary Email", "Primary Phone", "Ordering Email",
    "AP Contact Name", "AP Email", "Invoice Preference", "Delivery Address 1", "Delivery Address 2", "Delivery City",
    "Delivery State", "Delivery ZIP", "Delivery Window", "Delivery Instructions", "Billing Same", "Billing Address 1",
    "Billing City", "Billing State", "Billing ZIP", "Product Interests", "Expected Order Frequency", "Referral Source", "Notes",
    "Authorized Name", "Authorized Title", "Attested", "Newsletter Opt In", "Newsletter Consent At", "Submission Token", "App Version"
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
  if (sheet || !createIfMissing) return sheet;
  sheet = ss.insertSheet(ONLINE_ORDER_REQUESTS_SHEET_NAME);
  const headers = [[
    "Request ID", "Submitted At", "Workflow Status", "Verification Status", "Business Name", "Customer ID", "Contact Name",
    "Email", "Phone", "PO Number", "Requested Delivery Date", "Delivery Window", "Delivery Instructions", "Notes",
    "Line Count", "Requested Cases", "Requested Bottles", "Bottle Equivalent", "Submission Token", "App Version"
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
  if (sheet || !createIfMissing) return sheet;
  sheet = ss.insertSheet(ONLINE_ORDER_LINES_SHEET_NAME);
  const headers = [["Request ID", "Line Number", "SKU ID", "SKU Name", "Quantity", "Unit", "Units Per Case", "Bottle Equivalent", "App Version"]];
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
  if (String(p.company_website || "").trim()) return { message:"Application received.", application_id:"RECEIVED" };
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
    submission_token:publicText_(p.submission_token, 120, "Submission token"),
  };
  if (!application.billing_same && (!application.billing_address_1 || !application.billing_city || !application.billing_state || !application.billing_zip)) {
    throw new Error("Complete the billing address or mark it the same as delivery.");
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another application is being recorded. Try again in a moment.");
  try {
    const sheet = getCustomerApplicationsSheet_(true);
    ensureHeaderColumns_(sheet, ["Notification Status", "Notification Sent At", "Notification Error"]);
    const priorId = existingSubmissionByToken_(sheet, application.submission_token, "Application ID");
    if (priorId) return { message:"Application already received.", application_id:priorId };
    const h = getHeaderMap_(sheet);
    const now = new Date();
    application.application_id = publicSubmissionId_("APP");
    const row = Array(sheet.getLastColumn()).fill("");
    const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
    set("application_id", application.application_id);
    set("submitted_at", now);
    set("workflow_status", "New");
    Object.keys(application).forEach(key => set(key, application[key]));
    set("attested", true);
    set("newsletter_consent_at", application.newsletter_opt_in ? now : "");
    set("app_version", APP_VERSION);
    sheet.appendRow(row);
    upsertNewsletterFromApplication_(application);
    const applicationRow = sheet.getLastRow();
    const notification = sendCustomerApplicationNotification_(application, sheet, applicationRow);
    sheet.getRange(applicationRow, h.notification_status + 1, 1, 3).setValues([[
      notification.status,
      notification.sent_at,
      notification.error,
    ]]);
    return { message:"Application received for review.", application_id:application.application_id };
  } finally {
    lock.releaseLock();
  }
}

function onlineOrderVerification_(businessName, customerId, email) {
  const sheet = getOutreachProgramSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) return "Needs review";
  const normalizedBusiness = String(businessName || "").trim().toLowerCase();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedId = String(customerId || "").trim().toLowerCase();
  const match = getAllRowsAsObjects_(sheet).find(row => {
    if (String(row.ordering_status || "").trim() !== "Active") return false;
    const idMatch = normalizedId && String(row.ordering_customer_id || "").trim().toLowerCase() === normalizedId;
    const emailMatch = normalizedEmail && String(row.email || "").trim().toLowerCase() === normalizedEmail;
    const businessMatch = normalizedBusiness && String(row.business_name || "").trim().toLowerCase() === normalizedBusiness;
    return idMatch || (emailMatch && businessMatch);
  });
  return match ? "Active account matched" : "Needs review";
}

function apiSubmitOnlineOrderRequest_(p) {
  if (!p) throw new Error("Missing order data.");
  if (String(p.company_website || "").trim()) return { message:"Order request received.", request_id:"RECEIVED" };
  requireFields_(p, ["business_name", "contact_name", "email", "submission_token"]);
  if (!Array.isArray(p.lines) || !p.lines.length) throw new Error("Choose at least one product.");
  if (p.lines.length > 50) throw new Error("An order request can contain up to 50 products.");

  const businessName = publicText_(p.business_name, 160, "Business name");
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
    };
  });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another order request is being recorded. Try again in a moment.");
  try {
    const requestSheet = getOnlineOrderRequestsSheet_(true);
    const priorId = existingSubmissionByToken_(requestSheet, submissionToken, "Request ID");
    if (priorId) return { message:"Order request already received.", request_id:priorId };
    const lineSheet = getOnlineOrderLinesSheet_(true);
    const h = getHeaderMap_(requestSheet);
    const lineHeaders = getHeaderMap_(lineSheet);
    const requestId = publicSubmissionId_("ORD");
    const now = new Date();
    const verification = onlineOrderVerification_(businessName, customerId, email);
    const totalCases = lines.filter(line => line.unit === "Cases").reduce((sum, line) => sum + line.quantity, 0);
    const totalBottles = lines.filter(line => line.unit === "Bottles").reduce((sum, line) => sum + line.quantity, 0);
    const bottleEquivalent = lines.reduce((sum, line) => sum + line.bottle_equivalent, 0);
    const row = Array(requestSheet.getLastColumn()).fill("");
    const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
    set("request_id", requestId);
    set("submitted_at", now);
    set("workflow_status", "New");
    set("verification_status", verification);
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

    const lineRows = lines.map((line, index) => {
      const values = Array(lineSheet.getLastColumn()).fill("");
      const setLine = (key, value) => { if (lineHeaders[key] !== undefined) values[lineHeaders[key]] = value; };
      setLine("request_id", requestId);
      setLine("line_number", index + 1);
      setLine("sku_id", line.sku_id);
      setLine("sku_name", line.sku_name);
      setLine("quantity", line.quantity);
      setLine("unit", line.unit);
      setLine("units_per_case", line.units_per_case);
      setLine("bottle_equivalent", line.bottle_equivalent);
      setLine("app_version", APP_VERSION);
      return values;
    });
    lineSheet.getRange(lineSheet.getLastRow() + 1, 1, lineRows.length, lineRows[0].length).setValues(lineRows);
    return { message:"Order request received for confirmation.", request_id:requestId, verification_status:verification };
  } finally {
    lock.releaseLock();
  }
}
