import { describe, expect, it } from "vitest";
import { kindOf, normalize, priceFor, priceToCents } from "./bitrefill";

// Shapes captured from the live catalog on 2026-11-04 (BTC-denominated account).
const airtelBundles = {
  id: "airtel-bundles-india",
  name: "Airtel Bundles India",
  currency: "INR",
  categories: ["bundles", "refill"],
  recipient_type: "phone_number",
  country_code: "IN",
  packages: [{ id: "airtel-bundles-india<&>199: ul calls + 2gb data", value: "199: ul calls + 2gb data", price: 2791, amount: 199 }],
};
const esimIndia = {
  id: "bitrefill-esim-india",
  name: "Bitrefill eSIM India",
  currency: "USD",
  categories: ["esim"],
  recipient_type: "mixed",
  country_code: "IN",
  packages: [{ id: "bitrefill-esim-india<&>1GB, 7 Days", value: "1GB, 7 Days", price: 4965, amount: 2.59 }],
};
const airtelNigeria = {
  id: "airtel-nigeria",
  currency: "NGN",
  categories: ["refill"],
  recipient_type: "phone_number",
  packages: [],
  range: { min: 50, max: 150000, step: 1, price_rate: 0.9607449137372666 },
};

describe("bitrefill pricing", () => {
  it("treats BTC-account prices as satoshis at BTC_USD_RATE", () => {
    process.env.BTC_USD_RATE = "70000";
    expect(priceToCents(2791, "BTC")).toBe(195); // ≈ $1.95, not $2,791
    expect(priceToCents(7010, "BTC")).toBe(491);
  });
  it("prices USD accounts directly and refuses unknown currencies", () => {
    expect(priceToCents(3.88, "USD")).toBe(388);
    expect(priceToCents(100, "EUR")).toBeNull();
    expect(priceToCents(undefined, "BTC")).toBeNull();
  });
  it("normalizes packages with package ids, face values and USD cents", () => {
    process.env.BTC_USD_RATE = "70000";
    const p = normalize(airtelBundles, "BTC")!;
    expect(p.kind).toBe("topup");
    expect(p.packages[0]).toMatchObject({ packageId: "airtel-bundles-india<&>199: ul calls + 2gb data", faceAmount: 199, priceCents: 195 });
    expect(priceFor(p, "199: ul calls + 2gb data")).toBe(195);
  });
  it("prices ranged products via price_rate", () => {
    process.env.BTC_USD_RATE = "70000";
    const p = normalize(airtelNigeria, "BTC")!;
    expect(priceFor(p, "1000")).toBe(Math.round((Math.round(1000 * 0.9607449137372666) * 70000) / 1_000_000));
    expect(priceFor(p, "10")).toBeNull(); // below range min
  });
});

describe("bitrefill product kinds", () => {
  it("classifies by categories and recipient_type", () => {
    expect(kindOf(airtelBundles)).toBe("topup");
    expect(kindOf(esimIndia)).toBe("esim");
    expect(kindOf({ id: "flipkart-india", categories: ["shopping"], recipient_type: "none" })).toBe("giftcard");
    expect(kindOf({ id: "tata-play-india", categories: ["dth"], recipient_type: "account" })).toBeNull();
  });
});
