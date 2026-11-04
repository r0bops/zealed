import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { db } from "./db/client";
import { attendeeHashBrowser } from "./attendee-hash";
import { attendeeHash, importAttendeeHashes, isApprovedAttendee } from "./attendees";
import { createCampaign } from "./campaigns";
import { generateKeyPair } from "./sodium";

const EVENT = "evt-TestEvent123";
const EMAIL = "Guest.One@Example.com";
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "zealed-attendees-"));
  vi.stubEnv("DATABASE_PATH", join(dir, "test.db")); vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("MISSION_MODE", "email"); vi.stubEnv("LUMA_EVENT_ID", `${EVENT},test-slug`);
  vi.stubEnv("FULFILL_SECRET_KEY", "zealed-key-v1-" + randomBytes(32).toString("base64url"));
  vi.stubEnv("RECLAIM_APP_ID", ""); vi.stubEnv("RECLAIM_APP_SECRET", ""); vi.stubEnv("RECLAIM_PROVIDER_ID", "");
});
afterEach(() => {
  const g = globalThis as unknown as { __zealedDb?: ReturnType<typeof db> };
  g.__zealedDb?.$client.close(); delete g.__zealedDb;
  vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true });
});

async function claim(campaign: { id: string; token: string }, email: string) {
  const { POST } = await import("../app/api/campaigns/[id]/claim/route");
  const key = await generateKeyPair();
  const res = await POST(
    new Request(`http://test/api/campaigns/${campaign.id}/claim`, {
      method: "POST",
      headers: { authorization: `Bearer ${campaign.token}`, "content-type": "application/json" },
      body: JSON.stringify({ emailHash: await attendeeHashBrowser(EVENT, email), publicKey: key.publicKey, secret: randomBytes(32).toString("base64url") }),
    }),
    { params: Promise.resolve({ id: campaign.id }) },
  );
  return { status: res.status, body: (await res.json()) as { id?: string; attendee?: string; error?: string } };
}
const newCampaign = () => createCampaign({ title: "Attendee reward", budgetCents: 500, country: "IN", productIds: ["bitrefill-esim-india"] });

describe("anonymous attendee email list", () => {
  it("hashes identically in the browser and in the import script, ignoring case and spaces", async () => {
    expect(await attendeeHashBrowser(EVENT, "  guest.one@example.COM ")).toBe(attendeeHash(EVENT, EMAIL));
    expect(attendeeHash(EVENT, EMAIL)).not.toBe(attendeeHash("evt-Other", EMAIL)); // per-event
  });

  it("lets an approved attendee claim once, across campaigns, and never stores the email", async () => {
    importAttendeeHashes(EVENT, [attendeeHash(EVENT, EMAIL)]);
    expect(isApprovedAttendee(EVENT, attendeeHash(EVENT, EMAIL))).toBe(true);

    const first = await claim(newCampaign(), EMAIL);
    expect(first.status).toBe(200);
    expect(first.body.attendee).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);

    const again = await claim(newCampaign(), EMAIL.toLowerCase());
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already claimed/i);

    const tables = db().$client.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const dump = JSON.stringify(tables.map((t) => db().$client.prepare(`SELECT * FROM "${t.name}"`).all()));
    expect(dump.toLowerCase()).not.toContain("guest.one");
    expect(dump).not.toContain("example.com");
  });

  it("rejects an email that isn't on the approved list", async () => {
    importAttendeeHashes(EVENT, [attendeeHash(EVENT, EMAIL)]);
    const res = await claim(newCampaign(), "stranger@example.com");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't on the approved attendee list/);
  });
});
