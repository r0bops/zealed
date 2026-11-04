import { campaignInput, requireAdmin, createCampaign, sponsorSummary, type Campaign, CampaignError } from "@/lib/campaigns";
import { db } from "@/lib/db/client";
import { getProduct, isSimulated, purchaseMode } from "@/lib/bitrefill";
import { campaignFailure, campaignResponse, readBody } from "@/lib/campaign-http";
export async function GET(req: Request) {
  try {
    requireAdmin(req);
    const campaigns = db().$client.prepare("SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 30").all() as Campaign[];
    return campaignResponse({ campaigns: campaigns.map(sponsorSummary), simulatedCatalog: isSimulated(), purchaseMode: purchaseMode(process.env.ZCASH_BACKEND === "fake") });
  } catch (e) { return campaignFailure(e); }
}
export async function POST(req: Request) {
  try {
    requireAdmin(req);
    const parsed = campaignInput.safeParse(await readBody(req));
    if (!parsed.success) throw new CampaignError(400, "Provide a title, country, budget up to $20 and 1–5 products.");
    const products = await Promise.all(parsed.data.productIds.map(id => getProduct(id, true)));
    if (products.some(p => !p || !p.inStock || p.kind === "topup" || !p.packages.some(k => k.priceCents != null && k.priceCents > 0 && k.priceCents <= parsed.data.budgetCents))) {
      throw new CampaignError(400, "Every allowed product needs an available gift-card or eSIM package within the budget.");
    }
    return campaignResponse(createCampaign(parsed.data), 201);
  } catch (e) { return campaignFailure(e); }
}
