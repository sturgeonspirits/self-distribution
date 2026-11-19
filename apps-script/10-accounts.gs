// Inventory API, part 10 of 12: Accounts: the Orders & Accounts ledger and work queue, Badger payment reminders, inventory stores for new customers, public site URL.
// The parts load in order 01 to 12 (filePushOrder in .clasp.json); version and change notes are in 01-core.gs.

function buildCustomerAccounts_(applications, orders, bypassBadgerCache) {
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
  const badgerSync = badgerSyncState_();
  let badgerInvoices = [];
  try {
    badgerInvoices = cachedBadgerInvoices_(!!bypassBadgerCache);
    if (bypassBadgerCache) cacheBadgerInvoices_(badgerInvoices);
  } catch (err) {
    console.warn("Badger invoice history was unavailable: " + String(err && err.message || err));
  }
  let paymentMarks = new Map();
  let paymentMarksAvailable = false;
  try { paymentMarks = badgerPaymentMarks_(); paymentMarksAvailable = true; }
  catch (err) { console.warn("Badger payment marks were unavailable: " + String(err && err.message || err)); }
  let activePaymentMarkKeys = new Set();
  try { activePaymentMarkKeys = activeBadgerPaymentMarkInvoiceKeys_(); }
  catch (err) { console.warn("Badger payment-mark history was unavailable: " + String(err && err.message || err)); }
  const pendingRemindersByAccount = new Map();
  try {
    badgerPaymentReminderHistory_().filter(item => String(item.status || "").toUpperCase() === "PENDING").forEach(item => {
      if (!pendingRemindersByAccount.has(item.account_id)) pendingRemindersByAccount.set(item.account_id, []);
      pendingRemindersByAccount.get(item.account_id).push(item);
    });
  } catch (err) { console.warn("Badger reminder history was unavailable: " + String(err && err.message || err)); }
  const badgerStatusIsFresh = badgerSync.is_fresh && paymentMarksAvailable;
  const paymentReminderMinAgeDays = paymentReminderMinAgeDays_();
  const explicitInvoiceLinks = readBadgerInvoiceLinks_();
  const customerAliases = readBadgerCustomerAliases_();
  let locationNames = [];
  try {
    locationNames = cachedBadgerLocationNames_(!!bypassBadgerCache);
  } catch (err) {
    console.warn("Badger Location_Directory was unavailable: " + String(err && err.message || err));
  }
  const accountsByMatchKey = new Map();
  identity.rows.forEach(row => {
    const businessKey = normalizeCustomerMatchKey_(outreachValue_(row, ["business", "business_name"]));
    const accountId = String(row.account_id || "").trim();
    if (!businessKey || !accountId) return;
    if (!accountsByMatchKey.has(businessKey)) accountsByMatchKey.set(businessKey, new Set());
    accountsByMatchKey.get(businessKey).add(accountId);
  });
  const locationPublicKeysByInvoiceKey = new Map();
  locationNames.forEach(item => {
    const invoiceKey = normalizeCustomerMatchKey_(item.invoice_name);
    const publicKey = normalizeCustomerMatchKey_(item.public_name);
    if (!invoiceKey || !publicKey) return;
    if (!locationPublicKeysByInvoiceKey.has(invoiceKey)) locationPublicKeysByInvoiceKey.set(invoiceKey, new Set());
    locationPublicKeysByInvoiceKey.get(invoiceKey).add(publicKey);
  });
  const orderAccountsByInvoice = new Map();
  orders.forEach(order => {
    const invoiceKey = normalizeBadgerInvoiceNumber_(order.badger_invoice_number);
    const accountId = String(order.account_id || "").trim();
    if (!invoiceKey || !accountId) return;
    if (!orderAccountsByInvoice.has(invoiceKey)) orderAccountsByInvoice.set(invoiceKey, new Set());
    orderAccountsByInvoice.get(invoiceKey).add(accountId);
  });
  const invoicesByAccount = new Map();
  const assignedInvoiceAccounts = new Map();
  const conflictingOrderInvoiceKeys = new Set(Array.from(orderAccountsByInvoice.entries())
    .filter(([, accountIds]) => accountIds.size > 1)
    .map(([invoiceKey]) => invoiceKey));
  const unmatchedBadgerInvoices = [];
  const ignoredBadgerInvoices = [];
  const voidedBadgerInvoices = [];
  const ignoredInvoiceKeys = new Set();
  badgerInvoices.forEach(invoice => {
    const invoiceKey = normalizeBadgerInvoiceNumber_(invoice.invoice_number);
    const explicit = explicitInvoiceLinks.get(invoiceKey);
    const orderedAccounts = orderAccountsByInvoice.get(invoiceKey) || new Set();
    // Badger cannot delete an invoice created in error, so staff void it in the Hub. A voided
    // invoice is kept out of every ledger, balance, reminder, and pass-through check.
    if (String(explicit?.match_method || "").trim().toLowerCase() === "void") {
      ignoredInvoiceKeys.add(invoiceKey);
      voidedBadgerInvoices.push(Object.assign({}, invoice, { match_method:"Void", void_reason:explicit.notes || "", voided_by:explicit.linked_by || "", voided_at:explicit.linked_at || "" }));
      return;
    }
    if (String(explicit?.match_method || "").trim().toLowerCase() === "ignored") {
      ignoredInvoiceKeys.add(invoiceKey);
      ignoredBadgerInvoices.push(Object.assign({}, invoice, { match_method:"Ignored" }));
      return;
    }
    // Match order: manual invoice link → order link → learned customer name → Badger location name → business name.
    let accountId = explicit?.account_id || "";
    let matchMethod = accountId ? "Manual link" : "";
    let ambiguous = false;
    let staleReason = accountId && !identity.by_id.has(accountId) ? "Linked Account ID is no longer in the directory" : "";
    if (!accountId && orderedAccounts.size > 1) {
      unmatchedBadgerInvoices.push(Object.assign({}, invoice, { match_reason:"Orders on more than one account reference this invoice." }));
      return;
    }
    if (!accountId && orderedAccounts.size === 1) {
      accountId = Array.from(orderedAccounts)[0];
      matchMethod = "Linked order";
    }
    const customerKey = normalizeCustomerMatchKey_(invoice.customer_name);
    const exactAlias = customerAliases.by_name.get(canonicalBadgerAliasName_(invoice.customer_name));
    const looseAliasAccounts = customerKey ? Array.from(customerAliases.by_key.get(customerKey) || []) : [];
    let learnedAccountId = "";
    let learnedMethod = "";
    if (exactAlias) {
      if (exactAlias.ambiguous) ambiguous = true;
      else { learnedAccountId = exactAlias.account_id; learnedMethod = "Learned customer name"; }
    } else if (looseAliasAccounts.length === 1) {
      learnedAccountId = looseAliasAccounts[0];
      learnedMethod = "Learned customer name (similar spelling)";
    } else if (looseAliasAccounts.length > 1) {
      ambiguous = true;
    }
    if (!accountId && learnedAccountId) {
      if (identity.by_id.has(learnedAccountId)) {
        accountId = learnedAccountId;
        matchMethod = learnedMethod;
      } else {
        staleReason = "The learned Account ID for this customer name is no longer in the directory";
      }
    }
    if (!accountId && !staleReason && customerKey && locationPublicKeysByInvoiceKey.has(customerKey)) {
      const locationKeys = locationPublicKeysByInvoiceKey.get(customerKey);
      if (locationKeys.size !== 1) {
        ambiguous = true;
      } else {
        const candidates = Array.from(accountsByMatchKey.get(Array.from(locationKeys)[0]) || []);
        if (candidates.length === 1) {
          accountId = candidates[0];
          matchMethod = "Badger location name";
        } else if (candidates.length > 1) ambiguous = true;
      }
    }
    if (!accountId && !staleReason && customerKey) {
      const candidates = Array.from(accountsByMatchKey.get(customerKey) || []);
      if (candidates.length === 1) {
        accountId = candidates[0];
        matchMethod = "Business name";
      } else if (candidates.length > 1) ambiguous = true;
    }
    if (!accountId || !identity.by_id.has(accountId)) {
      unmatchedBadgerInvoices.push(Object.assign({}, invoice, {
        match_reason:staleReason || (ambiguous ? "More than one account could match" : "No account match"),
      }));
      return;
    }
    if (!invoicesByAccount.has(accountId)) invoicesByAccount.set(accountId, []);
    assignedInvoiceAccounts.set(invoiceKey, accountId);
    const paymentMark = paymentMarks.get(invoiceKey) || { paid_to_me:false, submitted:"" };
    const status = badgerInvoicePaymentState_(badgerStatusIsFresh, invoice.is_closed, paymentMark.paid_to_me, paymentMark.submitted);
    invoicesByAccount.get(accountId).push(Object.assign({}, invoice, {
      account_id:accountId,
      match_method:matchMethod,
      invoice_status:status,
      payment_status:status,
      badger_match_status:"Matched",
      has_payment_mark:activePaymentMarkKeys.has(invoiceKey),
    }));
  });
  const now = new Date();
  const accounts = [];

  identity.rows.forEach((row, index) => {
    const accountId = String(row.account_id || "").trim();
    if (!accountId) return;
    const business = String(outreachValue_(row, ["business", "business_name"]) || "").trim();
    const email = String(outreachValue_(row, ["email", "email_address"]) || "").trim();
    const apEmail = String(outreachValue_(row, ["ap_email", "accounts_payable_email", "accounts_payable_contact_email"]) || "").trim();
    const relationship = String(outreachValue_(row, ["relationship"]) || "").trim();
    const directoryStatus = String(outreachValue_(row, ["status"]) || "").trim();
    const accountApplications = applications.filter(item => item.account_id === accountId);
    const accountOrders = orders.filter(item => item.account_id === accountId);
    const linkedInvoices = (invoicesByAccount.get(accountId) || []).slice();
    const program = programs.get(accountId) || programs.get(index + 2) || {};
    const isCustomer = accountApplications.some(item => ["Approved", "Account active"].includes(item.workflow_status))
      || accountOrders.length > 0
      || String(program.ordering_status || "") === "Active"
      || /customer/i.test(relationship)
      || /existing customer/i.test(directoryStatus)
      || linkedInvoices.length > 0;
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
    // An invoice created from an Online request is one business event. Preserve
    // that request ID on the Badger record so every invoice/payment view can
    // lead staff back to the originating request without inventing a request
    // for invoices that predate the Hub.
    const invoices = linkedInvoices.map(invoice => {
      const invoiceKey = normalizeBadgerInvoiceNumber_(invoice.invoice_number);
      const sourceOrder = accountOrders.find(order => normalizeBadgerInvoiceNumber_(order.badger_invoice_number) === invoiceKey);
      return sourceOrder ? Object.assign({}, invoice, { request_id:sourceOrder.request_id, online_request:true }) : invoice;
    });
    orderInvoices.forEach(item => {
      const invoiceKey = normalizeBadgerInvoiceNumber_(item.invoice_number);
      const assignedAccountId = assignedInvoiceAccounts.get(invoiceKey);
      if (ignoredInvoiceKeys.has(invoiceKey) || conflictingOrderInvoiceKeys.has(invoiceKey) || (assignedAccountId && assignedAccountId !== accountId)) return;
      if (!invoiceKey || !invoices.some(invoice => normalizeBadgerInvoiceNumber_(invoice.invoice_number) === invoiceKey)) invoices.push(Object.assign({}, item, { invoice_status:"Unknown", payment_status:"Unknown" }));
    });
    // Only the parsed Badger records decide whether money is still outstanding.
    // Order-side workflow fields can be stale and must not trigger customer email.
    const unpaidInvoices = invoices.filter(item => item.badger_match_status === "Matched" && item.invoice_status === "Customer owes");
    const owedToBadgerInvoices = invoices.filter(item => item.badger_match_status === "Matched" && item.invoice_status === "Owed to Badger");
    const paymentReminderCutoff = Date.now() - paymentReminderMinAgeDays * 24 * 60 * 60 * 1000;
    const paymentReminderEligibleInvoices = badgerStatusIsFresh ? unpaidInvoices.filter(item => {
      const invoiceDate = outreachDate_(item.invoice_date);
      return invoiceDate && invoiceDate.getTime() < paymentReminderCutoff;
    }) : [];
    const outstandingBalanceCents = unpaidInvoices.reduce((total, item) => total + Number(item.amount_cents || 0), 0);
    const owedToBadgerCents = owedToBadgerInvoices.reduce((total, item) => total + Number(item.amount_cents || 0), 0);
    const operational = new Set();
    accountApplications.forEach(item => { if (item.workflow_status === "New") operational.add("New"); });
    accountOrders.forEach(order => orderOperationalStatuses_(order).forEach(status => operational.add(status)));
    if (paymentReminderEligibleInvoices.length) operational.add("Payment due");
    const followUp = outreachDate_(outreachValue_(row, ["next_follow-up", "next_follow_up"]));
    if ((followUp && followUp.getTime() <= now.getTime()) || directoryStatus.toLowerCase() === "follow-up due" || accountReorders.some(item => String(item.status || "OPEN").toUpperCase() === "OPEN")) operational.add("Reorder due");
    if (store) operational.add("Inventory-counted");
    const history = [];
    accountApplications.forEach(item => history.push(accountHistoryItem_(item.submitted_at, "Application", `Application ${item.workflow_status}`, item.staff_notes || item.customer_notes, item.application_id, item.workflow_status)));
    accountOrders.forEach(item => history.push(accountHistoryItem_(item.submitted_at, "Order", `Order ${item.workflow_status}`, `${item.line_count || item.lines.length} products; invoice ${item.invoice_status}; delivery ${item.delivery_status}`, item.request_id, item.workflow_status)));
    invoices.forEach(item => history.push(accountHistoryItem_(item.invoice_date, "Invoice", `Invoice ${item.invoice_number || "recorded"}`, `Amount ${item.amount || "not recorded"}; ${item.payment_status || item.invoice_status || "status not recorded"}${item.match_method ? `; ${item.match_method}` : ""}`, item.invoice_number, item.payment_status || item.invoice_status)));
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
      ap_email:apEmail,
      phone:String(outreachValue_(row, ["phone", "phone_number"]) || ""),
      city:String(outreachValue_(row, ["city"]) || ""),
      relationship:relationship,
      directory_status:directoryStatus,
      badger_customer_id:digitsOnly_(outreachValue_(row, ["badger_customer_id"])),
      added_to_badger:toBool_(outreachValue_(row, ["added_to_badger"])) || !!digitsOnly_(outreachValue_(row, ["badger_customer_id"])),
      next_follow_up:outreachValue_(row, ["next_follow-up", "next_follow_up"]),
      last_emailed:outreachValue_(row, ["last_emailed", "last_email"]),
      inventory_tracking:!!store,
      inventory_store_id:store ? String(store.store_id || "") : "",
      operational_statuses:Array.from(operational),
      primary_status:["Payment due", "New", "Awaiting invoice", "Ready", "Delivered", "Reorder due", "Inventory-counted"].find(status => operational.has(status)) || "Account active",
      applications:accountApplications,
      orders:accountOrders,
      invoices:invoices,
      unpaid_invoices:unpaidInvoices,
      payment_reminder_eligible_invoices:paymentReminderEligibleInvoices,
      outstanding_balance_cents:outstandingBalanceCents,
      outstanding_balance:badgerMoneyLabel_(outstandingBalanceCents),
      owed_to_badger_invoices:owedToBadgerInvoices,
      owed_to_badger_cents:owedToBadgerCents,
      owed_to_badger:badgerMoneyLabel_(owedToBadgerCents),
      badger_last_good_sync_at:badgerSync.last_good_sync_at,
      badger_status_fresh:badgerStatusIsFresh,
      pending_payment_reminders:pendingRemindersByAccount.get(accountId) || [],
      deliveries:accountDeliveries,
      reorders:accountReorders,
      history:history,
    });
  });
  return {
    accounts:accounts.sort((a, b) => String(a.business_name || "").localeCompare(String(b.business_name || ""))),
    unmatched_badger_invoices:unmatchedBadgerInvoices.sort((a, b) => recordTimestamp_(b.invoice_date) - recordTimestamp_(a.invoice_date)),
    ignored_badger_invoices:ignoredBadgerInvoices.sort((a, b) => recordTimestamp_(b.invoice_date) - recordTimestamp_(a.invoice_date)),
    voided_badger_invoices:voidedBadgerInvoices.sort((a, b) => recordTimestamp_(b.invoice_date) - recordTimestamp_(a.invoice_date)),
    badger_sync:{ last_good_sync_at:badgerSync.last_good_sync_at, is_fresh:badgerStatusIsFresh },
  };
}

function apiGetCustomerWorkQueue_(p) {
  const forceRefresh = String(p?.refresh || "") === "1";
  // A forced refresh rebuilds and saves to the cache even if the browser stops waiting. It reuses the cached Badger
  // invoices and Locations (.84): those change only on a Badger sync or a Badger action, which clear that cache
  // themselves. sources=1 still forces a fresh read of the Badger Invoice Tracker.
  if (!p?._cache_bypass) return cachedReadPayload_("customer_work_queue", () => apiGetCustomerWorkQueue_({ _cache_bypass:true, _refresh_sources:String(p?.sources || "") === "1" }), forceRefresh, String(p?.rebuild || "") === "1" ? "rebuild" : "");
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
  badgerInvoiceIdsForOrders_(orders);
  // Prices for the order window and the list of products staff can add to an order (2026.11.17.65-APP).
  // A catalog read failure leaves prices blank instead of failing the whole queue.
  let orderPrices = [];
  try { orderPrices = badgerCurrentPrices_(false); } catch (error) { console.warn("Order prices unavailable: " + String(error?.message || error)); }
  orders.forEach(order => {
    order.lines = pricedOrderLines_(order.lines, order.account_id, orderPrices);
    const totals = orderTotalsFromLines_(order.lines);
    order.order_total_cents = totals.total_cents; order.order_total_bottles = totals.bottles; order.unpriced_lines = totals.unpriced;
  });
  const orderCatalog = orderPrices.filter(price => !price.account_id)
    .map(price => ({ sku_id:price.sku_id, sku_name:price.description, volume:price.volume, unit_price_cents:price.unit_price_cents }))
    .sort((a, b) => a.sku_name.localeCompare(b.sku_name) || a.volume.localeCompare(b.volume));
  mark("order_prices_ms");
  applications.forEach(application => application.operational_statuses = application.workflow_status === "New" ? ["New"] : (application.inventory_tracking ? ["Inventory-counted"] : []));
  const ledger = buildCustomerAccounts_(applications, orders, !!p?._refresh_sources);
  const accounts = ledger.accounts;
  const invoicesByNumber = new Map();
  accounts.forEach(account => (account.invoices || []).forEach(invoice => {
    const invoiceKey = normalizeBadgerInvoiceNumber_(invoice.invoice_number);
    if (invoiceKey) invoicesByNumber.set(invoiceKey, invoice);
  }));
  // Retain the billing state on the originating web request as well as the
  // invoice ledger. Existing invoices without a web request are not altered.
  orders.forEach(order => {
    const invoice = invoicesByNumber.get(normalizeBadgerInvoiceNumber_(order.badger_invoice_number));
    if (invoice) order.badger_payment_status = invoice.payment_status || invoice.invoice_status || "Unknown";
  });
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
    unmatched_badger_invoices:ledger.unmatched_badger_invoices.length,
  }));

  return {
    applications:applications,
    orders:orders,
    accounts:accounts,
    unmatched_badger_invoices:ledger.unmatched_badger_invoices,
    ignored_badger_invoices:ledger.ignored_badger_invoices,
    voided_badger_invoices:ledger.voided_badger_invoices,
    order_catalog:orderCatalog,
    summary:{
      new_applications:applications.filter(record => record.workflow_status === "New").length,
      active_applications:applications.filter(record => activeApplicationStatuses.includes(record.workflow_status)).length,
      new_orders:orders.filter(record => record.workflow_status === "New").length,
      active_orders:orders.filter(record => activeOrderStatuses.includes(record.workflow_status)).length,
      invoice_needed:orders.filter(record => ["Confirmed", "Invoicing"].includes(record.workflow_status) && ["Not started", "Ready for Badger"].includes(record.invoice_status)).length,
      integration_attention:orders.filter(record => ["Needs retry", "Badger invoice not found", "Needs account match"].includes(record.integration_status)).length,
      customer_accounts:accounts.length,
      unmatched_badger_invoices:ledger.unmatched_badger_invoices.length,
      ignored_badger_invoices:ledger.ignored_badger_invoices.length,
      voided_badger_invoices:ledger.voided_badger_invoices.length,
      // Legacy unpaid_* summary names now intentionally mean reminder-eligible,
      // not merely open, so callers cannot accidentally treat a new invoice as due.
      unpaid_accounts:accounts.filter(record => (record.payment_reminder_eligible_invoices || []).length > 0).length,
      unpaid_invoices:accounts.reduce((total, record) => total + (record.payment_reminder_eligible_invoices || []).length, 0),
      unpaid_balance_cents:accounts.reduce((total, record) => total + (record.payment_reminder_eligible_invoices || []).reduce((sum, invoice) => sum + Number(invoice.amount_cents || 0), 0), 0),
      open_unpaid_accounts:accounts.filter(record => (record.unpaid_invoices || []).length > 0).length,
      open_unpaid_invoices:accounts.reduce((total, record) => total + (record.unpaid_invoices || []).length, 0),
      open_unpaid_balance_cents:accounts.reduce((total, record) => total + Number(record.outstanding_balance_cents || 0), 0),
      payment_due_accounts:accounts.filter(record => (record.payment_reminder_eligible_invoices || []).length > 0).length,
      payment_due_invoices:accounts.reduce((total, record) => total + (record.payment_reminder_eligible_invoices || []).length, 0),
      payment_due_balance_cents:accounts.reduce((total, record) => total + (record.payment_reminder_eligible_invoices || []).reduce((sum, invoice) => sum + Number(invoice.amount_cents || 0), 0), 0),
      owed_to_badger_accounts:accounts.filter(record => (record.owed_to_badger_invoices || []).length > 0).length,
      owed_to_badger_invoices:accounts.reduce((total, record) => total + (record.owed_to_badger_invoices || []).length, 0),
      owed_to_badger_cents:accounts.reduce((total, record) => total + Number(record.owed_to_badger_cents || 0), 0),
      badger_last_good_sync_at:ledger.badger_sync.last_good_sync_at,
      badger_status_fresh:ledger.badger_sync.is_fresh,
      reorder_due:accounts.filter(record => record.operational_statuses.includes("Reorder due")).length,
    },
    performance:{ total_ms:totalMs, stages:timings },
  };
}

function getBadgerPaymentRemindersSheet_() {
  return ensureSheet_(getOutreachSs_(), BADGER_PAYMENT_REMINDERS_SHEET_NAME, [
    "Reminder ID", "Account ID", "Business Name", "Recipient", "Invoice Numbers", "Outstanding Amount", "Status",
    "Sent At", "Sent By", "Zoho Message ID", "Idempotency Token", "Error", "App Version", "Subject", "HTML"
  ]);
}

function badgerPaymentReminderHistory_(accountId) {
  const sheet = getBadgerPaymentRemindersSheet_();
  if (sheet.getLastRow() < 2) return [];
  const h = getHeaderMap_(sheet);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().map((row, index) => ({
    row_number:index + 2,
    reminder_id:String(row[h.reminder_id] || ""),
    account_id:String(row[h.account_id] || ""),
    recipient:String(row[h.recipient] || "").trim().toLowerCase(),
    invoice_numbers:String(row[h.invoice_numbers] || ""),
    outstanding_amount:Number(row[h.outstanding_amount] || 0),
    status:String(row[h.status] || ""),
    sent_at:row[h.sent_at],
    sent_by:String(row[h.sent_by] || ""),
    zoho_message_id:String(row[h.zoho_message_id] || ""),
    idempotency_token:String(row[h.idempotency_token] || ""),
    error:String(row[h.error] || ""),
    subject:String(row[h.subject] || ""),
    html:String(row[h.html] || ""),
  })).filter(row => !accountId || row.account_id === String(accountId));
}

function paymentReminderRecipients_(account) {
  const seen = new Set();
  return [account.ap_email, account.email].map(value => publicEmail_(value || "", "Recipient", false))
    .filter(email => email && !seen.has(email) && (seen.add(email), true));
}

function paymentReminderCooldown_(accountId) {
  const history = badgerPaymentReminderHistory_(accountId);
  const pending = history.filter(item => String(item.status || "").toUpperCase() === "PENDING" && item.sent_at)
    .sort((a, b) => recordTimestamp_(b.sent_at) - recordTimestamp_(a.sent_at))[0];
  if (pending) return { eligible:false, pending:true, last_sent_at:"", next_eligible_at:"", pending_token:pending.idempotency_token };
  const sent = history.filter(item => /^(SENT|APP SENT)$/i.test(item.status) && item.sent_at);
  if (!sent.length) return { eligible:true, last_sent_at:"", next_eligible_at:"" };
  const latest = sent.sort((a, b) => recordTimestamp_(b.sent_at) - recordTimestamp_(a.sent_at))[0];
  const lastSentAt = outreachDate_(latest.sent_at);
  if (!lastSentAt) return { eligible:true, last_sent_at:"", next_eligible_at:"" };
  const nextEligibleAt = new Date(lastSentAt);
  nextEligibleAt.setDate(nextEligibleAt.getDate() + BADGER_PAYMENT_REMINDER_MIN_DAYS);
  return {
    eligible:nextEligibleAt.getTime() <= Date.now(),
    last_sent_at:lastSentAt.toISOString(),
    next_eligible_at:nextEligibleAt.toISOString(),
  };
}

function paymentReminderMinAgeDays_() {
  const configured = Number(getHubConfigurationValue_(BADGER_PAYMENT_REMINDER_MIN_AGE_CONFIG_KEY));
  return Number.isFinite(configured) && configured >= 0 && configured <= 365 ? configured : BADGER_PAYMENT_REMINDER_DEFAULT_MIN_AGE_DAYS;
}

function paymentReminderEligibleInvoices_(account) {
  if (!account.badger_status_fresh) throw new Error("Badger status is stale or unavailable. Sync Badger status before preparing a reminder.");
  const minAgeDays = paymentReminderMinAgeDays_();
  const cutoff = Date.now() - minAgeDays * 24 * 60 * 60 * 1000;
  return (account.unpaid_invoices || []).filter(item => {
    const invoiceDate = outreachDate_(item.invoice_date);
    return item.badger_match_status === "Matched" && item.invoice_status === "Customer owes" && invoiceDate && invoiceDate.getTime() < cutoff;
  });
}

function paymentReminderContent_(account) {
  const invoices = paymentReminderEligibleInvoices_(account);
  const amountCents = invoices.reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);
  if (!invoices.length || amountCents <= 0) throw new Error("This account has no matched unpaid Badger invoices to remind.");
  const invoiceNumbers = invoices.map(item => String(item.invoice_number || "").trim()).filter(Boolean);
  if (!invoiceNumbers.length) throw new Error("The matched unpaid invoice record is missing an invoice number.");
  const total = badgerMoneyLabel_(amountCents);
  const recipientName = String(account.contact_name || account.business_name || "there").trim();
  const invoiceText = invoiceNumbers.join(", ");
  const subject = `Payment reminder: ${total} outstanding`;
  const bodyText = [
    `Hello ${recipientName},`,
    "",
    `Our records show ${total} outstanding for Badger invoice${invoiceNumbers.length === 1 ? "" : "s"} ${invoiceText}.`,
    "Please let us know if payment has already been sent or if you need a copy of an invoice.",
    "",
    "Thank you,",
    "Sturgeon Spirits",
  ].join("\n");
  const html = `<p>Hello ${escapeOutreachHtml_(recipientName)},</p><p>Our records show <strong>${escapeOutreachHtml_(total)}</strong> outstanding for Badger invoice${invoiceNumbers.length === 1 ? "" : "s"} ${escapeOutreachHtml_(invoiceText)}.</p><p>Please let us know if payment has already been sent or if you need a copy of an invoice.</p><p>Thank you,<br>Sturgeon Spirits</p>`;
  const fingerprint = sha256_(invoices.map(item => `${String(item.invoice_number || "").trim()}:${Number(item.amount_cents || 0)}`).sort().join("|"));
  return { invoices:invoices, invoice_numbers:invoiceNumbers, outstanding_amount_cents:amountCents, outstanding_amount:total, content_fingerprint:fingerprint, subject:subject, body_text:bodyText, html:html, min_age_days:paymentReminderMinAgeDays_() };
}

function currentBadgerPaymentAccount_(accountId, refresh) {
  const queue = apiGetCustomerWorkQueue_({ _cache_bypass:true, _refresh_sources:!!refresh, refresh:refresh ? "1" : "" });
  const account = (queue.accounts || []).find(item => String(item.account_id || "") === String(accountId || ""));
  if (!account) throw new Error("Customer account was not found. Refresh Accounts and try again.");
  return account;
}

function apiPreviewBadgerPaymentReminder_(p) {
  const accountId = publicText_(p?.account_id || "", 120, "Account ID");
  if (!accountId) throw new Error("Account ID is required.");
  const account = currentBadgerPaymentAccount_(accountId, String(p?.refresh || "") === "1");
  const content = paymentReminderContent_(account);
  const recipients = paymentReminderRecipients_(account);
  if (!recipients.length) throw new Error("This account has no valid accounts-payable or customer email address for a payment reminder.");
  const cooldown = paymentReminderCooldown_(account.account_id);
  return Object.assign({
    account_id:account.account_id,
    business_name:account.business_name,
    recipient_options:recipients,
    cooldown:cooldown,
    payment_reminders_enabled:paymentRemindersEnabled_(),
    payment_reminder_min_age_days:paymentReminderMinAgeDays_(),
    reminder_interval_days:BADGER_PAYMENT_REMINDER_MIN_DAYS,
  }, content);
}

function apiSendBadgerPaymentReminder_(p) {
  const accountId = publicText_(p?.account_id || "", 120, "Account ID");
  const recipient = publicEmail_(p?.recipient || "", "Recipient", true);
  const token = publicText_(p?.idempotency_token || "", 160, "Idempotency token");
  const fingerprint = publicText_(p?.content_fingerprint || "", 128, "Reminder fingerprint");
  const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  if (!accountId) throw new Error("Account ID is required.");
  if (!/^[A-Za-z0-9_-]{20,160}$/.test(token)) throw new Error("A valid idempotency token is required.");
  if (!/^[a-f0-9]{64}$/i.test(fingerprint)) throw new Error("A valid reminder fingerprint is required. Refresh and review the reminder again.");
  if (!paymentRemindersEnabled_()) throw new Error("Payment reminders are disabled in Hub Configuration.");
  const account = currentBadgerPaymentAccount_(accountId, true);
  const recipientOptions = paymentReminderRecipients_(account);
  if (!recipientOptions.includes(recipient)) throw new Error("Recipient is no longer an approved accounts-payable or customer email for this account. Refresh and review the reminder again.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another reminder send is in progress. Wait a moment and try again.");
  try {
    const prior = badgerPaymentReminderHistory_(accountId).filter(item => item.idempotency_token === token && /^(SENT|APP SENT)$/i.test(item.status))[0];
    if (prior) return { accepted:true, idempotent:true, reminder_id:prior.reminder_id, message_id:prior.zoho_message_id, sent_at:prior.sent_at };
    const pendingForToken = badgerPaymentReminderHistory_(accountId).filter(item => item.idempotency_token === token && String(item.status || "").toUpperCase() === "PENDING")[0];
    if (pendingForToken) throw new Error("This reminder may have been sent — refresh before retrying.");
    const cooldown = paymentReminderCooldown_(accountId);
    if (cooldown.pending) throw new Error("A reminder may have been sent recently — refresh before retrying.");
    if (!cooldown.eligible) throw new Error(`A payment reminder was already sent within the ${BADGER_PAYMENT_REMINDER_MIN_DAYS}-day interval. It can be sent again after ${Utilities.formatDate(new Date(cooldown.next_eligible_at), Session.getScriptTimeZone(), "MMM d, yyyy")}.`);
    const content = paymentReminderContent_(account);
    if (content.content_fingerprint !== fingerprint) throw new Error("The invoice balance changed after preview. Refresh and review the reminder again.");
    const sheet = getBadgerPaymentRemindersSheet_();
    const h = getHeaderMap_(sheet);
    const reminderId = permanentId_("PAY");
    const pendingRow = sheet.getLastRow() + 1;
    const row = Array(sheet.getLastColumn()).fill("");
    const set = (key, value) => { if (h[key] !== undefined) row[h[key]] = value; };
    set("reminder_id", reminderId); set("account_id", account.account_id); set("business_name", account.business_name); set("recipient", recipient); set("invoice_numbers", content.invoice_numbers.join(", ")); set("outstanding_amount", content.outstanding_amount_cents); set("status", "PENDING"); set("sent_at", new Date()); set("sent_by", actor); set("idempotency_token", token); set("error", "Awaiting Zoho confirmation."); set("app_version", APP_VERSION); set("subject", content.subject); set("html", content.html);
    sheet.appendRow(row);
    let result;
    try {
      result = callOutreachMailer_({
        action:"sendPaymentReminder", idempotency_token:token, account_id:account.account_id, business:account.business_name,
        recipient:recipient, invoice_numbers:content.invoice_numbers, outstanding_amount_cents:content.outstanding_amount_cents,
        subject:content.subject, html:content.html, requested_by:actor,
      });
    } catch (error) {
      sheet.getRange(pendingRow, h.error + 1).setValue(String(error && error.message || error));
      throw new Error("The reminder may have been sent — refresh before retrying.");
    }
    if (!result.accepted || !String(result.message_id || "").trim()) {
      sheet.getRange(pendingRow, h.error + 1).setValue("Zoho did not return a confirmed message ID.");
      throw new Error("The reminder may have been sent — refresh before retrying.");
    }
    sheet.getRange(pendingRow, h.status + 1).setValue("SENT"); sheet.getRange(pendingRow, h.sent_at + 1).setValue(new Date()); sheet.getRange(pendingRow, h.sent_by + 1).setValue(actor); sheet.getRange(pendingRow, h.zoho_message_id + 1).setValue(String(result.message_id)); sheet.getRange(pendingRow, h.error + 1).setValue("Zoho accepted delivery."); sheet.getRange(pendingRow, h.app_version + 1).setValue(APP_VERSION);
    appendAudit_("SEND_BADGER_PAYMENT_REMINDER", "Account", account.account_id, account.account_id, actor, BADGER_TRACKER_SPREADSHEET_ID, BADGER_PAYMENT_REMINDERS_SHEET_NAME, "Completed", `${content.invoice_numbers.join(", ")}; ${content.outstanding_amount}; Zoho ${String(result.message_id)}`);
    bumpReadCacheVersion_(["customers"]);
    return { accepted:true, idempotent:!!result.idempotent, message_id:String(result.message_id), sent_at:new Date().toISOString(), outstanding_amount:content.outstanding_amount };
  } finally {
    lock.releaseLock();
  }
}

function apiResolvePaymentReminder_(p) {
  const reminderId = publicText_(p?.reminder_id || "", 120, "Reminder ID");
  const resolution = publicText_(p?.resolution || "", 20, "Resolution").toLowerCase();
  const reason = publicText_(p?.reason || "", 1000, "Resolution reason");
  const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
  const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) throw new Error("Another reminder update is in progress. Try again shortly.");
  try {
  const sheet = getBadgerPaymentRemindersSheet_(); const h = getHeaderMap_(sheet);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const index = rows.findIndex(row => String(row[h.reminder_id] || "") === reminderId);
  if (index < 0 || String(rows[index][h.status] || "").toUpperCase() !== "PENDING") throw new Error("Only a pending reminder can be resolved.");
  const rowNumber = index + 2;
  if (resolution === "failed") {
    if (!reason) throw new Error("A failure reason is required.");
    sheet.getRange(rowNumber, h.status + 1).setValue("FAILED"); sheet.getRange(rowNumber, h.error + 1).setValue(reason); sheet.getRange(rowNumber, h.sent_by + 1).setValue(actor); bumpReadCacheVersion_(["customers"]); return { message:"Pending reminder marked failed." };
  }
  if (resolution !== "retry") throw new Error("Choose retry or failed.");
  if (Date.now() - recordTimestamp_(rows[index][h.sent_at]) > 24 * 60 * 60 * 1000) throw new Error("A pending reminder may be retried only within 24 hours; mark it failed with a reason instead.");
  const account = currentBadgerPaymentAccount_(String(rows[index][h.account_id] || ""), true);
  const stillOwed = new Set((account.unpaid_invoices || []).map(item => String(item.invoice_number || "").trim()));
  if (String(rows[index][h.invoice_numbers] || "").split(/,\s*/).some(invoice => !stillOwed.has(invoice))) throw new Error("This reminder is no longer current; mark it failed with a reason instead.");
  const result = callOutreachMailer_({ action:"sendPaymentReminder", idempotency_token:String(rows[index][h.idempotency_token] || ""), account_id:String(rows[index][h.account_id] || ""), business:String(rows[index][h.business_name] || ""), recipient:String(rows[index][h.recipient] || ""), invoice_numbers:String(rows[index][h.invoice_numbers] || "").split(/,\s*/).filter(Boolean), outstanding_amount_cents:Number(rows[index][h.outstanding_amount] || 0), subject:String(rows[index][h.subject] || ""), html:String(rows[index][h.html] || ""), requested_by:actor });
  if (!result.accepted || !String(result.message_id || "")) throw new Error("Mailer did not confirm this reminder; it remains pending.");
  sheet.getRange(rowNumber, h.status + 1).setValue("SENT"); sheet.getRange(rowNumber, h.sent_at + 1).setValue(new Date()); sheet.getRange(rowNumber, h.sent_by + 1).setValue(actor); sheet.getRange(rowNumber, h.zoho_message_id + 1).setValue(String(result.message_id)); sheet.getRange(rowNumber, h.error + 1).setValue("Zoho accepted delivery."); bumpReadCacheVersion_(["customers"]); return { accepted:true, message:"Pending reminder resolved as sent." };
  } finally { lock.releaseLock(); }
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

function publicSiteUrl_(settings) {
  const configured = String(settings?.[PUBLIC_SITE_URL_SETTING_KEY] || "").trim();
  const match = configured.match(/^https:\/\/([^\s\/?#]+)(?:[\/?#].*)?$/i);
  return match ? `https://${match[1]}` : PUBLIC_SITE_URL_FALLBACK;
}

function hasConfiguredPublicSiteUrl_(settings) {
  return publicSiteUrl_(settings) !== PUBLIC_SITE_URL_FALLBACK || String(settings?.[PUBLIC_SITE_URL_SETTING_KEY] || "").trim() === PUBLIC_SITE_URL_FALLBACK;
}

function rewritePublicSiteUrls() {
  const settings = getOutreachCampaignSettings_();
  if (!hasConfiguredPublicSiteUrl_(settings)) return { changed:0, unchanged:0 };
  const publicSiteUrl = publicSiteUrl_(settings);
  const sheet = getOutreachProgramSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) return { changed:0, unchanged:0 };
  const headers = getHeaderMap_(sheet);
  if (headers.ordering_portal_url === undefined) return { changed:0, unchanged:0 };
  const values = sheet.getRange(2, headers.ordering_portal_url + 1, sheet.getLastRow() - 1, 1).getValues();
  let changed = 0;
  let unchanged = 0;
  values.forEach((row, index) => {
    const current = String(row[0] || "").trim();
    const legacy = current.match(/^https:\/\/distribution-hub\.netlify\.app(?=[:\/?#]|$)(.*)$/i);
    if (!legacy) { unchanged += 1; return; }
    const rewritten = `${publicSiteUrl}${legacy[1] || ""}`;
    if (rewritten === current) { unchanged += 1; return; }
    sheet.getRange(index + 2, headers.ordering_portal_url + 1).setValue(rewritten);
    changed += 1;
  });
  return { changed:changed, unchanged:unchanged };
}

