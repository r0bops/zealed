import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "./db/client";
import { searchProducts } from "./bitrefill";

// Bitrefill's search ranks worldwide and ignores the country, like the live API did on 4 Nov for "esim".
const esim = (country: string, n = 0) => ({ id: `bitrefill-esim-${country.toLowerCase()}-${n}`, name: `Bitrefill eSIM ${country} ${n}`, categories: ["esim"], recipient_type: "mixed", country_code: country, currency: "USD", packages: [{ value: "1GB, 7 Days", price: 300 }] });
const elsewhere = Array.from({ length: 50 }, (_, i) => esim(["US", "GB", "TH", "AE", "EU"][i % 5], i));
let dir: string, searches: URLSearchParams[];
function mockBitrefill(pages: (q: string, start: number) => unknown[]) {
  searches = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/accounts/balance")) return Response.json({ data: { balance: 0, currency: "USD" } });
    searches.push(u.searchParams);
    return Response.json({ data: pages(u.searchParams.get("q")!, Number(u.searchParams.get("start"))) });
  }));
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "zealed-catalog-"));
  vi.stubEnv("DATABASE_PATH", join(dir, "test.db")); vi.stubEnv("BITREFILL_API_KEY", "test-key"); vi.stubEnv("BITREFILL_MODE", "");
  vi.stubEnv("BITREFILL_USE_TEST_PRODUCTS", "false");
});
afterEach(() => {
  const g = globalThis as unknown as { __zealedDb?: ReturnType<typeof db> };
  g.__zealedDb?.$client.close(); delete g.__zealedDb;
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true });
});

it("reads further pages when the first page is all other countries", async () => {
  mockBitrefill((_, start) => start === 0 ? elsewhere : start === 50 ? [esim("IN"), ...elsewhere.slice(0, 10)] : []);
  const found = await searchProducts("esim", "IN");
  expect(found.map(p => p.id)).toEqual(["bitrefill-esim-in-0"]);
  // Page two was short, so the search stopped there, and India had a product, so no name fallback.
  expect(searches.map(s => [s.get("q"), s.get("start"), s.get("limit")])).toEqual([["esim", "0", "50"], ["esim", "50", "50"]]);
});

it("falls back to the query plus the country name when the pages hold nothing for that country", async () => {
  mockBitrefill(q => q === "esim Portugal" ? [esim("PT")] : elsewhere.slice(0, 7));
  const found = await searchProducts("esim", "PT");
  expect(found.map(p => p.id)).toEqual(["bitrefill-esim-pt-0"]);
  expect(searches.map(s => s.get("q"))).toEqual(["esim", "esim Portugal"]);
  // Cached for ten minutes: a repeat search makes no new calls.
  await searchProducts("esim", "PT");
  expect(searches).toHaveLength(2);
});

it("stops after one page when the country already has enough products", async () => {
  mockBitrefill(() => Array.from({ length: 50 }, (_, i) => esim("IN", i)));
  expect((await searchProducts("esim", "IN")).length).toBe(50);
  expect(searches).toHaveLength(1);
});
