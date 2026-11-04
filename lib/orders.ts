import { createHash } from "node:crypto";
import { eventMetadata } from "./chat-privacy";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
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

/** Agent spend today (UTC), counting every agent order that wasn't abandoned. */
export function agentSpentTodayCents(): number {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const row = db()
    .select({ total: sql<number>`coalesce(sum(${orders.priceUsdCents}), 0)` })
    .from(orders)
    .where(
      and(
        eq(orders.source, "agent"),
        gte(orders.createdAt, start.getTime()),
        inArray(orders.status, ["awaiting_payment", "payment_seen", "paid", "fulfilling", "delivered", "failed_uncertain"]),
      ),
    )
    .get();
  return Number(row?.total ?? 0);
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
