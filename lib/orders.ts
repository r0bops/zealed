import { createHash } from "node:crypto";
import { eventMetadata } from "./chat-privacy";
import { evaluateGuardrails, limitsFromEnv } from "./guardrails";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db/client";
import type { Order } from "./db/schema";
import { assertTransition, type OrderStatus } from "./order-state";

const { orders, agentEvents, kv } = schema;

export function now() {
  return Date.now();
}

export function getOrder(id: string): Order | undefined {
  return db().select().from(orders).where(eq(orders.id, id)).get();
}

export function getOrderByMemo(memoTag: string): Order | undefined {
  return db().select().from(orders).where(eq(orders.memoTag, memoTag)).get();
}

export function insertOrder(row: typeof orders.$inferInsert): Order {
  db().insert(orders).values(row).run();
  return getOrder(row.id)!;
}

/**
 * Atomic compare-and-set on status. Returns true only for the single caller that won the transition,
 * which is how "buy at most once" is enforced.
 */
export function transition(
  id: string,
  from: OrderStatus,
  to: OrderStatus,
  patch: Partial<typeof orders.$inferInsert> = {},
): boolean {
  assertTransition(from, to);
  const res = db()
    .update(orders)
    .set({ ...patch, status: to, updatedAt: now() })
    .where(and(eq(orders.id, id), eq(orders.status, from)))
    .run();
  return res.changes === 1;
}

export function patchOrder(id: string, patch: Partial<typeof orders.$inferInsert>) {
  db().update(orders).set({ ...patch, updatedAt: now() }).where(eq(orders.id, id)).run();
}

export function ordersInStatus(statuses: OrderStatus[]): Order[] {
  return db().select().from(orders).where(inArray(orders.status, statuses)).all();
}

/** Outstanding reservations plus purchases claimed today, including legacy orders. */
export function agentSpentTodayCents(excludeOrderId = ""): number {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const row = db().$client.prepare(`SELECT
    (SELECT coalesce(sum(amount_cents), 0) FROM spend_reservations
      WHERE order_id != ? AND (charged_at >= ? OR order_id IN
        (SELECT id FROM orders WHERE status IN ('fulfilling','failed_uncertain')) OR (charged_at IS NULL AND order_id IN
        (SELECT id FROM orders WHERE status IN ('awaiting_payment','payment_seen','paid','fulfilling','failed_uncertain')))))
    + (SELECT coalesce(sum(price_usd_cents), 0) FROM orders
      WHERE id != ? AND source = 'agent' AND id NOT IN (SELECT order_id FROM spend_reservations)
      AND (status IN ('awaiting_payment','payment_seen','paid','fulfilling','failed_uncertain')
        OR (status = 'delivered' AND coalesce(paid_at,created_at) >= ?))) AS total`).get(excludeOrderId, start.getTime(), excludeOrderId, start.getTime()) as { total: number };
  return row.total;
}

export class ReservationError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/** Single SQLite write transaction covers proposal replay, budget reservation and order insertion. */
export function reserveOrder(row: typeof orders.$inferInsert, usedKey: string, approved: boolean): Order {
  return db().$client.transaction(() => {
    if (kvGet(usedKey)) throw new ReservationError(409, "This checkout was already used.");
    const decision = evaluateGuardrails({ priceCents: row.priceUsdCents, spentTodayCents: agentSpentTodayCents(), limits: limitsFromEnv() });
    if (decision.verdict === "BLOCK" || (decision.verdict === "REQUIRE_HUMAN" && !approved)) throw new ReservationError(403, "Spending limit or approval requirement prevents this order.");
    const order = insertOrder({ ...row, guardrail: decision.verdict, guardrailReason: decision.reason });
    db().$client.prepare("INSERT INTO spend_reservations(order_id,amount_cents) VALUES (?,?)").run(row.id, row.priceUsdCents);
    kvSet(usedKey, true);
    return order;
  }).immediate();
}

/** Re-check daily rollover and caps in the same transaction as the purchase claim. */
export function claimFulfillment(id: string, mode: string): boolean {
  return db().$client.transaction(() => {
    const order = getOrder(id);
    if (!order || order.status !== "paid") return false;
    const decision = evaluateGuardrails({ priceCents: order.priceUsdCents, spentTodayCents: agentSpentTodayCents(id), limits: limitsFromEnv() });
    if (decision.verdict === "BLOCK" || (decision.verdict === "REQUIRE_HUMAN" && !order.approvedAt)) return false;
    if (!transition(id, "paid", "fulfilling", { fulfillMode: mode })) return false;
    db().$client.prepare(`INSERT INTO spend_reservations(order_id,amount_cents,charged_at) VALUES (?,?,?)
      ON CONFLICT(order_id) DO UPDATE SET amount_cents=excluded.amount_cents,charged_at=excluded.charged_at`).run(id, order.priceUsdCents, now());
    return true;
  }).immediate();
}

export function recentOrders(limit = 20): Order[] {
  return db().select().from(orders).orderBy(desc(orders.createdAt)).limit(limit).all();
}

/** Public view of an order. The sealed payload is included only after release. */
export function publicOrder(o: Order) {
  const released = o.status === "delivered";
  return {
    id: o.id,
    type: o.type,
    source: o.source,
    productName: o.productName,
    packageValue: o.packageValue,
    buyerPubKey: o.buyerPubKey,
    priceUsdCents: o.priceUsdCents,
    amountZat: o.amountZat,
    payAddr: o.payAddr,
    memoTag: o.memoTag,
    status: o.status,
    guardrail: o.guardrail,
    guardrailReason: o.guardrailReason,
    approvedAt: o.approvedAt,
    needsApproval: o.guardrail === "REQUIRE_HUMAN" && !o.approvedAt,
    txid: o.txid,
    minedHeight: o.minedHeight,
    paidAt: o.paidAt,
    releasedAt: o.releasedAt,
    wipedAt: o.wipedAt,
    hadPhone: o.type === "topup",
    phoneWiped: o.type === "topup" ? o.sealedPhone === null && o.wipedAt !== null : null,
    bitrefillOrderId: o.bitrefillOrderId,
    failure: o.failure,
    expiresAt: o.expiresAt,
    createdAt: o.createdAt,
    sealedPayload: released ? o.sealedPayload : null,
  };
}

export function logAgentEvent(sessionId: string, kind: "user" | "assistant" | "tool_call" | "tool_result", name: string | null, payload: unknown) {
  db()
    .insert(agentEvents)
    .values({ sessionId: createHash("sha256").update(sessionId).digest("hex"), kind, name: ["search_catalog", "quote", "propose_order", "get_order_status", "guardrails", "checkout.order_created"].includes(name ?? "") ? name : null, payload: JSON.stringify(eventMetadata(payload)), createdAt: now() })
    .run();
}

export function kvGet<T>(key: string): T | undefined {
  const row = db().select().from(kv).where(eq(kv.key, key)).get();
  return row ? (JSON.parse(row.value) as T) : undefined;
}

export function kvSet(key: string, value: unknown) {
  const v = JSON.stringify(value);
  db()
    .insert(kv)
    .values({ key, value: v, updatedAt: now() })
    .onConflictDoUpdate({ target: kv.key, set: { value: v, updatedAt: now() } })
    .run();
}
