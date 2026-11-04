// Pays from the FROST 2-of-3 sponsor treasury: the coordinator builds the unsigned transaction
// (PCZT), the coordinator and ONE other participant sign it, and the coordinator broadcasts it.
//
// Run: pnpm frost:pay <utest1…> <amountZec> <memo…>
//  or: pnpm frost:pay 'zcash:utest1…?amount=…&memo=<base64url>'
// Flags: --coordinator=<1-3> --signer=<1-3> (default FROST_COORDINATOR=1, FROST_SIGNER=2)
//        --cancel  frostCancel on the coordinator and signer instances (ends a stuck session), then exit
// Env (printed by pnpm frost:setup): FROST_URLS, FROST_ACCOUNT_IDS, FROST_MESSAGE_ACCOUNTS,
//        FROST_TIMEOUT_MIN (default 30).
//
// Who acts when: both instances must stay running until the txid prints. The coordinator opens the
// session and the signer joins it straight away (this script does both). Their drivers then trade
// four rounds of memos: coordinator address, commitments, signing package, signature shares (one
// mined block each), and the coordinator aggregates and broadcasts. The third participant must NOT
// sign this PCZT: more than t=2 commitments aborts the session.
import { assertParticipantId, frost, parseFrostUrls, parseIdList, parsePaymentArgs, pollUntil, shortErr, sleep, type FrostParams } from "../lib/frost";
import { zecToZatoshi } from "../lib/zcash-zkool";

const N = 3;
const POOL = ["transparent", "sapling", "orchard", "ironwood"];
const MIN_MESSAGE_ZAT = 100_000;
const flagValue = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const log = (s: string) => console.error(s);
const mmss = (ms: number) => `${String(Math.floor(ms / 60_000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

async function syncWithRetry(url: string, ids: number[], tries = 6) {
  for (let k = 0; k < tries; k++) {
    if (await frost.synchronize(url, ids).catch((e) => (log(`  sync warning: ${shortErr(e)}`), false))) return true;
    await sleep(10_000);
  }
  log("  could not sync (the protocol driver may hold the sync); continuing with the last synced state");
  return false;
}

async function main() {
  const urls = parseFrostUrls(process.env.FROST_URLS, N);
  const groups = parseIdList(process.env.FROST_ACCOUNT_IDS, N, "FROST_ACCOUNT_IDS");
  const msg = parseIdList(process.env.FROST_MESSAGE_ACCOUNTS, N, "FROST_MESSAGE_ACCOUNTS");
  const coordinator = assertParticipantId(flagValue("coordinator") ?? process.env.FROST_COORDINATOR ?? 1, N, "coordinator");
  const signer = assertParticipantId(flagValue("signer") ?? process.env.FROST_SIGNER ?? 2, N, "signer");
  if (coordinator === signer) throw new Error("the coordinator and the signer must be two different participants");
  const timeoutMs = Number(process.env.FROST_TIMEOUT_MIN || 30) * 60_000;
  const c = coordinator - 1;
  const s = signer - 1;
  const who = (i: number) => `participant ${i + 1} (${urls[i]})`;

  if (process.argv.includes("--cancel")) {
    for (const i of [c, s]) log(`${who(i)} frostCancel: ${await frost.frostCancel(urls[i]).catch(shortErr)}`);
    return;
  }
  const payment = parsePaymentArgs(process.argv.slice(2).filter((a) => !a.startsWith("--")));

  // 1. Both instances reachable, and each account is its participant's share of a 2-of-3 group.
  for (const i of [c, s]) {
    let params: FrostParams | null;
    try {
      params = await frost.frostParams(urls[i], groups[i]);
    } catch (e) {
      throw new Error(`${who(i)} is not reachable or refuses FROST (started with -j?): ${shortErr(e)}`);
    }
    if (!params) throw new Error(`account ${groups[i]} on ${who(i)} is not a FROST group account (check FROST_ACCOUNT_IDS)`);
    if (params.id !== i + 1) throw new Error(`account ${groups[i]} on ${urls[i]} is participant ${params.id}, not ${i + 1}: FROST_URLS must be in participant order`);
    if (params.t !== 2 || params.n !== N) throw new Error(`account ${groups[i]} on ${urls[i]} is ${params.t}-of-${params.n}, expected 2-of-${N}`);
  }
  log(`Coordinator: ${who(c)}, builds, opens the session, aggregates and broadcasts.`);
  log(`Signer:      ${who(s)}, joins with the same PCZT.`);
  log(`Participant ${[1, 2, 3].find((p) => p !== coordinator && p !== signer)} does nothing for this payment.\n`);

  // 2. Funds: the treasury covers the payment, and both message accounts can pay for memos.
  await syncWithRetry(urls[c], [groups[c]]);
  const treasury = await frost.balanceZat(urls[c], groups[c]);
  if (treasury < zecToZatoshi(payment.amount)) throw new Error(`the treasury holds ${(treasury / 1e8).toFixed(8)} TAZ, less than ${payment.amount}`);
  for (const i of [c, s]) {
    await syncWithRetry(urls[i], [msg[i]], 2);
    const b = await frost.balanceZat(urls[i], msg[i]);
    if (b < MIN_MESSAGE_ZAT) throw new Error(`message account ${msg[i]} on ${who(i)} holds ${(b / 1e8).toFixed(8)} TAZ; fund it with ~0.01 TAZ first`);
  }

  // 3. The unsigned transaction, built on the coordinator's group account.
  const pczt = await frost.prepareSend(urls[c], groups[c], payment);
  const plan = await frost.decodePczt(urls[c], pczt);
  for (const r of plan.recipients) log(`  output ${r.value} TAZ -> ${r.address.slice(0, 24)}… (${POOL[r.pool] ?? r.pool})${r.memo ? ` memo "${r.memo.slice(0, 40)}"` : ""}`);
  log(`  fee ${plan.fee} TAZ`);
  if (plan.recipients.some((r) => r.pool === 0 || r.pool === 1)) throw new Error("a FROST group signs Orchard/Ironwood only; pay a UA with an Ironwood receiver");

  // 4. Open the session on the coordinator, then join on the signer. Undo the first if the second fails.
  const seen = new Set((await frost.txids(urls[c], groups[c])).map((t) => t.txid));
  try {
    await frost.frostSign(urls[c], { idCoordinator: coordinator, idAccount: groups[c], messageAccount: msg[c], pczt });
  } catch (e) {
    const m = shortErr(e);
    throw new Error(/in progress/i.test(m) ? `${who(c)}: ${m}. Wait for it, or end it with --cancel.` : `coordinator frostSign failed: ${m}`);
  }
  log(`Session opened on ${who(c)}.`);
  try {
    await frost.frostSign(urls[s], { idCoordinator: coordinator, idAccount: groups[s], messageAccount: msg[s], pczt });
  } catch (e) {
    await frost.frostCancel(urls[c]).catch(() => false);
    throw new Error(`signer frostSign failed (${shortErr(e)}); cancelled the coordinator's session`);
  }
  log(`${who(s)} joined. Signing over memos: ~4 mined rounds at ~25 s blocks, expect 2-10 min.\n`);

  // 5. Wait for the coordinator to broadcast: a new transaction on the group account.
  const lastWarn: Record<number, string> = {};
  const txid = await pollUntil(
    async (elapsed) => {
      for (const i of [c, s]) {
        const err = await frost.step(urls[i]).then(() => "", shortErr);
        if (/Signing aborted/i.test(err)) throw new Error(`${who(i)}: ${err}`);
        if (err && err !== lastWarn[i]) log(`  ${who(i)} pass warning: ${err}`);
        lastWarn[i] = err;
      }
      await frost.synchronize(urls[c], [groups[c]]).catch(() => false);
      const fresh = (await frost.txids(urls[c], groups[c])).find((t) => !seen.has(t.txid));
      const h = await frost.currentHeight(urls[c]).catch(() => 0);
      log(`  [${mmss(elapsed)}] height ${h}${fresh ? " | broadcast seen" : " | signing…"}`);
      return fresh?.txid ?? null;
    },
    { intervalMs: 15_000, timeoutMs, what: "the coordinator to broadcast (the session keeps running; rerunning would need --cancel first)" },
  );
  console.log(`txid ${txid}\nhttps://zexplorer.app/testnet/tx/${txid}`);
}

main().catch((e) => {
  console.error(`frost pay failed: ${shortErr(e)}`);
  process.exit(1);
});
