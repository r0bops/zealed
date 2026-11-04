// Prints a fresh FULFILL_SECRET_KEY. Put it in .env.local; never commit it.
import { generateKeyPair } from "../lib/sodium";

async function main() {
  const kp = await generateKeyPair();
  console.log(`FULFILL_SECRET_KEY=${kp.backup}`);
  console.error(`# public key: ${kp.publicKey}`);
}

main();
