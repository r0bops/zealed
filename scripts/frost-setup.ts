// Creates the sponsor treasury: a FROST 2-of-3 shielded account shared by the organizer, the
// co-sponsor and Zealed, by running zkool's DKG across three zkool_graphql instances.
//
// Prerequisites: three instances on localhost, each with its own wallet DB, started WITHOUT -j:
//   zkool_graphql -d frost-1.db -p 8000 -l https://testnet.zec.rocks:443 -C 1 --allow-unauthenticated --allow-unencrypted-database
//   (same with frost-2.db -p 8001 and frost-3.db -p 8002)
// Each instance needs a message account holding ~0.01 TAZ: the DKG packages travel as memos it pays for.
//
// Run: FROST_URLS=http://127.0.0.1:8000/graphql,http://127.0.0.1:8001/graphql,http://127.0.0.1:8002/graphql \
//        pnpm frost:setup [--fund-from=<account id on the first instance>] [--resume] [--cancel]
//   --fund-from  pays 0.01 TAZ (FROST_FUND_AMOUNT) from that account to every unfunded message account
//   --resume     a DKG is already running on all three: skip dkgStart and only wait for it
//   --cancel     dkgCancel on all three instances, then exit
// Env: FROST_NAME (default zealed-sponsor-treasury), FROST_MESSAGE_ACCOUNTS (existing ids, comma list),
//      FROST_TIMEOUT_MIN (default 45). Prints env lines; never prints seeds, shares or backups.
import { DEFAULT_TREASURY_NAME, addressExchangePlan, assertAccountId, assertAmountZec, assertName, frost, parseFrostUrls, parseIdList, pollUntil, shortErr, sleep } from "../lib/frost";

const N = 3;
const T = 2;
const MSG_ACCOUNT_NAME = "zealed-frost-msg";
const MIN_MESSAGE_ZAT = 200_000; // 0.002 TAZ: ~10 protocol messages at the ZIP-317 minimum fee
const flag = (name: string) => process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const flagValue = (name: string) => flag(name)?.split("=")[1];
const log = (s: string) => console.error(s);
const mmss = (ms: number) => `${String(Math.floor(ms / 60_000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const label = (i: number) => `p${i + 1}`;

async function syncWithRetry(url: string, ids: number[], tries = 6) {
  for (let k = 0; k < tries; k++) {
    if (await frost.synchronize(url, ids).catch((e) => (log(`  sync warning: ${shortErr(e)}`), false))) return true;
    await sleep(10_000);
  }
  return false;
}

async function main() {
  const urls = parseFrostUrls(process.env.FROST_URLS, N);
  const name = assertName(process.env.FROST_NAME || DEFAULT_TREASURY_NAME, "FROST_NAME");
  const timeoutMs = Number(process.env.FROST_TIMEOUT_MIN || 45) * 60_000;

  if (flag("cancel")) {
    for (const [i, url] of urls.entries()) log(`${label(i)} dkgCancel: ${await frost.dkgCancel(url).catch(shortErr)}`);
    return;
  }

  // 0. Reachability.
  const heights = await Promise.all(
    urls.map((url, i) =>
      frost.currentHeight(url).catch((e) => {
        throw new Error(`${label(i)} (${url}) is not reachable: ${shortErr(e)}. Start that zkool_graphql instance first.`);
      }),
    ),
  );
  urls.forEach((url, i) => log(`${label(i)} ${url} at height ${heights[i]}`));
  const birth = Math.max(1, Math.min(...heights) - 10);

  // 1. Already done? Then just report.
  const existing = await Promise.all(urls.map((url) => frost.findGroupAccount(url, name)));
  if (existing.every(Boolean)) {
    log(`The group account "${name}" already exists on every instance.`);
    return report(urls, name, existing.map((g) => g!.id), await messageAccounts(urls, birth), birth);
  }
  if (existing.some(Boolean) && !flag("resume")) {
    throw new Error(`"${name}" exists on ${existing.map((g, i) => (g ? label(i) : "")).filter(Boolean).join(", ")} only. Wait with --resume, or pick a new FROST_NAME.`);
  }

  // 2. Message accounts: existing ids, or one per instance found/created by name.
  const msg = await messageAccounts(urls, birth);
  const balances = await fundedBalances(urls, msg);
  const short = balances.map((b, i) => (b < MIN_MESSAGE_ZAT ? i : -1)).filter((i) => i >= 0);
  if (short.length) {
    const uas = await Promise.all(short.map((i) => frost.address(urls[i], msg[i])));
    const fundFrom = flagValue("fund-from");
    if (!fundFrom) {
      log(`\nThese message accounts need TAZ (at least ${MIN_MESSAGE_ZAT / 1e8}, 0.01 recommended):`);
      short.forEach((i, k) => log(`  ${label(i)} account ${msg[i]}: ${uas[k].ua}`));
      log(`Fund them from the faucet (curl -X POST https://fauzec.com/api/v1/claim -H 'Content-Type: application/json' -d '{"network":"testnet","address":"<ua>"}')`);
      log(`or rerun with --fund-from=<funded account id on ${label(0)}> (e.g. the payer account), then run this again.`);
      process.exit(2);
    }
    const payer = assertAccountId(fundFrom, "--fund-from");
    const amount = assertAmountZec(process.env.FROST_FUND_AMOUNT || "0.01");
    log(`\nFunding ${short.length} message account(s) with ${amount} TAZ each from ${label(0)} account ${payer}…`);
    await syncWithRetry(urls[0], [payer]);
    const txid = await frost.pay(urls[0], payer, uas.map((a) => ({ address: a.ua ?? "", amount, memo: "zealed frost message account" })));
    log(`  funding txid ${txid}`);
    await pollUntil(
      async (elapsed) => {
        const now = await fundedBalances(urls, msg, short);
        log(`  [${mmss(elapsed)}] ${short.map((i, k) => `${label(i)} ${(now[k] / 1e8).toFixed(4)} TAZ`).join(" | ")}`);
        return now.every((b) => b >= MIN_MESSAGE_ZAT) ? true : null;
      },
      { intervalMs: 20_000, timeoutMs: 20 * 60_000, what: "the funding transaction to confirm" },
    );
  }

  // 3. Start the DKG on every instance and exchange the mailbox addresses.
  if (!flag("resume")) {
    log(`\nStarting a ${T}-of-${N} DKG named "${name}"…`);
    const addresses: string[] = [];
    for (const [i, url] of urls.entries()) {
      try {
        addresses.push(await frost.dkgStart(url, { name, threshold: T, participants: N, messageAccount: msg[i], idParticipant: i + 1 }));
      } catch (e) {
        const m = shortErr(e);
        throw new Error(/in progress/i.test(m) ? `${label(i)}: ${m}. Rerun with --resume to wait for it, or --cancel to start over.` : `${label(i)} dkgStart failed: ${m}`);
      }
      log(`  ${label(i)} is participant ${i + 1}, message account ${msg[i]}`);
    }
    for (const { instance, idParticipant, address } of addressExchangePlan(addresses)) {
      await frost.dkgSetAddress(urls[instance], idParticipant, address);
    }
    log(`  mailbox addresses exchanged (${N * (N - 1)} dkgSetAddress calls)`);
  }

  // 4. Wait. Every instance's driver publishes rounds 0, 1, 2 as mined memos and advances on new blocks;
  //    `doDkg` only runs a pass now and surfaces its error.
  log(`\nRunning the DKG: 3 rounds, each needs a mined memo from all ${N} participants (~25 s blocks; expect 3-15 min).`);
  const lastWarn: string[] = [];
  const sentBefore = await Promise.all(urls.map((url, i) => outgoingCount(url, msg[i])));
  const groups = await pollUntil(
    async (elapsed) => {
      const found = await Promise.all(urls.map((url) => frost.findGroupAccount(url, name).catch(() => null)));
      if (found.every(Boolean)) return found.map((g) => g!.id);
      const status = await Promise.all(
        urls.map(async (url, i) => {
          if (found[i]) return `${label(i)} done (#${found[i]!.id})`;
          const err = await frost.step(url).then(() => "", shortErr);
          if (err && err !== lastWarn[i]) log(`  ${label(i)} pass warning: ${err}`);
          lastWarn[i] = err;
          const sent = (await outgoingCount(url, msg[i]).catch(() => sentBefore[i])) - sentBefore[i];
          return `${label(i)} ${sent} msg${sent === 1 ? "" : "s"} sent`;
        }),
      );
      const h = await frost.currentHeight(urls[0]).catch(() => 0);
      log(`  [${mmss(elapsed)}] height ${h} | ${status.join(" | ")}`);
      return null;
    },
    { intervalMs: 20_000, timeoutMs, what: "the DKG to finish (rerun with --resume to keep waiting)" },
  );
  return report(urls, name, groups, msg, birth);
}

/** Message account per instance: FROST_MESSAGE_ACCOUNTS, else an account named zealed-frost-msg, else a new one. */
async function messageAccounts(urls: string[], birth: number): Promise<number[]> {
  if (process.env.FROST_MESSAGE_ACCOUNTS) return parseIdList(process.env.FROST_MESSAGE_ACCOUNTS, urls.length, "FROST_MESSAGE_ACCOUNTS");
  const ids: number[] = [];
  for (const [i, url] of urls.entries()) {
    const found = (await frost.accounts(url, MSG_ACCOUNT_NAME))[0];
    if (found) ids.push(found.id);
    else {
      ids.push(await frost.createAccount(url, MSG_ACCOUNT_NAME, birth));
      log(`  ${label(i)} created message account ${ids[i]} (seed stays in that wallet)`);
    }
  }
  return ids;
}

async function fundedBalances(urls: string[], msg: number[], only = urls.map((_, i) => i)): Promise<number[]> {
  return Promise.all(
    only.map(async (i) => {
      await syncWithRetry(urls[i], [msg[i]], 3);
      return frost.balanceZat(urls[i], msg[i]);
    }),
  );
}

async function outgoingCount(url: string, account: number): Promise<number> {
  return new Set((await frost.txids(url, account)).filter((t) => Number(t.value) < 0).map((t) => t.txid)).size;
}

async function report(urls: string[], name: string, groups: number[], msg: number[], birth: number) {
  const info = await Promise.all(
    urls.map(async (url, i) => ({
      params: await frost.frostParams(url, groups[i]),
      addr: await frost.address(url, groups[i]),
      ufvk: await frost.ufvk(url, groups[i]),
    })),
  );
  const shielded = info.map((x) => x.addr.ironwood ?? x.addr.orchard);
  if (new Set(shielded).size !== 1 || new Set(info.map((x) => x.ufvk)).size !== 1) {
    throw new Error("the instances disagree on the group address or viewing key; do not fund it");
  }
  info.forEach((x, i) => {
    if (x.params?.id !== i + 1 || x.params.t !== T || x.params.n !== N) throw new Error(`${label(i)} group account ${groups[i]} has unexpected FROST params ${JSON.stringify(x.params)}`);
  });
  await syncWithRetry(urls[0], [groups[0]], 2); // best effort: brings the group account to the tip once
  log(`\nDKG complete: "${name}", ${T}-of-${N}. Every instance holds one share; no instance can spend alone.`);
  console.log(`# --- FROST sponsor treasury (${T}-of-${N}); paste into .env.local ---
FROST_URLS=${urls.join(",")}
FROST_ACCOUNT_IDS=${groups.join(",")}
FROST_MESSAGE_ACCOUNTS=${msg.join(",")}
FROST_COORDINATOR=1
FROST_SIGNER=2
FROST_TREASURY_UA=${info[0].addr.ua ?? ""}
FROST_TREASURY_UFVK=${info[0].ufvk}
FROST_TREASURY_BIRTH=${birth}`);
  log(`\nFund the treasury by paying FROST_TREASURY_UA. Spend from it with: pnpm frost:pay <utest1…> <amountZec> <memo>`);
}

main().catch((e) => {
  console.error(`frost setup failed: ${shortErr(e)}`);
  process.exit(1);
});
