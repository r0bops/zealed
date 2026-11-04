import { afterEach, describe, expect, it, vi } from "vitest";
import { btcUsdRate } from "./btc-rate";

const g = globalThis as unknown as { __zealedBtcUsd?: unknown };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete g.__zealedBtcUsd;
});

describe("live BTC/USD rate", () => {
  it("uses Coinbase spot when it is sane", async () => {
    vi.stubEnv("BTC_USD_RATE", "78000");
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: { amount: "78278.06" } })));
    expect(await btcUsdRate()).toMatchObject({ rate: 78278.06, source: "coinbase" });
  });
  it("falls back to Kraken, then to the fixed rate", async () => {
    vi.stubEnv("BTC_USD_RATE", "78000");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("coinbase") ? json({}, 503) : json({ result: { XXBTZUSD: { c: ["78275.0", "1"] } } }))));
    expect(await btcUsdRate()).toMatchObject({ rate: 78275, source: "kraken" });
    delete g.__zealedBtcUsd;
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: { amount: "1000000" } }))); // implausible: >25% off
    expect(await btcUsdRate()).toMatchObject({ rate: 78000, source: "fixed" });
  });
  it("caches the rate instead of fetching on every quote", async () => {
    const fetcher = vi.fn(async () => json({ data: { amount: "78000" } }));
    vi.stubEnv("BTC_USD_RATE", "78000");
    vi.stubGlobal("fetch", fetcher);
    await btcUsdRate();
    await btcUsdRate();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
