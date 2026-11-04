import { describe, expect, it } from "vitest";
import { evaluateGuardrails } from "./guardrails";
import { centsToZat, zatToZec, zecToZat } from "./money";
import { assertTransition, canTransition } from "./order-state";
import { buildZip321, decodeBase64UrlNoPad, extractMemoTag, newMemoTag } from "./zip321";

const limits = { autoLimitCents: 500, approvalLimitCents: 2000, dailyLimitCents: 2500 };

describe("guardrails", () => {
  it("allows small orders", () => {
    expect(evaluateGuardrails({ priceCents: 120, spentTodayCents: 0, limits }).verdict).toBe("ALLOW");
  });
  it("requires approval between auto and hard cap", () => {
    expect(evaluateGuardrails({ priceCents: 1000, spentTodayCents: 0, limits }).verdict).toBe("REQUIRE_HUMAN");
  });
  it("blocks above the hard cap", () => {
    expect(evaluateGuardrails({ priceCents: 2001, spentTodayCents: 0, limits }).verdict).toBe("BLOCK");
  });
  it("blocks when the daily cap would be exceeded", () => {
    expect(evaluateGuardrails({ priceCents: 400, spentTodayCents: 2200, limits }).verdict).toBe("BLOCK");
  });
  it("blocks invalid prices", () => {
    expect(evaluateGuardrails({ priceCents: 0, spentTodayCents: 0, limits }).verdict).toBe("BLOCK");
    expect(evaluateGuardrails({ priceCents: 1.5, spentTodayCents: 0, limits }).verdict).toBe("BLOCK");
  });
});

describe("money", () => {
  it("converts cents to zatoshis, rounding up", () => {
    expect(centsToZat(3000, 30)).toBe(100_000_000n); // $30 at $30/ZEC = 1 ZEC
    expect(centsToZat(1, 30)).toBe(33_334n); // never under-charge
  });
  it("round-trips decimal ZEC strings", () => {
    expect(zatToZec(123_456_789n)).toBe("1.23456789");
    expect(zatToZec(100_000_000n)).toBe("1");
    expect(zatToZec(1_000n)).toBe("0.00001");
    expect(zecToZat("0.00001")).toBe(1_000n);
    expect(() => zecToZat("0.123456789")).toThrow();
  });
});

describe("order state machine", () => {
  it("permits the bitrefill happy path", () => {
    for (const [a, b] of [
      ["awaiting_payment", "payment_seen"],
      ["payment_seen", "paid"],
      ["paid", "fulfilling"],
      ["fulfilling", "delivered"],
    ] as const)
      expect(canTransition(a, b)).toBe(true);
  });
  it("rejects skipping payment or moving backwards", () => {
    expect(() => assertTransition("awaiting_payment", "delivered")).toThrow();
    expect(() => assertTransition("delivered", "fulfilling")).toThrow();
    expect(() => assertTransition("fulfilling", "paid")).toThrow();
  });
});

describe("zip321", () => {
  it("builds a payment URI with a base64url memo", () => {
    const tag = newMemoTag();
    const uri = buildZip321("utest1example", 1_000n, tag);
    expect(uri).toMatch(/^zcash:utest1example\?amount=0\.00001&memo=[A-Za-z0-9_-]+$/);
    const memo = decodeBase64UrlNoPad(uri.split("memo=")[1]);
    expect(extractMemoTag(memo)).toBe(tag);
  });
  it("finds memo tags inside longer memos", () => {
    expect(extractMemoTag("order ZLD-ABCDEFGH23 thanks")).toBe("ZLD-ABCDEFGH23");
    expect(extractMemoTag("hello")).toBeNull();
  });
});
