import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "./db/client";
import { eventMetadata } from "./event-metadata";
import { redact, safeError } from "./log";
import { accountCurrency, getProduct, isSimulated, priceFor, searchProducts, type CatalogProduct } from "./bitrefill";
import { agentSpentTodayCents, claimFulfillment, getOrder, insertOrder, kvGet, logAgentEvent, reserveOrder, reserveFulfillmentCost, recoverStaleFulfillments } from "./orders";
import { fakeBackend, simulatePayment, zcash, type Receipt } from "./zcash";
import { tick } from "../worker/watcher";
import { fulfillOrder, reconcileOrder } from "./fulfill";
import * as bitrefill from "./bitrefill";
import { generateKeyPair, open } from "./sodium";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "zealed-safety-"));
  vi.stubEnv("DATABASE_PATH", join(dir, "test.db"));
  vi.stubEnv("BITREFILL_MODE", "fake");
  vi.stubEnv("BITREFILL_API_KEY", "");
  vi.stubEnv("ZCASH_BACKEND", "fake");
  vi.stubEnv("ZCASH_NETWORK", "testnet");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("AGENT_AUTO_LIMIT_CENTS", "500");
  vi.stubEnv("AGENT_APPROVAL_LIMIT_CENTS", "2000");
  vi.stubEnv("AGENT_DAILY_LIMIT_CENTS", "2500");
});
afterEach(() => {
  const g = globalThis as unknown as { __zealedDb?: ReturnType<typeof db> };
  g.__zealedDb?.$client.close();
  delete g.__zealedDb;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

function row(id: string, priceUsdCents = 400) {
  return { id, type: "giftcard" as const, source: "agent" as const, productName: "Fixture", buyerPubKey: "fixture",
    priceUsdCents, amountZat: 100, payAddr: "fixture", memoTag: id, status: "awaiting_payment", guardrail: "ALLOW",
    expiresAt: Date.now() + 60_000, createdAt: Date.now(), updatedAt: Date.now() };
}

describe("privacy boundaries", () => {
  it("does not persist chat, tool arguments, signed proposals or error text", () => {
    const secret = "SYNTHETIC_SECRET";
    logAgentEvent(secret, "tool_result", secret, { text: secret, productId: secret, proposalToken: secret, error: secret, priceCents: 100, approved: true });
    const records = db().$client.prepare("SELECT * FROM agent_events").all();
    expect(JSON.stringify(records)).not.toContain(secret);
    expect(eventMetadata({ status: secret, count: Infinity })).toEqual({});
    expect(JSON.stringify(redact({ err: safeError(Object.assign(new Error(secret), { name: secret })) }))).not.toContain(secret);
  });
  it("strips response messages and unrecognized error codes", async () => {
    vi.stubEnv("BITREFILL_MODE", "live");
    vi.stubEnv("BITREFILL_API_KEY", "fixture-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "SYNTHETIC_SECRET", error_code: "SYNTHETIC_SECRET" }), { status: 400 })));
    await expect(getProduct("fixture")).rejects.toMatchObject({ message: "Bitrefill request rejected (400)", errorCode: null, definite: true });
  });
});

describe("catalog separation and quote validation", () => {
  it("fetches live data after populating simulated cache", async () => {
    await searchProducts("airtel");
    vi.stubEnv("BITREFILL_MODE", "live");
    vi.stubEnv("BITREFILL_API_KEY", "fixture-key");
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify({ data: url.includes("balance") ? { currency: "USD" } : [] })));
    vi.stubGlobal("fetch", fetcher);
    expect(isSimulated()).toBe(false);
    expect(await searchProducts("airtel")).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not reuse currency across accounts", async () => {
    vi.stubEnv("BITREFILL_API_KEY", "account-one");
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: { currency: "USD" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { currency: "BTC" } })));
    vi.stubGlobal("fetch", fetcher);
    expect(await accountCurrency()).toBe("USD");
    vi.stubEnv("BITREFILL_API_KEY", "account-two");
    expect(await accountCurrency()).toBe("BTC");
  });
  it("rejects unavailable stock, invalid increments and arbitrary test values", () => {
    const p: CatalogProduct = { id: "fixture", name: "Fixture", kind: "giftcard", currency: "USD", accountCurrency: "USD", country: "IN", inStock: true, packages: [], range: { min: 10, max: 100, step: 10, priceRate: 0.125 } };
    expect(priceFor(p, "11")).toBeNull();
    expect(priceFor(p, "20")).toBe(250);
    expect(priceFor({ ...p, inStock: false }, "20")).toBeNull();
    expect(priceFor({ ...p, id: "test-gift-card-code" }, "garbage")).toBeNull();
  });
});

describe("atomic spending reservations", () => {
  it("counts live price drift and rejects drift beyond the daily cap", () => {
    reserveOrder({ ...row("drift", 400), status: "paid" }, "drift", false);
    claimFulfillment("drift", "live");
    expect(reserveFulfillmentCost("drift", 420)).toBe(true);
    expect(agentSpentTodayCents()).toBe(420);
    vi.stubEnv("AGENT_DAILY_LIMIT_CENTS", "419");
    expect(reserveFulfillmentCost("drift", 421)).toBe(false);
    expect(agentSpentTodayCents()).toBe(420);
    expect(getOrder("drift")?.priceUsdCents).toBe(400);
  });
  it("never lets price drift exceed the sponsor campaign budget", () => {
    reserveOrder({ ...row("sponsored", 400), status: "paid", approvedAt: Date.now() }, "sponsored", true);
    claimFulfillment("sponsored", "live");
    db().$client.prepare("INSERT INTO campaigns (id,title,budget_cents,country,product_ids,invite_hash,expires_at,attempts,created_at) VALUES (?,?,?,?,?,?,?,0,?)")
      .run("campaign", "Test", 400, "IN", "[]", "hash", Date.now() + 60_000, Date.now());
    db().$client.prepare("INSERT INTO reward_claims(id,campaign_id,secret_hash,buyer_key,state,order_id,updated_at) VALUES (?,?,?,?,?,?,?)")
      .run("claim", "campaign", "hash", "key", "ordered", "sponsored", Date.now());
    expect(reserveFulfillmentCost("sponsored", 401)).toBe(false);
    expect(reserveFulfillmentCost("sponsored", 399)).toBe(true);
  });
  it("quarantines abandoned purchases without permitting a second buy", () => {
    for (const id of ["abandoned", "active", "recent"]) {
      reserveOrder({ ...row(id), status: "paid", type: "topup", sealedPhone: "ciphertext" }, id, false);
      claimFulfillment(id, "simulate");
    }
    db().$client.prepare("UPDATE orders SET updated_at=? WHERE id != 'recent'").run(Date.now() - 11 * 60_000);
    expect(recoverStaleFulfillments(new Set(["active"]))).toBe(1);
    expect(getOrder("abandoned")).toMatchObject({ status: "failed_uncertain", sealedPhone: null });
    expect(claimFulfillment("abandoned", "live")).toBe(false);
    expect(getOrder("active")?.status).toBe("fulfilling");
    expect(getOrder("recent")?.status).toBe("fulfilling");
    expect(agentSpentTodayCents()).toBe(1200);
  });
  it("counts yesterday's order paid today", () => {
    insertOrder({ ...row("legacy", 2000), createdAt: Date.now() - 86_400_000, status: "delivered", paidAt: Date.now() });
    expect(agentSpentTodayCents()).toBe(2000);
  });
  it("reserves budget and rejects replay and excess without partial writes", () => {
    reserveOrder(row("one", 1500), "proposal-one", true);
    expect(() => reserveOrder(row("replay", 100), "proposal-one", true)).toThrow("already used");
    expect(() => reserveOrder(row("two", 1500), "proposal-two", true)).toThrow("Spending limit");
    expect(getOrder("two")).toBeUndefined();
    expect(kvGet("proposal-two")).toBeUndefined();
    expect(agentSpentTodayCents()).toBe(1500);
  });
  it("requires human approval and claims only once", () => {
    expect(() => reserveOrder(row("approval", 1000), "approval", false)).toThrow();
    reserveOrder({ ...row("claim"), status: "paid" }, "claim", false);
    expect(claimFulfillment("claim", "simulate")).toBe(true);
    expect(claimFulfillment("claim", "simulate")).toBe(false);
    expect(agentSpentTodayCents()).toBe(400);
  });
  it("rechecks changed limits before purchase", () => {
    reserveOrder({ ...row("limited"), status: "paid" }, "limited", false);
    vi.stubEnv("AGENT_DAILY_LIMIT_CENTS", "300");
    expect(claimFulfillment("limited", "live")).toBe(false);
    expect(getOrder("limited")?.status).toBe("paid");
  });
  it("holds uncertain purchases against the budget across midnight", () => {
    reserveOrder({ ...row("uncertain"), status: "paid" }, "uncertain", false);
    claimFulfillment("uncertain", "simulate");
    db().$client.prepare("UPDATE spend_reservations SET charged_at = ? WHERE order_id = ?").run(Date.now() - 86_400_000, "uncertain");
    db().$client.prepare("UPDATE orders SET status = 'failed_uncertain' WHERE id = ?").run("uncertain");
    expect(agentSpentTodayCents()).toBe(400);
    db().$client.prepare("UPDATE orders SET status = 'delivered' WHERE id = ?").run("uncertain");
    expect(agentSpentTodayCents()).toBe(0);
  });
});

it("fails closed for production simulation and unimplemented backends", async () => {
  vi.stubEnv("NODE_ENV", "production");
  await expect(zcash()).rejects.toThrow("disabled");
  expect(() => simulatePayment("fixture", 10)).toThrow("disabled");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ZCASH_BACKEND", "zingo");
  await expect(zcash()).rejects.toThrow("not configured");
});

it("only releases a receipt with the exact recipient, pool, amount and cart memo", async () => {
  const hash = "abcdefghijklmnopqrstuv";
  insertOrder({ ...row("payment"), listingId: "fixture", memoTag: "ZLD-ABCDEFGH23", cartHash: hash, sealedPayload: "fixture-ciphertext" });
  const good: Receipt = { txid: "fixture-tx", recipient: "fixture", memo: `ZLD-ABCDEFGH23 cart:${hash}`, amountZat: 100, pool: "simulated", confirmations: 1, minedHeight: 100 };
  const poll = vi.spyOn(fakeBackend, "poll");
  for (const bad of [{ ...good, recipient: "other" }, { ...good, pool: undefined }, { ...good, amountZat: NaN }, { ...good, memo: "ZLD-ABCDEFGH23" }]) {
    poll.mockResolvedValue([bad]);
    await tick();
    expect(getOrder("payment")?.status).toBe("awaiting_payment");
  }
  poll.mockResolvedValue([good]);
  await tick();
  expect(getOrder("payment")?.status).toBe("delivered");
});

it("fulfills a simulated card once and decrypts only with the buyer key", async () => {
  const buyer = await generateKeyPair();
  const fetcher = vi.fn(() => { throw new Error("Network must not be used"); });
  vi.stubGlobal("fetch", fetcher);
  reserveOrder({ ...row("delivery"), status: "paid", productId: "fixture", packageValue: "10", buyerPubKey: buyer.publicKey }, "delivery", false);
  expect((await fulfillOrder("delivery")).status).toBe("delivered");
  const delivered = getOrder("delivery")!;
  expect(JSON.parse(await open(delivered.sealedPayload!, buyer.publicKey, buyer.secretKey)).kind).toBe("giftcard");
  expect((await fulfillOrder("delivery")).status).toBe("skipped");
  expect(fetcher).not.toHaveBeenCalled();
});

it("reconciles an interrupted purchase with its saved invoice, without buying again", async () => {
  const buyer = await generateKeyPair();
  reserveOrder({ ...row("restart"), status: "paid", buyerPubKey: buyer.publicKey }, "restart", false);
  claimFulfillment("restart", "simulate");
  db().$client.prepare("UPDATE orders SET bitrefill_invoice_id=?, updated_at=? WHERE id=?")
    .run("SIM-giftcard-restart", Date.now() - 11 * 60_000, "restart");
  const purchase = vi.spyOn(bitrefill, "createInvoice");
  expect(recoverStaleFulfillments(new Set())).toBe(1);
  expect((await reconcileOrder("restart")).status).toBe("delivered");
  expect(purchase).not.toHaveBeenCalled();
  expect(JSON.parse(await open(getOrder("restart")!.sealedPayload!, buyer.publicKey, buyer.secretKey)).kind).toBe("giftcard");
});

it.each(["giftcard", "esim"] as const)("does not release an empty %s redemption as delivered", async (type) => {
  const buyer = await generateKeyPair();
  reserveOrder({ ...row("empty"), type, status: "paid", productId: "fixture", buyerPubKey: buyer.publicKey }, "empty", false);
  vi.spyOn(bitrefill, "getOrder").mockResolvedValue({ id: "fixture", status: "delivered" });
  expect((await fulfillOrder("empty")).status).toBe("failed_uncertain");
  expect(getOrder("empty")?.sealedPayload).toBeNull();
});

it("wipes sealed phone data even when decryption fails before the purchase call", async () => {
  const key = await generateKeyPair();
  vi.stubEnv("FULFILL_SECRET_KEY", key.backup);
  reserveOrder({ ...row("bad-phone"), type: "topup", status: "paid", sealedPhone: "invalid-ciphertext", buyerPubKey: key.publicKey }, "bad-phone", false);
  await fulfillOrder("bad-phone");
  expect(getOrder("bad-phone")).toMatchObject({ sealedPhone: null, status: "failed_uncertain" });
  expect(getOrder("bad-phone")?.wipedAt).toBeTypeOf("number");
});
