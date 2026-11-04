"use client";
// Browser-only bookkeeping for gift links (IndexedDB). Nothing here is sent to the server.
import { del, get, set } from "idb-keyval";

/** Giver side: the link and management token for the gift made from one reward key. */
export interface SentGift {
  giftId: string;
  giftToken: string;
  ownerToken: string;
  expiresAt: number;
}
/** Friend side: the key this browser created, its open token and, once taken, the one-time ciphertext. */
export interface ReceivedGift {
  publicKey: string;
  recipientToken: string;
  sealed?: string;
}

const sentKey = (rewardPublicKey: string) => `zealed:gift-sent:${rewardPublicKey}`;
const ownedKey = (giftId: string) => `zealed:gift-owned:${giftId}`;
const receivedKey = (giftId: string) => `zealed:gift-received:${giftId}`;

export const loadSent = (rewardPublicKey: string) => get<SentGift>(sentKey(rewardPublicKey));
export async function saveSent(rewardPublicKey: string, gift: SentGift) {
  await set(sentKey(rewardPublicKey), gift);
  await set(ownedKey(gift.giftId), true);
}
export async function forgetSent(rewardPublicKey: string, giftId: string) {
  await del(sentKey(rewardPublicKey));
  await del(ownedKey(giftId));
}
/** True when this browser made the gift, so the giver doesn't accept their own link by mistake. */
export const isOwnGift = async (giftId: string) => (await get<boolean>(ownedKey(giftId))) === true;

export const loadReceived = (giftId: string) => get<ReceivedGift>(receivedKey(giftId));
export const saveReceived = (giftId: string, gift: ReceivedGift) => set(receivedKey(giftId), gift);

export const giftLink = (giftId: string, giftToken: string) => `${window.location.origin}/gift/${giftId}#${giftToken}`;
export const telegramShareUrl = (link: string) =>
  `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("A sealed gift for you. It opens once, for your eyes only.")}`;

export async function giftStatusRequest(giftId: string, token: string) {
  const res = await fetch(`/api/gifts/${giftId}`, { cache: "no-store", headers: { authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Could not check the gift. Retrying.");
  return (await res.json()) as { state: "waiting" | "accepted" | "sealed"; recipientPublicKey: string | null; expiresAt: number };
}
