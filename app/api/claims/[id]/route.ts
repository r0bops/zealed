import { bearer, claim } from "@/lib/campaigns";
import { campaignFailure, campaignResponse } from "@/lib/campaign-http";
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params, c = claim(id, bearer(req));
    return campaignResponse({ id: c.id, state: c.state, choice: c.choice ? JSON.parse(c.choice) : null, orderId: c.order_id });
  } catch (e) { return campaignFailure(e); }
}
