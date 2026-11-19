/**
 * Campaign runner — run a campaign from the Apps Script editor while the web app's
 * response handoff is unreliable. Uses the app's own approve/send functions and
 * safeguards (idempotency, eligibility re-checks, stop on a blocked recipient).
 *
 * Add as a new script file in the Inventory API project (+ → Script, name it CampaignRunner).
 * Run in this order, checking the Execution log after each:
 *   1. showNewestCampaign   — read only
 *   2. approveNewestCampaign
 *   3. sendNewestCampaign   — sends in batches of 10 for up to ~5 minutes; run again if recipients remain
 */
function newestOpenCampaign_() {
  const campaigns = apiGetOutreachCampaigns_().campaigns || [];
  const open = campaigns.find(item => ["Review", "Approved"].includes(item.status));
  if (!open) throw new Error("No campaign is in Review or Approved status.");
  return apiGetOutreachCampaign_({ campaign_id:open.campaign_id }).campaign;
}

function showNewestCampaign() {
  const campaign = newestOpenCampaign_();
  const counts = {};
  (campaign.recipients || []).forEach(item => { counts[item.status || "Unknown"] = (counts[item.status || "Unknown"] || 0) + 1; });
  Logger.log(JSON.stringify({
    campaign_id:campaign.campaign_id, name:campaign.name, status:campaign.status, audience:campaign.audience,
    recipient_rows:(campaign.recipients || []).length, unsegmented:campaign.unsegmented_count, recipient_statuses:counts,
  }, null, 2));
}

function approveNewestCampaign() {
  const campaign = newestOpenCampaign_();
  if (campaign.status === "Approved") { Logger.log(`Already approved: ${campaign.name}. Run sendNewestCampaign next.`); return; }
  const result = apiApproveOutreachCampaign_({
    campaign_id:campaign.campaign_id,
    audience_checksum:campaign.audience_checksum,
    recipient_count:(campaign.recipients || []).length,
    confirm_unsegmented:true, // unsegmented recipients get the default template, as in the app
    staff_name:"Karl (editor)",
  });
  bumpReadCacheVersion_();
  Logger.log(`${campaign.name}: ${result.message} (${result.recipient_count} recipients)`);
}

function sendNewestCampaign() {
  const started = Date.now();
  const campaign = newestOpenCampaign_();
  if (campaign.status !== "Approved") throw new Error(`Campaign status is ${campaign.status}; run approveNewestCampaign first.`);
  let totalSent = 0;
  try {
    while (Date.now() - started < 4.5 * 60 * 1000) {
      const result = apiSendOutreachCampaignBatch_({
        campaign_id:campaign.campaign_id, approval_token:campaign.approval_token,
        staff_name:"Karl (editor)", batch_size:10,
      });
      totalSent += Number(result.sent || 0);
      Logger.log(`${result.message} Remaining: ${result.remaining}.`);
      if (Number(result.blocked || 0) > 0) { Logger.log("Stopped: a recipient was blocked. Check the campaign before continuing."); break; }
      if (!Number(result.remaining || 0)) { Logger.log("All recipients processed."); break; }
    }
  } finally {
    bumpReadCacheVersion_();
    Logger.log(`This run sent ${totalSent}. If recipients remain, run sendNewestCampaign again.`);
  }
}

