// Order lifecycle as a transition table. Illegal moves throw.
export const ORDER_STATUSES = [
  "awaiting_seller",
  "awaiting_payment",
  "payment_seen",
  "paid",
  "fulfilling",
  "delivered",
  "failed",
  "failed_uncertain", // Bitrefill outcome unknown: reconcile by hand, never auto-retry
  "expired",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  awaiting_seller: ["awaiting_payment", "expired", "failed"],
  awaiting_payment: ["payment_seen", "paid", "expired"],
  payment_seen: ["paid", "expired"],
  paid: ["fulfilling", "delivered"], // resold cards go straight to delivered on release
  fulfilling: ["delivered", "failed", "failed_uncertain"],
  delivered: [],
  failed: [],
  failed_uncertain: ["delivered", "failed"],
  expired: [],
};

export class IllegalTransitionError extends Error {
  constructor(readonly from: string, readonly to: string) {
    super(`order: illegal transition ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

/** States in which the sealed payload may be returned to the buyer. */
export const RELEASED_STATUSES: readonly OrderStatus[] = ["delivered"];
/** States in which the order is still waiting for money. */
export const OPEN_PAYMENT_STATUSES: readonly OrderStatus[] = ["awaiting_payment", "payment_seen"];
