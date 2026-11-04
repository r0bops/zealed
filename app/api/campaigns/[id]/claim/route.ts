import { z } from "zod";
import { acquireClaim, bearer, CampaignError } from "@/lib/campaigns";
import { isPublicKey } from "@/lib/sodium";
import { campaignFailure, campaignResponse, readBody } from "@/lib/campaign-http";
const input = z.object({ answer: z.number().int().min(0).max(2), publicKey: z.string().max(100), secret: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const body = input.safeParse(await readBody(req));
    if (!body.success || !await isPublicKey(body.data.publicKey)) throw new CampaignError(400, "Invalid claim credentials.");
    const { id } = await ctx.params;
    const c = acquireClaim(id, bearer(req), body.data.answer, body.data.publicKey, body.data.secret);
    return campaignResponse({ id: c.id, state: c.state });
  } catch (e) { return campaignFailure(e); }
}
