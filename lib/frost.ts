// FROST threshold custody for the sponsor treasury, over zkool_graphql.
//
// Every participant (organizer, co-sponsor, Zealed) runs its OWN zkool_graphql instance: a DKG or
// signing session is wallet-wide (dkgStart/doDkg/dkgCancel/frostCancel take no account), so one
// wallet can hold only one participant. Participants never talk to each other directly. Each one
// pays for small shielded transactions from its "message account" and the protocol packages travel
// as encrypted memos; the instance's protocol driver syncs and advances on every new block.
//
// DKG (all n participants, every instance):
//   1. dkgStart(name, threshold, participants, messageAccount, idParticipant) -> this participant's
//      mailbox address
//   2. dkgSetAddress(j, address_j) for every other participant j
//   3. the driver publishes round 0, 1 and 2 (one mined memo each, all n must arrive per round),
//      then creates the group account under `name`, with the same UA/UFVK on every instance
// Signing (exactly t participants; more than t aborts the session):
//   1. the coordinator builds a PCZT with prepareSend on its group account
//   2. the coordinator and t-1 others call frostSign with the same PCZT and coordinator id
//   3. the driver runs announce -> commitments -> signing packages -> shares, then the coordinator
//      aggregates and broadcasts the transaction from its own instance
//
// FROST is disabled on a zkool started with -j (token auth), so these instances must run with
// --allow-unauthenticated on localhost. Never select `seed` from `accounts`.
import { zecToZatoshi, zkoolQuery } from "./zcash-zkool";
import { decodeBase64UrlNoPad } from "./zip321";

const NO_JWT = ""; // FROST needs an unauthenticated instance; never forward ZKOOL_JWT to other URLs
const MAX_INT = 2_147_483_647; // GraphQL Int is 32-bit
const BECH32 = "[02-9ac-hj-np-z]";
const UA_RE = new RegExp(`^utest1${BECH32}{20,}$`);
const HEX_RE = /^(?:[0-9a-f]{2})+$/i;

export const DEFAULT_TREASURY_NAME = "zealed-sponsor-treasury";

// ---------- validation (everything interpolated into a query goes through one of these) ----------

export function assertInt(value: unknown, label: string, min = 1, max = MAX_INT): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < min || n > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return n;
}

export const assertAccountId = (value: unknown, label = "account id") => assertInt(value, label, 1);

export function assertParticipantId(value: unknown, n: number, label = "participant id"): number {
  return assertInt(value, label, 1, assertInt(n, "participant count", 2, 255));
}

/** A testnet unified address (utest1…), bech32 charset only. */
export function assertUnifiedAddress(value: unknown, label = "address"): string {
  if (typeof value !== "string" || !UA_RE.test(value) || value.length > 1024) {
    throw new Error(`${label} must be a utest1… unified address`);
  }
  return value;
}

/** A positive ZEC amount with at most 8 decimals, normalized to "0.01000000". */
export function assertAmountZec(value: unknown): string {
  const s = typeof value === "number" ? value.toFixed(8) : String(value ?? "").trim();
  if (!/^\d{1,8}(?:\.\d{1,8})?$/.test(s)) throw new Error("amount must be a ZEC value with at most 8 decimals");
  const zat = zecToZatoshi(s);
  if (!(zat > 0)) throw new Error("amount must be positive");
  if (zat > 21_000_000 * 1e8) throw new Error("amount exceeds the ZEC supply");
  return `${Math.floor(zat / 1e8)}.${String(zat % 1e8).padStart(8, "0")}`;
}

/** Memos are free text up to 512 bytes; JSON.stringify yields a valid GraphQL string literal. */
export function assertMemo(value: unknown): string {
  if (typeof value !== "string") throw new Error("memo must be text");
  if (Buffer.byteLength(value, "utf8") > 512) throw new Error("memo over 512 bytes");
  return value;
}

export function assertName(value: unknown, label = "name"): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/.test(value)) {
    throw new Error(`${label} must be 1-64 letters, digits, spaces, dots, dashes or underscores`);
  }
  return value;
}

export function assertPczt(value: unknown): string {
  if (typeof value !== "string" || !HEX_RE.test(value)) throw new Error("PCZT must be a hex string");
  return value.toLowerCase();
}

/** FROST_URLS: comma-separated http(s) GraphQL endpoints, one per participant, in participant order. */
export function parseFrostUrls(raw: string | undefined, expected = 3): string[] {
  const urls = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (urls.length !== expected) throw new Error(`FROST_URLS must list ${expected} zkool GraphQL URLs (one per participant), got ${urls.length}`);
  for (const u of urls) {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      throw new Error(`FROST_URLS: not a URL: ${u}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error(`FROST_URLS: not http(s): ${u}`);
  }
  if (new Set(urls).size !== urls.length) throw new Error("FROST_URLS: each participant needs its own zkool instance");
  return urls;
}

/** Comma-separated integers, e.g. FROST_ACCOUNT_IDS=7,5,5. */
export function parseIdList(raw: string | undefined, expected: number, label: string): number[] {
  const parts = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length !== expected) throw new Error(`${label} must list ${expected} account ids, got ${parts.length}`);
  return parts.map((p, i) => assertAccountId(p, `${label}[${i + 1}]`));
}

// ---------- payment arguments ----------

export interface PaymentRequest {
  address: string;
  amount: string; // normalized decimal ZEC
  memo: string;
}

/** `<address> <amountZec> <memo…>` or a ZIP-321 `zcash:<ua>?amount=…&memo=<base64url>` URI. */
export function parsePaymentArgs(args: string[]): PaymentRequest {
  const [first, ...rest] = args;
  if (!first) throw new Error("usage: <utest1 address> <amountZec> <memo>  or  'zcash:utest1…?amount=…&memo=…'");
  if (first.startsWith("zcash:")) {
    const [address, query = ""] = first.slice("zcash:".length).split("?");
    const params = new URLSearchParams(query);
    if (params.has("address.1") || params.has("amount.1")) throw new Error("multi-recipient zcash: URIs are not supported");
    return {
      address: assertUnifiedAddress(address),
      amount: assertAmountZec(params.get("amount") ?? ""),
      memo: assertMemo(decodeBase64UrlNoPad(params.get("memo") ?? "")),
    };
  }
  const [amount, ...memo] = rest;
  return { address: assertUnifiedAddress(first), amount: assertAmountZec(amount ?? ""), memo: assertMemo(memo.join(" ")) };
}

// ---------- DKG planning ----------

/** Which dkgSetAddress calls each instance makes: every other participant's address, never its own. */
export function addressExchangePlan(addresses: string[]): { instance: number; idParticipant: number; address: string }[] {
  const plan: { instance: number; idParticipant: number; address: string }[] = [];
  addresses.forEach((_, i) => {
    addresses.forEach((address, j) => {
      if (i !== j) plan.push({ instance: i, idParticipant: j + 1, address: assertUnifiedAddress(address, `participant ${j + 1} address`) });
    });
  });
  return plan;
}

// ---------- the client ----------

export interface FrostParams {
  id: number; // this instance's participant id
  n: number;
  t: number;
  dkgVersion: number;
}
export interface Addresses {
  ua: string | null;
  orchard: string | null;
  ironwood: string | null;
}
export interface TxSummary {
  txid: string;
  height: number | null;
  value: string | number;
}
export interface DecodedPczt {
  fee: string | number;
  recipients: { pool: number; value: string | number; address: string; memo: string | null }[];
}

const q = <T>(url: string, query: string) => zkoolQuery<T>(query, url, NO_JWT);
const str = (s: string) => JSON.stringify(s);

/** A sync that collides with the protocol driver's own pass says so; it is transient. */
export function isTransientSyncError(e: unknown): boolean {
  const m = (e as Error)?.message ?? "";
  return /already running|busy|timeout|aborted|database is locked/i.test(m);
}

export const frost = {
  async currentHeight(url: string): Promise<number> {
    return (await q<{ currentHeight: number }>(url, `{ currentHeight }`)).currentHeight;
  },

  /** Account ids and names only (the accounts type also exposes seeds; never ask for them). */
  async accounts(url: string, name?: string): Promise<{ id: number; name: string }[]> {
    const filter = name === undefined ? "" : `(accountFilter: { name: ${str(assertName(name))} })`;
    return (await q<{ accounts: { id: number; name: string }[] }>(url, `{ accounts${filter} { id name } }`)).accounts ?? [];
  },

  /** A new seed account (the seed stays inside that zkool's wallet.db). */
  async createAccount(url: string, name: string, birth: number): Promise<number> {
    const d = await q<{ createAccount: number }>(
      url,
      `mutation { createAccount(newAccount: { name: ${str(assertName(name))}, key: "", useInternal: false, aindex: 0, birth: ${assertInt(birth, "birth")} }) }`,
    );
    return assertAccountId(d.createAccount, "created account id");
  },

  async address(url: string, idAccount: number): Promise<Addresses> {
    const d = await q<{ addressByAccount: Addresses }>(url, `{ addressByAccount(idAccount: ${assertAccountId(idAccount)}) { ua orchard ironwood } }`);
    return d.addressByAccount;
  },

  async ufvk(url: string, idAccount: number): Promise<string> {
    return (await q<{ unifiedFullViewingKey: string }>(url, `{ unifiedFullViewingKey(idAccount: ${assertAccountId(idAccount)}) }`)).unifiedFullViewingKey;
  },

  /** Spendable-ish shielded balance in zatoshis (Orchard + Ironwood + Sapling). */
  async balanceZat(url: string, idAccount: number): Promise<number> {
    const d = await q<{ balanceByAccount: { sapling: string; orchard: string; ironwood: string } }>(
      url,
      `{ balanceByAccount(idAccount: ${assertAccountId(idAccount)}) { sapling orchard ironwood } }`,
    );
    const b = d.balanceByAccount;
    return zecToZatoshi(b.sapling) + zecToZatoshi(b.orchard) + zecToZatoshi(b.ironwood);
  },

  /** Returns false (instead of throwing) when the sync collided with the driver's pass. */
  async synchronize(url: string, ids: number[]): Promise<boolean> {
    const list = ids.map((id) => assertAccountId(id)).join(", ");
    try {
      await q(url, `mutation { synchronize(idAccounts: [${list}], fast: false) }`);
      return true;
    } catch (e) {
      if (isTransientSyncError(e)) return false;
      throw e;
    }
  },

  /** One ordinary (single-key) payment with any number of recipients; returns the txid. */
  async pay(url: string, idAccount: number, recipients: { address: string; amount: string; memo?: string }[]): Promise<string> {
    if (!recipients.length) throw new Error("pay needs at least one recipient");
    const list = recipients
      .map((r) => `{ address: ${str(assertUnifiedAddress(r.address))}, amount: ${assertAmountZec(r.amount)}${r.memo ? `, memo: ${str(assertMemo(r.memo))}` : ""} }`)
      .join(", ");
    const d = await q<{ pay: string }>(url, `mutation { pay(idAccount: ${assertAccountId(idAccount)}, payment: { recipients: [${list}], confirmations: 1 }) }`);
    return d.pay;
  },

  // --- DKG ---

  /** Returns this participant's DKG mailbox address, to hand to the other participants. */
  async dkgStart(
    url: string,
    p: { name: string; threshold: number; participants: number; messageAccount: number; idParticipant: number },
  ): Promise<string> {
    const n = assertInt(p.participants, "participants", 2, 255);
    const t = assertInt(p.threshold, "threshold", 2, n);
    const d = await q<{ dkgStart: string }>(
      url,
      `mutation { dkgStart(name: ${str(assertName(p.name))}, threshold: ${t}, participants: ${n}, messageAccount: ${assertAccountId(p.messageAccount, "messageAccount")}, idParticipant: ${assertParticipantId(p.idParticipant, n)}) }`,
    );
    return assertUnifiedAddress(d.dkgStart, "dkgStart address");
  },

  async dkgSetAddress(url: string, idParticipant: number, address: string): Promise<boolean> {
    const d = await q<{ dkgSetAddress: boolean }>(
      url,
      `mutation { dkgSetAddress(idParticipant: ${assertInt(idParticipant, "idParticipant", 1, 255)}, address: ${str(assertUnifiedAddress(address))}) }`,
    );
    return d.dkgSetAddress === true;
  },

  /** Runs one protocol pass now (DKG or signing) and reports its error, if any. A no-op when idle. */
  async step(url: string): Promise<boolean> {
    return (await q<{ doDkg: boolean }>(url, `mutation { doDkg }`)).doDkg === true;
  },

  async dkgCancel(url: string): Promise<boolean> {
    return (await q<{ dkgCancel: boolean }>(url, `mutation { dkgCancel }`)).dkgCancel === true;
  },

  async frostParams(url: string, idAccount: number): Promise<FrostParams | null> {
    const d = await q<{ frostParams: FrostParams | null }>(url, `{ frostParams(idAccount: ${assertAccountId(idAccount)}) { id n t dkgVersion } }`);
    return d.frostParams ?? null;
  },

  /** The finished group account: named like the DKG and holding FROST params. Null while the DKG runs. */
  async findGroupAccount(url: string, name: string): Promise<{ id: number; params: FrostParams } | null> {
    for (const a of await frost.accounts(url, name)) {
      const params = await frost.frostParams(url, a.id);
      if (params) return { id: a.id, params };
    }
    return null;
  },

  // --- signing ---

  /** Unsigned transaction (hex PCZT) from the group account. Orchard/Ironwood recipients only. */
  async prepareSend(url: string, idAccount: number, pay: PaymentRequest): Promise<string> {
    const memo = pay.memo ? `, memo: ${str(assertMemo(pay.memo))}` : "";
    const d = await q<{ prepareSend: string }>(
      url,
      `{ prepareSend(idAccount: ${assertAccountId(idAccount)}, payment: { recipients: [{ address: ${str(assertUnifiedAddress(pay.address))}, amount: ${assertAmountZec(pay.amount)}${memo} }] }) }`,
    );
    return assertPczt(d.prepareSend);
  },

  async decodePczt(url: string, pczt: string): Promise<DecodedPczt> {
    const d = await q<{ decodePczt: DecodedPczt }>(url, `{ decodePczt(pczt: ${str(assertPczt(pczt))}) { fee recipients { pool value address memo } } }`);
    return d.decodePczt;
  },

  /** Joins (or, on the coordinator, opens) this instance's signing session for the PCZT. */
  async frostSign(url: string, p: { idCoordinator: number; idAccount: number; messageAccount: number; pczt: string }): Promise<boolean> {
    const d = await q<{ frostSign: boolean }>(
      url,
      `mutation { frostSign(idCoordinator: ${assertInt(p.idCoordinator, "idCoordinator", 1, 255)}, idAccount: ${assertAccountId(p.idAccount, "idAccount")}, messageAccount: ${assertAccountId(p.messageAccount, "messageAccount")}, pczt: ${str(assertPczt(p.pczt))}) }`,
    );
    if (d.frostSign !== true) throw new Error("frostSign returned false");
    return true;
  },

  async frostCancel(url: string): Promise<boolean> {
    return (await q<{ frostCancel: boolean }>(url, `mutation { frostCancel }`)).frostCancel === true;
  },

  /** Mined and mempool transactions of an account, newest data the instance has synced. */
  async txids(url: string, idAccount: number): Promise<TxSummary[]> {
    const id = assertAccountId(idAccount);
    const d = await q<{ transactionsByAccount: TxSummary[]; unconfirmedByAccount: { txid: string; value: string | number }[] }>(
      url,
      `{ transactionsByAccount(idAccount: ${id}) { txid height value } unconfirmedByAccount(idAccount: ${id}) { txid value } }`,
    );
    return [...(d.transactionsByAccount ?? []), ...(d.unconfirmedByAccount ?? []).map((u) => ({ txid: u.txid, height: null, value: u.value }))];
  },
};

// ---------- polling ----------

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Calls `check` every `intervalMs` until it returns a value, or throws after `timeoutMs`. */
export async function pollUntil<T>(
  check: (elapsedMs: number) => Promise<T | null | undefined>,
  { intervalMs, timeoutMs, what }: { intervalMs: number; timeoutMs: number; what: string },
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const elapsed = Date.now() - start;
    const value = await check(elapsed);
    if (value !== null && value !== undefined) return value;
    if (elapsed + intervalMs > timeoutMs) throw new Error(`timed out after ${Math.round(timeoutMs / 60_000)} min waiting for ${what}`);
    await sleep(intervalMs);
  }
}

export const shortErr = (e: unknown) => String((e as Error)?.message ?? e).replace(/^zkool: /, "").slice(0, 200);
