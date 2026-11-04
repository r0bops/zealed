import { rateLimit } from "@/lib/rate-limit";
import { createGift, giftFailure, giftJson } from "@/lib/gift-links";

/** Starts a one-time gift link. No body: the server learns nothing about the reward or the giver. */
export async function POST(req: Request) {
  const limited = rateLimit(req, "gift-create", 10, 60_000);
  if (limited) return limited;
  try {
    return giftJson(createGift(), 201);
  } catch (e) {
    return giftFailure(e);
  }
}
