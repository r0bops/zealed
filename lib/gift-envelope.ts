// What a gift link carries: the redeemable fields of a delivered reward, re-sealed in the giver's browser to the
// friend's public key. Runs only in browsers (and tests); the server never sees the plaintext or the label.
import { open, seal } from "./sodium";

export interface GiftContent {
  kind: "giftcard" | "esim" | "custom";
  code?: string;
  pin?: string;
  link?: string;
  lpa?: string;
  instructions?: string;
}
export interface GiftEnvelope {
  v: 1;
  label?: string;
  content: GiftContent;
}
interface KeyPairLike {
  publicKey: string;
  secretKey: string;
}

const FIELDS = ["code", "pin", "link", "lpa", "instructions"] as const;

/** Picks the redeemable fields out of a decrypted reward. Throws when there's nothing to pass on, as for a top-up. */
export function giftableContent(json: string): GiftContent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("This reward can't be read.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("This reward can't be read.");
  const source = parsed as Record<string, unknown>;
  const content: GiftContent = { kind: source.kind === "giftcard" || source.kind === "esim" ? source.kind : "custom" };
  for (const field of FIELDS) {
    const value = source[field];
    if (typeof value === "string" && value.trim()) content[field] = value.slice(0, 6000);
  }
  if (!FIELDS.some((field) => content[field])) throw new Error("There's nothing in this reward to pass on.");
  return content;
}

/** Giver side: open the reward with the giver's own key and seal it to the friend's key, all in memory. */
export async function resealForFriend(sealedPayload: string, giver: KeyPairLike, friendPublicKey: string, label?: string): Promise<string> {
  const content = giftableContent(await open(sealedPayload, giver.publicKey, giver.secretKey));
  const envelope: GiftEnvelope = { v: 1, content, ...(label?.trim() ? { label: label.trim().slice(0, 120) } : {}) };
  return seal(JSON.stringify(envelope), friendPublicKey);
}

/** Friend side: open the one-time blob with the key this browser created when it accepted the link. */
export async function openGiftEnvelope(sealed: string, friend: KeyPairLike): Promise<GiftEnvelope> {
  const parsed = JSON.parse(await open(sealed, friend.publicKey, friend.secretKey)) as Partial<GiftEnvelope> | null;
  if (!parsed || parsed.v !== 1 || !parsed.content || typeof parsed.content !== "object") throw new Error("This gift can't be read.");
  return {
    v: 1,
    ...(typeof parsed.label === "string" && parsed.label ? { label: parsed.label.slice(0, 120) } : {}),
    content: giftableContent(JSON.stringify(parsed.content)),
  };
}

/** Only plain web links are rendered as links. */
export const isWebLink = (value: string) => /^https?:\/\/[^\s]+$/i.test(value);
