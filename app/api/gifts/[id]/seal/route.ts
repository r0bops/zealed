import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { bearerToken, GIFT_SEALED_RE, GiftError, giftFailure, giftJson, readGiftBody, sealGift } from "@/lib/gift-links";

const input = z.object({ sealed: z.string().regex(GIFT_SEALED_RE), recipientPublicKey: z.string().max(100) }).strict();

/** The giver uploads ciphertext sealed in their browser to the friend's key (owner token only). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, "gift-seal", 20, 60_000);
  if (limited) return limited;
  try {
    const { id } = await ctx.params;
    const body = input.safeParse(await readGiftBody(req));
    if (!body.success) throw new GiftError(400, "Invalid sealed gift.");
    return giftJson(sealGift(id, bearerToken(req), body.data.sealed, body.data.recipientPublicKey));
  } catch (e) {
    return giftFailure(e);
  }
}
