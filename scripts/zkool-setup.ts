// One-time demo wallet setup against a LOCAL zkool_graphql (NU7 testnet):
//   zkool_graphql -d wallet.db -p 8000 -l https://testnet.zec.rocks:443 -C 1 --allow-unauthenticated --allow-unencrypted-database
// Creates: a merchant wallet (seed stays inside zkool's wallet.db), a WATCH-ONLY account from its
// UFVK for the payment watcher, and a payer wallet for CLI test payments. Prints the env lines.
// Never prints seeds. Keep this zkool on localhost: unauthenticated GraphQL exposes seeds.
// Run: npx tsx --env-file=.env.local scripts/zkool-setup.ts [--introspect]
import { zkoolQuery } from "../lib/zcash-zkool";

const URL = process.env.ZKOOL_URL || "http://127.0.0.1:8000/graphql";
const q = <T>(query: string) => zkoolQuery<T>(query, URL);

async function main() {
  if (process.argv.includes("--introspect")) {
    const d = await q<{ __type: { fields: { name: string; args: { name: string }[] }[] } }>(`{ __type(name: "Mutation") { fields { name args { name } } } }`);
    for (const f of d.__type.fields) console.log(`${f.name}(${f.args.map((a) => a.name).join(", ")})`);
    return;
  }
  const { currentHeight } = await q<{ currentHeight: number }>(`{ currentHeight }`);
  console.error(`zkool reachable at ${URL}, chain height ${currentHeight}`);

  const create = async (name: string, key = "", birth?: number) => {
    const birthField = birth ? `, birth: ${birth}` : "";
    const d = await q<{ createAccount: number }>(
      `mutation { createAccount(newAccount: { name: ${JSON.stringify(name)}, key: ${JSON.stringify(key)}, useInternal: true, aindex: 0${birthField} }) }`,
    );
    return d.createAccount;
  };
  const uaOf = async (id: number) => (await q<{ addressByAccount: { ua: string } }>(`{ addressByAccount(idAccount: ${id}) { ua } }`)).addressByAccount.ua;

  const merchant = await create("zealed-merchant");
  const merchantUa = await uaOf(merchant);
  const ufvk = (await q<{ unifiedFullViewingKey: string }>(`{ unifiedFullViewingKey(idAccount: ${merchant}) }`)).unifiedFullViewingKey;
  const birth = Math.max(1, currentHeight - 10);

  const watch = await create("zealed-watch", ufvk, birth);
  const watchUa = await uaOf(watch);

  const payer = await create("zealed-payer");
  const payerUa = await uaOf(payer);

  if (!ufvk.startsWith("uviewtest")) console.error("WARNING: the viewing key is not a testnet uviewtest… key");
  if (watchUa !== merchantUa) console.error("NOTE: the watch-only account reports a different UA; ZCASH_RECEIVE_UA uses the watch-only one");

  console.log(`# --- paste into .env.local ---
ZCASH_BACKEND=zkool
ZKOOL_URL=${URL}
ZKOOL_ACCOUNT_ID=${watch}
ZKOOL_PAYER_ID=${payer}
ZCASH_RECEIVE_UA=${watchUa}
ZCASH_UFVK=${ufvk}
ZCASH_BIRTH=${birth}
# merchant (seed) account id in zkool: ${merchant}`);
  console.error(`\nFund the payer with TAZ (1 TAZ/day):
  curl -X POST https://fauzec.com/api/v1/claim -H 'Content-Type: application/json' -d '{"network":"testnet","address":"${payerUa}"}'
Then restart pnpm dev, create an order, and pay it: npx tsx --env-file=.env.local scripts/zkool-pay.ts <orderId>`);
}

main().catch((e) => {
  console.error(`setup failed: ${(e as Error).message}\nTip: run with --introspect to see this zkool build's mutation signatures.`);
  process.exit(1);
});
