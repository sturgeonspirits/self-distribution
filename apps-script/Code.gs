/*********************************
 * Inventory API (JSON) for Netlify
 *********************************/

const SHEET_NAMES = {
  STORES: "Stores",
  SKUS: "SKUs",
  INVENTORY: "Inventory",
  COUNTS: "Counts",
  REORDERS: "Reorders",
};

const SPREADSHEET_ID = ""; // blank if bound
const REQUIRE_API_KEY = false; // set true when ready

function getSs_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}
function getSheet_(name) {
  const sh = getSs_().getSheetByName(name);
  if (!sh) throw new Error(`Missing sheet: ${name}`);
  return sh;
}
function normalizeHeader_(h) {
  return String(h || "").trim().toLowerCase().replace(/\s+/g, "_");
}
const __HEADER_CACHE = new Map();
function getHeaderMap_(sheet) {
  const key = sheet.getSheetId();
  if (__HEADER_CACHE.has(key)) return __HEADER_CACHE.get(key);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.map(normalizeHeader_).forEach((h, i) => { if (h) map[h] = i; });
  __HEADER_CACHE.set(key, map);
  return map;
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
      return json_({ ok:true, service:"inventory-api", actions:["initData","listSkus","addSkuToStore","upsertProduct","submitCounts","createReorder","managerGrid"] });
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
      default: throw new Error(`Unknown action: ${action}`);
    }

    return json_(Object.assign({ ok:true }, res));
  } catch (err) {
    return json_({ ok:false, error: err?.message ? err.message : String(err) });
  }
}

function apiGetInitData_(store_id) {
  const stores = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.STORES))
    .filter(s => toBool_(s.active))
    .map(s => ({ store_id:String(s.store_id || ""), store_name:String(s.store_name || ""), route:String(s.route||"") }))
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

function apiGetManagerGrid_() {
  const stores = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.STORES))
    .filter(s => toBool_(s.active))
    .map(s => ({
      store_id: String(s.store_id || ""),
      store_name: String(s.store_name || ""),
      route: String(s.route || "")
    }))
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
