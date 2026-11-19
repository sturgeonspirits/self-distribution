// Inventory API, part 2 of 12: Inventory: store list, store inventory, counts, reorders, manager grid, sales since count.
// The parts load in order 01 to 12 (filePushOrder in .clasp.json); version and change notes are in 01-core.gs.

function apiGetInitData_(store_id, _cache_bypass, forceRefresh, readMode) {
  if (!store_id && !_cache_bypass) return cachedReadPayload_("inventory_stores", () => apiGetInitData_("", true), !!forceRefresh, readMode);
  const startedAt = Date.now();
  const trackedAccountIds = inventoryTrackedAccountIds_();
  const stores = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.STORES))
    .filter(s => inventoryStoreAllowed_(s, trackedAccountIds))
    .map(s => Object.assign({
      store_id:String(s.store_id || ""),
      store_name:String(s.store_name || ""),
      route:String(s.route||"")
    }, storeContactFields_(s)))
    .sort((a,b)=>a.store_name.localeCompare(b.store_name));

  if (!store_id) return { stores, lines: [], performance:{ total_ms:Date.now() - startedAt, stages:{ stores_read_ms:Date.now() - startedAt } } };
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

  return { stores, lines, performance:{ total_ms:Date.now() - startedAt, stages:{ store_lines_read_ms:Date.now() - startedAt } } };
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
    // Toast Stock (bottles, from the weekly Toast count) marks a product out of stock at zero; the optional
    // "Out of Stock" checkbox still forces it out. The count itself is never sent to the public order page.
    const stockText = String(s.toast_stock ?? "").trim();
    const stock = stockText === "" ? null : Number(stockText);
    const hasStock = stock !== null && Number.isFinite(stock);
    const outOfStock = toBool_(firstPresent_(s, ["out_of_stock", "out_of_stock?"])) || (hasStock && stock <= 0);
    map.set(id,{
      sku_id:id,
      sku_name:s.sku_name,
      upc:digitsOnly_(s.upc),
      size:s.size,
      units_per_case:Number(s.units_per_case||12),
      catalog_source:ORDER_CATALOG_SOURCE,
      availability_status:outOfStock ? "Out of stock" : hasStock ? "In stock" : "Staff will confirm availability",
      out_of_stock:outOfStock,
      external_item_id:String(toast.external_item_id || ""),
      toast_mapping_status:toast.external_item_id ? "Mapped; adapter disabled" : "Not mapped",
    });
  });
  return {
    catalog_source:ORDER_CATALOG_SOURCE,
    availability_source:"Toast Stock column in SKUs (weekly Toast count) and Out of Stock checkboxes; staff confirms availability",
    skus:Array.from(map.values()).sort((a,b)=>String(a.sku_name||"").localeCompare(String(b.sku_name||""))),
  };
}

function sellSheetSectionForSku_(sku) {
  const explicit = String(sku.sell_sheet_section || "").trim();
  if (explicit) return explicit;
  const key = `${sku.sku_id || ""} ${sku.sku_name || ""} ${sku.price_tier || ""}`.toLowerCase();
  if (/gift|box/.test(key)) return "Gift boxes";
  if (/canned|cocktail/.test(key)) return "Canned cocktails";
  if (/bitter/.test(key)) return "Bitters";
  if (/squadron|spitfire|mustang|hellcat|flying fortress/.test(key)) return "Squadron Spirits";
  if (/bourbon|whiskey|whisky|brandy/.test(key)) return "Whiskey & Brandy";
  if (/osh.?gave|agave/.test(key)) return "Agave";
  if (/^stur-liq-|liqueur|amaretto|coffee|pumpkin|limoncello|triple sec|creme|curacao/.test(key)) return "Liqueur";
  if (/\brum\b|banana|coconut|pineapple|mango/.test(key)) return "Rum";
  if (/\bgin\b|blood orange|lavender|rhubarb|rosemary|sage|thyme/.test(key)) return "Gin";
  if (/vodka|river run|bacon|basil|black pepper|blackberry|candy cane|cinnamon|cranberry|cucumber|dill|cherry|garlic|habanero|jalapeño|jalapeno|pear|raspberry|sweet tea/.test(key)) return "Vodka";
  return "Other spirits";
}

function sellSheetCustomerPriceMap_(customerRows, accountId) {
  const values = new Map();
  const conflicts = new Set();
  (customerRows || []).forEach(row => {
    if (!toBool_(row.active) || String(row.account_id || "").trim() !== String(accountId || "").trim()) return;
    const skuId = String(row.sku_id || "").trim();
    const cents = badgerMoneyToCents_(firstPresent_(row, ["price", "unit_price", "wholesale_price"]));
    if (!skuId || !(cents > 0)) return;
    if (values.has(skuId) && values.get(skuId) !== cents) conflicts.add(skuId); else values.set(skuId, cents);
  });
  conflicts.forEach(skuId => values.delete(skuId));
  values.conflicts = conflicts;
  return values;
}

// This endpoint is reached only through Netlify's sell-sheet function, which decides whether prices may be included.
// Do not add wholesale prices to apiListSkus_ or another public catalog response.
function apiSellSheet_(p) {
  const includePrices = p && p.include_prices === true && p.sell_sheet_proxy === true;
  const accountId = includePrices ? String(p.account_id || "").trim() : "";
  const skuRows = getAllRowsAsObjects_(getSheet_(SHEET_NAMES.SKUS));
  const tiers = includePrices ? priceTierCents_() : null;
  const customerSheet = includePrices && accountId ? getSs_().getSheetByName(CUSTOMER_PRICES_SHEET_NAME) : null;
  const customerPrices = customerSheet && customerSheet.getLastRow() >= 2 ? sellSheetCustomerPriceMap_(getAllRowsAsObjects_(customerSheet), accountId) : new Map();
  const sections = new Map();
  skuRows.forEach(sku => {
    if (!toBool_(sku.active)) return;
    const skuId = String(sku.sku_id || "").trim();
    if (!skuId) return;
    const section = sellSheetSectionForSku_(sku);
    if (section === "Hide") return;
    const stockText = String(sku.toast_stock ?? "").trim();
    const stock = stockText === "" ? null : Number(stockText);
    const outOfStock = toBool_(firstPresent_(sku, ["out_of_stock", "out_of_stock?"])) || (Number.isFinite(stock) && stock <= 0);
    const item = {
      sku_id:skuId, name:String(sku.sku_name || skuId), size:String(sku.size || ""),
      abv:Number(sku.proof || 0) > 0 ? Number(sku.proof) / 2 : null,
      units_per_case:Number(sku.units_per_case || 0) || null,
      availability:outOfStock ? "Currently out" : Number.isFinite(stock) ? "In stock" : "Staff will confirm availability",
      out_of_stock:outOfStock,
    };
    if (includePrices) {
      if (customerPrices.conflicts && customerPrices.conflicts.has(skuId)) item.price_note = "Ask us for your price";
      else item.price_cents = customerPrices.has(skuId) ? customerPrices.get(skuId) : skuWholesaleCents_(sku, tiers);
    }
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section).push(item);
  });
  const order = ["New", "Best seller", "Vodka", "Gin", "Rum", "Liqueur", "Agave", "Whiskey & Brandy", "Squadron Spirits", "Gift boxes", "Bitters", "Canned cocktails", "Other spirits"];
  return {
    access:{ prices:includePrices, account_specific:!!accountId },
    copy:sellSheetCopy_(),
    sections:order.filter(section => sections.has(section)).map(section => ({ section:section, products:sections.get(section).sort((a,b) => a.name.localeCompare(b.name)) })),
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

const COUNT_LOG_EXTRA_HEADERS = ["shelf_units", "back_units", "expected_system_units", "submission_token"];

function countSubmissionAlreadyRecorded_(counts, h, token) {
  if (!token || h.submission_token === undefined || counts.getLastRow() < 2) return false;
  const tokens = counts.getRange(2, h.submission_token + 1, counts.getLastRow() - 1, 1).getValues();
  return tokens.some(row => String(row[0] || "") === token);
}

function apiSubmitCountsUnlocked_(p) {
  if (!p) throw new Error("Missing body");
  requireFields_(p, ["store_id","rep"]);
  assertInventoryStoreAllowed_(p.store_id);
  if (!Array.isArray(p.items) || !p.items.length) throw new Error("Missing items[]");
  if (p.items.length > 500) throw new Error("Too many items in one count submission.");

  const storeId = String(p.store_id);
  const token = sheetSafeText_(p.submission_token || "", 100, "Submission token");
  const counts = getSheet_(SHEET_NAMES.COUNTS);
  const ch = ensureHeaderColumns_(counts, COUNT_LOG_EXTRA_HEADERS);

  // A retry after a dropped connection resends the same token. If those rows are already in the
  // Counts log, the first attempt finished: report success without writing anything twice.
  if (countSubmissionAlreadyRecorded_(counts, ch, token)) {
    return { message:"These counts were already recorded. Nothing was submitted twice.", submitted:0, duplicate:true, changed_since_load:[] };
  }

  const inv = getSheet_(SHEET_NAMES.INVENTORY);
  const ih = getHeaderMap_(inv);
  const rows = getAllRowsAsObjects_(inv);
  const rowIndexBySku = new Map();
  rows.forEach((row, index) => {
    if (String(row.store_id) === storeId) rowIndexBySku.set(String(row.sku_id), index);
  });

  const ts = new Date();
  const rep = sheetSafeText_(p.rep, 100, "Rep");
  const seen = new Set();
  const logRows = [];
  const inventoryUpdates = [];
  const changedSinceLoad = [];
  const width = counts.getLastColumn();

  p.items.forEach(it => {
    const skuId = String(it?.sku_id || "").trim();
    if (!skuId) throw new Error("Each counted item needs a SKU.");
    if (seen.has(skuId)) throw new Error(`SKU ${skuId} appears twice in this count.`);
    seen.add(skuId);
    const after = Number(it.counted);
    if (!Number.isInteger(after) || after < 0) throw new Error(`Count for ${skuId} must be a whole number of bottles.`);
    const shelf = it.shelf === undefined || it.shelf === "" ? "" : Math.max(0, Math.floor(Number(it.shelf) || 0));
    const back = it.back === undefined || it.back === "" ? "" : Math.max(0, Math.floor(Number(it.back) || 0));
    const index = rowIndexBySku.has(skuId) ? rowIndexBySku.get(skuId) : -1;
    const before = index >= 0 ? Number(rows[index].on_hand_units || 0) : 0;
    const expected = it.expected_on_hand === undefined || it.expected_on_hand === null || it.expected_on_hand === ""
      ? ""
      : Number(it.expected_on_hand);
    if (expected !== "" && Number.isFinite(expected) && expected !== before) {
      changedSinceLoad.push({ sku_id:skuId, expected_on_hand:expected, current_on_hand:before });
    }

    const logRow = Array(width).fill("");
    logRow[0] = ts; logRow[1] = storeId; logRow[2] = rep; logRow[3] = skuId;
    logRow[4] = before; logRow[5] = after; logRow[6] = after - before;
    logRow[7] = sheetSafeText_(it.notes, 500, "Notes");
    logRow[ch.shelf_units] = shelf;
    logRow[ch.back_units] = back;
    logRow[ch.expected_system_units] = expected;
    logRow[ch.submission_token] = token;
    logRows.push(logRow);

    // A count always sets on-hand inventory; the old "updateInventory" flag is ignored.
    if (index >= 0) inventoryUpdates.push({ index, after });
  });

  // Inventory first, then the Counts log: the log carries the submission token, so a request that
  // stops between the two writes is simply redone on retry (the inventory values are the same).
  if (inventoryUpdates.length) {
    const columns = [
      { key:"on_hand_units", value:update => update.after },
      { key:"last_count_date", value:() => ts },
      { key:"last_count_units", value:update => update.after },
    ].filter(column => ih[column.key] !== undefined);
    const first = Math.min(...inventoryUpdates.map(update => update.index));
    const last = Math.max(...inventoryUpdates.map(update => update.index));
    const byIndex = new Map(inventoryUpdates.map(update => [update.index, update]));
    columns.forEach(column => {
      const values = [];
      for (let i = first; i <= last; i++) {
        const update = byIndex.get(i);
        values.push([update ? column.value(update) : rows[i][column.key]]);
      }
      inv.getRange(first + 2, ih[column.key] + 1, values.length, 1).setValues(values);
    });
  }

  counts.getRange(counts.getLastRow() + 1, 1, logRows.length, width).setValues(logRows);

  const changedText = changedSinceLoad.length
    ? ` ${changedSinceLoad.length} item${changedSinceLoad.length === 1 ? "'s" : "s'"} system number changed while you were counting (${changedSinceLoad.map(item => `${item.sku_id}: ${item.expected_on_hand} → ${item.current_on_hand}`).join("; ")}). Your counts were recorded against the current number.`
    : "";
  return { message:`Submitted ${logRows.length} count${logRows.length === 1 ? "" : "s"}.${changedText}`, submitted:logRows.length, duplicate:false, changed_since_load:changedSinceLoad };
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
  const lastCountByStore = new Map();
  inventoryRows.forEach(r => {
    const storeId = String(r.store_id || "");
    const skuId = String(r.sku_id || "").trim();
    if (!storeMap.has(storeId) || !skuMap.has(skuId)) return;

    const counted = r.last_count_date instanceof Date ? r.last_count_date : (r.last_count_date ? new Date(r.last_count_date) : null);
    if (counted && !isNaN(counted.getTime()) && (!lastCountByStore.has(storeId) || counted > lastCountByStore.get(storeId))) {
      lastCountByStore.set(storeId, counted);
    }

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
      last_count_date: lastCountByStore.has(store.store_id) ? lastCountByStore.get(store.store_id).toISOString() : "",
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

