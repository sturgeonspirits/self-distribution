/**
 * Distribution Hub profiler — READ ONLY. Changes nothing, needs no deploy.
 * Add as a new script file in the Inventory API project (+ → Script, name it Profiler),
 * select profileHub in the toolbar, click Run, then copy the whole Execution log.
 */
function profileHub() {
  const results = [];
  const time = (label, fn) => {
    const started = Date.now();
    let note = "";
    try {
      const value = fn();
      if (value && typeof value === "object") note = `${Math.round(JSON.stringify(value).length / 1024)} KB`;
    } catch (error) {
      note = "ERROR: " + String(error && error.message || error).slice(0, 120);
    }
    results.push({ label:label, ms:Date.now() - started, note:note });
  };

  // 1. Opening each workbook.
  time("open Hub workbook", () => SpreadsheetApp.openById(OUTREACH_SPREADSHEET_ID).getSheets().length);
  time("open Inventory workbook", () => SpreadsheetApp.openById(LEGACY_INVENTORY_SPREADSHEET_ID).getSheets().length);
  time("open Badger Tracker", () => SpreadsheetApp.openById(BADGER_TRACKER_SPREADSHEET_ID).getSheets().length);

  // 2. Reading every Hub tab once (full used range), to find the expensive tabs.
  SpreadsheetApp.openById(OUTREACH_SPREADSHEET_ID).getSheets().forEach(sheet => {
    time(`read tab: ${sheet.getName()} (${sheet.getLastRow()}×${sheet.getLastColumn()})`, () => sheet.getDataRange().getValues().length);
  });

  // 3. Building each screen from scratch, bypassing all caches (what a cold click costs).
  time("SCREEN Outreach list", () => apiGetOutreachDashboard_({ slim:"1", _cache_bypass:true }));
  time("SCREEN Orders & Accounts", () => apiGetCustomerWorkQueue_({ _cache_bypass:true }));
  time("SCREEN Inventory store list", () => apiGetInitData_("", true));
  time("SCREEN Campaign list", () => apiGetOutreachCampaigns_());
  let latest = null;
  try { latest = (apiGetOutreachCampaigns_().campaigns || [])[0] || null; } catch (_) {}
  if (latest) {
    time("SCREEN Open newest campaign", () => apiGetOutreachCampaign_({ campaign_id:latest.campaign_id }));
    if (latest.criteria) time("SCREEN Campaign preview (newest criteria)", () => apiPreviewOutreachCampaign_({ criteria:latest.criteria }));
  }

  const lines = results.map(item => `${String(item.ms).padStart(7)} ms  ${item.label}${item.note ? "  [" + item.note + "]" : ""}`);
  Logger.log("PROFILE (app gives up at ~24,000 ms)\n" + lines.join("\n"));
  return results;
}
