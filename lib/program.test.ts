import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { db } from "./db/client";
import { acquireClaim, beginSelection, campaign, campaignInput, createCampaign, sponsorSummary } from "./campaigns";
import { assertProgramPurchase, acknowledgePrize, deliverPrize, programStatus, publicProgram, reservePrize, reviewTask, submitTask } from "./program";
import { generateKeyPair, open, seal } from "./sodium";
import { GET as playerGet, POST as playerPost } from "../app/api/claims/[id]/program/route";
import { GET as adminGet, POST as adminPost } from "../app/api/campaigns/[id]/program/route";
import { POST as claimPost } from "../app/api/campaigns/[id]/claim/route";
import { POST as selectPost } from "../app/api/claims/[id]/select/route";
import type { ProgramInput } from "./program-schema";

const token = () => randomBytes(32).toString("base64url");
const admin = token();
let dir: string;
const config: ProgramInput = {
  tasks: [{ kind: "quiz", title: "Which answer passes?", options: ["Wrong", "Correct"], answer: 1 }, { kind: "social", title: "Publish a recap", instructions: "Share a public post." }],
  prizes: [{ kind: "custom", title: "Event merchandise", description: "Collect at the event." }, { kind: "zcash", title: "Testnet prize", amountZat: 1000 }, { kind: "esim", title: "Data pack" }],
};
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "zealed-program-"));
  vi.stubEnv("DATABASE_PATH", join(dir, "test.db")); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("RATE_LIMIT", "off");
  vi.stubEnv("CAMPAIGN_ADMIN_TOKEN", admin); vi.stubEnv("TOOL_APPROVAL_SECRET", token());
  vi.stubEnv("MISSION_MODE", "email"); vi.stubEnv("BITREFILL_MODE", "fake"); vi.stubEnv("BITREFILL_PURCHASES", "simulate");
});
afterEach(() => {
  const g = globalThis as unknown as { __zealedDb?: ReturnType<typeof db> };
  g.__zealedDb?.$client.close(); delete g.__zealedDb;
  vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true });
});
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (secret: string, body?: object) => new Request("http://localhost/api/program", { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
async function setup() {
  const c = createCampaign({ title: "Event test", country: "IN", budgetCents: 500, productIds: ["bitrefill-esim-india"], program: config });
  const key = await generateKeyPair(), secret = token();
  const p = acquireClaim(c.id, c.token, 1, key.publicKey, secret);
  const program = publicProgram(c.id)!;
  return { c, p, key, secret, ...program };
}
async function eligible() {
  const s = await setup();
  submitTask(s.p, s.tasks[0].id, 1); submitTask(s.p, s.tasks[1].id, undefined, "https://example.org/event-proof");
  reviewTask(s.c.id, s.tasks[1].id, true);
  return s;
}

it("validates task configuration and allows custom-only campaigns without a catalog", () => {
  const input = { title: "Workshop", country: "IN", budgetCents: 500, productIds: [], program: { ...config, prizes: [config.prizes[0]] } };
  expect(campaignInput.safeParse(input).success).toBe(true);
  expect(campaignInput.safeParse({ ...input, program: config }).success).toBe(false);
  expect(campaignInput.safeParse({ ...input, program: { ...input.program, tasks: [{ ...config.tasks[0], answer: 5 }] } }).success).toBe(false);
});

it("reserves a new program through the claim API without running the legacy attendance mission", async () => {
  const c = createCampaign({ title: "Workshop", country: "IN", budgetCents: 500, productIds: [], program: { ...config, prizes: [config.prizes[0]] } });
  const key = await generateKeyPair(), secret = token();
  const res = await claimPost(req(c.token, { publicKey: key.publicKey, secret }), ctx(c.id));
  expect(res.status).toBe(200);
  const { id } = await res.json();
  const response = await playerGet(req(secret), ctx(id));
  const state = await response.json();
  expect(state.eligible).toBe(false); expect(state.results).toEqual([]);
  expect(JSON.stringify(state)).not.toContain('"answers"'); expect(JSON.stringify(state)).not.toContain('"answer"');
});

it("requires every task and organizer approval even when APIs are called directly", async () => {
  const s = await setup();
  expect(() => beginSelection(s.p.id, s.secret)).toThrow("every required task");
  expect((await playerPost(req(s.secret, { action: "redeem", prizeId: s.prizes[0].id }), ctx(s.p.id))).status).toBe(403);
  submitTask(s.p, s.tasks[0].id, 1);
  submitTask(s.p, s.tasks[1].id, undefined, "https://example.org/post");
  expect(() => submitTask(s.p, s.tasks[1].id, undefined, "https://example.org/swapped")).toThrow("review this submission");
  expect(programStatus(s.p)?.eligible).toBe(false);
  expect((await adminPost(req(s.secret, { action: "review", taskId: s.tasks[1].id, approved: true }), ctx(s.c.id))).status).toBe(401);
  expect((await adminPost(req(admin, { action: "review", taskId: s.tasks[1].id, approved: true }), ctx(s.c.id))).status).toBe(200);
  expect(programStatus(s.p)?.eligible).toBe(true);
  expect(sponsorSummary(campaign(s.c.id)).status).toBe("prize_unlocked");
  expect(() => reviewTask(s.c.id, s.tasks[0].id, true)).toThrow("cannot be manually reviewed");
});

it("persists five failed quiz attempts without allowing a later correct answer", async () => {
  const s = await setup();
  for (let i = 0; i < 5; i++) submitTask(s.p, s.tasks[0].id, 0);
  expect(programStatus(s.p)?.results[0]).toMatchObject({ status: "rejected", attempts: 5 });
  expect(() => submitTask(s.p, s.tasks[0].id, 1)).toThrow("attempt limit");
  expect(() => reservePrize(s.p, s.prizes[0].id)).toThrow("every required task");
});

it("supports rejected evidence resubmission and refuses unsafe evidence URLs", async () => {
  const s = await setup();
  for (const evidence of ["javascript:alert(1)", "https://user:password@example.org", "private code"]) expect(() => submitTask(s.p, s.tasks[1].id, undefined, evidence)).toThrow("public evidence URL");
  submitTask(s.p, s.tasks[1].id, undefined, "https://example.org/first"); reviewTask(s.c.id, s.tasks[1].id, false);
  submitTask(s.p, s.tasks[1].id, undefined, "https://example.org/second"); reviewTask(s.c.id, s.tasks[1].id, true);
  expect(programStatus(s.p)?.results[0]).toMatchObject({ attempts: 2, status: "approved" });
});

it("locks one prize atomically, tolerates retries and prevents switching to the purchase flow", async () => {
  const s = await eligible();
  reservePrize(s.p, s.prizes[0].id); reservePrize(s.p, s.prizes[0].id);
  expect(() => reservePrize(s.p, s.prizes[2].id)).toThrow("already reserved");
  expect(() => assertProgramPurchase(s.p)).toThrow("Select this reward type");
  expect(() => reviewTask(s.c.id, s.tasks[1].id, false)).toThrow("already reserved");
  expect(db().$client.prepare("SELECT count(*) AS n FROM prize_redemptions").get()).toEqual({ n: 1 });
  expect((await selectPost(req(s.secret, { purpose: "connectivity", days: 7, esimCompatible: true }), ctx(s.p.id))).status).toBe(403);
});

it("restricts Bitrefill selection to the reserved reward type", async () => {
  const s = await eligible(); reservePrize(s.p, s.prizes[2].id);
  expect(programStatus(s.p, true)).not.toHaveProperty("buyerKey");
  expect(() => assertProgramPurchase(s.p, "esim")).not.toThrow();
  expect(() => assertProgramPurchase(s.p, "giftcard")).toThrow("Select this reward type");
  expect((await selectPost(req(s.secret, { purpose: "gift", days: 7, esimCompatible: true }), ctx(s.p.id))).status).toBe(403);
  expect(beginSelection(s.p.id, s.secret)).toBe(true);
  expect(() => deliverPrize(s.c.id, { txid: "1".repeat(64) })).toThrow("sponsor payment flow");
});

it("delivers custom ciphertext only to the claim holder and keeps admin reads free of payloads", async () => {
  const s = await eligible(); reservePrize(s.p, s.prizes[0].id);
  expect(() => acknowledgePrize(s.p)).toThrow("no delivered reward");
  const plaintext = JSON.stringify({ instructions: "Synthetic test collection instruction" });
  const sealedPayload = await seal(plaintext, s.key.publicKey);
  const response = await adminPost(req(admin, { action: "deliver", sealedPayload }), ctx(s.c.id));
  expect(response.status).toBe(200);
  const adminData = await response.json(); expect(adminData.redemption.sealed_payload).toBeNull(); expect(adminData.buyerKey).toBe(s.key.publicKey);
  expect((await playerGet(req(s.c.token), ctx(s.p.id))).status).toBe(404);
  expect((await adminGet(req(s.secret), ctx(s.c.id))).status).toBe(401);
  const playerData = await (await playerGet(req(s.secret), ctx(s.p.id))).json();
  expect(await open(playerData.redemption.sealed_payload, s.key.publicKey, s.key.secretKey)).toBe(plaintext);
  const stranger = await generateKeyPair(); await expect(open(sealedPayload, stranger.publicKey, stranger.secretKey)).rejects.toThrow();
  expect(JSON.stringify(db().$client.prepare("SELECT * FROM prize_redemptions").all())).not.toContain("Synthetic test");
  expect(() => deliverPrize(s.c.id, { sealedPayload })).not.toThrow();
  expect(() => deliverPrize(s.c.id, { sealedPayload: "a".repeat(100) })).toThrow("No reward awaiting");
  acknowledgePrize(s.p); acknowledgePrize(s.p);
  expect(sponsorSummary(campaign(s.c.id))).toMatchObject({ acknowledged: 1, delivered: 0, status: "prize_acknowledged" });
});

it("records a reported testnet payout separately from acknowledgment and rejects txid reuse", async () => {
  const s = await eligible();
  expect(() => reservePrize(s.p, s.prizes[1].id, "t1transparent")).toThrow("shielded testnet");
  const address = `utest1${"q".repeat(80)}`; // Format-only fixture, never broadcast to.
  reservePrize(s.p, s.prizes[1].id, address);
  expect(() => reservePrize(s.p, s.prizes[1].id, `${address}q`)).toThrow("already reserved");
  expect(() => deliverPrize(s.c.id, { txid: "invalid" })).toThrow("broadcast transaction ID");
  deliverPrize(s.c.id, { txid: "a".repeat(64) });
  expect(programStatus(s.p)?.redemption?.state).toBe("ready");
  expect(sponsorSummary(campaign(s.c.id)).delivered).toBe(0);
  const second = await eligible(); reservePrize(second.p, second.prizes[1].id, address);
  expect(() => deliverPrize(second.c.id, { txid: "a".repeat(64) })).toThrow();
  expect(programStatus(second.p)?.redemption?.state).toBe("requested");
  acknowledgePrize(s.p); expect(programStatus(s.p)?.redemption?.state).toBe("acknowledged");
});

it("blocks tasks and prize reservation after expiry but permits receipt of an already reserved prize", async () => {
  const s = await eligible(); reservePrize(s.p, s.prizes[0].id);
  db().$client.prepare("UPDATE campaigns SET expires_at=0 WHERE id=?").run(s.c.id);
  const sealedPayload = await seal(JSON.stringify({ instructions: "Late collection" }), s.key.publicKey);
  deliverPrize(s.c.id, { sealedPayload }); acknowledgePrize(s.p);
  const other = await setup(); db().$client.prepare("UPDATE campaigns SET expires_at=0 WHERE id=?").run(other.c.id);
  expect(() => submitTask(other.p, other.tasks[0].id, 1)).toThrow("expired");
  expect(() => reservePrize(other.p, other.prizes[0].id)).toThrow("expired");
});

const eventProgram: ProgramInput = {
  tasks: [
    { kind: "code", title: "Visit the sponsor booth", instructions: "Ask the team at the booth for today's code.", code: "Shielded-Booth 42" },
    { kind: "social", title: "Follow us on X", instructions: "Follow, then submit your X profile link.", platform: "x", target: "https://x.com/zealed" },
    { kind: "social", title: "Join the Discord server", instructions: "Join, then submit your Discord profile link.", platform: "discord", target: "https://discord.gg/zealed" },
  ],
  prizes: [{ kind: "custom", title: "Event merchandise", description: "Collect at the event." }],
};
async function eventSetup() {
  const c = createCampaign({ title: "Event missions", country: "IN", budgetCents: 500, productIds: [], program: eventProgram });
  const key = await generateKeyPair(), secret = token();
  return { c, p: acquireClaim(c.id, c.token, 1, key.publicKey, secret), secret, ...publicProgram(c.id)! };
}

it("checks venue codes instantly, ignoring case, spaces and dashes, and never exposes the code", async () => {
  const s = await eventSetup(), code = s.tasks[0];
  expect(code.kind).toBe("code"); expect(code.instructions).toContain("booth");
  const stored = db().$client.prepare("SELECT config FROM campaign_programs WHERE campaign_id=?").get(s.c.id) as { config: string };
  expect(stored.config.toLowerCase()).not.toContain("booth 42"); expect(stored.config.toLowerCase()).not.toContain("booth42");
  expect(JSON.stringify(programStatus(s.p))).not.toMatch(/booth.?42/i);
  submitTask(s.p, code.id, undefined, undefined, "wrong-code");
  expect(programStatus(s.p)?.results[0]).toMatchObject({ status: "rejected", attempts: 1 });
  const res = await playerPost(req(s.secret, { action: "task", taskId: code.id, code: "  shielded booth-42 " }), ctx(s.p.id));
  expect(res.status).toBe(200);
  expect(programStatus(s.p)?.results.find(r => r.task_id === code.id)?.status).toBe("approved");
  expect(() => reviewTask(s.c.id, code.id, true)).toThrow("cannot be manually reviewed");
  expect(() => submitTask(s.p, code.id)).not.toThrow(); // already approved: a no-op
});

it("requires social evidence on the chosen platform and keeps the organizer's link public", async () => {
  const s = await eventSetup(), [, x, discord] = s.tasks;
  expect(x).toMatchObject({ platform: "x", target: "https://x.com/zealed" });
  expect(() => submitTask(s.p, x.id, undefined, "https://example.org/me")).toThrow("Submit a link on X");
  submitTask(s.p, x.id, undefined, "https://twitter.com/player/status/1");
  submitTask(s.p, discord.id, undefined, "https://example.org/screenshot.png");
  expect(programStatus(s.p)?.results.filter(r => r.status === "pending")).toHaveLength(2);
  const valid = { title: "Event", country: "IN", budgetCents: 500, productIds: [], program: eventProgram };
  expect(campaignInput.safeParse(valid).success).toBe(true);
  const offPlatform = { ...valid, program: { ...eventProgram, tasks: [{ ...eventProgram.tasks[1], target: "https://evil.example/x.com" }] } };
  expect(campaignInput.safeParse(offPlatform).success).toBe(false);
  const shortCode = { ...valid, program: { ...eventProgram, tasks: [{ ...eventProgram.tasks[0], code: "a-b" }] } };
  expect(campaignInput.safeParse(shortCode).success).toBe(false);
  const noLink = { ...valid, program: { ...eventProgram, tasks: [{ ...eventProgram.tasks[1], target: "" }] } };
  expect(campaignInput.safeParse(noLink).success).toBe(true);
});
