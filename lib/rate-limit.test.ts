import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit, resetRateLimits } from "./rate-limit";

const req = (ip: string) => new Request("http://test/api", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });

beforeEach(() => { vi.stubEnv("RATE_LIMIT", "on"); resetRateLimits(); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("rate limiting", () => {
  it("allows up to the limit per client and scope, then returns 429 with Retry-After", async () => {
    for (let i = 0; i < 3; i++) expect(rateLimit(req("1.2.3.4"), "claim", 3, 60_000)).toBeNull();
    const limited = rateLimit(req("1.2.3.4"), "claim", 3, 60_000)!;
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await limited.json()).error).toMatch(/Too many attempts/);
  });
  it("keeps clients and scopes separate", () => {
    for (let i = 0; i < 3; i++) rateLimit(req("1.2.3.4"), "claim", 3, 60_000);
    expect(rateLimit(req("5.6.7.8"), "claim", 3, 60_000)).toBeNull(); // another client
    expect(rateLimit(req("1.2.3.4"), "select", 3, 60_000)).toBeNull(); // another endpoint
  });
  it("resets after the window", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) rateLimit(req("9.9.9.9"), "claim", 3, 60_000);
    expect(rateLimit(req("9.9.9.9"), "claim", 3, 60_000)?.status).toBe(429);
    vi.advanceTimersByTime(60_001);
    expect(rateLimit(req("9.9.9.9"), "claim", 3, 60_000)).toBeNull();
  });
  it("is off by default in the test environment and with RATE_LIMIT=off", () => {
    vi.stubEnv("RATE_LIMIT", "off");
    for (let i = 0; i < 20; i++) expect(rateLimit(req("1.1.1.1"), "claim", 1, 60_000)).toBeNull();
  });
});
