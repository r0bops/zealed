// ZIP-321 payment request URIs: zcash:<address>?amount=<zec>&memo=<base64url-no-pad>
import { zatToZec } from "./money";

export function base64UrlNoPad(text: string): string {
  return Buffer.from(text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeBase64UrlNoPad(b64: string): string {
  return Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function buildZip321(address: string, amountZat: bigint, memo?: string): string {
  if (!address) throw new Error("missing receiving address");
  if (amountZat <= 0n) throw new Error("amount must be positive");
  const params = [`amount=${zatToZec(amountZat)}`];
  if (memo) {
    if (Buffer.byteLength(memo, "utf8") > 512) throw new Error("memo over 512 bytes");
    params.push(`memo=${base64UrlNoPad(memo)}`);
  }
  return `zcash:${address}?${params.join("&")}`;
}

/** Memo tags: short, random, unambiguous. Prefix lets the watcher ignore unrelated memos. */
export function newMemoTag(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let tag = "";
  for (const b of bytes) tag += alphabet[b % alphabet.length];
  return `ZLD-${tag}`;
}

export function extractMemoTag(memo: string | null | undefined): string | null {
  if (!memo) return null;
  const m = /ZLD-[A-HJ-NP-Z2-9]{10}/.exec(memo);
  return m ? m[0] : null;
}
