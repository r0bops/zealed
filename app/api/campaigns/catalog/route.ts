import { requireAdmin, CampaignError } from "@/lib/campaigns";
import { searchProducts, isSimulated } from "@/lib/bitrefill";
import { campaignFailure, campaignResponse } from "@/lib/campaign-http";
export async function GET(req: Request) {
  try {
    requireAdmin(req);
    const url = new URL(req.url), q = url.searchParams.get("q") ?? "", country = url.searchParams.get("country") ?? "IN";
    if (q.length < 2 || q.length > 60 || !/^[A-Z]{2}$/.test(country)) throw new CampaignError(400, "Enter a search and two-letter destination country.");
    const products = (await searchProducts(q, country)).filter(p => p.inStock && p.kind !== "topup").slice(0, 12);
    return campaignResponse({ products, simulatedCatalog: isSimulated() });
  } catch (e) { return campaignFailure(e); }
}
