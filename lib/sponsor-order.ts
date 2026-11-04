import { campaign, claimForCampaign, CampaignError, checkChoice, expiredUnpaid, reserveSponsoredOrder, type Choice } from "./campaigns";
import { getOrder } from "./orders";
import { getProduct, priceFor } from "./bitrefill";
import { priceDriftOk } from "./guardrails";
import { zcash } from "./zcash";
import { centsToZat } from "./money";
import { newMemoTag } from "./zip321";
import { cartHash } from "./cart";

export async function approveReward(id: string) {
  const c = campaign(id), player = claimForCampaign(id);
  if (player?.order_id) {
    const bound = getOrder(player.order_id);
    if (!expiredUnpaid(bound)) return bound!; // re-approve only after the previous request expired unpaid
  }
  if (!player?.choice) throw new CampaignError(409, "The player has not selected a reward yet.");
  const chosen = JSON.parse(player.choice) as Choice;
  checkChoice(c, chosen);
  const product = await getProduct(chosen.productId, true);
  // The BTC/USD rate refreshes every 5 minutes, so allow small drift since the selection, never above the budget.
  if (!product?.inStock || product.kind !== chosen.kind || !priceDriftOk(priceFor(product, chosen.packageValue), chosen.priceCents, c.budget_cents)) throw new CampaignError(409, "The package or price changed. Create a new invitation; this one will not buy automatically.");
  const backend = await zcash(), orderId = crypto.randomUUID(), now = Date.now();
  const amountZat = Number(centsToZat(chosen.priceCents, Number(process.env.ZEC_USD_RATE || 30))) + 1 + Math.floor(Math.random() * 999);
  const expiresAt = now + 15 * 60_000;
  const hash = cartHash({ orderId, productId: chosen.productId, packageValue: chosen.packageValue, priceUsdCents: chosen.priceCents, amountZat, buyerPubKey: player.buyer_key, expiresAt });
  return reserveSponsoredOrder(id, {
    id: orderId, type: chosen.kind, source: "agent", agentSessionId: player.id,
    productId: chosen.productId, productName: chosen.productName, packageValue: chosen.packageValue,
    buyerPubKey: player.buyer_key, priceUsdCents: chosen.priceCents, amountZat,
    payAddr: await backend.receiveAddress(), memoTag: newMemoTag(), cartHash: hash,
    status: "awaiting_payment", guardrail: "ALLOW", approvedAt: now, expiresAt, createdAt: now, updatedAt: now,
  });
}
