import { buildMemo } from "@/lib/cart";
import { getOrder } from "@/lib/orders";
import { simulatePayment, zcash } from "@/lib/zcash";

/** DEV ONLY: pretends a shielded payment arrived. Refused unless the fake (SIMULATED) backend is active. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const backend = await zcash();
  if (!backend.simulated) return Response.json({ error: "simulated payments are disabled" }, { status: 403 });
  const { id } = await ctx.params;
  const order = getOrder(id);
  if (!order) return Response.json({ error: "order not found" }, { status: 404 });
  if (order.status !== "awaiting_payment") return Response.json({ error: `order is ${order.status}` }, { status: 409 });
  const memo = order.cartHash ? buildMemo(order.memoTag, order.cartHash) : order.memoTag;
  const txid = simulatePayment(memo, order.amountZat);
  return Response.json({ txid, simulated: true });
}
