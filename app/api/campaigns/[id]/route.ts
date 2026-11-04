import { bearer, invitation, mission, claimForCampaign } from "@/lib/campaigns";
import { campaignFailure, campaignResponse } from "@/lib/campaign-http";
import { attendanceEnabled, missionLabel, missionMode } from "@/lib/reclaim";
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const c = invitation(id, bearer(req));
    const mode = missionMode();
    return campaignResponse({ title: c.title, country: c.country, budgetCents: c.budget_cents, expiresAt: c.expires_at, expired: c.expires_at <= Date.now(), claimed: !!claimForCampaign(id), mission, missionMode: mode, missionLabel: mode === "reclaim" ? missionLabel() : undefined, missionAttendance: mode === "reclaim" && attendanceEnabled() });
  } catch (e) { return campaignFailure(e); }
}
