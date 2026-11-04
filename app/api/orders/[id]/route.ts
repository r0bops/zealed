import { bearer, canReadRewardOrder } from "@/lib/campaigns";
import { buildMemo } from "@/lib/cart";
import { getOrder, publicOrder } from "@/lib/orders";
import { buildZip321 } from "@/lib/zip321";
import { zcash } from "@/lib/zcash";

/** Order status. The sealed payload is included only once delivered; it's ciphertext only the buyer can open. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const order = getOrder(id);
  if (!order || !canReadRewardOrder(id, bearer(_req))) return Response.json({ error: "order not found" }, { status: 404 });
  const backend = await zcash();
  const memo = order.cartHash ? buildMemo(order.memoTag, order.cartHash) : order.memoTag;
  return Response.json({
    order: publicOrder(order),
    zip321: buildZip321(order.payAddr, BigInt(order.amountZat), memo),
    memo,
    simulatedPayment: backend.simulated,
    sponsored: !canReadRewardOrder(id, ""),
  });
}
