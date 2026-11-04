import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addressExchangePlan,
  assertAmountZec,
  assertInt,
  assertMemo,
  assertName,
  assertPczt,
  assertUnifiedAddress,
  frost,
  parseFrostUrls,
  parseIdList,
  parsePaymentArgs,
  pollUntil,
} from "./frost";
import { base64UrlNoPad } from "./zip321";

const UA1 = "utest1" + "q".repeat(60);
const UA2 = "utest1" + "p".repeat(60);
const UA3 = "utest1" + "z".repeat(60);
const URL1 = "http://127.0.0.1:8001/graphql";
const PCZT = "deadbeef00";

type Call = { url: string; query: string; headers: Record<string, string> };

/** Stub fetch: answers each query with `respond(query)` and records every call. */
function stubZkool(respond: (query: string) => unknown, status = 200) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const { query } = JSON.parse(String(init.body)) as { query: string };
      calls.push({ url, query, headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify(respond(query)), { status });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("frost input validation", () => {
  it("accepts only bounded integers", () => {
    expect(assertInt("7", "id")).toBe(7);
    expect(assertInt(3, "id", 1, 3)).toBe(3);
    for (const bad of [0, -1, 1.5, "1 }", "", null, undefined, Number.NaN, 2 ** 31, "1e3x"]) {
      expect(() => assertInt(bad, "id")).toThrow("id must be an integer");
    }
  });

  it("accepts only testnet unified addresses", () => {
    expect(assertUnifiedAddress(UA1)).toBe(UA1);
    for (const bad of ["u1" + "q".repeat(60), "ztestsapling1" + "q".repeat(60), "utest1short", `${UA1}") { x }`, "utest1" + "b".repeat(60), 42]) {
      expect(() => assertUnifiedAddress(bad)).toThrow("utest1");
    }
  });

  it("normalizes ZEC amounts to 8 decimals and rejects junk", () => {
    expect(assertAmountZec("0.01")).toBe("0.01000000");
    expect(assertAmountZec(0.5)).toBe("0.50000000");
    expect(assertAmountZec("12.34567891")).toBe("12.34567891");
    for (const bad of ["0", "-1", "1e-3", "0.000000001", "abc", "", "1,5", "99999999"]) expect(() => assertAmountZec(bad)).toThrow();
  });

  it("bounds memos, names and PCZTs", () => {
    expect(assertMemo('he said "hi"')).toBe('he said "hi"');
    expect(() => assertMemo("x".repeat(513))).toThrow("512 bytes");
    expect(assertName("zealed-sponsor-treasury")).toBe("zealed-sponsor-treasury");
    expect(() => assertName('x") { evil }')).toThrow();
    expect(assertPczt("DEADBEEF")).toBe("deadbeef");
    expect(() => assertPczt("abc")).toThrow("hex");
    expect(() => assertPczt('00"')).toThrow("hex");
  });

  it("parses FROST_URLS and id lists", () => {
    expect(parseFrostUrls(` ${URL1}, http://127.0.0.1:8002/graphql ,http://127.0.0.1:8003/graphql`)).toHaveLength(3);
    expect(() => parseFrostUrls(URL1)).toThrow("must list 3");
    expect(() => parseFrostUrls(`${URL1},${URL1},http://127.0.0.1:8003/graphql`)).toThrow("its own zkool");
    expect(() => parseFrostUrls(`${URL1},ftp://x/graphql,http://127.0.0.1:8003/graphql`)).toThrow("not http");
    expect(() => parseFrostUrls(`${URL1},nope,http://127.0.0.1:8003/graphql`)).toThrow("not a URL");
    expect(parseIdList("7, 5,5", 3, "FROST_ACCOUNT_IDS")).toEqual([7, 5, 5]);
    expect(() => parseIdList("7,5", 3, "FROST_ACCOUNT_IDS")).toThrow("must list 3");
    expect(() => parseIdList("7,x,5", 3, "FROST_ACCOUNT_IDS")).toThrow("FROST_ACCOUNT_IDS[2]");
  });

  it("parses positional payments and ZIP-321 URIs", () => {
    expect(parsePaymentArgs([UA1, "0.02", "reward", "ZLD-ABC"])).toEqual({ address: UA1, amount: "0.02000000", memo: "reward ZLD-ABC" });
    expect(parsePaymentArgs([`zcash:${UA2}?amount=0.37333334&memo=${base64UrlNoPad("ZLD-ABCDEFGH23 cart:x")}`])).toEqual({
      address: UA2,
      amount: "0.37333334",
      memo: "ZLD-ABCDEFGH23 cart:x",
    });
    expect(() => parsePaymentArgs([])).toThrow("usage");
    expect(() => parsePaymentArgs([UA1])).toThrow("amount");
    expect(() => parsePaymentArgs([`zcash:${UA1}?address.1=${UA2}&amount=1`])).toThrow("multi-recipient");
  });

  it("plans the address exchange: every peer's address, never one's own", () => {
    const plan = addressExchangePlan([UA1, UA2, UA3]);
    expect(plan).toHaveLength(6);
    expect(plan.filter((p) => p.instance === 0)).toEqual([
      { instance: 0, idParticipant: 2, address: UA2 },
      { instance: 0, idParticipant: 3, address: UA3 },
    ]);
    expect(plan.every((p) => p.idParticipant !== p.instance + 1)).toBe(true);
    expect(() => addressExchangePlan([UA1, "bogus", UA3])).toThrow("participant 2 address");
  });
});

describe("frost GraphQL client", () => {
  it("builds dkgStart with the exact arguments and returns the mailbox address", async () => {
    const calls = stubZkool(() => ({ data: { dkgStart: UA1 } }));
    const addr = await frost.dkgStart(URL1, { name: "zealed-sponsor-treasury", threshold: 2, participants: 3, messageAccount: 4, idParticipant: 2 });
    expect(addr).toBe(UA1);
    expect(calls[0].url).toBe(URL1);
    expect(calls[0].query).toBe('mutation { dkgStart(name: "zealed-sponsor-treasury", threshold: 2, participants: 3, messageAccount: 4, idParticipant: 2) }');
  });

  it("never forwards ZKOOL_JWT to FROST instances", async () => {
    vi.stubEnv("ZKOOL_JWT", "secret-token");
    const calls = stubZkool(() => ({ data: { currentHeight: 10 } }));
    await frost.currentHeight(URL1);
    expect(calls[0].headers).not.toHaveProperty("authorization");
  });

  it("validates before any request is sent", async () => {
    const calls = stubZkool(() => ({ data: {} }));
    await expect(frost.dkgStart(URL1, { name: "t", threshold: 2, participants: 3, messageAccount: 4, idParticipant: 4 })).rejects.toThrow("participant id");
    await expect(frost.dkgStart(URL1, { name: "t", threshold: 4, participants: 3, messageAccount: 4, idParticipant: 1 })).rejects.toThrow("threshold");
    await expect(frost.dkgSetAddress(URL1, 2, "not-an-address")).rejects.toThrow("utest1");
    await expect(frost.frostSign(URL1, { idCoordinator: 1, idAccount: 0, messageAccount: 4, pczt: PCZT })).rejects.toThrow("idAccount");
    await expect(frost.frostSign(URL1, { idCoordinator: 1, idAccount: 5, messageAccount: 4, pczt: "zz" })).rejects.toThrow("hex");
    await expect(frost.synchronize(URL1, [1, -2])).rejects.toThrow("account id");
    expect(calls).toHaveLength(0);
  });

  it("rejects a dkgStart answer that is not a unified address", async () => {
    stubZkool(() => ({ data: { dkgStart: "garbage" } }));
    await expect(frost.dkgStart(URL1, { name: "t", threshold: 2, participants: 3, messageAccount: 4, idParticipant: 1 })).rejects.toThrow("dkgStart address");
  });

  it("builds dkgSetAddress, frostSign and the step/cancel mutations", async () => {
    const calls = stubZkool((query) => {
      if (query.includes("dkgSetAddress")) return { data: { dkgSetAddress: true } };
      if (query.includes("frostSign")) return { data: { frostSign: true } };
      if (query.includes("doDkg")) return { data: { doDkg: true } };
      return { data: { frostCancel: true } };
    });
    expect(await frost.dkgSetAddress(URL1, 3, UA3)).toBe(true);
    expect(await frost.frostSign(URL1, { idCoordinator: 1, idAccount: 5, messageAccount: 4, pczt: PCZT })).toBe(true);
    expect(await frost.step(URL1)).toBe(true);
    expect(await frost.frostCancel(URL1)).toBe(true);
    expect(calls.map((c) => c.query)).toEqual([
      `mutation { dkgSetAddress(idParticipant: 3, address: "${UA3}") }`,
      `mutation { frostSign(idCoordinator: 1, idAccount: 5, messageAccount: 4, pczt: "${PCZT}") }`,
      "mutation { doDkg }",
      "mutation { frostCancel }",
    ]);
  });

  it("escapes memos in prepareSend and returns the PCZT", async () => {
    const calls = stubZkool(() => ({ data: { prepareSend: "ABCD" } }));
    const memo = 'x"}]}) { accounts { seed } } #';
    const pczt = await frost.prepareSend(URL1, 5, { address: UA2, amount: "0.01000000", memo });
    expect(pczt).toBe("abcd");
    expect(calls[0].query).toBe(`{ prepareSend(idAccount: 5, payment: { recipients: [{ address: "${UA2}", amount: 0.01000000, memo: ${JSON.stringify(memo)} }] }) }`);
  });

  it("lists accounts by name without asking for seeds", async () => {
    const calls = stubZkool(() => ({ data: { accounts: [{ id: 7, name: "zealed-frost-msg" }] } }));
    expect(await frost.accounts(URL1, "zealed-frost-msg")).toEqual([{ id: 7, name: "zealed-frost-msg" }]);
    expect(calls[0].query).toBe('{ accounts(accountFilter: { name: "zealed-frost-msg" }) { id name } }');
    expect(calls[0].query).not.toContain("seed");
  });

  it("finds the group account only once it holds FROST params", async () => {
    let done = false;
    stubZkool((query) => {
      if (query.includes("accounts")) return { data: { accounts: [{ id: 9, name: "zealed-sponsor-treasury" }] } };
      return { data: { frostParams: done ? { id: 2, n: 3, t: 2, dkgVersion: 2 } : null } };
    });
    expect(await frost.findGroupAccount(URL1, "zealed-sponsor-treasury")).toBeNull();
    done = true;
    expect(await frost.findGroupAccount(URL1, "zealed-sponsor-treasury")).toEqual({ id: 9, params: { id: 2, n: 3, t: 2, dkgVersion: 2 } });
  });

  it("builds a multi-recipient pay for funding message accounts", async () => {
    const calls = stubZkool(() => ({ data: { pay: "txid1" } }));
    expect(await frost.pay(URL1, 3, [{ address: UA1, amount: "0.01" }, { address: UA2, amount: "0.01", memo: "m" }])).toBe("txid1");
    expect(calls[0].query).toBe(`mutation { pay(idAccount: 3, payment: { recipients: [{ address: "${UA1}", amount: 0.01000000 }, { address: "${UA2}", amount: 0.01000000, memo: "m" }], confirmations: 1 }) }`);
    await expect(frost.pay(URL1, 3, [])).rejects.toThrow("at least one recipient");
  });

  it("sums shielded balances in zatoshis and merges mined + mempool txids", async () => {
    stubZkool((query) =>
      query.includes("balanceByAccount")
        ? { data: { balanceByAccount: { sapling: "0", orchard: "0.001", ironwood: "0.01999999" } } }
        : { data: { transactionsByAccount: [{ txid: "a", height: 5, value: "-0.0001" }], unconfirmedByAccount: [{ txid: "b", value: "-0.01" }] } },
    );
    expect(await frost.balanceZat(URL1, 4)).toBe(2_099_999);
    expect(await frost.txids(URL1, 5)).toEqual([
      { txid: "a", height: 5, value: "-0.0001" },
      { txid: "b", height: null, value: "-0.01" },
    ]);
  });
});

describe("frost error handling", () => {
  it("surfaces GraphQL errors and HTTP failures", async () => {
    stubZkool(() => ({ errors: [{ message: "A signing session is in progress; finish or cancel it first" }] }));
    await expect(frost.frostSign(URL1, { idCoordinator: 1, idAccount: 5, messageAccount: 4, pczt: PCZT })).rejects.toThrow("signing session is in progress");
    stubZkool(() => ({}), 500);
    await expect(frost.currentHeight(URL1)).rejects.toThrow("zkool request failed (500)");
  });

  it("treats frostSign returning false as a failure", async () => {
    stubZkool(() => ({ data: { frostSign: false } }));
    await expect(frost.frostSign(URL1, { idCoordinator: 1, idAccount: 5, messageAccount: 4, pczt: PCZT })).rejects.toThrow("returned false");
  });

  it("reports a sync that collides with the protocol driver as transient", async () => {
    stubZkool(() => ({ errors: [{ message: "Synchronization already running" }] }));
    expect(await frost.synchronize(URL1, [5])).toBe(false);
    stubZkool(() => ({ errors: [{ message: "Account 5 not found" }] }));
    await expect(frost.synchronize(URL1, [5])).rejects.toThrow("not found");
    stubZkool(() => ({ data: { synchronize: 100 } }));
    expect(await frost.synchronize(URL1, [5, 6])).toBe(true);
  });

  it("polls until a value appears, or times out with a clear message", async () => {
    let n = 0;
    expect(await pollUntil(async () => (++n >= 3 ? "done" : null), { intervalMs: 1, timeoutMs: 1_000, what: "x" })).toBe("done");
    expect(n).toBe(3);
    await expect(pollUntil(async () => null, { intervalMs: 5, timeoutMs: 12, what: "the DKG" })).rejects.toThrow("waiting for the DKG");
  });
});
