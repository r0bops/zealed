import { assertProgramPurchase } from "@/lib/program";
import { bearer, claim, campaign, beginSelection, finishSelection, CampaignError } from "@/lib/campaigns";
import { rateLimit } from "@/lib/rate-limit";
import { campaignFailure, campaignResponse, readBody } from "@/lib/campaign-http";
import { preferencesSchema, selectReward } from "@/lib/reward-agent";
export const maxDuration = 60;
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, "select", 6, 60_000);
  if (limited) return limited;
  const { id } = await ctx.params;
  let attempt: number | undefined;
  try {
    const prefs = preferencesSchema.safeParse(await readBody(req));
    if (!prefs.success) throw new CampaignError(400, "Choose a purpose, duration and device compatibility.");
    const token = bearer(req);
    assertProgramPurchase(claim(id, token), prefs.data.purpose === "gift" ? "giftcard" : "esim");
    if (!beginSelection(id, token)) return campaignResponse({ status: "already_started" });
    const c = claim(id, token); attempt = c.attempts;
    const choice = await selectReward(campaign(c.campaign_id), prefs.data);
    finishSelection(id, choice, attempt);
    return campaignResponse({ status: "proposed" });
  } catch (e) {
    if (attempt !== undefined) finishSelection(id, null, attempt);
    return campaignFailure(e);
  }
}
