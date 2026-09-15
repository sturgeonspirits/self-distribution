/**
 * Sturgeon Spirits distribution outreach tracker
 *
 * VERSION: 2026.09.15.5-TEST
 *
 * CHANGES IN THIS VERSION
 * - Added an editable sender-title field to every email footer.
 * - Set Karl's default title to President.
 * - Kept the footer logo-only, with no separate text website link.
 * - Retained the renamed Distribution Directory and Leads sheet.
 * - Retained the staging workbook lock and Karl-only delivery restriction.
 * - Kept queued and LIVE campaign sends disabled.
 *
 * PASTE INSTRUCTIONS
 * - This is the complete Code.gs source, not a partial snippet.
 * - Replace Code.gs only in the STAGING Distribution Directory workbook.
 * - Keep Zoho credentials in Script Properties; never paste them into this file.
 *
 * Bound to: STAGING - Distribution Directory and Leads - 2026-09-15
 * Sends through the authenticated Zoho Mail API account.
 */

const OUTREACH_VERSION = '2026.09.15.5-TEST';

const OUTREACH = Object.freeze({
  ENVIRONMENT: 'STAGING_TEST',
  EXPECTED_SPREADSHEET_ID: '1tWJ2ZnFT15cjuk7qvCWbJUJX1pAQYYsbSy5owWa8Uzo',
  AUTHENTICATED_MAILBOX: 'karl@sturgeonspirits.com',
  EXPECTED_SENDER_ALIAS: 'sales@sturgeonspirits.com',
  EXPECTED_TEST_RECIPIENT: 'karl@sturgeonspirits.com',
  ALLOW_LIVE_SENDS: false,
  LEADS_SHEET: 'Distribution Directory and Leads',
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
  })
});

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Sturgeon Outreach TEST')
    .addItem('Verify test configuration', 'showTestConfiguration')
    .addSeparator()
    .addItem('1. Connect Zoho', 'connectZoho')
    .addItem('2. Test Zoho connection', 'testZohoConnection')
    .addSeparator()
    .addItem('Send test for active row', 'sendTestForActiveRow')
    .addItem('Refresh follow-up statuses', 'refreshFollowupStatuses')
    .addToUi();
}

function showTestConfiguration() {
  assertStagingEnvironment_();
  const settings = getSettings_();
  validateCampaignSettings_(settings, true);
  SpreadsheetApp.getUi().alert(
    'Staging email configuration verified',
    'Version: ' + OUTREACH_VERSION + '\n' +
      'Zoho mailbox: ' + OUTREACH.AUTHENTICATED_MAILBOX + '\n' +
      'Visible sender: ' + OUTREACH.EXPECTED_SENDER_ALIAS + '\n' +
      'Test recipient: ' + OUTREACH.EXPECTED_TEST_RECIPIENT + '\n' +
      'Queued/LIVE sends: disabled',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function assertStagingEnvironment_() {
  const ss = SpreadsheetApp.getActive();
  if (OUTREACH.ENVIRONMENT !== 'STAGING_TEST') {
    throw new Error('This build is not configured as STAGING_TEST.');
  }
  if (ss.getId() !== OUTREACH.EXPECTED_SPREADSHEET_ID) {
    throw new Error(
      'Safety stop: this email test build may run only in spreadsheet ' +
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
  const result = sendZohoEmail_(settings['Test recipient'], message.subject, message.html, settings);
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

function sendQueuedEmails() {
  assertStagingEnvironment_();
  if (!OUTREACH.ALLOW_LIVE_SENDS) {
    throw new Error('Queued and LIVE sends are disabled in this staging test build.');
  }

  const settings = getSettings_();
  validateCampaignSettings_(settings, false);
  if (String(settings['Mode']).toUpperCase() !== 'LIVE') {
    throw new Error('Campaign Settings is still in TEST mode. Send a test first, then change Mode to LIVE.');
  }

  const ui = SpreadsheetApp.getUi();
  const confirmation = ui.alert(
    'Send queued emails?',
    'This will send up to ' + settings['Maximum emails per run'] + ' checked rows from ' + settings['Sender address'] + '.',
    ui.ButtonSet.YES_NO
  );
  if (confirmation !== ui.Button.YES) return;

  const sheet = SpreadsheetApp.getActive().getSheetByName(OUTREACH.LEADS_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < OUTREACH.FIRST_DATA_ROW) return;
  const range = sheet.getRange(OUTREACH.FIRST_DATA_ROW, 1, lastRow - 1, OUTREACH.COL.LAST_DATA_COLUMN);
  const rows = range.getValues();
  const maximum = Math.max(1, Math.min(25, Number(settings['Maximum emails per run']) || 15));
  let sent = 0;
  let failed = 0;

  rows.forEach(function (row) {
    if (sent >= maximum || row[OUTREACH.COL.QUEUE - 1] !== true) return;

    const email = String(row[OUTREACH.COL.EMAIL - 1] || '').trim();
    const emailConfidence = String(row[OUTREACH.COL.EMAIL_CONFIDENCE - 1] || '').trim();
    const relationship = String(row[OUTREACH.COL.RELATIONSHIP - 1] || 'Prospect').trim();
    const stage = String(row[OUTREACH.COL.STAGE - 1] || 'Initial');
    const status = String(row[OUTREACH.COL.STATUS - 1] || '');
    const outcome = String(row[OUTREACH.COL.OUTCOME - 1] || '');
    const blocked = ['Replied', 'Interested', 'Not interested', 'Bad address', 'Do not contact'].indexOf(status) !== -1 ||
      ['Bad address', 'Unsubscribed'].indexOf(outcome) !== -1 ||
      row[OUTREACH.COL.DO_NOT_EMAIL - 1] === true;

    if (blocked) {
      row[OUTREACH.COL.QUEUE - 1] = false;
      row[OUTREACH.COL.STATUS - 1] = 'Do not contact';
      return;
    }
    if (relationship === 'Current customer') {
      row[OUTREACH.COL.QUEUE - 1] = false;
      row[OUTREACH.COL.STATUS - 1] = 'Existing customer';
      return;
    }
    if (['Win-back due', 'Lapsed customer'].indexOf(relationship) !== -1 && stage !== 'Reactivation') {
      row[OUTREACH.COL.QUEUE - 1] = false;
      row[OUTREACH.COL.STATUS - 1] = 'Use reactivation';
      return;
    }
    if (!isValidEmail_(email)) {
      row[OUTREACH.COL.QUEUE - 1] = false;
      row[OUTREACH.COL.STATUS - 1] = 'Needs email';
      return;
    }
    if (['Confirmed', 'Published', 'Supplied'].indexOf(emailConfidence) === -1) {
      row[OUTREACH.COL.QUEUE - 1] = false;
      row[OUTREACH.COL.STATUS - 1] = 'Verify email';
      return;
    }

    if (stage === 'Complete') {
      row[OUTREACH.COL.QUEUE - 1] = false;
      return;
    }

    try {
      const message = buildMessage_(stage, row, settings);
      const result = sendZohoEmail_(email, message.subject, message.html, settings);
      const now = new Date();
      const nextStage = stage === 'Initial' ? 'Follow-up 1' : stage === 'Follow-up 1' ? 'Follow-up 2' : 'Complete';
      row[OUTREACH.COL.QUEUE - 1] = false;
      row[OUTREACH.COL.STAGE - 1] = nextStage;
      row[OUTREACH.COL.STATUS - 1] = stage === 'Initial' ? 'Sent' : stage === 'Reactivation' ? 'Reactivation sent' : 'Follow-up sent';
      row[OUTREACH.COL.LAST_EMAILED - 1] = now;
      const followupDelay = stage === 'Initial'
        ? Number(settings['Follow-up days']) || 7
        : Number(settings['Second follow-up days']) || 7;
      row[OUTREACH.COL.FOLLOWUP_DUE - 1] = nextStage === 'Complete' ? '' : addDays_(now, followupDelay);
      row[OUTREACH.COL.MESSAGE_ID - 1] = result.messageId;
      appendLog_(row, email, stage, message.subject, 'SENT', result.messageId, '');
      sent++;
    } catch (error) {
      row[OUTREACH.COL.STATUS - 1] = 'Send error';
      appendLog_(row, email, stage, '', 'ERROR', '', String(error.message || error));
      failed++;
    }
  });

  range.setValues(rows);
  SpreadsheetApp.flush();
  ui.alert('Finished: ' + sent + ' sent, ' + failed + ' failed. Review Activity Log for details.');
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

function sendZohoEmail_(recipient, subject, html, settings) {
  if (
    !OUTREACH.ALLOW_LIVE_SENDS &&
    String(recipient || '').trim().toLowerCase() !== OUTREACH.EXPECTED_TEST_RECIPIENT
  ) {
    throw new Error('Safety stop: staging email may be sent only to ' + OUTREACH.EXPECTED_TEST_RECIPIENT + '.');
  }

  const token = getAccessToken_();
  const accountId = String(settings['Zoho account ID'] || '').trim();
  const response = UrlFetchApp.fetch(settings['Zoho Mail API URL'] + '/accounts/' + encodeURIComponent(accountId) + '/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Zoho-oauthtoken ' + token },
    payload: JSON.stringify({
      fromAddress: settings['Sender address'],
      toAddress: recipient,
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
    if (!properties[key]) throw new Error('Zoho is not connected. Use Sturgeon Outreach > 1. Connect Zoho.');
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
  if (OUTREACH.ENVIRONMENT === 'STAGING_TEST' && String(settings['Mode']).toUpperCase() !== 'TEST') {
    throw new Error('Campaign Settings must remain in TEST mode for this build.');
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
