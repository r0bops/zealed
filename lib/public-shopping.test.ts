import { afterEach, expect, it, vi } from "vitest";
import { POST as chat } from "../app/api/agent/route";
import { POST as checkout } from "../app/api/orders/route";
import ChatPage from "../app/chat/page";

vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
// Retired routes must not even initialize the shopping agent or purchase client.
vi.mock("./bitrefill", () => { throw new Error("Purchase client must not be loaded"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("disables chat and legacy checkout even when model credentials are configured", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-test-key");
  const fetcher = vi.fn(() => { throw new Error("No external calls allowed"); });
  vi.stubGlobal("fetch", fetcher);
  for (const handler of [chat, checkout]) {
    const response = await handler();
    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ next: "/claim" });
  }
  expect(fetcher).not.toHaveBeenCalled();
});
it("redirects chat bookmarks to invitations", async () => {
  await expect(ChatPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/claim");
});
it("preserves access to history from old chat bookmarks", async () => {
  await expect(ChatPage({ searchParams: Promise.resolve({ view: "orders" }) })).rejects.toThrow("redirect:/orders");
});
