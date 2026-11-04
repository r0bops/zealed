import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { db } from "./db/client";
import { GET as sponsorsGet, POST as sponsorsPost } from "../app/api/sponsors/route";
import { GET as campaignsGet, POST as campaignsPost } from "../app/api/campaigns/route";
import { GET as programGet } from "../app/api/campaigns/[id]/program/route";
import { POST as approvePost } from "../app/api/campaigns/[id]/approve/route";

const admin = randomBytes(32).toString("base64url");
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "zealed-sponsors-"));
  vi.stubEnv("DATABASE_PATH", join(dir, "test.db")); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("RATE_LIMIT", "off");
  vi.stubEnv("CAMPAIGN_ADMIN_TOKEN", admin); vi.stubEnv("TOOL_APPROVAL_SECRET", randomBytes(32).toString("base64url")); vi.stubEnv("BITREFILL_MODE", "fake");
  vi.stubEnv("SPONSOR_OPEN_ACCESS", "1"); vi.stubEnv("BITREFILL_PURCHASES", "test");
});
afterEach(() => {
  const g = globalThis as unknown as { __zealedDb?: ReturnType<typeof db> };
  g.__zealedDb?.$client.close(); delete g.__zealedDb;
  vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true });
});
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (bearer: string, body?: object) => new Request("http://localhost/api", {
  method: body ? "POST" : "GET",
  headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
  body: body ? JSON.stringify(body) : undefined,
});
// Custom-only programs need no Bitrefill catalog lookup.
const campaignBody = (budgetCents = 300) => ({
  title: "Meetup thanks", country: "IN", budgetCents, productIds: [],
  program: { tasks: [{ kind: "quiz", title: "Pick B", options: ["A", "B"], answer: 1 }], prizes: [{ kind: "custom", title: "Sticker pack", description: "At the desk." }] },
});
async function newSponsor() {
  const res = await sponsorsPost(req(""));
  expect(res.status).toBe(201);
  return (await res.json()).token as string;
}

it("lets anyone start funding without a code, and keeps each sponsor's campaigns private", async () => {
  expect(await (await sponsorsGet()).json()).toMatchObject({ open: true, maxBudgetCents: 500 });
  const alice = await newSponsor(), bob = await newSponsor();
  expect(alice).toMatch(/^zs_[A-Za-z0-9_-]{43}$/);
  const created = await campaignsPost(req(alice, campaignBody()));
  expect(created.status).toBe(201);
  const { id } = await created.json();

  const mine = await (await campaignsGet(req(alice))).json();
  expect(mine.campaigns.map((c: { id: string }) => c.id)).toEqual([id]);
  expect(mine.openSponsor).toBe(true);
  expect((await (await campaignsGet(req(bob))).json()).campaigns).toEqual([]);
  expect((await programGet(req(bob), ctx(id))).status).toBe(404);
  expect((await approvePost(req(bob, {}), ctx(id))).status).toBe(404);
  expect((await programGet(req(alice), ctx(id))).status).toBe(200);

  const all = await (await campaignsGet(req(admin))).json();
  expect(all.campaigns.map((c: { id: string }) => c.id)).toEqual([id]);
  expect(all.openSponsor).toBe(false);
});

it("caps open sponsors and stores only a hash of their key", async () => {
  const alice = await newSponsor();
  expect((await campaignsPost(req(alice, campaignBody(600)))).status).toBe(400);
  vi.stubEnv("OPEN_SPONSOR_CAMPAIGNS_PER_DAY", "1");
  expect((await campaignsPost(req(alice, campaignBody()))).status).toBe(201);
  expect((await campaignsPost(req(alice, campaignBody()))).status).toBe(429);
  const rows = db().$client.prepare("SELECT id FROM sponsors").all() as { id: string }[];
  expect(rows).toHaveLength(1);
  expect(rows[0].id).not.toContain(alice.slice(3));
  expect((await campaignsGet(req("zs_" + "x".repeat(43)))).status).toBe(401);
});

it("turns open sponsorship off for live purchases or when not enabled", async () => {
  vi.stubEnv("BITREFILL_PURCHASES", "live");
  expect((await sponsorsPost(req(""))).status).toBe(403);
  expect(await (await sponsorsGet()).json()).toMatchObject({ open: false });
  vi.stubEnv("BITREFILL_PURCHASES", "test"); vi.stubEnv("SPONSOR_OPEN_ACCESS", "0");
  expect((await sponsorsPost(req(""))).status).toBe(403);
  expect((await campaignsGet(req(admin))).status).toBe(200);
});
