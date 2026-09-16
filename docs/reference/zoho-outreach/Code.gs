/**
 * Sturgeon Spirits distribution outreach tracker
 *
 * VERSION: 2026.09.15.7-PILOT
 *
 * CHANGES IN THIS VERSION
 * - Added individually approved real-email pilot sending from Pilot Review.
 * - Added a hard three-email pilot cap, duplicate prevention and final confirmation.
 * - Added pilot send results to the lead row, Pilot Review and Activity Log.
 * - Kept queued and bulk sending disabled.
 * - Added a blank line between the email closing and sender name.
 * - Added an editable sender-title field to every email footer.
 * - Set Karl's default title to President.
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

const OUTREACH_VERSION = '2026.09.15.7-PILOT';

const OUTREACH = Object.freeze({
  ENVIRONMENT: 'STAGING_PILOT',
  EXPECTED_SPREADSHEET_ID: '1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo',
  AUTHENTICATED_MAILBOX: 'karl@sturgeonspirits.com',
  EXPECTED_SENDER_ALIAS: 'sales@sturgeonspirits.com',
  EXPECTED_TEST_RECIPIENT: 'karl@sturgeonspirits.com',
  ALLOW_LIVE_SENDS: false,
  ALLOW_PILOT_SENDS: true,
  PILOT_SEND_LIMIT: 3,
  LEADS_SHEET: 'Distribution Directory and Leads',
  PILOT_SHEET: 'Pilot Review',
  SETTINGS_SHEET: 'Campaign Settings',
  LOG_SHEET: 'Activity Log',
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
    LAST_DATA_COLUMN: 34
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
    .createMenu('Sturgeon Outreach PILOT')
    .addItem('Verify pilot configuration', 'showPilotConfiguration')
    .addSeparator()
    .addItem('1. Connect Zoho', 'connectZoho')
    .addItem('2. Test Zoho connection', 'testZohoConnection')
    .addSeparator()
    .addItem('Send Karl-only test for active lead', 'sendTestForActiveRow')
    .addSeparator()
    .addItem('Enable PILOT mode (real email)', 'enablePilotMode')
    .addItem('Send approved pilot for selected row', 'sendApprovedPilotForActiveRow')
    .addItem('Disable pilot mode', 'disablePilotMode')
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
      'Pilot limit: ' + OUTREACH.PILOT_SEND_LIMIT + ' real emails\n' +
      'Approved Pilot Review rows only\n' +
      'Queued/bulk sends: disabled',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function enablePilotMode() {
  assertStagingEnvironment_();
  validateCampaignSettings_(getSettings_(), false);
  const ui = SpreadsheetApp.getUi();
  const confirmation = ui.alert(
    'Enable real pilot email?',
    'PILOT mode permits real delivery only for individually Approved rows on Pilot Review. ' +
      'Every send still requires a separate confirmation, and the total is capped at ' +
      OUTREACH.PILOT_SEND_LIMIT + '.',
    ui.ButtonSet.YES_NO
  );
  if (confirmation !== ui.Button.YES) return;
  setSetting_('Mode', 'PILOT');
  ui.alert('PILOT mode enabled. No email has been sent.');
}

function disablePilotMode() {
  assertStagingEnvironment_();
  setSetting_('Mode', 'TEST');
  SpreadsheetApp.getUi().alert('Pilot delivery disabled. Mode is TEST.');
}

function assertStagingEnvironment_() {
  const ss = SpreadsheetApp.getActive();
  if (OUTREACH.ENVIRONMENT !== 'STAGING_PILOT') {
    throw new Error('This build is not configured as STAGING_PILOT.');
  }
  if (ss.getId() !== OUTREACH.EXPECTED_SPREADSHEET_ID) {
    throw new Error(
      'Safety stop: this pilot build may run only in spreadsheet ' +
      OUTREACH.EXPECTED_SPREADSHEET_ID + '.'
    );
  }
  return ss;
}

function connectZoho() {
  assertStagingEnvironment_();
  const ui = SpreadsheetApp.getUi();
  const clientId = promptRequired_(ui, 'Zoho connection', 'Paste the Client ID from your Zoho Self Client.');
  if (clientId === null) return;
  const clientSecret = promptRequired_(ui, 'Zoho connection', 'Paste the Client Secret. It will be stored in Apps Script properties, not in the spreadsheet.');
  if (clientSecret === null) return;
  const grantCode = promptRequired_(ui, 'Zoho connection', 'Paste the short-lived authorization code generated with scopes ZohoMail.accounts.READ,ZohoMail.messages.CREATE');
  if (grantCode === null) return;

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
  const message = buildMessage_(stage, row, settings);
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
  assertStagingEnvironment_();
  if (!OUTREACH.ALLOW_PILOT_SENDS) {
    throw new Error('Pilot sends are disabled in this build.');
  }

  const pilotSheet = SpreadsheetApp.getActiveSheet();
  const pilotRowNumber = pilotSheet.getActiveRange().getRow();
  if (pilotSheet.getName() !== OUTREACH.PILOT_SHEET || pilotRowNumber < OUTREACH.FIRST_DATA_ROW) {
    throw new Error('Select an approved prospect row on Pilot Review first.');
  }

  const settings = getSettings_();
  validateCampaignSettings_(settings, false);
  if (String(settings['Mode']).toUpperCase() !== 'PILOT') {
    throw new Error('Campaign Settings Mode must be PILOT before a real pilot email can be sent.');
  }

  const review = pilotSheet
    .getRange(pilotRowNumber, 1, 1, OUTREACH.PILOT_COL.LAST_DATA_COLUMN)
    .getValues()[0];
  if (String(review[OUTREACH.PILOT_COL.APPROVAL - 1] || '').trim() !== 'Approved') {
    throw new Error('Pilot Approval must be Approved for the selected row.');
  }
  if (String(review[OUTREACH.PILOT_COL.SEND_STATUS - 1] || '').trim().toUpperCase().indexOf('SENT') === 0) {
    throw new Error('This Pilot Review row has already been sent.');
  }

  const leadsSheet = SpreadsheetApp.getActive().getSheetByName(OUTREACH.LEADS_SHEET);
  const source = resolvePilotSource_(leadsSheet, review);
  const sourceRowNumber = source.rowNumber;
  const row = source.values;
  const email = String(row[OUTREACH.COL.EMAIL - 1] || '').trim().toLowerCase();
  const business = String(row[OUTREACH.COL.BUSINESS - 1] || '').trim();
  pilotSheet.getRange(pilotRowNumber, OUTREACH.PILOT_COL.SOURCE_ROW).setValue(sourceRowNumber);
  assertPilotLeadEligible_(row);

  const stage = String(row[OUTREACH.COL.STAGE - 1] || 'Initial');
  const message = buildMessage_(stage, row, settings);
  const ui = SpreadsheetApp.getUi();
  const confirmation = ui.alert(
    'Send REAL pilot email?',
    'Business: ' + business + '\n' +
      'Recipient: ' + email + '\n' +
      'Subject: ' + message.subject + '\n\n' +
      'This sends a real email from ' + settings['Sender address'] + '.',
    ui.ButtonSet.YES_NO
  );
  if (confirmation !== ui.Button.YES) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error('Another pilot send is in progress. Wait a moment and try again.');
  }

  let delivered = false;
  let deliveredMessageId = '';
  try {
    const history = getPilotHistory_();
    if (history.length >= OUTREACH.PILOT_SEND_LIMIT) {
      throw new Error('Pilot limit reached. No more than ' + OUTREACH.PILOT_SEND_LIMIT + ' real emails may be sent.');
    }
    if (history.some(function (item) { return item.email === email; })) {
      throw new Error('A pilot email has already been sent to ' + email + '.');
    }

    const result = sendZohoEmail_(email, message.subject, message.html, settings, 'PILOT');
    delivered = true;
    deliveredMessageId = result.messageId;
    const now = new Date();
    const nextStage = stage === 'Initial' ? 'Follow-up 1' : stage === 'Follow-up 1' ? 'Follow-up 2' : 'Complete';
    const followupDelay = stage === 'Initial'
      ? Number(settings['Follow-up days']) || 7
      : Number(settings['Second follow-up days']) || 7;

    const approvedBy = String(review[OUTREACH.PILOT_COL.APPROVED_BY - 1] || '').trim() ||
      Session.getEffectiveUser().getEmail() || 'Sturgeon Spirits';
    pilotSheet.getRange(pilotRowNumber, OUTREACH.PILOT_COL.APPROVED_BY, 1, 5).setValues([[
      approvedBy,
      'SENT',
      now,
      result.messageId,
      'Zoho accepted delivery to ' + email
    ]]);

    appendLog_(row, email, stage, message.subject, 'PILOT SENT', result.messageId, 'Approved pilot send');

    row[OUTREACH.COL.QUEUE - 1] = false;
    row[OUTREACH.COL.STAGE - 1] = nextStage;
    row[OUTREACH.COL.STATUS - 1] = 'Pilot sent';
    row[OUTREACH.COL.LAST_EMAILED - 1] = now;
    row[OUTREACH.COL.FOLLOWUP_DUE - 1] = nextStage === 'Complete' ? '' : addDays_(now, followupDelay);
    row[OUTREACH.COL.MESSAGE_ID - 1] = result.messageId;
    leadsSheet.getRange(sourceRowNumber, 1, 1, OUTREACH.COL.LAST_DATA_COLUMN).setValues([row]);

    SpreadsheetApp.flush();
    ui.alert('Pilot email sent to ' + email + '. ' + (OUTREACH.PILOT_SEND_LIMIT - history.length - 1) + ' pilot send(s) remain.');
  } catch (error) {
    const detail = String(error.message || error);
    if (delivered) {
      pilotSheet.getRange(pilotRowNumber, OUTREACH.PILOT_COL.SEND_STATUS).setValue('SENT - REVIEW');
      pilotSheet.getRange(pilotRowNumber, OUTREACH.PILOT_COL.MESSAGE_ID).setValue(deliveredMessageId);
      pilotSheet.getRange(pilotRowNumber, OUTREACH.PILOT_COL.NOTES)
        .setValue('Zoho accepted this email. DO NOT RESEND. Post-send recording error: ' + detail);
    } else {
      pilotSheet.getRange(pilotRowNumber, OUTREACH.PILOT_COL.SEND_STATUS).setValue('ERROR');
      pilotSheet.getRange(pilotRowNumber, OUTREACH.PILOT_COL.NOTES).setValue(detail);
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function sendQueuedEmails() {
  assertStagingEnvironment_();
  throw new Error('Queued and bulk sends are disabled in the pilot build. Use Pilot Review one row at a time.');
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
        row[OUTREACH.COL.DO_NOT_EMAIL - 1] !== true) {
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
  if (blockedStatus || blockedOutcome || row[OUTREACH.COL.DO_NOT_EMAIL - 1] === true) {
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

function buildMessage_(stage, row, settings) {
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
  const values = templateValues_(row, settings);
  return {
    subject: renderTemplate_(String(settings[keys[0]] || ''), values, false),
    html: renderTemplate_(String(settings[keys[1]] || ''), values, true)
  };
}

function sendZohoEmail_(recipient, subject, html, settings, deliveryMode) {
  const normalizedRecipient = String(recipient || '').trim().toLowerCase();
  const normalizedMode = String(deliveryMode || '').trim().toUpperCase();
  if (normalizedMode === 'TEST') {
    if (normalizedRecipient !== OUTREACH.EXPECTED_TEST_RECIPIENT) {
      throw new Error('Safety stop: test email may be sent only to ' + OUTREACH.EXPECTED_TEST_RECIPIENT + '.');
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
    if (!properties[key]) throw new Error('Zoho is not connected. Use Sturgeon Outreach PILOT > 1. Connect Zoho.');
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
  const sheet = SpreadsheetApp.getActive().getSheetByName(OUTREACH.SETTINGS_SHEET);
  if (!sheet) throw new Error('Campaign Settings sheet is missing.');
  const values = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), 2).getValues();
  return values.reduce(function (map, row) {
    if (row[0]) map[String(row[0])] = row[1];
    return map;
  }, {});
}

function setSetting_(key, value) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(OUTREACH.SETTINGS_SHEET);
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

function templateValues_(row, settings) {
  const contact = String(row[OUTREACH.COL.CONTACT - 1] || '').trim();
  const firstName = contact ? contact.split(/\s+/)[0] : 'there';
  const sellSheet = String(settings['Wholesale sell-sheet URL'] || '').trim();
  const website = String(settings['Website URL'] || '').trim();
  const logo = String(settings['Logo URL'] || '').trim();
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
    'Sell Sheet Link': sellSheet ? '<p><a href="' + escapeHtml_(sellSheet) + '">View our current wholesale sell sheet</a></p>' : ''
  };
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
  SpreadsheetApp.getActive().getSheetByName(OUTREACH.LOG_SHEET).appendRow([
    new Date(),
    row[OUTREACH.COL.BUSINESS - 1],
    row[OUTREACH.COL.EMAIL - 1],
    stage,
    subject,
    result,
    messageId,
    error,
    deliveredTo,
    OUTREACH_VERSION
  ]);
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
