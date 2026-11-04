import { createHash } from "node:crypto";
import { getProduct, priceFor } from "@/lib/bitrefill";
import { buildMemo, cartHash } from "@/lib/cart";
import { evaluateGuardrails, limitsFromEnv } from "@/lib/guardrails";
import { log, safeError } from "@/lib/log";
import { centsToZat } from "@/lib/money";
import { agentSpentTodayCents, reserveOrder, ReservationError, kvGet, logAgentEvent, publicOrder } from "@/lib/orders";
import { verifyProposal } from "@/lib/proposal";
import { isPublicKey } from "@/lib/sodium";
import { buildZip321, newMemoTag } from "@/lib/zip321";
import { zcash } from "@/lib/zcash";

const ORDER_TTL_MS = 15 * 60_000;
const ZEC_USD_RATE = () => Number(process.env.ZEC_USD_RATE || 30);
const fail = (status: number, error: string) => Response.json({ error }, { status });

/**
 * Create an order from a signed agent proposal. The browser supplies only its public key and,
 * for top-ups, the phone number already sealed to the fulfillment key. Price and caps are re-checked here.
 */
export async function POST(req: Request) {
  let body: { proposalToken?: unknown; buyerPubKey?: unknown; sealedPhone?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid JSON");
  }

  const proposal = verifyProposal(body.proposalToken);
  if (!proposal) return fail(400, "This checkout expired or is invalid. Ask the agent again.");
  if (!(await isPublicKey(body.buyerPubKey))) return fail(400, "invalid buyer key");
  const buyerPubKey = body.buyerPubKey as string;

  let sealedPhone: string | null = null;
  if (proposal.kind === "topup") {
    if (typeof body.sealedPhone !== "string" || !/^[A-Za-z0-9_-]{60,400}$/.test(body.sealedPhone)) return fail(400, "a sealed phone number is required");
    sealedPhone = body.sealedPhone;
  }

  const usedKey = `proposal-used:${createHash("sha256").update(String(body.proposalToken)).digest("base64url")}`;
  if (kvGet<boolean>(usedKey)) return fail(409, "This checkout was already used. Ask the agent for a new one.");

  try {
    const product = await getProduct(proposal.productId, true);
    const priceCents = product ? priceFor(product, proposal.packageValue) : null;
    if (priceCents == null) return fail(409, "This product can no longer be priced. Ask the agent again.");
    if (priceCents > Math.ceil(proposal.priceCents * 1.05)) return fail(409, "The price went up since the quote. Ask the agent again.");

    const decision = evaluateGuardrails({ priceCents, spentTodayCents: agentSpentTodayCents(), limits: limitsFromEnv() });
    if (decision.verdict === "BLOCK") return fail(403, `Blocked by guardrails: ${decision.reason}`);
    if (decision.verdict === "REQUIRE_HUMAN" && !proposal.approved) return fail(403, "This order needs your approval first.");

    const backend = await zcash();
    const id = crypto.randomUUID();
    const memoTag = newMemoTag();
    // A few random zatoshis make each amount unique, so mempool receipts can be matched before memos are readable.
    const amountZat = Number(centsToZat(priceCents, ZEC_USD_RATE())) + 1 + Math.floor(Math.random() * 999);
    const expiresAt = Date.now() + ORDER_TTL_MS;
    const hash = cartHash({ orderId: id, productId: proposal.productId, packageValue: proposal.packageValue, priceUsdCents: priceCents, amountZat, buyerPubKey, expiresAt });
    const payAddr = await backend.receiveAddress();
    const t = Date.now();

    const order = reserveOrder({
      id,
      type: proposal.kind,
      source: "agent",
      agentSessionId: proposal.sessionId,
      productId: proposal.productId,
      productName: proposal.productName,
      packageValue: proposal.packageValue,
      buyerPubKey,
      priceUsdCents: priceCents,
      amountZat,
      payAddr,
      memoTag,
      status: "awaiting_payment",
      guardrail: decision.verdict,
      guardrailReason: decision.reason,
      approvedAt: proposal.approved ? t : null,
      sealedPhone,
      cartHash: hash,
      expiresAt,
      createdAt: t,
      updatedAt: t,
    }, usedKey, proposal.approved);

    const memo = buildMemo(memoTag, hash);
    const zip321 = buildZip321(payAddr, BigInt(amountZat), memo);
    logAgentEvent(proposal.sessionId, "tool_result", "checkout.order_created", {
      orderId: id,
      status: order.status,
      guardrail: decision.verdict,
      approved: proposal.approved,
      amountZat,
      memoTag,
      cartHash: hash,
      sealedPhone: sealedPhone ? `[ciphertext, ${sealedPhone.length} chars]` : null,
    });
    return Response.json({ order: publicOrder(order), zip321, memo, simulatedPayment: backend.simulated }, { status: 201 });
  } catch (e) {
    if (e instanceof ReservationError) return fail(e.status, e.message);
    log.error("order creation failed", { err: safeError(e) });
    return fail(500, "Couldn't create the order. Try again.");
  }
}
