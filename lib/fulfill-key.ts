// The fulfillment key pair: browsers seal phone numbers to its public key; only fulfill.ts opens them.
import { keyPairFromBackup, type KeyPair } from "./sodium";

let cached: Promise<KeyPair> | null = null;

export function fulfillKeyPair(): Promise<KeyPair> {
  const seed = process.env.FULFILL_SECRET_KEY;
  if (!seed) throw new Error("FULFILL_SECRET_KEY is not set (run `pnpm keygen`)");
  if (!cached) cached = keyPairFromBackup(seed);
  return cached;
}

export async function fulfillPublicKey(): Promise<string> {
  return (await fulfillKeyPair()).publicKey;
}
