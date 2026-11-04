import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/health/route";
import { markWatcherStarted, markWatcherTick, watcherStatus } from "./watcher-status";
import { resetRateLimits } from "./rate-limit";

const UA = "utest1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const g = globalThis as unknown as { __zealedWatcherStatus?: unknown; __zealedHealthZkool?: unknown; __zealedRevision?: unknown };
const req = () => new Request("http://test/api/health", { headers: { "x-forwarded-for": "192.0.2.1" } });

beforeEach(() => {
  delete g.__zealedWatcherStatus; delete g.__zealedHealthZkool; delete g.__zealedRevision;
  vi.stubEnv("ZCASH_BACKEND", "fake"); vi.stubEnv("RATE_LIMIT", "off"); resetRateLimits();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("GET /api/health", () => {
  it("is unhealthy (503) until the watcher has started and ticked", async () => {
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).ok).toBe(false);
  });

  it("is healthy after a successful tick, and unhealthy after a failed one", async () => {
    markWatcherStarted(); markWatcherTick(true);
    const good = await GET(req());
    expect(good.status).toBe(200);
    expect(await good.json()).toMatchObject({ ok: true, backend: "fake", watcher: { lastError: false }, zkool: { chainHeight: null } });
    markWatcherTick(false);
    expect((await GET(req())).status).toBe(503);
  });

  it("reports zkool sync lag from one cached query, and never leaks addresses or env values", async () => {
    vi.stubEnv("ZCASH_BACKEND", "zkool"); vi.stubEnv("ZKOOL_ACCOUNT_ID", "1"); vi.stubEnv("ZCASH_RECEIVE_UA", UA);
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(String(init.body)).not.toContain("seed");
      return new Response(JSON.stringify({ data: { currentHeight: 4582636, accounts: [{ id: 1, height: 4582633 }, { id: 2, height: 1 }] } }));
    });
    vi.stubGlobal("fetch", fetcher);
    markWatcherStarted(); markWatcherTick(true);
    const body = await (await GET(req())).json();
    expect(body.zkool).toEqual({ chainHeight: 4582636, accountHeight: 4582633, lagBlocks: 3 });
    expect(body.ok).toBe(true);
    await GET(req()); // within 10 s: served from cache
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(Object.keys(body).sort()).toEqual(["backend", "ok", "revision", "watcher", "zkool"]);
    expect(JSON.stringify(body)).not.toContain("utest1");
  });

  it("is unhealthy when zkool is unreachable or far behind", async () => {
    vi.stubEnv("ZCASH_BACKEND", "zkool"); vi.stubEnv("ZKOOL_ACCOUNT_ID", "1"); vi.stubEnv("ZCASH_RECEIVE_UA", UA);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connection refused"); }));
    markWatcherStarted(); markWatcherTick(true);
    const down = await GET(req());
    expect(down.status).toBe(503);
    expect((await down.json()).zkool).toEqual({ chainHeight: null, accountHeight: null, lagBlocks: null });
    delete g.__zealedHealthZkool;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { currentHeight: 1000, accounts: [{ id: 1, height: 900 }] } }))));
    expect((await GET(req())).status).toBe(503); // 100 blocks behind
  });

  it("has its own rate limit", async () => {
    vi.stubEnv("RATE_LIMIT", "on");
    markWatcherStarted(); markWatcherTick(true);
    for (let i = 0; i < 30; i++) expect((await GET(req())).status).toBe(200);
    expect((await GET(req())).status).toBe(429);
    expect(watcherStatus().lastError).toBe(false);
  });
});
