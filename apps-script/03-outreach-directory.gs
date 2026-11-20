// Inventory API, part 3 of 12: Outreach directory: account IDs and matching, adding/importing businesses, the Outreach screen and business records.
// The parts load in order 01 to 12 (filePushOrder in .clasp.json); version and change notes are in 01-core.gs.

// "&" reads as "and" and a leading "The" is dropped, so "THE 1890 PUB & BISTRO" and "1890 Pub and Bistro" are the
// same business (Karl, 2026-11-19, .83: approving the 1890's application made a second Directory row).
function normalizeBusinessKey_(value) {
  return String(value || "").trim().toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/^the /, "");
}

// Directory quality (Karl, 2026-11-19). Keep this list in one place: it is deliberately
// conservative, and a single ordinary word is only a prompt for staff to check the name.
const DIRECTORY_QUALITY_PLACEHOLDER_CONTACT_PATTERNS = [
  /\(likely\)/i, /\bnofirstname\b/i, /\bnolastname\b/i, /\bclub manager\b/i,
  /\bpay master\b/i, /\bna na\b/i, /\btbd\b/i, /\bunknown\b/i,
];
const DIRECTORY_QUALITY_LAST_RUN_PROPERTY = "DIRECTORY_QUALITY_LAST_RUN";
// The first DOR catch-up can be large. Leave enough Apps Script time for the
// final sheet writes, then continue from the durable DOR high-water mark.
const DIRECTORY_QUALITY_MAX_RUN_MS = 4.5 * 60 * 1000;

function directoryQualityBusinessKey_(value) {
  return normalizeBusinessKey_(value).replace(/\b(llc|inc|incorporated|ltd|limited|corp|corporation)\b/g, "").replace(/\s+/g, " ").trim();
}

function directoryQualityPhoneKey_(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : "";
}

function directoryQualityIssueRecord_(row, sourceRow) {
  const record = {
    source_row:Number(sourceRow || row.source_row || 0),
    account_id:String(row.account_id || "").trim(),
    business:String(outreachValue_(row, ["business", "business_name"]) || "").trim(),
    contact:String(outreachValue_(row, ["contact", "contact_name", "contact_person", "first_name"]) || "").trim(),
    email:String(outreachValue_(row, ["email", "email_address"]) || "").trim(),
    phone:String(outreachValue_(row, ["phone", "phone_number", "telephone"]) || "").trim(),
    city:String(outreachValue_(row, ["city", "town"]) || "").trim(),
    status:String(outreachValue_(row, ["status"]) || "").trim(),
    outcome:String(outreachValue_(row, ["outcome"]) || "").trim(),
    notes:String(outreachValue_(row, ["notes"]) || "").trim(),
    relationship:String(outreachValue_(row, ["relationship"]) || "").trim(),
    customer_source:String(outreachValue_(row, ["customer_source"]) || "").trim(),
    do_not_email:toBool_(outreachValue_(row, ["do_not_email", "do_not_contact"])),
    miles:outreachValue_(row, ["miles", "distance", "distance_miles"]),
    postal_code:String(outreachValue_(row, ["zip", "zip_code", "postal_code"]) || "").trim(),
  };
  record.miles = outreachMiles_(record.miles);
  record.customer = OUTREACH_CUSTOMER_HISTORY_RELATIONSHIPS.includes(String(record.relationship || "").trim().toLowerCase())
    || String(record.status).toLowerCase() === "existing customer";
  record.excluded = ["closed", "do not contact"].includes(record.status.toLowerCase())
    || (record.do_not_email && !customerDoNotEmailIsAutomatic_(record));
  return record;
}

function directoryQualityPlaceholderContact_(record) {
  return directoryContactIsPlaceholder_(record.contact, record.business);
}

/** A blank is handled separately in the quality report; this recognizes only a value safe to replace. */
function directoryContactIsPlaceholder_(contactValue, businessValue) {
  const contact = String(contactValue || "").trim();
  if (!contact) return false;
  if (DIRECTORY_QUALITY_PLACEHOLDER_CONTACT_PATTERNS.some(pattern => pattern.test(contact))) return true;
  if (directoryQualityBusinessKey_(contact) && directoryQualityBusinessKey_(contact) === directoryQualityBusinessKey_(businessValue)) return true;
  return contact.split(/\s+/).filter(Boolean).length === 1;
}

// The fill helper runs thousands of times in one DOR pass; Utilities and Session are slow service calls.
let __DIRECTORY_FILL_DATE = { day:null, text:"" };
function directoryFillDateText_(now) {
  const date = now instanceof Date ? now : new Date(now || Date.now());
  const day = Math.floor(date.getTime() / 3600000);
  if (__DIRECTORY_FILL_DATE.day !== day) __DIRECTORY_FILL_DATE = { day:day, text:Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd") };
  return __DIRECTORY_FILL_DATE.text;
}

/** Compares two person names ignoring case, punctuation and "Last, First" order. */
function directoryPersonKey_(value) {
  return dorCleanPersonName_(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
const DOR_NAME_SUFFIXES = /^(jr|sr|ii|iii|iv|v)\.?$/i;
/**
 * DOR agent names arrive as typed by clerks: "NULL" for none, ALL CAPS, or "QUIMBY, BRADLEY C.". Outreach greets
 * by first name, so turn them into "Bradley C. Quimby"; an empty-looking value becomes "".
 */
function dorCleanPersonName_(value) {
  let name = String(value || "").replace(/\s+/g, " ").trim().replace(/[.,]+$/, (match) => match.startsWith(".") ? "." : "");
  if (!name || /^(null|n\/?a|none|unknown|tbd|-+)$/i.test(name)) return "";
  const parts = name.split(",").map(part => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const tail = parts.slice(1);
    if (tail.every(part => DOR_NAME_SUFFIXES.test(part))) name = [parts[0]].concat(tail).join(" ");
    else if (parts.length === 2 || (parts.length === 3 && DOR_NAME_SUFFIXES.test(parts[2]))) name = [parts[1], parts[0]].concat(parts.slice(2)).join(" ");
  }
  if (/[a-z]/.test(name)) return name;
  return name.toLowerCase().split(" ").map(word => {
    if (DOR_NAME_SUFFIXES.test(word) && !/^v\.?$/i.test(word)) return word.toUpperCase();
    return word.replace(/(^|['’\-])([a-z])/g, (match, lead, letter) => lead + letter.toUpperCase()).replace(/^Mc([a-z])/, (match, letter) => `Mc${letter.toUpperCase()}`);
  }).join(" ");
}

function directoryFillHeaderKey_(headers, aliases) {
  return aliases.map(normalizeHeader_).find(key => headers[key] !== undefined);
}

/** Never learn an address that is clearly automated, ours, malformed, or already recorded as a hard bounce. */
function directoryFillEmailAllowed_(emailValue, notes) {
  const email = String(emailValue || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  if (/^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|mail-daemon|mailerdaemon|postmaster)@/.test(email)) return false;
  if (email.endsWith("@sturgeonspirits.com")) return false;
  return typeof outreachBadEmailInNotes_ !== "function" || !outreachBadEmailInNotes_(notes, email);
}

/**
 * Applies one trusted source to an in-memory Directory row. It never overwrites a real name or email;
 * callers own the row lock and write only the changed cells afterwards.
 */
function directoryApplyContactFillToValues_(values, headers, source, now) {
  const get = aliases => {
    const key = directoryFillHeaderKey_(headers, aliases);
    return key === undefined ? "" : values[headers[key]];
  };
  const set = (aliases, value) => {
    const key = directoryFillHeaderKey_(headers, aliases);
    if (key === undefined || values[headers[key]] === value) return false;
    values[headers[key]] = value;
    return true;
  };
  const result = { changed:false, email_filled:false, contact_filled:false, notes_added:false, conflicts:[] };
  const date = directoryFillDateText_(now);
  const label = String(source?.label || "source").trim() || "source";
  const business = String(get(["business", "business_name"]) || "").trim();
  const notes = String(get(["notes"]) || "").trim();
  const existingEmail = String(get(["email", "email_address"]) || "").trim().toLowerCase();
  const existingContact = String(get(["contact", "contact_name", "contact_person", "first_name"]) || "").trim();
  const outcome = String(get(["outcome"]) || "").trim();
  const relationship = String(get(["relationship"]) || "").trim().toLowerCase();
  const status = String(get(["status"]) || "").trim().toLowerCase();
  const fillLines = [];
  const conflictLines = [];
  const email = String(source?.email || "").trim().toLowerCase();
  const contact = String(source?.contact || "").replace(/[\r\n]+/g, " ").trim();
  const replacingBadAddress = outcome.toLowerCase() === "bad address";
  // A source address that is unsafe invalidates the whole source, including its display name.
  if (email && !directoryFillEmailAllowed_(email, notes)) return result;

  if (email) {
    if (!existingEmail || replacingBadAddress || (source && source.replace_email && existingEmail !== email)) {
      if (set(["email", "email_address"], email)) {
        result.changed = true;
        result.email_filled = true;
        fillLines.push(`${existingEmail ? "replacement email" : "email"} ${email}`);
        if (source.email_confidence) set(["email_confidence"], String(source.email_confidence));
        if (source.email_source_url && !String(get(["email_source_url"]) || "").trim()) set(["email_source_url"], String(source.email_source_url));
        if (replacingBadAddress) set(["outcome"], "");
        if (relationship === "prospect" && status === "needs email") {
          const statusAfterFill = String(source.status_after_fill || "Not contacted");
          set(["status"], statusAfterFill);
          if (statusAfterFill.toLowerCase() === "replied") set(["next_follow-up", "next_follow_up"], "");
        }
        if (replacingBadAddress && String(get(["status"]) || "").trim().toLowerCase() === "not contacted") set(["next_email", "stage"], "Initial");
      }
    } else if (existingEmail !== email) {
      const conflict = `${label} has email ${email}`;
      if (!notes.toLowerCase().includes(conflict.toLowerCase())) {
        conflictLines.push(conflict);
        result.conflicts.push(`email ${email}`);
      }
    }
  }

  if (contact) {
    if (!existingContact || directoryContactIsPlaceholder_(existingContact, business) || (source && source.replace_contact && existingContact.toLowerCase() !== contact.toLowerCase())) {
      if (set(["contact", "contact_name", "contact_person", "first_name"], contact)) {
        result.changed = true;
        result.contact_filled = true;
        fillLines.push(`${existingContact ? "replacement contact person" : "contact person"} ${contact}`);
      }
    } else if (directoryPersonKey_(existingContact) !== directoryPersonKey_(contact)) {
      const conflict = `${label} has contact ${contact}`;
      if (!notes.toLowerCase().includes(conflict.toLowerCase())) {
        conflictLines.push(conflict);
        result.conflicts.push(`contact ${contact}`);
      }
    }
  }

  const extraAliases = { phone:["phone", "phone_number", "telephone"], street:["street_address", "street", "address", "address_1"], city:["city", "town"], zip:["zip", "zip_code", "postal_code"] };
  // Only differences worth a decision get a Notes line. City (a mailing city vs the licensing town, e.g. Appleton vs
  // Grand Chute) and street spelling ("St." vs "Street") differ harmlessly, so they're filled when blank and never noted.
  const sameField = (field, a, b) => field === "zip" ? String(a).replace(/\D/g, "").slice(0, 5) === String(b).replace(/\D/g, "").slice(0, 5)
    : field === "phone" ? String(a).replace(/\D/g, "").slice(-10) === String(b).replace(/\D/g, "").slice(-10)
    : true;
  Object.keys(source?.fields || {}).forEach(field => {
    const aliases = extraAliases[field]; const incoming = String(source.fields[field] || "").trim();
    if (!aliases || !incoming) return;
    const existing = String(get(aliases) || "").trim();
    if (!existing && set(aliases, incoming)) {
      result.changed = true; fillLines.push(`${field} ${incoming}`);
    } else if (existing && !sameField(field, existing, incoming)) {
      const conflict = `${label} has ${field} ${incoming}`;
      if (!notes.toLowerCase().includes(conflict.toLowerCase())) { conflictLines.push(conflict); result.conflicts.push(`${field} ${incoming}`); }
    }
  });

  const noteLines = [];
  if (fillLines.length) noteLines.push(`${date} - Filled ${fillLines.join(" and ")} from ${label}.`);
  conflictLines.forEach(line => noteLines.push(`${date} - ${line}.`));
  if (source?.note && !notes.toLowerCase().includes(String(source.note).toLowerCase())) noteLines.push(`${date} - ${String(source.note).trim()}`);
  if (noteLines.length && directoryFillHeaderKey_(headers, ["notes"]) !== undefined) {
    set(["notes"], [notes].concat(noteLines).filter(Boolean).join("\n"));
    result.changed = true;
    result.notes_added = true;
  }
  if (result.changed) set(["record_updated_at"], now || new Date());
  result.details = noteLines.slice();
  return result;
}

/** Applies the shared contact fill safely to one re-checked Directory row while its caller owns the script lock. */
function directoryApplyContactFillForRecord_(record, source, now) {
  if (!record || !Number.isInteger(Number(record.source_row))) return { changed:false, skipped:"Directory row missing" };
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(record.source_row);
  if (rowNumber < 2 || rowNumber > sheet.getLastRow()) return { changed:false, skipped:"Directory row missing" };
  const headers = getHeaderMap_(sheet);
  const values = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  const original = values.slice();
  const accountKey = directoryFillHeaderKey_(headers, ["account_id", "account id"]);
  const businessKey = directoryFillHeaderKey_(headers, ["business", "business_name"]);
  if (accountKey !== undefined && record.account_id && String(values[headers[accountKey]] || "").trim() !== String(record.account_id).trim()) return { changed:false, skipped:"Directory row changed" };
  if (businessKey !== undefined && record.business && String(values[headers[businessKey]] || "").trim() !== String(record.business).trim()) return { changed:false, skipped:"Directory row changed" };
  const result = directoryApplyContactFillToValues_(values, headers, source, now || new Date());
  if (result.changed) writeChangedRowCells_(sheet, rowNumber, original, values);
  return result;
}

/** Apply many trusted fills from one re-read. The caller already owns the Directory lock. */
function directoryApplyContactFillsBatch_(entries, now) {
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  if (!entries || !entries.length || sheet.getLastRow() < 2) return [];
  const headers = getHeaderMap_(sheet);
  const width = sheet.getLastColumn();
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
  const originals = values.map(row => row.slice());
  const accountKey = directoryFillHeaderKey_(headers, ["account_id", "account id"]);
  const businessKey = directoryFillHeaderKey_(headers, ["business", "business_name"]);
  const changed = new Set();
  const results = entries.map(entry => {
    const record = entry.record || {};
    const index = Number(record.source_row) - 2;
    if (index < 0 || index >= values.length) return { changed:false, skipped:"Directory row missing" };
    const row = values[index];
    if (accountKey !== undefined && record.account_id && String(row[headers[accountKey]] || "").trim() !== String(record.account_id).trim()) return { changed:false, skipped:"Directory row changed" };
    if (businessKey !== undefined && record.business && String(row[headers[businessKey]] || "").trim() !== String(record.business).trim()) return { changed:false, skipped:"Directory row changed" };
    const result = directoryApplyContactFillToValues_(row, headers, entry.source, now);
    if (result.changed) changed.add(index);
    return result;
  });
  // Batch only the changed cells. Directory rows can have staff-owned columns,
  // so bulk-writing a whole row would make a concurrent edit unnecessarily risky.
  const changedByColumn = new Map();
  changed.forEach(index => values[index].forEach((value, column) => {
    if (value === originals[index][column]) return;
    const rows = changedByColumn.get(column) || []; rows.push(index); changedByColumn.set(column, rows);
  }));
  changedByColumn.forEach((rows, column) => rows.sort((a, b) => a - b).forEach((index, position, all) => {
    if (position && index === all[position - 1] + 1) return;
    let end = index;
    while (all.includes(end + 1)) end += 1;
    sheet.getRange(index + 2, column + 1, end - index + 1, 1).setValues(values.slice(index, end + 1).map(row => [row[column]]));
  }));
  return results;
}

function directoryApplyFillToRecordCopy_(record, source, now) {
  const headers = {};
  const values = [];
  Object.keys(record.row || {}).forEach((key, index) => { headers[key] = index; values.push(record.row[key]); });
  return directoryApplyContactFillToValues_(values, headers, source, now);
}

function directoryIdentityAdd_(identity, input, accountId, sourceRow) {
  const record = { account_id:accountId, source_row:sourceRow, business:input.business_name, email:String(input.email || "").toLowerCase(), city:input.city, row:input, pending_add:true };
  identity.by_id.set(accountId, record); identity.by_row.set(sourceRow, record); identity.rows.push(input);
  if (record.email) { const email = identity.by_email.get(record.email) || []; email.push(record); identity.by_email.set(record.email, email); }
  const key = `${normalizeBusinessKey_(record.business)}::${normalizeBusinessKey_(record.city)}`;
  const matches = identity.by_business_city.get(key) || []; matches.push(record); identity.by_business_city.set(key, matches);
  return record;
}

const DOR_LIQUOR_URL = "https://ww2.revenue.wi.gov/WebServicesPublicWeb/rest/liquor/all";
// DOR's "rn" is only a row position inside one search (rn_low pages on it): the Class A and Class B pulls both
// number from 1, and the same license moves position as licenses come and go. DOR returns no license ID, so a
// license is identified by its own details (Claude, checked live 2026-11-20).
const DOR_LICENSE_LEADS_HEADERS = ["License Key", "Business Name", "Agent", "Street", "City", "ZIP", "License Types", "Last Updated", "Result", "Processed At"];
const DOR_LAST_UPDATED_PROPERTY = "DIRECTORY_DOR_LAST_UPDATED";
const DOR_ADD_RADIUS_PROPERTY = "DIRECTORY_DOR_ADD_RADIUS";
function dorPageRows_(payload) {
  if (!payload || String(payload.result || "").toLowerCase() !== "ok") throw new Error("DOR liquor list did not return Ok.");
  if (!Array.isArray(payload.subject) || !Number.isFinite(Number(payload.count))) throw new Error("DOR liquor list returned an unexpected page.");
  return { rows:payload.subject, count:Number(payload.count) };
}
function dorKeyText_(value) {
  return String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}
/** Stable identity for one DOR license record: legal name, trade name, street, ZIP and municipality. Never rn. */
function dorLicenseKey_(item) {
  return [
    directoryQualityBusinessKey_(item && item.entityName),
    directoryQualityBusinessKey_(item && item.businessName),
    dorKeyText_(item && item.address),
    String(item && item.zip || "").replace(/\D/g, "").slice(0, 5),
    dorKeyText_(item && item.municipality),
  ].join("|");
}
/** Liquor licensees only, one record per license key. A licensee in both pulls keeps both liquor flags. */
function dorLiquorRecords_(records) {
  const byKey = new Map();
  (records || []).forEach(row => {
    if (!row || !(String(row.AL) === "1" || String(row.BL) === "1")) return;
    const key = dorLicenseKey_(row);
    if (!key.replace(/\|/g, "")) return;
    const existing = byKey.get(key);
    if (!existing) { byKey.set(key, Object.assign({}, row, { license_key:key })); return; }
    const newer = String(row.lastUpdated || "") > String(existing.lastUpdated || "") ? row : existing;
    const merged = Object.assign({}, newer, { license_key:key });
    ["AB", "AC", "AL", "BB", "BL", "CW"].forEach(flag => { merged[flag] = String(existing[flag]) === "1" || String(row[flag]) === "1" ? 1 : 0; });
    byKey.set(key, merged);
  });
  return Array.from(byKey.values());
}
const DOR_PAGE_SIZE = 250;
const DOR_FETCH_BATCH = 20;
function dorLiquorUrl_(flag, low) {
  // sort=0 (DOR's default) orders ties differently on every request, so its pages overlap and skip records (checked
  // live 2026-11-20: 3,835 of 3,849 Class A licensees). sort=1 gave the same complete list on every pull.
  return `${DOR_LIQUOR_URL}?search=&city=&sort=1&AB=0&AC=0&AL=${flag === "AL" ? 1 : 0}&BB=0&BL=${flag === "BL" ? 1 : 0}&CW=0&rn_low=${low}`;
}
function dorFetchedPage_(response, url) {
  const code = response.getResponseCode();
  if (code !== 200) throw new Error(`DOR liquor list returned HTTP ${code} for ${url}`);
  return dorPageRows_(JSON.parse(response.getContentText()));
}
/** A record's full content without its row position: the same record on two pages is a paging error. */
function dorRecordFingerprint_(row) {
  return JSON.stringify(Object.keys(row || {}).filter(key => key !== "rn").sort().map(key => [key, row[key]]));
}
/**
 * Checks one pull. Returns { problem, repeats }: the problem ("" when fine) and the records that appear on more than
 * one page. A paging error shows up as a cross-page repeat; DOR also stores a few records twice, which show up the
 * same way on every pull, so the caller compares repeats between two pulls before trusting them.
 */
function dorPullProblem_(pages, count) {
  const rows = [].concat.apply([], pages.map(page => page.rows));
  if (rows.length !== count) return { problem:`${rows.length} of ${count} licenses`, repeats:[] };
  const misplaced = pages.filter(page => page.rows.length && Number(page.rows[0].rn) !== page.low + 1).length;
  if (misplaced) return { problem:`${misplaced} page(s) didn't start at the row asked for`, repeats:[] };
  const pagesByRecord = new Map();
  pages.forEach((page, index) => page.rows.forEach(row => {
    const key = dorRecordFingerprint_(row);
    pagesByRecord.set(key, (pagesByRecord.get(key) || new Set()).add(index));
  }));
  const repeats = Array.from(pagesByRecord.entries()).filter(([, onPages]) => onPages.size > 1).map(([key]) => key).sort();
  return { problem:repeats.length ? `${repeats.length} record(s) appeared on two pages` : "", repeats:repeats };
}
/**
 * Both liquor pulls, all pages. The first page of each gives the count; the rest are fetched in parallel batches
 * (one page at a time took most of Apps Script's 6 minutes on 2026-11-20). Each pull is checked before use: from
 * Google's servers, DOR has returned overlapping pages (the licensee count varied by ~30 between runs). A pull that
 * fails the check is fetched again one page at a time; if that fails too, nothing is used.
 */
function fetchDorLiquorRecords_() {
  const started = Date.now();
  const all = []; const retried = [];
  ["AL", "BL"].forEach(flag => {
    const firstUrl = dorLiquorUrl_(flag, 0);
    const first = dorFetchedPage_(UrlFetchApp.fetch(firstUrl, { muteHttpExceptions:true }), firstUrl);
    const lows = [];
    for (let low = DOR_PAGE_SIZE; low < first.count; low += DOR_PAGE_SIZE) lows.push(low);
    const firstPage = { low:0, rows:first.rows };
    const parallel = () => {
      const pages = [firstPage];
      for (let index = 0; index < lows.length; index += DOR_FETCH_BATCH) {
        const batch = lows.slice(index, index + DOR_FETCH_BATCH);
        UrlFetchApp.fetchAll(batch.map(low => ({ url:dorLiquorUrl_(flag, low), muteHttpExceptions:true }))).forEach((response, offset) => {
          const page = dorFetchedPage_(response, dorLiquorUrl_(flag, batch[offset]));
          if (!page.rows.length) throw new Error("DOR liquor list paging stopped early.");
          pages.push({ low:batch[offset], rows:page.rows });
        });
      }
      return pages;
    };
    const sequential = () => [firstPage].concat(lows.map(low => {
      const url = dorLiquorUrl_(flag, low);
      return { low:low, rows:dorFetchedPage_(UrlFetchApp.fetch(url, { muteHttpExceptions:true }), url).rows };
    }));
    let pages = parallel();
    const check = dorPullProblem_(pages, first.count);
    if (check.problem) {
      retried.push(`${flag}: ${check.problem}`);
      pages = sequential();
      const recheck = dorPullProblem_(pages, first.count);
      // The same cross-page repeats on both pulls are records DOR stores twice, not paging errors.
      const sameRepeats = !!recheck.repeats.length && recheck.repeats.join("\n") === check.repeats.join("\n");
      if (recheck.problem && !sameRepeats) throw new Error(`DOR ${flag} pull was inconsistent twice (${recheck.problem}); nothing was used.`);
    }
    pages.forEach(page => all.push.apply(all, page.rows));
  });
  const records = dorLiquorRecords_(all);
  console.log(JSON.stringify({ event:"dor_liquor_fetch", raw:all.length, licensees:records.length, retried:retried, seconds:Math.round((Date.now() - started) / 1000) }));
  return records;
}
function dorLicenseExpired_(item, now) {
  const value = String(item?.expireDate || item?.expirationDate || "").trim();
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < new Date(now).setHours(0, 0, 0, 0);
}
function dorPossiblyClosedEntries_(logSheet, logHeaders, records, identity, now) {
  if (!logSheet || logSheet.getLastRow() < 2 || logHeaders.license_key === undefined) return [];
  const liveByKey = new Map((records || []).map(item => [String(item.license_key || dorLicenseKey_(item)), item]));
  const businessKey = ["business_name", "business"].find(key => logHeaders[key] !== undefined);
  const cityKey = ["city"].find(key => logHeaders[key] !== undefined);
  const zipKey = ["zip"].find(key => logHeaders[key] !== undefined);
  const seen = new Set();
  return logSheet.getRange(2, 1, logSheet.getLastRow() - 1, logSheet.getLastColumn()).getValues().map(row => {
    const licenseKey = String(row[logHeaders.license_key] || "").trim(); const live = liveByKey.get(licenseKey);
    if (!licenseKey || (live && !dorLicenseExpired_(live, now))) return null;
    const business = businessKey ? String(row[logHeaders[businessKey]] || "") : "";
    const city = cityKey ? String(row[logHeaders[cityKey]] || "") : "";
    const zip = zipKey ? String(row[logHeaders[zipKey]] || "") : "";
    const miles = milesForZip_(zip); if (!Number.isFinite(miles) || miles > outreachServiceAreaMiles_()) return null;
    const record = findIdentityMatch_(identity, "", business, "", city).record;
    if (!record || seen.has(record.source_row)) return null;
    seen.add(record.source_row);
    return { record:record, source:{ label:"WI DOR license list", note:`Possibly closed: WI DOR liquor license for ${business || "this business"} (${city}) is ${live ? "expired" : "no longer listed"}.` } };
  }).filter(Boolean);
}
function processDorLiquorLicenses_(options) {
  const dryRun = !!options?.dryRun; const now = options?.now || new Date();
  const records = dorLiquorRecords_(options?.records || fetchDorLiquorRecords_()).sort((a, b) => String(a.lastUpdated || "").localeCompare(String(b.lastUpdated || "")) || String(a.license_key).localeCompare(String(b.license_key)));
  // "No longer listed" is only trustworthy against a complete pull. fetchDorLiquorRecords_ throws rather than return
  // a partial list; callers passing records say so with complete_pull:false.
  const completePull = options?.complete_pull !== false;
  const ss = getOutreachSs_(); const logSheet = dryRun ? ss.getSheetByName(LICENSE_LEADS_SHEET_NAME) : ensureSheet_(ss, LICENSE_LEADS_SHEET_NAME, DOR_LICENSE_LEADS_HEADERS);
  const identity = options?.identity || accountIdentityLookup_(); const directory = options?.directory || getOutreachSheet_(OUTREACH_SHEET_NAME); const props = PropertiesService.getScriptProperties();
  const lastUpdated = String(props.getProperty(DOR_LAST_UPDATED_PROPERTY) || ""); const h = logSheet ? getHeaderMap_(logSheet) : {};
  const seen = new Set(!logSheet || logSheet.getLastRow() < 2 ? [] : logSheet.getRange(2, 1, logSheet.getLastRow() - 1, logSheet.getLastColumn()).getValues().map(row => `${row[h.license_key]}::${row[h.last_updated]}`));
  const fills = [], adds = [], logRows = [], examples = { would_add:[], would_fill:[], differences:[], possibly_closed:[] };
  // A preview lists everything so Karl and Claude can check the whole first run; a real run keeps 25 of each.
  const exampleCap = dryRun ? Infinity : 25;
  let outside = 0, skipped = 0, newest = lastUpdated, stopped = false;
  const serviceArea = outreachServiceAreaMiles_(); const shouldStop = options?.shouldStop || (() => false);
  // Licensees beyond the new-business radius aren't logged, and a larger radius than last run's ignores the
  // high-water mark once, so raising the setting later reaches the licenses skipped before.
  const addRadius = options?.add_radius_miles ?? outreachNewBusinessRadiusMiles_();
  const storedRadius = Number(props.getProperty(DOR_ADD_RADIUS_PROPERTY));
  const checkpoint = Number.isFinite(storedRadius) && addRadius > storedRadius ? "" : lastUpdated;
  let beyondAddRadius = 0;
  // Read once: getLastRow, formatDate and getUuid are slow service calls, and a first run plans thousands of adds.
  const directoryLastRow = directory.getLastRow();
  const todayText = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
  // Street + ZIP index for the third match attempt (Directory columns "Street Address" and "Zip Code").
  const addressKey = (street, zip) => { const a = dorKeyText_(street); const z = String(zip || "").replace(/\D/g, "").slice(0, 5); return a && z ? `${a}::${z}` : ""; };
  const byAddress = new Map();
  identity.by_row.forEach(record => {
    const key = addressKey(outreachValue_(record.row || {}, ["street_address", "address", "street"]), outreachValue_(record.row || {}, ["zip_code", "zip", "postal_code"]));
    if (key && !byAddress.has(key)) byAddress.set(key, record);
  });
  records.forEach(item => {
    if (stopped) return;
    const updated = String(item.lastUpdated || ""); const key = `${item.license_key}::${updated}`;
    // The log is the per-license checkpoint. Keep rows sharing the high-water
    // timestamp eligible so a stop between two same-time records can resume.
    if (seen.has(key) || (checkpoint && updated < checkpoint)) { skipped++; return; }
    if (!dryRun && shouldStop()) { stopped = true; return; }
    if (dorLicenseExpired_(item, now)) { skipped++; newest = updated > newest ? updated : newest; return; }
    const miles = milesForZip_(String(item.zip || "")); if (!Number.isFinite(miles) || miles > serviceArea) { outside++; newest = updated > newest ? updated : newest; return; }
    const match = findIdentityMatch_(identity, "", item.businessName, "", item.city).record || findIdentityMatch_(identity, "", item.entityName, "", item.city).record || byAddress.get(addressKey(item.address, item.zip)) || null;
    const types = [String(item.AL) === "1" && "Class A liquor", String(item.BL) === "1" && "Class B liquor"].filter(Boolean).join(", ");
    const agent = dorCleanPersonName_(item.agentName);
    const source = { contact:agent, label:"WI DOR license list", fields:{ street:item.address, city:item.city, zip:item.zip } };
    let result = "Matched, nothing to fill";
    if (match && match.pending_add) { skipped++; result = "Skipped duplicate"; }
    else if (match) {
      const preview = directoryApplyFillToRecordCopy_(match, source, now);
      fills.push({ record:match, source:source, preview:preview });
      if (preview.changed) { result = "Filled contact"; if (examples.would_fill.length < exampleCap) examples.would_fill.push({ license_key:item.license_key, business:match.business, city:item.city, detail:(preview.details || []).join(" ") }); }
      if (preview.conflicts?.length && examples.differences.length < exampleCap) examples.differences.push({ license_key:item.license_key, business:match.business, city:item.city, conflicts:preview.conflicts });
    } else if (miles > addRadius) {
      beyondAddRadius++; newest = updated > newest ? updated : newest; return;
    } else {
      try {
        const input = validateBusinessInput_({ business_name:item.businessName || item.entityName, contact:agent, city:item.city, address:item.address, zip:item.zip, state:"WI", county:item.county, lead_source:"WI DOR license list", relationship:"Prospect", status:"Needs email", notes:`${todayText} - WI DOR license: ${types}.` });
        const duplicate = duplicateBusiness_(identity, input);
        if (duplicate) { skipped++; result = "Skipped duplicate"; }
        else {
          const accountId = dryRun ? `ACC-PREVIEW-${adds.length + 1}` : permanentId_("ACC"); const sourceRow = directoryLastRow + adds.length + 1;
          adds.push({ input:input, account_id:accountId }); const added = directoryIdentityAdd_(identity, input, accountId, sourceRow);
          const addedKey = addressKey(input.address, input.postal_code); if (addedKey && !byAddress.has(addedKey)) byAddress.set(addedKey, added);
          result = "Added"; if (examples.would_add.length < exampleCap) examples.would_add.push({ license_key:item.license_key, business:input.business_name, city:input.city, miles:miles, detail:[`${miles} mi`, types, agent ? `agent ${agent}` : "", item.address].filter(Boolean).join("; ") });
        }
      } catch (error) { skipped++; result = `Skipped: ${String(error.message || error).slice(0, 200)}`; }
    }
    newest = updated > newest ? updated : newest;
    if (!dryRun) logRows.push([String(item.license_key), item.businessName || item.entityName || "", item.agentName || "", item.address || "", item.city || "", item.zip || "", types, updated, result, now]);
  });
  const closedEntries = completePull ? dorPossiblyClosedEntries_(logSheet, h, records, identity, now) : [];
  const previews = fills.map(fill => fill.preview); let applied = previews; let closedApplied = closedEntries.map(entry => directoryApplyFillToRecordCopy_(entry.record, entry.source, now));
  closedEntries.forEach((entry, index) => { if (closedApplied[index]?.changed && examples.possibly_closed.length < exampleCap) examples.possibly_closed.push({ business:entry.record.business, city:entry.record.city, detail:entry.source.note }); });
  if (!dryRun) {
    applied = directoryApplyContactFillsBatch_(fills.map(fill => ({ record:fill.record, source:fill.source })), now);
    closedApplied = directoryApplyContactFillsBatch_(closedEntries, now);
    if (adds.length) {
      const directoryHeaders = getHeaderMap_(directory); const directoryWidth = directory.getLastColumn();
      directory.getRange(directory.getLastRow() + 1, 1, adds.length, directoryWidth).setValues(adds.map(add => directoryRowFromBusiness_(directory, add.input, add.account_id, now, directoryHeaders, directoryWidth)));
    }
    if (logRows.length) logSheet.getRange(logSheet.getLastRow() + 1, 1, logRows.length, logRows[0].length).setValues(logRows);
    if (newest && newest > lastUpdated) props.setProperty(DOR_LAST_UPDATED_PROPERTY, newest);
    if (!stopped) props.setProperty(DOR_ADD_RADIUS_PROPERTY, String(addRadius));
  }
  const filled = applied.filter(fill => fill.changed).length;
  const differences = applied.reduce((sum, fill) => sum + (fill.conflicts?.length || 0), 0);
  const addMiles = examples.would_add.map(item => Number(item.miles)).filter(Number.isFinite);
  const added_by_miles = [15, 30, 45, 60].reduce((bands, limit) => { bands[limit] = addMiles.filter(value => value <= limit).length; return bands; }, {});
  return { added_by_miles:added_by_miles, add_radius_miles:addRadius, beyond_add_radius:beyondAddRadius, records:records.length, filled:filled, added:adds.length, differences:differences, outside:outside, skipped:skipped, possibly_closed:closedApplied.filter(item => item.changed).length, complete:!stopped, stopped:stopped, last_updated:newest, examples:examples };
}

/** Builds the quality report from rows already read from the Directory. It never writes. */
function directoryQualityReportFromRows_(rows, options) {
  const configuredMiles = Number(options && options.service_area_miles);
  const serviceAreaMiles = Number.isFinite(configuredMiles) && configuredMiles >= 0 ? configuredMiles : OUTREACH_DEFAULT_SERVICE_AREA_MILES;
  const categories = {
    no_email:{ label:"No email", rows:[] },
    bad_email:{ label:"Bad email still on file", rows:[] },
    no_contact:{ label:"No contact name", rows:[] },
    placeholder_contact:{ label:"Placeholder contact name", rows:[] },
    duplicates:{ label:"Possible duplicates", rows:[] },
    no_distance:{ label:"No distance", rows:[] },
  };
  const allRecords = (rows || []).map((row, index) => directoryQualityIssueRecord_(row, row.source_row || index + 2)).filter(record => record.business && !record.excluded);
  const records = [];
  const add = (name, record, detail) => {
    const item = { name:record.business, row:record.source_row, account_id:record.account_id, customer:record.customer, detail:detail || "" };
    categories[name].rows.push(item);
  };
  const outsideServiceArea = { count:0, blank_miles:0, beyond_miles:0, service_area_miles:serviceAreaMiles };
  allRecords.forEach(record => {
    if (record.customer) {
      records.push(record);
      return;
    }
    if (record.miles === null) {
      outsideServiceArea.count += 1;
      outsideServiceArea.blank_miles += 1;
      // A ZIP without a usable centroid is an automatic mileage repair, not a statewide lead for Karl.
      if (!directoryQualityHasUsableZip_(record)) add("no_distance", record, "No usable ZIP");
      return;
    }
    if (record.miles > serviceAreaMiles) {
      outsideServiceArea.count += 1;
      outsideServiceArea.beyond_miles += 1;
      return;
    }
    records.push(record);
  });
  records.forEach(record => {
    if (!record.email) add("no_email", record);
    if (record.outcome === "Bad address" && record.status === "Needs email" && record.email) add("bad_email", record, "Bad address still in Email");
    if (!record.contact) add("no_contact", record);
    if (directoryQualityPlaceholderContact_(record)) add("placeholder_contact", record);
  });
  const byNameCity = new Map();
  const byPhone = new Map();
  records.forEach(record => {
    const business = directoryQualityBusinessKey_(record.business);
    const city = directoryQualityBusinessKey_(record.city);
    const nameKey = business && city ? `${business}::${city}` : "";
    const phoneKey = directoryQualityPhoneKey_(record.phone);
    if (nameKey) { if (!byNameCity.has(nameKey)) byNameCity.set(nameKey, []); byNameCity.get(nameKey).push(record); }
    if (phoneKey) { if (!byPhone.has(phoneKey)) byPhone.set(phoneKey, []); byPhone.get(phoneKey).push(record); }
  });
  const duplicateDetails = new Map();
  const markDuplicates = (groups, detail) => groups.forEach(group => {
    const identities = new Set(group.map(record => record.account_id || `row:${record.source_row}`));
    if (identities.size < 2) return;
    group.forEach(record => {
      const key = record.source_row;
      if (!duplicateDetails.has(key)) duplicateDetails.set(key, { record:record, details:new Set() });
      duplicateDetails.get(key).details.add(detail);
    });
  });
  markDuplicates(byNameCity, "same business name and city");
  markDuplicates(byPhone, "same phone number");
  duplicateDetails.forEach(item => add("duplicates", item.record, Array.from(item.details).join("; ")));
  Object.keys(categories).forEach(name => {
    const category = categories[name];
    category.rows.sort((a, b) => String(a.name).localeCompare(String(b.name)) || a.row - b.row);
    category.count = category.rows.length;
    category.prospects = category.rows.filter(item => !item.customer).length;
    category.customers = category.rows.filter(item => item.customer).length;
  });
  const total = Object.keys(categories).reduce((sum, name) => sum + categories[name].count, 0);
  return { categories:categories, total:total, records:records, outside_service_area:outsideServiceArea };
}

function directoryQualityHasUsableZip_(record) {
  const zip = normalizeZip_(record && record.postal_code);
  return !!zip && milesForZip_(zip) !== null;
}

function directoryQualityBadEmailItems_(rows) {
  return (rows || [])
    .map((row, index) => directoryQualityIssueRecord_(row, row.source_row || index + 2))
    .filter(record => record.business && !record.excluded && record.outcome === "Bad address" && record.status === "Needs email" && record.email)
    .map(record => ({ name:record.business, row:record.source_row, account_id:record.account_id, customer:record.customer, detail:"Bad address still in Email" }));
}

function directoryQualityNote_(email, now) {
  return `${Utilities.formatDate(now || new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd")} - Bad email (bounced): ${String(email || "").trim().toLowerCase()}`;
}

/** Fills blank automatic Miles values without touching a staff-entered manual distance. */
function directoryQualityFillBlankMiles_(sheet, headers, rows) {
  const zipKey = ["zip", "zip_code", "postal_code"].find(key => headers[key] !== undefined);
  const milesKey = ["miles", "distance", "distance_miles"].find(key => headers[key] !== undefined);
  const sourceKey = ["miles_source"].find(key => headers[key] !== undefined);
  const counts = { updated:0, manual_kept:0, no_zip:0, unknown_zip:0, unknown_zips:[] };
  if (!zipKey || !milesKey) return counts;
  const unknown = new Set();
  rows.forEach((row, index) => {
    if (outreachMiles_(row[milesKey]) !== null) return;
    if (sourceKey && String(row[sourceKey] || "").trim().toLowerCase() === "manual") {
      counts.manual_kept += 1;
      return;
    }
    const zip = normalizeZip_(row[zipKey]);
    if (!zip) {
      counts.no_zip += 1;
      return;
    }
    const miles = milesForZip_(zip);
    if (miles === null) {
      counts.unknown_zip += 1;
      unknown.add(zip);
      return;
    }
    const sourceRow = index + 2;
    sheet.getRange(sourceRow, headers[milesKey] + 1).setValue(miles);
    if (sourceKey) sheet.getRange(sourceRow, headers[sourceKey] + 1).setValue("zip");
    row[milesKey] = miles;
    if (sourceKey) row[sourceKey] = "zip";
    counts.updated += 1;
  });
  counts.unknown_zips = Array.from(unknown).sort();
  return counts;
}

/** One weekly Directory pass. It fills blank automatic Miles and moves only verified hard-bounced addresses. */
function directoryQualityCheck_(options) {
  const dryRun = !!options?.dryRun;
  const now = options?.now ? new Date(options.now) : new Date();
  const startedAt = Date.now();
  // External work must happen before acquiring the Directory lock. A slow DOR
  // response must never block staff from logging a reply or sending a campaign.
  let badgerCustomers, dorRecords, badgerSourceError = "", dorSourceError = "";
  try { badgerCustomers = badgerCustomerRows_(); } catch (error) { badgerSourceError = String(error.message || error); }
  try { dorRecords = fetchDorLiquorRecords_(); } catch (error) { dorSourceError = String(error.message || error); }
  console.log(JSON.stringify({ event:"directory_quality_sources", seconds:Math.round((Date.now() - startedAt) / 1000), badger_error:badgerSourceError, dor_error:dorSourceError }));
  const lock = dryRun ? null : LockService.getScriptLock();
  if (lock && !lock.tryLock(30000)) throw new Error("Another directory update is in progress. Try again in a moment.");
  try {
    const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const headers = getHeaderMap_(sheet);
    const rows = getAllRowsAsObjects_(sheet);
    const settings = getOutreachCampaignSettings_();
    const reportOptions = { service_area_miles:outreachServiceAreaMiles_(settings) };
    const mileage = dryRun ? { updated:0, manual_kept:0, no_zip:0, unknown_zip:0, unknown_zips:[] } : directoryQualityFillBlankMiles_(sheet, headers, rows);
    let badger, dor;
    try { badger = badgerSourceError ? { error:badgerSourceError } : processBadgerCustomers_({ dryRun:dryRun, customers:badgerCustomers }); } catch (error) { badger = { error:String(error.message || error) }; }
    try {
      dor = dorSourceError ? { error:dorSourceError } : processDorLiquorLicenses_({
        dryRun:dryRun, records:dorRecords, directory:sheet, identity:accountIdentityFromRows_(rows.slice()), now:now,
        shouldStop:() => !dryRun && Date.now() - startedAt >= DIRECTORY_QUALITY_MAX_RUN_MS,
      });
    } catch (error) { dor = { error:String(error.message || error) }; }
    let report = directoryQualityReportFromRows_(rows, reportOptions);
    const moved = [];
    const notesKey = ["notes"].find(key => headers[key] !== undefined);
    const emailKey = ["email", "email_address"].find(key => headers[key] !== undefined);
    const businessKey = ["business", "business_name"].find(key => headers[key] !== undefined);
    directoryQualityBadEmailItems_(rows).forEach(item => {
      const row = rows[item.row - 2];
      const email = String(row && outreachValue_(row, ["email", "email_address"]) || "").trim();
      if (!email) return;
      if (dryRun) {
        moved.push(Object.assign({}, item, { email:email }));
        return;
      }
      // Rows can move while this job is waiting on another writer. Under the lock, check identity again before clearing Email.
      if (!notesKey || !emailKey || !businessKey) return;
      const liveValues = sheet.getRange(item.row, 1, 1, sheet.getLastColumn()).getValues()[0];
      const liveBusiness = String(liveValues[headers[businessKey]] || "").trim();
      const liveEmail = String(liveValues[headers[emailKey]] || "").trim();
      if (liveBusiness !== item.name || liveEmail.toLowerCase() !== email.toLowerCase()) return;
      const notes = String(liveValues[headers[notesKey]] || "").trim();
      const nextNotes = [notes, directoryQualityNote_(email, now)].filter(Boolean).join("\n");
      sheet.getRange(item.row, headers[notesKey] + 1).setValue(nextNotes);
      sheet.getRange(item.row, headers[emailKey] + 1).setValue("");
      row[notesKey] = nextNotes;
      row[emailKey] = "";
      moved.push(Object.assign({}, item, { email:email }));
    });
    if (!dryRun && (moved.length || mileage.updated)) {
      report = directoryQualityReportFromRows_(rows, reportOptions);
      bumpReadCacheVersion_(["outreach"]);
    }
    if (!dryRun && moved.length) {
      appendAudit_("DIRECTORY_QUALITY_BAD_EMAILS_MOVED", "Directory", "weekly-check", "", "System", OUTREACH_SHEET_NAME, OUTREACH_SHEET_NAME, "Completed", `${moved.length} address(es) moved: ${moved.map(item => `${item.name} (row ${item.row})`).join(", ")}`);
    }
    const result = { ran_at:now.toISOString(), dry_run:dryRun, complete:!dor || dor.complete !== false, moved_bad_emails:moved, mileage:mileage, badger:badger, dor:dor, report:report };
    if (!dryRun) PropertiesService.getScriptProperties().setProperty("DIRECTORY_QUALITY_LAST_SUMMARY", JSON.stringify({ badger:badger, dor:dor, ran_at:result.ran_at }).slice(0, 8000));
    console.log(JSON.stringify({ event:"directory_quality_check", dry_run:dryRun, total:report.total, outside_service_area:report.outside_service_area.count, moved_bad_emails:moved.length, mileage:mileage, businesses:moved.map(item => item.name) }));
    return result;
  } finally {
    if (lock) lock.releaseLock();
  }
}

function runDirectoryQualityCheck() { return directoryQualityCheck_({}); }
/** Editor command for Karl to run again until the initial DOR catch-up completes. */
function runDirectoryQualityCheckNow() { return directoryQualityCheck_({}); }
/**
 * Editor command: runs the weekly check and the reply-note backfill without changing the Directory, and writes
 * everything they would do to the "Directory Preview" tab (rewritten each time) so it can be checked in full.
 */
function previewDirectoryQualityCheck() {
  const started = Date.now();
  const quality = directoryQualityCheck_({ dryRun:true });
  console.log(JSON.stringify({ event:"directory_preview_quality_done", seconds:Math.round((Date.now() - started) / 1000) }));
  let backfill;
  try { backfill = backfillDirectoryReplyContacts_(true); } catch (error) { backfill = { error:String(error.message || error) }; }
  const rows = directoryPreviewRows_(quality, backfill);
  const sheet = ensureSheet_(getOutreachSs_(), DIRECTORY_PREVIEW_SHEET_NAME, DIRECTORY_PREVIEW_HEADERS);
  sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), DIRECTORY_PREVIEW_HEADERS.length).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, DIRECTORY_PREVIEW_HEADERS.length).setValues(rows);
  console.log(`Directory preview written: ${rows.length} rows in the "${DIRECTORY_PREVIEW_SHEET_NAME}" tab.`);
  return { rows:rows.length, quality:quality, backfill:backfill };
}
const DIRECTORY_PREVIEW_SHEET_NAME = "Directory Preview";
const DIRECTORY_PREVIEW_HEADERS = ["Section", "Business", "City", "Detail"];
/** Flattens the preview results into tab rows: a count line per section, then one line per business. */
function directoryPreviewRows_(quality, backfill) {
  const rows = [];
  const text = value => String(value === undefined || value === null ? "" : value).slice(0, 2000);
  const section = (name, items, map) => {
    const list = Array.isArray(items) ? items : [];
    rows.push([name, `${list.length} total`, "", ""]);
    list.forEach(item => rows.push([name].concat(map(item).map(text))));
  };
  const sourceError = (name, source) => { if (source && source.error) rows.push([name, "ERROR", "", text(source.error)]); };
  const dor = quality && quality.dor || {}; const badger = quality && quality.badger || {}; const examples = dor.examples || {};
  rows.push(["Summary", "Previewed at", "", text(quality && quality.ran_at)]);
  rows.push(["Summary", "DOR liquor licensees read", "", text(dor.records)]);
  rows.push(["Summary", "DOR outside the service area", "", text(dor.outside)]);
  rows.push(["Summary", "Blank Miles fillable from ZIP", "", text(quality && quality.mileage && quality.mileage.updated)]);
  rows.push(["Summary", "New business radius (miles, straight line)", "", text(dor.add_radius_miles)]);
  rows.push(["Summary", "DOR licensees not yet in the Directory beyond that radius (not added)", "", text(dor.beyond_add_radius)]);
  Object.keys(dor.added_by_miles || {}).filter(limit => Number(limit) <= Number(dor.add_radius_miles)).forEach(limit => rows.push(["Summary", `DOR would add within ${limit} miles`, "", text(dor.added_by_miles[limit])]));
  sourceError("DOR", dor); sourceError("Badger", badger); sourceError("Reply backfill", backfill);
  section("DOR: would add", examples.would_add, item => [item.business, item.city, item.detail]);
  section("DOR: would fill", examples.would_fill, item => [item.business, item.city, item.detail]);
  section("DOR: differences noted", examples.differences, item => [item.business, item.city, (item.conflicts || []).join("; ")]);
  section("DOR: possibly closed", examples.possibly_closed, item => [item.business, item.city, item.detail]);
  section("Badger: would fill", (badger.examples || []).filter(item => item.fill && (item.fill.email_filled || item.fill.contact_filled || (item.fill.details || []).some(line => / - Filled /.test(line)))), item => [item.business, "", (item.fill.details || []).join(" ")]);
  section("Badger: differences noted", (badger.examples || []).filter(item => item.fill && item.fill.conflicts && item.fill.conflicts.length), item => [item.business, "", item.fill.conflicts.join("; ")]);
  section("Bounced emails to move to Notes", quality && quality.moved_bad_emails, item => [item.name, "", item.email]);
  section("Reply notes: would fill", backfill && backfill.examples, item => [item.business, "", item.detail || [item.email ? "email" : "", item.contact ? "contact" : ""].filter(Boolean).join(" and ")]);
  return rows;
}
const DIRECTORY_QUALITY_TRIGGER_HANDLER = "runScheduledDirectoryQualityCheck";
function installDirectoryQualityCheck() {
  ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === DIRECTORY_QUALITY_TRIGGER_HANDLER).forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(DIRECTORY_QUALITY_TRIGGER_HANDLER).timeBased().inTimezone(Session.getScriptTimeZone() || "America/Chicago").onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).nearMinute(20).create();
  return { message:"Weekly Directory quality check installed for Monday about 6:20 AM Central." };
}
function runScheduledDirectoryQualityCheck() { return maybeRunDirectoryQualityCheck_(new Date()); }

function maybeRunDirectoryQualityCheck_(now) {
  const date = now instanceof Date ? now : new Date();
  const week = taskManagerSlot_(date, Session.getScriptTimeZone() || "America/Chicago").weekId;
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty(DIRECTORY_QUALITY_LAST_RUN_PROPERTY) === week) return { skipped:"Already checked this week.", week:week };
  const result = directoryQualityCheck_({ now:date });
  if (result.complete !== false) properties.setProperty(DIRECTORY_QUALITY_LAST_RUN_PROPERTY, week);
  return result;
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
    const sameEmail = identity.by_email.get(normalizedEmail);
    const matches = sameEmail.filter(record => !normalizedBusiness || normalizeBusinessKey_(record.business) === normalizedBusiness);
    if (matches.length === 1) return { record:matches[0], status:"Email and business matched" };
    // Only one business uses this email: it's that business, even if the name is written differently.
    if (sameEmail.length === 1) return { record:sameEmail[0], status:"Email matched" };
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
  const rowCount = sheet.getLastRow() - 1;
  // Read the full rows for matching, but write back only the Account ID column so
  // existing validation, formulas, and unrelated cells are never rewritten.
  const rows = sheet.getRange(2, 1, rowCount, sheet.getLastColumn()).getValues();
  const accountIdValues = rows.map(row => [row[h.account_id]]);
  const businessKey = (options?.business_keys || ["business", "business_name"]).find(key => h[key] !== undefined);
  const emailKey = (options?.email_keys || ["email", "primary_email", "intended_recipient"]).find(key => h[key] !== undefined);
  const cityKey = (options?.city_keys || ["city", "delivery_city"]).find(key => h[key] !== undefined);
  let changed = 0;
  rows.forEach((row, index) => {
    if (String(row[h.account_id] || "").trim()) return;
    const sourceRow = h.source_row !== undefined ? Number(row[h.source_row] || 0) : 0;
    let match = sourceRow ? identity.by_row.get(sourceRow) : null;
    if (!match) {
      const result = findIdentityMatch_(identity, "", businessKey ? row[h[businessKey]] : "", emailKey ? row[h[emailKey]] : "", cityKey ? row[h[cityKey]] : "");
      match = result.record;
    }
    if (!match || !match.account_id) return;
    accountIdValues[index][0] = match.account_id;
    changed += 1;
  });
  if (changed) sheet.getRange(2, h.account_id + 1, rowCount, 1).setValues(accountIdValues);
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
      const rowCount = sheet.getLastRow() - 1;
      const rows = sheet.getRange(2, 1, rowCount, sheet.getLastColumn()).getValues();
      const businessKey = h.business_name !== undefined ? "business_name" : (h.business !== undefined ? "business" : "");
      // Only the Account ID and Record Created At columns are written back.
      const accountIdValues = rows.map(row => [row[h.account_id]]);
      const createdAtValues = rows.map(row => [row[h.record_created_at]]);
      let idsChanged = false;
      let createdChanged = false;
      const now = new Date();
      const seenAccountIds = new Set();
      rows.forEach((row, index) => {
        if (!businessKey || !String(row[h[businessKey]] || "").trim()) return;
        if (!String(accountIdValues[index][0] || "").trim()) {
          accountIdValues[index][0] = permanentId_("ACC");
          idsChanged = true;
        }
        const accountId = String(accountIdValues[index][0] || "").trim();
        if (seenAccountIds.has(accountId)) throw new Error(`Duplicate Account ID found on directory row ${index + 2}. Correct it before continuing.`);
        seenAccountIds.add(accountId);
        if (!createdAtValues[index][0]) {
          createdAtValues[index][0] = now;
          createdChanged = true;
        }
      });
      if (idsChanged) sheet.getRange(2, h.account_id + 1, rowCount, 1).setValues(accountIdValues);
      if (createdChanged) sheet.getRange(2, h.record_created_at + 1, rowCount, 1).setValues(createdAtValues);
    }
    const identity = accountIdentityFromRows_(getAllRowsAsObjects_(sheet));
    const backfillResults = [];
    [
      [OUTREACH_DRAFTS_SHEET_NAME, {}],
      [OUTREACH_PROGRAMS_SHEET_NAME, {}],
      [OUTREACH_ENGAGEMENT_SHEET_NAME, {}],
      [OUTREACH_ACTIVITY_SHEET_NAME, { business_keys:["business"], email_keys:["intended_recipient"] }],
      [CUSTOMER_APPLICATIONS_SHEET_NAME, { business_keys:["business_name", "legal_business_name"], email_keys:["primary_email"], city_keys:["delivery_city"] }],
      [ONLINE_ORDER_REQUESTS_SHEET_NAME, { business_keys:["business_name"], email_keys:["email"] }],
      [NEWSLETTER_CONTACTS_SHEET_NAME, { business_keys:["source_business", "organization"], email_keys:["email"] }],
    ].forEach(([sheetName, options]) => {
      // Each related tab is independent: one bad tab is reported, not fatal.
      try {
        const filled = backfillAccountIdsInSheet_(getOutreachSs_().getSheetByName(sheetName), identity, options);
        backfillResults.push({ sheet:sheetName, filled:filled, ok:true });
      } catch (error) {
        const message = String(error && error.message || error);
        console.warn(JSON.stringify({ event:"account_id_backfill_failed", sheet:sheetName, error:message }));
        backfillResults.push({ sheet:sheetName, filled:0, ok:false, error:message });
      }
    });
    const refreshed = accountIdentityFromRows_(getAllRowsAsObjects_(sheet));
    refreshed.backfill_results = backfillResults;
    return refreshed;
  } finally {
    if (lock) lock.releaseLock();
  }
}

function setDirectoryField_(row, headers, aliases, value) {
  const key = aliases.map(normalizeHeader_).find(alias => headers[alias] !== undefined);
  if (key !== undefined) row[headers[key]] = value;
}

function directoryRowFromBusiness_(sheet, p, accountId, now, headers, width) {
  const h = headers || getHeaderMap_(sheet);
  const row = Array(width || sheet.getLastColumn()).fill("");
  setDirectoryField_(row, h, ["Account ID"], accountId);
  setDirectoryField_(row, h, ["Business Name", "Business"], String(p.business_name || p.business || "").trim());
  setDirectoryField_(row, h, ["Contact Person", "Contact"], String(p.contact || p.contact_name || "").trim());
  setDirectoryField_(row, h, ["Email"], String(p.email || "").trim().toLowerCase());
  setDirectoryField_(row, h, ["Phone Number", "Phone"], String(p.phone || "").trim());
  setDirectoryField_(row, h, ["Street Address", "Address"], String(p.address || p.street_address || "").trim());
  setDirectoryField_(row, h, ["City"], String(p.city || "").trim());
  setDirectoryField_(row, h, ["County"], String(p.county || "").trim());
  setDirectoryField_(row, h, ["State"], String(p.state || "WI").trim().toUpperCase());
  setDirectoryField_(row, h, ["Zip Code", "ZIP"], String(p.postal_code || p.zip || "").trim());
  setDirectoryField_(row, h, ["Next Email"], String(p.next_email || "Initial"));
  setDirectoryField_(row, h, ["Status"], String(p.status || (p.email ? "Not contacted" : "Needs email")));
  setDirectoryField_(row, h, ["Priority"], String(p.priority || "Normal"));
  setDirectoryField_(row, h, ["Do Not Email"], toBool_(p.do_not_email));
  setDirectoryField_(row, h, ["Craft-Spirit Fit (1–5)", "Craft-Spirit Fit (1-5)"], String(p.craft_spirit_fit || ""));
  setDirectoryField_(row, h, ["Rating Basis"], String(p.rating_basis || ""));
  const manualMiles = String(p.miles_source || "").trim().toLowerCase() === "manual";
  const zipMiles = manualMiles ? outreachMiles_(p.miles) : milesForZip_(p.postal_code || p.zip);
  setDirectoryField_(row, h, ["Miles"], zipMiles === null ? "" : zipMiles);
  setDirectoryField_(row, h, ["Miles Source"], manualMiles ? "manual" : zipMiles === null ? "" : "zip");
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
    county:sheetSafeText_(p.county, 100, "County"),
    state:sheetSafeText_(p.state || "WI", 2, "State").toUpperCase(),
    postal_code:sheetSafeText_(p.postal_code || p.zip, 10, "ZIP code"),
    craft_spirit_fit:fit,
    rating_basis:sheetSafeText_(p.rating_basis, 1000, "Rating basis"),
    miles:miles,
    miles_source:String(p.miles_source || "").trim().toLowerCase() === "manual" ? "manual" : "",
    lead_source:sheetSafeText_(p.lead_source || "Sturgeon Distribution Hub", 200, "Lead source"),
    email_confidence:sheetSafeText_(p.email_confidence || (email ? "Needs verification" : ""), 80, "Email confidence"),
    relationship:sheetSafeText_(p.relationship || "Prospect", 80, "Relationship"),
    priority:(() => {
      const priority = sheetSafeText_(p.priority || "Normal", 40, "Priority");
      if (!["High", "Normal", "Low"].includes(priority)) throw new Error("Priority must be High, Normal, or Low.");
      return priority;
    })(),
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
    // Collect rows in memory and write them in one batch per sheet; per-row appendRow calls made
    // imports of a few dozen businesses exceed the web request time limit.
    const directoryWidth = directory.getLastColumn();
    const directoryStartRow = directory.getLastRow() + 1;
    const pendingDirectoryRows = [];
    const importLogRows = [];
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
        const input = validateBusinessInput_(Object.assign({}, raw, { priority:String(raw.priority || "").trim().toLowerCase() === "medium" ? "Normal" : raw.priority, lead_source:raw.lead_source || sourceName }));
        normalizedForLog = input;
        const duplicate = duplicateBusiness_(identity, input);
        if (duplicate) {
          accountId = duplicate.account_id;
          status = "Skipped duplicate";
          detail = `Matched ${duplicate.business}`;
          skipped += 1;
        } else {
          accountId = permanentId_("ACC");
          pendingDirectoryRows.push({ values:directoryRowFromBusiness_(directory, input, accountId, new Date()), log_index:importLogRows.length });
          status = "Created";
          detail = "Added to directory";
          created += 1;
          const createdRecord = {
            account_id:accountId,
            source_row:directoryStartRow + pendingDirectoryRows.length - 1,
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
      importLogRows.push([batchId, index + 2, accountId, raw.business_name || raw.business || "", raw.email || "", raw.city || "", normalizedJson, sha256_(normalizedJson), status, detail, new Date(), APP_VERSION]);
    });
    if (pendingDirectoryRows.length) {
      try {
        directory.getRange(directoryStartRow, 1, pendingDirectoryRows.length, directoryWidth).setValues(pendingDirectoryRows.map(item => item.values));
      } catch (batchError) {
        // A single invalid cell (for example a data-validation rule) rejects the whole batch.
        // Fall back to row-by-row so valid businesses still import and each failure is logged.
        console.warn("Directory batch import failed; retrying row by row: " + String(batchError && batchError.message || batchError));
        pendingDirectoryRows.forEach(item => {
          try {
            directory.appendRow(item.values);
          } catch (rowError) {
            const logRow = importLogRows[item.log_index];
            logRow[8] = "Error";
            logRow[9] = String(rowError && rowError.message || rowError).slice(0, 1000);
            created -= 1;
            errors += 1;
          }
        });
      }
    }
    if (importLogRows.length) importRows.getRange(importRows.getLastRow() + 1, 1, importLogRows.length, importLogRows[0].length).setValues(importLogRows);
    batches.appendRow([batchId, new Date(), staffName, sourceName, sourceHash, p.rows.length, created, skipped, errors, errors ? "Completed with errors" : "Completed", new Date(), APP_VERSION]);
    appendAudit_("IMPORT_BUSINESSES", "Import Batch", batchId, "", staffName, sourceName, OUTREACH_SHEET_NAME, errors ? "Completed with errors" : "Completed", `${created} created; ${skipped} skipped; ${errors} errors.`);
    return { message:`Import complete: ${created} created, ${skipped} skipped, ${errors} errors.`, batch_id:batchId, created:created, skipped:skipped, errors:errors };
  } finally {
    lock.releaseLock();
  }
}

function apiRecalculateOutreachMiles_(p) {
  if (String(p?.authenticated_staff_role || "").trim().toLowerCase() !== "admin") throw new Error("This action requires an administrator role.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another directory update is in progress. Try again in a moment.");
  try {
    const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const h = ensureHeaderColumns_(sheet, ["Miles Source"]); // Structural change occurs only in this admin action.
    const zipKey = ["zip", "zip_code", "postal_code"].find(key => h[key] !== undefined);
    const milesKey = ["miles", "distance", "distance_miles"].find(key => h[key] !== undefined);
    if (!zipKey || !milesKey) throw new Error("Distribution Directory and Leads needs Zip Code and Miles columns.");
    const rowCount = Math.max(0, sheet.getLastRow() - 1);
    const counts = { updated:0, manual_kept:0, no_zip:0, unknown_zip:0 };
    if (!rowCount) return Object.assign({ message:"No directory rows to recalculate." }, counts);
    const directoryRows = sheet.getRange(2, 1, rowCount, sheet.getLastColumn()).getValues();
    const nextMiles = directoryRows.map(row => [row[h[milesKey]]]);
    const nextSources = directoryRows.map(row => [row[h.miles_source]]);
    directoryRows.forEach((row, index) => {
      if (String(row[h.miles_source] || "").trim().toLowerCase() === "manual") {
        counts.manual_kept += 1;
        return;
      }
      const zip = normalizeZip_(row[h[zipKey]]);
      if (!zip) {
        counts.no_zip += 1;
        nextMiles[index][0] = "";
        nextSources[index][0] = "";
        return;
      }
      const miles = milesForZip_(zip);
      if (miles === null) {
        counts.unknown_zip += 1;
        nextMiles[index][0] = "";
        nextSources[index][0] = "";
        return;
      }
      if (String(row[h[milesKey]]) !== String(miles) || String(row[h.miles_source] || "").trim().toLowerCase() !== "zip") counts.updated += 1;
      nextMiles[index][0] = miles;
      nextSources[index][0] = "zip";
    });
    // The two columns may not be adjacent in an existing sheet; each is one batched column write, never per-cell writes.
    sheet.getRange(2, h[milesKey] + 1, rowCount, 1).setValues(nextMiles);
    sheet.getRange(2, h.miles_source + 1, rowCount, 1).setValues(nextSources);
    const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
    appendAudit_("RECALCULATE_OUTREACH_MILES", "Distribution Directory and Leads", "", "", actor, ZIP_CENTROIDS_SHEET_NAME, OUTREACH_SHEET_NAME, "Completed", `${counts.updated} updated; ${counts.manual_kept} manual kept; ${counts.no_zip} no ZIP; ${counts.unknown_zip} unknown ZIP.`);
    return Object.assign({ message:`Mileage recalculated: ${counts.updated} updated; ${counts.manual_kept} manual kept; ${counts.no_zip} no ZIP; ${counts.unknown_zip} unknown ZIP.` }, counts);
  } finally {
    lock.releaseLock();
  }
}

function recalculateOutreachMiles() {
  try {
    const result = apiRecalculateOutreachMiles_({ staff_name:"Karl (editor)", authenticated_staff_role:"admin" });
    Logger.log(JSON.stringify(result));
    return result;
  } finally {
    bumpReadCacheVersion_(["outreach"]);
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
  const outcome = String(record.outcome || "").trim().toLowerCase();
  // Closed and Not a buyer are checked on both status and outcome; older outcomes keep their earlier behavior (status only).
  return record.do_not_email || ["do not contact", "not interested", "closed"].includes(status) || ["closed", "not a buyer"].includes(outcome);
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
  else if (["normal", "medium", "2", "b"].includes(priority)) score += 20;
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

function normalizeZip_(value) {
  const text = String(value === null || value === undefined ? "" : value).trim().replace(/\.0+$/, "");
  const digits = (text.match(/\d+/) || [""])[0].slice(0, 5);
  return digits ? digits.padStart(5, "0") : "";
}

function zipCentroidMap_() {
  if (__ZIP_CENTROID_MAP) return __ZIP_CENTROID_MAP;
  const cache = CacheService.getScriptCache();
  const cacheKey = "hub_zip_centroids_v3";
  try {
    const cached = JSON.parse(cache.get(cacheKey) || "null");
    if (cached && typeof cached === "object" && Object.values(cached).every(item => item && typeof item === "object")) {
      __ZIP_CENTROID_MAP = new Map(Object.entries(cached));
      return __ZIP_CENTROID_MAP;
    }
  } catch (error) {
    console.warn("ZIP centroid cache read failed: " + String(error && error.message || error));
  }
  const sheet = getOutreachSs_().getSheetByName(ZIP_CENTROIDS_SHEET_NAME);
  const map = new Map();
  if (!sheet || sheet.getLastRow() < 2) return (__ZIP_CENTROID_MAP = map);
  const headers = getHeaderMap_(sheet);
  const zipIndex = headers.zip;
  const milesIndex = headers.miles_from_distillery;
  const latitudeIndex = headers.latitude;
  const longitudeIndex = headers.longitude;
  if (zipIndex === undefined || milesIndex === undefined || latitudeIndex === undefined || longitudeIndex === undefined) {
    throw new Error("ZIP Centroids needs ZIP, Latitude, Longitude, and Miles From Distillery columns.");
  }
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().forEach(row => {
    const zip = normalizeZip_(row[zipIndex]);
    const miles = outreachMiles_(row[milesIndex]);
    const latitude = Number(row[latitudeIndex]);
    const longitude = Number(row[longitudeIndex]);
    // Mileage can be used even when a centroid has no coordinates. Campaign centers still require coordinates.
    if (!zip) return;
    map.set(zip, {
      city:String(headers.city === undefined ? "" : row[headers.city] || "").trim(),
      latitude:Number.isFinite(latitude) ? latitude : null,
      longitude:Number.isFinite(longitude) ? longitude : null,
      miles_from_distillery:miles,
    });
  });
  __ZIP_CENTROID_MAP = map;
  try {
    cache.put(cacheKey, JSON.stringify(Object.fromEntries(map)), 21600);
  } catch (error) {
    // CacheService has a small value limit; the in-request map remains authoritative.
    console.warn("ZIP centroid cache write failed: " + String(error && error.message || error));
  }
  return map;
}

function milesForZip_(zip) {
  const normalized = normalizeZip_(zip);
  if (!normalized) return null;
  const centroid = zipCentroidMap_().get(normalized);
  return centroid ? outreachMiles_(centroid.miles_from_distillery) : null;
}

function zipCentroidForZip_(zip) {
  const normalized = normalizeZip_(zip);
  return normalized ? (zipCentroidMap_().get(normalized) || null) : null;
}

function milesBetweenCoordinates_(from, to) {
  if (!from || !to || !Number.isFinite(from.latitude) || !Number.isFinite(from.longitude) || !Number.isFinite(to.latitude) || !Number.isFinite(to.longitude)) return null;
  const radians = degrees => degrees * Math.PI / 180;
  const earthMiles = 3958.7613;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(earthMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function directoryMilesSource_(row) {
  return String(outreachValue_(row, ["miles_source"]) || "").trim().toLowerCase();
}

function setDirectoryMilesFromZip_(values, headers, zip) {
  const sourceKey = headers.miles_source !== undefined ? "miles_source" : "";
  if (sourceKey && String(values[headers[sourceKey]] || "").trim().toLowerCase() === "manual") return { updated:false, source:"manual", miles:outreachMiles_(values[headers.miles]) };
  const milesKey = ["miles", "distance", "distance_miles"].find(key => headers[key] !== undefined);
  if (!milesKey) return { updated:false, source:"", miles:null };
  const miles = milesForZip_(zip);
  values[headers[milesKey]] = miles === null ? "" : miles;
  if (sourceKey) values[headers[sourceKey]] = miles === null ? "" : "zip";
  return { updated:true, source:miles === null ? "" : "zip", miles:miles };
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
  if (record.do_not_email || ["bad address", "closed", "unsubscribed", "not interested", "do not contact"].includes(outcome)) {
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
  const cache = CacheService.getScriptCache();
  const cacheKey = "hub_outreach_campaign_settings_v1";
  try {
    const cached = JSON.parse(cache.get(cacheKey) || "null");
    if (cached && typeof cached === "object") {
      __OUTREACH_CAMPAIGN_SETTINGS = cached;
      return __OUTREACH_CAMPAIGN_SETTINGS;
    }
  } catch (error) {
    console.warn("Outreach campaign-settings cache read failed: " + String(error && error.message || error));
  }
  const sheet = getOutreachSheet_("Campaign Settings");
  const values = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), 2).getValues();
  __OUTREACH_CAMPAIGN_SETTINGS = values.reduce((settings, row) => {
    if (row[0]) settings[String(row[0])] = row[1];
    return settings;
  }, {});
  try {
    cache.put(cacheKey, JSON.stringify(__OUTREACH_CAMPAIGN_SETTINGS), 300);
  } catch (error) {
    console.warn("Outreach campaign-settings cache write failed: " + String(error && error.message || error));
  }
  return __OUTREACH_CAMPAIGN_SETTINGS;
}

const OUTREACH_SERVICE_AREA_MILES_KEY = "Service area miles";
const OUTREACH_DEFAULT_SERVICE_AREA_MILES = 60;
function ensureOutreachServiceAreaSetting_() {
  const sheet = getOutreachSheet_("Campaign Settings");
  const keys = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), 1).getDisplayValues().map(row => String(row[0] || "").trim());
  const added = !keys.includes(OUTREACH_SERVICE_AREA_MILES_KEY);
  if (added) sheet.getRange(sheet.getLastRow() + 1, 1, 1, 2).setValues([[OUTREACH_SERVICE_AREA_MILES_KEY, OUTREACH_DEFAULT_SERVICE_AREA_MILES]]);
  const radiusAdded = !keys.includes(OUTREACH_NEW_BUSINESS_RADIUS_KEY);
  if (radiusAdded) sheet.getRange(sheet.getLastRow() + 1, 1, 1, 2).setValues([[OUTREACH_NEW_BUSINESS_RADIUS_KEY, OUTREACH_DEFAULT_NEW_BUSINESS_RADIUS]]);
  return { key:OUTREACH_SERVICE_AREA_MILES_KEY, default_miles:OUTREACH_DEFAULT_SERVICE_AREA_MILES, added:added, new_business_radius_added:radiusAdded };
}
// New prospects from DOR are only added this close (Karl, 2026-11-20: 30 miles; distances are straight-line from the
// distillery to the ZIP's center). Filling details on businesses already in the Directory uses the service area.
const OUTREACH_NEW_BUSINESS_RADIUS_KEY = "New business radius miles";
const OUTREACH_DEFAULT_NEW_BUSINESS_RADIUS = 30;
function outreachNewBusinessRadiusMiles_(settings) {
  const miles = Number((settings || getOutreachCampaignSettings_())[OUTREACH_NEW_BUSINESS_RADIUS_KEY]);
  return Number.isFinite(miles) && miles >= 0 ? miles : OUTREACH_DEFAULT_NEW_BUSINESS_RADIUS;
}
function outreachServiceAreaMiles_(settings) {
  const miles = Number((settings || getOutreachCampaignSettings_())[OUTREACH_SERVICE_AREA_MILES_KEY]);
  return Number.isFinite(miles) && miles >= 0 ? miles : OUTREACH_DEFAULT_SERVICE_AREA_MILES;
}

function outreachMonthlyContentValues_(row, settings, hasRecentBadgerInvoice) {
  const stage = String(outreachValue_(row, ["next_email", "stage"]) || "Initial").trim();
  const relationship = String(outreachValue_(row, ["relationship"]) || "").trim().toLowerCase();
  const tastingOffer = stage === "Reactivation" || relationship !== "prospect" || hasRecentBadgerInvoice
    ? ""
    : String(settings["Monthly content tasting offer"] || "");
  return {
    "Month": String(settings["Monthly content month"] || ""),
    "Featured Cocktail": String(settings["Monthly content featured cocktail"] || ""),
    "Second Cocktail": String(settings["Monthly content second cocktail"] || ""),
    "Tasting Offer": tastingOffer,
    "Cocktail List Offer": String(settings["Monthly content cocktail-list offer"] || ""),
  };
}

function outreachRecentBadgerInvoiceAccountIds_() {
  if (__OUTREACH_RECENT_BADGER_INVOICE_ACCOUNT_IDS) return __OUTREACH_RECENT_BADGER_INVOICE_ACCOUNT_IDS;
  try {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const directoryRows = getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME));
    const accountIds = new Set(directoryRows.map(row => String(row.account_id || "").trim()).filter(Boolean));
    const accountsByBusiness = new Map();
    directoryRows.forEach(row => {
      const key = normalizeCustomerMatchKey_(outreachValue_(row, ["business", "business_name"]));
      const accountId = String(row.account_id || "").trim();
      if (!key || !accountId) return;
      if (!accountsByBusiness.has(key)) accountsByBusiness.set(key, new Set());
      accountsByBusiness.get(key).add(accountId);
    });
    const orderAccountsByInvoice = new Map();
    const ordersSheet = getOutreachSs_().getSheetByName(ONLINE_ORDER_REQUESTS_SHEET_NAME);
    if (ordersSheet && ordersSheet.getLastRow() > 1) {
      getAllRowsAsObjects_(ordersSheet).forEach(order => {
        const invoiceKey = normalizeBadgerInvoiceNumber_(order.badger_invoice_number);
        const accountId = String(order.account_id || "").trim();
        if (!invoiceKey || !accountId) return;
        if (!orderAccountsByInvoice.has(invoiceKey)) orderAccountsByInvoice.set(invoiceKey, new Set());
        orderAccountsByInvoice.get(invoiceKey).add(accountId);
      });
    }
    const aliases = readBadgerCustomerAliases_();
    const locationsByInvoiceName = new Map();
    cachedBadgerLocationNames_(false).forEach(item => {
      const invoiceKey = normalizeCustomerMatchKey_(item.invoice_name);
      const publicKey = normalizeCustomerMatchKey_(item.public_name);
      if (!invoiceKey || !publicKey) return;
      if (!locationsByInvoiceName.has(invoiceKey)) locationsByInvoiceName.set(invoiceKey, new Set());
      locationsByInvoiceName.get(invoiceKey).add(publicKey);
    });
    const links = readBadgerInvoiceLinks_();
    const recent = new Set();
    // How each account was matched: "strong" (explicit link, order link or learned alias) or
    // "name" (Badger location name or business name only). The order-online invite adds
    // people on this basis: strong matches always, name-only matches only on a row whose
    // Relationship shows customer history. A name shared by two Directory accounts matches neither.
    const strong = new Set();
    const nameOnly = new Map();
    let unplaced = 0;
    cachedBadgerInvoices_(false).forEach(invoice => {
      const invoiceDate = outreachDate_(invoice.invoice_date);
      if (!invoiceDate || invoiceDate.getTime() < cutoff.getTime() || invoice.is_void) return;
      const invoiceKey = normalizeBadgerInvoiceNumber_(invoice.invoice_number);
      const explicit = links.get(invoiceKey);
      if (["void", "ignored"].includes(String(explicit?.match_method || "").trim().toLowerCase())) return;
      let accountId = String(explicit?.account_id || "").trim();
      const ordered = orderAccountsByInvoice.get(invoiceKey) || new Set();
      if (!accountId && ordered.size > 1) return;
      if (!accountId && ordered.size === 1) accountId = Array.from(ordered)[0];
      const customerKey = normalizeCustomerMatchKey_(invoice.customer_name);
      const strongMatch = !!accountId;
      if (!accountId && customerKey) {
        const exactAlias = aliases.by_name.get(canonicalBadgerAliasName_(invoice.customer_name));
        const looseAliasAccounts = Array.from(aliases.by_key.get(customerKey) || []);
        if (exactAlias && !exactAlias.ambiguous) accountId = String(exactAlias.account_id || "").trim();
        else if (looseAliasAccounts.length === 1) accountId = String(looseAliasAccounts[0] || "").trim();
      }
      const aliasMatch = !strongMatch && !!accountId;
      if (!accountId && customerKey) {
        const locationKeys = locationsByInvoiceName.get(customerKey) || new Set();
        if (locationKeys.size === 1) {
          const candidates = Array.from(accountsByBusiness.get(Array.from(locationKeys)[0]) || []);
          if (candidates.length === 1) accountId = candidates[0];
        }
      }
      if (!accountId && customerKey) {
        const candidates = Array.from(accountsByBusiness.get(customerKey) || []);
        if (candidates.length === 1) accountId = candidates[0];
      }
      if (accountId && accountIds.has(accountId)) {
        recent.add(accountId);
        if (strongMatch || aliasMatch) strong.add(accountId);
        else nameOnly.set(accountId, String(invoice.customer_name || ""));
      } else {
        unplaced += 1;
      }
    });
    strong.forEach(accountId => nameOnly.delete(accountId));
    __OUTREACH_RECENT_BADGER_MATCHES = { strong:strong, name_only:nameOnly, unplaced_invoices:unplaced };
    __OUTREACH_RECENT_BADGER_INVOICE_ACCOUNT_IDS = recent;
    return recent;
  } catch (error) {
    console.warn("Badger invoice lookup failed for outreach tasting eligibility; suppressing tasting offers: " + String(error && error.message || error));
    __OUTREACH_RECENT_BADGER_INVOICE_LOOKUP_FAILED = true;
    __OUTREACH_RECENT_BADGER_INVOICE_ACCOUNT_IDS = new Set();
    return __OUTREACH_RECENT_BADGER_INVOICE_ACCOUNT_IDS;
  }
}

function outreachHasRecentBadgerInvoice_(accountId) {
  const id = String(accountId || "").trim();
  const recent = outreachRecentBadgerInvoiceAccountIds_();
  return __OUTREACH_RECENT_BADGER_INVOICE_LOOKUP_FAILED || (!!id && recent.has(id));
}

function outreachRowsMatchingCell_(sheet, headerNames, value) {
  const target = String(value || "").trim();
  if (!sheet || !target || sheet.getLastRow() < 2) return [];
  const headers = getHeaderMap_(sheet);
  const headerName = headerNames.map(normalizeHeader_).find(name => headers[name] !== undefined);
  if (headerName === undefined) return [];
  const matches = sheet.getRange(2, headers[headerName] + 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(target)
    .matchCase(false)
    .matchEntireCell(true)
    .findAll();
  const keys = Object.keys(headers);
  return matches.map(match => {
    const values = sheet.getRange(match.getRow(), 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = {};
    keys.forEach(key => row[key] = values[headers[key]]);
    row.__source_row = match.getRow();
    return row;
  });
}

function apiRecordEmailEngagement_(p) {
  if (!p || String(p.event_type || "") !== "click") throw new Error("Only click engagement may be recorded.");
  const target = String(p.target || "").trim();
  if (!["sell_sheet", "application", "order"].includes(target)) throw new Error("Unknown email-link target.");
  const accountId = String(p.account_id || "").trim();
  if (!accountId) throw new Error("Missing account ID.");
  const directory = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const accountRows = outreachRowsMatchingCell_(directory, ["account_id", "Account ID"], accountId);
  if (!accountRows.length) throw new Error("Account not found.");
  const engagement = getOutreachSs_().getSheetByName(OUTREACH_ENGAGEMENT_SHEET_NAME);
  if (!engagement) throw new Error("Email Engagement tab is missing. Run repairHubStructure first.");
  const headers = getHeaderMap_(engagement);
  const directoryRow = accountRows[0];
  const now = new Date();
  const recentDuplicate = outreachRowsMatchingCell_(engagement, ["account_id", "Account ID"], accountId).some(row => {
    if (String(row.event_type || "").trim().toLowerCase() !== "click") return false;
    if (headers.target !== undefined && String(row.target || "").trim() !== target) return false;
    const eventAt = outreachDate_(row.event_at);
    return !!eventAt && now.getTime() - eventAt.getTime() >= 0 && now.getTime() - eventAt.getTime() < 5000;
  });
  if (recentDuplicate) return { recorded:false, duplicate:true };
  const sentAt = outreachDate_(outreachValue_(directoryRow, ["last_emailed"]));
  const possibleScanner = !!sentAt && now.getTime() - sentAt.getTime() >= 0 && now.getTime() - sentAt.getTime() < 60000;
  const values = Array(engagement.getLastColumn()).fill("");
  const set = (key, value) => { if (headers[key] !== undefined) values[headers[key]] = value; };
  set("event_id", permanentId_("ENG"));
  set("business_name", outreachValue_(directoryRow, ["business", "business_name"]));
  set("email", outreachValue_(directoryRow, ["email", "email_address"]));
  set("message_stage", String(p.stage || "").trim());
  set("account_id", accountId);
  set("source_row", directoryRow.__source_row || "");
  set("event_type", "click");
  set("event_at", now);
  set("source", "Email link");
  set("target", target);
  set("stage", String(p.stage || "").trim());
  set("link_url", target === "sell_sheet" ? "Sell sheet" : target === "order" ? "Ordering page" : "Customer application");
  set("confidence", possibleScanner ? "Possible link scanner" : "Signed link");
  set("app_version", APP_VERSION);
  engagement.appendRow(values);
  if (target === "application" && !possibleScanner) {
    sendCustomerApplicationClickNotification_(directoryRow, directory, String(p.stage || "").trim());
  }
  return { recorded:true };
}

function sendCustomerApplicationClickNotification_(account, directorySheet, stage) {
  const accountId = String(account.account_id || "").trim();
  const business = String(outreachValue_(account, ["business", "business_name"]) || "Unknown business").trim();
  const email = String(outreachValue_(account, ["email", "email_address"]) || "").trim();
  const sourceRow = Number(account.__source_row || 0);
  const reviewUrl = sourceRow
    ? `https://docs.google.com/spreadsheets/d/${OUTREACH_SPREADSHEET_ID}/edit#gid=${directorySheet.getSheetId()}&range=A${sourceRow}`
    : `https://docs.google.com/spreadsheets/d/${OUTREACH_SPREADSHEET_ID}/edit#gid=${directorySheet.getSheetId()}`;
  const stageText = stage || "Not specified";
  const lines = [
    "A recipient opened the wholesale customer application from a tracked outreach link.",
    "",
    `Business: ${business}`,
    `Account ID: ${accountId}`,
    `Email: ${email || "Not available"}`,
    `Outreach stage: ${stageText}`,
    "",
    `Review the customer record: ${reviewUrl}`,
  ];
  const html = [
    "<p>A recipient opened the wholesale customer application from a tracked outreach link.</p>",
    "<ul>",
    `<li><strong>Business:</strong> ${escapeOutreachHtml_(business)}</li>`,
    `<li><strong>Account ID:</strong> ${escapeOutreachHtml_(accountId)}</li>`,
    `<li><strong>Email:</strong> ${escapeOutreachHtml_(email || "Not available")}</li>`,
    `<li><strong>Outreach stage:</strong> ${escapeOutreachHtml_(stageText)}</li>`,
    "</ul>",
    `<p><a href="${escapeOutreachHtml_(reviewUrl)}">Review the customer record</a></p>`,
  ].join("");
  try {
    const message = {
      to: CUSTOMER_APPLICATION_NOTIFICATION_EMAIL,
      name: "Sturgeon Distribution Hub",
      subject: `Wholesale application opened: ${business}`,
      body: lines.join("\n"),
      htmlBody: html,
    };
    if (email) message.replyTo = email;
    MailApp.sendEmail(message);
  } catch (error) {
    // Click tracking must continue even if an optional staff alert cannot be delivered.
    console.warn("Customer application click notification failed: " + String(error && error.message || error));
  }
}

function apiBackfillEngagementDetails_(p) {
  const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Another update is in progress. Try again in a moment.");
  try {
    const directory = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const bySourceRow = new Map(getAllRowsAsObjects_(directory).map((row, index) => [String(index + 2), row]));
    const engagement = getOutreachSs_().getSheetByName(OUTREACH_ENGAGEMENT_SHEET_NAME);
    if (!engagement || engagement.getLastRow() < 2) return { message:"No engagement rows to backfill.", updated:0 };
    const h = getHeaderMap_(engagement);
    if (["business_name", "email", "account_id", "source_row"].some(key => h[key] === undefined)) throw new Error("Run Repair Hub Structure before backfilling engagement details.");
    const range = engagement.getRange(2, 1, engagement.getLastRow() - 1, engagement.getLastColumn());
    const values = range.getValues();
    let updated = 0;
    values.forEach(row => {
      const source = bySourceRow.get(String(row[h.source_row] || "").trim());
      if (!source) return;
      let changed = false;
      const fill = (key, value) => { if (!String(row[h[key]] || "").trim() && value) { row[h[key]] = value; changed = true; } };
      fill("business_name", outreachValue_(source, ["business", "business_name"]));
      fill("email", outreachValue_(source, ["email", "email_address"]));
      fill("account_id", source.account_id);
      if (changed) updated += 1;
    });
    if (updated) range.setValues(values);
    appendAudit_("BACKFILL_ENGAGEMENT_DETAILS", "Email Engagement", "", "", actor, OUTREACH_ENGAGEMENT_SHEET_NAME, OUTREACH_SHEET_NAME, "Completed", `${updated} engagement rows updated.`);
    return { message:`${updated} engagement rows updated.`, updated:updated };
  } finally { lock.releaseLock(); }
}

function backfillEngagementDetails() {
  try {
    const result = apiBackfillEngagementDetails_({ staff_name:"Karl (editor)", authenticated_staff_role:"admin" });
    Logger.log(JSON.stringify(result));
    return result;
  } finally {
    bumpReadCacheVersion_(["outreach"]);
  }
}

function outreachTargetedActivityMap_(accountId, business) {
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  const accountRows = outreachRowsMatchingCell_(sheet, ["account_id", "Account ID"], accountId);
  const rows = accountRows.length ? accountRows : outreachRowsMatchingCell_(sheet, ["business", "Business Name"], business);
  const activity = new Map();
  rows.forEach(row => {
    const rowBusiness = String(outreachValue_(row, ["business"]) || "").trim();
    if (!rowBusiness) return;
    const rowAccountId = String(row.account_id || "").trim();
    const keys = [`business:${rowBusiness.toLowerCase()}`];
    if (rowAccountId) keys.unshift(`account:${rowAccountId}`);
    const item = {
      timestamp:outreachValue_(row, ["timestamp"]),
      stage:String(outreachValue_(row, ["message_stage", "stage"]) || ""),
      result:String(outreachValue_(row, ["result"]) || ""),
      detail:String(outreachValue_(row, ["error/detail", "error_detail", "detail"]) || ""),
      subject:String(outreachValue_(row, ["subject"]) || ""),
      message_id:String(outreachValue_(row, ["message_id"]) || ""),
      delivered_to:String(outreachValue_(row, ["delivered_to"]) || ""),
      idempotency_token:String(outreachValue_(row, ["idempotency_token"]) || ""),
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

function outreachTargetedRows_(sheet, accountId, sourceRow) {
  const accountRows = outreachRowsMatchingCell_(sheet, ["account_id", "Account ID"], accountId);
  return accountRows.length
    ? accountRows
    : outreachRowsMatchingCell_(sheet, ["source_row", "Source Row"], sourceRow);
}

function outreachTargetedDraftMap_(accountId, sourceRow) {
  const sheet = getOutreachDraftSheet_(false);
  const drafts = new Map();
  outreachTargetedRows_(sheet, accountId, sourceRow).forEach(row => {
    const rowSourceRow = Number(row.source_row || 0);
    const rowAccountId = String(row.account_id || "").trim();
    const stage = String(row.message_stage || "Initial").trim();
    if (!rowSourceRow && !rowAccountId) return;
    const draft = {
      subject:String(row.subject || "").trim(),
      body_text:String(row.body_text || "").trim(),
      updated_at:row.updated_at || "",
      updated_by:String(row.updated_by || ""),
    };
    if (rowAccountId) drafts.set(outreachDraftKey_(rowAccountId, stage), draft);
    if (rowSourceRow) drafts.set(outreachDraftKey_(rowSourceRow, stage), draft);
  });
  return drafts;
}

function outreachTargetedProgramMap_(accountId, sourceRow) {
  const sheet = getOutreachSs_().getSheetByName(OUTREACH_PROGRAMS_SHEET_NAME);
  const programs = new Map();
  outreachTargetedRows_(sheet, accountId, sourceRow).forEach(row => {
    const rowSourceRow = Number(row.source_row || 0);
    const rowAccountId = String(row.account_id || "").trim();
    if (!rowSourceRow && !rowAccountId) return;
    const program = {
      newsletter_status:String(row.newsletter_status || "Not invited"),
      newsletter_consent_source:String(row.newsletter_consent_source || ""),
      newsletter_status_date:row.newsletter_status_date || "",
      ordering_status:String(row.ordering_status || "Not offered"),
      ordering_customer_id:String(row.ordering_customer_id || ""),
      ordering_invite_date:row.ordering_invite_date || "",
      ordering_portal_url:String(row.ordering_portal_url || ""),
      notes:String(row.notes || ""),
      updated_at:row.updated_at || "",
    };
    if (rowAccountId) programs.set(rowAccountId, program);
    if (rowSourceRow) programs.set(rowSourceRow, program);
  });
  return programs;
}

function outreachTargetedEngagementMap_(accountId, sourceRow) {
  const sheet = getOutreachSs_().getSheetByName(OUTREACH_ENGAGEMENT_SHEET_NAME);
  const engagement = new Map();
  outreachTargetedRows_(sheet, accountId, sourceRow).forEach(row => {
    const rowSourceRow = Number(row.source_row || 0);
    const rowAccountId = String(row.account_id || "").trim();
    const key = rowAccountId || rowSourceRow;
    if (!key) return;
    if (!engagement.has(key)) {
      engagement.set(key, { open_count:0, last_opened:"", click_count:0, last_clicked:"", last_click_target:"", reply_count:0, bounce_count:0, source:"" });
    }
    const summary = engagement.get(key);
    const eventType = String(row.event_type || "").trim().toLowerCase();
    const eventAt = outreachDate_(row.event_at);
    const newest = (current, candidate) => {
      const currentDate = outreachDate_(current);
      if (!candidate) return current;
      return !currentDate || candidate.getTime() > currentDate.getTime() ? candidate : current;
    };
    if (eventType === "open") { summary.open_count += 1; summary.last_opened = newest(summary.last_opened, eventAt); }
    else if (eventType === "click") {
      summary.click_count += 1;
      const latestClick = newest(summary.last_clicked, eventAt);
      if (latestClick !== summary.last_clicked && row.target) summary.last_click_target = String(row.target);
      summary.last_clicked = latestClick;
    }
    else if (eventType === "reply") summary.reply_count += 1;
    else if (eventType === "bounce") summary.bounce_count += 1;
    if (row.source) summary.source = String(row.source);
  });
  return engagement;
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
    const keys = accountId ? [accountId, sourceRow].filter(Boolean) : [sourceRow];
    if (!keys.length) return;
    const primaryKey = keys[0];
    if (!engagement.has(primaryKey)) {
      engagement.set(primaryKey, {
        open_count:0,
        last_opened:"",
        click_count:0,
        last_clicked:"",
        last_click_target:"",
        reply_count:0,
        bounce_count:0,
        source:"",
      });
    }
    const summary = engagement.get(primaryKey);
    keys.forEach(key => engagement.set(key, summary));
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
      const latestClick = newest(summary.last_clicked, eventAt);
      if (latestClick !== summary.last_clicked && row.target) summary.last_click_target = String(row.target);
      summary.last_clicked = latestClick;
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

function outreachRecentSendIndex_() {
  if (__OUTREACH_RECENT_SEND_INDEX) return __OUTREACH_RECENT_SEND_INDEX;
  const index = new Map();
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return (__OUTREACH_RECENT_SEND_INDEX = index);
  getAllRowsAsObjects_(sheet).forEach(row => {
    const recipient = String(outreachValue_(row, ["intended_recipient", "delivered_to", "email", "email_address"]) || "").trim().toLowerCase();
    const result = String(outreachValue_(row, ["result"]) || "").toUpperCase();
    if (!recipient || !result.includes("SENT") || result.includes("TEST")) return;
    const stage = String(outreachValue_(row, ["message_stage", "stage"]) || "").trim();
    const kind = stage === OUTREACH_COCKTAIL_LIST_STAGE ? "cocktail" : "sales";
    const entry = index.get(recipient) || { sales_sent_at:"", cocktail_sent_at:"", sales_undated:false, cocktail_undated:false };
    const sentAt = outreachDate_(outreachValue_(row, ["timestamp", "sent_at"]));
    if (!sentAt) entry[`${kind}_undated`] = true; // An unknown send time is unsafe to repeat.
    else if (!entry[`${kind}_sent_at`] || sentAt.getTime() > entry[`${kind}_sent_at`].getTime()) entry[`${kind}_sent_at`] = sentAt;
    index.set(recipient, entry);
  });
  return (__OUTREACH_RECENT_SEND_INDEX = index);
}

function outreachNoteRecentSend_(email, kind, sentAt) {
  // Do not create a partial index: when no cooldown check has needed it, a later lookup must still read Activity Log.
  if (!__OUTREACH_RECENT_SEND_INDEX) return;
  const recipient = String(email || "").trim().toLowerCase();
  const normalizedKind = kind === "cocktail" ? "cocktail" : "sales";
  const date = outreachDate_(sentAt) || new Date();
  if (!recipient) return;
  const entry = __OUTREACH_RECENT_SEND_INDEX.get(recipient) || { sales_sent_at:"", cocktail_sent_at:"", sales_undated:false, cocktail_undated:false };
  if (!entry[`${normalizedKind}_sent_at`] || date.getTime() > entry[`${normalizedKind}_sent_at`].getTime()) entry[`${normalizedKind}_sent_at`] = date;
  __OUTREACH_RECENT_SEND_INDEX.set(recipient, entry);
}

function outreachRecentSendToEmail_(email, stagePredicate, days, now) {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return false;
  const cutoff = new Date(now || new Date());
  cutoff.setDate(cutoff.getDate() - Number(days || 0));
  const entry = outreachRecentSendIndex_().get(target);
  if (!entry) return false;
  return ["sales", "cocktail"].some(kind => {
    const stage = kind === "cocktail" ? OUTREACH_COCKTAIL_LIST_STAGE : "Sales outreach";
    if (!stagePredicate(stage)) return false;
    return entry[`${kind}_undated`] || (!!entry[`${kind}_sent_at`] && entry[`${kind}_sent_at`].getTime() >= cutoff.getTime());
  });
}

function outreachCrossSendCooldownReason_(email, sendingCocktailList) {
  const recentlySent = outreachRecentSendToEmail_(email,
    stage => sendingCocktailList ? stage !== OUTREACH_COCKTAIL_LIST_STAGE : stage === OUTREACH_COCKTAIL_LIST_STAGE,
    OUTREACH_COCKTAIL_LIST_GAP_DAYS);
  return recentlySent ? `Another ${sendingCocktailList ? "sales outreach email" : "cocktail list email"} was sent within the last ${OUTREACH_COCKTAIL_LIST_GAP_DAYS} days` : "";
}

function cocktailListMessage_(record, settings) {
  if (!String(settings["Physical mailing address"] || "").trim()) throw new Error("Physical mailing address is required before previewing or creating a Cocktail list campaign.");
  const values = Object.assign({
    "First Name":String(record.contact || record.name || "there").trim().split(/\s+/)[0] || "there",
    "Business Name":outreachDisplayBusinessName_(record.business || record.organization || ""),
    "Physical Address":String(settings["Physical mailing address"] || ""),
  }, outreachMonthlyContentValues_({ next_email:OUTREACH_COCKTAIL_LIST_STAGE, relationship:"" }, settings, true));
  values["Tasting Offer"] = "";
  const rendered = key => renderOutreachTemplate_(String(settings[key] || ""), values, true);
  const body = ["Cocktail list intro", "Cocktail list featured cocktail", "Cocktail list distillery line", "Cocktail list reply-to-order line"]
    .map(key => rendered(key)).filter(Boolean).map(line => `<p>${line}</p>`).join("");
  const footer = `<p>${escapeOutreachHtml_(values["Physical Address"])}</p><p>Reply stop to unsubscribe.</p>`;
  return {
    stage:OUTREACH_COCKTAIL_LIST_STAGE,
    subject:renderOutreachTemplate_(String(settings["Cocktail list subject"] || ""), values, false),
    body_text:outreachHtmlToPlainText_(body),
    html:body + footer,
    footer_html:footer,
  };
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

function outreachTrackingSignature_(target, accountId, stage, secret) {
  const bytes = Utilities.computeHmacSha256Signature(`${target}\n${accountId}\n${stage}`, secret);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "");
}

function outreachTrackingUrl_(target, accountId, stage, settings, extras, testMode) {
  const baseUrl = String(settings["Tracking base URL"] || "").trim();
  const secret = PropertiesService.getScriptProperties().getProperty("TRACKING_LINK_SECRET") || "";
  if (!/^https:\/\/\S+$/i.test(baseUrl) || !secret || !accountId) return "";
  const params = Object.assign({ t:target, a:accountId, s:stage, k:outreachTrackingSignature_(target, accountId, stage, secret) }, extras || {});
  if (testMode) params.x = "test";
  return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${Object.keys(params).map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key] || "")}`).join("&")}`;
}

// What the Directory already knows, passed to the account form or ordering page so the customer doesn't retype it.
function outreachPrefillParams_(row) {
  const value = keys => String(outreachValue_(row, keys) || "").trim();
  return {
    business:value(["business", "business_name"]),
    email:value(["email", "email_address"]),
    contact:value(["contact", "contact_name", "contact_person"]),
    phone:value(["phone", "phone_number"]),
    address:value(["address", "street_address"]),
    city:value(["city"]),
    state:value(["state"]),
    zip:value(["zip_code", "zip", "postal_code"]),
  };
}

function outreachMessage_(row, settings, draft, testMode) {
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
  const applicationUrl = String(settings["Customer application URL"] || "").trim();
  const website = String(settings["Website URL"] || "").trim();
  const logo = String(settings["Logo URL"] || "").trim();
  const accountId = String(row.account_id || "").trim();
  const business = String(outreachValue_(row, ["business", "business_name"]) || "").trim();
  const email = String(outreachValue_(row, ["email", "email_address"]) || "").trim();
  const trackedSellSheet = outreachTrackingUrl_("sell_sheet", accountId, stage, settings, null, testMode);
  const prefill = outreachPrefillParams_(row);
  const prefillQuery = Object.keys(prefill).filter(key => prefill[key]).map(key => `${key}=${encodeURIComponent(prefill[key])}`).join("&");
  const directApplication = /^https:\/\/\S+$/i.test(applicationUrl)
    ? `${applicationUrl}${applicationUrl.includes("?") ? "&" : "?"}account_id=${encodeURIComponent(accountId)}${prefillQuery ? `&${prefillQuery}` : ""}`
    : "";
  const trackedApplication = outreachTrackingUrl_("application", accountId, stage, settings, prefill, testMode);
  // Anyone we have sold to gets their own ordering page instead of the account form.
  const relationship = String(outreachValue_(row, ["relationship"]) || "").trim().toLowerCase();
  const isPastCustomer = !!accountId && (OUTREACH_CUSTOMER_HISTORY_RELATIONSHIPS.includes(relationship) || String(outreachValue_(row, ["status"]) || "").trim().toLowerCase() === "existing customer");
  const orderingLink = isPastCustomer
    ? (outreachTrackingUrl_("order", accountId, stage, settings, prefill, testMode) || applicationOrderingUrl_(settings, accountId, "", business, email, prefill.contact))
    : "";
  const applicationSentence = isPastCustomer
    ? `When you're ready to order, <a href="${escapeOutreachHtml_(orderingLink)}">use your ordering page</a>. It's already set up for ${escapeOutreachHtml_(outreachDisplayBusinessName_(business) || "your business")}, so there's nothing to fill out.`
    : stage === "Reactivation"
    ? `If you'd like to set up online ordering with us, <a href="${escapeOutreachHtml_(trackedApplication || directApplication)}">complete our short wholesale account form</a>. We've filled in what we already have.`
    : `If you would like to get the account setup started, <a href="${escapeOutreachHtml_(trackedApplication || directApplication)}">complete our short wholesale customer application</a>. We've filled in what we already have.`;
  const applicationLink = (isPastCustomer || trackedApplication || directApplication)
    ? `<p>${applicationSentence}</p>`
    : "";
  const template = String(settings[keys[1]] || "");
  // Only pay for the Badger lookup when the subject or body actually uses the offer. When it is not used,
  // pass "has recent invoice" so the value stays blank rather than defaulting to the offer text.
  const needsTastingOffer = /\{\{\s*Tasting Offer\s*\}\}/i.test(`${String(settings[keys[0]] || "")}\n${template}`);
  const values = Object.assign({
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
    "Sell Sheet Link": (sellSheet ? `<p><a href="${escapeOutreachHtml_(trackedSellSheet || sellSheet)}">View our current wholesale sell sheet</a></p>` : "") + applicationLink,
  }, outreachMonthlyContentValues_(row, settings, needsTastingOffer ? outreachHasRecentBadgerInvoice_(accountId) : true));
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
  priority: ["priority"],
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
      last_click_target:"",
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
    county:String(outreachValue_(row, ["county"]) || "").trim(),
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
    "wave", "top_50", "craft_spirit_fit", "miles", "county", "email_confidence", "relationship", "newsletter_status",
    "ordering_status", "opened", "clicked", "search_text", "weekly_eligible",
    "weekly_exclusion_reasons", "has_saved_draft", "campaign", "directory_quality",
  ];
  return fields.reduce((payload, field) => {
    payload[field] = record[field];
    return payload;
  }, {});
}

function apiGetOutreachDashboard_(p) {
  const forceRefresh = String(p?.refresh || "") === "1";
  if (String(p?.slim || "") === "1" && !p?._cache_bypass) {
    // A forced refresh still goes through the cache helper so the fresh build is saved even if
    // the browser request times out; the next normal load then shows current data.
    return cachedReadPayload_("outreach_slim", () => apiGetOutreachDashboard_(Object.assign({}, p, { _cache_bypass:true })), forceRefresh, String(p?.rebuild || "") === "1" ? "rebuild" : "");
  }
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

  // Open campaign for each business (.87): labels the card; a scheduled next email keeps it off Today and out of the
  // due count, since the campaign will send it. A failure here only drops the labels.
  try {
    const membership = openCampaignMembership_();
    records.forEach(record => {
      const campaign = membership.get(String(record.account_id || "").trim()) || membership.get(`row:${Number(record.source_row)}`);
      record.campaign = campaign || null;
    });
  } catch (error) { console.warn("Campaign membership unavailable: " + String(error && error.message || error)); }
  mark("campaign_membership_ms");
  const campaignWillSend = record => record.campaign?.state === "scheduled";

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const due = records.filter(record => isDueOutreach_(record, endOfToday) && !campaignWillSend(record));
  const ready = records.filter(record => isReadyOutreach_(record) && !campaignWillSend(record))
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
  // Use the full Directory rows for quality so Notes and Customer Source never travel in the slim page payload.
  const quality = directoryQualityReportFromRows_(rows, { service_area_miles:outreachServiceAreaMiles_(getOutreachCampaignSettings_()) });
  const issuesByRow = new Map();
  Object.keys(quality.categories).forEach(name => quality.categories[name].rows.forEach(item => {
    if (!issuesByRow.has(item.row)) issuesByRow.set(item.row, []);
    issuesByRow.get(item.row).push({ type:name, label:quality.categories[name].label, detail:item.detail });
  }));
  records.forEach(record => { record.directory_quality = issuesByRow.get(record.source_row) || []; });
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
    performance: { total_ms:totalMs, stages:timings },
    summary: {
      due_today: due.length,
      total_businesses: directory.length,
      waiting: waiting.length,
      weekly_ready: weeklyReady.length,
      directory_quality: Object.assign(Object.keys(quality.categories).reduce((summary, name) => {
        summary[name] = quality.categories[name].count;
        return summary;
      }, {}), { outside_service_area:quality.outside_service_area.count }),
    },
  };
}

function apiGetOutreachRecord_(p) {
  if (!p) throw new Error("Missing body");
  const startedAt = Date.now();
  const timings = {};
  let stageStartedAt = startedAt;
  const mark = name => {
    const now = Date.now();
    timings[name] = now - stageStartedAt;
    stageStartedAt = now;
  };
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
  mark("directory_row_ms");
  const accountId = String(row.account_id || "").trim();
  const business = String(outreachValue_(row, ["business", "business_name"]) || "").trim();
  const requestedAccountId = String(p.account_id || "").trim();
  if (requestedAccountId && accountId !== requestedAccountId) {
    throw new Error("Account identity changed. Refresh and try again.");
  }

  const activityMap = outreachTargetedActivityMap_(accountId, business);
  mark("activity_lookup_ms");
  const draftMap = outreachTargetedDraftMap_(accountId, sourceRow);
  mark("draft_lookup_ms");
  const programMap = outreachTargetedProgramMap_(accountId, sourceRow);
  mark("program_lookup_ms");
  const engagementMap = outreachTargetedEngagementMap_(accountId, sourceRow);
  mark("engagement_lookup_ms");
  const settings = getOutreachCampaignSettings_();
  mark("settings_ms");

  const record = outreachRecord_(
    row,
    sourceRow,
    activityMap,
    settings,
    draftMap,
    programMap,
    engagementMap
  );
  mark("record_build_ms");
  if (!record.business) throw new Error("Business row is empty.");
  console.log(JSON.stringify({
    event:"outreach_record_timing",
    total_ms:Date.now() - startedAt,
    stages:timings,
    source_row:sourceRow,
  }));
  return { record:record, performance:{ total_ms:Date.now() - startedAt, stages:timings } };
}

