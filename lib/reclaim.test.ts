import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { db } from "./db/client";
import { campaign, claimForCampaign, createCampaign } from "./campaigns";
import { generateKeyPair } from "./sodium";
import { LUMA_PROVIDER_ID, missionContext, verifyMissionProof } from "./reclaim";
import { POST as claimRoute } from "@/app/api/campaigns/[id]/claim/route";
import { POST as reclaimRoute } from "@/app/api/campaigns/[id]/reclaim/route";
import { GET as invitationRoute } from "@/app/api/campaigns/[id]/route";

// The SDK is mocked. verifyProof mimics the real content check: a proof only passes for the provider id it was made with.
const sdk = vi.hoisted(() => ({ verifyProof: vi.fn(), init: vi.fn(), setContext: vi.fn(), toJsonString: vi.fn() }));
vi.mock("@reclaimprotocol/js-sdk", () => ({ ReclaimProofRequest: { init: sdk.init }, verifyProof: sdk.verifyProof }));

const PROVIDER = "provider-under-test";
const IDENTITY = { username: "octo-identity-7731", email: "player-7731@example.org" };
let dir: string, appSecret: string;
const secret = () => randomBytes(32).toString("base64url");
const failure = (name: string) => ({ isVerified: false, error: Object.assign(new Error("not valid"), { name }), data: [], publicData: [] });

function enableReclaim() {
  vi.stubEnv("RECLAIM_APP_ID", "0xapp-under-test"); vi.stubEnv("RECLAIM_APP_SECRET", appSecret);
  vi.stubEnv("RECLAIM_PROVIDER_ID", PROVIDER); vi.stubEnv("RECLAIM_MISSION_LABEL", "Prove you have a code-hosting account");
}
// `params` go in the signed claim context; `unsigned` goes in the top-level field the attestors do not sign.
function proofFor(campaignId: string, publicKey: string, providerId = PROVIDER, params: Record<string, string> = IDENTITY, unsigned = params) {
  const context = { contextAddress: missionContext(campaignId, publicKey), contextMessage: "Zealed reward mission", reclaimSessionId: "session-1", providerHash: `hash:${providerId}`, extractedParameters: params };
  return {
    identifier: "0xclaim", signatures: ["0xsigned"], witnesses: [{ id: "0xattestor", url: "wss://attestor.invalid" }],
    claimData: { provider: "http", parameters: JSON.stringify({ url: "https://accounts.invalid/api/me", paramValues: params }), owner: "0xowner", timestampS: Math.floor(Date.now() / 1000), context: JSON.stringify(context), identifier: "0xclaim", epoch: 1 },
    extractedParameterValues: unsigned, publicData: { email: IDENTITY.email },
  };
}
const LUMA_USER = "usr-synthetic-Qx81Lm";
const attendee = (overrides: Record<string, string> = {}) => ({ event_id: "evt-test123", user_id: LUMA_USER, approval_status: "Approved", ...overrides });
function enableAttendance() {
  vi.stubEnv("RECLAIM_APP_ID", "0xapp-under-test"); vi.stubEnv("RECLAIM_APP_SECRET", appSecret);
  vi.stubEnv("LUMA_EVENT_ID", "evt-test123, testhackathon");
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (id: string, token: string, body: unknown, path = "claim") =>
  new Request(`http://localhost/api/campaigns/${id}/${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
async function claim(id: string, token: string, body: unknown) {
  const res = await claimRoute(post(id, token, body), params(id));
  return { status: res.status, data: await res.json() as { id?: string; error?: string } };
}
function dumpDb() {
  const c = db().$client;
  const tables = c.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  return JSON.stringify(tables.map(t => c.prepare(`SELECT * FROM "${t.name}"`).all()));
}
async function player() {
  const c = createCampaign({ title: "Verified invitation", budgetCents: 500, country: "IN", productIds: ["bitrefill-esim-india"] });
  const key = await generateKeyPair();
  return { c, key, token: secret() };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "zealed-reclaim-"));
  appSecret = "0x" + randomBytes(32).toString("hex");
  vi.stubEnv("DATABASE_PATH", join(dir, "test.db")); vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("BITREFILL_API_KEY", ""); vi.stubEnv("BITREFILL_MODE", "fake"); vi.stubEnv("ZCASH_BACKEND", "fake");
  for (const name of ["RECLAIM_APP_ID", "RECLAIM_APP_SECRET", "RECLAIM_PROVIDER_ID", "RECLAIM_MISSION_LABEL", "RECLAIM_REQUIRE_TEE", "LUMA_EVENT_ID", "LUMA_APPROVED_STATUSES", "FULFILL_SECRET_KEY"]) vi.stubEnv(name, "");
  vi.stubEnv("TOOL_APPROVAL_SECRET", randomBytes(32).toString("base64url"));
  sdk.verifyProof.mockReset();
  sdk.verifyProof.mockImplementation(async (proofs: ReturnType<typeof proofFor>[], config: { providerId?: string }) =>
    proofs.every(p => JSON.parse(p.claimData.context).providerHash === `hash:${config.providerId}`)
      ? { isVerified: true, data: [], publicData: [] } : failure("ProofNotValidatedError"));
  sdk.setContext.mockReset(); sdk.toJsonString.mockReset();
  sdk.toJsonString.mockReturnValue(JSON.stringify({ applicationId: "0xapp-under-test", providerId: PROVIDER, sessionId: "session-1", signature: "0xsignature", timestamp: "1" }));
  sdk.init.mockReset(); sdk.init.mockResolvedValue({ setContext: sdk.setContext, toJsonString: sdk.toJsonString });
});
afterEach(() => {
  const g = globalThis as unknown as { __zealedDb?: ReturnType<typeof db> };
  g.__zealedDb?.$client.close(); delete g.__zealedDb;
  vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true });
});

describe("Reclaim mission verification", () => {
  it("claims the reward with a valid proof, pinning the provider from the server config", async () => {
    enableReclaim();
    const { c, key, token } = await player();
    const res = await claim(c.id, c.token, { proofs: [proofFor(c.id, key.publicKey)], publicKey: key.publicKey, secret: token });
    expect(res.status).toBe(200);
    expect(claimForCampaign(c.id)?.buyer_key).toBe(key.publicKey);
    expect(campaign(c.id).attempts).toBe(1);
    const config = sdk.verifyProof.mock.calls[0][1];
    expect(config).toEqual({ providerId: PROVIDER });
    // A retry from the same browser returns the same claim without another attempt.
    expect((await claim(c.id, c.token, { proofs: [proofFor(c.id, key.publicKey)], publicKey: key.publicKey, secret: token })).data.id).toBe(res.data.id);
    expect(campaign(c.id).attempts).toBe(1);
  });

  it("rejects a proof bound to another campaign or another key, and counts the attempt", async () => {
    enableReclaim();
    const { c, key, token } = await player();
    const other = await player();
    const wrongCampaign = await claim(c.id, c.token, { proofs: [proofFor(other.c.id, key.publicKey)], publicKey: key.publicKey, secret: token });
    expect(wrongCampaign.status).toBe(400);
    expect(wrongCampaign.data.error).toContain("different invitation");
    const stolen = await claim(c.id, c.token, { proofs: [proofFor(c.id, other.key.publicKey)], publicKey: key.publicKey, secret: token });
    expect(stolen.status).toBe(400);
    expect(campaign(c.id).attempts).toBe(2);
    expect(claimForCampaign(c.id)).toBeUndefined();
    expect(sdk.verifyProof).not.toHaveBeenCalled();
  });

  it("rejects a proof made with a different provider", async () => {
    enableReclaim();
    const { c, key, token } = await player();
    const res = await claim(c.id, c.token, { proofs: [proofFor(c.id, key.publicKey, "some-other-provider")], publicKey: key.publicKey, secret: token });
    expect(res.status).toBe(400);
    expect(res.data.error).toContain("did not verify");
    expect(campaign(c.id).attempts).toBe(1);
    expect(claimForCampaign(c.id)).toBeUndefined();
  });

  it("rejects when verifyProof fails, enforces the attempt limit, and does not charge an attempt when Reclaim is unreachable", async () => {
    enableReclaim();
    const { c, key, token } = await player();
    const body = { proofs: [proofFor(c.id, key.publicKey)], publicKey: key.publicKey, secret: token };
    sdk.verifyProof.mockResolvedValue(failure("BackendServerError"));
    expect((await claim(c.id, c.token, body)).status).toBe(503);
    expect(campaign(c.id).attempts).toBe(0);
    sdk.verifyProof.mockResolvedValue(failure("ProofNotVerifiedError"));
    for (let i = 0; i < 5; i++) expect((await claim(c.id, c.token, body)).status).toBe(400);
    expect(campaign(c.id).attempts).toBe(5);
    expect((await claim(c.id, c.token, body)).status).toBe(429);
    expect(sdk.verifyProof).toHaveBeenCalledTimes(6);
    expect(claimForCampaign(c.id)).toBeUndefined();
  });

  it("refuses the quiz answer and malformed or stale proofs while Reclaim is enabled", async () => {
    enableReclaim();
    const { c, key, token } = await player();
    expect((await claim(c.id, c.token, { answer: 1, publicKey: key.publicKey, secret: token })).status).toBe(400);
    expect(campaign(c.id).attempts).toBe(0);
    const stale = proofFor(c.id, key.publicKey); stale.claimData.timestampS -= 2 * 60 * 60;
    expect((await claim(c.id, c.token, { proofs: [stale], publicKey: key.publicKey, secret: token })).data.error).toContain("expired");
    expect((await claim(c.id, c.token, { proofs: [{ claimData: {} }], publicKey: key.publicKey, secret: token })).status).toBe(400);
    expect((await claim(c.id, "wrong-invite", { proofs: [proofFor(c.id, key.publicKey)], publicKey: key.publicKey, secret: token })).status).toBe(404);
    expect(claimForCampaign(c.id)).toBeUndefined();
    await expect(verifyMissionProof([proofFor(c.id, key.publicKey)], c.id, key.publicKey)).resolves.toEqual({ verified: true, providerId: PROVIDER });
  });

  it("never stores, returns or logs the account data inside a proof", async () => {
    enableReclaim();
    const logs = (["log", "info", "warn", "error", "debug"] as const).map(m => vi.spyOn(console, m).mockImplementation(() => {}));
    const { c, key, token } = await player();
    const bad = await claim(c.id, c.token, { proofs: [proofFor(c.id, key.publicKey, "some-other-provider")], publicKey: key.publicKey, secret: token });
    const good = await claim(c.id, c.token, { proofs: [proofFor(c.id, key.publicKey)], publicKey: key.publicKey, secret: token });
    expect(good.status).toBe(200);
    const surfaces = [dumpDb(), JSON.stringify(bad.data), JSON.stringify(good.data), JSON.stringify(logs.map(l => l.mock.calls))];
    for (const text of surfaces) {
      for (const value of [IDENTITY.username, IDENTITY.email, "accounts.invalid", "extractedParameters"]) expect(text).not.toContain(value);
    }
  });

  it("creates the request on the server, bound to this claim, without the app secret", async () => {
    enableReclaim();
    const { c, key } = await player();
    const res = await reclaimRoute(post(c.id, c.token, { publicKey: key.publicKey }, "reclaim"), params(c.id));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(sdk.init).toHaveBeenCalledWith("0xapp-under-test", appSecret, PROVIDER);
    expect(sdk.setContext).toHaveBeenCalledWith(missionContext(c.id, key.publicKey), "Zealed reward mission");
    expect(text).not.toContain(appSecret.slice(2));
    expect(JSON.parse(text).label).toBe("Prove you have a code-hosting account");
    expect((await reclaimRoute(post(c.id, "wrong-invite", { publicKey: key.publicKey }, "reclaim"), params(c.id))).status).toBe(404);
    sdk.toJsonString.mockReturnValue(JSON.stringify({ leaked: appSecret }));
    expect((await reclaimRoute(post(c.id, c.token, { publicKey: key.publicKey }, "reclaim"), params(c.id))).status).toBe(503);
    const info = await (await invitationRoute(new Request(`http://localhost/api/campaigns/${c.id}`, { headers: { authorization: `Bearer ${c.token}` } }), params(c.id))).json();
    expect(info.missionMode).toBe("reclaim");
  });

  it("keeps the quiz working when Reclaim is not configured", async () => {
    const { c, key, token } = await player();
    const info = await (await invitationRoute(new Request(`http://localhost/api/campaigns/${c.id}`, { headers: { authorization: `Bearer ${c.token}` } }), params(c.id))).json();
    expect(info.missionMode).toBe("quiz");
    expect(info.missionLabel).toBeUndefined();
    expect((await reclaimRoute(post(c.id, c.token, { publicKey: key.publicKey }, "reclaim"), params(c.id))).status).toBe(404);
    expect((await claim(c.id, c.token, { proofs: [proofFor(c.id, key.publicKey)], publicKey: key.publicKey, secret: token })).status).toBe(400);
    expect((await claim(c.id, c.token, { answer: 0, publicKey: key.publicKey, secret: token })).data.error).toContain("Not quite");
    expect((await claim(c.id, c.token, { answer: 1, publicKey: key.publicKey, secret: token })).status).toBe(200);
    expect(campaign(c.id).attempts).toBe(2);
    expect(sdk.verifyProof).not.toHaveBeenCalled();
    expect(sdk.init).not.toHaveBeenCalled();
  });
});

describe("anonymous Luma attendance", () => {
  const nullifiers = () => db().$client.prepare("SELECT * FROM attendance_nullifiers").all() as { event_id: string; nullifier: string; claim_id: string }[];

  it("lets an approved attendee claim with the default Luma provider and stores only a nullifier", async () => {
    enableAttendance();
    const { c, key, token } = await player();
    const res = await claim(c.id, c.token, { proofs: [proofFor(c.id, key.publicKey, LUMA_PROVIDER_ID, attendee())], publicKey: key.publicKey, secret: token });
    expect(res.status).toBe(200);
    expect(sdk.verifyProof.mock.calls[0][1]).toEqual({ providerId: LUMA_PROVIDER_ID });
    const rows = nullifiers();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_id: "evt-test123", claim_id: res.data.id });
    expect(rows[0].nullifier).toMatch(/^[0-9a-f]{64}$/);
    await expect(verifyMissionProof([proofFor(c.id, key.publicKey, LUMA_PROVIDER_ID, attendee())], c.id, key.publicKey))
      .resolves.toEqual({ verified: true, providerId: LUMA_PROVIDER_ID, eventId: "evt-test123", nullifier: rows[0].nullifier });
    const info = await (await invitationRoute(new Request(`http://localhost/api/campaigns/${c.id}`, { headers: { authorization: `Bearer ${c.token}` } }), params(c.id))).json();
    expect(info).toMatchObject({ missionMode: "reclaim", missionAttendance: true, missionLabel: "Prove you're an approved Free Society Hack attendee with Reclaim." });
  });

  it("refuses the same Luma user on a second campaign, even through the event's slug alias", async () => {
    enableAttendance();
    const first = await player(), second = await player();
    expect((await claim(first.c.id, first.c.token, { proofs: [proofFor(first.c.id, first.key.publicKey, LUMA_PROVIDER_ID, attendee())], publicKey: first.key.publicKey, secret: first.token })).status).toBe(200);
    const again = await claim(second.c.id, second.c.token, { proofs: [proofFor(second.c.id, second.key.publicKey, LUMA_PROVIDER_ID, attendee({ event_id: "testhackathon" }))], publicKey: second.key.publicKey, secret: second.token });
    expect(again.status).toBe(409);
    expect(again.data.error).toBe("This attendee has already claimed a reward.");
    expect(claimForCampaign(second.c.id)).toBeUndefined();
    expect(campaign(second.c.id).attempts).toBe(0); // rolled back with the claim
    const other = await claim(second.c.id, second.c.token, { proofs: [proofFor(second.c.id, second.key.publicKey, LUMA_PROVIDER_ID, attendee({ user_id: "usr-someone-else" }))], publicKey: second.key.publicKey, secret: second.token });
    expect(other.status).toBe(200);
    expect(nullifiers()).toHaveLength(2);
  });

  it("rejects the wrong event, a status that is not approved, and unsigned parameters", async () => {
    enableAttendance();
    const { c, key, token } = await player();
    const attempt = (params: Record<string, string>, unsigned = params) => claim(c.id, c.token, { proofs: [proofFor(c.id, key.publicKey, LUMA_PROVIDER_ID, params, unsigned)], publicKey: key.publicKey, secret: token });
    expect((await attempt(attendee({ event_id: "evt-another" }))).data.error).toContain("different Luma event");
    expect((await attempt(attendee({ approval_status: "pending_approval" }))).data.error).toContain("not approved");
    expect((await attempt(attendee({ event_id: "evt-another" }), attendee())).data.error).toContain("different Luma event");
    expect((await attempt({ event_id: "evt-test123", approval_status: "approved" })).data.error).toContain("attendee code");
    expect(campaign(c.id).attempts).toBe(4);
    expect(claimForCampaign(c.id)).toBeUndefined();
    expect(nullifiers()).toHaveLength(0);
    vi.stubEnv("LUMA_APPROVED_STATUSES", "approved, going");
    expect((await attempt(attendee({ approval_status: "GOING" }))).status).toBe(200);
  });

  it("never persists, returns or logs the Luma user id", async () => {
    enableAttendance();
    const logs = (["log", "info", "warn", "error", "debug"] as const).map(m => vi.spyOn(console, m).mockImplementation(() => {}));
    const first = await player(), second = await player();
    const responses = [
      await claim(first.c.id, first.c.token, { proofs: [proofFor(first.c.id, first.key.publicKey, LUMA_PROVIDER_ID, attendee({ approval_status: "declined" }))], publicKey: first.key.publicKey, secret: first.token }),
      await claim(first.c.id, first.c.token, { proofs: [proofFor(first.c.id, first.key.publicKey, LUMA_PROVIDER_ID, attendee())], publicKey: first.key.publicKey, secret: first.token }),
      await claim(second.c.id, second.c.token, { proofs: [proofFor(second.c.id, second.key.publicKey, LUMA_PROVIDER_ID, attendee())], publicKey: second.key.publicKey, secret: second.token }),
    ];
    expect(responses.map(r => r.status)).toEqual([400, 200, 409]);
    const surfaces = [dumpDb(), JSON.stringify(responses), JSON.stringify(logs.map(l => l.mock.calls))];
    for (const text of surfaces) for (const value of [LUMA_USER, "user_id", "extractedParameters"]) expect(text).not.toContain(value);
  });

  it("refuses to start or accept attendance proofs without a server secret, without charging an attempt", async () => {
    enableAttendance();
    vi.stubEnv("TOOL_APPROVAL_SECRET", "");
    const { c, key, token } = await player();
    expect((await reclaimRoute(post(c.id, c.token, { publicKey: key.publicKey }, "reclaim"), params(c.id))).status).toBe(503);
    expect((await claim(c.id, c.token, { proofs: [proofFor(c.id, key.publicKey, LUMA_PROVIDER_ID, attendee())], publicKey: key.publicKey, secret: token })).status).toBe(503);
    expect(campaign(c.id).attempts).toBe(0);
    expect(sdk.init).not.toHaveBeenCalled();
  });
});
