/**
 * Sturgeon Spirits Distribution Outreach
 *
 * VERSION: 2026.10.10.29-APP
 *
 * CHANGES IN THIS VERSION
 * - The reply checker reads the Inbox and every folder inside it (for example Inbox/Sales, where a Zoho filter files
 *   sales@ mail), not only the Inbox itself. Each folder is paged back to the checkpoint (up to 2,000 messages per
 *   folder) and the oldest 200 across all of them are returned. After deploying, delete the INBOUND_REPLY_SINCE_MS
 *   Script Property in the Inventory API project once, so the Hub re-reads the last 14 days.
 *
 * CHANGES IN 2026.10.09.28-APP
 * - Adds two Hub-only, read-only actions for the Hub's reply checker. listInboxMessages returns the oldest 200 Inbox
 *   messages received since a given time (scanning up to 1,000) with sender, recipients, subject and Zoho's summary,
 *   and more_available when there are more.
 *   getInboxMessage returns one message's plain text (first 20,000 characters) and whether its headers declare it
 *   automatic (Auto-Submitted, X-Autoreply, auto-reply precedence) or bulk (List-Id, List-Unsubscribe, bulk/list
 *   precedence), and header_error when the headers could not be read. Neither sends, moves, marks read or deletes mail.
 * - Reading the Inbox needs two more Zoho scopes. Run "1. Connect Zoho" once with a grant code generated for
 *   ZohoMail.accounts.READ,ZohoMail.messages.CREATE,ZohoMail.messages.READ,ZohoMail.folders.READ. Sending keeps
 *   working with the old token until then; only the reply checker reports the missing scope.
 * - "1. Connect Zoho" now asks for the grant code first, then offers to reuse the saved Client ID and Secret, so the
 *   code that was just copied is pasted before anything else is copied.
 *
 * CHANGES IN 2026.10.08.27-APP
 * - Do Not Email typed as text ("TRUE", "Yes", "1") is now also honoured by the menu paths: refreshFollowupStatuses
 *   no longer schedules follow-ups for such a row, and assertPilotLeadEligible_ refuses it.
 *
 * CHANGES IN 2026.10.08.26-APP
 * - Adds the Hub-only sendCustomerEmail action for the "Order online invite" to current customers. It validates the
 *   Directory row by row number, business and email; refuses Do Not Email, an opt-out status or outcome, and an address
 *   that already received the invite; preserves lock/idempotency/Zoho recovery; and writes one Activity Log row with the
 *   Order online invite stage. It does not change the row's outreach stage.
 * - Do Not Email typed as text ("TRUE", "Yes", "1") now blocks sales and customer sends too, not only a ticked checkbox.
 *
 * CHANGES IN 2026.10.04.25-APP
 * - Adds the Hub-only sendNewsletterEmail action for Cocktail list campaigns. It validates a subscribed Newsletter
 *   Contacts record by contact ID and email, preserves lock/idempotency/Zoho recovery, and writes one Activity Log row
 *   with its true Cocktail list stage and saved subject without changing Directory outreach state.
 *
 * CHANGES IN 2026.10.03.15-APP
 * - Allows a recurring Nurture check-in only when the prior check-in is more than 60 days old; all other stages retain permanent duplicate-send protection.
 * - Keeps message-stage identity, recipient validation, and every non-nurture delivery guard unchanged.
 *
 * CHANGES IN 2026.09.24.13-APP
 * - Uses Reactivation-specific online-ordering wording for the wholesale application link in every renderer.
 * - Marks tracking links in Karl-only test messages so test clicks redirect without being recorded as prospect engagement.
 * - Includes the wholesale application link in every outreach stage while retaining tracked-link fallback behavior.
 * - Added opt-in signed sell-sheet and wholesale-application links for click measurement; direct links remain unchanged until tracking is configured.
 * - Allowed Karl-only app tests to render saved drafts before a prospect email is available or verified.
 * - Kept source-row identity checks and every real-recipient safety check unchanged.
 *
 * EARLIER APP CHANGES
 * - Added a secret-authenticated web endpoint for one-at-a-time sends from the Hub.
 * - Kept Zoho credentials exclusively in this Distribution Outreach project.
 * - Added server-side locking, idempotency receipts and duplicate-send checks.
 * - Records Zoho acceptance and partial failures in Activity Log without false sent states.
 * - Disabled legacy Pilot Review sending and retained the tab as a read-only audit archive.
 * - Preserved Karl-only test sends and kept bulk or queued delivery disabled.
 *
 * EARLIER PILOT CHANGES
 * - Added permanent Account IDs so sorting rows cannot detach drafts or activity.
 * - Added verified account, business and email context to customer-application links.
 * - Reads saved email drafts by Account ID first and keeps the row-key fallback.
 * - Records Account ID in Activity Log while preserving its existing columns.
 * - Added a configurable wholesale customer-application link to initial emails.
 * - Placed the application link with the standard footer and sell-sheet link.
 * - Suppressed the link until Customer application URL is a public HTTPS URL.
 * - Kept follow-up and reactivation messages unchanged.
 * - Standardized the script, menu and package name as Distribution Outreach.
 * - Retained Zoho only as the configured email delivery service.
 * - Corrected the expected visible sender to sales@sturgeonspirits.com.
 * - Kept karl@sturgeonspirits.com as the authenticated staging mailbox.
 * - Uses saved app drafts from the Outreach Drafts tab when present.
 * - Keeps the sell sheet, signature, logo and compliance footer standardized.
 * - Leaves template-based messages unchanged when no custom draft exists.
 * - Fixed pilot lead updates to use the existing validated Sent status.
 * - Preserved the post-send do-not-resend recovery guard.
 * - Added individually approved real-email pilot sending from Pilot Review.
 * - Added a hard three-email pilot cap, duplicate prevention and final confirmation.
 * - Added pilot send results to the lead row, Pilot Review and Activity Log.
 * - Kept queued and bulk sending disabled.
 * - Added a blank line between the email closing and sender name.
 * - Added an editable sender-title field to every email footer.
 * - Retained the editable sender title; Karl's configured title is Founder and Distiller.
 * - Kept the footer logo-only, with no separate text website link.
 * - Retained the renamed Distribution Directory and Leads sheet.
 * - Retained the staging workbook lock and Karl-only test delivery.
 *
 * PASTE INSTRUCTIONS
 * - This is the complete Code.gs source, not a partial snippet.
 * - Replace Code.gs only in the STAGING Distribution Directory workbook.
 * - Keep Zoho credentials in Script Properties; never paste them into this file.
 *
 * Bound to: STAGING - Distribution Directory and Leads - 2026-09-15
 * Sends through the authenticated Zoho Mail API account.
 */

const OUTREACH_VERSION = '2026.10.10.29-APP';
const NURTURE_CHECK_IN_DUPLICATE_COOLDOWN_DAYS = 60;

const OUTREACH = Object.freeze({
  ENVIRONMENT: 'STAGING_PILOT',
  EXPECTED_SPREADSHEET_ID: '1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo',
  AUTHENTICATED_MAILBOX: 'karl@sturgeonspirits.com',
  EXPECTED_SENDER_ALIAS: 'sales@sturgeonspirits.com',
  EXPECTED_TEST_RECIPIENT: 'karl@sturgeonspirits.com',
  ALLOW_LIVE_SENDS: false,
  ALLOW_PILOT_SENDS: true,
  LEADS_SHEET: 'Distribution Directory and Leads',
  PILOT_SHEET: 'Pilot Review',
  SETTINGS_SHEET: 'Campaign Settings',
  LOG_SHEET: 'Activity Log',
  NEWSLETTER_CONTACTS_SHEET: 'Newsletter Contacts',
  COCKTAIL_LIST_STAGE: 'Cocktail list',
  PAYMENT_REMINDER_LOG_SHEET: 'Payment Reminder Log',
  DRAFTS_SHEET: 'Outreach Drafts',
  FIRST_DATA_ROW: 2,
  COL: Object.freeze({
    BUSINESS: 1,
    CONTACT: 2,
    EMAIL: 3,
    QUEUE: 8,
    STAGE: 9,
    STATUS: 10,
    PRIORITY: 11,
    LAST_EMAILED: 12,
    FOLLOWUP_DUE: 13,
    OUTCOME: 14,
    MESSAGE_ID: 15,
    NOTES: 16,
    DO_NOT_EMAIL: 17,
    SEGMENT: 24,
    WAVE: 25,
    TOP_50: 26,
    EMAIL_CONFIDENCE: 29,
    RELATIONSHIP: 30,
    LAST_ORDER: 31,
    ORDER_COUNT: 32,
    LIFETIME_INVOICED: 33,
    CUSTOMER_SOURCE: 34,
    ACCOUNT_ID: 35,
    LAST_DATA_COLUMN: 35
  }),
  PILOT_COL: Object.freeze({
    SOURCE_ROW: 1,
    BUSINESS: 2,
    EMAIL: 4,
    APPROVAL: 12,
    APPROVED_BY: 13,
    SEND_STATUS: 14,
    SENT_AT: 15,
    MESSAGE_ID: 16,
    NOTES: 17,
    LAST_DATA_COLUMN: 17
  })
});

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Distribution Outreach PILOT')
    .addItem('Verify pilot configuration', 'showPilotConfiguration')
    .addSeparator()
    .addItem('1. Connect Zoho', 'connectZoho')
    .addItem('2. Test Zoho connection', 'testZohoConnection')
    .addSeparator()
    .addItem('Send Karl-only test for active lead', 'sendTestForActiveRow')
    .addSeparator()
    .addItem('App sending configuration', 'showAppSendingConfiguration')
    .addItem('Refresh follow-up statuses', 'refreshFollowupStatuses')
    .addToUi();
}

function showPilotConfiguration() {
  assertStagingEnvironment_();
  const settings = getSettings_();
  validateCampaignSettings_(settings, false);
  const mode = String(settings['Mode']).toUpperCase();
  SpreadsheetApp.getUi().alert(
    'Pilot email configuration verified',
    'Version: ' + OUTREACH_VERSION + '\n' +
      'Zoho mailbox: ' + OUTREACH.AUTHENTICATED_MAILBOX + '\n' +
      'Visible sender: ' + OUTREACH.EXPECTED_SENDER_ALIAS + '\n' +
      'Current mode: ' + mode + '\n' +
      'App sending: ' + (isAppSendingEnabled_() ? 'enabled' : 'disabled') + '\n' +
      'Pilot Review: read-only legacy archive\n' +
      'Queued/bulk sends: disabled',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function showAppSendingConfiguration() {
  assertStagingEnvironment_();
  const status = appMailerStatus_();
  SpreadsheetApp.getUi().alert(
    'Distribution Hub app sending',
    'Version: ' + OUTREACH_VERSION + '\n' +
      'Real app sends: ' + (status.can_send ? 'enabled' : 'disabled') + '\n' +
      'Karl-only test sends: ' + (status.test_send_available ? 'available' : 'unavailable') + '\n' +
      status.detail + '\n\n' +
      'Pilot Review remains a read-only legacy archive.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function enablePilotMode() {
  throw new Error('Pilot Review is a read-only legacy archive. Enable app sending through Script Properties and send one reviewed draft at a time from Sturgeon Distribution Hub.');
}

function disablePilotMode() {
  assertStagingEnvironment_();
  setSetting_('Mode', 'TEST');
  SpreadsheetApp.getUi().alert('Pilot delivery disabled. Mode is TEST.');
}

function assertStagingEnvironment_() {
  const active = SpreadsheetApp.getActive();
  if (OUTREACH.ENVIRONMENT !== 'STAGING_PILOT') {
    throw new Error('This build is not configured as STAGING_PILOT.');
  }
  if (active && active.getId() !== OUTREACH.EXPECTED_SPREADSHEET_ID) {
    throw new Error(
      'Safety stop: this pilot build may run only in spreadsheet ' +
      OUTREACH.EXPECTED_SPREADSHEET_ID + '.'
    );
  }
  return SpreadsheetApp.openById(OUTREACH.EXPECTED_SPREADSHEET_ID);
}

function doPost(e) {
  try {
    assertStagingEnvironment_();
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    assertAppServiceToken_(body.service_token);
    const action = String(body.action || '');
    if (action === 'appMailerStatus') return appJson_(Object.assign({ ok:true, version:OUTREACH_VERSION }, appMailerStatus_()));
    if (action === 'sendAppEmail') return appJson_(Object.assign({ ok:true, version:OUTREACH_VERSION }, sendAppEmailRequest_(body, false)));
    if (action === 'sendNewsletterEmail') return appJson_(Object.assign({ ok:true, version:OUTREACH_VERSION }, sendNewsletterEmailRequest_(body)));
    if (action === 'sendCustomerEmail') return appJson_(Object.assign({ ok:true, version:OUTREACH_VERSION }, sendAppEmailRequest_(body, false, validateCustomerLead_)));
    if (action === 'sendAppTestEmail') return appJson_(Object.assign({ ok:true, version:OUTREACH_VERSION }, sendAppEmailRequest_(body, true)));
    if (action === 'sendPaymentReminder') return appJson_(Object.assign({ ok:true, version:OUTREACH_VERSION }, sendPaymentReminderRequest_(body)));
    if (action === 'listInboxMessages') return appJson_(Object.assign({ ok:true, version:OUTREACH_VERSION }, listInboxMessagesRequest_(body)));
    if (action === 'getInboxMessage') return appJson_(Object.assign({ ok:true, version:OUTREACH_VERSION }, getInboxMessageRequest_(body)));
    throw new Error('Unsupported app mailer action.');
  } catch (error) {
    return appJson_({ ok:false, version:OUTREACH_VERSION, error:String(error.message || error) });
  }
}

function appJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function appScriptProperties_() {
  return PropertiesService.getScriptProperties().getProperties();
}

function assertAppServiceToken_(value) {
  const expected = String(appScriptProperties_().OUTREACH_MAILER_SHARED_SECRET || '');
  if (expected.length < 24) throw new Error('App mailer shared secret is not configured.');
  if (String(value || '') !== expected) throw new Error('Unauthorized app mailer request.');
}

function isAppSendingEnabled_() {
  return String(appScriptProperties_().OUTREACH_APP_SENDS_ENABLED || '').toLowerCase() === 'true';
}

function appMailerStatus_() {
  const properties = appScriptProperties_();
  const settings = getSettings_();
  const zohoReady = ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN'].every(function (key) { return !!properties[key]; })
    && !!settings['Zoho account ID']
    && String(settings['Sender address'] || '').toLowerCase() === OUTREACH.EXPECTED_SENDER_ALIAS;
  const testReady = zohoReady && String(settings['Test recipient'] || '').toLowerCase() === OUTREACH.EXPECTED_TEST_RECIPIENT;
  const realReady = testReady && isAppSendingEnabled_() && String(settings['Mode'] || '').toUpperCase() === 'PILOT';
  return {
    can_send:realReady,
    test_send_available:testReady,
    detail:realReady
      ? 'One-at-a-time Hub sending is configured.'
      : !zohoReady
        ? 'Zoho credentials or the sender account are not configured.'
        : !isAppSendingEnabled_()
          ? 'Set OUTREACH_APP_SENDS_ENABLED=true in this project after verification.'
          : 'Campaign Settings Mode must be PILOT for staging app sends.',
  };
}

function appReceiptKey_(token) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token || ''), Utilities.Charset.UTF_8);
  return 'APP_SEND_RECEIPT_' + bytes.map(function (value) { return (value + 256).toString(16).slice(-2); }).join('').slice(0, 40);
}

function getAppReceipt_(token) {
  const value = PropertiesService.getScriptProperties().getProperty(appReceiptKey_(token));
  if (!value) return null;
  try { return JSON.parse(value); } catch (error) { return null; }
}

function setAppReceipt_(token, receipt) {
  PropertiesService.getScriptProperties().setProperty(appReceiptKey_(token), JSON.stringify(receipt));
}

function clearAppReceipt_(token) {
  PropertiesService.getScriptProperties().deleteProperty(appReceiptKey_(token));
}

function appHeaderKey_(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function ensureAppLogHeaders_(sheet) {
  const required = ['Account ID', 'Message ID', 'Idempotency Token'];
  const headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  const keys = headers.map(appHeaderKey_);
  required.forEach(function (label) {
    const key = appHeaderKey_(label);
    if (keys.indexOf(key) >= 0) return;
    headers.push(label);
    keys.push(key);
    sheet.getRange(1, headers.length).setValue(label);
  });
  return keys;
}

function appSentHistory_() {
  const ss = assertStagingEnvironment_();
  const sheet = ss.getSheetByName(OUTREACH.LOG_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const keys = ensureAppLogHeaders_(sheet);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, keys.length).getValues().map(function (row) {
    const item = {};
    keys.forEach(function (key, index) { item[key] = row[index]; });
    return item;
  });
}

function priorAcceptedAppSend_(token) {
  const receipt = getAppReceipt_(token);
  if (receipt && receipt.accepted) return receipt;
  const row = appSentHistory_().slice().reverse().find(function (item) {
    return String(item.idempotency_token || '') === String(token || '') && String(item.result || '').toUpperCase().indexOf('SENT') >= 0;
  });
  return row ? { accepted:true, message_id:String(row.message_id || ''), sent_at:row.timestamp || new Date(), idempotent:true } : null;
}

function legacyPilotSentFor_(business, email) {
  const sheet = assertStagingEnvironment_().getSheetByName(OUTREACH.PILOT_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return false;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), OUTREACH.PILOT_COL.LAST_DATA_COLUMN)).getValues();
  return values.some(function (row) {
    const rowBusiness = String(row[OUTREACH.PILOT_COL.BUSINESS - 1] || '').trim().toLowerCase();
    const rowEmail = String(row[OUTREACH.PILOT_COL.EMAIL - 1] || '').trim().toLowerCase();
    const status = String(row[OUTREACH.PILOT_COL.SEND_STATUS - 1] || '').trim().toUpperCase();
    return rowBusiness === String(business || '').trim().toLowerCase()
      && rowEmail === String(email || '').trim().toLowerCase()
      && (status.indexOf('SENT') === 0 || !!row[OUTREACH.PILOT_COL.SENT_AT - 1] || !!row[OUTREACH.PILOT_COL.MESSAGE_ID - 1]);
  });
}

function appStageWasRecentlySent_(email, stage, cooldownDays) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Number(cooldownDays || 0));
  return appSentHistory_().some(function (item) {
    const result = String(item.result || '').toUpperCase();
    const intended = String(item.intended_recipient || item.email || '').trim().toLowerCase();
    if (result.indexOf('SENT') < 0 || result.indexOf('TEST') >= 0 || intended !== email || String(item.message_stage || item.stage || '').trim().toLowerCase() !== stage.toLowerCase()) return false;
    const sentAt = item.timestamp instanceof Date ? item.timestamp : new Date(item.timestamp);
    // A row without a valid timestamp is unsafe to repeat, so keep it blocked.
    return isNaN(sentAt.getTime()) || sentAt.getTime() >= cutoff.getTime();
  });
}

function validateAppLead_(body, testMode) {
  const sheet = assertStagingEnvironment_().getSheetByName(OUTREACH.LEADS_SHEET);
  const rowNumber = Number(body.source_row);
  if (!Number.isInteger(rowNumber) || rowNumber < OUTREACH.FIRST_DATA_ROW || rowNumber > sheet.getLastRow()) throw new Error('Source lead was not found.');
  const row = sheet.getRange(rowNumber, 1, 1, Math.max(sheet.getLastColumn(), OUTREACH.COL.LAST_DATA_COLUMN)).getValues()[0];
  const business = String(row[OUTREACH.COL.BUSINESS - 1] || '').trim();
  const email = String(row[OUTREACH.COL.EMAIL - 1] || '').trim().toLowerCase();
  const stage = String(row[OUTREACH.COL.STAGE - 1] || 'Initial').trim();
  const status = String(row[OUTREACH.COL.STATUS - 1] || '').trim().toLowerCase();
  const outcome = String(row[OUTREACH.COL.OUTCOME - 1] || '').trim().toLowerCase();
  if (business !== String(body.business || '').trim() || email !== String(body.recipient || '').trim().toLowerCase()) throw new Error('Source lead changed. Refresh the Hub before sending.');
  if (stage.toLowerCase() !== String(body.message_stage || '').trim().toLowerCase()) throw new Error('Email stage changed. Refresh the Hub before sending.');
  if (!testMode && !isValidEmail_(email)) throw new Error('Recipient email is invalid.');
  if (!testMode && (isTicked_(row[OUTREACH.COL.DO_NOT_EMAIL - 1]) || ['do not contact', 'not interested', 'unsubscribed'].indexOf(status) >= 0 || ['bad address', 'not interested', 'unsubscribed', 'do not contact'].indexOf(outcome) >= 0)) {
    throw new Error('The source lead is blocked from email.');
  }
  const duplicate = appSentHistory_().some(function (item) {
    const result = String(item.result || '').toUpperCase();
    const sent = result.indexOf('SENT') >= 0 && result.indexOf('TEST') < 0;
    const intended = String(item.intended_recipient || item.email || '').trim().toLowerCase();
    return sent && intended === email && String(item.message_stage || item.stage || '').trim().toLowerCase() === stage.toLowerCase();
  });
  const duplicateBlocked = stage === 'Nurture check-in'
    ? appStageWasRecentlySent_(email, stage, NURTURE_CHECK_IN_DUPLICATE_COOLDOWN_DAYS)
    : duplicate;
  if (!testMode && (duplicateBlocked || (stage === 'Initial' && (row[OUTREACH.COL.LAST_EMAILED - 1] || legacyPilotSentFor_(business, email))))) {
    throw new Error('This email stage has already been sent to the recipient.');
  }
  return { sheet:sheet, row:row, rowNumber:rowNumber, business:business, email:email, stage:stage };
}

// A checkbox, or "TRUE" / "Yes" / "1" typed in the cell, counts as ticked (the Hub reads it the same way).
function isTicked_(value) {
  return value === true || /^(true|yes|y|1)$/i.test(String(value === null || value === undefined ? '' : value).trim());
}

// Order-online invite to a current customer. The Hub chooses the audience; this check is the
// independent last gate before Zoho, so it repeats the opt-out and once-per-address rules.
const CUSTOMER_INVITE_STAGE = 'Order online invite';

function validateCustomerLead_(body, testMode) {
  if (String(body.message_stage || '').trim() !== CUSTOMER_INVITE_STAGE) throw new Error('Customer messages must use the Order online invite stage.');
  const sheet = assertStagingEnvironment_().getSheetByName(OUTREACH.LEADS_SHEET);
  const rowNumber = Number(body.source_row);
  if (!Number.isInteger(rowNumber) || rowNumber < OUTREACH.FIRST_DATA_ROW || rowNumber > sheet.getLastRow()) throw new Error('Customer row was not found.');
  const row = sheet.getRange(rowNumber, 1, 1, Math.max(sheet.getLastColumn(), OUTREACH.COL.LAST_DATA_COLUMN)).getValues()[0];
  const business = String(row[OUTREACH.COL.BUSINESS - 1] || '').trim();
  const email = String(row[OUTREACH.COL.EMAIL - 1] || '').trim().toLowerCase();
  const status = String(row[OUTREACH.COL.STATUS - 1] || '').trim().toLowerCase();
  const outcome = String(row[OUTREACH.COL.OUTCOME - 1] || '').trim().toLowerCase();
  if (business !== String(body.business || '').trim() || email !== String(body.recipient || '').trim().toLowerCase()) throw new Error('Customer row changed. Refresh the Hub before sending.');
  if (!testMode && !isValidEmail_(email)) throw new Error('Recipient email is invalid.');
  if (!testMode && (isTicked_(row[OUTREACH.COL.DO_NOT_EMAIL - 1]) || ['do not contact', 'not interested', 'unsubscribed', 'bad address'].indexOf(status) >= 0 || ['bad address', 'not interested', 'unsubscribed', 'do not contact'].indexOf(outcome) >= 0)) {
    throw new Error('The customer is blocked from email.');
  }
  const alreadySent = appSentHistory_().some(function (item) {
    const result = String(item.result || '').toUpperCase();
    const intended = String(item.intended_recipient || item.email || '').trim().toLowerCase();
    return result.indexOf('SENT') >= 0 && result.indexOf('TEST') < 0 && intended === email && String(item.message_stage || item.stage || '').trim() === CUSTOMER_INVITE_STAGE;
  });
  if (!testMode && alreadySent) throw new Error('The order-online invite was already sent to this address.');
  return { sheet:sheet, row:row, rowNumber:rowNumber, business:business, email:email, stage:CUSTOMER_INVITE_STAGE };
}

function validateNewsletterContact_(body, testMode) {
  const contactId = String(body.newsletter_contact_id || '').trim();
  const expectedEmail = String(body.recipient || '').trim().toLowerCase();
  if (!contactId || !expectedEmail) throw new Error('Newsletter contact was not found.');
  if (String(body.message_stage || '').trim() !== OUTREACH.COCKTAIL_LIST_STAGE) throw new Error('Newsletter messages must use the Cocktail list stage.');
  const sheet = assertStagingEnvironment_().getSheetByName(OUTREACH.NEWSLETTER_CONTACTS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) throw new Error('Newsletter Contacts sheet is missing.');
  const keys = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(appHeaderKey_);
  const contactIndex = keys.indexOf('contact_id');
  const emailIndex = keys.indexOf('email');
  const statusIndex = keys.indexOf('status');
  const accountIndex = keys.indexOf('account_id');
  const nameIndex = keys.indexOf('name');
  const organizationIndex = keys.indexOf('organization');
  const sourceBusinessIndex = keys.indexOf('source_business');
  if (contactIndex < 0 || emailIndex < 0 || statusIndex < 0) throw new Error('Newsletter Contacts is missing Contact ID, Email, or Status.');
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const rowIndex = rows.findIndex(function (row) { return String(row[contactIndex] || '').trim() === contactId; });
  if (rowIndex < 0) throw new Error('Newsletter contact was not found.');
  const row = rows[rowIndex];
  const email = String(row[emailIndex] || '').trim().toLowerCase();
  const status = String(row[statusIndex] || '').trim();
  if (email !== expectedEmail) throw new Error('Newsletter contact changed. Refresh the Hub before sending.');
  if (!testMode && !isValidEmail_(email)) throw new Error('Recipient email is invalid.');
  if (!testMode && status !== 'Subscribed') throw new Error('Newsletter contact is not subscribed.');
  const business = String((organizationIndex >= 0 && row[organizationIndex]) || (sourceBusinessIndex >= 0 && row[sourceBusinessIndex]) || (nameIndex >= 0 && row[nameIndex]) || email).trim();
  return { sheet:sheet, row:row, rowNumber:rowIndex + 2, business:business, email:email, stage:OUTREACH.COCKTAIL_LIST_STAGE, account_id:accountIndex >= 0 ? String(row[accountIndex] || '').trim() : '' };
}

function appendAppLog_(lead, body, deliveredTo, result, messageId, errorDetail) {
  const sheet = assertStagingEnvironment_().getSheetByName(OUTREACH.LOG_SHEET);
  if (!sheet) throw new Error('Activity Log sheet is missing.');
  const keys = ensureAppLogHeaders_(sheet);
  const values = Array(keys.length).fill('');
  const set = function (names, value) {
    const index = names.map(appHeaderKey_).map(function (name) { return keys.indexOf(name); }).find(function (item) { return item >= 0; });
    if (index >= 0) values[index] = value;
  };
  set(['timestamp'], new Date());
  set(['account_id'], String(body.account_id || lead.account_id || lead.row[OUTREACH.COL.ACCOUNT_ID - 1] || ''));
  set(['business'], lead.business);
  set(['intended_recipient', 'email'], lead.email);
  set(['message_stage', 'stage'], lead.stage);
  set(['subject'], String(body.subject || ''));
  set(['result'], result);
  set(['message_id'], messageId);
  set(['error/detail', 'error_detail', 'error'], errorDetail || '');
  set(['delivered_to'], deliveredTo);
  set(['mailer_version', 'app_version', 'version'], OUTREACH_VERSION);
  set(['idempotency_token'], String(body.idempotency_token || ''));
  sheet.appendRow(values);
}

function sendAppEmailRequest_(body, testMode, validateLead) {
  validateLead = validateLead || validateAppLead_;
  const token = String(body.idempotency_token || '').trim();
  if (!/^[A-Za-z0-9_-]{20,160}$/.test(token)) throw new Error('A valid idempotency token is required.');
  const prior = priorAcceptedAppSend_(token);
  if (prior) return Object.assign({}, prior, { idempotent:true });
  const subject = String(body.subject || '').trim();
  const html = String(body.html || '').trim();
  if (!subject || subject.length > 200) throw new Error('A valid saved subject is required.');
  if (!html || html.length > 100000) throw new Error('A valid saved message is required.');
  const status = appMailerStatus_();
  if (testMode ? !status.test_send_available : !status.can_send) throw new Error(status.detail);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Another app send is in progress. Wait a moment and try again.');
  let accepted = null;
  try {
    const replay = priorAcceptedAppSend_(token);
    if (replay) return Object.assign({}, replay, { idempotent:true });
    const lead = validateLead(body, testMode);
    const settings = getSettings_();
    const deliveredTo = testMode ? String(settings['Test recipient'] || '').trim().toLowerCase() : lead.email;
    const zoho = sendZohoEmail_(deliveredTo, subject, testMode ? markTestTrackingLinks_(html) : html, settings, testMode ? 'APP_TEST' : 'APP');
    accepted = { accepted:true, message_id:String(zoho.messageId || ''), sent_at:new Date().toISOString(), idempotent:false };
    setAppReceipt_(token, accepted);
    try {
      appendAppLog_(lead, body, deliveredTo, testMode ? 'APP TEST SENT' : 'APP SENT', accepted.message_id, 'Zoho accepted delivery.');
      clearAppReceipt_(token);
    } catch (logError) {
      accepted.partial_failure = 'Zoho accepted delivery, but Activity Log recording needs recovery: ' + String(logError.message || logError);
    }
    return accepted;
  } catch (error) {
    if (!accepted) {
      try {
        const lead = validateLead(body, true);
        appendAppLog_(lead, body, '', testMode ? 'APP TEST ERROR' : 'APP SEND ERROR', '', String(error.message || error));
      } catch (ignored) {}
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function sendNewsletterEmailRequest_(body) {
  return sendAppEmailRequest_(body, false, validateNewsletterContact_);
}

function paymentReminderHeaders_() {
  return ['Reminder ID', 'Account ID', 'Business Name', 'Recipient', 'Invoice Numbers', 'Outstanding Amount Cents', 'Subject', 'Status', 'Sent At', 'Requested By', 'Zoho Message ID', 'Idempotency Token', 'Error', 'Mailer Version'];
}

function getPaymentReminderLogSheet_() {
  const ss = assertStagingEnvironment_();
  let sheet = ss.getSheetByName(OUTREACH.PAYMENT_REMINDER_LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(OUTREACH.PAYMENT_REMINDER_LOG_SHEET);
    sheet.getRange(1, 1, 1, paymentReminderHeaders_().length).setValues([paymentReminderHeaders_()]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function paymentReminderHeaderKey_(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function paymentReminderRows_() {
  const sheet = getPaymentReminderLogSheet_();
  if (sheet.getLastRow() < 2) return [];
  const keys = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(paymentReminderHeaderKey_);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().map(function (row, index) {
    const item = { rowNumber:index + 2 };
    keys.forEach(function (key, column) { item[key] = row[column]; });
    return item;
  });
}

function priorAcceptedPaymentReminder_(token) {
  const receipt = getAppReceipt_(token);
  if (receipt && receipt.accepted && receipt.payment_reminder && receipt.logs_recorded) return receipt;
  const row = paymentReminderRows_().slice().reverse().find(function (item) {
    return String(item.idempotency_token || '') === String(token || '') && String(item.status || '').toUpperCase() === 'SENT' && String(item.zoho_message_id || '').trim();
  });
  return row ? { accepted:true, message_id:String(row.zoho_message_id), sent_at:row.sent_at || new Date(), idempotent:true, payment_reminder:true } : null;
}

function assertPaymentReminderRequest_(body) {
  const token = String(body.idempotency_token || '').trim();
  if (!/^[A-Za-z0-9_-]{20,160}$/.test(token)) throw new Error('A valid idempotency token is required.');
  const accountId = String(body.account_id || '').trim();
  const business = String(body.business || '').trim();
  const recipient = String(body.recipient || '').trim().toLowerCase();
  const subject = String(body.subject || '').trim();
  const html = String(body.html || '').trim();
  const invoices = Array.isArray(body.invoice_numbers) ? body.invoice_numbers.map(function (value) { return String(value || '').trim(); }).filter(Boolean) : [];
  const amount = Number(body.outstanding_amount_cents || 0);
  if (!accountId || accountId.length > 120) throw new Error('A valid account ID is required.');
  if (!business || business.length > 240) throw new Error('A valid business name is required.');
  if (!isValidEmail_(recipient)) throw new Error('A valid payment-reminder recipient is required.');
  if (!subject || subject.length > 200 || !html || html.length > 100000) throw new Error('A valid payment-reminder subject and message are required.');
  if (!invoices.length || invoices.length > 100 || invoices.some(function (value) { return value.length > 120; })) throw new Error('At least one valid invoice number is required.');
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('A positive outstanding amount is required.');
  return { token:token, account_id:accountId, business:business, recipient:recipient, subject:subject, html:html, invoice_numbers:invoices, outstanding_amount_cents:amount, requested_by:String(body.requested_by || '').trim().slice(0, 120) };
}

function writePaymentReminderLog_(body, accepted) {
  const sheet = getPaymentReminderLogSheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(paymentReminderHeaderKey_);
  const existing = paymentReminderRows_().find(function (item) { return String(item.idempotency_token || '') === body.token; });
  const values = existing ? sheet.getRange(existing.rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0] : Array(sheet.getLastColumn()).fill('');
  const set = function (key, value) { const index = headers.indexOf(paymentReminderHeaderKey_(key)); if (index >= 0) values[index] = value; };
  set('Reminder ID', existing ? existing.reminder_id : 'PAY-' + Utilities.getUuid().replace(/-/g, '').toUpperCase());
  set('Account ID', body.account_id); set('Business Name', body.business); set('Recipient', body.recipient);
  set('Invoice Numbers', body.invoice_numbers.join(', ')); set('Outstanding Amount Cents', body.outstanding_amount_cents);
  set('Subject', body.subject); set('Status', 'SENT'); set('Sent At', accepted.sent_at ? new Date(accepted.sent_at) : new Date());
  set('Requested By', body.requested_by); set('Zoho Message ID', accepted.message_id); set('Idempotency Token', body.token);
  set('Error', 'Zoho accepted delivery.'); set('Mailer Version', OUTREACH_VERSION);
  sheet.getRange(existing ? existing.rowNumber : sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
}

function appendPaymentReminderActivity_(body, accepted) {
  const prior = appSentHistory_().some(function (item) {
    return String(item.idempotency_token || '') === body.token && String(item.result || '').toUpperCase() === 'PAYMENT REMINDER SENT';
  });
  if (prior) return;
  const sheet = assertStagingEnvironment_().getSheetByName(OUTREACH.LOG_SHEET);
  if (!sheet) throw new Error('Activity Log sheet is missing.');
  const keys = ensureAppLogHeaders_(sheet);
  const values = Array(keys.length).fill('');
  const set = function (names, value) {
    const index = names.map(appHeaderKey_).map(function (name) { return keys.indexOf(name); }).find(function (item) { return item >= 0; });
    if (index >= 0) values[index] = value;
  };
  set(['timestamp'], accepted.sent_at ? new Date(accepted.sent_at) : new Date());
  set(['account_id'], body.account_id); set(['business'], body.business); set(['intended_recipient', 'email'], body.recipient);
  set(['message_stage', 'stage'], 'Payment reminder'); set(['subject'], body.subject); set(['result'], 'PAYMENT REMINDER SENT');
  set(['message_id'], accepted.message_id); set(['error/detail', 'error_detail', 'error'], 'Zoho accepted delivery.');
  set(['delivered_to'], body.recipient); set(['mailer_version', 'app_version', 'version'], OUTREACH_VERSION); set(['idempotency_token'], body.token);
  sheet.appendRow(values);
}

function sendPaymentReminderRequest_(body) {
  const request = assertPaymentReminderRequest_(body || {});
  const prior = priorAcceptedPaymentReminder_(request.token);
  if (prior) return Object.assign({}, prior, { idempotent:true });
  const status = appMailerStatus_();
  if (!status.can_send) throw new Error(status.detail);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Another app send is in progress. Wait a moment and try again.');
  try {
    const replay = priorAcceptedPaymentReminder_(request.token);
    if (replay) return Object.assign({}, replay, { idempotent:true });
    const pending = getAppReceipt_(request.token);
    if (pending && pending.accepted && pending.payment_reminder) {
      appendPaymentReminderActivity_(request, pending);
      writePaymentReminderLog_(request, pending);
      clearAppReceipt_(request.token);
      return Object.assign({}, pending, { idempotent:true });
    }
    const settings = getSettings_();
    const zoho = sendZohoEmail_(request.recipient, request.subject, request.html, settings, 'APP');
    const accepted = { accepted:true, message_id:String(zoho.messageId || ''), sent_at:new Date().toISOString(), idempotent:false, payment_reminder:true, logs_recorded:false };
    if (!accepted.message_id) throw new Error('Zoho did not return a message ID.');
    setAppReceipt_(request.token, accepted);
    appendPaymentReminderActivity_(request, accepted);
    writePaymentReminderLog_(request, accepted);
    clearAppReceipt_(request.token);
    return accepted;
  } finally {
    lock.releaseLock();
  }
}

// ---------- Inbox reading for the Hub's reply checker (2026.10.09.28-APP) ----------
// Read-only: lists Inbox messages received after since_ms. The Hub matches them to businesses,
// classifies them and decides what to do; this project only talks to Zoho.
const INBOX_PAGE_SIZE = 200;
const INBOX_MAX_MESSAGES = 200;
const INBOX_MAX_SCANNED = 2000;
const INBOX_TEXT_LIMIT = 20000;

function zohoGet_(path, settings) {
  const response = UrlFetchApp.fetch(String(settings['Zoho Mail API URL'] || '').replace(/\/+$/, '') + path, {
    method: 'get',
    headers: { Authorization: 'Zoho-oauthtoken ' + getAccessToken_() },
    muteHttpExceptions: true
  });
  const json = parseJson_(response.getContentText());
  const httpCode = response.getResponseCode();
  const zohoCode = json && json.status && Number(json.status.code);
  if (httpCode < 200 || httpCode >= 300 || (zohoCode && zohoCode >= 400)) {
    const detail = safeError_(json, response);
    if (/scope|permission|unauthori[sz]ed|INVALID_OAUTHSCOPE/i.test(detail) || httpCode === 401 || httpCode === 403) {
      throw new Error('Zoho refused to read the Inbox (' + detail + '). Run Distribution Outreach PILOT > 1. Connect Zoho with a grant code that includes ZohoMail.messages.READ and ZohoMail.folders.READ.');
    }
    throw new Error('Zoho Inbox read failed: ' + detail);
  }
  return json;
}

/** The Inbox and every folder nested inside it (Zoho filters often file sales@ mail into Inbox/Sales). */
function inboxFolders_(settings, accountId) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('ZOHO_INBOX_FOLDERS');
  if (cached) { try { return JSON.parse(cached); } catch (error) { /* read again below */ } }
  const json = zohoGet_('/accounts/' + encodeURIComponent(accountId) + '/folders', settings);
  const folders = Array.isArray(json.data) ? json.data : [];
  const inbox = folders.find(function (folder) { return String(folder.folderType || '').toLowerCase() === 'inbox'; })
    || folders.find(function (folder) { return String(folder.folderName || '').toLowerCase() === 'inbox'; });
  if (!inbox || !inbox.folderId) throw new Error('The Zoho Inbox folder was not found.');
  const inboxPath = String(inbox.path || ('/' + (inbox.folderName || 'Inbox'))).replace(/\/+$/, '');
  const ids = [String(inbox.folderId)];
  // Children by path ("/Inbox/Sales") or by parent ID, repeated so grandchildren are included too.
  let added = true;
  while (added) {
    added = false;
    folders.forEach(function (folder) {
      const id = String(folder.folderId || '');
      if (!id || ids.indexOf(id) >= 0) return;
      const path = String(folder.path || '');
      const parent = String(folder.parentFolderId || '');
      if ((path && path.indexOf(inboxPath + '/') === 0) || (parent && ids.indexOf(parent) >= 0)) { ids.push(id); added = true; }
    });
  }
  const result = ids.map(function (id) {
    const folder = folders.find(function (item) { return String(item.folderId) === id; }) || {};
    return { id:id, name:String(folder.path || folder.folderName || id) };
  });
  cache.put('ZOHO_INBOX_FOLDERS', JSON.stringify(result), 21600);
  return result;
}

function decodeHtmlEntities_(value) {
  return String(value || '')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ').replace(/&#(\d+);/g, function (match, code) { return String.fromCharCode(Number(code)); })
    .replace(/&amp;/gi, '&');
}

function htmlToText_(html) {
  return decodeHtmlEntities_(String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function emailAddressesIn_(value) {
  const matches = decodeHtmlEntities_(value).toLowerCase().match(/[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [];
  return matches.filter(function (item, index) { return matches.indexOf(item) === index; });
}

function automaticMessageFlags_(headerText) {
  const headers = String(headerText || '');
  const autoSubmitted = /^auto-submitted:\s*(?!no\b)\S+/im.test(headers);
  const autoReply = /^x-autoreply:/im.test(headers) || /^x-autorespond:/im.test(headers) || /^precedence:\s*auto_reply/im.test(headers);
  // Mailing lists and newsletters (a business's own blast) are not replies to us.
  const bulk = /^list-id:/im.test(headers) || /^list-unsubscribe:/im.test(headers) || /^precedence:\s*(bulk|list|junk)/im.test(headers);
  const inReplyTo = (headers.match(/^in-reply-to:\s*(.+)$/im) || [])[1] || '';
  return { automatic:autoSubmitted || autoReply, bulk:bulk, in_reply_to:String(inReplyTo).trim().slice(0, 500) };
}

function listInboxMessagesRequest_(body) {
  const settings = getSettings_();
  const accountId = String(settings['Zoho account ID'] || '').trim();
  if (!accountId) throw new Error('Zoho account ID is not set. Run Distribution Outreach PILOT > 2. Test Zoho connection.');
  const sinceMs = Math.max(0, Number(body.since_ms) || 0);
  const folders = inboxFolders_(settings, accountId);
  // Pages each folder newest-first back to since_ms (up to 2,000 messages per folder), then returns the
  // OLDEST 200 across all folders. The Hub processes them oldest first and checkpoints each one, so the
  // next call continues where it stopped. A message received in the same millisecond as the checkpoint
  // is included again; the Hub de-duplicates by message ID.
  const newer = [];
  let allReachedOlder = true;
  folders.forEach(function (folder) {
    let reachedOlder = false;
    let scanned = 0;
    for (let start = 1; !reachedOlder && scanned < INBOX_MAX_SCANNED; start += INBOX_PAGE_SIZE) {
      const page = zohoGet_('/accounts/' + encodeURIComponent(accountId) + '/messages/view?folderId=' + encodeURIComponent(folder.id) + '&start=' + start + '&limit=' + INBOX_PAGE_SIZE + '&sortBy=date&sortorder=false&includeto=true', settings);
      const rows = Array.isArray(page.data) ? page.data : [];
      scanned += rows.length;
      rows.forEach(function (row) {
        const receivedMs = Number(row.receivedTime || row.sentDateInGMT || 0);
        if (receivedMs && receivedMs < sinceMs) { reachedOlder = true; return; }
        if (!row.folderId) row.folderId = folder.id;
        newer.push(row);
      });
      if (rows.length < INBOX_PAGE_SIZE) { reachedOlder = true; break; }
    }
    if (!reachedOlder) allReachedOlder = false;
  });
  newer.sort(function (a, b) { return Number(a.receivedTime || a.sentDateInGMT || 0) - Number(b.receivedTime || b.sentDateInGMT || 0); });
  const listed = newer.slice(0, INBOX_MAX_MESSAGES);
  const moreAvailable = newer.length > INBOX_MAX_MESSAGES || !allReachedOlder;
  const messages = listed.map(function (row) {
    const fromText = decodeHtmlEntities_(row.fromAddress || '');
    return {
      message_id:String(row.messageId || ''),
      folder_id:String(row.folderId || ''),
      thread_id:String(row.threadId || ''),
      received_ms:Number(row.receivedTime || row.sentDateInGMT || 0),
      from_address:(emailAddressesIn_(fromText)[0] || emailAddressesIn_(row.sender || '')[0] || ''),
      from_name:decodeHtmlEntities_(row.sender || '').replace(/<[^>]*>/g, '').trim().slice(0, 200),
      to_addresses:emailAddressesIn_(String(row.toAddress || '') + ' ' + String(row.ccAddress || '')),
      subject:decodeHtmlEntities_(row.subject || '').slice(0, 500),
      summary:decodeHtmlEntities_(row.summary || '').slice(0, 1000),
    };
  });
  return { messages:messages, folders:folders.map(function (folder) { return folder.name; }), more_available:moreAvailable };
}

function getInboxMessageRequest_(body) {
  const settings = getSettings_();
  const accountId = String(settings['Zoho account ID'] || '').trim();
  const messageId = String(body.message_id || '').trim();
  const folderId = String(body.folder_id || '').trim();
  if (!accountId || !/^\d+$/.test(messageId) || !/^\d+$/.test(folderId)) throw new Error('A Zoho message and folder ID are required.');
  const path = '/accounts/' + encodeURIComponent(accountId) + '/folders/' + encodeURIComponent(folderId) + '/messages/' + encodeURIComponent(messageId);
  const text = htmlToText_(findValueByKey_(zohoGet_(path + '/content', settings), ['content']) || '');
  let flags = { automatic:false, bulk:false, in_reply_to:'' };
  let headerError = false;
  try { flags = automaticMessageFlags_(findValueByKey_(zohoGet_(path + '/header', settings), ['headerContent']) || ''); }
  catch (error) { headerError = true; /* The Hub then does not pause follow-ups: it might be an automatic reply. */ }
  return {
    message_id:messageId,
    text:text.slice(0, INBOX_TEXT_LIMIT),
    text_truncated:text.length > INBOX_TEXT_LIMIT,
    automatic:!!flags.automatic,
    bulk:!!flags.bulk,
    header_error:headerError,
    in_reply_to:flags.in_reply_to,
  };
}

function connectZoho() {
  assertStagingEnvironment_();
  const ui = SpreadsheetApp.getUi();
  // The grant code is asked for first: it is what was just copied, and it expires within minutes.
  const grantCode = promptRequired_(ui, 'Zoho connection', 'Paste the short-lived authorization code generated with scopes ZohoMail.accounts.READ,ZohoMail.messages.CREATE,ZohoMail.messages.READ,ZohoMail.folders.READ');
  if (grantCode === null) return;
  // Reuse the saved Client ID and Secret when they exist, so nothing else has to be copied.
  const saved = PropertiesService.getScriptProperties().getProperties();
  let clientId = '';
  let clientSecret = '';
  if (saved.ZOHO_CLIENT_ID && saved.ZOHO_CLIENT_SECRET) {
    const reuse = ui.alert('Zoho connection', 'Use the Client ID and Client Secret already saved in this project?\n\nChoose No only if the code was generated in a different Zoho Self Client.', ui.ButtonSet.YES_NO_CANCEL);
    if (reuse === ui.Button.CANCEL || reuse === ui.Button.CLOSE) return;
    if (reuse === ui.Button.YES) { clientId = saved.ZOHO_CLIENT_ID; clientSecret = saved.ZOHO_CLIENT_SECRET; }
  }
  if (!clientId) {
    clientId = promptRequired_(ui, 'Zoho connection', 'Paste the Client ID from the same Zoho Self Client.');
    if (clientId === null) return;
    clientSecret = promptRequired_(ui, 'Zoho connection', 'Paste the Client Secret. It will be stored in Apps Script properties, not in the spreadsheet.');
    if (clientSecret === null) return;
  }

  const settings = getSettings_();
  const response = UrlFetchApp.fetch(settings['Zoho accounts URL'] + '/oauth/v2/token', {
    method: 'post',
    payload: {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code: grantCode
    },
    muteHttpExceptions: true
  });
  const json = parseJson_(response.getContentText());
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !json.refresh_token) {
    setSetting_('Last error', 'Zoho authorization failed: ' + safeError_(json, response));
    throw new Error('Zoho authorization failed. Check the grant code, scopes, and Zoho data-center URLs.');
  }

  PropertiesService.getScriptProperties().setProperties({
    ZOHO_CLIENT_ID: clientId,
    ZOHO_CLIENT_SECRET: clientSecret,
    ZOHO_REFRESH_TOKEN: json.refresh_token
  });
  CacheService.getScriptCache().put('ZOHO_ACCESS_TOKEN', json.access_token || '', 3300);
  setSetting_('Last error', '');
  testZohoConnection();
}

function testZohoConnection() {
  assertStagingEnvironment_();
  const settings = getSettings_();
  const token = getAccessToken_();
  const response = UrlFetchApp.fetch(settings['Zoho Mail API URL'] + '/accounts', {
    method: 'get',
    headers: { Authorization: 'Zoho-oauthtoken ' + token },
    muteHttpExceptions: true
  });
  const json = parseJson_(response.getContentText());
  assertZohoSuccess_(response, json, 'Could not read Zoho Mail accounts');

  const sender = String(settings['Sender address'] || '').toLowerCase();
  const mailbox = OUTREACH.AUTHENTICATED_MAILBOX.toLowerCase();
  const accounts = Array.isArray(json.data) ? json.data : [];
  const account = accounts.find(function (candidate) {
    return accountAddresses_(candidate).indexOf(mailbox) !== -1;
  });
  if (!account || !account.accountId) {
    throw new Error('The authenticated Zoho account does not include ' + mailbox + ' as a mailbox.');
  }
  if (accountAddresses_(account).indexOf(sender) === -1) {
    throw new Error('The Zoho account for ' + mailbox + ' cannot send from alias ' + sender + '.');
  }

  setSetting_('Zoho account ID', String(account.accountId));
  setSetting_('Last connection check', new Date());
  setSetting_('Last error', '');
  SpreadsheetApp.getUi().alert('Zoho connection verified for ' + sender + '.');
}

function sendTestForActiveRow() {
  assertStagingEnvironment_();
  const sheet = SpreadsheetApp.getActiveSheet();
  const rowNumber = sheet.getActiveRange().getRow();
  if (sheet.getName() !== OUTREACH.LEADS_SHEET || rowNumber < OUTREACH.FIRST_DATA_ROW) {
    throw new Error('Select a prospect row on the leads sheet first.');
  }

  const settings = getSettings_();
  validateCampaignSettings_(settings, true);
  const row = sheet.getRange(rowNumber, 1, 1, OUTREACH.COL.LAST_DATA_COLUMN).getValues()[0];
  const stage = row[OUTREACH.COL.STAGE - 1] || 'Initial';
  const message = buildMessage_(stage, row, settings, rowNumber, true);
  const result = sendZohoEmail_(settings['Test recipient'], message.subject, message.html, settings, 'TEST');
  appendLog_(
    row,
    settings['Test recipient'],
    stage,
    message.subject,
    'TEST SENT',
    result.messageId,
    ''
  );
  SpreadsheetApp.getUi().alert('Test sent to ' + settings['Test recipient'] + '. The prospect row was not marked as sent.');
}

function sendApprovedPilotForActiveRow() {
  throw new Error('Pilot Review is a read-only legacy archive. Send one reviewed draft at a time from Sturgeon Distribution Hub.');
}

function sendQueuedEmails() {
  assertStagingEnvironment_();
  throw new Error('Queued and bulk sends are disabled. Send one reviewed draft at a time from Sturgeon Distribution Hub.');
}

function refreshFollowupStatuses() {
  assertStagingEnvironment_();
  const sheet = SpreadsheetApp.getActive().getSheetByName(OUTREACH.LEADS_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < OUTREACH.FIRST_DATA_ROW) return;
  const range = sheet.getRange(OUTREACH.FIRST_DATA_ROW, 1, lastRow - 1, OUTREACH.COL.LAST_DATA_COLUMN);
  const rows = range.getValues();
  const now = new Date();
  let changed = 0;

  rows.forEach(function (row) {
    const due = row[OUTREACH.COL.FOLLOWUP_DUE - 1];
    const status = String(row[OUTREACH.COL.STATUS - 1] || '');
    const stage = String(row[OUTREACH.COL.STAGE - 1] || '');
    if (due instanceof Date && due <= now && stage !== 'Complete' &&
        ['Sent', 'Follow-up sent'].indexOf(status) !== -1 &&
        !isTicked_(row[OUTREACH.COL.DO_NOT_EMAIL - 1])) {
      row[OUTREACH.COL.STATUS - 1] = 'Follow-up due';
      changed++;
    }
  });

  range.setValues(rows);
  SpreadsheetApp.getUi().alert(changed + ' prospect(s) marked Follow-up due. Nothing was sent.');
}

function assertPilotLeadEligible_(row) {
  const email = String(row[OUTREACH.COL.EMAIL - 1] || '').trim();
  const confidence = String(row[OUTREACH.COL.EMAIL_CONFIDENCE - 1] || '').trim();
  const relationship = String(row[OUTREACH.COL.RELATIONSHIP - 1] || 'Prospect').trim();
  const stage = String(row[OUTREACH.COL.STAGE - 1] || 'Initial').trim();
  const status = String(row[OUTREACH.COL.STATUS - 1] || '').trim();
  const outcome = String(row[OUTREACH.COL.OUTCOME - 1] || '').trim();
  const blockedStatus = ['Replied', 'Interested', 'Not interested', 'Bad address', 'Do not contact'].indexOf(status) !== -1;
  const blockedOutcome = ['Bad address', 'Unsubscribed'].indexOf(outcome) !== -1;

  if (!isValidEmail_(email)) throw new Error('The source lead does not have a valid email address.');
  if (['Confirmed', 'Published', 'Supplied'].indexOf(confidence) === -1) {
    throw new Error('The source lead email must be Confirmed, Published or Supplied.');
  }
  if (relationship !== 'Prospect') throw new Error('The pilot is limited to prospects.');
  if (stage !== 'Initial') throw new Error('The pilot is limited to initial outreach emails.');
  if (blockedStatus || blockedOutcome || isTicked_(row[OUTREACH.COL.DO_NOT_EMAIL - 1])) {
    throw new Error('The source lead is blocked from email.');
  }
  if (row[OUTREACH.COL.LAST_EMAILED - 1]) {
    throw new Error('The source lead already has a Last Emailed date.');
  }
}

function resolvePilotSource_(sheet, review) {
  const expectedBusiness = String(review[OUTREACH.PILOT_COL.BUSINESS - 1] || '').trim();
  const expectedEmail = String(review[OUTREACH.PILOT_COL.EMAIL - 1] || '').trim().toLowerCase();
  if (!expectedBusiness || !expectedEmail) {
    throw new Error('Pilot Review must include both a business and email address.');
  }

  const lastRow = sheet.getLastRow();
  const storedRowNumber = Number(review[OUTREACH.PILOT_COL.SOURCE_ROW - 1]);
  if (
    Number.isInteger(storedRowNumber) &&
    storedRowNumber >= OUTREACH.FIRST_DATA_ROW &&
    storedRowNumber <= lastRow
  ) {
    const stored = sheet.getRange(storedRowNumber, 1, 1, OUTREACH.COL.LAST_DATA_COLUMN).getValues()[0];
    if (
      String(stored[OUTREACH.COL.BUSINESS - 1] || '').trim() === expectedBusiness &&
      String(stored[OUTREACH.COL.EMAIL - 1] || '').trim().toLowerCase() === expectedEmail
    ) {
      return { rowNumber: storedRowNumber, values: stored };
    }
  }

  const rows = sheet.getRange(
    OUTREACH.FIRST_DATA_ROW,
    1,
    Math.max(1, lastRow - OUTREACH.FIRST_DATA_ROW + 1),
    OUTREACH.COL.LAST_DATA_COLUMN
  ).getValues();
  const matches = [];
  rows.forEach(function (row, index) {
    if (
      String(row[OUTREACH.COL.BUSINESS - 1] || '').trim() === expectedBusiness &&
      String(row[OUTREACH.COL.EMAIL - 1] || '').trim().toLowerCase() === expectedEmail
    ) {
      matches.push({ rowNumber: index + OUTREACH.FIRST_DATA_ROW, values: row });
    }
  });
  if (matches.length !== 1) {
    throw new Error('Could not uniquely match Pilot Review to its source lead. Found ' + matches.length + ' matches.');
  }
  return matches[0];
}

function getPilotHistory_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(OUTREACH.LOG_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 10).getValues()
    .filter(function (row) { return String(row[5] || '').trim().toUpperCase() === 'PILOT SENT'; })
    .map(function (row) {
      return {
        email: String(row[2] || '').trim().toLowerCase(),
        messageId: String(row[6] || '').trim(),
        version: String(row[9] || '').trim()
      };
    });
}

function draftKey_(sourceRowNumber, stage) {
  return Number(sourceRowNumber) + '::' + String(stage || 'Initial').trim().toLowerCase();
}

function accountDraftKey_(accountId, stage) {
  return String(accountId || '').trim() + '::' + String(stage || 'Initial').trim().toLowerCase();
}

function ensureLeadAccountId_(sheet, rowNumber, row) {
  const lastColumn = Math.max(sheet.getLastColumn(), OUTREACH.COL.ACCOUNT_ID);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  let index = headers.map(function (value) { return String(value || '').trim().toLowerCase(); }).indexOf('account id');
  if (index < 0) {
    index = String(headers[OUTREACH.COL.ACCOUNT_ID - 1] || '').trim() ? lastColumn : OUTREACH.COL.ACCOUNT_ID - 1;
    sheet.getRange(1, index + 1).setValue('Account ID');
  }
  while (row.length <= index) row.push('');
  let accountId = String(row[index] || '').trim();
  if (!accountId) {
    accountId = 'ACC-' + Utilities.getUuid().replace(/-/g, '').toUpperCase();
    row[index] = accountId;
    sheet.getRange(rowNumber, index + 1).setValue(accountId);
  }
  row.__accountId = accountId;
  return accountId;
}

function getSavedDraft_(accountId, sourceRowNumber, stage) {
  if (!sourceRowNumber) return null;
  const sheet = SpreadsheetApp.getActive().getSheetByName(OUTREACH.DRAFTS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  });
  const keyColumn = headers.indexOf('draft_key');
  const accountColumn = headers.indexOf('account_id');
  const subjectColumn = headers.indexOf('subject');
  const bodyColumn = headers.indexOf('body_text');
  if (keyColumn < 0 || subjectColumn < 0 || bodyColumn < 0) {
    throw new Error('Outreach Drafts is missing required columns.');
  }
  const expectedAccountKey = accountDraftKey_(accountId, stage);
  const expectedRowKey = draftKey_(sourceRowNumber, stage);
  for (let index = values.length - 1; index >= 1; index -= 1) {
    const storedKey = String(values[index][keyColumn] || '');
    const storedAccount = accountColumn >= 0 ? String(values[index][accountColumn] || '') : '';
    if (storedKey !== expectedAccountKey && storedKey !== expectedRowKey && (!accountId || storedAccount !== accountId)) continue;
    const subject = String(values[index][subjectColumn] || '').trim();
    const bodyText = String(values[index][bodyColumn] || '').trim();
    return subject && bodyText ? { subject:subject, bodyText:bodyText } : null;
  }
  return null;
}

function splitMessageTemplate_(template) {
  const source = String(template || '');
  const marker = '{{Sell Sheet Link}}';
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return { body:source, footer:'' };
  return {
    body:source.slice(0, markerIndex),
    footer:source.slice(markerIndex)
  };
}

function plainTextToHtml_(text) {
  return String(text || '').trim().split(/\n{2,}/).filter(Boolean).map(function (block) {
    return '<p>' + escapeHtml_(block).replace(/\n/g, '<br>') + '</p>';
  }).join('');
}

function buildMessage_(stage, row, settings, sourceRowNumber, testMode) {
  let keys;
  if (stage === 'Reactivation') {
    keys = ['Reactivation subject', 'Reactivation HTML'];
  } else if (stage === 'Follow-up 1') {
    keys = ['Follow-up 1 subject', 'Follow-up 1 HTML'];
  } else if (stage === 'Follow-up 2') {
    keys = ['Follow-up 2 subject', 'Follow-up 2 HTML'];
  } else {
    const segmentKey = segmentTemplateKey_(row[OUTREACH.COL.SEGMENT - 1]);
    keys = ['Segment ' + segmentKey + ' subject', 'Segment ' + segmentKey + ' HTML'];
  }
  const leadSheet = SpreadsheetApp.getActive().getSheetByName(OUTREACH.LEADS_SHEET);
  const accountId = ensureLeadAccountId_(leadSheet, sourceRowNumber, row);
  const values = templateValues_(row, settings, stage, accountId, testMode);
  const template = String(settings[keys[1]] || '');
  const parts = splitMessageTemplate_(template);
  const savedDraft = getSavedDraft_(accountId, sourceRowNumber, stage);
  if (savedDraft) {
    return {
      subject:savedDraft.subject,
      html:plainTextToHtml_(savedDraft.bodyText) + renderTemplate_(parts.footer, values, true),
      usesSavedDraft:true
    };
  }
  return {
    subject: renderTemplate_(String(settings[keys[0]] || ''), values, false),
    html: renderTemplate_(template, values, true),
    usesSavedDraft:false
  };
}

function sendZohoEmail_(recipient, subject, html, settings, deliveryMode) {
  const normalizedRecipient = String(recipient || '').trim().toLowerCase();
  const normalizedMode = String(deliveryMode || '').trim().toUpperCase();
  if (normalizedMode === 'TEST' || normalizedMode === 'APP_TEST') {
    if (normalizedRecipient !== OUTREACH.EXPECTED_TEST_RECIPIENT) {
      throw new Error('Safety stop: test email may be sent only to ' + OUTREACH.EXPECTED_TEST_RECIPIENT + '.');
    }
  } else if (normalizedMode === 'APP') {
    if (!isAppSendingEnabled_() || String(settings['Mode'] || '').trim().toUpperCase() !== 'PILOT') {
      throw new Error('Safety stop: one-at-a-time app delivery is not enabled.');
    }
  } else if (normalizedMode === 'PILOT') {
    if (
      !OUTREACH.ALLOW_PILOT_SENDS ||
      OUTREACH.ENVIRONMENT !== 'STAGING_PILOT' ||
      String(settings['Mode'] || '').trim().toUpperCase() !== 'PILOT'
    ) {
      throw new Error('Safety stop: approved pilot delivery is not enabled.');
    }
  } else {
    throw new Error('Safety stop: unsupported delivery mode.');
  }

  const token = getAccessToken_();
  const accountId = String(settings['Zoho account ID'] || '').trim();
  const response = UrlFetchApp.fetch(settings['Zoho Mail API URL'] + '/accounts/' + encodeURIComponent(accountId) + '/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Zoho-oauthtoken ' + token },
    payload: JSON.stringify({
      fromAddress: settings['Sender address'],
      toAddress: normalizedRecipient,
      subject: subject,
      content: html,
      mailFormat: 'html',
      askReceipt: 'no'
    }),
    muteHttpExceptions: true
  });
  const json = parseJson_(response.getContentText());
  assertZohoSuccess_(response, json, 'Zoho did not send the message');
  return { messageId: findValueByKey_(json, ['messageId', 'mailId', 'messageID']) || '' };
}

function getAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('ZOHO_ACCESS_TOKEN');
  if (cached) return cached;
  const properties = PropertiesService.getScriptProperties().getProperties();
  ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN'].forEach(function (key) {
    if (!properties[key]) throw new Error('Zoho is not connected. Use Distribution Outreach PILOT > 1. Connect Zoho.');
  });
  const settings = getSettings_();
  const response = UrlFetchApp.fetch(settings['Zoho accounts URL'] + '/oauth/v2/token', {
    method: 'post',
    payload: {
      client_id: properties.ZOHO_CLIENT_ID,
      client_secret: properties.ZOHO_CLIENT_SECRET,
      refresh_token: properties.ZOHO_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    },
    muteHttpExceptions: true
  });
  const json = parseJson_(response.getContentText());
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !json.access_token) {
    setSetting_('Last error', 'Token refresh failed: ' + safeError_(json, response));
    throw new Error('Zoho access-token refresh failed. Reconnect Zoho.');
  }
  cache.put('ZOHO_ACCESS_TOKEN', json.access_token, Math.min(3300, Number(json.expires_in) || 3300));
  return json.access_token;
}

function getSettings_() {
  const sheet = assertStagingEnvironment_().getSheetByName(OUTREACH.SETTINGS_SHEET);
  if (!sheet) throw new Error('Campaign Settings sheet is missing.');
  const values = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), 2).getValues();
  return values.reduce(function (map, row) {
    if (row[0]) map[String(row[0])] = row[1];
    return map;
  }, {});
}

function setSetting_(key, value) {
  const sheet = assertStagingEnvironment_().getSheetByName(OUTREACH.SETTINGS_SHEET);
  const keys = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), 1).getValues().flat();
  const index = keys.indexOf(key);
  if (index === -1) throw new Error('Missing Campaign Settings key: ' + key);
  sheet.getRange(index + 2, 2).setValue(value);
}

function validateCampaignSettings_(settings, isTest) {
  const required = [
    'Sender address', 'Zoho Mail API URL', 'Zoho accounts URL', 'Zoho account ID',
    'Physical mailing address', 'Website URL', 'Logo URL',
    'Segment A subject', 'Segment A HTML',
    'Segment B subject', 'Segment B HTML', 'Segment C subject', 'Segment C HTML',
    'Segment D subject', 'Segment D HTML', 'Follow-up 1 subject', 'Follow-up 1 HTML',
    'Follow-up 2 subject', 'Follow-up 2 HTML', 'Reactivation subject', 'Reactivation HTML'
  ];
  required.forEach(function (key) {
    if (!settings[key]) throw new Error('Campaign Settings is missing: ' + key);
  });
  if (String(settings['Sender address']).toLowerCase() !== OUTREACH.EXPECTED_SENDER_ALIAS) {
    throw new Error('Sender address must be ' + OUTREACH.EXPECTED_SENDER_ALIAS + '.');
  }
  if (!/^https?:\/\/\S+$/i.test(String(settings['Website URL'] || '').trim())) {
    throw new Error('Website URL must begin with http:// or https://.');
  }
  if (!/^https?:\/\/\S+$/i.test(String(settings['Logo URL'] || '').trim())) {
    throw new Error('Logo URL must begin with http:// or https://.');
  }
  const applicationUrl = String(settings['Customer application URL'] || '').trim();
  if (applicationUrl && !/^https:\/\/\S+$/i.test(applicationUrl)) {
    throw new Error('Customer application URL must begin with https://.');
  }
  if (
    OUTREACH.ENVIRONMENT === 'STAGING_PILOT' &&
    ['TEST', 'PILOT'].indexOf(String(settings['Mode']).toUpperCase()) === -1
  ) {
    throw new Error('Campaign Settings Mode must be TEST or PILOT for this build.');
  }
  if (isTest && !isValidEmail_(String(settings['Test recipient'] || ''))) {
    throw new Error('Enter a valid Test recipient in Campaign Settings.');
  }
  if (
    isTest &&
    String(settings['Test recipient'] || '').trim().toLowerCase() !== OUTREACH.EXPECTED_TEST_RECIPIENT
  ) {
    throw new Error('Test recipient must be ' + OUTREACH.EXPECTED_TEST_RECIPIENT + '.');
  }
}

function trackingSignature_(target, accountId, stage, secret) {
  const bytes = Utilities.computeHmacSha256Signature(target + '\n' + accountId + '\n' + stage, secret);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function trackingUrl_(target, accountId, stage, settings, extras, testMode) {
  const baseUrl = String(settings['Tracking base URL'] || '').trim();
  const secret = PropertiesService.getScriptProperties().getProperty('TRACKING_LINK_SECRET') || '';
  if (!/^https:\/\/\S+$/i.test(baseUrl) || !secret || !accountId) return '';
  const params = Object.assign({ t:target, a:accountId, s:stage, k:trackingSignature_(target, accountId, stage, secret) }, extras || {});
  if (testMode) params.x = 'test';
  return baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + Object.keys(params).map(function (key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key] || '');
  }).join('&');
}

function templateValues_(row, settings, stage, accountId, testMode) {
  const contact = String(row[OUTREACH.COL.CONTACT - 1] || '').trim();
  const firstName = contact ? contact.split(/\s+/)[0] : 'there';
  const sellSheet = String(settings['Wholesale sell-sheet URL'] || '').trim();
  const website = String(settings['Website URL'] || '').trim();
  const logo = String(settings['Logo URL'] || '').trim();
  const applicationUrl = String(settings['Customer application URL'] || '').trim();
  const business = String(row[OUTREACH.COL.BUSINESS - 1] || '');
  const email = String(row[OUTREACH.COL.EMAIL - 1] || '');
  const trackedSellSheet = trackingUrl_('sell_sheet', accountId, stage, settings, null, testMode);
  const sellSheetLink = sellSheet ? '<p><a href="' + escapeHtml_(trackedSellSheet || sellSheet) + '">View our current wholesale sell sheet</a></p>' : '';
  const applicationHref = /^https:\/\/\S+$/i.test(applicationUrl)
    ? applicationUrl + (applicationUrl.indexOf('?') >= 0 ? '&' : '?') +
      'account_id=' + encodeURIComponent(accountId || '') +
      '&business=' + encodeURIComponent(business) +
      '&email=' + encodeURIComponent(email)
    : '';
  const trackedApplication = trackingUrl_('application', accountId, stage, settings, { business:business, email:email }, testMode);
  const applicationSentence = stage === 'Reactivation'
    ? "If you'd like to set up online ordering with us, <a href=\"" + escapeHtml_(trackedApplication || applicationHref) + "\">complete our short wholesale account form</a>. It takes about five minutes."
    : 'If you would like to get the account setup started, <a href="' + escapeHtml_(trackedApplication || applicationHref) + '">complete our short wholesale customer application</a>.';
  const applicationLink = (trackedApplication || applicationHref) ? '<p>' + applicationSentence + '</p>' : '';
  return {
    'First Name': firstName,
    'Business Name': smartTitleCase_(String(row[OUTREACH.COL.BUSINESS - 1] || 'your business')),
    'City': String(row[4] || ''),
    'Segment': String(row[OUTREACH.COL.SEGMENT - 1] || ''),
    'Wave': String(row[OUTREACH.COL.WAVE - 1] || ''),
    'Relationship': String(row[OUTREACH.COL.RELATIONSHIP - 1] || 'Prospect'),
    'Last Order': formatDateValue_(row[OUTREACH.COL.LAST_ORDER - 1]),
    'Physical Address': String(settings['Physical mailing address'] || ''),
    'Website Footer': website && logo ?
      '<a href="' + escapeHtml_(website) + '"><img src="' + escapeHtml_(logo) +
      '" alt="Sturgeon Spirits" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0;margin:10px 0 6px"></a>' : '',
    'Sell Sheet Link': sellSheetLink + applicationLink
  };
}

function markTestTrackingLinks_(html) {
  return String(html || '').replace(/href=(["'])([^"']+)\1/gi, function (match, quote, href) {
    const link = String(href || '').replace(/&amp;/g, '&');
    const isTracked = /(?:[?&])t=(?:sell_sheet|application)(?:&|$)/.test(link) && /(?:[?&])k=[^&]+/.test(link);
    if (!isTracked || /(?:[?&])x=/.test(link)) return match;
    return 'href=' + quote + href + (href.indexOf('?') >= 0 ? '&amp;x=test' : '?x=test') + quote;
  });
}

function formatDateValue_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'MMMM d, yyyy');
  }
  return String(value || '');
}

function segmentTemplateKey_(segment) {
  const value = String(segment || '').trim().toUpperCase();
  if (value.indexOf('A ') === 0) return 'A';
  if (value.indexOf('B ') === 0) return 'B';
  if (value.indexOf('D1') === 0 || value.indexOf('D2') === 0) return 'D';
  return 'C';
}

function smartTitleCase_(value) {
  const text = String(value || '');
  // Preserve deliberately mixed-case business names; normalize only all-caps
  // state-record names so messages do not look machine-generated.
  if (text !== text.toUpperCase()) return text;
  return text.split(/\s+/).map(function (word) {
    if (/^(EAA|HQ|TJ'S|T&O|BP|VFW|LLC|USA)$/i.test(word)) return word.toUpperCase();
    return word.toLowerCase().replace(/(^|[-\/&])([a-z])/g, function (_, prefix, letter) {
      return prefix + letter.toUpperCase();
    });
  }).join(' ');
}

function renderTemplate_(template, values, htmlMode) {
  return template.replace(/{{\s*([^}]+?)\s*}}/g, function (_, key) {
    const value = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : '';
    const isSafeHtmlToken = key === 'Sell Sheet Link' || key === 'Website Footer';
    if (htmlMode && !isSafeHtmlToken) return escapeHtml_(value);
    return String(value);
  });
}

function appendLog_(row, deliveredTo, stage, subject, result, messageId, error) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(OUTREACH.LOG_SHEET);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (value) { return String(value || '').trim().toLowerCase().replace(/\s+/g, '_'); });
  if (headers.indexOf('account_id') < 0) {
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue('Account ID');
    headers.push('account_id');
  }
  const values = Array(headers.length).fill('');
  const set = function (keys, value) {
    const index = keys.map(function (key) { return headers.indexOf(key); }).find(function (item) { return item >= 0; });
    if (index >= 0) values[index] = value;
  };
  set(['timestamp'], new Date()); set(['business'], row[OUTREACH.COL.BUSINESS - 1]);
  set(['intended_recipient', 'email'], row[OUTREACH.COL.EMAIL - 1]); set(['message_stage', 'stage'], stage);
  set(['subject'], subject); set(['result'], result); set(['message_id'], messageId);
  set(['error/detail', 'error_detail', 'error'], error); set(['delivered_to'], deliveredTo);
  set(['mailer_version', 'app_version', 'version'], OUTREACH_VERSION); set(['account_id'], row.__accountId || row[OUTREACH.COL.ACCOUNT_ID - 1]);
  sheet.appendRow(values);
}

function accountAddresses_(account) {
  const addresses = [account.primaryEmailAddress, account.mailboxAddress, account.incomingUserName];
  (account.emailAddress || []).forEach(function (item) { addresses.push(item.mailId); });
  (account.sendMailDetails || []).forEach(function (item) { if (item.status !== false) addresses.push(item.fromAddress); });
  return addresses.filter(Boolean).map(function (value) { return String(value).toLowerCase(); });
}

function assertZohoSuccess_(response, json, prefix) {
  const httpCode = response.getResponseCode();
  const zohoCode = json && json.status && Number(json.status.code);
  if (httpCode < 200 || httpCode >= 300 || (zohoCode && zohoCode >= 400)) {
    const detail = safeError_(json, response);
    setSetting_('Last error', prefix + ': ' + detail);
    throw new Error(prefix + ': ' + detail);
  }
}

function safeError_(json, response) {
  const candidate = findValueByKey_(json, ['description', 'message', 'error']);
  return String(candidate || ('HTTP ' + response.getResponseCode())).slice(0, 500);
}

function findValueByKey_(value, keys) {
  if (!value || typeof value !== 'object') return '';
  for (let i = 0; i < keys.length; i++) {
    if (Object.prototype.hasOwnProperty.call(value, keys[i]) && value[keys[i]] != null) return value[keys[i]];
  }
  const children = Array.isArray(value) ? value : Object.keys(value).map(function (key) { return value[key]; });
  for (let i = 0; i < children.length; i++) {
    const found = findValueByKey_(children[i], keys);
    if (found !== '') return found;
  }
  return '';
}

function promptRequired_(ui, title, prompt) {
  const response = ui.prompt(title, prompt, ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return null;
  const text = response.getResponseText().trim();
  if (!text) throw new Error('A value is required.');
  return text;
}

function parseJson_(text) {
  try { return JSON.parse(text || '{}'); } catch (error) { return { error: String(text || '').slice(0, 500) }; }
}

function addDays_(date, days) {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
