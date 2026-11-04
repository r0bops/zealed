// The only code that sees Bitrefill redemption data or a decrypted phone number.
// It buys at most once per order, seals the result to the buyer's key immediately, and wipes the phone.
// Nothing in here may log a response body, a code, or a phone number.
import {
  BitrefillError,
  createInvoice,
  FINAL_INVOICE_STATUSES,
  getInvoice,
  getProduct,
  priceFor,
  getOrder,
  purchaseMode,
  testProductFor,
  type ProductKind,
  type RedemptionInfo,
} from "./bitrefill";
import { cartHash } from "./cart";
import type { Order } from "./db/schema";
import { fulfillKeyPair } from "./fulfill-key";
import { log, safeError } from "./log";
import { getOrder as getDbOrder, patchOrder, transition, claimFulfillment } from "./orders";
import { encodeContent, type SealedContent } from "./payload";
import { open, seal } from "./sodium";
import { zcash } from "./zcash";

const POLL_INTERVAL_MS = 10_000; // Bitrefill allows 60 invoice reads per 10 minutes
const POLL_TIMEOUT_MS = 5 * 60_000;

export type FulfillResult = { status: "delivered" | "failed" | "failed_uncertain" | "skipped"; bitrefillOrderId?: string };

const E164 = /^\+[1-9]\d{7,14}$/;

/** Fulfill one paid order. Safe to call repeatedly: only the caller that wins paid -> fulfilling proceeds. */
export async function fulfillOrder(orderId: string): Promise<FulfillResult> {
  const order = getDbOrder(orderId);
  if (!order || order.status !== "paid") return { status: "skipped" };
  if (order.guardrail === "REQUIRE_HUMAN" && !order.approvedAt) return { status: "skipped" };

  // The memo committed to this exact cart; refuse if any bought field drifted since.
  if (order.cartHash && order.productId) {
    const expected = cartHash({
      orderId: order.id,
      productId: order.productId,
      packageValue: order.packageValue ?? "",
      priceUsdCents: order.priceUsdCents,
      amountZat: order.amountZat,
      buyerPubKey: order.buyerPubKey,
      expiresAt: order.expiresAt,
    });
    if (expected !== order.cartHash) {
      if (transition(order.id, "paid", "fulfilling")) finish(order, "failed", { failure: "cart hash mismatch: order changed after payment" });
      return { status: "failed" };
    }
  }

  const backend = await zcash();
  const mode = purchaseMode(backend.simulated);
  // Reserve the purchase before calling Bitrefill, so a crash or replay can never buy twice.
  if (!claimFulfillment(order.id, mode)) return { status: "skipped" };

  let phone: string | undefined;
  try {
    const kind = order.type as ProductKind;
    if (mode === "live") {
      const current = await getProduct(order.productId ?? "", true);
      if (!current || current.kind !== kind || priceFor(current, order.packageValue ?? "") !== order.priceUsdCents) {
        return finish(order, "failed", { failure: "Product availability or price changed; request a new quote" });
      }
    }
    if (kind === "topup") {
      if (!order.sealedPhone) return finish(order, "failed", { failure: "no sealed phone number" });
      const fk = await fulfillKeyPair();
      phone = await open(order.sealedPhone, fk.publicKey, fk.secretKey);
      if (!E164.test(phone)) return finish(order, "failed", { failure: "phone number is not in E.164 format" });
    }

    let productId = order.productId!;
    let value = order.packageValue ?? "";
    if (mode === "test") {
      const t = testProductFor(kind);
      if (t) ({ productId, value } = t);
    }

    let invoiceId: string;
    try {
      const invoice = await createInvoice({ kind, productId, value, phoneNumber: phone }, { simulate: mode === "simulate" || (mode === "test" && !testProductFor(kind)) });
      invoiceId = invoice.id;
    } catch (e) {
      const definite = e instanceof BitrefillError && e.definite;
      log.warn("bitrefill invoice failed", { orderId: order.id, err: safeError(e), definite });
      return finish(order, definite ? "failed" : "failed_uncertain", {
        failure: definite ? `Bitrefill rejected the order (${(e as BitrefillError).errorCode ?? "error"})` : "Bitrefill outcome unknown; reconcile before retrying",
      });
    } finally {
      // The number was used for exactly one call (or none). Wipe it whatever happened.
      phone = undefined;
      if (kind === "topup") patchOrder(order.id, { sealedPhone: null, wipedAt: Date.now() });
    }
    patchOrder(order.id, { bitrefillInvoiceId: invoiceId });

    // Poll until the invoice is final, then check each order (complete != delivered).
    const started = Date.now();
    let invoice = await getInvoice(invoiceId, kind);
    while (!FINAL_INVOICE_STATUSES.includes(invoice.status) && Date.now() - started < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      invoice = await getInvoice(invoiceId, kind);
    }
    const first = invoice.orders?.[0];
    if (!first) return finish(order, "failed_uncertain", { failure: "Invoice has no delivery orders; reconcile before retrying" });

    let bOrder = await getOrder(first.id);
    while (bOrder.status !== "delivered" && bOrder.status !== "failed" && bOrder.status !== "refunded" && Date.now() - started < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      bOrder = await getOrder(first.id);
    }
    if (bOrder.status !== "delivered") {
      return finish(order, bOrder.status === "failed" || bOrder.status === "refunded" ? "failed" : "failed_uncertain", {
        bitrefillOrderId: first.id,
        failure: "Bitrefill order not delivered; reconcile before retrying",
      });
    }

    const content = toSealedContent(kind, bOrder.redemption_info, mode);
    const sealedPayload = await seal(encodeContent(content), order.buyerPubKey);
    bOrder = { id: bOrder.id, status: bOrder.status }; // drop redemption data from scope
    return finish(order, "delivered", { bitrefillOrderId: first.id, sealedPayload, releasedAt: Date.now() });
  } catch (e) {
    log.error("fulfillment error", { orderId: order.id, err: safeError(e) });
    return finish(order, "failed_uncertain", { failure: "fulfillment error; reconcile before retrying" });
  } finally {
    phone = undefined;
    if (order.type === "topup") patchOrder(order.id, { sealedPhone: null, wipedAt: Date.now() });
  }
}

function toSealedContent(kind: ProductKind, info: string | RedemptionInfo | undefined, mode: string): SealedContent {
  const note = mode === "simulate" ? "SIMULATED: not a real code." : mode === "test" ? "Bitrefill TEST product: not redeemable." : undefined;
  if (kind === "topup") return { kind: "topup", delivered: true };
  const r: RedemptionInfo = typeof info === "string" ? { code: info } : (info ?? {});
  if (kind === "esim" && r.barcode_value) return { kind: "esim", lpa: r.barcode_value, instructions: note ?? r.instructions };
  return { kind: "giftcard", code: r.code, pin: r.pin, link: r.link, instructions: note ?? r.instructions };
}

function finish(order: Order, to: "delivered" | "failed" | "failed_uncertain", patch: Partial<Order>): FulfillResult {
  transition(order.id, "fulfilling", to, patch);
  log.info("fulfillment finished", { orderId: order.id, status: to });
  return { status: to, bitrefillOrderId: patch.bitrefillOrderId ?? undefined };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
