import { campaignInput, requireAdmin, createCampaign, sponsorSummary, type Campaign, CampaignError } from "@/lib/campaigns";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db/client";
import { getProduct, isSimulated, purchaseMode } from "@/lib/bitrefill";
import { campaignFailure, campaignResponse, readBody } from "@/lib/campaign-http";
export async function GET(req: Request) {
  const limited = rateLimit(req, "campaigns-list", 60, 60_000);
  if (limited) return limited;
  try {
    requireAdmin(req);
    const campaigns = db().$client.prepare("SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 30").all() as Campaign[];
    return campaignResponse({ campaigns: campaigns.map(sponsorSummary), simulatedCatalog: isSimulated(), purchaseMode: purchaseMode((process.env.ZCASH_BACKEND ?? "fake") === "fake") });
  } catch (e) { return campaignFailure(e); }
}
export async function POST(req: Request) {
  const limited = rateLimit(req, "campaign-create", 20, 60_000);
  if (limited) return limited;
  try {
    requireAdmin(req);
    const parsed = campaignInput.safeParse(await readBody(req, 24000));
    if (!parsed.success) throw new CampaignError(400, "Check the title, country, budget, task answers and prize options. Bitrefill prizes also need allowed products.");
    const products = await Promise.all(parsed.data.productIds.map(id => getProduct(id, true)));
    if (products.some(p => !p || !p.inStock || p.kind === "topup" || !p.packages.some(k => k.priceCents != null && k.priceCents > 0 && k.priceCents <= parsed.data.budgetCents))) {
      throw new CampaignError(400, "Every allowed product needs an available gift-card or eSIM package within the budget.");
    }
    if (parsed.data.program?.prizes.some(prize => ["giftcard", "esim"].includes(prize.kind) && !products.some(p => p?.kind === prize.kind))) throw new CampaignError(400, "Each Bitrefill reward type needs an allowed product of that type.");
    return campaignResponse(createCampaign(parsed.data), 201);
  } catch (e) { return campaignFailure(e); }
}
