import { z } from "zod";
import { requireAdmin, claimForCampaign, campaign, CampaignError } from "@/lib/campaigns";
import { programStatus, reviewTask, deliverPrize } from "@/lib/program";
import { campaignResponse, campaignFailure, readBody } from "@/lib/campaign-http";
import { rateLimit } from "@/lib/rate-limit";
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("review"), taskId: z.string().uuid(), approved: z.boolean() }),
  z.object({ action: z.literal("deliver"), txid: z.string().max(64).optional(), sealedPayload: z.string().max(16000).optional() }),
]);
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { requireAdmin(req); const { id } = await ctx.params; campaign(id); const c = claimForCampaign(id); return campaignResponse(c ? programStatus(c, true) : null); } catch (e) { return campaignFailure(e); }
}
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, "program-review", 30, 60_000); if (limited) return limited;
  try {
    requireAdmin(req); const { id } = await ctx.params, parsed = action.safeParse(await readBody(req, 20000));
    if (!parsed.success) throw new CampaignError(400, "Invalid review or delivery request.");
    const d = parsed.data;
    if (d.action === "review") reviewTask(id, d.taskId, d.approved); else deliverPrize(id, d);
    return campaignResponse(programStatus(claimForCampaign(id)!, true));
  } catch (e) { return campaignFailure(e); }
}
