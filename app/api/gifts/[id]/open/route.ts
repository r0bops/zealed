import { rateLimit } from "@/lib/rate-limit";
import { bearerToken, giftFailure, giftJson, takeSealedGift } from "@/lib/gift-links";

// POST rather than GET: this read is destructive. The row is deleted in the same transaction that returns it.
/** One-time read for the browser that accepted the gift (recipient token only). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, "gift-open", 20, 60_000);
  if (limited) return limited;
  try {
    const { id } = await ctx.params;
    return giftJson(takeSealedGift(id, bearerToken(req)));
  } catch (e) {
    return giftFailure(e);
  }
}
