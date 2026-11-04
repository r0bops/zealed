// Shared libsodium helpers, used in the browser and in fulfill.ts.
// All binary values are encoded as unpadded URL-safe base64.
import sodium from "libsodium-wrappers";

const B64 = () => sodium.base64_variants.URLSAFE_NO_PADDING;
const BACKUP_PREFIX = "zealed-key-v1-";

export async function ready(): Promise<typeof sodium> {
  await sodium.ready;
  return sodium;
}

export const toB64 = (bytes: Uint8Array) => sodium.to_base64(bytes, B64());
export const fromB64 = (s: string) => sodium.from_base64(s, B64());

export interface KeyPair {
  publicKey: string; // base64url, 32 bytes (X25519)
  secretKey: string; // base64url, 32 bytes
  backup: string; // human-copyable seed, restores the same key pair
}

function fromSeed(seed: Uint8Array): KeyPair {
  const kp = sodium.crypto_box_seed_keypair(seed);
  return {
    publicKey: toB64(kp.publicKey),
    secretKey: toB64(kp.privateKey),
    backup: BACKUP_PREFIX + toB64(seed),
  };
}

/** New buyer key pair. The seed (backup) never leaves the browser. */
export async function generateKeyPair(): Promise<KeyPair> {
  await ready();
  return fromSeed(sodium.randombytes_buf(sodium.crypto_box_SEEDBYTES));
}

/** Restore a key pair from its backup string, or from a raw base64url seed. */
export async function keyPairFromBackup(backup: string): Promise<KeyPair> {
  await ready();
  const raw = backup.trim().startsWith(BACKUP_PREFIX)
    ? backup.trim().slice(BACKUP_PREFIX.length)
    : backup.trim();
  const seed = fromB64(raw);
  if (seed.length !== sodium.crypto_box_SEEDBYTES) throw new Error("invalid key backup");
  return fromSeed(seed);
}

/** Anonymous sealed box: only the holder of the matching secret key can open it. */
export async function seal(plaintext: string, recipientPublicKey: string): Promise<string> {
  await ready();
  const pk = fromB64(recipientPublicKey);
  if (pk.length !== sodium.crypto_box_PUBLICKEYBYTES) throw new Error("invalid public key");
  return toB64(sodium.crypto_box_seal(sodium.from_string(plaintext), pk));
}

export async function open(ciphertext: string, publicKey: string, secretKey: string): Promise<string> {
  await ready();
  const out = sodium.crypto_box_seal_open(fromB64(ciphertext), fromB64(publicKey), fromB64(secretKey));
  const text = sodium.to_string(out);
  sodium.memzero(out);
  return text;
}

/** Short, human-comparable fingerprint of a public key, e.g. "7F3A-91C2-04BE-D811". */
export async function fingerprint(publicKey: string): Promise<string> {
  await ready();
  const h = sodium.to_hex(sodium.crypto_generichash(8, fromB64(publicKey), null)).toUpperCase();
  return h.match(/.{4}/g)!.join("-");
}

/** Equality-only fingerprint of a gift card code, used to detect duplicate listings without seeing the code. */
export async function codeFingerprint(brand: string, code: string): Promise<string> {
  await ready();
  const normalized = code.replace(/[\s-]/g, "").toUpperCase();
  const input = `zealed:dup:v1:${brand.trim().toLowerCase()}:${normalized}`;
  return toB64(sodium.crypto_generichash(16, sodium.from_string(input), null));
}

/** Validate that a string is a 32-byte base64url public key. */
export async function isPublicKey(value: unknown): Promise<boolean> {
  if (typeof value !== "string") return false;
  await ready();
  try {
    return fromB64(value).length === sodium.crypto_box_PUBLICKEYBYTES;
  } catch {
    return false;
  }
}
