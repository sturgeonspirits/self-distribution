// Inventory API, part 8 of 12: Customer applications and online order records: public form helpers, submissions, notifications.
// The parts load in order 01 to 12 (filePushOrder in .clasp.json); version and change notes are in 01-core.gs.

function publicText_(value, maxLength, label) {
  const text = String(value ?? "").trim();
  if (text.length > maxLength) throw publicError_(`${label} is too long.`);
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
  if (required && !email) throw publicError_(`${label} is required.`);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw publicError_(`Enter a valid ${label.toLowerCase()}.`);
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
  const email = String(application.primary_email || "").trim().toLowerCase();
  const values = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const match = values.findIndex(row => String(row[h.email] || "").trim().toLowerCase() === email);
  // Any Unsubscribed or Declined row for this address counts, not just the first row.
  const optedOut = values.some(row => String(row[h.email] || "").trim().toLowerCase() === email && ["unsubscribed", "declined"].includes(String(row[h.status] || "").trim().toLowerCase()));
  const now = new Date();
  const row = match >= 0 ? values[match].slice() : Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
  const fill = (key, value) => { if (h[key] !== undefined && !String(row[h[key]] || "").trim()) row[h[key]] = value; };
  const note = `Application ${application.application_id}`;
  if (match >= 0) {
    // The public form does not prove who owns the address, so it never re-subscribes
    // an address that unsubscribed or declined, and never replaces the name, business
    // or account already on file. A Candidate/Invited contact who opts in becomes
    // Subscribed; an existing subscription keeps its original consent record. Staff
    // can re-subscribe from the Hub after confirming with the customer.
    const current = String(row[h.status] || "").trim();
    fill("contact_id", Utilities.getUuid()); // a Cocktail list send needs one
    fill("account_id", application.account_id || "");
    fill("name", application.primary_contact_name);
    fill("organization", application.business_name || application.legal_business_name);
    fill("relationship_type", "Customer");
    const kept = optedOut;
    if (!kept && current !== "Subscribed") {
      set("status", "Subscribed");
      set("consent_source", "Customer application form; option preselected and could be unchecked");
      set("consent_date", now);
      fill("topics", "Products, cocktails, distillery updates");
    }
    const existingNotes = String(row[h.notes] || "").trim();
    const addition = kept ? `${note} asked to subscribe; left ${current || "unchanged"} because this address opted out (the public form cannot re-subscribe an address)` : note;
    set("notes", existingNotes ? `${existingNotes}; ${addition}` : addition);
  } else {
    set("contact_id", Utilities.getUuid());
    set("account_id", application.account_id || "");
    set("name", application.primary_contact_name);
    set("email", email);
    set("organization", application.business_name || application.legal_business_name);
    set("relationship_type", "Customer");
    set("status", "Subscribed");
    set("consent_source", "Customer application form; option preselected and could be unchecked");
    set("consent_date", now);
    set("topics", "Products, cocktails, distillery updates");
    set("notes", note);
  }
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
  // Karl, 2026-11-19 (.80): the link opens the application in the Hub, not the staging sheet.
  const reviewUrl = hubApplicationUrl_(application.application_id);
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
    `<p><a href="${escapeOutreachHtml_(reviewUrl)}">Review this application in the Hub</a></p>`,
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

// Karl, 2026-11-19 (.80): a paper form a customer filled out, typed in by staff from the Hub's signup page
// (?paper=1). Reaches here only through the signed-in staff proxy. Staff don't sign the authorization: they confirm
// the customer signed the paper form, and the signer defaults to the form's primary contact.
function apiSubmitPaperCustomerApplication_(p) {
  if (!p) throw new Error("Missing form data.");
  const staffName = String(p.authenticated_staff_name || p.staff_name || "").trim();
  if (!staffName) throw new Error("Sign in to the Hub to enter a paper form.");
  if (!toBool_(p.paper_signed)) throw new Error("Confirm the customer signed the paper form.");
  const form = Object.assign({}, p, {
    attested:true,
    form_trap:"",
    authorized_name:String(p.authorized_name || "").trim() || String(p.primary_contact_name || "").trim(),
    authorized_title:String(p.authorized_title || "").trim() || String(p.primary_contact_title || "").trim() || "Signed paper form",
  });
  return apiSubmitCustomerApplication_(form, { source:"Paper form", entered_by:staffName });
}

function apiSubmitCustomerApplication_(p, entry) {
  if (!p) throw publicError_("Missing form data.");
  const paper = !!(entry && entry.source === "Paper form");
  if (!paper && String(p.form_trap || "").trim()) return { message:"Application received.", application_id:"RECEIVED" };
  requireFields_(p, ["legal_business_name", "business_type", "seller_permit_number", "primary_contact_name", "primary_email", "primary_phone", "delivery_address_1", "delivery_city", "delivery_state", "delivery_zip", "authorized_name", "authorized_title", "submission_token"]);
  if (!toBool_(p.attested)) throw publicError_("Authorization is required.");

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
    throw publicError_("Complete the billing address or mark it the same as delivery.");
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw publicError_("Another application is being recorded. Try again in a moment.");
  let journal = null;
  try {
    const sheet = getCustomerApplicationsSheet_(true);
    ensureHeaderColumns_(sheet, ["Notification Status", "Notification Sent At", "Notification Error", ACCOUNT_ID_HEADER, "Account Link Status", "Data Sync Status", "Submission Source", "Entered By"]);
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
    set("submission_source", paper ? "Paper form" : "Online form");
    set("entered_by", paper ? entry.entered_by : "");
    sheet.appendRow(row);
    upsertNewsletterFromApplication_(application);
    const applicationRow = sheet.getLastRow();
    if (paper) {
      // Staff typed it in, so there is no one to tell: no new-application email.
      sheet.getRange(applicationRow, h.notification_status + 1, 1, 3).setValues([["Not needed (paper form)", "", ""]]);
    } else {
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
    }
    completeSubmissionJournal_(journal, "Completed", application.application_id, "");
    appendAudit_("SUBMIT_APPLICATION", "Application", application.application_id, application.account_id, paper ? entry.entered_by : "Public customer form", paper ? "Paper customer form" : "Customer application", CUSTOMER_APPLICATIONS_SHEET_NAME, "Completed", application.account_link_status);
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
    submission_source:String(row.submission_source || "Online form"),
    entered_by:String(row.entered_by || ""),
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
    added_to_badger:toBool_(row.added_to_badger) || !!digitsOnly_(row.badger_customer_id),
    badger_customer_id:digitsOnly_(row.badger_customer_id),
    welcome_email_sent_at:row.welcome_email_sent_at || "",
    welcome_email_sent_by:String(row.welcome_email_sent_by || ""),
    welcome_email_recipient:String(row.welcome_email_recipient || ""),
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

