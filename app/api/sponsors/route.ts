import { createSponsor, openSponsorLimits, openSponsorsEnabled } from "@/lib/campaigns";
import { campaignFailure, campaignResponse } from "@/lib/campaign-http";
import { rateLimit } from "@/lib/rate-limit";

/** Whether "Start funding" is available, and the caps that apply to open sponsors. */
export async function GET() {
  return campaignResponse({ open: openSponsorsEnabled(), maxBudgetCents: openSponsorLimits().maxBudgetCents });
}

/** Mints an anonymous sponsor key. Only its hash is stored; the browser keeps the key. */
export async function POST(req: Request) {
  const limited = rateLimit(req, "sponsor-create", 5, 60_000);
  if (limited) return limited;
  try {
    return campaignResponse({ token: createSponsor(), maxBudgetCents: openSponsorLimits().maxBudgetCents }, 201);
  } catch (e) { return campaignFailure(e); }
}
