import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "./db/client";
import { eventMetadata, looksSensitive, validateChatMessages } from "./chat-privacy";
import { redact, safeError } from "./log";
import { accountCurrency, getProduct, isSimulated, priceFor, searchProducts, type CatalogProduct } from "./bitrefill";
import { agentSpentTodayCents, claimFulfillment, getOrder, insertOrder, kvGet, logAgentEvent, reserveOrder } from "./orders";
import { fakeBackend, simulatePayment, zcash, type Receipt } from "./zcash";
import { tick } from "../worker/watcher";
import { fulfillOrder } from "./fulfill";
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
  it("rejects sensitive text in earlier messages and malformed/system input", () => {
    const user = (text: string) => ({ id: "u", role: "user", parts: [{ type: "text", text }] });
    expect(() => validateChatMessages([user("my phone number is +1 (202) 555-0199"), user("hello")])).toThrow();
    expect(() => validateChatMessages([user("my seed phrase is synthetic words here")])).toThrow();
    expect(() => validateChatMessages([{ ...user("hi"), role: "system" }])).toThrow();
    expect(() => validateChatMessages([{ ...user("hi"), parts: null }])).toThrow();
    expect(validateChatMessages([user("Find a 500 rupee gift card")])).toHaveLength(1);
    expect(looksSensitive("ABCD-EFGH-1234")).toBe(true);
  });
  it("preserves approval continuations and provider signatures without retaining them", () => {
    const messages = [{ id: "a1", role: "assistant", parts: [{ type: "tool-propose_order", state: "approval-responded",
      toolCallId: "call-1", input: { productId: "flipkart-india", packageValue: "500" },
      approval: { id: "approval-1", approved: true, signature: "YWJj+/==", reason: "Buyer approved in the app" } }] }];
    expect(validateChatMessages(messages)).toEqual(messages);
    expect(eventMetadata(messages[0].parts[0])).toEqual({});
  });
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

it("wipes sealed phone data even when decryption fails before the purchase call", async () => {
  const key = await generateKeyPair();
  vi.stubEnv("FULFILL_SECRET_KEY", key.backup);
  reserveOrder({ ...row("bad-phone"), type: "topup", status: "paid", sealedPhone: "invalid-ciphertext", buyerPubKey: key.publicKey }, "bad-phone", false);
  await fulfillOrder("bad-phone");
  expect(getOrder("bad-phone")).toMatchObject({ sealedPhone: null, status: "failed_uncertain" });
  expect(getOrder("bad-phone")?.wipedAt).toBeTypeOf("number");
});
