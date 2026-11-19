// Inventory API, part 11 of 12: Orders: account activation, application review and welcome emails, online order updates and notifications, integration reconcile.
// The parts load in order 01 to 12 (filePushOrder in .clasp.json); version and change notes are in 01-core.gs.

function upsertActiveAccountProgram_(account, customerId, sourceLabel, staffName, prefill) {
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
  if (customerId || index < 0) set("ordering_customer_id", customerId);
  const keptCustomerId = customerId || (index >= 0 && h.ordering_customer_id !== undefined ? String(values[h.ordering_customer_id] || "") : "");
  // Ordering Invite Date is when the customer was actually emailed their link (welcome or invite send),
  // never the time of an activation or a later save.
  if (prefill?.invite_date) set("ordering_invite_date", prefill.invite_date);
  const settings = getOutreachCampaignSettings_();
  set("ordering_portal_url", applicationOrderingUrl_(settings, account.account_id, keptCustomerId, prefill?.business || account.business, prefill?.email || account.email, prefill?.contact || ""));
  set("updated_at", now); set("updated_by", staffName); set("notes", `Activated from ${sourceLabel}`); set("app_version", APP_VERSION);
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
  upsertActiveAccountProgram_(account, customerId, `application ${application.application_id}`, staffName, { business:application.business_name || application.legal_business_name, email:application.ordering_email || application.primary_email, contact:application.primary_contact_name });
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
    ensureHeaderColumns_(sheet, ["Customer ID", "Assigned To", "Staff Notes", "Review Updated At", "Review Updated By", ACCOUNT_ID_HEADER, "Account Link Status", "Inventory Tracking", "Inventory Store ID", "Inventory Route", "Data Sync Status", "Added to Badger", "Badger Customer ID"]);
    const badgerCustomerId = digitsOnly_(p.badger_customer_id);
    if (String(p.badger_customer_id || "").trim() && !/^\d+$/.test(String(p.badger_customer_id).trim())) throw new Error("The Badger customer number is digits only.");
    const addedToBadger = toBool_(p.badger_added) || !!badgerCustomerId;
    const rowNumber = findRecordRow_(sheet, "application_id", applicationId);
    if (!rowNumber) throw new Error("Application not found.");
    const h = getHeaderMap_(sheet);
    try { ensureApplicationStatusValidation_(sheet, h); } catch (error) { console.warn("Application status dropdown not widened: " + String(error && error.message || error)); }
    const row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    const previousStatus = String(row[h.workflow_status] || "New");
    const business = String(row[h.business_name] || row[h.legal_business_name] || "");
    const customerId = publicText_(p.customer_id, 80, "Customer ID");
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
    // Activate on the first save as Approved/Account active, or when activation settings change.
    // A later save (e.g. a staff-note edit) leaves the account, ordering link and dates alone.
    const wasActive = APPLICATION_ACTIVE_STATUSES.includes(previousStatus) && String(h.account_link_status !== undefined ? row[h.account_link_status] : "") === "Linked and active";
    const activationChanged = !wasActive
      || (h.customer_id !== undefined && String(row[h.customer_id] || "") !== customerId)
      || (h.inventory_tracking !== undefined && toBool_(row[h.inventory_tracking]) !== toBool_(p.inventory_tracking))
      || (h.inventory_store_id !== undefined && String(row[h.inventory_store_id] || "") !== String(p.inventory_store_id || "").trim())
      || (h.inventory_route !== undefined && String(row[h.inventory_route] || "") !== String(p.inventory_route || "").trim())
      || (String(p.account_id || "").trim() && h.account_id !== undefined && String(row[h.account_id] || "") !== String(p.account_id).trim());
    if (APPLICATION_ACTIVE_STATUSES.includes(status) && !activationChanged) {
      if (h.account_id !== undefined) accountId = String(row[h.account_id] || accountId);
    } else if (APPLICATION_ACTIVE_STATUSES.includes(status)) {
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
    const badgerChanged = toBool_(h.added_to_badger !== undefined ? row[h.added_to_badger] : false) !== addedToBadger
      || String(h.badger_customer_id !== undefined ? row[h.badger_customer_id] : "").replace(/\D/g, "") !== badgerCustomerId;
    set("added_to_badger", addedToBadger);
    set("badger_customer_id", badgerCustomerId);
    if (accountId && (badgerChanged || addedToBadger)) setDirectoryBadgerCustomer_(accountId, addedToBadger, badgerCustomerId);
    appendCustomerWorkflowLog_("Application", applicationId, accountId, business, previousStatus, status, staffName, `Customer ID: ${customerId}; inventory tracking: ${toBool_(p.inventory_tracking) ? "yes" : "no"}${badgerChanged ? `; added to Badger: ${addedToBadger ? `yes${badgerCustomerId ? ` (#${badgerCustomerId})` : ""}` : "no"}` : ""}`);
    appendAudit_("UPDATE_APPLICATION", "Application", applicationId, accountId, staffName, CUSTOMER_APPLICATIONS_SHEET_NAME, CUSTOMER_APPLICATIONS_SHEET_NAME, "Completed", `${previousStatus} to ${status}`);
    const welcomeSentAt = h.welcome_email_sent_at !== undefined ? row[h.welcome_email_sent_at] : "";
    return { message:"Application updated.", application_id:applicationId, account_id:accountId, workflow_status:status, synchronization:sync,
      welcome_needed:APPLICATION_ACTIVE_STATUSES.includes(status) && !welcomeSentAt };
  } finally {
    lock.releaseLock();
  }
}

// "Approved" and "Account active" both mean the customer is set up to order. "Account active" is set
// automatically once the welcome email with the ordering link has been sent.
const APPLICATION_ACTIVE_STATUSES = ["Approved", "Account active"];
const WELCOME_HEADERS = ["Welcome Email Sent At", "Welcome Email Sent By", "Welcome Email Recipient", "Welcome Email Message ID"];
const WELCOME_DEFAULT_SUBJECT = "Your Sturgeon Spirits wholesale account is ready";
const WELCOME_DEFAULT_BODY = [
  "Hi {{First Name}},",
  "Thanks for applying. Your wholesale account for {{Business Name}} is approved, and you can order from Sturgeon Spirits anytime.",
  "Here is your ordering link:\n{{Ordering Link}}",
  "Bookmark it. It is set up for {{Business Name}}, so you just choose products and quantities. You can order by the bottle or by the case, and one bottle is the minimum.",
  "We deliver and send the invoice. As Wisconsin's distribution rules require, the invoice directs payment to Badger State Cooperative. Sturgeon Spirits stays your contact for everything else.",
  "Questions? Reply to this email or call 920-267-5192.",
  "Karl Loewenstein\nSturgeon Spirits",
].join("\n\n");

function applicationOrderingUrl_(settings, accountId, customerId, business, email, contact) {
  const params = [["account_id", accountId], ["customer_id", customerId || ""], ["business", business || ""], ["email", email || ""], ["contact", contact || ""]]
    .filter(([key, value]) => key === "account_id" || key === "customer_id" || String(value || "").trim())
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value || "").trim())}`);
  return `${publicSiteUrl_(settings)}/order.html?${params.join("&")}`;
}

function welcomeTextToHtml_(text) {
  return String(text || "").replace(/\r\n/g, "\n").trim().split(/\n{2,}/).filter(Boolean).map(block => {
    const html = escapeOutreachHtml_(block).replace(/https:\/\/[^\s<]+/g, url => {
      const clean = url.replace(/[.,;:)]+$/, "");
      return `<a href="${clean}">${clean}</a>${url.slice(clean.length)}`;
    });
    return `<p>${html.replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

// The customer's Badger status lives on the Directory row, where Badger invoice creation reads it
// (badgerCustomerIdForAccount_ uses the Badger Customer ID column).
function setDirectoryBadgerCustomer_(accountId, added, badgerCustomerId) {
  const account = accountIdentityLookup_().by_id.get(String(accountId || ""));
  if (!account) return false;
  const directory = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const dh = ensureHeaderColumns_(directory, ["Added to Badger", "Badger Customer ID"]);
  directory.getRange(account.source_row, dh.added_to_badger + 1).setValue(!!added);
  directory.getRange(account.source_row, dh.badger_customer_id + 1).setValue(badgerCustomerId ? `'${badgerCustomerId}` : "");
  return true;
}

// The Customer Applications Workflow Status column has a dropdown rule that predates the Hub's
// statuses. Widen it (keeping every value it already allows) so each status the Hub offers can be saved.
const APPLICATION_STATUS_VALUES = ["New", "Reviewing", "Needs information", "Approved", "Account active", "Declined"];
function ensureApplicationStatusValidation_(sheet, h) {
  if (!sheet || h.workflow_status === undefined || sheet.getMaxRows() < 2) return;
  const range = sheet.getRange(2, h.workflow_status + 1, sheet.getMaxRows() - 1, 1);
  const rule = range.getCell(1, 1).getDataValidation();
  if (!rule || rule.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) return;
  const allowed = (rule.getCriteriaValues()[0] || []).map(String);
  const missing = APPLICATION_STATUS_VALUES.filter(value => !allowed.includes(value));
  if (!missing.length) return;
  range.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(allowed.concat(missing), true).setAllowInvalid(false).build());
}

function applicationForWelcome_(applicationId) {
  const sheet = getCustomerApplicationsSheet_(false);
  if (!sheet) throw new Error("Customer Applications sheet is missing.");
  ensureHeaderColumns_(sheet, WELCOME_HEADERS);
  const rowNumber = findRecordRow_(sheet, "application_id", applicationId);
  if (!rowNumber) throw new Error("Application not found.");
  const h = getHeaderMap_(sheet);
  const row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  const record = customerApplicationRecord_(Object.assign({ source_row:rowNumber }, Object.keys(h).reduce((item, key) => { item[key] = row[h[key]]; return item; }, {})));
  if (!APPLICATION_ACTIVE_STATUSES.includes(record.workflow_status)) throw new Error("Approve the application before sending the welcome email.");
  if (!record.account_id) throw new Error("This application is not linked to an account yet. Save it as Approved first.");
  const account = accountIdentityLookup_().by_id.get(record.account_id);
  if (!account) throw new Error("The linked account was not found in the Directory.");
  const program = outreachProgramMap_().get(record.account_id);
  const orderingUrl = String(program?.ordering_portal_url || "").trim();
  if (!/^https:\/\/\S+$/i.test(orderingUrl)) throw new Error("The account has no ordering link yet. Save the application as Approved again.");
  return { sheet, rowNumber, h, record, account, orderingUrl };
}

function apiPreviewApplicationWelcome_(p) {
  requireFields_(p || {}, ["application_id"]);
  const { record, orderingUrl } = applicationForWelcome_(publicText_(p.application_id, 80, "Application ID"));
  const settings = getOutreachCampaignSettings_();
  const contact = String(record.primary_contact_name || "").trim();
  const business = outreachDisplayBusinessName_(record.business_name || record.legal_business_name || "your business");
  const values = { "first name":contact ? contact.split(/\s+/)[0] : "there", "business name":business, "ordering link":orderingUrl };
  const fill = text => String(text || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, key) => values[key.toLowerCase()] ?? match);
  const subject = fill(String(settings["Welcome email subject"] || "").trim() || WELCOME_DEFAULT_SUBJECT);
  let bodyText = fill(String(settings["Welcome email body"] || "").trim() || WELCOME_DEFAULT_BODY);
  if (!bodyText.includes(orderingUrl)) bodyText += `\n\nYour ordering link:\n${orderingUrl}`;
  return {
    application_id:record.application_id, account_id:record.account_id, business:business,
    recipient:String(record.ordering_email || record.primary_email || "").trim().toLowerCase(),
    subject:subject, body_text:bodyText, ordering_url:orderingUrl,
    already_sent_at:record.welcome_email_sent_at || "", already_sent_by:record.welcome_email_sent_by || "",
    already_sent_to:record.welcome_email_recipient || "",
  };
}

function apiSendApplicationWelcome_(p) {
  if (!p) throw new Error("Missing welcome email.");
  requireFields_(p, ["application_id", "recipient", "subject", "body_text", "idempotency_token", "staff_name"]);
  const token = String(p.idempotency_token || "").trim();
  if (!/^[A-Za-z0-9_-]{20,160}$/.test(token)) throw new Error("A valid idempotency token is required.");
  const staffName = publicText_(p.staff_name, 120, "Staff name");
  const recipient = String(p.recipient || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error("Enter a valid recipient email.");
  const subject = String(p.subject || "").trim();
  if (!subject || subject.length > 200) throw new Error("The subject must be 1 to 200 characters.");
  const bodyText = String(p.body_text || "").replace(/\r\n/g, "\n").trim();
  if (!bodyText || bodyText.length > 10000) throw new Error("The message must be 1 to 10,000 characters.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another customer update is in progress. Try again in a moment.");
  let acceptedMessageId = "";
  let accepted = false;
  try {
    const { sheet, rowNumber, h, record, account, orderingUrl } = applicationForWelcome_(publicText_(p.application_id, 80, "Application ID"));
    if (!bodyText.includes(orderingUrl)) throw new Error("Keep the ordering link in the message. It is how the customer orders.");
    if (record.welcome_email_sent_at && !toBool_(p.send_again)) {
      throw new Error(`The welcome email was already sent to ${record.welcome_email_recipient || "this customer"}. Use Send again to send another.`);
    }
    const settings = getOutreachCampaignSettings_();
    const website = String(settings["Website URL"] || "").trim();
    const logo = String(settings["Logo URL"] || "").trim();
    const footer = website && logo ? `<p><a href="${escapeOutreachHtml_(website)}"><img src="${escapeOutreachHtml_(logo)}" alt="Sturgeon Spirits"></a></p>` : "";
    const result = callOutreachMailer_({
      action:"sendWelcomeEmail",
      idempotency_token:token,
      account_id:account.account_id,
      source_row:account.source_row,
      business:account.business,
      recipient:recipient,
      message_stage:OUTREACH_CUSTOMER_INVITE_STAGE,
      subject:subject,
      html:welcomeTextToHtml_(bodyText) + footer,
      requested_by:staffName,
    });
    if (!result.accepted) throw new Error("Zoho did not accept the email.");
    accepted = true;
    acceptedMessageId = String(result.message_id || "");
    const sentAt = result.sent_at && !isNaN(new Date(result.sent_at).getTime()) ? new Date(result.sent_at) : new Date();
    const set = (key, value) => { if (h[key] !== undefined) sheet.getRange(rowNumber, h[key] + 1).setValue(value); };
    // Record the send first. Nothing after this point may report a sent email as failed.
    set("welcome_email_sent_at", sentAt);
    set("welcome_email_sent_by", staffName);
    set("welcome_email_recipient", recipient);
    set("welcome_email_message_id", acceptedMessageId ? `'${acceptedMessageId}` : "");
    set("review_updated_at", sentAt);
    set("review_updated_by", staffName);
    const programs = getOutreachProgramSheet_(false);
    if (programs && programs.getLastRow() >= 2) {
      const ph = getHeaderMap_(programs);
      const ids = programs.getRange(2, ph.account_id + 1, programs.getLastRow() - 1, 1).getValues();
      const index = ids.findIndex(item => String(item[0] || "") === account.account_id);
      if (index >= 0 && ph.ordering_invite_date !== undefined) programs.getRange(index + 2, ph.ordering_invite_date + 1).setValue(sentAt);
    }
    let workflowStatus = "Account active";
    let statusNote = "";
    try {
      ensureApplicationStatusValidation_(sheet, h);
      set("workflow_status", workflowStatus);
    } catch (statusError) {
      workflowStatus = record.workflow_status;
      statusNote = `; status left ${workflowStatus}: ${String(statusError && statusError.message || statusError).slice(0, 300)}`;
    }
    appendCustomerWorkflowLog_("Application", record.application_id, account.account_id, record.business_name, record.workflow_status, workflowStatus, staffName, `Welcome email sent to ${recipient}${result.idempotent ? " (replayed receipt)" : ""}`);
    appendAudit_("SEND_WELCOME_EMAIL", "Application", record.application_id, account.account_id, staffName, CUSTOMER_APPLICATIONS_SHEET_NAME, "Distribution Outreach", "Completed", `Message ${acceptedMessageId || "without ID"} to ${recipient}${statusNote}`);
    if (result.partial_failure) appendAudit_("SEND_WELCOME_EMAIL_PARTIAL", "Application", record.application_id, account.account_id, staffName, "Distribution Outreach", "Activity Log", "Needs recovery", String(result.partial_failure));
    return { message:"Welcome email sent.", accepted:true, message_id:acceptedMessageId, workflow_status:workflowStatus, idempotent:!!result.idempotent };
  } catch (error) {
    if (accepted) {
      appendAudit_("SEND_WELCOME_EMAIL_PARTIAL", "Application", String(p.application_id || ""), "", staffName, "Distribution Outreach", CUSTOMER_APPLICATIONS_SHEET_NAME, "Needs recovery", `Zoho accepted message ${acceptedMessageId || "without ID"}; ${String(error.message || error)}`);
      throw new Error(`Zoho accepted the welcome email${acceptedMessageId ? ` (${acceptedMessageId})` : ""}, but recording it needs recovery. Do not send again.`);
    }
    throw error;
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

// Staff add or remove products on an order before it is invoiced (2026.11.17.65-APP). Customers ask for extra
// bottles in the order notes ("please add one of each"); this puts them on the order so the Badger invoice
// preview, which is built from the order lines, includes them. Only active SKUs (the SKUs tab) can be added.
// p: { request_id, staff_name, op:"add"|"remove", sku_id, quantity, unit } or { ..., op:"remove", line_number }.
function orderLineEditBlock_(order) {
  if (String(order.badger_invoice_number || "").trim()) return "This order already has a Badger invoice, so its products can't change here.";
  if (["Completed", "Cancelled"].includes(String(order.workflow_status || ""))) return `A ${String(order.workflow_status).toLowerCase()} order's products can't change.`;
  return "";
}

function apiUpdateOnlineOrderLines_(p) {
  if (!p) throw new Error("Missing order change.");
  requireFields_(p, ["request_id", "staff_name", "op"]);
  const requestId = publicText_(p.request_id, 80, "Request ID");
  const staffName = publicText_(p.staff_name, 120, "Staff name");
  const op = String(p.op || "");
  if (!["add", "remove"].includes(op)) throw new Error("Choose add or remove.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Another order update is in progress. Try again in a moment.");
  try {
    const source = badgerOrderForInvoice_(requestId); const order = source.order;
    const blocked = orderLineEditBlock_(order);
    if (blocked) throw new Error(blocked);
    const lineSheet = getOnlineOrderLinesSheet_(false);
    if (!lineSheet) throw new Error("Online Order Lines sheet is missing.");
    const lh = getHeaderMap_(lineSheet);
    const existing = rowsWithSource_(lineSheet).filter(line => String(line.request_id || "") === requestId);
    let detail = "";

    if (op === "add") {
      const skuId = publicText_(p.sku_id, 120, "Product");
      const sku = apiListSkus_().skus.find(item => String(item.sku_id) === skuId);
      if (!sku) throw new Error("That product isn't active on the SKUs tab (Distribution Hub - Inventory Backend).");
      const quantity = Number(p.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error("Enter a whole-number quantity from 1 to 999.");
      const unit = String(p.unit || "Bottles");
      if (!["Cases", "Bottles"].includes(unit)) throw new Error("Choose bottles or cases.");
      const unitsPerCase = Number(sku.units_per_case || 12);
      const same = existing.find(line => String(line.sku_id || "") === skuId && String(line.unit || "") === unit);
      if (same) {
        const newQuantity = Number(same.quantity || 0) + quantity;
        if (newQuantity > 999) throw new Error("That would put more than 999 on one line.");
        if (lh.quantity !== undefined) lineSheet.getRange(same.source_row, lh.quantity + 1).setValue(newQuantity);
        if (lh.bottle_equivalent !== undefined) lineSheet.getRange(same.source_row, lh.bottle_equivalent + 1).setValue(unit === "Cases" ? newQuantity * unitsPerCase : newQuantity);
      } else {
        const values = Array(lineSheet.getLastColumn()).fill("");
        const setLine = (key, value) => { if (lh[key] !== undefined) values[lh[key]] = value; };
        setLine("request_id", requestId); setLine("account_id", order.account_id); setLine("line_number", existing.reduce((max, line) => Math.max(max, Number(line.line_number || 0)), 0) + 1);
        setLine("sku_id", skuId); setLine("sku_name", String(sku.sku_name || skuId)); setLine("quantity", quantity); setLine("unit", unit);
        setLine("units_per_case", unitsPerCase); setLine("bottle_equivalent", unit === "Cases" ? quantity * unitsPerCase : quantity);
        setLine("catalog_source", String(sku.catalog_source || ORDER_CATALOG_SOURCE)); setLine("external_item_id", String(sku.external_item_id || "")); setLine("app_version", APP_VERSION);
        lineSheet.getRange(lineSheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
      }
      detail = `Added ${orderQuantityLabel_(quantity, unit)} of ${String(sku.sku_name || skuId)}.`;
    } else {
      const lineNumber = Number(p.line_number);
      const target = existing.find(line => Number(line.line_number || 0) === lineNumber);
      if (!target) throw new Error("That product line is no longer on this order. Reload the order.");
      if (existing.length <= 1) throw new Error("An order needs at least one product. Cancel the order instead.");
      lineSheet.deleteRow(target.source_row);
      detail = `Removed ${orderQuantityLabel_(target.quantity, target.unit)} of ${String(target.sku_name || target.sku_id || "")}.`;
    }

    const lines = rowsWithSource_(lineSheet).filter(line => String(line.request_id || "") === requestId)
      .sort((a, b) => Number(a.line_number || 0) - Number(b.line_number || 0))
      .map(line => ({ line_number:Number(line.line_number || 0), account_id:String(line.account_id || ""), sku_id:String(line.sku_id || ""), sku_name:String(line.sku_name || ""), quantity:Number(line.quantity || 0), unit:String(line.unit || ""), units_per_case:Number(line.units_per_case || 0), bottle_equivalent:Number(line.bottle_equivalent || 0), catalog_source:String(line.catalog_source || ORDER_CATALOG_SOURCE), external_item_id:String(line.external_item_id || "") }));
    const h = source.headers; const rowNumber = source.row_number;
    const set = (key, value) => { if (h[key] !== undefined) source.sheet.getRange(rowNumber, h[key] + 1).setValue(value); };
    set("line_count", lines.length);
    set("requested_cases", lines.filter(line => line.unit === "Cases").reduce((sum, line) => sum + line.quantity, 0));
    set("requested_bottles", lines.filter(line => line.unit === "Bottles").reduce((sum, line) => sum + line.quantity, 0));
    set("bottle_equivalent", lines.reduce((sum, line) => sum + line.bottle_equivalent, 0));
    set("review_updated_at", new Date()); set("review_updated_by", staffName);
    appendCustomerWorkflowLog_("Order", requestId, order.account_id, order.business_name, order.workflow_status, order.workflow_status, staffName, detail);
    appendAudit_("UPDATE_ORDER_LINES", "Order", requestId, order.account_id, staffName, ONLINE_ORDER_REQUESTS_SHEET_NAME, ONLINE_ORDER_LINES_SHEET_NAME, "Completed", detail);
    const priced = pricedOrderLines_(lines, order.account_id, badgerCurrentPrices_(false));
    const totals = orderTotalsFromLines_(priced);
    return { message:detail, request_id:requestId, lines:priced, order_total_cents:totals.total_cents, order_total_bottles:totals.bottles, unpriced_lines:totals.unpriced };
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

// Priced order lines (2026.11.17.65-APP), for the new-order email and the Hub's order window. Prices come from the
// same catalog the Badger invoice uses (SKU tier or override, then an account deal); a line with no price gets
// unit_price_cents 0 so the email and the Hub can say "price not set" instead of guessing.
function pricedOrderLines_(lines, accountId, prices) {
  return (lines || []).map(line => {
    const quantity = Number(line.quantity || 0);
    const bottles = /case/i.test(String(line.unit || "")) ? quantity * Number(line.units_per_case || 0) : quantity;
    const price = badgerPriceForOrderLine_(prices || [], accountId, line);
    const cents = price ? Number(price.unit_price_cents || 0) : 0;
    return Object.assign({}, line, { bottles:bottles, unit_price_cents:cents, line_total_cents:cents > 0 ? Math.round(bottles * cents) : 0 });
  });
}

function orderTotalsFromLines_(pricedLines) {
  return (pricedLines || []).reduce((totals, line) => {
    totals.bottles += Number(line.bottles || 0);
    totals.total_cents += Number(line.line_total_cents || 0);
    if (!(Number(line.unit_price_cents) > 0)) totals.unpriced += 1;
    return totals;
  }, { bottles:0, total_cents:0, unpriced:0 });
}

function orderQuantityLabel_(quantity, unit) {
  const count = Number(quantity || 0); const word = String(unit || "").toLowerCase();
  return `${count} ${count === 1 ? word.replace(/s$/, "") : word}`;
}

// Link that opens one application in the Hub's Orders & Accounts window (index.html reads ?application=).
function hubApplicationUrl_(applicationId) {
  return hubOrderUrl_("").replace(/\?order=$/, `?application=${encodeURIComponent(String(applicationId || ""))}`);
}

// Link that opens one order in the Hub's Orders & Accounts window (index.html reads ?order=).
function hubOrderUrl_(requestId) {
  let base = PUBLIC_SITE_URL_FALLBACK;
  try { base = publicSiteUrl_(getOutreachCampaignSettings_()); } catch (error) { console.warn("Public site URL unavailable: " + String(error?.message || error)); }
  return `${base}/?order=${encodeURIComponent(String(requestId || ""))}`;
}

function orderEmailDateLabel_(value) {
  const text = String(value || "").trim();
  if (!text) return "Not specified";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : new Date(text);
  if (isNaN(date.getTime())) return text;
  try { return Utilities.formatDate(date, Session.getScriptTimeZone(), "EEE, MMM d, yyyy"); } catch (_) { return text; }
}

// Builds the new-order email (2026.11.17.65-APP; Karl, 2026-11-17: "it should take me to something clear so that
// i can create a badger invoice"). The bottles, prices and the customer's notes are in the email itself, and the
// main link opens the order in the Hub. The raw spreadsheet row stays as a small link at the bottom.
function onlineOrderNotificationContent_(request, pricedLines, hubUrl, sheetUrl) {
  const esc = escapeOutreachHtml_;
  const totals = orderTotalsFromLines_(pricedLines);
  const money = cents => Number(cents) > 0 ? badgerMoneyLabel_(cents) : "Price not set";
  const qtyLabel = line => orderQuantityLabel_(line.quantity, line.unit);
  const notes = String(request.notes || "").trim();
  const accountNote = request.account_id ? "Linked to an account" : "Not linked to an account yet: link it in the Hub before creating the Badger invoice";
  const delivery = [
    ["Requested delivery", orderEmailDateLabel_(request.requested_delivery_date)],
    ["Delivery window", request.delivery_window || "Not specified"],
    ["Delivery instructions", request.delivery_instructions || "None"],
    ["PO number", request.po_number || "None"],
  ];
  const contact = [
    ["Contact", request.contact_name], ["Email", request.email], ["Phone", request.phone || "Not provided"],
    ["Account", accountNote], ["Order ID", request.request_id],
  ];
  const subject = `New order: ${request.business_name} (${totals.bottles} bottle${totals.bottles === 1 ? "" : "s"}${totals.total_cents ? `, ${badgerMoneyLabel_(totals.total_cents)}` : ""})${notes ? " - see customer notes" : ""}`;

  const plain = [`New order from ${request.business_name}`, "", `Open this order in the Hub: ${hubUrl}`, ""];
  if (notes) plain.push("CUSTOMER NOTES (may change the order):", notes, "");
  plain.push("PRODUCTS");
  pricedLines.forEach(line => plain.push(`  ${qtyLabel(line)} - ${line.sku_name}${line.sku_id ? ` (${line.sku_id})` : ""} - ${money(line.unit_price_cents)}${line.line_total_cents ? ` each, ${badgerMoneyLabel_(line.line_total_cents)}` : ""}`));
  plain.push(`  Total: ${totals.bottles} bottles${totals.total_cents ? `, ${badgerMoneyLabel_(totals.total_cents)}` : ""}${totals.unpriced ? ` (${totals.unpriced} product${totals.unpriced === 1 ? "" : "s"} without a price)` : ""}`, "");
  delivery.concat(contact).forEach(([label, value]) => plain.push(`${label}: ${value || ""}`));
  plain.push("", `Spreadsheet row (raw data): ${sheetUrl}`);

  const cell = "padding:8px 10px;border-bottom:1px solid #e3e3e3;";
  const rowsHtml = pricedLines.map(line => `<tr>
    <td style="${cell}"><strong>${esc(line.sku_name)}</strong><br><span style="color:#777;font-size:12px">${esc(line.sku_id || "")}</span></td>
    <td style="${cell}text-align:right;white-space:nowrap">${esc(qtyLabel(line))}</td>
    <td style="${cell}text-align:right">${esc(line.bottles)}</td>
    <td style="${cell}text-align:right;white-space:nowrap">${esc(money(line.unit_price_cents))}</td>
    <td style="${cell}text-align:right;white-space:nowrap">${line.line_total_cents ? esc(badgerMoneyLabel_(line.line_total_cents)) : "&mdash;"}</td></tr>`).join("");
  const detailHtml = pairs => `<table style="border-collapse:collapse;font-size:14px">${pairs.map(([label, value]) => `<tr><td style="padding:3px 12px 3px 0;color:#666;vertical-align:top;white-space:nowrap">${esc(label)}</td><td style="padding:3px 0">${esc(value || "")}</td></tr>`).join("")}</table>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:640px">
  <h2 style="margin:0 0 4px">New order from ${esc(request.business_name)}</h2>
  <p style="margin:0 0 16px;color:#666">${esc(orderEmailDateLabel_(request.requested_delivery_date))}${request.delivery_window ? ` &middot; ${esc(request.delivery_window)}` : ""}</p>
  <p style="margin:0 0 18px"><a href="${esc(hubUrl)}" style="background:#44656b;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block;font-weight:bold">Open this order in the Hub</a></p>
  ${notes ? `<div style="background:#fff4cc;border:1px solid #e6c34d;border-radius:6px;padding:10px 12px;margin:0 0 18px"><strong>Customer notes (may change the order)</strong><br>${esc(notes).replace(/\n/g, "<br>")}</div>` : ""}
  <table style="border-collapse:collapse;width:100%;font-size:14px;margin:0 0 6px">
    <thead><tr style="background:#f3f3f3;text-align:left"><th style="${cell}">Product</th><th style="${cell}text-align:right">Ordered</th><th style="${cell}text-align:right">Bottles</th><th style="${cell}text-align:right">Price</th><th style="${cell}text-align:right">Total</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot><tr><td style="padding:8px 10px"><strong>Total</strong></td><td></td><td style="padding:8px 10px;text-align:right"><strong>${esc(totals.bottles)}</strong></td><td></td><td style="padding:8px 10px;text-align:right"><strong>${totals.total_cents ? esc(badgerMoneyLabel_(totals.total_cents)) : "&mdash;"}</strong></td></tr></tfoot>
  </table>
  ${totals.unpriced ? `<p style="color:#9a3b00;font-size:13px;margin:0 0 12px">${totals.unpriced} product${totals.unpriced === 1 ? " has" : "s have"} no wholesale price on the SKUs tab.</p>` : ""}
  <h3 style="margin:18px 0 6px;font-size:15px">Delivery</h3>${detailHtml(delivery)}
  <h3 style="margin:18px 0 6px;font-size:15px">Customer</h3>${detailHtml(contact)}
  <p style="margin:22px 0 0;font-size:12px;color:#888"><a href="${esc(sheetUrl)}" style="color:#888">Spreadsheet row (raw data)</a></p>
</div>`;
  return { subject:subject, body:plain.join("\n"), html:html, totals:totals };
}

function sendOnlineOrderNotification_(request, lines, sheet, rowNumber) {
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${OUTREACH_SPREADSHEET_ID}/edit#gid=${sheet.getSheetId()}&range=A${rowNumber}`;
  let prices = [];
  try { prices = badgerCurrentPrices_(false); } catch (error) { console.warn("Order email prices unavailable: " + String(error?.message || error)); }
  const content = onlineOrderNotificationContent_(request, pricedOrderLines_(lines, request.account_id, prices), hubOrderUrl_(request.request_id), sheetUrl);
  try {
    MailApp.sendEmail({
      to: CUSTOMER_APPLICATION_NOTIFICATION_EMAIL,
      replyTo: request.email,
      name: "Sturgeon Distribution Hub",
      subject: content.subject,
      body: content.body,
      htmlBody: content.html,
    });
    return { status:"Sent", sent_at:new Date(), error:"" };
  } catch (error) {
    return { status:"Send error", sent_at:"", error:String(error).slice(0, 500) };
  }
}

function apiSubmitOnlineOrderRequest_(p) {
  if (!p) throw publicError_("Missing order data.");
  if (String(p.form_trap || "").trim()) return { message:"Order request received.", request_id:"RECEIVED" };
  requireFields_(p, ["business_name", "contact_name", "email", "submission_token"]);
  if (!Array.isArray(p.lines) || !p.lines.length) throw publicError_("Choose at least one product.");
  if (p.lines.length > 50) throw publicError_("An order request can contain up to 50 products.");

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
    if (!sku) throw publicError_(`Product ${index + 1} is not available.`);
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw publicError_(`Product ${index + 1} needs a whole-number quantity from 1 to 999.`);
    const unit = String(line.unit || "");
    if (!["Cases", "Bottles"].includes(unit)) throw publicError_(`Product ${index + 1} has an unsupported unit.`);
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
  if (!lock.tryLock(5000)) throw publicError_("Another order request is being recorded. Try again in a moment.");
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
      delivery_window:deliveryWindow,
      delivery_instructions:deliveryInstructions,
      po_number:poNumber,
      notes:notes,
      account_id:verification.account_id,
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
    return { message:"Order request received for confirmation.", request_id:requestId };
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

