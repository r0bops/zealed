"use client";
// Browser-only key storage. One fresh key pair per order (so orders can't be linked by key);
// the seed lives in IndexedDB on this device and can be exported as a backup string.
import { get, set } from "idb-keyval";
import { generateKeyPair, keyPairFromBackup, type KeyPair } from "./sodium";

const keyId = (publicKey: string) => `zealed:key:${publicKey}`;

export async function createOrderKey(): Promise<KeyPair> {
  const kp = await generateKeyPair();
  await set(keyId(kp.publicKey), kp.backup);
  return kp;
}

export async function loadKey(publicKey: string): Promise<KeyPair | null> {
  const backup = await get<string>(keyId(publicKey));
  if (!backup) return null;
  const kp = await keyPairFromBackup(backup);
  return kp.publicKey === publicKey ? kp : null;
}

export async function importKey(backup: string): Promise<KeyPair> {
  const kp = await keyPairFromBackup(backup);
  await set(keyId(kp.publicKey), kp.backup);
  return kp;
}

export async function rememberOrder(orderId: string, publicKey: string) {
  await set(`zealed:order:${orderId}`, publicKey);
}
