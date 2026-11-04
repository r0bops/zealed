import { z } from "zod";
import { bearer, CampaignError, claimForCampaign, invitation } from "@/lib/campaigns";
import { isPublicKey } from "@/lib/sodium";
import { campaignFailure, campaignResponse, readBody } from "@/lib/campaign-http";
import { createMissionRequest, missionLabel, MissionProofError, reclaimEnabled } from "@/lib/reclaim";
// POST, not GET, so the player's public key stays out of URLs and access logs.
const input = z.object({ publicKey: z.string().max(100) });
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const c = invitation(id, bearer(req));
    if (!reclaimEnabled()) throw new CampaignError(404, "This invitation uses the quiz mission.");
    const body = input.safeParse(await readBody(req));
    if (!body.success || !await isPublicKey(body.data.publicKey)) throw new CampaignError(400, "Invalid claim credentials.");
    if (c.expires_at <= Date.now()) throw new CampaignError(410, "This invitation expired.");
    if (claimForCampaign(id)) throw new CampaignError(409, "This invitation has already been claimed.");
    if (c.attempts >= 5) throw new CampaignError(429, "Attempt limit reached. Ask for a new invitation.");
    try {
      return campaignResponse({ request: await createMissionRequest(id, body.data.publicKey), label: missionLabel() });
    } catch (e) {
      throw e instanceof MissionProofError ? new CampaignError(503, e.message) : e;
    }
  } catch (e) { return campaignFailure(e); }
}
