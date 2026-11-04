// Payment watcher: matches shielded receipts to orders by memo, moves them seen -> paid,
// releases resold codes and triggers fulfillment. Acts at most once per txid.
import { memoCartHash } from "../lib/cart";
import { fulfillOrder, reconcileOrder } from "../lib/fulfill";
import { log, safeError } from "../lib/log";
import { getOrderByMemo, now, ordersInStatus, recoverStaleFulfillments, transition } from "../lib/orders";
import { extractMemoTag } from "../lib/zip321";
import { MIN_CONFIRMATIONS, zcash } from "../lib/zcash";

const TICK_MS = Number(process.env.WATCHER_TICK_MS ?? 4_000);
const inFlight = new Set<string>();
const RECONCILE_EVERY_MS = 60_000; // Bitrefill allows 60 invoice reads per 10 minutes
const lastReconcile = new Map<string, number>();

export async function tick(): Promise<void> {
  recoverStaleFulfillments(inFlight);
  const backend = await zcash();
  const receipts = await backend.poll();

  for (const r of receipts) {
    const tag = extractMemoTag(r.memo);
    if (!tag) continue;
    const order = getOrderByMemo(tag);
    if (!order) continue;
    if (order.txid && order.txid !== r.txid) continue; // already matched to another payment
    if (r.recipient !== order.payAddr) continue;
    if (backend.simulated ? r.pool !== "simulated" : !["ironwood", "sapling"].includes(r.pool ?? "")) continue;
    if (!Number.isSafeInteger(r.amountZat) || r.amountZat !== order.amountZat) continue;
    if (!Number.isSafeInteger(r.confirmations) || r.confirmations < 0) continue;
    if (r.minedHeight !== null && (!Number.isSafeInteger(r.minedHeight) || r.minedHeight < 1)) continue;
    if (order.status === "awaiting_payment" && order.expiresAt <= now()) continue;
    const hash = memoCartHash(r.memo);
    if (order.cartHash && hash !== order.cartHash) {
      log.warn("receipt cart hash mismatch", { orderId: order.id, txid: r.txid });
      continue;
    }
    if (r.amountZat < order.amountZat) {
      log.warn("underpaid receipt", { orderId: order.id, txid: r.txid, got: r.amountZat, want: order.amountZat });
      continue;
    }

    const confirmed = r.minedHeight != null && r.confirmations >= MIN_CONFIRMATIONS;
    if (!confirmed) {
      if (order.status === "awaiting_payment") transition(order.id, "awaiting_payment", "payment_seen", { txid: r.txid, receivedZat: r.amountZat });
      continue;
    }
    const patch = { txid: r.txid, minedHeight: r.minedHeight, receivedZat: r.amountZat, paidAt: now() };
    if (order.status === "awaiting_payment") transition(order.id, "awaiting_payment", "paid", patch);
    else if (order.status === "payment_seen") transition(order.id, "payment_seen", "paid", patch);
  }

  // Release or fulfill every paid order (also picks up orders approved after payment, or after a restart).
  for (const o of ordersInStatus(["paid"])) {
    if (o.listingId) {
      if (o.sealedPayload) transition(o.id, "paid", "delivered", { releasedAt: now() });
      continue;
    }
    if (o.guardrail === "REQUIRE_HUMAN" && !o.approvedAt) continue;
    if (inFlight.has(o.id)) continue;
    inFlight.add(o.id);
    fulfillOrder(o.id)
      .catch((e) => log.error("fulfill crashed", { orderId: o.id, err: safeError(e) }))
      .finally(() => inFlight.delete(o.id));
  }

  // Settle purchases whose outcome was uncertain (read-only towards Bitrefill: never buys again).
  for (const o of ordersInStatus(["failed_uncertain"])) {
    if (!o.bitrefillInvoiceId || inFlight.has(o.id)) continue;
    if (now() - (lastReconcile.get(o.id) ?? 0) < RECONCILE_EVERY_MS) continue;
    lastReconcile.set(o.id, now());
    inFlight.add(o.id);
    reconcileOrder(o.id)
      .catch((e) => log.error("reconcile crashed", { orderId: o.id, err: safeError(e) }))
      .finally(() => inFlight.delete(o.id));
  }

  // Expire unpaid quotes. Orders already seen in the mempool are left to confirm.
  for (const o of ordersInStatus(["awaiting_payment", "awaiting_seller"])) {
    if (o.expiresAt < now() && !o.txid) transition(o.id, o.status as "awaiting_payment" | "awaiting_seller", "expired");
  }
}

const g = globalThis as unknown as { __zealedWatcher?: NodeJS.Timeout };

export function startWatcher() {
  if (g.__zealedWatcher) return;
  let running = false;
  g.__zealedWatcher = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await tick();
    } catch (e) {
      log.warn("watcher tick failed", { err: safeError(e) });
    } finally {
      running = false;
    }
  }, TICK_MS);
  log.info("payment watcher started", { tickMs: TICK_MS, backend: process.env.ZCASH_BACKEND ?? "fake" });
}
