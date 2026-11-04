import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { acceptGift, bearerToken, GiftError, giftFailure, giftJson, readGiftBody } from "@/lib/gift-links";

const input = z.object({ publicKey: z.string().max(100) }).strict();

/** The friend's browser registers only its public key, with the link token. The first accept wins; later ones get 409. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, "gift-accept", 20, 60_000);
  if (limited) return limited;
  try {
    const { id } = await ctx.params;
    const body = input.safeParse(await readGiftBody(req, 1000));
    if (!body.success) throw new GiftError(400, "Invalid public key.");
    return giftJson(await acceptGift(id, bearerToken(req), body.data.publicKey));
  } catch (e) {
    return giftFailure(e);
  }
}
