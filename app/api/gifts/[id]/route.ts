import { rateLimit } from "@/lib/rate-limit";
import { bearerToken, cancelGift, giftFailure, giftJson, giftStatus } from "@/lib/gift-links";

/** Gift state for the giver, the recipient or the link holder. Never includes the sealed blob. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, "gift-status", 60, 60_000);
  if (limited) return limited;
  try {
    const { id } = await ctx.params;
    return giftJson(giftStatus(id, bearerToken(req)));
  } catch (e) {
    return giftFailure(e);
  }
}

/** The giver cancels the link (owner token only). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, "gift-seal", 20, 60_000);
  if (limited) return limited;
  try {
    const { id } = await ctx.params;
    cancelGift(id, bearerToken(req));
    return giftJson({ cancelled: true });
  } catch (e) {
    return giftFailure(e);
  }
}
