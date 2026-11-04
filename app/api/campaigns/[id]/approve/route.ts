import { requireAdmin } from "@/lib/campaigns";
import { rateLimit } from "@/lib/rate-limit";
import { campaignFailure, campaignResponse } from "@/lib/campaign-http";
import { approveReward } from "@/lib/sponsor-order";
import { buildMemo } from "@/lib/cart";
import { buildZip321 } from "@/lib/zip321";
import { zcash } from "@/lib/zcash";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, "approve", 20, 60_000);
  if (limited) return limited;
  try {
    requireAdmin(req);
    const { id } = await ctx.params, o = await approveReward(id);
    const memo = buildMemo(o.memoTag, o.cartHash!);
    return campaignResponse({ payment: { id: o.id, status: o.status, to: o.payAddr, amountZec: (o.amountZat / 1e8).toFixed(8), memo, zip321: buildZip321(o.payAddr, BigInt(o.amountZat), memo), simulated: (await zcash()).simulated, expiresAt: o.expiresAt } });
  } catch (e) { return campaignFailure(e); }
}
