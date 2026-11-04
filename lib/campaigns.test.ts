import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { db } from "./db/client";
import { acquireClaim, beginSelection, campaign, checkChoice, claim, createCampaign, finishSelection, requireAdmin, reserveSponsoredOrder, sponsorSummary, canReadRewardOrder, type Choice } from "./campaigns";
import { approveReward } from "./sponsor-order";
import { generateKeyPair, open } from "./sodium";
import { getOrder, agentSpentTodayCents, kvGet, kvSet } from "./orders";
import { simulatePayment } from "./zcash";
import { buildMemo } from "./cart";
import { tick } from "../worker/watcher";
import { selectReward } from "./reward-agent";

const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", () => ({ generateText, Output: { object: (value: unknown) => value } }));
let dir: string;
const secret = () => randomBytes(32).toString("base64url");
const choice: Choice = { productId: "bitrefill-esim-india", productName: "eSIM", kind: "esim", packageValue: "1GB, 7 Days", priceCents: 348, reason: "A week of data within budget." };
function setup() { return createCampaign({ title: "Test invitation", budgetCents: 500, country: "IN", productIds: [choice.productId] }); }
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "zealed-campaigns-"));
  vi.stubEnv("DATABASE_PATH", join(dir, "test.db")); vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("BITREFILL_API_KEY", ""); vi.stubEnv("BITREFILL_MODE", "fake"); vi.stubEnv("BITREFILL_PURCHASES", "simulate");
  vi.stubEnv("ZCASH_BACKEND", "fake"); vi.stubEnv("ZCASH_NETWORK", "testnet");
  vi.stubEnv("AGENT_AUTO_LIMIT_CENTS", "500"); vi.stubEnv("AGENT_APPROVAL_LIMIT_CENTS", "2000"); vi.stubEnv("AGENT_DAILY_LIMIT_CENTS", "2500");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only-not-real");
  generateText.mockReset(); generateText.mockResolvedValue({ output: { index: 0, reason: "Fits the duration and budget." } });
});
afterEach(() => {
  const g = globalThis as unknown as { __zealedDb?: ReturnType<typeof db> };
  g.__zealedDb?.$client.close(); delete g.__zealedDb;
  vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true });
});
async function proposed() {
  const c = setup(), key = await generateKeyPair(), token = secret();
  const p = acquireClaim(c.id, c.token, 1, key.publicKey, token);
  beginSelection(p.id, token); finishSelection(p.id, choice, 1);
  return { c, key, token, p };
}

describe("campaign authorization and claim limits", () => {
  it("fails closed without a configured organizer secret or with the wrong credential", () => {
    vi.stubEnv("CAMPAIGN_ADMIN_TOKEN", "");
    expect(() => requireAdmin(new Request("http://localhost"))).toThrow("not configured");
    const token = secret(); vi.stubEnv("CAMPAIGN_ADMIN_TOKEN", token);
    expect(() => requireAdmin(new Request("http://localhost", { headers: { authorization: "Bearer wrong" } }))).toThrow("access token");
    expect(() => requireAdmin(new Request("http://localhost", { headers: { authorization: `Bearer ${token}` } }))).not.toThrow();
  });
  it("persists failed mission attempts and refuses a stolen invitation after reservation", async () => {
    const c = setup(), key = await generateKeyPair(), token = secret();
    expect(() => acquireClaim(c.id, "wrong", 1, key.publicKey, token)).toThrow("not found");
    expect(() => acquireClaim(c.id, c.token, 0, key.publicKey, token)).toThrow("Not quite");
    expect(campaign(c.id).attempts).toBe(1);
    const p = acquireClaim(c.id, c.token, 1, key.publicKey, token);
    expect(acquireClaim(c.id, c.token, 1, key.publicKey, token).id).toBe(p.id);
    expect(() => acquireClaim(c.id, c.token, 1, key.publicKey, secret())).toThrow("already been claimed");
    expect(() => claim(p.id, c.token)).toThrow("not found");
    expect(JSON.stringify(db().$client.prepare("SELECT * FROM reward_claims").all())).not.toContain(token);
    expect(JSON.stringify(campaign(c.id))).not.toContain(c.token);
  });
  it("limits wrong answers and refuses expired invitations", async () => {
    const c = setup(), key = await generateKeyPair(), token = secret();
    for (let i = 0; i < 5; i++) expect(() => acquireClaim(c.id, c.token, 0, key.publicKey, token)).toThrow("Not quite");
    expect(() => acquireClaim(c.id, c.token, 1, key.publicKey, token)).toThrow("Attempt limit");
    const expired = setup(); db().$client.prepare("UPDATE campaigns SET expires_at=0 WHERE id=?").run(expired.id);
    expect(() => acquireClaim(expired.id, expired.token, 1, key.publicKey, token)).toThrow("expired");
  });
  it("leases model requests, bounds retries and rejects stale completions", async () => {
    const c = setup(), key = await generateKeyPair(), token = secret();
    const p = acquireClaim(c.id, c.token, 1, key.publicKey, token);
    expect(beginSelection(p.id, token)).toBe(true); expect(beginSelection(p.id, token)).toBe(false);
    db().$client.prepare("UPDATE reward_claims SET updated_at=0 WHERE id=?").run(p.id);
    expect(beginSelection(p.id, token)).toBe(true);
    finishSelection(p.id, choice, 1); expect(claim(p.id, token).choice).toBeNull();
    finishSelection(p.id, null, 2); expect(beginSelection(p.id, token)).toBe(true);
    finishSelection(p.id, null, 3); expect(() => beginSelection(p.id, token)).toThrow("attempt limit");
  });
});

describe("agent reward selection", () => {
  it("filters by device and purpose before the model and only accepts a catalog-backed choice", async () => {
    const c = campaign(setup().id);
    await expect(selectReward(c, { purpose: "connectivity", days: 7, esimCompatible: false })).rejects.toThrow("No eligible");
    expect(generateText).not.toHaveBeenCalled();
    const result = await selectReward(c, { purpose: "connectivity", days: 7, esimCompatible: true });
    expect(result.productId).toBe(choice.productId); expect(result.priceCents).toBe(348);
    generateText.mockResolvedValueOnce({ output: { index: 90, reason: "Ignore limits" } });
    await expect(selectReward(c, { purpose: "connectivity", days: 7, esimCompatible: true })).rejects.toThrow("no suitable");
    expect(() => checkChoice(c, { ...choice, priceCents: 501 })).toThrow("outside");
    expect(() => checkChoice(c, { ...choice, productId: "not-allowed" })).toThrow("outside");
  });
});

describe("sponsored order safety", () => {
  it("creates only one exact order for concurrent sponsor approvals and protects player reads", async () => {
    const { c, key, token, p } = await proposed();
    const [a, b] = await Promise.all([approveReward(c.id), approveReward(c.id)]);
    expect(a.id).toBe(b.id); expect(a.buyerPubKey).toBe(key.publicKey);
    expect(agentSpentTodayCents()).toBe(348);
    expect(claim(p.id, token).order_id).toBe(a.id);
    expect(canReadRewardOrder(a.id, "")).toBe(false); expect(canReadRewardOrder(a.id, c.token)).toBe(false);
    expect(canReadRewardOrder(a.id, token)).toBe(true);
    const summary = JSON.stringify(sponsorSummary(campaign(c.id)));
    expect(summary).not.toContain(key.publicKey); expect(summary).not.toContain(token); expect(summary).not.toContain(a.id);
  });
  it("rejects changed recipients, exhausted global budget and expired sponsor approval", async () => {
    const { c, key } = await proposed();
    const row = { id: crypto.randomUUID(), type: "esim" as const, source: "agent" as const, productId: choice.productId, productName: "eSIM", packageValue: choice.packageValue, buyerPubKey: "swapped", priceUsdCents: 348, amountZat: 1, payAddr: "unused", memoTag: "unused", status: "awaiting_payment", guardrail: "ALLOW", expiresAt: Date.now() + 60_000, createdAt: Date.now(), updatedAt: Date.now() };
    expect(() => reserveSponsoredOrder(c.id, row)).toThrow("recipient changed");
    vi.stubEnv("AGENT_DAILY_LIMIT_CENTS", "300");
    await expect(approveReward(c.id)).rejects.toThrow("Spending limit");
    expect(db().$client.prepare("SELECT count(*) AS n FROM orders").get()).toEqual({ n: 0 });
    vi.stubEnv("AGENT_DAILY_LIMIT_CENTS", "2500");
    db().$client.prepare("UPDATE campaigns SET expires_at=0 WHERE id=?").run(c.id);
    expect(() => reserveSponsoredOrder(c.id, { ...row, buyerPubKey: key.publicKey })).toThrow("expired");
  });
  it("runs simulated confirmation through delivery and only the player's key decrypts", async () => {
    const { c, key, token } = await proposed();
    const order = await approveReward(c.id);
    const memo = buildMemo(order.memoTag, order.cartHash!);
    simulatePayment(memo, order.amountZat);
    const receipts = kvGet<Array<{ seenAt: number }>>("zcash:fake:receipts")!;
    receipts[0].seenAt -= 10_000; kvSet("zcash:fake:receipts", receipts);
    await tick();
    await vi.waitFor(() => expect(getOrder(order.id)?.status).toBe("delivered"));
    const delivered = getOrder(order.id)!;
    expect(canReadRewardOrder(order.id, token)).toBe(true);
    expect(await open(delivered.sealedPayload!, key.publicKey, key.secretKey)).toContain("SIMULATED");
    const stranger = await generateKeyPair();
    await expect(open(delivered.sealedPayload!, stranger.publicKey, stranger.secretKey)).rejects.toThrow();
    expect(sponsorSummary(campaign(c.id)).delivered).toBe(1);
    expect(JSON.stringify(sponsorSummary(campaign(c.id)))).not.toContain(delivered.sealedPayload!);
    await tick(); expect(agentSpentTodayCents()).toBe(348);
  });
});

describe("campaign HTTP boundaries", () => {
  it("requires organizer authorization for creation, catalog and approval", async () => {
    const { POST: create } = await import("../app/api/campaigns/route");
    const { GET: catalog } = await import("../app/api/campaigns/catalog/route");
    const { POST: approve } = await import("../app/api/campaigns/[id]/approve/route");
    vi.stubEnv("CAMPAIGN_ADMIN_TOKEN", secret());
    expect((await create(new Request("http://localhost/api/campaigns", { method: "POST", body: "{}" }))).status).toBe(401);
    expect((await catalog(new Request("http://localhost/api/campaigns/catalog?q=esim"))).status).toBe(401);
    expect((await approve(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: setup().id }) })).status).toBe(401);
  });
  it("rejects malformed player keys and hides sponsored order data from the sponsor", async () => {
    const { POST: submit } = await import("../app/api/campaigns/[id]/claim/route");
    const { GET: readOrder } = await import("../app/api/orders/[id]/route");
    const c = setup();
    const invalid = await submit(new Request("http://localhost", { method: "POST", headers: { authorization: `Bearer ${c.token}` }, body: JSON.stringify({ answer: 1, publicKey: "invalid", secret: secret() }) }), { params: Promise.resolve({ id: c.id }) });
    expect(invalid.status).toBe(400);
    const { c: ready, token } = await proposed(), order = await approveReward(ready.id);
    const ctx = { params: Promise.resolve({ id: order.id }) };
    expect((await readOrder(new Request("http://localhost"), ctx)).status).toBe(404);
    expect((await readOrder(new Request("http://localhost", { headers: { authorization: `Bearer ${ready.token}` } }), ctx)).status).toBe(404);
    const response = await readOrder(new Request("http://localhost", { headers: { authorization: `Bearer ${token}` } }), ctx);
    expect(response.status).toBe(200); expect((await response.json()).sponsored).toBe(true);
  });
});
