import { describe, expect, it } from "vitest";
import { FINAL_INVOICE_STATUSES, FINAL_ORDER_STATUSES } from "./bitrefill";

describe("Bitrefill completion states", () => {
  it("treats a delivered invoice (all_delivered) as final", () => {
    // Observed live on 2026-11-04 for a delivered test-gift-card-code purchase.
    expect(FINAL_INVOICE_STATUSES).toContain("all_delivered");
    expect(FINAL_ORDER_STATUSES).toEqual(["delivered", "failed", "refunded"]);
  });
});
