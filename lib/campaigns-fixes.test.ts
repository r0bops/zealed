import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { db } from "./db/client";
import { acquireClaim, beginSelection, campaign, claim, createCampaign, finishSelection, type Choice } from "./campaigns";
import { approveReward } from "./sponsor-order";
import { selectReward } from "./reward-agent";
import { priceDriftOk } from "./guardrails";
import { generateKeyPair } from "./sodium";
import type { CatalogProduct } from "./bitrefill";

const { generateText, productOverride } = vi.hoisted(() => ({ generateText: vi.fn(), productOverride: new Map<string, unknown>() }));
vi.mock("ai", () => ({ generateText, Output: { object: (value: unknown) => value } }));
vi.mock("./bitrefill", async (importOriginal) => {
  const real = await importOriginal<typeof import("./bitrefill")>();
  return { ...real, getProduct: async (id: string, fresh?: boolean) => (productOverride.has(id) ? productOverride.get(id) : real.getProduct(id, fresh)) };
});

let dir: string;
const secret = () => randomBytes(32).toString("base64url");
const esim: Choice = { productId: "bitrefill-esim-india", productName: "eSIM", kind: "esim", packageValue: "1GB, 7 Days", priceCents: 348, reason: "A week of data." };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "zealed-campaign-fixes-"));
  vi.stubEnv("DATABASE_PATH", join(dir, "test.db")); vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("BITREFILL_API_KEY", ""); vi.stubEnv("BITREFILL_MODE", "fake"); vi.stubEnv("BITREFILL_PURCHASES", "simulate");
  vi.stubEnv("ZCASH_BACKEND", "fake"); vi.stubEnv("ZCASH_NETWORK", "testnet");
  vi.stubEnv("AGENT_AUTO_LIMIT_CENTS", "500"); vi.stubEnv("AGENT_APPROVAL_LIMIT_CENTS", "2000"); vi.stubEnv("AGENT_DAILY_LIMIT_CENTS", "2500");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only-not-real");
  generateText.mockReset(); generateText.mockResolvedValue({ output: { index: 0, reason: "Fits." } });
  productOverride.clear();
});
afterEach(() => {
  const g = globalThis as unknown as { __zealedDb?: ReturnType<typeof db> };
  g.__zealedDb?.$client.close(); delete g.__zealedDb;
  vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true });
});

async function proposedWith(choice: Choice, budgetCents = 500) {
  const c = createCampaign({ title: "Fix test", budgetCents, country: "IN", productIds: [choice.productId] });
  const key = await generateKeyPair(), token = secret();
  const p = acquireClaim(c.id, c.token, 1, key.publicKey, token);
  beginSelection(p.id, token); finishSelection(p.id, choice, 1);
  return { c, token, p };
}

describe("A: price drift since the selection", () => {
  it("allows at most 5% above the approved price and never above the hard cap", () => {
    expect(priceDriftOk(348, 348, 2000)).toBe(true);
    expect(priceDriftOk(357, 340, 2000)).toBe(true); // 340 * 1.05 = 357
    expect(priceDriftOk(358, 340, 2000)).toBe(false);
    expect(priceDriftOk(348, 345, 346)).toBe(false); // within 5% but over the cap
    expect(priceDriftOk(300, 348, 2000)).toBe(true); // cheaper is fine
    expect(priceDriftOk(null, 348, 2000)).toBe(false);
  });
  it("approves when the live price ticked up slightly, keeping the selected price", async () => {
    const { c } = await proposedWith({ ...esim, priceCents: 340 }); // catalog now says 348 (+2.4%)
    const order = await approveReward(c.id);
    expect(order.priceUsdCents).toBe(340);
  });
  it("refuses when the price moved more than 5% or past the campaign budget", async () => {
    const tooFar = await proposedWith({ ...esim, priceCents: 320 }); // 348 > 336
    await expect(approveReward(tooFar.c.id)).rejects.toThrow("price changed");
    const overBudget = await proposedWith({ ...esim, priceCents: 345 }, 346); // 348 > budget 346
    await expect(approveReward(overBudget.c.id)).rejects.toThrow("price changed");
  });
});

describe("B: purpose filter runs before the 40-choice cap", () => {
  it("still offers the eSIM when a gift card has more than 40 in-budget denominations", async () => {
    const giant: CatalogProduct = {
      id: "giant-giftcard", name: "Giant", kind: "giftcard", country: "IN", currency: "INR", inStock: true, accountCurrency: "USD",
      packages: Array.from({ length: 50 }, (_, i) => ({ value: String(10 + i), faceAmount: 10 + i, priceCents: 100 + i })),
    };
    productOverride.set("giant-giftcard", giant);
    const c = createCampaign({ title: "Many cards", budgetCents: 500, country: "IN", productIds: ["giant-giftcard", esim.productId] });
    const picked = await selectReward(campaign(c.id), { purpose: "connectivity", days: 7, esimCompatible: true });
    expect(picked.kind).toBe("esim");
    const sent = JSON.parse(generateText.mock.calls[0][0].prompt) as { choices: { kind: string }[] };
    expect(sent.choices.every((x) => x.kind === "esim")).toBe(true);
  });
});

describe("C: purchase-mode label", () => {
  it("treats an unset ZCASH_BACKEND as the simulated backend, like zcash() does", async () => {
    vi.stubEnv("CAMPAIGN_ADMIN_TOKEN", "x".repeat(40));
    vi.stubEnv("ZCASH_BACKEND", undefined);
    vi.stubEnv("BITREFILL_MODE", "live"); vi.stubEnv("BITREFILL_API_KEY", "fixture"); vi.stubEnv("BITREFILL_PURCHASES", "live");
    const { GET } = await import("../app/api/campaigns/route");
    const res = await GET(new Request("http://test/api/campaigns", { headers: { authorization: `Bearer ${"x".repeat(40)}` } }));
    expect((await res.json()).purchaseMode).toBe("simulate");
  });
});

describe("D: re-approval after an unpaid sponsored order expires", () => {
  it("binds a fresh order only when the previous one expired without a payment", async () => {
    const { c, token, p } = await proposedWith(esim);
    const first = await approveReward(c.id);
    expect((await approveReward(c.id)).id).toBe(first.id); // still open: same order

    db().$client.prepare("UPDATE orders SET status='expired' WHERE id=?").run(first.id);
    const second = await approveReward(c.id);
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe("awaiting_payment");
    expect(claim(p.id, token).order_id).toBe(second.id);
    expect((await approveReward(c.id)).id).toBe(second.id); // no third order while the second is open

    // An order that saw a payment stays bound even if it is marked expired: never buy twice.
    db().$client.prepare("UPDATE orders SET status='expired', txid='seen-in-mempool' WHERE id=?").run(second.id);
    expect((await approveReward(c.id)).id).toBe(second.id);
  });
});
