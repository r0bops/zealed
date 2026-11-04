// Security edges of open sponsor sessions, complementing lib/sponsors.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { db } from "./db/client";
import { resetRateLimits } from "./rate-limit";
import { POST as sponsorsPost } from "../app/api/sponsors/route";
import { GET as campaignsGet, POST as campaignsPost } from "../app/api/campaigns/route";
import { GET as catalogGet } from "../app/api/campaigns/catalog/route";
import { GET as programGet, POST as programPost } from "../app/api/campaigns/[id]/program/route";
import { POST as approvePost } from "../app/api/campaigns/[id]/approve/route";

const admin = randomBytes(32).toString("base64url");
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "zealed-sponsor-sec-"));
  vi.stubEnv("DATABASE_PATH", join(dir, "test.db")); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("RATE_LIMIT", "off");
  vi.stubEnv("CAMPAIGN_ADMIN_TOKEN", admin); vi.stubEnv("TOOL_APPROVAL_SECRET", randomBytes(32).toString("base64url")); vi.stubEnv("BITREFILL_MODE", "fake");
  vi.stubEnv("SPONSOR_OPEN_ACCESS", "1"); vi.stubEnv("BITREFILL_PURCHASES", "test");
  resetRateLimits();
});
afterEach(() => {
  const g = globalThis as unknown as { __zealedDb?: ReturnType<typeof db> };
  g.__zealedDb?.$client.close(); delete g.__zealedDb;
  vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true });
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (bearer: string, body?: object, ip = "203.0.113.7") => new Request("http://localhost/api", {
  method: body ? "POST" : "GET",
  headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json", "x-forwarded-for": ip },
  body: body ? JSON.stringify(body) : undefined,
});
const campaignBody = () => ({
  title: "Meetup thanks", country: "IN", budgetCents: 300, productIds: [],
  program: { tasks: [{ kind: "quiz", title: "Pick B", options: ["A", "B"], answer: 1 }], prizes: [{ kind: "custom", title: "Sticker pack", description: "At the desk." }] },
});
async function newSponsor() {
  const res = await sponsorsPost(req(""));
  expect(res.status).toBe(201);
  return (await res.json()).token as string;
}
async function newCampaign(token: string) {
  const res = await campaignsPost(req(token, campaignBody()));
  expect(res.status).toBe(201);
  return (await res.json()).id as string;
}

describe("open sponsor sessions: security edges", () => {
  it("hides one sponsor's campaign from another on every management route", async () => {
    const a = await newSponsor(), b = await newSponsor();
    const id = await newCampaign(a);
    expect((await approvePost(req(b, {}), ctx(id))).status).toBe(404);
    expect((await programGet(req(b), ctx(id))).status).toBe(404);
    expect((await programPost(req(b, { action: "deliver" }), ctx(id))).status).toBe(404);
    const listB = await (await campaignsGet(req(b))).json();
    expect(listB.campaigns.map((c: { id: string }) => c.id)).not.toContain(id);
    // The owner still manages it.
    expect((await programGet(req(a), ctx(id))).status).toBe(200);
  });

  it("rejects forged, malformed and empty keys", async () => {
    await newSponsor();
    const forged = "zs_" + randomBytes(32).toString("base64url"); // right shape, never issued
    for (const bad of [forged, "zs_short", "not-a-key", "", admin.slice(0, -1) + (admin.endsWith("A") ? "B" : "A")]) {
      expect((await campaignsGet(req(bad))).status).toBe(401);
    }
    expect((await catalogGet(req(""))).status).toBe(401);
  });

  it("fails closed: existing sessions stop working when open access is off or purchases go live", async () => {
    const a = await newSponsor();
    expect((await campaignsGet(req(a))).status).toBe(200);
    vi.stubEnv("BITREFILL_PURCHASES", "live");
    expect((await campaignsGet(req(a))).status).toBe(401);
    expect((await sponsorsPost(req(""))).status).toBe(403);
    vi.stubEnv("BITREFILL_PURCHASES", "test"); vi.stubEnv("SPONSOR_OPEN_ACCESS", "0");
    expect((await campaignsGet(req(a))).status).toBe(401);
    // The operator token keeps working.
    expect((await campaignsGet(req(admin))).status).toBe(200);
  });

  it("lets the operator token see every sponsor's campaigns", async () => {
    const a = await newSponsor(), b = await newSponsor();
    const ids = [await newCampaign(a), await newCampaign(b)];
    const all = await (await campaignsGet(req(admin))).json();
    for (const id of ids) expect(all.campaigns.map((c: { id: string }) => c.id)).toContain(id);
  });

  it("rate-limits the Start funding button per client", async () => {
    vi.stubEnv("RATE_LIMIT", "on");
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await sponsorsPost(req("", undefined, "198.51.100.9"))).status);
    expect(codes.slice(0, 5).every((c) => c === 201)).toBe(true);
    expect(codes[5]).toBe(429);
    expect((await sponsorsPost(req("", undefined, "198.51.100.10"))).status).toBe(201); // another client is unaffected
  });
});
