import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { db } from "./db/client";
import { generateKeyPair, seal } from "./sodium";
import { encodeContent } from "./payload";
import { openGiftEnvelope, resealForFriend } from "./gift-envelope";
import { resetRateLimits } from "./rate-limit";
import { POST as createPost } from "../app/api/gifts/route";
import { DELETE as giftDelete, GET as giftGet } from "../app/api/gifts/[id]/route";
import { POST as acceptPost } from "../app/api/gifts/[id]/accept/route";
import { POST as sealPost } from "../app/api/gifts/[id]/seal/route";
import { POST as openPost } from "../app/api/gifts/[id]/open/route";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "zealed-gifts-"));
  vi.stubEnv("DATABASE_PATH", join(dir, "test.db"));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("RATE_LIMIT", "off");
  resetRateLimits();
});
afterEach(() => {
  const g = globalThis as unknown as { __zealedDb?: ReturnType<typeof db> };
  g.__zealedDb?.$client.close();
  delete g.__zealedDb;
  vi.useRealTimers();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (token?: string, body?: object) =>
  new Request("http://localhost/api/gifts", {
    method: body ? "POST" : "GET",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
const post = (token: string, body: object = {}) => req(token, body);
const randomToken = () => randomBytes(32).toString("base64url");
const giftRows = () => db().$client.prepare("SELECT COUNT(*) AS n FROM gift_links").get() as { n: number };

async function create() {
  const res = await createPost(new Request("http://localhost/api/gifts", { method: "POST" }));
  expect(res.status).toBe(201);
  return (await res.json()) as { giftId: string; giftToken: string; ownerToken: string; expiresAt: number };
}
async function accepted() {
  const gift = await create();
  const friend = await generateKeyPair();
  const res = await acceptPost(post(gift.giftToken, { publicKey: friend.publicKey }), ctx(gift.giftId));
  expect(res.status).toBe(200);
  const { recipientToken } = (await res.json()) as { recipientToken: string };
  return { ...gift, friend, recipientToken };
}
async function sealed() {
  const gift = await accepted();
  const blob = await seal("x", gift.friend.publicKey);
  const res = await sealPost(post(gift.ownerToken, { sealed: blob, recipientPublicKey: gift.friend.publicKey }), ctx(gift.giftId));
  expect(res.status).toBe(200);
  return { ...gift, blob };
}

describe("gift links", () => {
  it("create → accept → seal → open returns the blob exactly once and deletes the row", async () => {
    const gift = await sealed();
    const status = await (await giftGet(req(gift.ownerToken), ctx(gift.giftId))).json();
    expect(status).toMatchObject({ state: "sealed", role: "owner", recipientPublicKey: gift.friend.publicKey });
    expect(JSON.stringify(status)).not.toContain(gift.blob);

    const first = await openPost(post(gift.recipientToken), ctx(gift.giftId));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ sealed: gift.blob });
    expect(giftRows().n).toBe(0);

    const second = await openPost(post(gift.recipientToken), ctx(gift.giftId));
    expect(second.status).toBe(404);
    expect((await giftGet(req(gift.ownerToken), ctx(gift.giftId))).status).toBe(404);
  });

  it("lets only the first browser accept; later accepts get 409", async () => {
    const gift = await accepted();
    const other = await generateKeyPair();
    const res = await acceptPost(post(gift.giftToken, { publicKey: other.publicKey }), ctx(gift.giftId));
    expect(res.status).toBe(409);
    const status = await (await giftGet(req(gift.giftToken), ctx(gift.giftId))).json();
    expect(status).toMatchObject({ state: "accepted", role: "link", recipientPublicKey: gift.friend.publicKey });
  });

  it("answers 404 for a wrong token, a wrong role or an unknown ID", async () => {
    const gift = await sealed();
    expect((await giftGet(req(randomToken()), ctx(gift.giftId))).status).toBe(404);
    expect((await giftGet(req(), ctx(gift.giftId))).status).toBe(404);
    expect((await giftGet(req(gift.ownerToken), ctx("A".repeat(22)))).status).toBe(404);
    // The link token can't open, and the owner token can't open either: only the accepted browser can.
    expect((await openPost(post(gift.giftToken), ctx(gift.giftId))).status).toBe(404);
    expect((await openPost(post(gift.ownerToken), ctx(gift.giftId))).status).toBe(404);
    // Someone holding only the link can't seal a substitute blob.
    const fake = await seal("fake", gift.friend.publicKey);
    expect((await sealPost(post(gift.giftToken, { sealed: fake, recipientPublicKey: gift.friend.publicKey }), ctx(gift.giftId))).status).toBe(404);
    expect(giftRows().n).toBe(1);
  });

  it("refuses to seal before acceptance, to the wrong key or twice, and won't open before sealing", async () => {
    const gift = await create();
    const friend = await generateKeyPair();
    const blob = await seal("x", friend.publicKey);
    expect((await sealPost(post(gift.ownerToken, { sealed: blob, recipientPublicKey: friend.publicKey }), ctx(gift.giftId))).status).toBe(409);
    const accept = await acceptPost(post(gift.giftToken, { publicKey: friend.publicKey }), ctx(gift.giftId));
    const { recipientToken } = await accept.json();
    expect((await openPost(post(recipientToken), ctx(gift.giftId))).status).toBe(409);
    const other = await generateKeyPair();
    expect((await sealPost(post(gift.ownerToken, { sealed: blob, recipientPublicKey: other.publicKey }), ctx(gift.giftId))).status).toBe(409);
    expect((await sealPost(post(gift.ownerToken, { sealed: blob, recipientPublicKey: friend.publicKey }), ctx(gift.giftId))).status).toBe(200);
    expect((await sealPost(post(gift.ownerToken, { sealed: blob, recipientPublicKey: friend.publicKey }), ctx(gift.giftId))).status).toBe(409);
    expect(giftRows().n).toBe(1);
  });

  it("validates input", async () => {
    const gift = await create();
    expect((await acceptPost(post(gift.giftToken, { publicKey: "not-a-key" }), ctx(gift.giftId))).status).toBe(400);
    expect((await acceptPost(post(gift.giftToken, { publicKey: "A".repeat(43), extra: 1 }), ctx(gift.giftId))).status).toBe(400);
    const bad = new Request("http://localhost/api/gifts", { method: "POST", headers: { authorization: `Bearer ${gift.giftToken}` }, body: "{" });
    expect((await acceptPost(bad, ctx(gift.giftId))).status).toBe(400);
    expect((await sealPost(post(gift.ownerToken, { sealed: "short", recipientPublicKey: "x" }), ctx(gift.giftId))).status).toBe(400);
  });

  it("lets the giver cancel, after which every token gets 404", async () => {
    const gift = await accepted();
    expect((await giftDelete(req(gift.giftToken), ctx(gift.giftId))).status).toBe(404); // link holders can't cancel
    expect((await giftDelete(req(gift.ownerToken), ctx(gift.giftId))).status).toBe(200);
    expect(giftRows().n).toBe(0);
    expect((await giftGet(req(gift.recipientToken), ctx(gift.giftId))).status).toBe(404);
  });

  it("deletes expired gifts lazily on the next request", async () => {
    vi.stubEnv("GIFT_TTL_HOURS", "1");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
    const waiting = await create();
    const ready = await sealed();
    expect(giftRows().n).toBe(2);
    expect(ready.expiresAt).toBe(Date.now() + 3_600_000);

    vi.setSystemTime(new Date("2026-11-04T13:00:01Z"));
    expect((await openPost(post(ready.recipientToken), ctx(ready.giftId))).status).toBe(404);
    expect(giftRows().n).toBe(0);
    expect((await giftGet(req(waiting.ownerToken), ctx(waiting.giftId))).status).toBe(404);
  });

  it("rate-limits gift creation with RATE_LIMIT=on", async () => {
    vi.stubEnv("RATE_LIMIT", "on");
    const make = () => createPost(new Request("http://localhost/api/gifts", { method: "POST", headers: { "x-forwarded-for": "203.0.113.9" } }));
    for (let i = 0; i < 10; i++) expect((await make()).status).toBe(201);
    const limited = await make();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });

  it("end to end: re-seals a reward to the friend's key, and the plaintext never reaches the database", async () => {
    const CODE = "ZEALCODE-7Q4W-SECRET", PIN = "PINQX77Z";
    const giver = await generateKeyPair();
    const reward = await seal(encodeContent({ kind: "giftcard", code: CODE, pin: PIN, instructions: "Redeem at checkout" }), giver.publicKey);

    const gift = await create();
    const friend = await generateKeyPair();
    const accept = await acceptPost(post(gift.giftToken, { publicKey: friend.publicKey }), ctx(gift.giftId));
    const { recipientToken } = await accept.json();

    // The giver's browser reads the friend's key from the status and re-seals locally.
    const { recipientPublicKey } = await (await giftGet(req(gift.ownerToken), ctx(gift.giftId))).json();
    expect(recipientPublicKey).toBe(friend.publicKey);
    const blob = await resealForFriend(reward, giver, recipientPublicKey, "Store card, $5");
    expect((await sealPost(post(gift.ownerToken, { sealed: blob, recipientPublicKey }), ctx(gift.giftId))).status).toBe(200);

    const dump = () => {
      const client = db().$client;
      const tables = client.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
      return tables.map(({ name }) => JSON.stringify(client.prepare(`SELECT * FROM "${name}"`).all())).join("\n");
    };
    const onDisk = () => readdirSync(dir).map((f) => readFileSync(join(dir, f)).toString("latin1")).join("\n");
    for (const secret of [CODE, PIN, "Store card", gift.giftToken, gift.ownerToken, recipientToken]) {
      expect(dump()).not.toContain(secret);
      expect(onDisk()).not.toContain(secret);
    }
    expect(dump()).toContain(blob); // only ciphertext is stored

    const { sealed: received } = await (await openPost(post(recipientToken), ctx(gift.giftId))).json();
    const envelope = await openGiftEnvelope(received, friend);
    expect(envelope).toEqual({ v: 1, label: "Store card, $5", content: { kind: "giftcard", code: CODE, pin: PIN, instructions: "Redeem at checkout" } });
    // Someone else's key can't open it.
    await expect(openGiftEnvelope(received, await generateKeyPair())).rejects.toThrow();
    expect(dump()).not.toContain(blob);
    for (const secret of [CODE, PIN]) expect(onDisk()).not.toContain(secret);
  });

  it("carries custom-reward instructions and refuses rewards with nothing to pass on", async () => {
    const giver = await generateKeyPair(), friend = await generateKeyPair();
    const custom = await seal(JSON.stringify({ instructions: "Collect at desk 4 with word KESTREL" }), giver.publicKey);
    const envelope = await openGiftEnvelope(await resealForFriend(custom, giver, friend.publicKey), friend);
    expect(envelope.content).toEqual({ kind: "custom", instructions: "Collect at desk 4 with word KESTREL" });
    const topup = await seal(encodeContent({ kind: "topup", delivered: true }), giver.publicKey);
    await expect(resealForFriend(topup, giver, friend.publicKey)).rejects.toThrow(/nothing/);
  });
});
