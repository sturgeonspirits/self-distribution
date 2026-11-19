// Inventory API, part 4 of 12: Campaigns: audiences and criteria, Cocktail list and customer-invite selection, campaign creation, recipients, approval and batches.
// The parts load in order 01 to 12 (filePushOrder in .clasp.json); version and change notes are in 01-core.gs.

// Campaigns are immutable recipient/message snapshots.  They make bulk review
// possible without changing a source lead or sending anything at creation time.
function outreachCampaignSheets_() {
  const ss = getOutreachSs_();
  return {
    campaigns: ensureSheet_(ss, OUTREACH_CAMPAIGNS_SHEET_NAME, [
      "Campaign ID", "Campaign Name", "Audience", "Status", "Recipient Count", "Audience Checksum",
      "Unsegmented Count", "Created At", "Created By", "Approved At", "Approved By", "Approval Token",
      "Last Batch At", "Sent Count", "Blocked Count", "App Version", "Criteria",
      "Scheduled Send At", "Scheduled By", "Schedule Status", "Schedule Detail"
    ]),
    recipients: ensureSheet_(ss, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, [
      "Campaign ID", "Source Row", "Account ID", "Business Name", "Recipient Email", "Contact", "City", "ZIP", "Miles", "Priority",
      "Email Confidence", "Segment", "Wave", "Message Stage", "Subject", "Body Text", "HTML", "Content Checksum",
      "Status", "Result Detail", "Zoho Message ID", "Sent At", "Idempotency Token", "App Version", "Newsletter Contact ID"
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

// Karl, 2026-11-19 (.87): businesses in a campaign that still has an email waiting for them. The Outreach screen labels
// them, and Today leaves out the ones whose next email is already scheduled (an approved campaign that isn't paused).
// Keyed by Account ID, else "row:<Directory row>". Reads only five recipient columns, not the email bodies.
const OPEN_CAMPAIGN_STATE_RANK = { scheduled:3, review:2, paused:1 };
function openCampaignMembership_() {
  const membership = new Map();
  const sheets = outreachCampaignSheets_();
  const ch = getHeaderMap_(sheets.campaigns);
  const campaignRows = sheets.campaigns.getLastRow() - 1;
  if (campaignRows < 1) return membership;
  const open = new Map();
  sheets.campaigns.getRange(2, 1, campaignRows, sheets.campaigns.getLastColumn()).getValues().forEach(values => {
    const status = String(values[ch.status] || "").trim();
    if (!["Review", "Approved"].includes(status)) return;
    const schedule = ch.schedule_status === undefined ? "" : String(values[ch.schedule_status] || "").trim();
    open.set(String(values[ch.campaign_id] || "").trim(), {
      name:String(values[ch.campaign_name] || "").trim(),
      state:status === "Review" ? "review" : schedule === "Paused" ? "paused" : "scheduled",
    });
  });
  if (!open.size) return membership;
  const rh = getHeaderMap_(sheets.recipients);
  const recipientRows = sheets.recipients.getLastRow() - 1;
  if (recipientRows < 1 || rh.campaign_id === undefined || rh.status === undefined) return membership;
  const column = key => rh[key] === undefined ? [] : sheets.recipients.getRange(2, rh[key] + 1, recipientRows, 1).getValues().map(row => row[0]);
  const ids = column("campaign_id"), accounts = column("account_id"), rows = column("source_row"), statuses = column("status"), stages = column("message_stage");
  ids.forEach((id, index) => {
    const campaign = open.get(String(id || "").trim());
    if (!campaign) return;
    const status = String(statuses[index] || "").trim();
    if (status !== (campaign.state === "review" ? "Ready for review" : "Ready to send")) return;
    const key = String(accounts[index] || "").trim() || (rows[index] ? `row:${Number(rows[index])}` : "");
    if (!key) return;
    const current = membership.get(key);
    if (current && OPEN_CAMPAIGN_STATE_RANK[current.state] >= OPEN_CAMPAIGN_STATE_RANK[campaign.state]) return;
    membership.set(key, { name:campaign.name, state:campaign.state, stage:String(stages[index] || "").trim() });
  });
  return membership;
}

function campaignRecipientRows_(sheet, campaignId) {
  const h = getHeaderMap_(sheet);
  if (sheet.getLastRow() < 2) return [];
  const matches = sheet.getRange(2, h.campaign_id + 1, sheet.getLastRow() - 1, 1).createTextFinder(String(campaignId || ""))
    .matchEntireCell(true).findAll();
  if (!matches.length) return [];
  // Read the block spanning all matches once instead of one getRange per recipient
  // (a 100+ recipient campaign took 100+ separate sheet reads).
  const rows = matches.map(match => match.getRow());
  const first = Math.min.apply(null, rows);
  const last = Math.max.apply(null, rows);
  const wanted = new Set(rows);
  return sheet.getRange(first, 1, last - first + 1, sheet.getLastColumn()).getValues()
    .map((values, index) => ({ row:first + index, values:values, headers:h }))
    .filter(item => wanted.has(item.row));
}

function campaignRecipientSummaryRows_(sheet) {
  const h = getHeaderMap_(sheet);
  if (sheet.getLastRow() < 2) return [];
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
  const campaignIds = range.offset(0, h.campaign_id, range.getNumRows(), 1).getValues();
  const statuses = range.offset(0, h.status, range.getNumRows(), 1).getValues();
  return campaignIds.map((item, index) => ({ campaign_id:String(item[0] || ""), status:String(statuses[index][0] || "") }));
}

function campaignStoredCriteria_(value) {
  try {
    const criteria = JSON.parse(String(value || ""));
    return criteria && typeof criteria === "object" && (criteria.campaign_type === "cocktail_list" || criteria.campaign_type === "customer_invite" || (criteria.center && Number.isFinite(Number(criteria.radius_miles)))) ? criteria : null;
  } catch (error) {
    return null;
  }
}

function campaignCriteriaText_(value, maxLength, label) {
  const text = publicText_(value || "", maxLength, label).toLowerCase();
  return text.replace(/^'/, "");
}

function campaignCenterForCriteria_(type, value) {
  const centroidMap = zipCentroidMap_();
  if (type === "distillery") {
    const centroid = zipCentroidForZip_("54902");
    if (!centroid) throw new Error("ZIP Centroids is missing the distillery ZIP (54902).");
    return { type:"distillery", label:"Distillery (54902)", zip:"54902", latitude:centroid.latitude, longitude:centroid.longitude };
  }
  if (type === "zip") {
    const zip = normalizeZip_(value);
    const centroid = zipCentroidForZip_(zip);
    if (!centroid) throw new Error("Campaign center ZIP must be in the ZIP Centroids tab.");
    return { type:"zip", label:`ZIP ${zip}`, zip:zip, latitude:centroid.latitude, longitude:centroid.longitude };
  }
  if (type === "city") {
    const city = campaignCriteriaText_(value, 80, "Campaign center city");
    if (!city) throw new Error("Enter a campaign center city.");
    const matches = Array.from(centroidMap.entries()).filter(([, centroid]) => String(centroid.city || "").trim().toLowerCase() === city);
    if (!matches.length) throw new Error("Campaign center city was not found in ZIP Centroids. Use a ZIP instead.");
    const latitude = matches.reduce((sum, [, centroid]) => sum + Number(centroid.latitude), 0) / matches.length;
    const longitude = matches.reduce((sum, [, centroid]) => sum + Number(centroid.longitude), 0) / matches.length;
    return { type:"city", label:matches[0][1].city || value, zip:"", latitude:latitude, longitude:longitude };
  }
  throw new Error("Campaign center must be Distillery, ZIP, or city.");
}

function campaignCriteriaFromRequest_(p) {
  const source = p?.criteria && typeof p.criteria === "object" ? p.criteria : (p || {});
  const centerType = String(source.center_type || source.center?.type || "distillery").trim().toLowerCase();
  const centerValue = String(source.center_value || source.center?.zip || source.center?.label || "").trim();
  const radius = source.radius_miles === undefined || String(source.radius_miles).trim() === "" ? 15 : Number(source.radius_miles);
  const minFit = source.min_fit === undefined || String(source.min_fit).trim() === "" ? 5 : Number(source.min_fit);
  const maxRecipientsText = String(source.max_recipients ?? "").trim();
  const maxRecipients = maxRecipientsText === "" ? null : Number(maxRecipientsText);
  const stage = String(source.stage || "Initial").trim();
  const campaignType = String(source.campaign_type || "sales_outreach").trim().toLowerCase();
  const sourceCampaignId = String(source.source_campaign_id || "").trim();
  const stages = ["Initial", "Follow-up 1", "Follow-up 2", "Nurture check-in"];
  if (maxRecipients !== null && (!Number.isInteger(maxRecipients) || maxRecipients < 1 || maxRecipients > 5000)) throw new Error("Campaign maximum recipients must be from 1 to 5,000.");
  if (campaignType === "cocktail_list") return { schema:3, campaign_type:"cocktail_list", stage:OUTREACH_COCKTAIL_LIST_STAGE, max_recipients:maxRecipients, filters:{} };
  if (campaignType === "customer_invite") return { schema:3, campaign_type:"customer_invite", stage:OUTREACH_CUSTOMER_INVITE_STAGE, max_recipients:maxRecipients, filters:{} };
  if (campaignType !== "sales_outreach") throw new Error("Campaign type must be Sales outreach, Cocktail list, or Current customers.");
  if (!Number.isFinite(radius) || radius < 0 || radius > 1000) throw new Error("Campaign radius must be from 0 to 1,000 miles.");
  if (!Number.isInteger(minFit) || minFit < 1 || minFit > 5) throw new Error("Campaign minimum fit must be from 1 to 5.");
  if (!stages.includes(stage)) throw new Error("Campaign stage must be Initial, Follow-up 1, Follow-up 2, or Nurture check-in.");
  // A sequence step (Phase 4): the businesses whose Directory Sequence ID is this sequence, filtered by the same
  // stage and send-eligibility checks as any campaign. No distance, fit or area filters.
  if (String(source.audience_mode || "") === "sequence" || String(source.sequence_id || "").trim()) {
    const sequenceId = String(source.sequence_id || "").trim();
    if (!sequenceId) throw new Error("Choose the sequence this step belongs to.");
    if (!SEQUENCE_STEP_STAGES.includes(stage)) throw new Error("A sequence step must be Initial, Follow-up 1, or Follow-up 2.");
    const stored = sequenceStoredRow_(sequenceId);
    if (!stored) throw new Error("That sequence was not found. Run migrateCampaignsToSequences() first.");
    return {
      schema:3, campaign_type:"sales_outreach", audience_mode:"sequence", stage:stage,
      sequence_id:sequenceId, sequence_name:String(stored.name || sequenceId).slice(0, 120), source_campaign_id:"",
      center:campaignCenterForCriteria_("distillery", ""), radius_miles:1000, min_fit:1, filters:{}, max_recipients:maxRecipients,
    };
  }
  // "Same businesses as the source campaign": only the stage check applies (who is due for this email); no distance,
  // fit or area filters, so a follow-up reaches the group the earlier email went to wherever it was centered.
  // The stored center/radius/fit come from the source campaign so labels and distances still read sensibly.
  if (source.use_source_audience === true || String(source.use_source_audience) === "true") {
    if (!sourceCampaignId) throw new Error("Choose the campaign whose businesses this one should use.");
    const sheets = outreachCampaignSheets_();
    const sourceCampaign = outreachCampaignRow_(sheets.campaigns, sourceCampaignId);
    if (!sourceCampaign) throw new Error("Selected source campaign was not found.");
    const sourceCriteria = campaignStoredCriteria_(sourceCampaign.values[sourceCampaign.headers.criteria]);
    const sourceIsSales = sourceCriteria && sourceCriteria.campaign_type !== "cocktail_list" && sourceCriteria.campaign_type !== "customer_invite";
    return {
      schema:3,
      campaign_type:"sales_outreach",
      audience_mode:"source",
      stage:stage,
      source_campaign_id:sourceCampaignId,
      source_campaign_name:String(sourceCampaign.values[sourceCampaign.headers.campaign_name] || "").slice(0, 120),
      center:sourceIsSales && sourceCriteria.center ? sourceCriteria.center : campaignCenterForCriteria_("distillery", ""),
      radius_miles:sourceIsSales ? Number(sourceCriteria.radius_miles) : 1000,
      min_fit:sourceIsSales ? Number(sourceCriteria.min_fit) : 1,
      filters:{},
      max_recipients:maxRecipients,
    };
  }
  return {
    schema:3,
    campaign_type:"sales_outreach",
    stage:stage,
    source_campaign_id:sourceCampaignId,
    center:campaignCenterForCriteria_(centerType, centerValue),
    radius_miles:radius,
    min_fit:minFit,
    filters:{
      city:campaignCriteriaText_(source.city, 80, "Campaign city filter"),
      county:campaignCriteriaText_(source.county, 80, "Campaign county filter"),
      segment:campaignCriteriaText_(source.segment, 80, "Campaign segment filter"),
      wave:campaignCriteriaText_(source.wave, 80, "Campaign wave filter"),
    },
    max_recipients:maxRecipients,
  };
}

function campaignAudienceLabel_(criteria) {
  if (criteria?.campaign_type === "customer_invite") return `Current customers · order online invite${criteria?.max_recipients ? ` · first ${criteria.max_recipients}` : ""}`;
  if (criteria?.campaign_type === "cocktail_list") return `Cocktail list · subscribed newsletter contacts${criteria?.max_recipients ? ` · first ${criteria.max_recipients}` : ""}`;
  const stage = String(criteria?.stage || "Initial");
  if (criteria?.audience_mode === "sequence") {
    return `${stage === "Initial" ? "Initial prospects" : `${stage} due`} · sequence ${criteria.sequence_name || criteria.sequence_id}${criteria.max_recipients ? ` · first ${criteria.max_recipients}` : ""}`;
  }
  if (criteria?.audience_mode === "source") {
    const sourceLabel = criteria.source_campaign_name ? `${criteria.source_campaign_name} (${criteria.source_campaign_id})` : criteria.source_campaign_id;
    return `${stage === "Initial" ? "Initial prospects" : `${stage} due`} · same businesses as ${sourceLabel}${criteria.max_recipients ? ` · first ${criteria.max_recipients}` : ""}`;
  }
  const center = criteria?.center?.label || "selected center";
  const filters = criteria?.filters || {};
  const suffix = [criteria?.source_campaign_id && `recipients of ${criteria.source_campaign_id}`, filters.city && `city ${filters.city}`, filters.county && `county ${filters.county}`, filters.segment && `segment ${filters.segment}`, filters.wave && `wave ${filters.wave}`, criteria.max_recipients && `first ${criteria.max_recipients}`].filter(Boolean);
  const audience = stage === "Initial" ? "Initial prospects" : `${stage} due`;
  return `${audience} · fit ≥${criteria.min_fit} · ≤${criteria.radius_miles} mi of ${center}${suffix.length ? ` · ${suffix.join(" · ")}` : ""}`;
}

function campaignDistanceForCriteria_(record, criteria) {
  return milesBetweenCoordinates_(zipCentroidForZip_(record?.postal_code), criteria?.center);
}

function campaignCriteriaFailures_(record, criteria) {
  if (!criteria) return [];
  if (criteria.campaign_type === "cocktail_list" || criteria.campaign_type === "customer_invite") return [];
  // Source-audience follow-ups are limited by campaignSourceRows_ instead of distance, fit or area.
  if (criteria.audience_mode === "source" || criteria.audience_mode === "sequence") return [];
  const failures = [];
  const miles = campaignDistanceForCriteria_(record, criteria);
  if (miles === null || miles > Number(criteria.radius_miles)) failures.push("distance");
  if (Number(record.craft_spirit_fit || 0) < Number(criteria.min_fit)) failures.push("fit");
  const filters = criteria.filters || {};
  if (filters.city && String(record.city || "").trim().toLowerCase() !== filters.city) failures.push("city");
  if (filters.county && String(record.county || "").trim().toLowerCase() !== filters.county) failures.push("county");
  if (filters.segment && String(record.segment || "").trim().toLowerCase() !== filters.segment) failures.push("segment");
  if (filters.wave && String(record.wave || "").trim().toLowerCase() !== filters.wave) failures.push("wave");
  return failures;
}

function campaignDirectoryRecord_(row, sourceRow) {
  return {
    source_row:sourceRow,
    customer_source:String(outreachValue_(row, ["customer_source"]) || "").trim(),
    account_id:String(row.account_id || "").trim(),
    business:String(outreachValue_(row, ["business", "business_name"]) || "").trim(),
    contact:String(outreachValue_(row, ["contact", "contact_name", "contact_person", "first_name"]) || "").trim(),
    email:String(outreachValue_(row, ["email", "email_address"]) || "").trim(),
    city:String(outreachValue_(row, ["city", "town"]) || "").trim(),
    postal_code:String(outreachValue_(row, ["zip", "zip_code", "postal_code"]) || "").trim(),
    status:String(outreachValue_(row, ["status"]) || "Not contacted").trim(),
    next_email:String(outreachValue_(row, ["next_email", "stage"]) || "Initial").trim(),
    next_follow_up:outreachValue_(row, ["next_follow-up", "next_follow_up"]),
    priority:String(outreachValue_(row, ["priority"]) || "").trim(),
    last_emailed:outreachValue_(row, ["last_emailed", "last_email"]),
    message_id:String(outreachValue_(row, ["message_id", "zoho_message_id"]) || "").trim(),
    outcome:String(outreachValue_(row, ["outcome"]) || "").trim(),
    do_not_email:toBool_(outreachValue_(row, ["do_not_email", "do_not_contact"])),
    segment:String(outreachValue_(row, ["segment"]) || "").trim(),
    wave:String(outreachValue_(row, ["wave"]) || "").trim(),
    county:String(outreachValue_(row, ["county"]) || "").trim(),
    craft_spirit_fit:Number(outreachValue_(row, ["craft-spirit_fit_(1–5)", "craft-spirit_fit_(1-5)", "craft_spirit_fit", "craft_spirit_fit_(1–5)"]) || 0),
    email_confidence:String(outreachValue_(row, ["email_confidence"]) || "").trim(),
    relationship:String(outreachValue_(row, ["relationship"]) || "").trim(),
    activity:[],
    directory_row:row,
  };
}

function newsletterCocktailListEligibility_(record) {
  const reasons = [];
  const email = String(record.email || "").trim().toLowerCase();
  const directoryStatus = String(record.directory_status || "").trim().toLowerCase();
  const directoryOutcome = String(record.directory_outcome || "").trim().toLowerCase();
  const programStatus = String(record.program_newsletter_status || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reasons.push("Recipient email is invalid");
  if (String(record.newsletter_status || "").trim() !== "Subscribed") reasons.push("Newsletter contact is not subscribed");
  // Activating an application ticks Do Not Email to stop sales outreach to a customer.
  // An active customer who subscribed to the Cocktail list still receives it; any
  // recorded opt-out (status, outcome, newsletter or program) still excludes them.
  const activeCustomer = directoryStatus === "existing customer" && String(record.program_ordering_status || "").trim().toLowerCase() === "active";
  const optOut = ["closed", "do not contact", "unsubscribed", "bad address", "not interested"];
  if ((record.do_not_email && !activeCustomer) || optOut.includes(directoryStatus) || optOut.includes(directoryOutcome)) reasons.push("Business is excluded from email");
  if (["unsubscribed", "declined"].includes(programStatus)) reasons.push("Account program excludes newsletter email");
  const cooldown = outreachCrossSendCooldownReason_(email, true);
  if (cooldown) reasons.push(cooldown);
  if (outreachRecentSendToEmail_(email, stage => stage === OUTREACH_COCKTAIL_LIST_STAGE, OUTREACH_COCKTAIL_LIST_GAP_DAYS)) {
    reasons.push(`A cocktail list email was sent within the last ${OUTREACH_COCKTAIL_LIST_GAP_DAYS} days`);
  }
  return reasons;
}

function cocktailListContactIndex_() {
  if (__OUTREACH_COCKTAIL_LIST_CONTACT_INDEX) return __OUTREACH_COCKTAIL_LIST_CONTACT_INDEX;
  const directory = getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME)).map((row, index) => Object.assign({ __source_row:index + 2 }, row));
  const byAccount = new Map(directory.map(row => [String(row.account_id || "").trim(), row]).filter(([key]) => key));
  const byEmail = new Map(directory.map(row => [String(outreachValue_(row, ["email", "email_address"]) || "").trim().toLowerCase(), row]).filter(([key]) => key));
  const contacts = newsletterContacts_();
  return (__OUTREACH_COCKTAIL_LIST_CONTACT_INDEX = {
    contacts:contacts,
    contacts_by_id:new Map(contacts.map(contact => [String(contact.contact_id || ""), contact]).filter(([key]) => key)),
    // An address with any Unsubscribed or Declined row is treated as opted out, even
    // if another row for the same address says Subscribed.
    opted_out_emails:new Set(contacts.filter(contact => ["unsubscribed", "declined"].includes(String(contact.status || "").trim().toLowerCase()))
      .map(contact => String(contact.email || "").trim().toLowerCase()).filter(Boolean)),
    directory_by_account:byAccount,
    directory_by_email:byEmail,
    programs:outreachProgramMap_(),
  });
}

function cocktailListRecordFromContact_(contact, index) {
  const directoryRow = index.directory_by_account.get(contact.account_id) || index.directory_by_email.get(String(contact.email || "").trim().toLowerCase()) || {};
  const sourceRow = Number(directoryRow.__source_row || contact.source_row || 0);
  const program = index.programs.get(String(contact.account_id || "").trim()) || index.programs.get(sourceRow) || {};
  return {
    newsletter_contact_id:contact.contact_id,
    source_row:sourceRow,
    account_id:contact.account_id || String(directoryRow.account_id || "").trim(),
    business:contact.organization || contact.source_business || contact.name || contact.email,
    contact:contact.name,
    email:contact.email,
    city:String(outreachValue_(directoryRow, ["city", "town"]) || ""),
    postal_code:String(outreachValue_(directoryRow, ["zip", "zip_code", "postal_code"]) || ""),
    priority:"", email_confidence:"", segment:"", wave:"", campaign_miles:"",
    next_email:OUTREACH_COCKTAIL_LIST_STAGE,
    newsletter_status:index.opted_out_emails && index.opted_out_emails.has(String(contact.email || "").trim().toLowerCase()) ? "Unsubscribed" : contact.status,
    do_not_email:toBool_(outreachValue_(directoryRow, ["do_not_email", "do_not_contact"])),
    directory_status:String(outreachValue_(directoryRow, ["status"]) || ""),
    directory_outcome:String(outreachValue_(directoryRow, ["outcome"]) || ""),
    program_newsletter_status:String(program.newsletter_status || ""),
    program_ordering_status:String(program.ordering_status || ""),
  };
}

function campaignCocktailListRecords_(criteria) {
  const index = cocktailListContactIndex_();
  const seen = new Set();
  const settings = getOutreachCampaignSettings_();
  const records = index.contacts.map(contact => {
    const record = cocktailListRecordFromContact_(contact, index);
    const message = cocktailListMessage_(record, settings);
    return Object.assign(record, { subject:message.subject, body_text:message.body_text, preview_html:message.html, footer_html:message.footer_html });
  }).filter(record => {
    const email = String(record.email || "").trim().toLowerCase();
    if (seen.has(email) || newsletterCocktailListEligibility_(record).length) return false;
    seen.add(email);
    return true;
  });
  return criteria.max_recipients === null ? records : records.slice(0, criteria.max_recipients);
}

function liveCocktailListRecipient_(newsletterContactId) {
  const index = cocktailListContactIndex_();
  const contact = index.contacts_by_id.get(String(newsletterContactId || ""));
  if (!contact) throw new Error("Newsletter contact no longer exists.");
  return cocktailListRecordFromContact_(contact, index);
}

// ---------- Order-online invite for current customers (2026.10.08.36-APP) ----------
// Audience: Directory rows whose Relationship is Current customer / Customer or whose Status is
// Existing customer, plus any Directory account with a non-void Badger invoice in the last 12
// months. Each address gets the invite once. Directory outreach stages are never changed.
const OUTREACH_CUSTOMER_RELATIONSHIPS = ["current customer", "customer", "existing customer"];
// Relationships that show the business has bought from us before (2026.10.08.37-APP). A Badger
// invoice matched by business name alone counts only for these rows; on a Prospect row the same
// name could be a different business (two bars both called "Village Inn").
const OUTREACH_CUSTOMER_HISTORY_RELATIONSHIPS = OUTREACH_CUSTOMER_RELATIONSHIPS.concat(["lapsed customer", "win-back due"]);
let __CUSTOMER_INVITE_SENT_EMAILS = null;
let __CUSTOMER_INVITE_SENT_ACCOUNTS = null;

/**
 * Why a row counts as a current customer ("" if it does not). badger is { strong:Set, name_only:Map }.
 * A strong invoice match (explicit link, order link or learned alias) always counts; a match by
 * business name alone counts only when the row's Relationship already shows customer history.
 */
function customerInviteReason_(record, badger) {
  const relationship = String(record.relationship || "").trim().toLowerCase();
  const status = String(record.status || "").trim().toLowerCase();
  // Anyone we have sold to (current, lapsed or win-back) gets their own ordering link; we already have their information.
  if (OUTREACH_CUSTOMER_HISTORY_RELATIONSHIPS.includes(relationship)) return String(record.relationship).trim();
  if (status === "existing customer") return "Existing customer";
  if (record.account_id && badger.strong.has(record.account_id)) return "Badger invoice in the last 12 months";
  if (record.account_id && badger.name_only.has(record.account_id) && OUTREACH_CUSTOMER_HISTORY_RELATIONSHIPS.includes(relationship)) {
    return `${String(record.relationship).trim()} with a Badger invoice in the last 12 months (matched by business name; Relationship may need updating)`;
  }
  return "";
}

function customerInviteIsCustomer_(record, badger) {
  return !!customerInviteReason_(record, badger);
}

/** Addresses that already received the invite (Activity Log, real sends only). */
// Approval ticks Do Not Email to keep a customer out of sales outreach and writes Customer Source
// "Application APP-...". That automatic flag must not stop the customer's own ordering link; real
// opt-outs are recorded in Status / Outcome, which customerInviteEligibility_ checks separately.
function customerDoNotEmailIsAutomatic_(record) {
  const relationship = String(record.relationship || "").trim().toLowerCase();
  const status = String(record.status || "").trim().toLowerCase();
  return /^application\s/i.test(String(record.customer_source || "").trim())
    && (OUTREACH_CUSTOMER_HISTORY_RELATIONSHIPS.includes(relationship) || status === "existing customer");
}

/** Accounts that already received an ordering link (invite or welcome) at any address. */
function customerInviteSentAccounts_() {
  if (!__CUSTOMER_INVITE_SENT_ACCOUNTS) customerInviteSentEmails_();
  return __CUSTOMER_INVITE_SENT_ACCOUNTS || (__CUSTOMER_INVITE_SENT_ACCOUNTS = new Set());
}

function customerInviteSentEmails_() {
  if (__CUSTOMER_INVITE_SENT_EMAILS) return __CUSTOMER_INVITE_SENT_EMAILS;
  const sent = new Set();
  const accounts = new Set();
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  if (sheet && sheet.getLastRow() >= 2) {
    getAllRowsAsObjects_(sheet).forEach(row => {
      const stage = String(outreachValue_(row, ["message_stage", "stage"]) || "").trim();
      const result = String(outreachValue_(row, ["result"]) || "").toUpperCase();
      const email = String(outreachValue_(row, ["intended_recipient", "delivered_to", "email", "email_address"]) || "").trim().toLowerCase();
      if (stage !== OUTREACH_CUSTOMER_INVITE_STAGE || !result.includes("SENT") || result.includes("TEST")) return;
      if (email) sent.add(email);
      const accountId = String(outreachValue_(row, ["account_id"]) || "").trim();
      if (accountId) accounts.add(accountId);
    });
  }
  __CUSTOMER_INVITE_SENT_ACCOUNTS = accounts;
  return (__CUSTOMER_INVITE_SENT_EMAILS = sent);
}

/**
 * Recent Badger customers for the invite: { strong, name_only, unplaced_invoices }. "Strong"
 * accounts (explicit invoice link, order link or learned alias) join the audience; a match by
 * business or location name alone joins only on a row with customer history (see customerInviteReason_).
 */
function customerInviteBadgerMatches_() {
  outreachRecentBadgerInvoiceAccountIds_();
  // A silent empty set would quietly drop every invoice-only customer from the audience.
  if (__OUTREACH_RECENT_BADGER_INVOICE_LOOKUP_FAILED || !__OUTREACH_RECENT_BADGER_MATCHES) throw new Error("Badger invoices could not be read, so customers found only through recent invoices would be missed. Try again in a few minutes.");
  return __OUTREACH_RECENT_BADGER_MATCHES;
}

function customerInviteEligibility_(record) {
  const reasons = [];
  const email = String(record.email || "").trim().toLowerCase();
  const status = String(record.status || "").trim().toLowerCase();
  const outcome = String(record.outcome || "").trim().toLowerCase();
  const confidence = String(record.email_confidence || "").trim().toLowerCase();
  const optOut = ["closed", "do not contact", "not interested", "unsubscribed", "bad address"];
  if (!String(record.account_id || "").trim()) reasons.push("No Account ID on the Directory row");
  if (!email) reasons.push("No email on file");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reasons.push("Recipient email is invalid");
  if (record.do_not_email && !customerDoNotEmailIsAutomatic_(record)) reasons.push("Do Not Email is ticked");
  if (optOut.includes(status) || optOut.includes(outcome)) reasons.push("Business is excluded from email");
  // Only a link actually emailed counts. Accounts activated before 2026.10.12.43 were marked Active
  // without ever being sent their link, so the program status alone must not leave them out.
  const accountId = String(record.account_id || "").trim();
  if ((email && customerInviteSentEmails_().has(email)) || (accountId && customerInviteSentAccounts_().has(accountId))) reasons.push(String(record.program_ordering_status || "").trim().toLowerCase() === "active" ? "Already has their ordering link" : "Invite already sent");
  if (confidence && !["confirmed", "published", "supplied"].includes(confidence)) reasons.push("Recipient email is not verified");
  const cooldown = email ? outreachCrossSendCooldownReason_(email, false) : "";
  if (cooldown) reasons.push(cooldown);
  return reasons;
}

function customerInviteRecord_(row, sourceRow, programs) {
  const record = campaignDirectoryRecord_(row, sourceRow);
  const program = programs.get(record.account_id) || programs.get(sourceRow) || {};
  record.program_ordering_status = String(program.ordering_status || "");
  record.ordering_customer_id = String(program.ordering_customer_id || "");
  record.next_email = OUTREACH_CUSTOMER_INVITE_STAGE;
  return record;
}

/**
 * The fixed tail of every invite: the link to the wholesale account form, the sign-off, the
 * physical address and the unsubscribe line. It is kept out of the editable body, and every
 * path (freeze, staff edit, rebuild) re-attaches it, so an edited invite never loses its link.
 * Built only from the account, business and email that are frozen on the recipient row.
 */
function customerInviteFooterHtml_(record, settings) {
  if (!String(settings["Physical mailing address"] || "").trim()) throw new Error("Physical mailing address is required before previewing or creating an order-online invite.");
  const accountId = String(record.account_id || "").trim();
  const business = String(record.business || "").trim();
  const email = String(record.email || "").trim();
  if (!accountId) throw new Error(`${business || "This customer"} has no Account ID, so no ordering link can be made.`);
  // The customer's own ordering page: account, business, email and contact are filled in for them.
  const link = applicationOrderingUrl_(settings, accountId, "", business, email, String(record.contact || "").trim());
  const values = customerInviteValues_(record);
  const linkText = escapeOutreachHtml_(customerInviteSetting_(settings, "Customer invite link text"));
  const signOff = renderOutreachTemplate_(String(settings["Customer invite sign-off"] || ""), values, true).trim();
  return `<p><a href="${escapeOutreachHtml_(link)}">${linkText}</a></p>`
    + (signOff ? `<p>${signOff}</p>` : "")
    + `<p>${escapeOutreachHtml_(String(settings["Physical mailing address"] || ""))}</p><p>Reply stop to unsubscribe.</p>`;
}

// The Campaign Settings sheet keeps the text that was first written there. Invites used to send
// current customers to the new-customer account form; if the stored text is still that old wording,
// use the new wording so no current customer is told to fill out a form.
const CUSTOMER_INVITE_LEGACY_TEXT = {
  "Customer invite steps":"Setting up takes about five minutes: fill in our short wholesale account form, and we'll send your ordering link as soon as it's approved.",
  "Customer invite link text":"Set up online ordering",
};
function customerInviteSetting_(settings, key) {
  const stored = String(settings[key] || "").trim();
  const fallback = (OUTREACH_CUSTOMER_INVITE_EDITOR_ROWS.find(item => item.label === key) || {}).value || "";
  if (!stored || stored === CUSTOMER_INVITE_LEGACY_TEXT[key] || /account form|as soon as it'?s approved/i.test(stored)) return fallback;
  return stored;
}

function customerInviteValues_(record) {
  return {
    "First Name":String(record.contact || "").trim().split(/\s+/)[0] || "there",
    "Business Name":outreachDisplayBusinessName_(String(record.business || "").trim() || "your business"),
    "City":String(record.city || ""),
  };
}

function customerInviteMessage_(record, settings) {
  const footer = customerInviteFooterHtml_(record, settings);
  const values = customerInviteValues_(record);
  const subject = renderOutreachTemplate_(customerInviteSetting_(settings, "Customer invite subject"), values, false).trim();
  if (!subject) throw new Error("Fill in the CUSTOMER ORDER INVITE EMAIL block in the Email Editor (run repairHubStructure() once to add it).");
  const line = key => renderOutreachTemplate_(customerInviteSetting_(settings, key), values, true).trim();
  const body = ["Customer invite greeting", "Customer invite intro", "Customer invite steps"].map(line).filter(Boolean).map(text => `<p>${text}</p>`).join("");
  return { stage:OUTREACH_CUSTOMER_INVITE_STAGE, subject:subject, body_text:outreachHtmlToPlainText_(body), html:body + footer, footer_html:footer };
}

/** Eligible current customers, one per address, with each rendered message; plus counts of who was left out and why. */
function campaignCustomerInviteSelection_(criteria) {
  const badger = customerInviteBadgerMatches_();
  const programs = outreachProgramMap_();
  const settings = getOutreachCampaignSettings_();
  const excluded = {};
  const excludedNames = {};
  const leaveOut = (reason, record) => {
    excluded[reason] = (excluded[reason] || 0) + 1;
    if (!excludedNames[reason]) excludedNames[reason] = [];
    if (excludedNames[reason].length < 25) excludedNames[reason].push(String(record.business || record.email || `Row ${record.source_row}`));
  };
  const seen = new Set();
  const records = [];
  getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME)).forEach((row, index) => {
    const record = customerInviteRecord_(row, index + 2, programs);
    record.invite_reason = customerInviteReason_(record, badger);
    if (!record.invite_reason) {
      // Matched to a Badger invoice by name only on a row with no customer history (e.g. Prospect):
      // possibly a different business with the same name, so it is not invited. Linking the invoice
      // in Orders & Accounts makes it a strong match.
      if (record.account_id && badger.name_only.has(record.account_id)) leaveOut("Possible customer: Badger invoice matched by name only", record);
      return;
    }
    const reasons = customerInviteEligibility_(record);
    const email = String(record.email || "").trim().toLowerCase();
    if (!reasons.length && seen.has(email)) reasons.push("Another customer row has the same email");
    if (reasons.length) { leaveOut(reasons[0], record); return; }
    seen.add(email);
    const message = customerInviteMessage_(record, settings);
    records.push(Object.assign(record, { subject:message.subject, body_text:message.body_text, preview_html:message.html, footer_html:message.footer_html }));
  });
  records.sort((a, b) => String(a.business).localeCompare(String(b.business)));
  const warnings = [];
  if (badger.unplaced_invoices) warnings.push(`${badger.unplaced_invoices} recent Badger invoice(s) match no Directory account and cannot be invited; link them in Orders & Accounts.`);
  let syncFresh = true;
  try { syncFresh = !!badgerSyncState_().is_fresh; } catch (error) { syncFresh = false; }
  if (!syncFresh) warnings.push("Badger status sync is not fresh, so customers with the newest invoices may be missing. Sync Badger status first.");
  return { records:criteria && criteria.max_recipients ? records.slice(0, criteria.max_recipients) : records, excluded:excluded, excluded_names:excludedNames, warnings:warnings };
}

/** The current Directory row behind a frozen invite recipient, with the same rules applied. */
function liveCustomerInviteRecipient_(sourceRow) {
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const rowNumber = Number(sourceRow || 0);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error("Customer row no longer exists.");
  const headers = getHeaderMap_(sheet);
  const raw = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = {}; Object.keys(headers).forEach(key => row[key] = raw[headers[key]]);
  const record = customerInviteRecord_(row, rowNumber, outreachProgramMap_());
  // Read Badger only when Relationship / Status do not already qualify the row, so a Badger read
  // failure during a send blocks only the invoice-only customers, not every recipient.
  const noBadger = { strong:new Set(), name_only:new Map() };
  const isCustomer = customerInviteIsCustomer_(record, noBadger) || customerInviteIsCustomer_(record, customerInviteBadgerMatches_());
  const reasons = isCustomer ? customerInviteEligibility_(record) : ["No longer a current customer"];
  return { record:record, reasons:reasons };
}

// An Initial prospect email, or an order-online invite: either means the address must never get
// the Initial "introducing Sturgeon Spirits" email (an invited customer is not a prospect).
function initialSentActivityRow_(row) {
  const result = String(outreachValue_(row, ["result", "send_status", "status"]) || "").toUpperCase();
  const stage = String(outreachValue_(row, ["stage", "message_stage", "next_email"]) || "").trim().toLowerCase();
  return (stage === "initial" || stage === OUTREACH_CUSTOMER_INVITE_STAGE.toLowerCase()) && result.indexOf("SENT") >= 0 && result.indexOf("TEST") < 0;
}

function campaignInitialSentEmailSet_(directoryRecords) {
  const sentEmails = new Set((directoryRecords || [])
    .filter(record => record.last_emailed)
    .map(record => String(record.email || "").trim().toLowerCase())
    .filter(Boolean));
  const activitySheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  if (!activitySheet || activitySheet.getLastRow() < 2) return sentEmails;
  getAllRowsAsObjects_(activitySheet).forEach(row => {
    if (!initialSentActivityRow_(row)) return;
    ["intended_recipient", "delivered_to", "email", "email_address"].forEach(key => {
      const email = String(outreachValue_(row, [key]) || "").trim().toLowerCase();
      if (email) sentEmails.add(email);
    });
  });
  return sentEmails;
}

// The current Directory rows of the businesses an earlier campaign actually emailed. Recipients are matched by
// account ID, then email, then business name: the stored source_row goes stale whenever the Directory is sorted or
// rows are inserted (on 2026-10-17 every Appleton row number pointed at a different business). Only recipients the
// source campaign sent to count; if it has not sent yet, its unsent recipients (not excluded or deleted) are used.
// A match is used only when it is unique: a key shared by several Directory rows, or an email/name match whose
// account ID differs from the recipient's, is never guessed. Those recipients are reported as left out instead.
function campaignSourceRows_(campaignId, directoryRecords) {
  if (!campaignId) return null;
  const sheets = outreachCampaignSheets_();
  if (!outreachCampaignRow_(sheets.campaigns, campaignId)) throw new Error("Selected source campaign was not found.");
  const recipients = campaignRecipientRows_(sheets.recipients, campaignId).map(item => {
    const get = key => item.headers[key] === undefined ? "" : item.values[item.headers[key]];
    return { status:String(get("status") || ""), account_id:String(get("account_id") || "").trim(), email:String(get("recipient_email") || "").trim().toLowerCase(), business:String(get("business_name") || "").trim(), source_row:Number(get("source_row") || 0) };
  });
  const sent = recipients.filter(item => /^sent/i.test(item.status));
  const group = sent.length ? sent : recipients.filter(item => !["Excluded", CAMPAIGN_DELETED_STATUS].includes(item.status));
  const records = directoryRecords || getAllRowsAsObjects_(getOutreachSheet_(OUTREACH_SHEET_NAME)).map((row, index) => campaignDirectoryRecord_(row, index + 2));
  const index = () => new Map();
  const byAccount = index(), byEmail = index(), byName = index();
  const add = (map, key, record) => { if (!key) return; if (!map.has(key)) map.set(key, []); map.get(key).push(record); };
  records.forEach(record => {
    add(byAccount, String(record.account_id || "").trim(), record);
    add(byEmail, String(record.email || "").trim().toLowerCase(), record);
    add(byName, String(record.business || "").trim().toLowerCase(), record);
  });
  const rows = new Set();
  const unmatched = {};
  const leaveOut = (reason, item) => (unmatched[reason] = unmatched[reason] || []).push(item.business || item.email || "Unnamed business");
  group.forEach(item => {
    // A fallback match must not belong to a different account than the recipient had.
    const compatible = record => !item.account_id || !String(record.account_id || "").trim() || String(record.account_id).trim() === item.account_id;
    let ambiguous = false;
    for (const [map, key] of [[byAccount, item.account_id], [byEmail, item.email], [byName, item.business.toLowerCase()]]) {
      if (!key) continue;
      const matches = (map.get(key) || []).filter(compatible);
      if (matches.length === 1) { rows.add(matches[0].source_row); return; }
      if (matches.length > 1) { ambiguous = true; break; }
    }
    leaveOut(ambiguous ? "Matches more than one Directory row (fix the duplicate, then preview again)" : "No longer found in the Directory", item);
  });
  return { rows:rows, unmatched:unmatched };
}

function campaignLeftOutDateLabel_(value) {
  const date = outreachDate_(value);
  return date ? Utilities.formatDate(date, Session.getScriptTimeZone(), "EEE MMM d") : "";
}

function campaignCriteriaFailureLabel_(failure, criteria) {
  const filters = criteria.filters || {};
  return {
    distance:`More than ${criteria.radius_miles} mi from ${criteria.center?.label || "the center"} (or no distance on file)`,
    fit:`Craft-spirit fit below ${criteria.min_fit}`,
    city:`Not in city ${filters.city}`, county:`Not in county ${filters.county}`,
    segment:`Not segment ${filters.segment}`, wave:`Not wave ${filters.wave}`,
  }[failure] || failure;
}

function campaignDirectoryStageSelection_(criteria) {
  const leadSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const stage = String(criteria.stage || "Initial");
  const directoryRecords = getAllRowsAsObjects_(leadSheet).map((row, index) => campaignDirectoryRecord_(row, index + 2));
  const initialSentEmails = campaignInitialSentEmailSet_(directoryRecords);
  const activityMap = stage === "Initial" ? null : outreachActivityMap_();
  const source = criteria.audience_mode === "sequence" ? null : campaignSourceRows_(criteria.source_campaign_id, directoryRecords);
  // A sequence step's pool is the businesses whose Directory Sequence ID is that sequence.
  const sequenceRows = criteria.audience_mode === "sequence"
    ? new Set(directoryRecords.filter(record => String(record.directory_row?.sequence_id || "").trim() === String(criteria.sequence_id || "")).map(record => record.source_row))
    : null;
  const sourceRows = source ? source.rows : sequenceRows;
  // Why businesses were left out, so a preview with few or no recipients says what is in the way
  // (for example a follow-up date that has not arrived) instead of only "0 eligible".
  const leftOut = {};
  const leftOutNames = {};
  const leaveOut = (reason, record) => {
    leftOut[reason] = (leftOut[reason] || 0) + 1;
    (leftOutNames[reason] = leftOutNames[reason] || []).length < 8 && leftOutNames[reason].push(record.business || "Unnamed business");
  };
  if (source) Object.entries(source.unmatched).forEach(([reason, names]) => names.forEach(name => leaveOut(reason, { business:name })));
  const pool = directoryRecords.filter(record => !sourceRows || sourceRows.has(record.source_row));
  const candidateRows = pool.filter(record => {
    if (record.next_email.toLowerCase() !== stage.toLowerCase()) {
      // Only explain stage mismatches for a chosen source group; for the whole Directory they are just "not this email".
      if (sourceRows) leaveOut(/^complete$/i.test(record.next_email) ? "Outreach sequence already complete" : `Due for ${record.next_email || "Initial"} instead`, record);
      return false;
    }
    if (stage === "Initial" && record.relationship.toLowerCase() !== "prospect") { if (sourceRows) leaveOut("Not a prospect", record); return false; }
    return true;
  });
  const seenEmails = new Set();
  const eligible = candidateRows.map(record => {
    if (activityMap) {
      record.activity = activityMap.get(`account:${record.account_id}`) || activityMap.get(`business:${record.business.toLowerCase()}`) || [];
    }
    record.campaign_miles = campaignDistanceForCriteria_(record, criteria);
    return record;
  }).filter(record => {
    // Preview and freeze both use directory fields only for eligibility; rendered messages are intentionally deferred to freeze.
    const eligibilityOptions = stage === "Initial" ? { skip_legacy_pilot:true, initial_sent_emails:initialSentEmails } : { skip_legacy_pilot:true };
    const reasons = outreachSendEligibility_(record, eligibilityOptions);
    if (reasons.length) {
      const dateBlocked = reasons.find(reason => /date has not arrived/i.test(reason));
      const due = dateBlocked ? campaignLeftOutDateLabel_(record.next_follow_up) : "";
      leaveOut(dateBlocked ? `Not due yet${due ? ` (due ${due})` : ""}` : reasons[0], record);
      return false;
    }
    const failures = campaignCriteriaFailures_(record, criteria);
    if (failures.length) { leaveOut(campaignCriteriaFailureLabel_(failures[0], criteria), record); return false; }
    const email = String(record.email || "").trim().toLowerCase();
    if (seenEmails.has(email)) { leaveOut("Same email address as another business in this campaign", record); return false; }
    seenEmails.add(email);
    return true;
  }).sort((a, b) => Number(a.campaign_miles) - Number(b.campaign_miles) || outreachPriorityScore_(b) - outreachPriorityScore_(a) || String(a.business).localeCompare(String(b.business)));
  const records = criteria.max_recipients === null ? eligible : eligible.slice(0, criteria.max_recipients);
  if (records.length < eligible.length) leftOut[`Over the ${criteria.max_recipients}-recipient maximum`] = eligible.length - records.length;
  return { records:records, initial_sent_emails:initialSentEmails, left_out:leftOut, left_out_names:leftOutNames, source_group_size:source ? sourceRows.size + Object.values(source.unmatched).reduce((total, names) => total + names.length, 0) : sequenceRows ? sequenceRows.size : null };
}

function campaignDirectoryInitialSelection_(criteria) {
  return campaignDirectoryStageSelection_(Object.assign({}, criteria, { stage:String(criteria?.stage || "Initial") }));
}

function campaignDirectoryInitialRecords_(criteria) {
  return campaignDirectoryStageSelection_(criteria).records;
}

function campaignEligibleInitialRecords_(criteria) {
  const stage = String(criteria.stage || "Initial");
  const selection = campaignDirectoryStageSelection_(criteria);
  const directoryRecords = selection.records;
  if (!directoryRecords.length) return { records:[], preview_count:0, removed_by_duplicate_checks:0 };
  const activityMap = outreachActivityMap_();
  const settings = getOutreachCampaignSettings_();
  const draftMap = outreachDraftMap_();
  const programMap = outreachProgramMap_();
  const engagementMap = outreachEngagementMap_();
  const records = directoryRecords.map(directoryRecord => {
    const record = outreachRecord_(directoryRecord.directory_row, directoryRecord.source_row, activityMap, settings, draftMap, programMap, engagementMap);
    record.campaign_miles = directoryRecord.campaign_miles;
    return record;
  }).filter(record => {
    const reasons = stage === "Initial"
      ? outreachSendEligibility_(record, { initial_sent_emails:selection.initial_sent_emails })
      : outreachSendEligibility_(record, {});
    return !reasons.length;
  });
  return { records:records, preview_count:directoryRecords.length, removed_by_duplicate_checks:directoryRecords.length - records.length };
}

function campaignRecipientSnapshotValues_(sheet, campaignId, record) {
  const h = getHeaderMap_(sheet);
  const values = Array(sheet.getLastColumn()).fill("");
  const set = (key, value) => { if (h[key] !== undefined) values[h[key]] = value; };
  const checksum = sha256_([record.source_row, record.account_id, record.business, record.email, record.subject, record.body_text].join("|"));
  set("campaign_id", campaignId); set("source_row", record.source_row || ""); set("account_id", record.account_id);
  set("business_name", record.business); set("recipient_email", record.email); set("contact", record.contact);
  set("city", record.city); set("zip", record.postal_code || ""); set("miles", record.campaign_miles === null || record.campaign_miles === undefined ? "" : record.campaign_miles); set("priority", record.priority);
  set("email_confidence", record.email_confidence); set("segment", record.segment); set("wave", record.wave);
  set("message_stage", record.next_email); set("newsletter_contact_id", record.newsletter_contact_id || "");
  set("subject", record.subject); set("body_text", record.body_text); set("html", record.preview_html);
  if (record.footer_html) set("footer_html", record.footer_html);
  set("content_checksum", checksum); set("status", "Ready for review"); set("idempotency_token", `${campaignId}-${record.newsletter_contact_id || record.source_row}`); set("app_version", APP_VERSION);
  return values;
}

function campaignAudienceChecksum_(audience, recipients, criteriaValue) {
  return sha256_([String(audience || ""), String(criteriaValue || "")].concat(recipients.map(item => {
    const h = item.headers;
    return `${item.values[h.source_row]}|${item.values[h.recipient_email]}|${item.values[h.content_checksum]}`;
  })).join("\n"));
}

function campaignRecipientCityFallbacks_(recipients) {
  const fallback = { by_account:new Map(), by_source_row:new Map() };
  const missingCity = recipients.some(item => !String(item.values[item.headers.city] || "").trim());
  if (!missingCity) return fallback;
  const sheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const headers = getHeaderMap_(sheet);
  if (sheet.getLastRow() < 2 || headers.city === undefined) return fallback;
  // One directory data read per campaign load, then recipient rows resolve from maps.
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().forEach((values, index) => {
    const city = String(values[headers.city] || "").trim();
    if (!city) return;
    const sourceRow = index + 2;
    fallback.by_source_row.set(sourceRow, city);
    const accountId = headers.account_id === undefined ? "" : String(values[headers.account_id] || "").trim();
    if (accountId) fallback.by_account.set(accountId, city);
  });
  return fallback;
}

function campaignObject_(campaign, recipients, includeRecipients) {
  const h = campaign.headers;
  const value = key => campaign.values[h[key]];
  const cityFallbacks = includeRecipients ? campaignRecipientCityFallbacks_(recipients) : { by_account:new Map(), by_source_row:new Map() };
  const recipientObjects = recipients.map(item => {
    const rh = item.headers;
    const get = key => item.values[rh[key]];
    const sourceRow = Number(get("source_row") || 0);
    const accountId = String(get("account_id") || "");
    const storedCity = String(get("city") || "").trim();
    return {
      source_row:sourceRow, account_id:accountId,
      business:String(get("business_name") || ""), email:String(get("recipient_email") || ""),
      contact:String(get("contact") || ""), city:storedCity || cityFallbacks.by_account.get(accountId) || cityFallbacks.by_source_row.get(sourceRow) || "", postal_code:String(get("zip") || ""), miles:outreachMiles_(get("miles")), priority:String(get("priority") || ""),
      email_confidence:String(get("email_confidence") || ""), segment:String(get("segment") || ""), wave:String(get("wave") || ""),
      subject:String(get("subject") || ""), body_text:String(get("body_text") || ""), preview_html:String(get("html") || ""),
      content_checksum:String(get("content_checksum") || ""), status:String(get("status") || ""),
      result_detail:String(get("result_detail") || ""), message_id:String(get("zoho_message_id") || ""),
      sent_at:get("sent_at") || "", idempotency_token:String(get("idempotency_token") || ""),
    };
  });
  const counts = recipientObjects.reduce((all, item) => { all[item.status || "Unknown"] = (all[item.status || "Unknown"] || 0) + 1; return all; }, {});
  const sentDates = recipientObjects
    .filter(item => /^sent/i.test(item.status))
    .map(item => outreachDate_(item.sent_at))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  const result = {
    campaign_id:String(value("campaign_id") || ""), name:String(value("campaign_name") || ""), audience:String(value("audience") || ""),
    status:String(value("status") || ""), recipient_count:Number(value("recipient_count") || recipientObjects.length),
    audience_checksum:String(value("audience_checksum") || ""), unsegmented_count:Number(value("unsegmented_count") || 0),
    created_at:value("created_at") || "", created_by:String(value("created_by") || ""), approved_at:value("approved_at") || "",
    approved_by:String(value("approved_by") || ""), last_batch_at:value("last_batch_at") || "", sent_count:Number(value("sent_count") || 0), blocked_count:Number(value("blocked_count") || 0),
    sent_at_start:sentDates.length ? sentDates[0].toISOString() : "", sent_at_end:sentDates.length ? sentDates[sentDates.length - 1].toISOString() : "",
    counts:counts,
    criteria:campaignStoredCriteria_(value("criteria")),
    scheduled_send_at:value("scheduled_send_at") || "", scheduled_by:String(value("scheduled_by") || ""),
    schedule_status:String(value("schedule_status") || ""), schedule_detail:String(value("schedule_detail") || ""),
  };
  if (includeRecipients) {
    result.recipients = recipientObjects;
    result.approval_token = String(value("approval_token") || "");
  }
  return result;
}

function apiGetOutreachCampaigns_() {
  const startedAt = Date.now();
  const sheets = outreachCampaignSheets_();
  const h = getHeaderMap_(sheets.campaigns);
  if (sheets.campaigns.getLastRow() < 2) return { campaigns:[], performance:{ total_ms:Date.now() - startedAt, stages:{ campaign_read_ms:Date.now() - startedAt } } };
  const recipientHeaders = getHeaderMap_(sheets.recipients);
  const recipientCount = Math.max(0, sheets.recipients.getLastRow() - 1);
  const recipientIds = recipientCount ? sheets.recipients.getRange(2, recipientHeaders.campaign_id + 1, recipientCount, 1).getValues() : [];
  const recipientStatuses = recipientCount ? sheets.recipients.getRange(2, recipientHeaders.status + 1, recipientCount, 1).getValues() : [];
  const recipientSentAt = recipientCount && recipientHeaders.sent_at !== undefined ? sheets.recipients.getRange(2, recipientHeaders.sent_at + 1, recipientCount, 1).getValues() : [];
  const listHeaders = { campaign_id:0, status:1, sent_at:2 };
  const allRecipients = recipientIds.map((id, index) => ({
    row:index + 2,
    values:[id[0], recipientStatuses[index]?.[0] || "", recipientSentAt[index]?.[0] || ""],
    headers:listHeaders,
  }));
  const campaigns = sheets.campaigns.getRange(2, 1, sheets.campaigns.getLastRow() - 1, sheets.campaigns.getLastColumn()).getValues()
    .map((values, index) => ({ row:index + 2, values:values, headers:h }))
    .filter(campaign => String(campaign.values[h.status] || "") !== CAMPAIGN_DELETED_STATUS)
    .reverse().map(campaign => campaignObject_(campaign, allRecipients.filter(item => String(item.values[item.headers.campaign_id] || "") === String(campaign.values[h.campaign_id] || "")), false));
  return { campaigns:campaigns, performance:{ total_ms:Date.now() - startedAt, stages:{ campaign_read_ms:Date.now() - startedAt } } };
}

function apiGetOutreachCampaign_(p) {
  const startedAt = Date.now();
  const sheets = outreachCampaignSheets_();
  const campaign = outreachCampaignRow_(sheets.campaigns, p?.campaign_id);
  if (!campaign) throw new Error("Campaign not found.");
  const recipientRows = campaignRecipientRows_(sheets.recipients, p.campaign_id);
  const result = campaignObject_(campaign, recipientRows, true);
  // Cheap pre-check for the Delete button; deletion itself re-checks the activity log under the lock.
  result.delete_blocker = campaignDeleteBlocker_(campaign, recipientRows, new Set());
  return { campaign:result, performance:{ total_ms:Date.now() - startedAt, stages:{ campaign_recipient_read_ms:Date.now() - startedAt } } };
}

function writeCampaignRecipientRows_(sheet, recipients) {
  if (!recipients.length) return;
  const sorted = recipients.slice().sort((a, b) => a.row - b.row);
  let group = [];
  const writeGroup = () => {
    if (!group.length) return;
    sheet.getRange(group[0].row, 1, group.length, group[0].values.length).setValues(group.map(item => item.values));
    group = [];
  };
  sorted.forEach(item => {
    if (group.length && item.row !== group[group.length - 1].row + 1) writeGroup();
    group.push(item);
  });
  writeGroup();
}

function campaignDirectoryRow_(sheet, headers, recipient) {
  const rh = recipient.headers;
  const accountId = String(recipient.values[rh.account_id] || "").trim();
  const sourceRow = Number(recipient.values[rh.source_row] || 0);
  const matched = accountId ? outreachRowsMatchingCell_(sheet, ["account_id", "Account ID"], accountId) : [];
  if (matched.length) return { row:Number(matched[0].__source_row), values:matched[0] };
  if (!Number.isInteger(sourceRow) || sourceRow < 2 || sourceRow > sheet.getLastRow()) return null;
  const raw = sheet.getRange(sourceRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = {};
  Object.keys(headers).forEach(key => values[key] = raw[headers[key]]);
  return { row:sourceRow, values:values };
}

function campaignAcceptedActivity_(accountId, recipientToken) {
  const sheet = getOutreachSheet_(OUTREACH_ACTIVITY_SHEET_NAME);
  const rows = outreachRowsMatchingCell_(sheet, ["idempotency_token", "Idempotency Token"], recipientToken);
  return rows.map(row => {
    const sentAt = outreachDate_(outreachValue_(row, ["timestamp", "sent_at"]));
    return {
      account_id:String(outreachValue_(row, ["account_id", "Account ID"]) || "").trim(),
      result:String(outreachValue_(row, ["result"]) || "").trim(),
      message_id:String(outreachValue_(row, ["message_id", "zoho_message_id", "Message ID"]) || "").trim(),
      sent_at:sentAt,
    };
  }).filter(row => {
    const result = row.result.toUpperCase();
    return row.account_id === String(accountId || "").trim()
      && result.includes("APP SENT")
      && !result.includes("TEST")
      && !!row.message_id
      && !!row.sent_at;
  }).sort((a, b) => b.sent_at.getTime() - a.sent_at.getTime())[0] || null;
}

function updateCampaignDeliveryCounts_(campaign, recipients) {
  const h = campaign.headers;
  campaign.values[h.sent_count] = recipients.filter(item => ["Sent", "Sent - needs recording"].includes(String(item.values[item.headers.status] || ""))).length;
  campaign.values[h.blocked_count] = recipients.filter(item => String(item.values[item.headers.status] || "") === "Blocked").length;
  campaign.values[h.app_version] = APP_VERSION;
}

function reconcileBlockedCampaignSends_(sheets, campaign, recipients, staffName, requestedToken) {
  const leadSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const leadHeaders = getHeaderMap_(leadSheet);
  const settings = getOutreachCampaignSettings_();
  const criteria = campaignStoredCriteria_(campaign.values[campaign.headers.criteria]);
  const campaignStage = String(campaignStoredCriteria_(campaign.values[campaign.headers.criteria])?.stage || "Initial");
  const cocktailList = criteria?.campaign_type === "cocktail_list" || criteria?.campaign_type === "customer_invite";
  const changed = [];
  let reconciled = 0;
  let unmatched = 0;
  recipients.filter(item => {
    const status = String(item.values[item.headers.status] || "");
    const token = String(item.values[item.headers.idempotency_token] || "");
    return status === "Blocked" || (requestedToken && token === String(requestedToken) && status === "Ready to send");
  }).forEach(item => {
    const rh = item.headers;
    const accountId = String(item.values[rh.account_id] || "").trim();
    const token = String(item.values[rh.idempotency_token] || "").trim();
    const activity = campaignAcceptedActivity_(accountId, token);
    if (!activity) { unmatched += 1; return; }
    if (cocktailList) {
      item.values[rh.status] = "Sent";
      item.values[rh.result_detail] = "Reconciled from Activity Log: Zoho accepted.";
      item.values[rh.zoho_message_id] = activity.message_id;
      item.values[rh.sent_at] = activity.sent_at;
      item.values[rh.app_version] = APP_VERSION;
      changed.push(item);
      reconciled += 1;
      return;
    }
    const directory = campaignDirectoryRow_(leadSheet, leadHeaders, item);
    if (!directory) { unmatched += 1; return; }
    const record = {
      account_id:String(directory.values.account_id || accountId),
      business:String(outreachValue_(directory.values, ["business", "business_name"]) || item.values[rh.business_name] || ""),
      email:String(outreachValue_(directory.values, ["email", "email_address"]) || item.values[rh.recipient_email] || ""),
    };
    advanceOutreachSend_(leadSheet, directory.row, record, campaignStage, activity.message_id, activity.sent_at, settings);
    item.values[rh.status] = "Sent";
    item.values[rh.result_detail] = "Reconciled from Activity Log: Zoho accepted.";
    item.values[rh.zoho_message_id] = activity.message_id;
    item.values[rh.sent_at] = activity.sent_at;
    item.values[rh.app_version] = APP_VERSION;
    changed.push(item);
    reconciled += 1;
  });
  writeCampaignRecipientRows_(sheets.recipients, changed);
  updateCampaignDeliveryCounts_(campaign, recipients);
  sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
  appendAudit_("RECONCILE_CAMPAIGN_SENDS", "Campaign", String(campaign.values[campaign.headers.campaign_id] || ""), "", staffName, OUTREACH_ACTIVITY_SHEET_NAME, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, "Completed", `${reconciled} reconciled; ${unmatched} checked records without a matching accepted Activity Log record.`);
  return { reconciled:reconciled, blocked_without_match:unmatched, sent_count:Number(campaign.values[campaign.headers.sent_count] || 0), blocked_count:Number(campaign.values[campaign.headers.blocked_count] || 0), recipients:recipients };
}

function apiReconcileCampaignSends_(p) {
  requireFields_(p || {}, ["campaign_id"]);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    const counts = reconcileBlockedCampaignSends_(sheets, campaign, campaignRecipientRows_(sheets.recipients, p.campaign_id), authenticatedActor_(p, "Sturgeon Distribution Hub"), p.idempotency_token);
    const recipientStatuses = counts.recipients.map(item => ({
      idempotency_token:String(item.values[item.headers.idempotency_token] || ""),
      business:String(item.values[item.headers.business_name] || ""),
      status:String(item.values[item.headers.status] || ""),
    }));
    const remaining = recipientStatuses.filter(item => item.status === "Ready to send").length;
    return {
      message:`${counts.reconciled} blocked recipient(s) reconciled from Activity Log. No email was sent.`,
      reconciled:counts.reconciled,
      blocked_without_match:counts.blocked_without_match,
      sent_count:counts.sent_count,
      blocked_count:counts.blocked_count,
      remaining:remaining,
      recipient_statuses:recipientStatuses,
    };
  } finally {
    lock.releaseLock();
  }
}

function reconcileBlockedCampaignSends() {
  try {
    const result = apiReconcileCampaignSends_({ campaign_id:"CMP-89758BA7F1B2483F84E59782BEFEAD39", staff_name:"Karl (editor)" });
    Logger.log(JSON.stringify(result));
    return result;
  } finally {
    bumpReadCacheVersion_(["outreach"]);
  }
}

function campaignDirectoryRows_(sheet) {
  const headers = getHeaderMap_(sheet);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues()
    .map((values, index) => {
      const row = {};
      Object.keys(headers).forEach(key => row[key] = values[headers[key]]);
      return { row:index + 2, values:row };
    });
  const byAccount = new Map();
  const bySource = new Map();
  rows.forEach(item => {
    const accountId = String(item.values.account_id || "").trim();
    if (accountId && !byAccount.has(accountId)) byAccount.set(accountId, item);
    bySource.set(item.row, item);
  });
  return { by_account:byAccount, by_source:bySource };
}

function campaignEditedRecipientTokenSet_() {
  const auditSheet = getOutreachSheet_(HUB_AUDIT_SHEET_NAME);
  if (auditSheet.getLastRow() < 2) return new Set();
  return new Set(getAllRowsAsObjects_(auditSheet)
    .filter(row => String(outreachValue_(row, ["action"]) || "") === "EDIT_OUTREACH_CAMPAIGN_RECIPIENT")
    .map(row => String(outreachValue_(row, ["record_id", "Record ID"]) || "").trim())
    .filter(Boolean));
}

function campaignRecipientChecksum_(recipient) {
  const rh = recipient.headers;
  return sha256_([
    recipient.values[rh.source_row], recipient.values[rh.account_id], recipient.values[rh.business_name], recipient.values[rh.recipient_email],
    recipient.values[rh.subject], recipient.values[rh.body_text],
  ].join("|"));
}

function apiRebuildCampaignRecipients_(p) {
  requireFields_(p || {}, ["campaign_id"]);
  const batchSize = Number(p.rebuild_batch_size || 25);
  const batchOffset = Number(p.rebuild_offset || 0);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) throw new Error("Rebuild batch size must be between 1 and 25.");
  if (!Number.isInteger(batchOffset) || batchOffset < 0) throw new Error("Rebuild batch offset must be zero or greater.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    const ch = campaign.headers;
    if (String(campaign.values[ch.status] || "") !== "Review") throw new Error("Campaign must be in Review before unsent emails can be rebuilt.");
    const staffName = authenticatedActor_(p, "Sturgeon Distribution Hub");
    const recipients = campaignRecipientRows_(sheets.recipients, p.campaign_id);
    const reconciliation = batchOffset === 0
      ? reconcileBlockedCampaignSends_(sheets, campaign, recipients, staffName)
      : { reconciled:0, blocked_without_match:0 };
    const leadSheet = getOutreachSheet_(OUTREACH_SHEET_NAME);
    const directory = campaignDirectoryRows_(leadSheet);
    const settings = getOutreachCampaignSettings_();
    const draftMap = outreachDraftMap_();
    const criteria = campaignStoredCriteria_(campaign.values[ch.criteria]);
    const campaignStage = String(campaignStoredCriteria_(campaign.values[ch.criteria])?.stage || "Initial");
    const cocktailList = criteria?.campaign_type === "cocktail_list";
    const customerInvite = criteria?.campaign_type === "customer_invite";
    const editedRecipientTokens = campaignEditedRecipientTokenSet_();
    const readyRecipients = recipients.filter(item => String(item.values[item.headers.status] || "") === "Ready for review");
    const rebuildRecipients = readyRecipients.slice(batchOffset, batchOffset + batchSize);
    if (!rebuildRecipients.length) {
      return { message:"No additional unsent campaign emails need rebuilding.", rebuilt:0, rebuilt_with_edits_kept:0, skipped:0, reconciled:reconciliation.reconciled, processed:0, remaining:0 };
    }
    const changed = [];
    let rebuilt = 0;
    let rebuiltWithEditsKept = 0;
    let skipped = 0;
    rebuildRecipients.forEach(item => {
      const rh = item.headers;
      if (customerInvite) {
        let live;
        try { live = liveCustomerInviteRecipient_(item.values[rh.source_row]); }
        catch (error) { live = null; }
        if (!live || live.reasons.length || live.record.business !== String(item.values[rh.business_name] || "") || String(live.record.email || "").trim().toLowerCase() !== String(item.values[rh.recipient_email] || "").trim().toLowerCase()) {
          item.values[rh.result_detail] = `Skipped — customer row changed or is no longer eligible${live && live.reasons.length ? ` (${live.reasons.join("; ")})` : ""}.`;
          item.values[rh.app_version] = APP_VERSION;
          changed.push(item);
          skipped += 1;
          return;
        }
        const message = customerInviteMessage_(live.record, settings);
        if (editedRecipientTokens.has(String(item.values[rh.idempotency_token] || ""))) {
          // The edited text is kept; the footer (link, sign-off, address) is always re-attached.
          item.values[rh.html] = outreachPlainTextToHtml_(String(item.values[rh.body_text] || "")) + String(message.footer_html || "");
          rebuiltWithEditsKept += 1;
        } else {
          item.values[rh.subject] = message.subject;
          item.values[rh.body_text] = message.body_text;
          item.values[rh.html] = message.html;
          rebuilt += 1;
        }
        if (rh.footer_html !== undefined) item.values[rh.footer_html] = String(message.footer_html || "");
        item.values[rh.content_checksum] = campaignRecipientChecksum_(item);
        if (rh.message_stage !== undefined) item.values[rh.message_stage] = OUTREACH_CUSTOMER_INVITE_STAGE;
        item.values[rh.result_detail] = "Rebuilt with current order-online invite template.";
        item.values[rh.app_version] = APP_VERSION;
        changed.push(item);
        return;
      }
      if (cocktailList) {
        let record;
        try {
          record = liveCocktailListRecipient_(rh.newsletter_contact_id === undefined ? "" : item.values[rh.newsletter_contact_id]);
        } catch (error) {
          item.values[rh.result_detail] = "Skipped — newsletter contact changed.";
          item.values[rh.app_version] = APP_VERSION;
          changed.push(item);
          skipped += 1;
          return;
        }
        if (record.business !== String(item.values[rh.business_name] || "") || record.email.toLowerCase() !== String(item.values[rh.recipient_email] || "").trim().toLowerCase() || newsletterCocktailListEligibility_(record).length) {
          item.values[rh.result_detail] = "Skipped — newsletter contact changed or is no longer eligible.";
          item.values[rh.app_version] = APP_VERSION;
          changed.push(item);
          skipped += 1;
          return;
        }
        const message = cocktailListMessage_(record, settings);
        if (editedRecipientTokens.has(String(item.values[rh.idempotency_token] || ""))) {
          item.values[rh.html] = outreachPlainTextToHtml_(String(item.values[rh.body_text] || "")) + String(message.footer_html || "");
          if (rh.footer_html !== undefined) item.values[rh.footer_html] = String(message.footer_html || "");
          rebuiltWithEditsKept += 1;
        } else {
          item.values[rh.subject] = message.subject;
          item.values[rh.body_text] = message.body_text;
          item.values[rh.html] = message.html;
          if (rh.footer_html !== undefined) item.values[rh.footer_html] = String(message.footer_html || "");
          rebuilt += 1;
        }
        item.values[rh.content_checksum] = campaignRecipientChecksum_(item);
        if (rh.message_stage !== undefined) item.values[rh.message_stage] = OUTREACH_COCKTAIL_LIST_STAGE;
        item.values[rh.result_detail] = "Rebuilt with current Cocktail list template.";
        item.values[rh.app_version] = APP_VERSION;
        changed.push(item);
        return;
      }
      const accountId = String(item.values[rh.account_id] || "").trim();
      const sourceRow = Number(item.values[rh.source_row] || 0);
      const current = directory.by_account.get(accountId) || directory.by_source.get(sourceRow);
      const currentBusiness = String(outreachValue_(current?.values || {}, ["business", "business_name"]) || "").trim();
      const currentEmail = String(outreachValue_(current?.values || {}, ["email", "email_address"]) || "").trim().toLowerCase();
      if (!current || currentBusiness !== String(item.values[rh.business_name] || "").trim() || currentEmail !== String(item.values[rh.recipient_email] || "").trim().toLowerCase()) {
        item.values[rh.result_detail] = "Skipped — directory changed.";
        item.values[rh.app_version] = APP_VERSION;
        changed.push(item);
        skipped += 1;
        return;
      }
      const currentStage = String(outreachValue_(current.values, ["next_email", "stage"]) || "Initial").trim();
      if (currentStage.toLowerCase() !== campaignStage.toLowerCase()) {
        item.values[rh.result_detail] = "Skipped — outreach stage changed.";
        item.values[rh.app_version] = APP_VERSION;
        changed.push(item);
        skipped += 1;
        return;
      }
      const source = Object.assign({}, current.values, { next_email:campaignStage, stage:campaignStage });
      const draft = draftMap.get(outreachDraftKey_(accountId || current.row, campaignStage)) || draftMap.get(outreachDraftKey_(current.row, campaignStage));
      const message = outreachMessage_(source, settings, draft, false);
      if (editedRecipientTokens.has(String(item.values[rh.idempotency_token] || ""))) {
        item.values[rh.html] = outreachPlainTextToHtml_(String(item.values[rh.body_text] || "")) + String(message.footer_html || "");
        if (rh.footer_html !== undefined) item.values[rh.footer_html] = String(message.footer_html || "");
        rebuiltWithEditsKept += 1;
      } else {
        item.values[rh.subject] = message.subject;
        item.values[rh.body_text] = message.body_text;
        item.values[rh.html] = message.html;
        if (rh.footer_html !== undefined) item.values[rh.footer_html] = String(message.footer_html || "");
        rebuilt += 1;
      }
      item.values[rh.content_checksum] = campaignRecipientChecksum_(item);
      if (rh.message_stage !== undefined) item.values[rh.message_stage] = campaignStage;
      item.values[rh.result_detail] = "Rebuilt with current template.";
      item.values[rh.app_version] = APP_VERSION;
      changed.push(item);
    });
    writeCampaignRecipientRows_(sheets.recipients, changed);
    campaign.values[ch.audience_checksum] = campaignAudienceChecksum_(campaign.values[ch.audience], recipients, campaign.values[ch.criteria]);
    campaign.values[ch.status] = "Review";
    campaign.values[ch.approved_at] = "";
    campaign.values[ch.approved_by] = "";
    campaign.values[ch.approval_token] = "";
    updateCampaignDeliveryCounts_(campaign, recipients);
    sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
    const remaining = Math.max(0, readyRecipients.length - batchOffset - rebuildRecipients.length);
    appendAudit_("REBUILD_CAMPAIGN_RECIPIENTS", "Campaign", p.campaign_id, "", staffName, OUTREACH_SHEET_NAME, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, "Review", `${rebuilt} rebuilt; ${rebuiltWithEditsKept} rebuilt with edits kept; ${skipped} skipped — directory changed; ${reconciliation.reconciled} reconciled; ${remaining} rebuild recipients remain.`);
    return {
      message:`${rebuilt} rebuilt; ${rebuiltWithEditsKept} rebuilt with edits kept; ${skipped} skipped; ${reconciliation.reconciled} reconciled; ${remaining} remain. Campaign remains in Review and must be approved again.`,
      rebuilt:rebuilt,
      rebuilt_with_edits_kept:rebuiltWithEditsKept,
      skipped:skipped,
      reconciled:reconciliation.reconciled,
      processed:rebuildRecipients.length,
      remaining:remaining,
    };
  } finally {
    lock.releaseLock();
  }
}

function rebuildUnsentCampaignEmails() {
  try {
    const campaignId = "CMP-89758BA7F1B2483F84E59782BEFEAD39";
    const results = [];
    let offset = 0;
    while (true) {
      const result = apiRebuildCampaignRecipients_({ campaign_id:campaignId, staff_name:"Karl (editor)", rebuild_batch_size:25, rebuild_offset:offset });
      results.push(result);
      Logger.log(JSON.stringify(result));
      if (!Number(result.remaining || 0) || !Number(result.processed || 0)) break;
      offset += Number(result.processed);
    }
    return results;
  } finally {
    bumpReadCacheVersion_(["outreach"]);
  }
}

function campaignRecipientFooterHtml_(recipient, settings, draftMap) {
  const rh = recipient.headers;
  const stored = rh.footer_html === undefined ? "" : String(recipient.values[rh.footer_html] || "");
  if (stored) return stored;
  if (String(recipient.values[rh.message_stage] || "") === OUTREACH_CUSTOMER_INVITE_STAGE) {
    return customerInviteFooterHtml_({ account_id:recipient.values[rh.account_id], business:recipient.values[rh.business_name], email:recipient.values[rh.recipient_email], contact:recipient.values[rh.contact] }, settings);
  }
  if (String(recipient.values[rh.message_stage] || "") === OUTREACH_COCKTAIL_LIST_STAGE) {
    return `<p>${escapeOutreachHtml_(String(settings["Physical mailing address"] || ""))}</p><p>Reply stop to unsubscribe.</p>`;
  }
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
    if (["Sent", "Sent - needs recording"].includes(String(recipient.values[rh.status] || ""))) throw new Error("Sent recipients cannot be excluded or restored.");
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

function apiSetOutreachCampaignRecipientExclusions_(p) {
  requireFields_(p || {}, ["campaign_id"]);
  const tokens = Array.from(new Set((p.idempotency_tokens || []).map(String).filter(Boolean)));
  if (!tokens.length) throw new Error("Select at least one recipient to exclude.");
  if (tokens.length > 500) throw new Error("Exclude no more than 500 recipients at once.");
  const reason = publicText_(p.reason || "", 500, "Exclusion reason");
  if (!reason) throw new Error("Provide one reason before excluding recipients.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    if (String(campaign.values[campaign.headers.status] || "") !== "Review") throw new Error("Only a campaign in Review can change recipient exclusions.");
    const selected = campaignRecipientRows_(sheets.recipients, p.campaign_id)
      .filter(item => tokens.includes(String(item.values[item.headers.idempotency_token] || "")));
    if (selected.length !== tokens.length) throw new Error("One or more selected recipients are no longer in this campaign.");
    if (selected.some(item => ["Sent", "Sent - needs recording"].includes(String(item.values[item.headers.status] || "")))) throw new Error("Sent recipients cannot be excluded.");
    selected.forEach(item => {
      item.values[item.headers.status] = "Excluded";
      item.values[item.headers.result_detail] = `Excluded from this campaign: ${reason}`;
    });
    selected.forEach(item => {
      const rh = item.headers;
      const statusColumn = rh.status + 1;
      const detailColumn = rh.result_detail + 1;
      if (detailColumn === statusColumn + 1) {
        sheets.recipients.getRange(item.row, statusColumn, 1, 2).setValues([[item.values[rh.status], item.values[rh.result_detail]]]);
      } else {
        sheets.recipients.getRange(item.row, statusColumn).setValue(item.values[rh.status]);
        sheets.recipients.getRange(item.row, detailColumn).setValue(item.values[rh.result_detail]);
      }
    });
    const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
    appendAudit_("BULK_EXCLUDE_OUTREACH_CAMPAIGN_RECIPIENTS", "Campaign", p.campaign_id, "", actor, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, OUTREACH_CAMPAIGNS_SHEET_NAME, "Excluded", `${selected.length} recipients: ${reason}`);
    return { message:`${selected.length} recipients excluded from this campaign. No email was sent.`, excluded:selected.length };
  } finally { lock.releaseLock(); }
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
    campaign.values[ch.audience_checksum] = campaignAudienceChecksum_(campaign.values[ch.audience], recipients, campaign.values[ch.criteria]);
    campaign.values[ch.app_version] = APP_VERSION;
    sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
    appendAudit_("EDIT_OUTREACH_CAMPAIGN_RECIPIENT", "Campaign recipient", String(p.idempotency_token), String(recipient.values[rh.account_id] || ""), authenticatedActor_(p, "Sturgeon Distribution Hub"), OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, OUTREACH_CAMPAIGNS_SHEET_NAME, "Review", `Edited ${recipient.values[rh.business_name]}.`);
    return { message:"Campaign email saved. No email was sent.", content_checksum:checksum, audience_checksum:String(campaign.values[ch.audience_checksum] || "") };
  } finally {
    lock.releaseLock();
  }
}

function apiPreviewOutreachCampaign_(p) {
  const criteria = campaignCriteriaFromRequest_(p);
  const invite = criteria.campaign_type === "customer_invite" ? campaignCustomerInviteSelection_(criteria) : null;
  const selection = !invite && criteria.campaign_type !== "cocktail_list" ? campaignDirectoryStageSelection_(criteria) : null;
  const records = invite ? invite.records : criteria.campaign_type === "cocktail_list" ? campaignCocktailListRecords_(criteria) : selection.records;
  return {
    criteria:criteria,
    excluded:invite ? invite.excluded : selection ? selection.left_out : undefined,
    excluded_names:invite ? invite.excluded_names : selection ? selection.left_out_names : undefined,
    source_group_size:selection ? selection.source_group_size : undefined,
    warnings:invite ? invite.warnings : undefined,
    audience:campaignAudienceLabel_(criteria),
    recipient_count:records.length,
    recipients:records.map(record => ({
      source_row:record.source_row,
      business:record.business,
      city:record.city,
      postal_code:record.postal_code,
      miles_from_center:record.campaign_miles,
      craft_spirit_fit:record.craft_spirit_fit || "",
      status:record.status,
      invite_reason:record.invite_reason || "",
      email:record.email,
      last_emailed:record.last_emailed,
    })),
  };
}

function apiCreateOutreachCampaign_(p) {
  if (p?.preview_confirmed !== true) throw new Error("Preview the campaign audience and confirm it before creating a campaign.");
  const criteria = campaignCriteriaFromRequest_(p);
  const name = publicText_(p?.campaign_name || (criteria.campaign_type === "cocktail_list" ? "Cocktail list" : criteria.campaign_type === "customer_invite" ? "Order online invite" : "Initial prospect campaign"), 120, "Campaign name");
  const audience = campaignAudienceLabel_(criteria);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try {
    const sheets = outreachCampaignSheets_();
    const eligibility = criteria.campaign_type === "cocktail_list"
      ? { records:campaignCocktailListRecords_(criteria), preview_count:0, removed_by_duplicate_checks:0 }
      : criteria.campaign_type === "customer_invite"
        ? { records:campaignCustomerInviteSelection_(criteria).records, preview_count:0, removed_by_duplicate_checks:0 }
        : campaignEligibleInitialRecords_(criteria);
    const eligible = eligibility.records;
    if (!eligible.length) throw new Error(criteria.campaign_type === "cocktail_list" ? "No subscribed newsletter contacts are eligible for a cocktail list campaign."
      : criteria.campaign_type === "customer_invite" ? "No current customers are eligible for an order-online invite." : "No eligible initial prospects are available for a campaign.");
    const campaignId = permanentId_("CMP");
    const recipientRows = eligible.map(record => campaignRecipientSnapshotValues_(sheets.recipients, campaignId, record));
    const recipientHeaders = getHeaderMap_(sheets.recipients);
    const criteriaJson = JSON.stringify(criteria);
    const audienceChecksum = campaignAudienceChecksum_(audience, recipientRows.map(values => ({ values:values, headers:recipientHeaders })), criteriaJson);
    const unsegmentedCount = ["cocktail_list", "customer_invite"].includes(criteria.campaign_type) ? 0 : eligible.filter(record => !String(record.segment || "").trim()).length;
    const campaignHeaders = getHeaderMap_(sheets.campaigns);
    // A sequence step must carry its Sequence ID and Step, or it would be an unlinked draft that is drafted again.
    if (criteria.audience_mode === "sequence" && (campaignHeaders.sequence_id === undefined || campaignHeaders.step === undefined)) {
      throw new Error("Outreach Campaigns has no Sequence ID / Step columns. Run repairHubStructure() first.");
    }
    if (sheets.campaigns.getLastRow() >= 2) {
      const matching = sheets.campaigns.getRange(2, 1, sheets.campaigns.getLastRow() - 1, sheets.campaigns.getLastColumn()).getValues()
        .find(row => ["Review", "Approved"].includes(String(row[campaignHeaders.status] || "")) && String(row[campaignHeaders.audience_checksum] || "") === audienceChecksum);
      if (matching) {
        return { message:"A matching active campaign already exists. No duplicate was created.", campaign_id:String(matching[campaignHeaders.campaign_id]), recipient_count:Number(matching[campaignHeaders.recipient_count] || eligible.length), audience_checksum:audienceChecksum, unsegmented_count:Number(matching[campaignHeaders.unsegmented_count] || unsegmentedCount), preview_recipient_count:eligibility.preview_count, removed_by_duplicate_checks:eligibility.removed_by_duplicate_checks, already_exists:true };
      }
    }
    sheets.recipients.getRange(sheets.recipients.getLastRow() + 1, 1, recipientRows.length, recipientRows[0].length).setValues(recipientRows);
    const campaignValues = Array(sheets.campaigns.getLastColumn()).fill("");
    const setCampaign = (key, value) => { if (campaignHeaders[key] !== undefined) campaignValues[campaignHeaders[key]] = value; };
    setCampaign("campaign_id", campaignId); setCampaign("campaign_name", name); setCampaign("audience", audience); setCampaign("status", "Review");
    setCampaign("recipient_count", eligible.length); setCampaign("audience_checksum", audienceChecksum); setCampaign("unsegmented_count", unsegmentedCount);
    setCampaign("created_at", new Date()); setCampaign("created_by", authenticatedActor_(p, "Sturgeon Distribution Hub"));
    setCampaign("sent_count", 0); setCampaign("blocked_count", 0); setCampaign("app_version", APP_VERSION); setCampaign("criteria", criteriaJson);
    if (criteria.audience_mode === "sequence") { setCampaign("sequence_id", criteria.sequence_id); setCampaign("step", sequenceStepNumber_(criteria.stage)); }
    sheets.campaigns.getRange(sheets.campaigns.getLastRow() + 1, 1, 1, campaignValues.length).setValues([campaignValues]);
    appendAudit_("CREATE_OUTREACH_CAMPAIGN", "Campaign", campaignId, "", authenticatedActor_(p, "Sturgeon Distribution Hub"), OUTREACH_SHEET_NAME, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, "Review", `${eligible.length} frozen recipients; ${audience}.`);
    return { message:"Campaign created for review. No email was sent.", campaign_id:campaignId, recipient_count:eligible.length, audience_checksum:audienceChecksum, unsegmented_count:unsegmentedCount, preview_recipient_count:eligibility.preview_count, removed_by_duplicate_checks:eligibility.removed_by_duplicate_checks };
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
    const criteria = campaignStoredCriteria_(campaign.values[h.criteria]);
    const unsegmented = ["cocktail_list", "customer_invite"].includes(criteria?.campaign_type) ? 0 : recipients.filter(item => !String(item.values[item.headers.segment] || "").trim()).length;
    if (unsegmented && p.confirm_unsegmented !== true) throw new Error(`${unsegmented} recipients have no segment. Confirm the default template before approval.`);
    const token = Utilities.getUuid().replace(/-/g, "");
    const now = new Date();
    campaign.values[h.status] = "Approved"; campaign.values[h.approved_at] = now; campaign.values[h.approved_by] = authenticatedActor_(p, "Sturgeon Distribution Hub"); campaign.values[h.approval_token] = token;
    clearCampaignSchedule_(campaign, "");
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
    campaign.values[ch.audience_checksum] = campaignAudienceChecksum_(campaign.values[ch.audience], updatedRecipients, campaign.values[ch.criteria]);
    campaign.values[ch.status] = "Review";
    campaign.values[ch.approved_at] = "";
    campaign.values[ch.approved_by] = "";
    campaign.values[ch.approval_token] = "";
    if (CAMPAIGN_SCHEDULE_ACTIVE_STATUSES.includes(String(campaign.values[ch.schedule_status] || ""))) clearCampaignSchedule_(campaign, "Cancelled", "Cancelled because the campaign was reopened for edits.");
    campaign.values[ch.app_version] = APP_VERSION;
    sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
    appendAudit_("REOPEN_OUTREACH_CAMPAIGN", "Campaign", p.campaign_id, "", authenticatedActor_(p, "Sturgeon Distribution Hub"), OUTREACH_CAMPAIGNS_SHEET_NAME, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, "Review", `${reopenable.length} recipients reopened (${reopenedBlocked} previously blocked); ${correctedSubjects} non-Oshkosh subjects corrected; sent and excluded recipients were unchanged.`);
    return { message:`${reopenable.length} recipients reopened (${reopenedBlocked} previously blocked); ${correctedSubjects} non-Oshkosh subjects corrected. No email was sent.`, recipient_count:reopenable.length, reopened_blocked:reopenedBlocked, corrected_subjects:correctedSubjects };
  } finally { lock.releaseLock(); }
}

const CAMPAIGN_DELETED_STATUS = "Deleted";
const CAMPAIGN_DELETABLE_RECIPIENT_STATUSES = ["Ready for review", "Ready to send", "Excluded"];

// Why a campaign cannot be deleted, or "" when it can. Only a campaign that never sent or attempted
// a single email may be deleted; anything with delivery history stays, because follow-up stages and
// the activity log depend on it.
function campaignDeleteBlocker_(campaign, recipients, acceptedTokens) {
  const ch = campaign.headers;
  const status = String(campaign.values[ch.status] || "");
  if (!["Review", "Approved"].includes(status)) return `This campaign is ${status || "closed"}; only a campaign that has not sent any email can be deleted.`;
  if (ch.schedule_status !== undefined && String(campaign.values[ch.schedule_status] || "") === "Sending") return "This campaign is sending right now. Wait for the scheduled send to finish or cancel the schedule first.";
  if (Number(campaign.values[ch.sent_count] || 0) > 0) return "This campaign has already sent email, so it is kept as delivery history.";
  const touched = recipients.find(item => {
    const rh = item.headers;
    return !CAMPAIGN_DELETABLE_RECIPIENT_STATUSES.includes(String(item.values[rh.status] || ""))
      || String(item.values[rh.zoho_message_id] || "").trim()
      || (rh.sent_at !== undefined && String(item.values[rh.sent_at] || "").trim())
      || acceptedTokens.has(String(item.values[rh.idempotency_token] || ""));
  });
  return touched ? `${String(touched.values[touched.headers.business_name] || "A recipient")} already has a send attempt, so this campaign is kept as delivery history.` : "";
}

// Deleting hides the campaign and retires its unsent recipients; rows stay in the sheets for the audit
// trail. A deleted campaign can never be approved, scheduled, edited or sent (every one of those
// actions requires Review or Approved), and it no longer blocks creating the same audience again.
function apiDeleteOutreachCampaign_(p) {
  requireFields_(p || {}, ["campaign_id", "staff_name"]);
  if (p.confirm_delete !== true) throw new Error("Confirm the deletion before deleting a campaign.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Another campaign update is in progress. Try again in a moment.");
  try { return deleteOutreachCampaignUnderLock_(p); }
  finally { lock.releaseLock(); }
}

/** The delete itself. The caller must hold the script lock (the sequence migration deletes inside its own lock). */
function deleteOutreachCampaignUnderLock_(p) {
  {
    const sheets = outreachCampaignSheets_();
    const campaign = outreachCampaignRow_(sheets.campaigns, p.campaign_id);
    if (!campaign) throw new Error("Campaign not found.");
    const ch = campaign.headers;
    if (String(campaign.values[ch.status] || "") === CAMPAIGN_DELETED_STATUS) return { message:"This campaign was already deleted.", already_deleted:true };
    const recipients = campaignRecipientRows_(sheets.recipients, p.campaign_id);
    const campaignTokens = new Set(recipients.map(item => String(item.values[item.headers.idempotency_token] || "")).filter(Boolean));
    const acceptedTokens = new Set(outreachActivityRows_().filter(row => {
      const token = String(row.idempotency_token || "");
      const result = String(row.result || "").toUpperCase();
      return token && campaignTokens.has(token) && result.includes("SENT") && !result.includes("TEST");
    }).map(row => String(row.idempotency_token)));
    const blocker = campaignDeleteBlocker_(campaign, recipients, acceptedTokens);
    if (blocker) throw new Error(blocker);
    const actor = authenticatedActor_(p, "Sturgeon Distribution Hub");
    const previousStatus = String(campaign.values[ch.status] || "");
    const note = `Deleted by ${actor} at ${campaignScheduleTimeLabel_(new Date())}; no email was sent.`;
    // Write each run of consecutive rows once instead of one sheet write per recipient.
    recipients.forEach(item => {
      const rh = item.headers;
      item.values[rh.status] = CAMPAIGN_DELETED_STATUS;
      item.values[rh.result_detail] = note;
      item.values[rh.app_version] = APP_VERSION;
    });
    const sorted = recipients.slice().sort((a, b) => a.row - b.row);
    for (let start = 0; start < sorted.length;) {
      let end = start;
      while (end + 1 < sorted.length && sorted[end + 1].row === sorted[end].row + 1) end += 1;
      const run = sorted.slice(start, end + 1);
      sheets.recipients.getRange(run[0].row, 1, run.length, run[0].values.length).setValues(run.map(item => item.values));
      start = end + 1;
    }
    campaign.values[ch.status] = CAMPAIGN_DELETED_STATUS;
    if (ch.approval_token !== undefined) campaign.values[ch.approval_token] = "";
    if (ch.schedule_status !== undefined && String(campaign.values[ch.schedule_status] || "")) clearCampaignSchedule_(campaign, "Cancelled", "Cancelled because the campaign was deleted.");
    campaign.values[ch.app_version] = APP_VERSION;
    sheets.campaigns.getRange(campaign.row, 1, 1, campaign.values.length).setValues([campaign.values]);
    const releasedMembers = releaseSequenceAfterDelete_(sheets.campaigns, ch, String(ch.sequence_id === undefined ? "" : campaign.values[ch.sequence_id] || "").trim());
    appendAudit_("DELETE_OUTREACH_CAMPAIGN", "Campaign", p.campaign_id, "", actor, OUTREACH_CAMPAIGNS_SHEET_NAME, OUTREACH_CAMPAIGN_RECIPIENTS_SHEET_NAME, CAMPAIGN_DELETED_STATUS, `Was ${previousStatus}; ${recipients.length} unsent recipients retired. ${String(campaign.values[ch.campaign_name] || "")}`.slice(0, 500));
    return { message:`Campaign deleted. ${recipients.length} unsent recipients were removed from it; no email was sent.${releasedMembers ? ` ${releasedMembers} businesses are back on their normal follow-up reminders.` : ""}`, recipient_count:recipients.length };
  }
}

/**
 * After a campaign is deleted: if no other live campaign carries its Sequence ID (typically an unsent Initial
 * draft), the sequence has nothing left, so the Directory rows holding that ID are cleared at once. Otherwise they
 * would get no reminder of any kind until the next daily sync. Returns how many rows were cleared.
 */
function releaseSequenceAfterDelete_(campaignSheet, ch, sequenceId) {
  if (!sequenceId || ch.sequence_id === undefined || campaignSheet.getLastRow() < 2) return 0;
  const count = campaignSheet.getLastRow() - 1;
  const ids = campaignSheet.getRange(2, ch.sequence_id + 1, count, 1).getValues();
  const statuses = campaignSheet.getRange(2, ch.status + 1, count, 1).getValues();
  if (ids.some((cell, i) => String(cell[0] || "").trim() === sequenceId && String(statuses[i][0] || "") !== CAMPAIGN_DELETED_STATUS)) return 0;
  const directory = getOutreachSheet_(OUTREACH_SHEET_NAME);
  const dh = getHeaderMap_(directory);
  if (dh.sequence_id === undefined || directory.getLastRow() < 2) return 0;
  const range = directory.getRange(2, dh.sequence_id + 1, directory.getLastRow() - 1, 1);
  const values = range.getValues();
  let cleared = 0;
  values.forEach(cell => { if (String(cell[0] || "").trim() === sequenceId) { cell[0] = ""; cleared += 1; } });
  if (cleared) range.setValues(values);
  return cleared;
}

