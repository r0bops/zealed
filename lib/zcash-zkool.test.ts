import { afterEach, describe, expect, it, vi } from "vitest";
import { toReceipts, zecToZatoshi, zkoolBackend } from "./zcash-zkool";

const UA = "utest1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const g = globalThis as unknown as { __zealedZkoolVerified?: string; __zealedZkoolLastSync?: number };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete g.__zealedZkoolVerified;
  delete g.__zealedZkoolLastSync;
});

describe("zkool receipts", () => {
  it("converts decimal ZEC to zatoshis exactly", () => {
    expect(zecToZatoshi("0.37333334")).toBe(37_333_334);
    expect(zecToZatoshi(0.1)).toBe(10_000_000);
    expect(zecToZatoshi("1")).toBe(100_000_000);
  });

  it("keeps only received (scope 0) notes, with memo, pool and confirmations", () => {
    const receipts = toReceipts(
      [
        { txid: "a", height: 100, notes: [{ pool: 3, value: "0.37333334", scope: 0, memo: "ZLD-ABCDEFGH23 cart:xyz" }] },
        { txid: "change-only", height: 101, notes: [{ pool: 3, value: "0.5", scope: 1, memo: null }] },
        { txid: "mempool", height: null, notes: [{ pool: 1, value: "0.01", scope: 0, memo: "ZLD-ZZZZZZZZZZ" }] },
        { txid: "mixed", height: 99, notes: [{ pool: 0, value: "0.01", scope: 0 }, { pool: 3, value: "0.01", scope: 0 }] },
      ],
      102,
      UA,
    );
    expect(receipts).toEqual([
      { txid: "a", recipient: UA, memo: "ZLD-ABCDEFGH23 cart:xyz", amountZat: 37_333_334, pool: "ironwood", minedHeight: 100, confirmations: 3 },
      { txid: "mempool", recipient: UA, memo: "ZLD-ZZZZZZZZZZ", amountZat: 1_000_000, pool: "sapling", minedHeight: null, confirmations: 0 },
      { txid: "mixed", recipient: UA, memo: null, amountZat: 2_000_000, pool: "transparent", minedHeight: 99, confirmations: 4 },
    ]);
  });
});

describe("zkool backend", () => {
  it("fails closed when the address doesn't belong to the watched account", async () => {
    vi.stubEnv("ZKOOL_ACCOUNT_ID", "2");
    vi.stubEnv("ZCASH_RECEIVE_UA", UA);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { currentHeight: 5, addressByAccount: { ua: "utest1someoneelse0000000000000000000000" } } }))));
    await expect(zkoolBackend.receiveAddress()).rejects.toThrow("does not belong");
  });

  it("refuses to run without a watch-only account configured", async () => {
    vi.stubEnv("ZKOOL_ACCOUNT_ID", "");
    await expect(zkoolBackend.poll()).rejects.toThrow("ZKOOL_ACCOUNT_ID");
  });

  it("verifies, syncs, then reads receipts", async () => {
    vi.stubEnv("ZKOOL_ACCOUNT_ID", "2");
    vi.stubEnv("ZCASH_RECEIVE_UA", UA);
    const queries: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const { query } = JSON.parse(String(init.body)) as { query: string };
        queries.push(query.trim().split(/[\s({]/)[0] === "mutation" ? "sync" : query.includes("transactionsByAccount") ? "txs" : "verify");
        if (query.includes("addressByAccount")) return new Response(JSON.stringify({ data: { currentHeight: 50, addressByAccount: { ua: UA } } }));
        if (query.startsWith("mutation")) return new Response(JSON.stringify({ data: { synchronize: 50 } }));
        return new Response(JSON.stringify({ data: { currentHeight: 50, transactionsByAccount: [{ txid: "t1", height: 50, notes: [{ pool: 3, value: "0.01", scope: 0, memo: "ZLD-ABCDEFGH23" }] }] } }));
      }),
    );
    const receipts = await zkoolBackend.poll();
    expect(queries).toEqual(["verify", "sync", "txs"]);
    expect(receipts[0]).toMatchObject({ txid: "t1", amountZat: 1_000_000, pool: "ironwood", confirmations: 1, recipient: UA });
  });
});
