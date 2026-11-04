import { publicProgram } from "@/lib/program";
import { bearer, invitation, mission, claimForCampaign } from "@/lib/campaigns";
import { rateLimit } from "@/lib/rate-limit";
import { campaignFailure, campaignResponse } from "@/lib/campaign-http";
import { attendanceEnabled, missionLabel, missionMode } from "@/lib/reclaim";
import { attendeeEventId, emailModeEnabled } from "@/lib/attendees";
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, "invitation", 60, 60_000);
  if (limited) return limited;
  try {
    const { id } = await ctx.params;
    const c = invitation(id, bearer(req));
    const mode = emailModeEnabled() ? "email" : missionMode();
    return campaignResponse({ program: publicProgram(id), title: c.title, country: c.country, budgetCents: c.budget_cents, expiresAt: c.expires_at, expired: c.expires_at <= Date.now(), claimed: !!claimForCampaign(id), mission, missionMode: mode, missionLabel: mode === "reclaim" ? missionLabel() : undefined, missionAttendance: (mode === "reclaim" && attendanceEnabled()) || mode === "email", attendeeEventId: mode === "email" ? attendeeEventId() : undefined });
  } catch (e) { return campaignFailure(e); }
}
