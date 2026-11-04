import { afterEach, beforeEach, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import { createShortLink, isShortLinkTarget, resolveShortLink } from "./short-links";
import { GET } from "../app/v/[id]/route";

// A Reclaim request link is ~1.7 KB because the signed request travels in the query string.
const longLink = `https://portal.reclaimprotocol.org/?template=${encodeURIComponent(JSON.stringify({ sessionId: "s1", pad: "x".repeat(1500) }))}`;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
beforeEach(() => { vi.stubEnv("RATE_LIMIT", "off"); });
afterEach(() => { vi.unstubAllEnvs(); delete (globalThis as { __zealedShortLinks?: unknown }).__zealedShortLinks; });

it("redirects a short id to the stored Reclaim link and keeps the QR small enough to scan", async () => {
  const id = createShortLink(longLink);
  expect(resolveShortLink(id)).toBe(longLink);
  const res = await GET(new Request(`https://zealed.test/v/${id}`), ctx(id));
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe(longLink);
  expect(res.headers.get("cache-control")).toBe("no-store");
  // The full link needs a version 30+ QR (~150 modules); the short one fits in a small, low-density code.
  expect(QRCode.create(longLink, { errorCorrectionLevel: "M" }).version).toBeGreaterThan(25);
  expect(QRCode.create(`https://tryzealed.xyz/v/${id}`, { errorCorrectionLevel: "M" }).version).toBeLessThanOrEqual(4);
});

it("refuses anything but Reclaim's https verification hosts, so it can't become an open redirect", () => {
  for (const bad of ["https://evil.example/?template=x", "http://portal.reclaimprotocol.org/?t=1", "https://user:pw@portal.reclaimprotocol.org/", "https://portal.reclaimprotocol.org.evil.example/", "javascript:alert(1)"]) {
    expect(isShortLinkTarget(bad)).toBe(false);
    expect(() => createShortLink(bad)).toThrow("Not a verification link");
  }
  expect(isShortLinkTarget("https://share.reclaimprotocol.org/verifier/?template=x")).toBe(true);
});

it("expires links after 15 minutes and answers unknown ids with a plain 404", async () => {
  const now = Date.now(), id = createShortLink(longLink, now);
  expect(resolveShortLink(id, now + 14 * 60_000)).toBe(longLink);
  expect(resolveShortLink(id, now + 15 * 60_000)).toBeNull();
  expect(resolveShortLink("not-a-valid-id")).toBeNull();
  const res = await GET(new Request("https://zealed.test/v/AAAAAAAAAAAAAAAA"), ctx("AAAAAAAAAAAAAAAA"));
  expect(res.status).toBe(404);
  expect(await res.text()).toContain("expired");
});
